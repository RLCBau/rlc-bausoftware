import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { input, transition, expiryStatus, InputError } from "../domain/officeAddons";

const guarantee = {title:"Vertragserfüllung", number:"G-001", issuer:"Bank", amount:"1250,50", type:"Vertragserfüllung",status:"Entwurf",validFrom:"2026-10-01",validUntil:"2027-10-01",contractId:"c1",documentId:"d1",notes:""};
assert.equal((input("guarantees",guarantee) as any).amount,"1250.50");
for (const amount of ["-1","NaN","1e9","1.001","1234567890123", "", null]) assert.throws(()=>input("guarantees",{...guarantee,amount}),InputError);
for (const date of ["2026-02-30","2026-13-01","2026-01-01T12:00:00Z"]) assert.throws(()=>input("guarantees",{...guarantee,validUntil:date}),InputError);
assert.throws(()=>input("guarantees",{...guarantee,validUntil:"2025-10-01"}),InputError);
assert.throws(()=>input("guarantees",{...guarantee,status:"anything"}),InputError);
assert.throws(()=>transition("guarantees","Aktiv","Zurückgegeben"),InputError);
transition("guarantees","Aktiv","Freigabe beantragt");
transition("guarantees","Freigabe beantragt","Zurückgegeben");
assert.throws(()=>transition("guarantees","Archiviert","Aktiv"),InputError);
assert.equal(expiryStatus("2026-10-08",new Date("2026-10-08T20:00:00Z")),"Fällig in 30 Tagen");
assert.equal(expiryStatus("2026-10-07",new Date("2026-10-08T20:00:00Z")),"Abgelaufen");
assert.equal(expiryStatus("2026-11-08",new Date("2026-10-08T20:00:00Z")),"Gültig");
assert.throws(()=>input("certificates",{title:"Nachweis",type:"Versicherung",status:"Ungeprüft"}),InputError);

