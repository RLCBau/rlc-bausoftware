const {PrismaClient}=require('@prisma/client');
(async()=>{
const p=new PrismaClient();
try{
 const xs=await p.lVPosition.findMany({
   where:{OR:[{kurztext:{contains:'Asphalt',mode:'insensitive'}},{kurztext:{contains:'Kabelsand',mode:'insensitive'}},{kurztext:{contains:'Frostschutz',mode:'insensitive'}}]},
   take:100,select:{position:true,kurztext:true,langtext:true,einheit:true,menge:true,x84UnitPrice:true}
 });
 console.log(JSON.stringify(xs.map(x=>({pos:x.position,short:x.kurztext,lang:String(x.langtext||'').slice(0,120),unit:x.einheit,x84:String(x.x84UnitPrice||'')})),null,2));
}finally{await p.$disconnect()}
})().catch(e=>{console.error(e);process.exitCode=1});
