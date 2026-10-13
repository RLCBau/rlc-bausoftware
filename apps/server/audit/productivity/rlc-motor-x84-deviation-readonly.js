const {PrismaClient}=require('@prisma/client');
const {analyzeRlcProjectContext}=require('../../src/kalkulation/autonomous/projectContextAnalyzer');
const {calculateRlcMotorWithContext}=require('../../src/kalkulation/rlcMotor');
const {diagnoseRlcAsphaltMarketEvidence,diagnoseRlcAggregateMarketEvidence}=require('../../src/kalkulation/autonomous/rlcMarketEvidence2026');
const {diagnoseRlcEconomicEvidence}=require('../../src/kalkulation/autonomous/rlcEconomicEvidenceGate');
(async()=>{
const p=new PrismaClient();const o={x84Positive:0,comparable:0,over10:0,within10:0,motorZero:0,exceptions:0,over10Above:0,over10Below:0,examples:[],bands:{"0-10":0,">10-15":0,">15-20":0,">20":0},byTrade:{},extremeAbove100:0,extremeBelow90:0,provenance:{allLinesTraceable:0,hasUnverifiedLump:0,hasRecipeAssumption:0,noCostLines:0,over20WithLump:0,exampleUnverified:[],byFamily:{}},aggregateEvidence:{matched:0,tonUnit:0,requiresScopeValidation:0,byMaterial:{}},asphaltEvidence:{exactMaterialGrade:0,tonUnit:0,requiresScopeValidation:0,nonComparable:0,byGrade:{}}};let cursor;
try{while(true){
const hs=await p.lVHeader.findMany({take:10,...(cursor?{skip:1,cursor:{id:cursor}}:{}),orderBy:{id:'asc'},select:{id:true,title:true,positions:{select:{position:true,kurztext:true,langtext:true,einheit:true,menge:true,x84UnitPrice:true}}}});
if(!hs.length)break;cursor=hs[hs.length-1].id;
for(const h of hs){
 const rows=h.positions.map(v=>({posNr:v.position,kurztext:v.kurztext,langtext:v.langtext||'',einheit:v.einheit,menge:Number(v.menge)}));
 if(!h.positions.some(z=>Number(z.x84UnitPrice)>0))continue;
 const ctx=analyzeRlcProjectContext(rows,h.title);
 for(let i=0;i<rows.length;i++){const x84=Number(h.positions[i].x84UnitPrice);if(!(x84>0))continue;o.x84Positive++;
 try{const r=calculateRlcMotorWithContext(rows[i],ctx,rows);if(!r||!(r.unitPrice>0)){o.motorZero++;continue;}
 o.comparable++;const deviation=(r.unitPrice-x84)/x84*100;
 const costLines=Array.isArray(r.costLines)?r.costLines:[];
 const economic=diagnoseRlcEconomicEvidence(costLines);
 const unverified=costLines.filter(z=>z.consumption?.status==="unverified_lump_rate" || !z.consumption || !Number.isFinite(z.consumption.resourceQtyPerGaebUnit) || !Number.isFinite(z.consumption.resourceRateEUR));
 if((economic.unresolvedComponents>0)!==(unverified.length>0))throw new Error("evidence gate/audit mismatch");
 const assumed=costLines.some(z=>z.consumption?.status==="recipe_assumption");
 if(!costLines.length)o.provenance.noCostLines++;
 if(unverified.length)o.provenance.hasUnverifiedLump++;
 else if(costLines.length)o.provenance.allLinesTraceable++;
 if(assumed)o.provenance.hasRecipeAssumption++;
 if(Math.abs(deviation)>20 && unverified.length){
   o.provenance.over20WithLump++;
   if(o.provenance.exampleUnverified.length<20)o.provenance.exampleUnverified.push({
     pos:rows[i].posNr,short:rows[i].kurztext,unit:rows[i].einheit,trade:r.trade,
     motor:r.unitPrice,x84,deviationPct:+deviation.toFixed(1),
     unverified:unverified.slice(0,3).map(z=>({name:z.name,ep:z.unitPrice}))
   });
 }
 const fam=String(r.trade||"UNKNOWN").split("/")[0];
 const family=o.provenance.byFamily[fam]||(o.provenance.byFamily[fam]={count:0,withLump:0,over20:0,over20WithLump:0});
 family.count++;if(unverified.length)family.withLump++;
 if(Math.abs(deviation)>20){family.over20++;if(unverified.length)family.over20WithLump++;}

 const aggregate=diagnoseRlcAggregateMarketEvidence(rows[i]);
 if(aggregate.material){
  o.aggregateEvidence.matched++;
  if(aggregate.unitCompatible)o.aggregateEvidence.tonUnit++;
  if(!aggregate.contractScopeComparable)o.aggregateEvidence.requiresScopeValidation++;
  o.aggregateEvidence.byMaterial[aggregate.material]=(o.aggregateEvidence.byMaterial[aggregate.material]||0)+1;
 }

 if(/asphalt|\bAC\s*\d{1,2}\s*[TDB]/i.test(rows[i].kurztext+' '+rows[i].langtext)){
  const ev=diagnoseRlcAsphaltMarketEvidence(rows[i]);
  if(ev.material){
   o.asphaltEvidence.exactMaterialGrade++;
   if(ev.unitCompatible)o.asphaltEvidence.tonUnit++;
   o.asphaltEvidence.byGrade[ev.material]=(o.asphaltEvidence.byGrade[ev.material]||0)+1;
  }else o.asphaltEvidence.nonComparable++;
  if(!ev.contractScopeComparable)o.asphaltEvidence.requiresScopeValidation++;
 }

 const absolute=Math.abs(deviation),band=absolute<=10?"0-10":absolute<=15?">10-15":absolute<=20?">15-20":">20";
 o.bands[band]++;
 const trade=String(r.trade||"UNSPECIFIED").split("/")[0];
 const entry=o.byTrade[trade]||(o.byTrade[trade]={comparable:0,bands:{"0-10":0,">10-15":0,">15-20":0,">20":0}});
 entry.comparable++;entry.bands[band]++;
 if(deviation>100)o.extremeAbove100++;
 if(deviation< -90)o.extremeBelow90++;
 if(Math.abs(deviation)>10+1e-9){o.over10++;if(deviation>0)o.over10Above++;else o.over10Below++;
 if(o.examples.length<12)o.examples.push({pos:rows[i].posNr,motor:r.unitPrice,x84,deviationPct:+deviation.toFixed(2),trade:r.trade});}
 else o.within10++;
 }catch(e){o.exceptions++;}
 }
}
}}finally{await p.$disconnect();}
const fs=require('fs');fs.writeFileSync('/tmp/rlc-x84-bands-20261012.json',JSON.stringify(o,null,2));console.log('X84_COMPARE',JSON.stringify({...o,byTrade:Object.entries(o.byTrade).sort((a,b)=>b[1].comparable-a[1].comparable).slice(0,15)}));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
