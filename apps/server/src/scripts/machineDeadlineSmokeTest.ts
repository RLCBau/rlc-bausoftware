import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";import express from "express";import http from "node:http";
import {maintenanceInput,machineDeadlines} from "../domain/machineMaintenance";
for(const b of [{date:"2026-02-30"},{hours:-1},{hours:true},{costNet:-5},{costNet:"1.234"},{date:"2099-01-01",status:"ERLEDIGT"},{status:"X"},{date:"2026-10-01",nextService:"2026-09-30"}])assert.throws(()=>maintenanceInput(b));
assert.equal(maintenanceInput({date:"2026-10-01",status:"GEPLANT",costNet:"12,34",hours:0}).costNet,"12.34");
const sample=machineDeadlines([{id:"m",name:"M",nextService:new Date("2026-10-09")}],[{id:"p",machineId:"m",status:"ERLEDIGT",date:new Date("2026-10-01")}],{p:{data:{isInspection:true,nextInspection:"2026-11-01"},lock:{hash:"x"}}},"2026-10-09");assert.equal(sample[0].expiry.days,0);assert.equal(sample[1].date,"2026-11-01");
const url=new URL(process.env.DATABASE_URL!);url.pathname="/rlc_machine_deadline_validation_20261009";process.env.DATABASE_URL=url.toString();process.env.DEV_AUTH="off";process.env.COMPANIES_ROOT="/tmp/rlc-machine-deadline-test-companies";
const {prisma}=require("../lib/prisma"),router=require("../routes/resources.costs").default,{machineCostReport}=require("../services/machineCostSummary");
async function main(){
 await prisma.company.createMany({data:[{id:"md-a",name:"A",code:"MD-A"},{id:"md-b",name:"B",code:"MD-B"}]});await prisma.user.create({data:{id:"md-user",email:"md@test.invalid",password:"test",companyId:"md-a"}});
 await prisma.project.createMany({data:[{id:"md-pa",name:"A",code:"MD-PA",companyId:"md-a"},{id:"md-hidden",name:"Hidden",code:"MD-HIDDEN",companyId:"md-a"},{id:"md-pb",name:"B",code:"MD-PB",companyId:"md-b"}]});await prisma.projectMember.create({data:{projectId:"md-pa",userId:"md-user",role:"BAULEITER"}});
 await prisma.companyMachine.createMany({data:[{id:"md-ma",companyId:"md-a",name:"A",projectId:"md-pa",hours:12,lastService:new Date("2026-09-01"),nextService:new Date("2026-10-01")},{id:"md-mh",companyId:"md-a",name:"Hidden",projectId:"md-hidden"},{id:"md-mb",companyId:"md-b",name:"B",projectId:"md-pb"},{id:"md-free",companyId:"md-a",name:"Free",projectId:null}]});
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.auth={sub:"md-user",companyId:req.headers["x-company"]||"md-a",companyRole:req.headers["x-role"]||"BAULEITER"};next();});app.use("/resources",router);
 app.use((err:any,_req:any,res:any,_next:any)=>res.status(500).json({ok:false,error:err.message}));
 const server=http.createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 async function call(route:string,method="GET",body?:any,headers:any={}){const res=await fetch("http://127.0.0.1:"+(server.address() as any).port+"/resources"+route,{method,headers:{"Content-Type":"application/json",...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,data:await res.json() as any};}
 const body={machineId:"md-ma",date:"2026-10-01",status:"GEPLANT",hours:12,costNet:"100.01",nextService:"2026-11-01",type:"Wartung"};
 try{
  assert.equal((await call("/machine-maintenance","POST",{...body,machineId:"md-mb"})).status,404);
  assert.equal((await call("/machine-maintenance","POST",{...body,machineId:"md-mh"})).status,403);
  assert.equal((await call("/machine-maintenance","POST",body,{"x-role":"WORKER"})).status,403);
  assert.equal((await call("/machine-maintenance","POST",{...body,costNet:-1})).status,400);
  let r=await call("/machine-maintenance","POST",body);assert.equal(r.status,200,JSON.stringify(r));let row=r.data.item;
  let m=await prisma.companyMachine.findUnique({where:{id:"md-ma"}});assert.equal(m.lastService.toISOString().slice(0,10),"2026-09-01");assert.equal(m.nextService.toISOString().slice(0,10),"2026-10-01");assert.equal(m.hours,12);
  assert.equal((await machineCostReport("md-a")).totals.maintenanceCost,0);
  let feed=await call("/machine-deadlines");assert.equal(feed.status,200);assert.ok(feed.data.items.some((x:any)=>x.recordId===row.id&&x.source==="GEPLANT"));assert.ok(!feed.data.items.some((x:any)=>["md-mh","md-mb"].includes(x.machineId)));
  const patch={status:"ERLEDIGT",expectedUpdatedAt:row.updatedAt};
  const concurrent=await Promise.all([call("/machine-maintenance/"+row.id,"PUT",patch),call("/machine-maintenance/"+row.id,"PUT",patch)]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);row=concurrent.find(r=>r.status===200)!.data.item;
  m=await prisma.companyMachine.findUnique({where:{id:"md-ma"}});assert.equal(m.lastService.toISOString().slice(0,10),"2026-10-01");assert.equal(m.nextService.toISOString().slice(0,10),"2026-11-01");assert.equal((await machineCostReport("md-a")).totals.maintenanceCost,100.01);
  assert.equal((await call("/machine-maintenance/"+row.id,"PUT",patch)).status,409);
  assert.equal((await call("/machine-maintenance/"+row.id,"PUT",{status:"GEPLANT",expectedUpdatedAt:row.updatedAt})).status,400);
  assert.equal((await call("/machine-maintenance/"+row.id,"PUT",{machineId:"md-free",expectedUpdatedAt:row.updatedAt})).status,400);
  assert.equal((await call("/machine-maintenance/"+row.id,"DELETE")).status,409);
  assert.equal((await call("/machine-maintenance/"+row.id+"/history","GET",undefined,{"x-company":"md-b"})).status,404);
  const h=await call("/machine-maintenance/"+row.id+"/history");assert.equal(h.data.items.length,2);
  const inspection={...body,machineId:"md-free",status:"ERLEDIGT",isInspection:true,equipmentIdentification:"TEST-123",inspectionKind:"Wiederkehrend",inspectionBasis:"Test",inspectionScope:"Test",inspectionResult:"NICHT_BETRIEBSSICHER",inspectorQualifiedPerson:"Test inspector",inspectorSignatureConfirmed:true,nextInspection:"2026-12-01",nextService:"2026-12-01"};
  assert.equal((await call("/machine-maintenance","POST",{...inspection,inspectorSignatureConfirmed:false})).status,422);
  assert.equal((await call("/machine-maintenance","POST",{...inspection,nextInspection:"2026-02-30"})).status,400);
  r=await call("/machine-maintenance","POST",inspection);assert.equal(r.status,200,JSON.stringify(r));const inspected=r.data.item;assert.ok(inspected.evidenceLock);
  assert.equal((await call("/machine-maintenance/"+inspected.id,"PUT",{notes:"overwrite",expectedUpdatedAt:inspected.updatedAt})).status,409);
  const metaFile=path.join(process.env.COMPANIES_ROOT!,"md-a","machine-inspections","records.json");const metadata=fs.readFileSync(metaFile);fs.writeFileSync(metaFile,"{}");
  assert.equal((await call("/machine-maintenance/"+inspected.id,"PUT",{notes:"overwrite",expectedUpdatedAt:inspected.updatedAt})).status,409);
  const recovered=await call("/machine-deadlines");assert.equal(recovered.data.items.find((x:any)=>x.kind==="PRUEFUNG"&&x.recordId===inspected.id).date,"2026-12-01");assert.equal(recovered.data.items.find((x:any)=>x.kind==="PRUEFUNG"&&x.recordId===inspected.id).evidenceLocked,true);fs.writeFileSync(metaFile,metadata);
  feed=await call("/machine-deadlines");const proof=feed.data.items.find((x:any)=>x.recordId===inspected.id&&x.kind==="PRUEFUNG");assert.equal(proof.date,"2026-12-01");assert.equal(proof.inspectionResult,"NICHT_BETRIEBSSICHER");
  const planned=await call("/machine-maintenance","POST",{...body,machineId:"md-free",status:"OFFEN",costNet:99});assert.equal(planned.status,200);
  assert.equal((await call("/machine-maintenance/"+planned.data.item.id,"DELETE")).status,200);
  const admin=await call("/machine-deadlines","GET",undefined,{"x-role":"ADMIN"});assert.ok(admin.data.items.some((x:any)=>x.machineId==="md-mh"));
  assert.equal(await prisma.ledgerEntry.count(),0);assert.equal(await prisma.machineUsageEntry.count(),0);
  console.log("PASS machine deadlines/maintenance PostgreSQL: tenant/project/write roles, calendar/dates/cents, planned vs completed master dates and actual costs, concurrent/stale updates, audit, retained completed records, inspection completeness and DB-backed evidence lock, separate deadline feed, preserved usage/accounting");
 }finally{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
