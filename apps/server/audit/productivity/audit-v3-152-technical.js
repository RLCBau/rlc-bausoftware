const fs=require('fs');
const {PrismaClient}=require('@prisma/client');
const {diagnoseV3LunaCandidate}=require('../../src/kalkulation/autonomous/v3LunaMotorBridge');
const {resolveV3GaebReference}=require('../../src/kalkulation/autonomous/v3GaebReferenceResolver');
(async()=>{
 const saved=JSON.parse(fs.readFileSync('/tmp/rlc-v3-reference-193-results.json','utf8'));
 const valid=new Map(saved.filter(x=>x.relation==='legitimate_variant').map(x=>[x.index,x]));
 const p=new PrismaClient(),sample=[];let cursor;
 try{
 while(sample.length<193){
  const hs=await p.lVHeader.findMany({take:15,...(cursor?{skip:1,cursor:{id:cursor}}:{}),orderBy:{id:'asc'},select:{id:true,positions:{select:{position:true,kurztext:true,langtext:true,einheit:true}}}});
  if(!hs.length)break;cursor=hs[hs.length-1].id;
  for(const h of hs){const a=h.positions.map(r=>({posNr:r.position,kurztext:r.kurztext,langtext:r.langtext||'',einheit:r.einheit}));
   for(const row of a){if(!/zulage|zuschlag/i.test(row.kurztext||''))continue;
    const ref=resolveV3GaebReference(row,a);if(ref.status==='incompatible_previous'&&ref.basePosition&&sample.length<193)sample.push({row,a,ref});
   }
  }
 }
 }finally{await p.$disconnect();}
 const summary={sample:sample.length,aiCandidate:valid.size,examined:0,uniqueBase:0,baseFamilyEligible:0,variantFamilyEligible:0,bothEligible:0,missingReference:0,unmatched:0,missingUnit:0,exceptions:0,priceApproved:0};
 const details=[];
 for(const [index,record] of sample.entries()){
  if(!valid.has(index))continue;summary.examined++;
  const base=record.a.slice(0,record.a.indexOf(record.row)).filter(r=>r.posNr===record.ref.basePosition);
  if(base.length!==1){summary.missingReference++;continue;}summary.uniqueBase++;
  let baseCount=0,variantCount=0;
  try{
   const a=diagnoseV3LunaCandidate(base[0],'UNRESOLVED');
   const b=diagnoseV3LunaCandidate(record.row,'UNRESOLVED');
   baseCount=a.eligibleCount;variantCount=b.eligibleCount;
   if(baseCount)summary.baseFamilyEligible++;
   if(variantCount)summary.variantFamilyEligible++;
   if(baseCount&&variantCount)summary.bothEligible++;
  }catch(e){summary.exceptions++;}
  if(!record.row.einheit)summary.missingUnit++;
  details.push({index,basePosition:record.ref.basePosition,surchargePosition:record.row.posNr,baseFamilyCandidates:baseCount,variantFamilyCandidates:variantCount,needsTechnicalReview:true,epApproved:false});
 }
 fs.writeFileSync('/tmp/rlc-v3-152-technical-audit.json',JSON.stringify({summary,details},null,2));
 console.log('TECHNICAL_AUDIT',JSON.stringify(summary));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
