const {PrismaClient}=require('@prisma/client');
const {calculateRlcNativeRecipe}=require('../../src/kalkulation/autonomous/rlcNativeRecipes');
(async()=>{
const p=new PrismaClient();
try{
 const xs=await p.lVPosition.findMany({
   where:{OR:[{kurztext:{contains:'Asphalt',mode:'insensitive'}},{kurztext:{contains:'Kabelsand',mode:'insensitive'}},{kurztext:{contains:'Frostschutz',mode:'insensitive'}}]},
   take:5000,select:{position:true,kurztext:true,langtext:true,einheit:true,menge:true}
 });
 const stats={scanned:xs.length,native:0,priced:0,blocked:0,byTrade:{},examples:[]};
 for(const x of xs){
 const row={posNr:x.position,kurztext:x.kurztext,langtext:x.langtext||'',einheit:x.einheit,menge:Number(x.menge)};
 const r=calculateRlcNativeRecipe(row);if(!r)continue;
 stats.native++;if(r.unitPrice>0)stats.priced++;else stats.blocked++;
 stats.byTrade[r.trade]=(stats.byTrade[r.trade]||0)+1;
 if(stats.examples.length<14)stats.examples.push({pos:x.position,short:x.kurztext,unit:x.einheit,trade:r.trade,ep:r.unitPrice});
 }
 console.log('NATIVE_SAMPLE',JSON.stringify(stats));
}finally{await p.$disconnect()}
})().catch(e=>{console.error(e);process.exitCode=1});
