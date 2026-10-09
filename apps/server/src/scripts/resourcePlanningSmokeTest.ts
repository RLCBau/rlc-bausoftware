import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import {planningDate,planningRange,planningHours} from "../domain/resourcePlanning";
assert.equal(planningDate("2028-02-29"),"2028-02-29");
for(const value of ["2026-02-29","2026-02-30","2026-13-01","2026-10-08T12:00Z",null])assert.throws(()=>planningDate(value));
assert.throws(()=>planningRange("2026-10-09","2026-10-08"));
for(const value of [-1,25,"NaN","Infinity","1e2","",true,[],{}])assert.throws(()=>planningHours(value));
assert.equal(planningHours("7,5"),7.5);
const url=new URL(process.env.DATABASE_URL!);url.pathname="/rlc_addon_validation_20261008";process.env.DATABASE_URL=url.toString();
process.env.DEV_AUTH="off";process.env.COMPANIES_ROOT="/tmp/rlc-planning-test-companies";
const {prisma}=require("../lib/prisma"),router=require("../routes/resources.costs").default;
async function main(){
 await prisma.project.create({data:{id:"planning-hidden",name:"Hidden same-company project",code:"PLAN-HIDDEN",companyId:"addon-test-a"}});
 await prisma.companyEmployee.createMany({data:[{id:"planning-employee-a",name:"Test A",companyId:"addon-test-a"},{id:"planning-employee-b",name:"Test B",companyId:"addon-test-b"}]});
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.auth={sub:req.headers["x-user"]||"addon-member",companyId:req.headers["x-company"]||"addon-test-a",companyRole:req.headers["x-role"]||"BAULEITER"};next();});app.use("/planning",router);
 app.use((error:any,_req:any,res:any,_next:any)=>res.status(500).json({error:error.message}));
 const server=http.createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const port=(server.address() as any).port;
 async function call(path:string,method="GET",body?:any,headers:any={}){
  const response=await fetch("http://127.0.0.1:"+port+"/planning"+path,{method,headers:{"Content-Type":"application/json",...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json() as any};
 }
 const period="/assignments?from=2026-10-05&to=2026-10-11";
 const body={resourceType:"EMPLOYEE",resourceId:"planning-employee-a",projectId:"addon-project-a",date:"2026-10-08",hours:8};
 try{
  for(const date of ["2026-02-30","2026-10-08T12:00Z"])assert.equal((await call("/assignments","POST",{...body,date})).status,400);
  for(const hours of [-1,25,"NaN",true])assert.equal((await call("/assignments","POST",{...body,hours})).status,400);
  assert.equal((await call("/assignments?from=2026-02-30&to=2026-10-11")).status,400);
  assert.equal((await call("/assignments/week?from=2026-10-11&to=2026-10-05","DELETE")).status,400);
  assert.equal((await call("/assignments","POST",{...body,resourceId:"planning-employee-b"})).status,404);
  assert.equal((await call("/assignments","POST",{...body,projectId:"planning-hidden"})).status,403);
  assert.equal((await call("/assignments","POST",body,{"x-role":"MITARBEITER"})).status,403);
  const saved=await call("/assignments","POST",body);assert.equal(saved.status,200,JSON.stringify(saved.data));
  const id=saved.data.item.id;
  const hidden=await call("/assignments","POST",{...body,projectId:"planning-hidden"},{"x-role":"ADMIN"});assert.equal(hidden.status,200);
  const foreign=await call("/assignments","POST",{...body,resourceId:"planning-employee-b",projectId:"addon-project-b"},{"x-role":"ADMIN","x-company":"addon-test-b"});assert.equal(foreign.status,200);
  const listed=await call(period);assert.equal(listed.status,200);assert.deepEqual(listed.data.items.map((x:any)=>x.id),[id]);
  assert.equal((await call("/assignments/"+hidden.data.item.id,"PUT",{hours:6})).status,404);
  assert.equal((await call("/assignments/"+hidden.data.item.id,"DELETE")).status,404);
  assert.equal((await call("/assignments/"+foreign.data.item.id,"DELETE",undefined,{"x-role":"ADMIN"})).status,404);
  assert.equal((await call("/assignments/"+id,"PUT",{hours:-2})).status,400);
  assert.equal((await prisma.resourceAssignment.findUnique({where:{id}})).hours,8);
  const edited=await call("/assignments/"+id,"PUT",{hours:"7,5"});assert.equal(edited.status,200);assert.equal(edited.data.item.hours,7.5);
  assert.equal((await call("/assignments/"+id,"PUT",{hours:6,updatedAt:saved.data.item.updatedAt})).status,409);
  const replayBody={...body,date:"2026-11-01",id:"new-00112233-4455-4677-8899-aabbccddeeff"};
  const replays=await Promise.all([call("/assignments","POST",replayBody),call("/assignments","POST",replayBody)]);
  assert.deepEqual(replays.map(r=>r.status),[200,200]);assert.equal(replays[0].data.item.id,replays[1].data.item.id);
  assert.equal(await prisma.resourceAssignment.count({where:{id:"00112233-4455-4677-8899-aabbccddeeff"}}),1);
  assert.equal((await call("/assignments","POST",{...replayBody,hours:4})).status,409);
  const deleted=await call("/assignments/week?from=2026-10-05&to=2026-10-11","DELETE");assert.equal(deleted.status,200);assert.equal(deleted.data.deleted,1);
  assert.ok(await prisma.resourceAssignment.findUnique({where:{id:hidden.data.item.id}}));
  assert.ok(await prisma.resourceAssignment.findUnique({where:{id:foreign.data.item.id}}));
  console.log("PASS POSTGRESQL PLANNING: strict calendar/hours, role/tenant/resource/project scopes, hidden-project updates/deletes rejected, scoped weekly deletion preserves other projects and tenants; stale edits blocked and retried/concurrent creation idempotent.");
 }finally{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
