import assert from "node:assert/strict";import express from "express";import http from "node:http";
const url=new URL(process.env.DATABASE_URL!);url.pathname="/rlc_cockpit_validation_20261009";process.env.DATABASE_URL=url.toString();process.env.DEV_AUTH="off";
const {prisma}=require("../lib/prisma"),router=require("../routes/officeAddons").default;
async function main(){
 await prisma.company.createMany({data:[{id:"cp-a",name:"A",code:"CP-A"},{id:"cp-b",name:"B",code:"CP-B"}]});await prisma.user.create({data:{id:"cp-user",email:"cp@test.invalid",password:"test",companyId:"cp-a"}});
 await prisma.project.createMany({data:[{id:"cp-pa",name:"A",code:"CP-PA",companyId:"cp-a"},{id:"cp-empty",name:"Empty",code:"CP-EMPTY",companyId:"cp-a"},{id:"cp-hidden",name:"Hidden",code:"CP-HIDDEN",companyId:"cp-a"},{id:"cp-pb",name:"B",code:"CP-PB",companyId:"cp-b"}]});
 await prisma.projectMember.createMany({data:[{projectId:"cp-pa",userId:"cp-user",role:"BAULEITER"},{projectId:"cp-empty",userId:"cp-user",role:"BAULEITER"}]});
 const where={companyId:"cp-a",projectId:"cp-pa"};
 await prisma.contract.create({data:{id:"cp-contract",...where,title:"Test",tags:[]}});
 await prisma.projectGuarantee.createMany({data:[...Array.from({length:21},(_,i)=>({...where,title:"Expired "+i,number:"GUAR-"+i,issuer:"Test",type:"Gewährleistung",amount:100,status:"Aktiv",validUntil:new Date("2026-10-01")})),{...where,title:"Returned",number:"RETURNED",issuer:"Test",type:"Gewährleistung",amount:100,status:"Zurückgegeben"},{companyId:"cp-b",projectId:"cp-pb",title:"FOREIGN",number:"FOREIGN",issuer:"Test",type:"Gewährleistung",amount:1,status:"Aktiv"}]});
 await prisma.contractCertificate.createMany({data:[{...where,contractId:"cp-contract",title:"Unreviewed",issuer:"Test",type:"Qualifikation",status:"Ungeprüft"},{...where,contractId:"cp-contract",title:"Expired cert",issuer:"Test",type:"Qualifikation",status:"Geprüft",validUntil:new Date("2026-10-01")},{...where,contractId:"cp-contract",title:"Archived",issuer:"Test",type:"Qualifikation",status:"Archiviert"}]});
 await prisma.projectBid.create({data:{...where,title:"Bid",supplier:"Test",packageKey:"PKG",positions:[],status:"Entwurf"}});
 await prisma.companyMachine.create({data:{id:"cp-machine",companyId:"cp-a",name:"Test machine",projectId:"cp-pa"}});
 await prisma.machineRelease.create({data:{...where,machineId:"cp-machine",releaseDate:new Date("2026-10-01"),availableFrom:new Date("2026-10-02"),condition:"Einsatzbereit",status:"Gemeldet"}});
 await prisma.machineUsageEntry.createMany({data:[{...where,machineId:"cp-machine",date:new Date("2026-10-01"),hours:1,hourlyRate:10,amount:10,activity:"Draft",status:"Entwurf"},{...where,machineId:"cp-machine",date:new Date("2026-10-01"),hours:1,hourlyRate:10,amount:10,activity:"Booked",status:"Gebucht"}]});
 const ship={...where,title:"Shipment",number:"SHIP",recipient:"Test",address:"Test",carrier:"Test",trackingNumber:"",contents:"Test",notes:""};
 await prisma.projectShipment.createMany({data:[{...ship,id:"cp-late",status:"Versendet",expectedDate:new Date("2026-10-01")},{...ship,id:"cp-done",number:"DONE",status:"Zugestellt"}]});
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 await prisma.resourceAssignment.createMany({data:[{companyId:"cp-a",projectId:"cp-pa",resourceType:"MACHINE",resourceId:"cp-machine",date:new Date(today+"T12:00:00Z"),hours:2},{companyId:"cp-a",projectId:"cp-hidden",resourceType:"MACHINE",resourceId:"cp-machine",date:new Date(today+"T12:00:00Z"),hours:2}]});
 await prisma.accountingRoot.create({data:{id:"cp-account",projectId:"cp-pa"}});
 await prisma.recurringLedgerTemplate.create({data:{id:"cp-template",accountingId:"cp-account",title:"Monthly",text:"Test",account:"1000",contraAccount:"2000",amount:10,startDate:new Date("2026-10-01"),frequency:"MONTHLY",active:true}});
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.auth={sub:"cp-user",companyId:req.headers["x-company"]||"cp-a",companyRole:req.headers["x-role"]||"BAULEITER"};next();});app.use("/addons",router);const server=http.createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 async function call(project="cp-pa",headers:any={}){const response=await fetch("http://127.0.0.1:"+(server.address() as any).port+"/addons/cockpit?projectId="+project,{headers});return {status:response.status,data:await response.json() as any};}
 const card=(d:any,k:string)=>d.cards.find((x:any)=>x.key===k);
 const counters=async()=>[await prisma.accountingRoot.count(),await prisma.ledgerEntry.count(),await prisma.auditLog.count(),await prisma.projectShipment.count(),await prisma.machineUsageEntry.count()];
 try{
  const before=await counters();let response=await call();assert.equal(response.status,200);let d=response.data;assert.equal(d.cards.length,8);assert.ok(d.cards.every((x:any)=>x.available));
  assert.equal(card(d,"guarantees").total,21);assert.equal(card(d,"guarantees").items.length,20);assert.equal(card(d,"guarantees").truncated,true);assert.equal(card(d,"guarantees").attention,21);
  assert.equal(card(d,"certificates").total,2);assert.equal(card(d,"certificates").attention,2);assert.equal(card(d,"usage").total,1);assert.equal(card(d,"shipments").total,1);assert.equal(card(d,"shipments").attention,1);assert.equal(card(d,"releases").total,1);assert.equal(card(d,"planning").total,1);assert.equal(card(d,"recurring").total,1);
  assert.equal(JSON.stringify(d).includes("FOREIGN"),false);assert.equal(JSON.stringify(d).includes("hourlyRate"),false);assert.equal(JSON.stringify(d).includes("amount"),false);
  assert.equal((await call("CP-PA")).status,200);assert.equal((await call("cp-hidden")).status,404);assert.equal((await call("cp-pb")).status,404);assert.equal((await call("")).status,400);
  for(const role of ["KALKULATOR","CAPOCANTIERE","MITARBEITER"])assert.equal((await call("cp-pa",{"x-role":role})).status,403);
  assert.equal((await call("cp-hidden",{"x-role":"ADMIN"})).status,200);assert.equal((await call("cp-pa",{"x-role":"BUCHHALTUNG"})).status,200);
  const empty=await call("cp-empty");assert.equal(empty.status,200);assert.ok(empty.data.cards.every((x:any)=>x.available&&x.total===0));assert.deepEqual(await counters(),before);
  await prisma.$executeRawUnsafe('ALTER TABLE "ProjectGuarantee" RENAME TO "_CockpitMissingGuarantee"');
  try{d=(await call()).data;assert.equal(card(d,"guarantees").available,false);assert.equal(card(d,"guarantees").total,null);assert.equal(card(d,"shipments").available,true);}finally{await prisma.$executeRawUnsafe('ALTER TABLE "_CockpitMissingGuarantee" RENAME TO "ProjectGuarantee"');}
  await prisma.recurringLedgerTemplate.update({where:{id:"cp-template"},data:{startDate:new Date("1900-01-01")}});d=(await call()).data;assert.equal(card(d,"recurring").available,false);assert.equal(card(d,"recurring").total,null);await prisma.recurringLedgerTemplate.update({where:{id:"cp-template"},data:{startDate:new Date("2026-10-01")}});
  const ledger=await prisma.ledgerEntry.create({data:{accountingId:"cp-account",date:new Date("2026-10-01"),account:"1000",contraAccount:"2000",amount:10}});await prisma.recurringLedgerOccurrence.create({data:{templateId:"cp-template",date:new Date("2026-10-01"),ledgerId:ledger.id}});
  d=(await call()).data;assert.equal(card(d,"recurring").total,0);assert.equal(card(d,"recurring").items.length,0);
  assert.equal(await prisma.auditLog.count(),0);assert.equal(await prisma.accountingRoot.count(),1);
  console.log("PASS operations cockpit PostgreSQL: tenant/project/roles, correct status/date counters, truncation, empty project without implicit writes, generated recurring occurrences excluded, partial DB/calculation failure shown unavailable instead of zero, no sensitive monetary fields");
 }finally{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
