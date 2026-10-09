
import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";import express from "express";import http from "node:http";import {randomUUID} from "node:crypto";
const url=new URL(process.env.DATABASE_URL!);url.pathname="/rlc_shipment_validation_20261009";process.env.DATABASE_URL=url.toString();process.env.DEV_AUTH="off";process.env.PROJECTS_ROOT="/tmp/rlc-shipment-test-projects";process.env.COMPANIES_ROOT="/tmp/rlc-shipment-test-companies";
const {prisma}=require("../lib/prisma"),router=require("../routes/officeAddons").default;
async function main(){
 await prisma.company.createMany({data:[{id:"ship-a",name:"A",code:"SHIP-A"},{id:"ship-b",name:"B",code:"SHIP-B"}]});
 await prisma.user.create({data:{id:"ship-user",email:"ship@test.invalid",password:"test",companyId:"ship-a"}});
 await prisma.project.createMany({data:[{id:"ship-pa",name:"A",code:"SHIP-PA",companyId:"ship-a"},{id:"ship-px",name:"X",code:"SHIP-PX",companyId:"ship-a"},{id:"ship-pb",name:"B",code:"SHIP-PB",companyId:"ship-b"}]});
 await prisma.projectMember.create({data:{projectId:"ship-pa",userId:"ship-user",role:"BAULEITER"}});
 await prisma.document.createMany({data:[{id:"ship-da",projectId:"ship-pa",kind:"PDF",name:"A"},{id:"ship-db",projectId:"ship-pb",kind:"PDF",name:"B"}]});
 const dir=path.join(process.env.PROJECTS_ROOT!,"ship-pa","lieferscheine");fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,"Lieferschein_2026-10-01_001.json");fs.writeFileSync(file,JSON.stringify({workflowStatus:"FREIGEGEBEN",number:"SHIP-001",date:"2026-10-01",supplier:"Test",rows:[{material:"Test",quantity:1,unit:"Stk"}]}));
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.auth={sub:"ship-user",companyId:req.headers["x-company"]||"ship-a",companyRole:req.headers["x-role"]||"BAULEITER"};next();});app.use("/ship",router);
 const server=http.createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 async function call(route="",method="GET",body?:any,headers:any={}){
  const res=await fetch("http://127.0.0.1:"+(server.address() as any).port+"/ship/shipments"+route,{method,headers:{"Content-Type":"application/json",...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,data:await res.json() as any};
 }
 const base={projectId:"ship-pa",title:"Test sendung",recipient:"Empfänger",address:"Teststraße 1",carrier:"Test",contents:"Material",documentId:"ship-da",plannedDate:"2026-10-01",expectedDate:"2026-10-02",packages:"2",trackingNumber:"TEST",notes:"",deliveryKey:"ship-pa:Lieferschein_2026-10-01_001.json"};
 const counts=async()=>[await prisma.companyPurchaseOrder.count(),await prisma.companyMaterial.count(),await prisma.ledgerEntry.count()];
 try{
  const before=await counts();
  assert.equal((await call("?projectId=ship-pa")).status,200);
  assert.equal((await call("?projectId=ship-px")).status,404);
  assert.equal((await call("?projectId=ship-pb")).status,404);
  assert.equal((await call("?projectId=ship-pa","GET",undefined,{"x-role":"KALKULATOR"})).status,403);
  assert.equal((await call("?projectId=ship-pa","GET",undefined,{"x-role":"CAPOCANTIERE"})).status,200);
  assert.equal((await call("","POST",{...base,requestId:randomUUID(),documentId:"ship-db"})).status,400);
  for(const change of [{packages:0},{packages:true},{plannedDate:"2026-02-30"},{expectedDate:"2026-09-01"},{plannedDate:false},{deliveryKey:"ship-pb:Lieferschein_x.json"},{status:"Zugestellt"}])
   assert.equal((await call("","POST",{...base,requestId:randomUUID(),...change})).status,400,JSON.stringify(change));
  const body={...base,requestId:randomUUID()};
  const results=await Promise.all([call("","POST",body),call("","POST",body)]);assert.ok(results.every(r=>r.status===201),JSON.stringify(results));
  let row=results[0].data.item;assert.equal(row.revision,1);assert.equal(await prisma.projectShipment.count(),1);assert.equal(await prisma.auditLog.count({where:{resource:"shipment:"+row.id}}),1);
  assert.equal((await call("","POST",{...body,title:"changed"})).status,409);
  const transition=(action:string,extra:any={})=>call("/"+row.id+"/transition","POST",{revision:row.revision,action,date:"2026-10-01",...extra});
  assert.equal((await call("/"+row.id+"/history","GET",undefined,{"x-company":"ship-b"})).status,404);
  assert.equal((await transition("deliver",{receiptConfirmed:true,receivedBy:"Test"})).status,400);
  let r=await transition("plan");assert.equal(r.status,200);row=r.data.item;
  assert.equal((await call("/"+row.id,"PUT",{...base,revision:row.revision,plannedDate:""})).status,400);
  const original=fs.readFileSync(file);fs.writeFileSync(file,original.toString()+" ");
  assert.equal((await transition("dispatch")).status,409);fs.writeFileSync(file,original);
  const simultaneous=await Promise.all([transition("dispatch"),transition("dispatch")]);assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,409]);row=simultaneous.find(r=>r.status===200)!.data.item;
  assert.equal((await call("/"+row.id,"PUT",{...base,revision:row.revision})).status,400);
  assert.equal((await transition("cancel",{reason:"No"})).status,400);
  assert.equal((await transition("problem",{reason:""})).status,400);
  assert.equal((await transition("problem",{reason:"Late",date:"2026-09-30"})).status,400);
  r=await transition("problem",{reason:"Late"});assert.equal(r.status,200);row=r.data.item;
  r=await transition("resume",{reason:"Resolved"});assert.equal(r.status,200);row=r.data.item;
  assert.equal((await transition("deliver",{receiptConfirmed:true,receivedBy:"Test",receiptDocumentId:"ship-db"})).status,400);
  assert.equal((await transition("deliver",{receiptConfirmed:false,receivedBy:"Test"})).status,400);
  assert.equal((await transition("deliver",{receiptConfirmed:true,receivedBy:"Test",date:"2099-01-01"})).status,400);
  assert.equal((await transition("deliver",{receiptConfirmed:true,receivedBy:"Test",date:"2026-09-30"})).status,400);
  r=await transition("deliver",{receiptConfirmed:true,receivedBy:"Test",receiptDocumentId:"ship-da",date:"2026-10-02"});assert.equal(r.status,200);row=r.data.item;assert.equal(row.status,"Zugestellt");assert.equal(row.deliveredBy,"ship-user");
  assert.equal((await transition("deliver",{receiptConfirmed:true,receivedBy:"Other"})).status,400);
  assert.equal((await call("/"+row.id,"PUT",{...base,revision:row.revision})).status,400);
  const history=await call("/"+row.id+"/history");assert.equal(history.data.items.length,6);
  const cancelled=await call("","POST",{...base,deliveryKey:"",requestId:randomUUID()});row=cancelled.data.item;assert.equal(cancelled.status,201);
  assert.equal((await transition("cancel")).status,400);r=await transition("cancel",{reason:"Auftrag entfällt"});assert.equal(r.status,200);row=r.data.item;assert.equal((await transition("dispatch")).status,400);
  assert.deepEqual(await counts(),before);console.log("PASS shipment workflow, scopes, documents, sources, dates, concurrency, idempotency, freezing, audit and unchanged accounting/inventory");
 }finally{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
