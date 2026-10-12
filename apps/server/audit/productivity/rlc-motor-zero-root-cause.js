const {PrismaClient}=require('@prisma/client');
const {analyzeRlcProjectContext}=require('../../src/kalkulation/autonomous/projectContextAnalyzer');
const {calculateRlcMotorWithContext}=require('../../src/kalkulation/rlcMotor');
(async()=>{
const p=new PrismaClient(), out={examined:0,zero:0,rootCauses:{},examples:{}};
try{
const headers=await p.lVHeader.findMany({take:30,orderBy:{id:'asc'},select:{id:true,title:true,positions:{select:{position:true,kurztext:true,langtext:true,einheit:true,menge:true}}}});
for(const h of headers){
 const rows=h.positions.map(v=>({posNr:v.position,kurztext:v.kurztext,langtext:v.langtext||'',einheit:v.einheit,menge:Number(v.menge)}));
 const ctx=analyzeRlcProjectContext(rows,h.title);
 for(const row of rows){
   const r=calculateRlcMotorWithContext(row,ctx,rows);out.examined++;
   if(r?.unitPrice>0)continue;out.zero++;
   const reason=!r?'STRUCTURAL':r.warnings.find(w=>w.startsWith('RLC_MOTOR_'))||'OTHER';
   out.rootCauses[reason]=(out.rootCauses[reason]||0)+1;
   if((out.examples[reason]||[]).length<12)(out.examples[reason]||=[]).push({pos:row.posNr,text:row.kurztext?.slice(0,140),unit:row.einheit,quantity:row.menge,trade:r?.trade});
 }
}
}finally{await p.$disconnect()}
console.log(JSON.stringify(out,null,2));
})().catch(console.error);
