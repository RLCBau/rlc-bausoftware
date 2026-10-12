const fs=require('fs');
const {PrismaClient}=require('@prisma/client');
const {resolveV3GaebReference}=require('../../src/kalkulation/autonomous/v3GaebReferenceResolver');
const {reviewV3LunaReference}=require('../../src/kalkulation/autonomous/v3LunaReferenceReview');
(async()=>{
 const p=new PrismaClient();const sample=[];let cursor;
 try{
 while(sample.length<12){
  const headers=await p.lVHeader.findMany({take:15,...(cursor?{skip:1,cursor:{id:cursor}}:{}),orderBy:{id:'asc'},select:{id:true,positions:{select:{position:true,kurztext:true,langtext:true,einheit:true}}}});
  if(!headers.length)break;cursor=headers[headers.length-1].id;
  for(const h of headers){const rows=h.positions.map(r=>({posNr:r.position,kurztext:r.kurztext,langtext:r.langtext||'',einheit:r.einheit}));
   for(const row of rows){if(!/zulage|zuschlag/i.test(row.kurztext||''))continue;
    const ref=resolveV3GaebReference(row,rows);
    if(ref.status==='incompatible_previous'&&ref.basePosition&&sample.length<12)sample.push({row,rows});
   }
  }
 }
 }finally{await p.$disconnect();}
 const previous=fs.existsSync('/tmp/rlc-v3-reference-pilot-results.json')?JSON.parse(fs.readFileSync('/tmp/rlc-v3-reference-pilot-results.json','utf8')):[];
 const out=[...previous];for(const [i,s] of sample.entries()){
  if(out.some(r=>r.index===i && !r.error))continue;
  try{const result=await reviewV3LunaReference(s.row,s.rows);out.push({index:i,position:s.row.posNr,reference:result.reference.basePosition,relation:result.review?.relation||null,provider:result.provider||null,model:result.model||null,status:result.status,approved:result.approvedForEP,missing:result.review?.missingParameters?.length||0});}
  catch(e){out.push({index:i,error:String(e.message||e).slice(0,220)});}
  fs.writeFileSync('/tmp/rlc-v3-reference-pilot-results.json',JSON.stringify(out.filter((v,i,a)=>a.findLastIndex(r=>r.index===v.index)===i),null,2));
  console.log('PILOT_PROGRESS',i+1,'of',sample.length);
 }
 const final=JSON.parse(fs.readFileSync('/tmp/rlc-v3-reference-pilot-results.json','utf8'));
 const byRelation={};for(const row of final){const k=row.relation||row.status||'error';byRelation[k]=(byRelation[k]||0)+1;}
 console.log('PILOT_FINAL',JSON.stringify({sample:sample.length,byRelation,epApproved:final.filter(x=>x.approved).length,errors:final.filter(x=>x.error).length}));
})().catch(e=>{console.error('FATAL',String(e.message||e));process.exitCode=1});
