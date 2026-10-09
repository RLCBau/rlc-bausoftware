import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
const url=new URL(process.env.DATABASE_URL || "");
url.pathname="/rlc_addon_validation_20261008";
process.env.DATABASE_URL=url.toString();
process.env.DEV_AUTH="off";
const {prisma}=require("../lib/prisma");
const router=require("../routes/officeAddons").default;
async function main() {
 await prisma.company.createMany({data:[{id:"addon-test-a",name:"Test A",code:"ADDON-TEST-A"},{id:"addon-test-b",name:"Test B",code:"ADDON-TEST-B"}]});
 await prisma.user.createMany({data:[{id:"addon-member",email:"member@addon-test.invalid",password:"test",companyId:"addon-test-a"},{id:"addon-outsider",email:"outsider@addon-test.invalid",password:"test",companyId:"addon-test-a"}]});
 await prisma.project.createMany({data:[{id:"addon-project-a",name:"Test A",code:"TEST-A",companyId:"addon-test-a"},{id:"addon-project-b",name:"Test B",code:"TEST-B",companyId:"addon-test-b"}]});
 await prisma.projectMember.create({data:{projectId:"addon-project-a",userId:"addon-member",role:"BAULEITER"}});
 await prisma.contract.create({data:{id:"addon-contract-a",companyId:"addon-test-a",projectId:"addon-project-a",title:"NU Test",contractType:"Nachunternehmervertrag",tags:[]}});
 await prisma.contract.create({data:{id:"addon-contract-b",companyId:"addon-test-b",projectId:"addon-project-b",title:"Foreign NU",contractType:"Nachunternehmervertrag",tags:[]}});
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.auth={companyId:req.headers["x-company"] || "addon-test-a",sub:req.headers["x-user"] || "addon-member",companyRole:"BAULEITER"};next();});app.use("/addons",router);
 const server=http.createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 const port=(server.address() as any).port;
 async function call(path:string,method="GET",body?:any,headers:any={}) {
  const r=await fetch("http://127.0.0.1:"+port+"/addons"+path,{method,headers:{"Content-Type":"application/json",...headers},...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json() as any};
 }
 try {
  const b={projectId:"addon-project-a",title:"Guarantee",number:"BANK-001",issuer:"Bank",amount:"1200.50",type:"Vertragserfüllung",status:"Entwurf",contractId:"addon-contract-a",validFrom:"2026-10-01",validUntil:"2027-10-01",notes:""};
  const created=await call("/guarantees","POST",b);assert.equal(created.status,201,JSON.stringify(created.data));
  assert.equal(created.data.item.amount,"1200.5");
  assert.equal((await call("/guarantees","POST",b)).status,409);
  assert.equal((await call("/guarantees?projectId=addon-project-a","GET",undefined,{"x-user":"addon-outsider"})).status,404);
  assert.equal((await call("/guarantees?projectId=addon-project-a","GET",undefined,{"x-company":"addon-test-b"})).status,404);
  assert.equal((await call("/guarantees","POST",{...b,number:"BANK-002",contractId:"addon-contract-b"})).status,400);
  const path="/guarantees/"+created.data.item.id;
  const saves=await Promise.all([call(path,"PUT",{...b,revision:1,status:"Aktiv"}),call(path,"PUT",{...b,revision:1,status:"Aktiv"})]);
  assert.deepEqual(saves.map(x=>x.status).sort(),[200,409]);
  assert.equal(await prisma.auditLog.count({where:{resource:"guarantees:"+created.data.item.id}}),2);
  const cert={projectId:"addon-project-a",title:"Insurance",issuer:"Insurance",type:"Versicherung",status:"Ungeprüft",contractId:"addon-contract-a",notes:""};
  const createdCert=await call("/certificates","POST",cert);assert.equal(createdCert.status,201);
  const reviewed=await call("/certificates/"+createdCert.data.item.id,"PUT",{...cert,revision:1,status:"Geprüft"});
  assert.equal(reviewed.status,200);assert.equal(reviewed.data.item.reviewedBy,"addon-member");
  const history=await call(path+"/history");assert.equal(history.data.items.length,2);
  await assert.rejects(prisma.contract.delete({where:{id:"addon-contract-a"}}));

  const quote={projectId:"addon-project-a",title:"Quote A",supplier:"Supplier A",packageKey:"Lot 1",kind:"LV",status:"Entwurf",discountPercent:"0",positions:[{position:"01.001",title:"Pipe",unit:"m",quantity:"10",unitPrice:"12.50"}],notes:""};
  const qa=await call("/bids","POST",quote);assert.equal(qa.status,201,JSON.stringify(qa.data));
  assert.equal((await call("/bids/"+qa.data.item.id,"PUT",{...quote,revision:1,status:"Eingereicht"})).status,200);
  const qb=await call("/bids","POST",{...quote,title:"Quote B",supplier:"Supplier B",positions:[{...quote.positions[0],unitPrice:"11.25"}]});assert.equal(qb.status,201);
  assert.equal((await call("/bids/"+qb.data.item.id,"PUT",{...quote,title:"Quote B",supplier:"Supplier B",positions:[{...quote.positions[0],unitPrice:"11.25"}],revision:1,status:"Eingereicht"})).status,200);
  const c=await call("/bids/compare/"+qa.data.item.id);assert.equal(c.status,200);assert.equal(c.data.ranking[0].id,qb.data.item.id);
  assert.equal((await call("/bids/"+qa.data.item.id,"PUT",{...quote,revision:2,status:"Eingereicht",positions:[{...quote.positions[0],unitPrice:"999"}]})).status,400);
  assert.equal((await call("/bids/"+qb.data.item.id+"/award","POST",{revision:2,baselineId:qa.data.item.id})).status,200);
  const stored=await prisma.projectBid.findUnique({where:{id:qb.data.item.id}});assert.ok(stored.awardedAt);
  assert.equal(await prisma.projectBid.count({where:{awardedAt:{not:null}}}),1);
  assert.equal((await call("/bids/"+qb.data.item.id+"/unselect","POST",{revision:stored.revision})).status,200);
  const selectionRace=await Promise.all([
    call("/bids/"+qa.data.item.id+"/award","POST",{revision:2,baselineId:qa.data.item.id}),
    call("/bids/"+qb.data.item.id+"/award","POST",{revision:stored.revision+1,baselineId:qa.data.item.id}),
  ]);
  assert.ok(selectionRace.some(r=>r.status===200),JSON.stringify(selectionRace));
  assert.ok(selectionRace.every(r=>r.status===200 || r.status===409),JSON.stringify(selectionRace));
  assert.equal(await prisma.projectBid.count({where:{awardedAt:{not:null}}}),1);
  await prisma.projectBid.updateMany({data:{awardedAt:null,awardedBy:null}});
  const currentA=await prisma.projectBid.findUnique({where:{id:qa.data.item.id}});
  assert.equal((await call("/bids/"+qa.data.item.id,"PUT",{...quote,revision:currentA.revision,status:"Archiviert"})).status,200);
  assert.equal((await call("/bids/compare/"+qb.data.item.id,"GET",undefined,{"x-company":"addon-test-b"})).status,404);
  console.log("PASS POSTGRESQL PREISSPIEGEL: persisted offers, JSON lines, submission freeze, unchanged archival, ranking, award/unselect, simultaneous selection uniqueness, foreign-tenant access.");

  console.log("PASS POSTGRESQL: persistence, Decimal amounts, uniqueness, tenant/member restrictions, foreign-contract rejection, simultaneous writes (200/409), transactional audit, certificate review, FK protection.");
 }finally{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();}
}
main().catch(async(e:any)=>{console.error(e?.message || e);await prisma.$disconnect();process.exitCode=1;});