const db:any={guarantees:[],certificates:[],audit:[]};
let serial=0, loseRace=false;
function delegate(key:string) {
  return {
    findMany:async({where}:any)=>db[key].filter((x:any)=>Object.entries(where).every(([k,v])=>x[k]===v)).map((x:any)=>({...x})),
    findFirst:async({where}:any)=>db[key].find((x:any)=>Object.entries(where).every(([k,v])=>x[k]===v)) || null,
    findUnique:async({where}:any)=>db[key].find((x:any)=>x.id===where.id) || null,
    create:async({data}:any)=>{const row={...data,id:"row-"+(++serial),revision:1,createdAt:new Date(),updatedAt:new Date()}; db[key].push(row);return row;},
    updateMany:async({where,data}:any)=>{
      if(loseRace) {loseRace=false;return {count:0};}
      const row=db[key].find((x:any)=>Object.entries(where).every(([k,v])=>x[k]===v));
      if(!row)return {count:0};
      Object.assign(row,{...data,revision:row.revision+1,updatedAt:new Date()});return {count:1};
    }
  };
}
const fake:any={
  project: {findFirst:async({where}:any)=>{
    if(where.companyId!=="tenant-a")return null;
    if(where.OR && !where.OR.some((v:any)=>v.id==="p1" || v.code==="BA-001"))return null;
    if(where.projectMembers && where.projectMembers.some.userId!=="member-a")return null;
    return {id:"p1",code:"BA-001",name:"Test"};
  }},
  contract:{findFirst:async({where}:any)=>where.id==="c1" && where.companyId==="tenant-a" && where.projectId==="p1" ? {id:"c1",contractType:"Nachunternehmervertrag"} : null,findMany:async()=>[]},
  document:{findFirst:async({where}:any)=>where.id==="d1" && where.projectId==="p1" && where.project.companyId==="tenant-a" ? {id:"d1"} : null,findMany:async()=>[]},
  auditLog:{create:async({data}:any)=>{db.audit.push(data);return data;},findMany:async({where}:any)=>db.audit.filter((x:any)=>x.companyId===where.companyId && x.resource===where.resource)},
  projectGuarantee:delegate("guarantees"),contractCertificate:delegate("certificates"),
};
fake.$transaction=async(fn:any)=>fn(fake);
const prismaPath=require.resolve("../lib/prisma");
require.cache[prismaPath]={id:prismaPath,filename:prismaPath,loaded:true,exports:{prisma:fake}} as any;
const router=require("../routes/officeAddons").default;
const app=express();app.use(express.json());
app.use((req:any,_res,next)=>{req.auth={companyId:req.headers["x-company"] || "tenant-a",sub:req.headers["x-user"] || "member-a",companyRole:req.headers["x-role"] || "BAULEITER"};next();});
app.use("/api/office-addons",router);
async function main(){
 const server=http.createServer(app);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const port=(server.address() as any).port;
 async function call(path:string,method="GET",body?:any,headers:any={}) {
   const response=await fetch("http://127.0.0.1:"+port+"/api/office-addons"+path,{method,headers:{"Content-Type":"application/json",...headers},...(body?{body:JSON.stringify(body)}:{})});
   const raw=await response.text(); let data:any={}; try {data=JSON.parse(raw);} catch {} return {status:response.status,data};
 }
 try {
   assert.equal((await call("/guarantees?projectId=p1","GET",undefined,{"x-role":"MITARBEITER"})).status,403);
   assert.equal((await call("/guarantees?projectId=p1","GET",undefined,{"x-company":"tenant-b"})).status,404);
   assert.equal((await call("/guarantees?projectId=p1","GET",undefined,{"x-user":"non-member"})).status,404);
   assert.equal((await call("/guarantees","POST",{...guarantee,projectId:"p1",contractId:"foreign-contract"})).status,400);
   assert.equal((await call("/guarantees","POST",{...guarantee,projectId:"p1",documentId:"foreign-document"})).status,400);
   assert.equal((await call("/guarantees","POST",{...guarantee,projectId:"p1",status:"Aktiv"})).status,400);
   const created=await call("/guarantees","POST",{...guarantee,projectId:"p1"});assert.equal(created.status,201);
   const id=created.data.item.id;
   assert.equal(db.audit.length,1);assert.ok(db.audit[0].meta.after);
   assert.equal((await call("/guarantees/"+id,"PUT",{...guarantee,revision:0,status:"Aktiv"})).status,409);
   assert.equal((await call("/guarantees/"+id,"PUT",{...guarantee,revision:1,status:"Aktiv"})).status,200);
   loseRace=true;
   assert.equal((await call("/guarantees/"+id,"PUT",{...guarantee,revision:2,status:"Freigabe beantragt"})).status,409);
   assert.equal(db.audit.length,2);
   assert.equal((await call("/guarantees/"+id,"PUT",{...guarantee,revision:2,status:"Freigabe beantragt"})).status,200);
   assert.equal((await call("/guarantees/"+id,"PUT",{...guarantee,revision:3,status:"Zurückgegeben"})).status,200);
   assert.equal((await call("/guarantees/"+id,"PUT",{...guarantee,title:"changed",revision:4,status:"Archiviert"})).status,400);
   assert.equal((await call("/guarantees/"+id,"GET",undefined,{"x-company":"tenant-b"})).status,404);
   assert.equal((await call("/guarantees/"+id+"/history")).data.items.length,4);
   assert.equal((await call("/guarantees/"+id+"/history","GET",undefined,{"x-user":"non-member"})).status,404);
   const cert={title:"Versicherungsnachweis",issuer:"Versicherung",type:"Versicherung",status:"Ungeprüft",contractId:"c1",documentId:"d1",projectId:"p1",validFrom:"2026-10-01",validUntil:"2027-10-01",notes:""};
   const c=await call("/certificates","POST",cert);assert.equal(c.status,201);
   const checked=await call("/certificates/"+c.data.item.id,"PUT",{...cert,revision:1,status:"Geprüft"});assert.equal(checked.status,200);assert.equal(checked.data.item.reviewedBy,"member-a");
   assert.ok(checked.data.item.reviewedAt);
   assert.equal((await call("/certificates/"+c.data.item.id,"PUT",{...cert,revision:2,status:"Archiviert"})).status,200);
   assert.equal((await call("/certificates/"+c.data.item.id,"PUT",{...cert,revision:3,status:"Ungeprüft"})).status,400);
   console.log("PASS: validation, expiry, tenant/project/role access, foreign links, revisions, simulated concurrent updates, lifecycle locks, audit history, manual certificate review.");
 } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
