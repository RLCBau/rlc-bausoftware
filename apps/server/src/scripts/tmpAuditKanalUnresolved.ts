import { prisma } from "../lib/prisma";
import { analyzeRlcProjectContext } from "../kalkulation/autonomous/projectContextAnalyzer";
import { calculateTiefbauFamilyCatalog } from "../kalkulation/autonomous/tiefbauFamilyCatalog";

async function main(){
  const ps=await prisma.project.findMany({include:{lvSets:{orderBy:{version:"desc"},take:1,include:{positions:true}}}});
  const m=new Map<string,{n:number;p:Set<string>;u:string;t:string}>();
  let total=0;
  for(const p of ps){
    const rows=(p.lvSets[0]?.positions||[]).map(x=>({id:x.id,posNr:x.position,kurztext:x.kurztext,langtext:x.langtext||"",einheit:x.einheit,menge:Number(x.menge)}));
    if(!rows.length) continue;
    const ctx=analyzeRlcProjectContext(rows as any[],p.code);
    for(const row of rows){
      const x:any=calculateTiefbauFamilyCatalog(row as any,ctx,rows as any[]);
      if(x?.trade!=="Kanalbau/Technische Klärung") continue;
      total++;
      const norm=String(row.kurztext||"").toLowerCase().replace(/\d+(?:[.,]\d+)?/g,"#").replace(/[^a-zäöüß#]+/g," ").replace(/\s+/g," ").trim();
      const k=(row.einheit||"")+"|"+norm;
      let v=m.get(k);
      if(!v){v={n:0,p:new Set<string>(),u:row.einheit||"",t:row.kurztext||""};m.set(k,v);}
      v.n++;v.p.add(p.code);
    }
  }
  const out=[...m.values()].map(v=>({n:v.n,p:v.p.size,u:v.u,t:v.t})).sort((a,b)=>b.n-a.n);
  console.log("TOTAL",total,"CLUSTERS",out.length);
  out.slice(0,120).forEach(x=>console.log([x.n,x.p,x.u,x.t].join(" | ")));
}
main().finally(async()=>{await prisma.$disconnect()});