
import assert from "node:assert/strict";
import fs from "node:fs";import path from "node:path";import express from "express";import http from "node:http";
import {deliveryQuantity,quantityText,allocationInput,reconciliation,deliveryUnit} from "../domain/deliveryReconciliation";
assert.equal(quantityText(deliveryQuantity("0.1")+deliveryQuantity("0,2")),"0.3");assert.equal(deliveryUnit("Stk."),"stk");assert.equal(deliveryUnit("cbm"),"m³");
for(const v of [-1,"NaN","1e2",true,"1.0000001",null])assert.throws(()=>deliveryQuantity(v));
const url=new URL(process.env.DATABASE_URL!);url.pathname="/rlc_partial_validation_20261009";process.env.DATABASE_URL=url.toString();process.env.DEV_AUTH="off";process.env.PROJECTS_ROOT="/tmp/rlc-partial-test-projects";process.env.COMPANIES_ROOT="/tmp/rlc-partial-test-companies";
const {prisma}=require("../lib/prisma"),router=require("../routes/accountingHub").default;
async function main(){
 await prisma.company.createMany({data:[{id:"partial-company-a",name:"Partial A",code:"PARTIAL-A"},{id:"partial-company-b",name:"Partial B",code:"PARTIAL-B"}]});
 await prisma.user.create({data:{id:"partial-user",email:"partial@test.invalid",password:"test",companyId:"partial-company-a"}});
 await prisma.project.createMany({data:[{id:"partial-project-a",name:"A",code:"PARTIAL-A",companyId:"partial-company-a"},{id:"partial-project-b",name:"B",code:"PARTIAL-B",companyId:"partial-company-b"}]});
 await prisma.projectMember.create({data:{projectId:"partial-project-a",userId:"partial-user",role:"BAULEITER"}});
 await prisma.companyPurchaseOrder.createMany({data:[{id:"partial-order-a",companyId:"partial-company-a",projectId:"partial-project-a",number:"PARTIAL-ORDER-A",supplier:"Supplier A",status:"BESTELLT"},{id:"partial-order-b",companyId:"partial-company-b",projectId:"partial-project-b",number:"PARTIAL-ORDER-B"}]});
 await prisma.companyPurchaseOrderLine.createMany({data:[{id:"partial-line-a",orderId:"partial-order-a",name:"Concrete",unit:"m³",qty:0.3},{id:"partial-line-b",orderId:"partial-order-b",name:"Foreign",unit:"m³",qty:5}]});
 const dir=path.join(process.env.PROJECTS_ROOT!,"partial-project-a","lieferscheine");fs.mkdirSync(dir,{recursive:true});
 const filename=(n:number)=>"Lieferschein_2026-10-01_"+String(n).padStart(3,"0")+".json";
 const source=(n:number,qty:any,extra:any={})=>({date:"2026-10-01",lieferscheinNummer:"PARTIAL-"+n,supplier:"Supplier A",workflowStatus:"FREIGEGEBEN",rows:[{material:"Concrete",quantity:qty,unit:"cbm"}],...extra});
 fs.writeFileSync(path.join(dir,filename(1)),JSON.stringify(source(1,"0.1")));fs.writeFileSync(path.join(dir,filename(2)),JSON.stringify(source(2,"0.2")));
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.auth={sub:"partial-user",companyId:req.headers["x-company"]||"partial-company-a",companyRole:req.headers["x-role"]||"BAULEITER"};next();});app.use("/accounting",router);
 const server=http.createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const port=(server.address() as any).port;
 async function call(route="",method="GET",body?:any,headers:any={},project="partial-project-a"){
  const response=await fetch("http://127.0.0.1:"+port+"/accounting/delivery-review"+route+(route.includes("?")?"&":"?")+"projectId="+project,{method,headers:{"Content-Type":"application/json",...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json() as any};
 }
 async function info(){const r=await call();assert.equal(r.status,200,JSON.stringify(r));return r.data;}
 function body(data:any,n:number,changes:any={}){
  const note=data.items.find((x:any)=>x.filename===filename(n)),order=data.orders.find((x:any)=>x.id==="partial-order-a");
  return {deliveryKey:note.key,sourceHash:note.sourceHash,revision:note.review?.revision||0,orderId:order.id,orderHash:order.orderHash,status:"GEKLAERT",supplierConfirmed:true,quantityConfirmed:true,notes:"Mapped and checked",allocations:[{position:1,orderLineId:"partial-line-a",quantity:"999"}],...changes};
 }
 const rec=(data:any)=>data.orders.find((x:any)=>x.id==="partial-order-a").reconciliation;
 try{
  let data=await info();assert.equal(rec(data).status,"OFFEN");
  assert.equal((await call("","PUT",body(data,1,{allocations:[{position:1,orderLineId:"partial-line-b"}]}))).status,400);
  assert.equal((await call("","PUT",body(data,1,{allocations:[{position:1,orderLineId:"partial-line-a"},{position:1,orderLineId:"partial-line-a"}]}))).status,400);
  assert.equal((await call("","PUT",body(data,1,{allocations:[{position:99,orderLineId:"partial-line-a"}]}))).status,400);
  const first=await call("","PUT",body(data,1));assert.equal(first.status,200,JSON.stringify(first));assert.equal(first.data.item.allocations[0].quantity,"0.1");
  data=await info();assert.equal(rec(data).status,"TEILGELIEFERT");assert.equal(rec(data).lines[0].delivered,"0.1");assert.equal(rec(data).lines[0].remaining,"0.2");
  const second=await call("","PUT",body(data,2));assert.equal(second.status,200);data=await info();assert.equal(rec(data).status,"VOLLSTAENDIG");assert.equal(rec(data).lines[0].delivered,"0.3");assert.equal(rec(data).lines[0].remaining,"0");assert.equal(rec(data).included,2);
  assert.equal((await prisma.companyPurchaseOrder.findUnique({where:{id:"partial-order-a"}})).status,"BESTELLT");
  fs.writeFileSync(path.join(dir,filename(3)),JSON.stringify(source(3,"0.05")));data=await info();assert.equal((await call("","PUT",body(data,3))).status,200);data=await info();assert.equal(rec(data).status,"MEHRGELIEFERT");assert.equal(rec(data).lines[0].excess,"0.05");
  const stale=body(data,1);fs.writeFileSync(path.join(dir,filename(1)),JSON.stringify(source(1,"0.15")));assert.equal((await call("","PUT",stale)).status,409);
  data=await info();assert.equal(rec(data).included,2);assert.equal(rec(data).lines[0].delivered,"0.25");assert.equal(rec(data).excluded[0].reason,"Quelle geändert");
  const corrected=await call("","PUT",body(data,1));assert.equal(corrected.status,200);data=await info();assert.equal(rec(data).lines[0].delivered,"0.4");
  const saved=data.items.find((x:any)=>x.filename===filename(1));
  assert.equal((await call("","PUT",body(data,1,{allocations:undefined,notes:"Keep allocation"}))).status,200);assert.equal((await info()).items.find((x:any)=>x.filename===filename(1)).review.allocations.length,1);
  await prisma.companyPurchaseOrderLine.update({where:{id:"partial-line-a"},data:{qty:0.4}});
  data=await info();assert.equal(rec(data).included,0);assert.equal(rec(data).excluded.length,3);assert.equal(rec(data).lines[0].delivered,"0");
  const simultaneous=await Promise.all([call("","PUT",body(data,1)),call("","PUT",body(data,2)),call("","PUT",body(data,3))]);assert.ok(simultaneous.every(x=>x.status===200),JSON.stringify(simultaneous));data=await info();assert.equal(rec(data).status,"VOLLSTAENDIG");
  fs.writeFileSync(path.join(dir,filename(4)),JSON.stringify(source(4,1,{rows:[{material:"Concrete",quantity:1,unit:"kg"}]})));data=await info();assert.equal((await call("","PUT",body(data,4))).status,400);
  fs.writeFileSync(path.join(dir,filename(5)),JSON.stringify(source(5,-1)));data=await info();assert.equal((await call("","PUT",body(data,5))).status,400);
  fs.writeFileSync(path.join(dir,filename(6)),JSON.stringify(source(6,1,{rows:[{material:"Concrete",quantity:1,unit:"cbm"},{material:"Extra",quantity:2,unit:"cbm"}]})));data=await info();assert.equal((await call("","PUT",body(data,6))).status,200);data=await info();assert.equal(rec(data).excluded.some((x:any)=>x.reason==="Positionen unvollständig zugeordnet"),true);
  const before=rec(data).lines[0].delivered;assert.equal(before,"0.4");
  fs.writeFileSync(path.join(dir,filename(7)),JSON.stringify(source(7,"0.1",{sourceDocId:"duplicate-source"})));fs.writeFileSync(path.join(dir,filename(8)),JSON.stringify(source(8,"0.1",{sourceDocId:"duplicate-source"})));
  data=await info();assert.equal((await call("","PUT",body(data,7))).status,200);assert.equal((await call("","PUT",body(data,8))).status,200);data=await info();
  assert.equal(rec(data).lines[0].delivered,"0.4");assert.equal(rec(data).excluded.filter((x:any)=>x.reason==="Möglicher doppelter Lieferschein").length,2);
  assert.equal((await call("/history?deliveryKey="+encodeURIComponent(saved.key),"GET",undefined,{"x-company":"partial-company-b","x-role":"ADMIN"},"partial-project-b")).status,400);
  assert.equal((await call("","PUT",body(data,1),{"x-role":"MITARBEITER"})).status,403);
  const race=await Promise.all([call("","PUT",body(data,1,{notes:"A"})),call("","PUT",body(data,1,{notes:"B"}))]);assert.deepEqual(race.map(x=>x.status).sort(),[200,409]);
  assert.equal(await prisma.companyMaterialMove.count(),0);assert.equal(await prisma.ledgerEntry.count(),0);
  assert.equal((await prisma.auditLog.findFirst({where:{resource:"delivery-review:"+saved.review.id},orderBy:{createdAt:"desc"}})).meta.after.allocations[0].quantity,"0.15");
  console.log("PASS POSTGRESQL PARTIAL DELIVERIES: exact decimal totals/residual/excess, source-derived quantities, no duplicate row/foreign line/unit conversion/negative mapping, partial and multiple deliveries, stale source/order exclusion, incomplete and duplicate source exclusion, simultaneous saves, tenant/project/roles, preserved orders/stock/costs and allocation audit.");
 }finally{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
