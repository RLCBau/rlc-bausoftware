const fs=require('fs');
const {PrismaClient}=require('@prisma/client');
const {analyzeRlcProjectContext}=require('../../src/kalkulation/autonomous/projectContextAnalyzer');
const {calculateRlcMotorWithContext}=require('../../src/kalkulation/rlcMotor');
(async()=>{
 const p=new PrismaClient(),out={started:new Date().toISOString(),LV:0,positions:0,positive:0,zero:0,review:0,unresolved:0,exceptions:0,structural:0,byTrade:{},warningCounts:{},zeroCauses:{},zeroExamples:{},sampleErrors:[],sumEP:0,native:{priced:0,blocked:0,byTrade:{}},processedByLV:[]};
 let cursor;
 try{
 while(true){
 const hs=await p.lVHeader.findMany({take:8,...(cursor?{skip:1,cursor:{id:cursor}}:{}),orderBy:{id:'asc'},select:{id:true,title:true,positions:{select:{position:true,kurztext:true,langtext:true,einheit:true,menge:true}}}});
 if(!hs.length)break;cursor=hs[hs.length-1].id;
 for(const h of hs){
 const rows=h.positions.map(z=>({posNr:z.position,kurztext:z.kurztext,langtext:z.langtext||'',einheit:z.einheit,menge:Number(z.menge)}));
 const ctx=analyzeRlcProjectContext(rows,h.title||'');
 for(const row of rows){
  out.positions++;
  try{
   const r=calculateRlcMotorWithContext(row,ctx,rows);
   if(!r){out.structural++;out.zero++;continue;}
   if(r.unitPrice>0){out.positive++;out.sumEP+=r.unitPrice;}else out.zero++;
   if(r.source==="rlc-motor-native-resources"){
     if(r.unitPrice>0)out.native.priced++;else out.native.blocked++;
     out.native.byTrade[r.trade]=(out.native.byTrade[r.trade]||0)+1;
   }
   if(r.calculationStatus==='needs_review')out.review++;
   if(r.trade==='UNRESOLVED')out.unresolved++;
   const family=String(r.trade||'UNSPECIFIED').split('/')[0];
   let group=out.byTrade[family]||(out.byTrade[family]={positions:0,positive:0,zero:0,review:0});
   group.positions++;if(r.unitPrice>0)group.positive++;else group.zero++;
   if(r.calculationStatus==='needs_review')group.review++;
   if(r.unitPrice<=0){
    const cause=(r.warnings||[]).find(w=>/^RLC_MOTOR_/.test(w))||'ZERO_WITHOUT_MOTOR_CODE';
    const key=family+'|'+cause;
    out.zeroCauses[key]=(out.zeroCauses[key]||0)+1;
    if((out.zeroExamples[key]||[]).length<5)(out.zeroExamples[key]||=[]).push({lvId:h.id,posNr:row.posNr,text:String(row.kurztext||'').slice(0,160),unit:row.einheit,quantity:row.menge});
   }
   for(const w of r.warnings||[])if(/^RLC_MOTOR_/.test(w))out.warningCounts[w]=(out.warningCounts[w]||0)+1;
  }catch(e){out.exceptions++;out.zero++;if(out.sampleErrors.length<15)out.sampleErrors.push({posNr:row.posNr,error:String(e)});}
 }
 out.LV++;out.processedByLV.push({id:h.id,positions:rows.length});
 if(out.LV%20===0){fs.writeFileSync('/tmp/rlc-motor-full-live.json',JSON.stringify(out));console.log('PROGRESS',out.LV,out.positions,out.positive,out.zero,out.review);}
 }
 }
 }finally{await p.$disconnect();}
 out.finished=new Date().toISOString();out.byTrade=Object.fromEntries(Object.entries(out.byTrade).sort((a,b)=>b[1].zero-a[1].zero));fs.writeFileSync('/tmp/rlc-motor-full-position-audit.json',JSON.stringify(out,null,2));
 console.log('FINAL',JSON.stringify({LV:out.LV,positions:out.positions,positive:out.positive,zero:out.zero,review:out.review,unresolved:out.unresolved,exceptions:out.exceptions,structural:out.structural,native:out.native}));
})().catch(e=>{console.error(e);process.exitCode=1});
