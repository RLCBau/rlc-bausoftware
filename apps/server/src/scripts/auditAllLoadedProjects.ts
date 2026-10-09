import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { analyzeRlcProjectContext } from "../kalkulation/autonomous/projectContextAnalyzer";
import { calculateTiefbauFamilyCatalog } from "../kalkulation/autonomous/tiefbauFamilyCatalog";

type AuditRow = {
  projectId:string; projectCode:string; pos:string; text:string; unit:string; qty:number;
  ep:number; gp:number; family:string; status:string; risk:string; x84:number; devPct:number|null;
};

function n(v:any){ const x=Number(v); return Number.isFinite(x)?x:0; }
function median(xs:number[]){
  const a=xs.filter(x=>x>0).sort((a,b)=>a-b);
  if(!a.length) return 0;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function pctDev(a:number,b:number){
  if(!(a>0)||!(b>0)) return null;
  return Math.round(((a-b)/b)*10000)/100;
}
function clean(s:any){ return String(s??"").replace(/\s+/g," ").trim(); }

async function main(){
  const projects=await prisma.project.findMany({
    orderBy:{code:"asc"},
    include:{lvSets:{orderBy:{version:"desc"},take:1,include:{positions:true}}}
  });
  const audit:AuditRow[]=[]; const projectStats:any[]=[];
  let done=0;
  for(const p of projects){
    const h=p.lvSets[0];
    if(!h) continue;
    const rows=h.positions.map(x=>({
      id:x.id,posNr:x.position,kurztext:x.kurztext,langtext:x.langtext||"",
      einheit:x.einheit,menge:n(x.menge)
    }));
    const ctx=analyzeRlcProjectContext(rows as any[],p.code);
    let zero=0,review=0,high=0,total=0;
    for(const r of rows){
      const res:any=calculateTiefbauFamilyCatalog(r as any,ctx,rows as any[]);
      const ep=n(res?.unitPrice), gp=ep*n(r.menge), x84=n((h.positions.find(x=>x.id===r.id) as any)?.x84UnitPrice);
      const family=clean(res?.trade||"UNRESOLVED");
      const status=clean(res?.calculationStatus||"unresolved");
      const risk=clean(res?.riskLevel||"high");
      if(!(ep>0)) zero++;
      if(status==="needs_review" || family.includes("Technische Klärung")) review++;
      if(risk==="high") high++;
      total+=gp;
      audit.push({
        projectId:p.id,projectCode:p.code,pos:r.posNr||"",text:clean(r.kurztext),unit:r.einheit||"",
        qty:n(r.menge),ep,gp,family,status,risk,x84,devPct:pctDev(ep,x84)
      });
    }
    projectStats.push({code:p.code,name:p.name,positions:rows.length,total,zero,review,high});
    done++;
    if(done%25===0) console.log("PROGRESS",done,"/",projects.length,"positions",audit.length);
  }

  const byFamily=new Map<string,AuditRow[]>();
  for(const r of audit){ const k=r.family+"|"+r.unit; if(!byFamily.has(k))byFamily.set(k,[]); byFamily.get(k)!.push(r); }
  const families=[...byFamily.entries()].map(([key,rows])=>{
    const eps=rows.map(r=>r.ep).filter(x=>x>0);
    const med=median(eps), min=eps.length?Math.min(...eps):0, max=eps.length?Math.max(...eps):0;
    const projects=new Set(rows.map(r=>r.projectId)).size;
    const review=rows.filter(r=>r.status==="needs_review"||r.family.includes("Technische Klärung")).length;
    const high=rows.filter(r=>r.risk==="high").length;
    return {key,family:rows[0].family,unit:rows[0].unit,rows:rows.length,projects,medianEp:med,minEp:min,maxEp:max,
      spread:med>0?Math.round((max/med)*100)/100:0,review,high,total:rows.reduce((s,r)=>s+r.gp,0)};
  }).sort((a,b)=>b.total-a.total);

  const unresolved=audit.filter(r=>!(r.ep>0)||r.family==="UNRESOLVED");
  const reviewRows=audit.filter(r=>r.status==="needs_review"||r.family.includes("Technische Klärung"));
  const x84Outliers=audit.filter(r=>r.x84>0 && r.ep>0 && Math.abs(r.devPct||0)>=40)
    .sort((a,b)=>Math.abs(b.devPct||0)-Math.abs(a.devPct||0));
  const familySpread=families.filter(f=>f.rows>=5 && f.spread>=3).sort((a,b)=>b.spread-a.spread);
  const projectProblems=projectStats.filter(p=>p.zero||p.review||p.high)
    .sort((a,b)=>(b.zero+b.review+b.high)-(a.zero+a.review+a.high));

  const clusterMap=new Map<string,{count:number;projects:Set<string>;family:string;unit:string;text:string}>();
  for(const r of reviewRows){
    const normalized=r.text.toLowerCase().replace(/\d+(?:[.,]\d+)?/g,"#").replace(/[^a-zäöüß#]+/g," ").replace(/\s+/g," ").trim();
    const key=[r.family,r.unit,normalized].join("|");
    let c=clusterMap.get(key);
    if(!c){c={count:0,projects:new Set(),family:r.family,unit:r.unit,text:r.text};clusterMap.set(key,c);}
    c.count++; c.projects.add(r.projectCode);
  }
  const priorityClusters=[...clusterMap.values()]
    .map(c=>({count:c.count,projects:c.projects.size,family:c.family,unit:c.unit,text:c.text}))
    .sort((a,b)=>b.count-a.count);

  const summary={
    generatedAt:new Date().toISOString(),projects:projectStats.length,positions:audit.length,
    totalNet:audit.reduce((s,r)=>s+r.gp,0),unresolved:unresolved.length,review:reviewRows.length,
    high:audit.filter(r=>r.risk==="high").length,families:families.length,
    projectsWithProblems:projectProblems.length,x84BenchmarkRows:audit.filter(r=>r.x84>0).length,
    x84Outliers40:x84Outliers.length,familySpreadCandidates:familySpread.length
  };
  const outDir=path.resolve(process.cwd(),"data","global-audit");
  fs.mkdirSync(outDir,{recursive:true});
  fs.writeFileSync(path.join(outDir,"summary.json"),JSON.stringify(summary,null,2));
  fs.writeFileSync(path.join(outDir,"projects.json"),JSON.stringify(projectStats,null,2));
  fs.writeFileSync(path.join(outDir,"families.json"),JSON.stringify(families,null,2));
  fs.writeFileSync(path.join(outDir,"review-rows.json"),JSON.stringify(reviewRows,null,2));
  fs.writeFileSync(path.join(outDir,"x84-outliers.json"),JSON.stringify(x84Outliers.slice(0,5000),null,2));
  fs.writeFileSync(path.join(outDir,"family-spread.json"),JSON.stringify(familySpread,null,2));
  fs.writeFileSync(path.join(outDir,"project-problems.json"),JSON.stringify(projectProblems,null,2));
  fs.writeFileSync(path.join(outDir,"priority-clusters.json"),JSON.stringify(priorityClusters,null,2));
  console.log("GLOBAL_AUDIT_SUMMARY",JSON.stringify(summary));
  console.log("TOP_PROBLEM_PROJECTS",JSON.stringify(projectProblems.slice(0,20)));
  console.log("TOP_REVIEW_FAMILIES",JSON.stringify(families.filter(f=>f.review>0).sort((a,b)=>b.review-a.review).slice(0,25)));
  console.log("TOP_SPREAD",JSON.stringify(familySpread.slice(0,25)));
  console.log("OUTPUT",outDir);
}

main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await prisma.$disconnect()});
