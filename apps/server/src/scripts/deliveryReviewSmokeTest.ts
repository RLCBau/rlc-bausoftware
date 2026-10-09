
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import http from "node:http";
const url=new URL(process.env.DATABASE_URL!);url.pathname=process.env.RLC_TEST_DATABASE||"/rlc_delivery_validation_20261009";process.env.DATABASE_URL=url.toString();process.env.DEV_AUTH="off";process.env.PROJECTS_ROOT="/tmp/rlc-delivery-test-projects";process.env.COMPANIES_ROOT="/tmp/rlc-delivery-test-companies";
const {prisma}=require("../lib/prisma"),accounting=require("../routes/accountingHub").default,costs=require("../routes/resources.costs").default;
const {deliveryList,deliverySource}=require("../services/deliveryAccounting");
async function main(){
 await prisma.company.createMany({data:[{id:"del-company-a",name:"Delivery A",code:"DEL-A"},{id:"del-company-b",name:"Delivery B",code:"DEL-B"}]});
 await prisma.user.create({data:{id:"del-user",email:"delivery@test.invalid",password:"test",companyId:"del-company-a"}});
 await prisma.project.createMany({data:[{id:"del-project-a",name:"A",code:"DEL-A",companyId:"del-company-a"},{id:"del-hidden",name:"Hidden",code:"DEL-H",companyId:"del-company-a"},{id:"del-project-b",name:"B",code:"DEL-B",companyId:"del-company-b"}]});
 await prisma.projectMember.create({data:{projectId:"del-project-a",userId:"del-user",role:"BAULEITER"}});
 await prisma.companyPurchaseOrder.createMany({data:[{id:"del-order-a",companyId:"del-company-a",projectId:"del-project-a",number:"ORDER-A",supplier:"Supplier A"},{id:"del-order-h",companyId:"del-company-a",projectId:"del-hidden",number:"ORDER-H"},{id:"del-order-b",companyId:"del-company-b",projectId:"del-project-b",number:"ORDER-B"}]});
 await prisma.companyPurchaseOrderLine.create({data:{id:"del-line-a",orderId:"del-order-a",name:"Gravel",unit:"t",qty:20,priceNet:"30"}});
 await prisma.companyMaterial.create({data:{id:"del-material-h",companyId:"del-company-a",projectId:"del-hidden",name:"Hidden"}});
 const filename="Lieferschein_2026-10-01_001.json",filename2="Lieferschein_2026-10-02_002.json";
 const note={date:"2026-10-01",workflowStatus:"FREIGEGEBEN",lieferscheinNummer:"LS-ONE",supplier:"Supplier A",rows:[{material:"Gravel",quantity:"10,5",unit:"t"}]};
 const dir=path.join(process.env.PROJECTS_ROOT!,"del-project-a","lieferscheine");fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,filename),JSON.stringify(note));fs.writeFileSync(path.join(dir,filename2),JSON.stringify({...note,date:"2026-10-02",lieferscheinNummer:"LS-TWO"}));fs.writeFileSync(path.join(dir,"Lieferschein_corrupt.json"),"{broken");
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.auth={sub:"del-user",companyId:req.headers["x-company"]||"del-company-a",companyRole:req.headers["x-role"]||"ADMIN"};next();});app.use("/accounting",accounting);app.use("/costs",costs);
 const server=http.createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const port=(server.address() as any).port;
 async function call(route:string,method="GET",body?:any,headers:any={},project="del-project-a"){
  const request=route+(route.includes("?")?"&":"?")+"projectId="+project;
  const response=await fetch("http://127.0.0.1:"+port+request,{method,headers:{"Content-Type":"application/json",...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json() as any};
 }
 const root="/accounting/delivery-review",leader={"x-role":"BAULEITER"};
 try{
  const list=await call(root);assert.equal(list.status,200,JSON.stringify(list));assert.equal(list.data.items.length,2);assert.equal(list.data.unreadable,1);let first=list.data.items.find((x:any)=>x.filename===filename);assert.equal(first.rows[0].quantity,10.5);assert.equal(list.data.orders.length,1);
  assert.equal((await call(root,"GET",undefined,leader,"del-hidden")).status,403);
  assert.equal((await call(root,"GET",undefined,{"x-role":"MITARBEITER"})).status,403);
  const body={deliveryKey:first.key,sourceHash:first.sourceHash,revision:0,orderId:"del-order-a",orderHash:list.data.orders[0].orderHash,status:"IN_PRUEFUNG",supplierConfirmed:false,quantityConfirmed:false,notes:""};
  assert.equal((await call(root,"PUT",{...body,orderId:"del-order-h"},leader)).status,400);
  assert.equal((await call(root,"PUT",{...body,deliveryKey:"del-project-b:"+filename},leader)).status,400);
  assert.equal((await call(root,"PUT",{...body,deliveryKey:"del-project-a:../../secret"},leader)).status,400);
  assert.equal((await call(root,"PUT",{...body,status:"GEKLAERT"},leader)).status,400);
  assert.equal((await call(root,"PUT",{...body,status:"REKLAMATION"},leader)).status,400);
  assert.equal((await call(root,"PUT",{...body,sourceHash:"bad"},leader)).status,409);
  const races=await Promise.all([call(root,"PUT",body,leader),call(root,"PUT",body,leader)]);assert.deepEqual(races.map(r=>r.status).sort(),[200,409],JSON.stringify(races));let row=races.find(x=>x.status===200)!.data.item;
  assert.equal(row.orderSnapshot.lines[0].qty,20);
  assert.equal((await call("/costs/purchase-orders/del-order-a","DELETE",undefined,leader)).status,409);
  assert.equal((await call("/costs/purchase-orders/del-order-a","PUT",{projectId:"del-hidden"})).status,409);
  assert.equal((await call("/costs/purchase-orders/del-order-h","PUT",{notes:"Hidden"},leader)).status,403);
  assert.equal((await call("/costs/purchase-orders","GET",undefined,leader)).data.items.some((x:any)=>x.id==="del-order-h"),false);
  assert.equal((await call("/costs/purchase-orders","POST",{projectId:"del-hidden"},leader)).status,403);
  assert.equal((await call("/costs/purchase-orders/del-order-a/lines","POST",{qty:-1},leader)).status,400);
  assert.equal((await call("/costs/purchase-orders/del-order-a/lines","POST",{materialId:"del-material-h"},leader)).status,403);
  assert.equal((await call("/costs/purchase-orders/del-order-a","PUT",{deliveryDate:"2026-02-30"},leader)).status,400);
  const confirmed=await call(root,"PUT",{...body,revision:row.revision,status:"GEKLAERT",supplierConfirmed:true,quantityConfirmed:true,notes:"Supplier and quantities checked"},leader);assert.equal(confirmed.status,200,JSON.stringify(confirmed));row=confirmed.data.item;
  assert.equal(row.reviewedBy,"del-user");
  assert.equal((await call(root+"/history?deliveryKey="+encodeURIComponent(first.key))).data.items.length,2);
  assert.equal((await call(root+"/history?deliveryKey="+encodeURIComponent(first.key),"GET",undefined,{"x-company":"del-company-b"},"del-project-b")).status,400);
  await prisma.companyPurchaseOrderLine.update({where:{id:"del-line-a"},data:{qty:21}});
  const changedOrder=await call(root);assert.equal(changedOrder.data.items.find((x:any)=>x.key===first.key).review.orderChanged,true);
  assert.equal((await call(root,"PUT",{...body,revision:row.revision},leader)).status,409);
  fs.writeFileSync(path.join(dir,filename),JSON.stringify({...note,supplier:"Changed"}));
  assert.equal((await call(root)).data.items.find((x:any)=>x.key===first.key).review.sourceChanged,true);
  assert.equal((await call(root,"PUT",{...body,revision:row.revision},leader)).status,409);
  first=(await call(root)).data.items.find((x:any)=>x.filename===filename);
  const corrected=await call(root,"PUT",{...body,revision:row.revision,sourceHash:first.sourceHash,orderId:"",status:"REKLAMATION",notes:"Wrong supplier"},leader);assert.equal(corrected.status,200,JSON.stringify(corrected));assert.equal(corrected.data.item.orderSnapshot,null);
  const billPayload={number:"INVOICE-A",date:"2026-10-01",supplier:"Supplier A",netAmount:100,taxAmount:19,grossAmount:119,deliveryNoteKey:first.key,deliveryNoteFilename:"fake",deliveryNoteNumber:"fake"};
  assert.equal((await call("/accounting/vendor-bills","POST",{...billPayload,deliveryNoteKey:"del-project-b:"+filename})).status,400);
  assert.equal((await call("/accounting/vendor-bills","POST",billPayload,leader)).status,403);
  const bill=await call("/accounting/vendor-bills","POST",billPayload);assert.equal(bill.status,200,JSON.stringify(bill));assert.equal(bill.data.item.data.deliveryNoteNumber,"LS-ONE");assert.equal(bill.data.item.data.deliveryNoteFilename,filename);
  const nextKey="del-project-a:"+filename2;
  const change=await call("/accounting/vendor-bills/"+bill.data.item.id,"PATCH",{deliveryNoteKey:nextKey,deliveryNoteNumber:"tampered"});assert.equal(change.status,200);assert.equal(change.data.item.data.deliveryNoteNumber,"LS-TWO");
  const linked=(await call(root)).data.items.find((x:any)=>x.key===nextKey);assert.equal(linked.invoices[0].id,bill.data.item.id);
  const keep=await call("/accounting/vendor-bills/"+bill.data.item.id,"PATCH",{note:"Updated without changing link"});assert.equal(keep.data.item.data.deliveryNoteKey,nextKey);
  assert.equal((await call("/accounting/vendor-bills/"+bill.data.item.id,"PATCH",{data:{deliveryNoteKey:"del-project-b:"+filename}})).status,400);
  const clear=await call("/accounting/vendor-bills/"+bill.data.item.id,"PATCH",{deliveryNoteKey:""});assert.equal(clear.status,200);assert.equal(clear.data.item.data.deliveryNoteKey,null);assert.equal(clear.data.item.data.deliveryNoteNumber,null);

  const beforeRace=clear.data.item;
  const edits=await Promise.all([
   call("/accounting/vendor-bills/"+beforeRace.id,"PATCH",{editRevision:beforeRace.data.editRevision,deliveryNoteKey:first.key}),
   call("/accounting/vendor-bills/"+beforeRace.id,"PATCH",{editRevision:beforeRace.data.editRevision,deliveryNoteKey:nextKey})
  ]);
  assert.deepEqual(edits.map(x=>x.status).sort(),[200,409],JSON.stringify(edits));
  await prisma.document.create({data:{id:"del-document-a",projectId:"del-project-a",kind:"PDF",name:"Original invoice",meta:{existingTag:"keep"}}});
  const liveBill=await prisma.vendorBill.findUnique({where:{id:beforeRace.id}});
  const attach=await call("/accounting/vendor-bills/"+beforeRace.id,"PATCH",{pdfDocId:"del-document-a",editRevision:liveBill.data.editRevision});assert.equal(attach.status,200);
  const bookings=await Promise.all([call("/accounting/vendor-bills/"+beforeRace.id+"/book","POST",{}),call("/accounting/vendor-bills/"+beforeRace.id+"/book","POST",{})]);
  assert.ok(bookings.every(x=>[200,409].includes(x.status)));assert.ok(bookings.some(x=>x.status===200));
  assert.equal((await prisma.vendorBill.findUnique({where:{id:beforeRace.id}})).status,"booked");
  const doc=await prisma.document.findUnique({where:{id:"del-document-a"}});assert.equal(doc.meta.retentionLocked,true);assert.equal(doc.meta.existingTag,"keep");
  assert.equal((await call("/accounting/vendor-bills/"+beforeRace.id,"PATCH",{deliveryNoteKey:""})).status,400);
  assert.equal(await prisma.auditLog.count({where:{resource:"vendor-bill:"+beforeRace.id,action:"VENDOR_BILL_BOOK"}}),1);
  assert.equal(fs.readFileSync(path.join(dir,filename2),"utf8"),JSON.stringify({...note,date:"2026-10-02",lieferscheinNummer:"LS-TWO"}));
  const p=await prisma.project.findUnique({where:{id:"del-hidden"}}),legacyDir=path.join(process.env.PROJECTS_ROOT!,"DEL-H","lieferscheine");fs.mkdirSync(legacyDir,{recursive:true});fs.writeFileSync(path.join(legacyDir,filename),JSON.stringify(note));
  assert.equal((await deliveryList(p)).items[0].key,"del-hidden:"+filename);
  const canonical=path.join(process.env.PROJECTS_ROOT!,"del-hidden","lieferscheine");fs.cpSync(legacyDir,canonical,{recursive:true});assert.equal((await deliveryList(p)).items[0].key,"del-hidden:"+filename);
  await assert.rejects(deliverySource(p,"del-hidden:../../secret"));
  await prisma.companyPurchaseOrder.create({data:{id:"del-order-legacy",companyId:"del-company-a",projectId:"DEL-A",number:"LEGACY"}});
  assert.equal((await call(root)).data.orders.some((x:any)=>x.id==="del-order-legacy"),true);
  assert.equal((await call("/costs/purchase-orders","GET",undefined,leader)).data.items.some((x:any)=>x.id==="del-order-legacy"),true);
  assert.equal(await prisma.ledgerEntry.count(),0);assert.equal(await prisma.companyMaterialMove.count(),0);
  console.log("PASS POSTGRESQL DELIVERY: tenant/project/roles, canonical file/hash/path validation, corrupt-source handling, simultaneous revisions/audit, checked statuses/order snapshots, protected linked orders, scoped orders/materials, invoice POST/PATCH/clear links, source preservation and no cost/stock booking.");
 }finally{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
