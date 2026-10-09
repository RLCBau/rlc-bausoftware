
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import {ledgerAmount,dueDates} from "../domain/recurringLedger";
assert.equal(ledgerAmount("-123,45"),"-123.45");
for(const x of [0,true,"1e2","1.001","NaN","1000000000000"])assert.throws(()=>ledgerAmount(x));
assert.deepEqual(dueDates({startDate:new Date("2024-01-31"),frequency:"MONTHLY"},"2024-04-30"),["2024-01-31","2024-02-29","2024-03-31","2024-04-30"]);
assert.deepEqual(dueDates({startDate:new Date("2024-02-29"),frequency:"YEARLY"},"2026-03-01"),["2024-02-29","2025-02-28","2026-02-28"]);
assert.deepEqual(dueDates({startDate:new Date("2026-01-31"),frequency:"QUARTERLY",endDate:new Date("2026-05-01")},"2026-10-01"),["2026-01-31","2026-04-30"]);
const url=new URL(process.env.DATABASE_URL!);url.pathname="/rlc_recurring_validation_20261009";process.env.DATABASE_URL=url.toString();process.env.DEV_AUTH="off";process.env.COMPANIES_ROOT="/tmp/rlc-recurring-companies";
const {prisma}=require("../lib/prisma"),router=require("../routes/accountingHub").default;
async function main(){
 await prisma.company.createMany({data:[{id:"rec-company-a",name:"Recurring A",code:"REC-A"},{id:"rec-company-b",name:"Recurring B",code:"REC-B"}]});
 await prisma.user.create({data:{id:"rec-user",email:"rec@test.invalid",password:"test",companyId:"rec-company-a"}});
 await prisma.project.createMany({data:[{id:"rec-project-a",name:"A",code:"REC-A",companyId:"rec-company-a"},{id:"rec-hidden",name:"Hidden",code:"REC-H",companyId:"rec-company-a"},{id:"rec-project-b",name:"B",code:"REC-B",companyId:"rec-company-b"}]});
 await prisma.projectMember.create({data:{projectId:"rec-project-a",userId:"rec-user",role:"BAULEITER"}});
 await prisma.projectCostCenter.createMany({data:[{companyId:"rec-company-a",projectId:"rec-project-a",code:"CC-A",description:"A",mainArea:"Internal"},{companyId:"rec-company-a",projectId:"rec-hidden",code:"CC-H",description:"H",mainArea:"Internal"}]});
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.auth={sub:"rec-user",companyId:req.headers["x-company"]||"rec-company-a",companyRole:req.headers["x-role"]||"ADMIN"};next();});app.use("/accounting",router);
 const server=http.createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const port=(server.address() as any).port;
 async function call(path:string,method="GET",body?:any,headers:any={},project="rec-project-a"){
  const response=await fetch("http://127.0.0.1:"+port+"/accounting"+path+(path.includes("?")?"&":"?")+"projectId="+project,{method,headers:{"Content-Type":"application/json",...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json() as any};
 }
 const root="/recurring-ledger",requestId="11112222-3333-4444-8555-666677778888",payload={title:"Monthly rent",text:"Internal rent",account:"1000",contraAccount:"1200",amount:"-123.45",costCenter:"CC-A",startDate:"2026-01-31",endDate:"2026-03-31",frequency:"MONTHLY",active:true,requestId};
 try{
  await call(root);
  assert.equal((await call(root,"POST",payload,{"x-role":"BAULEITER"})).status,403);
  assert.equal((await call(root,"GET",undefined,{"x-role":"BAULEITER"},"rec-hidden")).status,403);
  assert.equal((await call(root,"POST",{...payload,costCenter:"CC-H"})).status,400);
  assert.equal((await call(root,"POST",{...payload,startDate:"2026-02-30"})).status,400);
  assert.equal((await call(root,"POST",{...payload,amount:"-1.001"})).status,400);
  assert.equal((await call(root,"POST",{...payload,account:"same",contraAccount:"same"})).status,400);
  const creation=await Promise.all([call(root,"POST",payload),call(root,"POST",payload)]);
  assert.deepEqual(creation.map(x=>x.status),[201,201],JSON.stringify(creation));let row=creation[0].data.item;assert.equal(row.id,requestId);
  assert.equal(await prisma.auditLog.count({where:{resource:"recurring-ledger:"+row.id}}),1);
  assert.equal((await call(root,"POST",{...payload,amount:"-1"})).status,409);
  assert.equal((await call(root+"/"+row.id+"/history","GET",undefined,{"x-company":"rec-company-b"},"rec-project-b")).status,404);
  const preview=await call(root+"/"+row.id+"/preview?through=2026-03-31");assert.equal(preview.status,200,JSON.stringify(preview));assert.deepEqual(preview.data.dates,["2026-01-31","2026-02-28","2026-03-31"]);
  assert.equal((await call(root+"/"+row.id+"/preview?through=2099-01-01")).status,400);
  const gen={revision:1,through:"2026-03-31",dates:preview.data.dates};
  assert.equal((await call(root+"/"+row.id+"/generate","POST",{...gen,dates:["2026-02-27"]})).status,400);
  const race=await Promise.all([call(root+"/"+row.id+"/generate","POST",gen),call(root+"/"+row.id+"/generate","POST",gen)]);
  assert.deepEqual(race.map(x=>x.status),[200,200],JSON.stringify(race));assert.deepEqual(race.map(x=>x.data.created).sort(),[0,3]);
  assert.equal(await prisma.recurringLedgerOccurrence.count({where:{templateId:row.id}}),3);
  assert.equal(await prisma.ledgerEntry.count({where:{refType:"RECURRING_LEDGER",refId:row.id}}),3);
  assert.deepEqual((await call(root+"/"+row.id+"/preview?through=2026-03-31")).data.dates,[]);
  assert.equal((await call(root+"/"+row.id,"PUT",{...payload,revision:1,amount:"-200"})).status,400);
  const pause=await call(root+"/"+row.id,"PUT",{...payload,revision:1,active:false});assert.equal(pause.status,200,JSON.stringify(pause));row=pause.data.item;
  assert.equal((await call(root+"/"+row.id+"/generate","POST",{...gen,revision:row.revision})).status,400);
  assert.equal((await call(root+"/"+row.id,"PUT",{...payload,revision:1,active:true})).status,409);
  const ledger=(await call("/ledger")).data.items;assert.equal(ledger.length,3);assert.equal(ledger[0].costCenter,"CC-A");assert.equal(String(ledger[0].amount),"-123.45");
  const reason={reason:"Correction"};
  const reversals=await Promise.all([call("/ledger/"+ledger[0].id+"/reverse","POST",reason),call("/ledger/"+ledger[0].id+"/reverse","POST",reason)]);
  assert.deepEqual(reversals.map(x=>x.status).sort(),[200,400]);
  const reversal=reversals.find(x=>x.status===200)!.data.item;assert.equal(String(reversal.amount),"123.45");assert.equal(reversal.costCenter,"CC-A");
  assert.equal((await call("/ledger/"+reversal.id+"/reverse","POST",reason)).status,400);
  assert.equal((await call("/ledger/"+ledger[1].id+"/reverse","POST",{reason:""})).status,400);
  assert.equal((await call("/ledger/"+ledger[1].id+"/reverse","POST",{...reason,date:"2026-02-30"})).status,400);
  assert.equal((await call("/ledger/"+ledger[1].id+"/reverse","POST",reason,{"x-company":"rec-company-b"},"rec-project-b")).status,400);
  assert.equal(await prisma.auditLog.count({where:{resource:"ledger:"+ledger[0].id,action:"LEDGER_REVERSE"}}),1);
  assert.equal((await call("/ledger/"+ledger[0].id+"/history")).data.items.length,2);
  assert.equal((await call("/ledger/"+ledger[1].id+"/history","GET",undefined,{"x-company":"rec-company-b"},"rec-project-b")).status,404);
  const manual={date:"2026-01-02",text:"Manual expense",account:"1000",contraAccount:"1200",amount:"-0.01",requestId:"11112222-3333-4444-8555-666677778889"};
  const mr=await Promise.all([call("/ledger","POST",manual),call("/ledger","POST",manual)]);
  assert.deepEqual(mr.map(x=>x.status),[200,200]);assert.equal(mr[0].data.item.id,mr[1].data.item.id);
  assert.equal(await prisma.auditLog.count({where:{resource:"ledger:"+mr[0].data.item.id}}),1);
  assert.equal((await call("/ledger","POST",{...manual,amount:"-1"})).status,400);
  assert.equal((await call("/ledger","POST",{...manual,requestId:undefined,amount:"1.001"})).status,400);
  assert.equal((await call("/ledger","POST",{...manual,requestId:undefined,date:"2099-01-01"})).status,400);
  const p2={...payload,requestId:"11112222-3333-4444-8555-666677778880",endDate:"",startDate:"2026-01-01"};
  const r2=await call(root,"POST",p2);assert.equal(r2.status,201);
  const edits=await Promise.all([call(root+"/"+r2.data.item.id,"PUT",{...p2,title:"First",revision:1}),call(root+"/"+r2.data.item.id,"PUT",{...p2,title:"Second",revision:1})]);assert.deepEqual(edits.map(x=>x.status).sort(),[200,409]);
  console.log("PASS POSTGRESQL RECURRING/JOURNAL: signed cents, calendar/end-of-month/leap anchors, tenant/project/role/center scopes, simultaneous idempotent creation/generation, audit, frozen booked templates, pause, revision conflicts, reasoned single reversal and manual retry.");
 }finally{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
