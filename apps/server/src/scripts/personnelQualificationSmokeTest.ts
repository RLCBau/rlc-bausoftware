import assert from "node:assert/strict";import express from "express";import http from "node:http";import {certificateDate,certificateName,certificateExpiry} from "../domain/personnelCertificate";
assert.equal(certificateExpiry(new Date("2026-10-09T00:00:00Z"),"2026-10-09").days,0);assert.equal(certificateExpiry(new Date("2026-10-08T23:00:00Z"),"2026-10-09").status,"ABGELAUFEN");assert.equal(certificateExpiry(null).status,"OHNE_DATUM");
for(const v of ["2026-02-30","invalid",false,12])assert.throws(()=>certificateDate(v));
assert.equal(certificateDate("2026-10-09T12:00:00.000Z")!.toISOString(),"2026-10-09T12:00:00.000Z");
for(const v of ["",null,"x".repeat(251)])assert.throws(()=>certificateName(v));
const url=new URL(process.env.DATABASE_URL!);url.pathname="/rlc_qualification_validation_20261009";process.env.DATABASE_URL=url.toString();process.env.DEV_AUTH="off";process.env.COMPANIES_ROOT="/tmp/rlc-qualification-test-companies";
const {prisma}=require("../lib/prisma"),router=require("../routes/personal").default;
async function main(){
 await prisma.company.createMany({data:[{id:"qual-a",name:"A",code:"QUAL-A"},{id:"qual-b",name:"B",code:"QUAL-B"}]});
 await prisma.user.create({data:{id:"qual-user",email:"qual@test.invalid",password:"test",companyId:"qual-a"}});
 await prisma.companyEmployee.createMany({data:[{id:"qual-ea",companyId:"qual-a",name:"Employee A",hourlyRate:99,projects:["project-a"]},{id:"qual-eb",companyId:"qual-b",name:"Employee B"},{id:"qual-inactive",companyId:"qual-a",name:"Inactive",active:false}]});
 await prisma.companyEmployeeCertificate.createMany({data:[{id:"qual-foreign",employeeId:"qual-eb",name:"Foreign"},{id:"qual-old",employeeId:"qual-inactive",name:"Old"}]});
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.auth={sub:"qual-user",companyId:req.headers["x-company"]||"qual-a",companyRole:req.headers["x-role"]||"BAULEITER"};next();});app.use("/personal",router);const server=http.createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 async function call(route:string,method="GET",body?:any,headers:any={}){const response=await fetch("http://127.0.0.1:"+(server.address() as any).port+"/personal"+route,{method,headers:{"Content-Type":"application/json",...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json() as any};}
 try{
  const initial=await call("/qualifications");assert.equal(initial.status,200);assert.equal(initial.data.employees.length,1);assert.equal(initial.data.items.length,0);assert.equal(initial.data.employees[0].hourlyRate,undefined);
  for(const role of ["BUCHHALTUNG","CAPOCANTIERE","KALKULATOR"])assert.equal((await call("/qualifications","GET",undefined,{"x-role":role})).status,403);
  assert.equal((await call("/qualifications","GET",undefined,{"x-role":"ADMIN"})).status,200);
  for(const data of [{name:""},{name:"Test",validUntil:"2026-02-30"},{name:"Test",validUntil:false}])assert.equal((await call("/qual-ea/certificates","POST",data)).status,400);
  assert.equal((await call("/qual-eb/certificates","POST",{name:"Wrong"})).status,404);
  assert.equal((await call("/qual-inactive/certificates","POST",{name:"Wrong"})).status,404);
  let r=await call("/qual-ea/certificates","POST",{name:"Excavator",validUntil:"2026-10-09"});assert.equal(r.status,200,JSON.stringify(r));let row=r.data.item;
  assert.equal((await call("/qualifications/"+row.id+"/history","GET",undefined,{"x-company":"qual-b"})).status,404);
  assert.equal((await call("/qual-ea/certificates/qual-foreign","PUT",{name:"Wrong"})).status,404);
  assert.equal((await call("/qual-ea/certificates/"+row.id,"PUT",{name:"",expectedUpdatedAt:row.updatedAt})).status,400);
  const patch={name:"Excavator training",validUntil:"2026-11-01",expectedUpdatedAt:row.updatedAt};
  const results=await Promise.all([call("/qual-ea/certificates/"+row.id,"PUT",patch),call("/qual-ea/certificates/"+row.id,"PUT",patch)]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);row=results.find(x=>x.status===200)!.data.item;
  assert.equal((await call("/qual-ea/certificates/"+row.id,"PUT",patch)).status,409);
  r=await call("/qual-ea/certificates/"+row.id,"PUT",{validUntil:null,expectedUpdatedAt:row.updatedAt});assert.equal(r.status,200);row=r.data.item;assert.equal(row.name,"Excavator training");assert.equal(row.validUntil,null);
  const list=await call("/qualifications");assert.equal(list.data.items.length,1);assert.equal(list.data.items[0].expiry.status,"OHNE_DATUM");assert.equal(list.data.items[0].employee.hourlyRate,undefined);
  const history=await call("/qualifications/"+row.id+"/history");assert.equal(history.status,200);assert.equal(history.data.items.length,3);assert.equal(history.data.items[0].meta.before.name,"Excavator training");
  const deletion=await call("/qual-ea/certificates/"+row.id,"DELETE");assert.equal(deletion.status,409);assert.equal(deletion.data.error,"PERSONAL_RETENTION_CLASSIFICATION_REQUIRED");
  assert.equal(await prisma.companyEmployeeDocument.count(),0);assert.equal(await prisma.ledgerEntry.count(),0);assert.equal(await prisma.companyEmployeeCertificate.count(),3);
  console.log("PASS personnel qualification: tenant/roles/active scope, minimal list without costs, date validation/calendar boundaries, explicit save, simultaneous revision conflicts, atomic audit and retained deletion controls");
 }finally{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
