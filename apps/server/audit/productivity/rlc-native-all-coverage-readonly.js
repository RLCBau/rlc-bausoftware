const fs=require('fs');
const {PrismaClient}=require('@prisma/client');
const {calculateRlcNativeRecipe}=require('../../src/kalkulation/autonomous/rlcNativeRecipes');
(async()=>{
const p=new PrismaClient();
const out={total:0,candidates:0,complete:0,incomplete:0,missingResources:{},byTrade:{},examples:[],errors:0};let cursor;
try{
while(true){
const rows=await p.lVPosition.findMany({take:1000,...(cursor?{skip:1,cursor:{id:cursor}}:{}),orderBy:{id:'asc'},select:{id:true,position:true,kurztext:true,langtext:true,einheit:true,menge:true}});
if(!rows.length)break;cursor=rows[rows.length-1].id;
for(const x of rows){out.total++;
 try{
 const r=calculateRlcNativeRecipe({posNr:x.position,kurztext:x.kurztext,langtext:x.langtext||'',einheit:x.einheit,menge:Number(x.menge)});
 if(!r)continue;out.candidates++;if(r.unitPrice>0)out.complete++;else out.incomplete++;
 for(const w of r.warnings||[])if(w.startsWith("RLC_NATIVE_MISSING_"))out.missingResources[w]=(out.missingResources[w]||0)+1;
 out.byTrade[r.trade]=(out.byTrade[r.trade]||0)+1;
 if(out.examples.length<12)out.examples.push({position:x.position,short:String(x.kurztext).slice(0,140),unit:x.einheit,trade:r.trade});
 }catch(e){out.errors++}
}
}
}finally{await p.$disconnect()}
fs.writeFileSync('/tmp/rlc-native-coverage-all.json',JSON.stringify(out,null,2));
console.log('NATIVE_ALL',JSON.stringify(out));
})().catch(e=>{console.error(e);process.exitCode=1});
