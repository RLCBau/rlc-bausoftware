import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import {releaseInput,releaseTransition} from "../domain/machineRelease";
const b={machineId:"release-machine-a",releaseDate:"2026-10-01",availableFrom:"2026-10-02",condition:"Einsatzbereit",status:"Entwurf",notes:"Ready",documentId:""};
assert.throws(()=>releaseInput({...b,availableFrom:"2026-09-30"}));
assert.throws(()=>releaseInput({...b,condition:"Unknown"}));
assert.throws(()=>releaseInput({...b,releaseDate:"2026-02-30"}));
assert.throws(()=>releaseTransition("Bestätigt","Entwurf"));
const url=new URL(process.env.DATABASE_URL!);url.pathname="/rlc_addon_validation_20261008";process.env.DATABASE_URL=url.toString();process.env.DEV_AUTH="off";
const {prisma}=require("../lib/prisma"),router=require("../routes/officeAddons").default;
async function main(){
 await prisma.companyMachine.createMany({data:[{id:"release-machine-a",name:"Excavator A",companyId:"addon-test-a",projectId:"addon-project-a"},{id:"release-machine-b",name:"Foreign B",companyId:"addon-test-b",projectId:"addon-project-b"},{id:"release-machine-hidden",name:"Hidden",companyId:"addon-test-a",projectId:"planning-hidden"}]});
 await prisma.resourceAssignment.create({data:{companyId:"addon-test-a",resourceType:"MACHINE",resourceId:"release-machine-a",projectId:"addon-project-a",date:new Date("2026-10-02T12:00:00Z"),hours:8}});
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.auth={sub:req.headers["x-user"]||"addon-member",companyId:req.headers["x-company"]||"addon-test-a",companyRole:req.headers["x-role"]||"BAULEITER"};next();});app.use("/addons",router);
 const server=http.createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const port=(server.address() as any).port;
 async function call(path:string,method="GET",body?:any,headers:any={}){
  const response=await fetch("http://127.0.0.1:"+port+"/addons"+path,{method,headers:{"Content-Type":"application/json",...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json() as any};
 }
 try{
  const resources=await call("/machine-releases/resources?projectId=addon-project-a");assert.equal(resources.status,200);assert.deepEqual(resources.data.machines.map((m:any)=>m.id),["release-machine-a"]);
  const payload={...b,projectId:"addon-project-a"};
  assert.equal((await call("/machine-releases","POST",{...payload,machineId:"release-machine-b"})).status,400);
  assert.equal((await call("/machine-releases","POST",{...payload,machineId:"release-machine-hidden"})).status,400);
  assert.equal((await call("/machine-releases","POST",payload,{"x-user":"addon-outsider"})).status,404);
  assert.equal((await call("/machine-releases","POST",payload,{"x-role":"MITARBEITER"})).status,403);
  const created=await call("/machine-releases","POST",payload,{"x-role":"CAPOCANTIERE"});assert.equal(created.status,201,JSON.stringify(created.data));let row=created.data.item;
  const path="/machine-releases/"+row.id;
  assert.equal((await call(path,"PUT",{...payload,revision:99})).status,409);
  const submissions=await Promise.all([call(path,"PUT",{...row,status:"Gemeldet"}),call(path,"PUT",{...row,status:"Gemeldet"})]);assert.deepEqual(submissions.map(x=>x.status).sort(),[200,409]);row=submissions.find(x=>x.status===200)!.data.item;assert.ok(row.reportedAt);
  assert.equal((await call(path,"PUT",{...row,notes:"Changed"})).status,400);
  const confirmed=await call(path,"PUT",{...row,status:"Bestätigt"});assert.equal(confirmed.status,200,JSON.stringify(confirmed.data));row=confirmed.data.item;assert.ok(row.confirmedAt);assert.equal(row.confirmedBy,"addon-member");
  assert.equal((await call(path,"PUT",{...row,status:"Entwurf"})).status,400);
  assert.equal((await call(path+"/history")).data.items.length,3);
  assert.equal((await call(path+"/history","GET",undefined,{"x-company":"addon-test-b"})).status,404);
  assert.equal((await prisma.companyMachine.findUnique({where:{id:b.machineId}})).projectId,"addon-project-a");
  assert.equal(await prisma.resourceAssignment.count({where:{resourceId:b.machineId}}),1);
  const future=await call("/machine-releases","POST",{...payload,releaseDate:"2099-10-01",availableFrom:"2099-10-02"});assert.equal(future.status,201);
  const reported=await call("/machine-releases/"+future.data.item.id,"PUT",{...future.data.item,status:"Gemeldet"});assert.equal(reported.status,200);
  assert.equal((await call("/machine-releases/"+future.data.item.id,"PUT",{...reported.data.item,status:"Bestätigt"})).status,400);
  const archived=await call(path,"PUT",{...row,status:"Archiviert"});assert.equal(archived.status,200);
  assert.equal((await call(path,"PUT",archived.data.item)).status,400);
  assert.equal((await call("/bids?projectId=addon-project-a","GET",undefined,{"x-role":"KALKULATOR"})).status,200);
  assert.equal((await call("/guarantees?projectId=addon-project-a","GET",undefined,{"x-role":"KALKULATOR"})).status,403);
  console.log("PASS POSTGRESQL MACHINE RELEASES: scoped resources and roles, validated dates/condition, report/confirm/archive lifecycle, frozen content, revisions and concurrent writes, future confirmation blocked, audit history, existing machine/allocation data preserved. Kalkulator bid access remains separate.");
 }finally{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
