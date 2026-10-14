import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const u = new URL(process.env.DATABASE_URL!); u.pathname = "/rlc_dms_isolated_20261012"; process.env.DATABASE_URL = u.toString();
process.env.STORAGE_PROVIDER = "local"; const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"rlc-dms-test-")); process.env.STORAGE_LOCAL_ROOT=tmp;
const {prisma}=require("../lib/prisma"); const router=require("../routes/files").default;
async function main(){
 await prisma.company.createMany({data:[{id:"dms-test-co-a",name:"Test Firma A",code:"DMS-TEST-A"},{id:"dms-test-co-b",name:"Test Firma B",code:"DMS-TEST-B"}]});
 await prisma.user.createMany({data:[{id:"dms-test-user-a",email:"dms-user-a@test.invalid",companyId:"dms-test-co-a",password:"x"},{id:"dms-test-user-b",email:"dms-user-b@test.invalid",companyId:"dms-test-co-b",password:"x"},{id:"dms-test-outsider",email:"dms-outsider@test.invalid",companyId:"dms-test-co-a",password:"x"}]});
 await prisma.project.createMany({data:[{id:"dms-test-project-a",companyId:"dms-test-co-a",name:"Test Project A",code:"DMS-TEST-PA"},{id:"dms-test-project-b",companyId:"dms-test-co-b",name:"Test Project B",code:"DMS-TEST-PB"}]});
 await prisma.projectMember.createMany({data:[{projectId:"dms-test-project-a",userId:"dms-test-user-a",role:"BAULEITER"},{projectId:"dms-test-project-b",userId:"dms-test-user-b",role:"BAULEITER"}]});
 const app=express();app.use(express.json());app.use((req:any,_res:any,next:any)=>{req.auth={sub:req.headers["x-user"]||"dms-test-user-a",companyId:req.headers["x-company"]||"dms-test-co-a",companyRole:"BAULEITER"};next()});app.use("/files",router);
 const server=http.createServer(app); await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const url="http://127.0.0.1:"+(server.address() as any).port+"/files";
 async function req(p:string,method="GET",body?:any,headers:any={}){const res=await fetch(url+p,{method,headers:{"Content-Type":"application/json",...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json() as any}}
 const alien={"x-user":"dms-test-user-b","x-company":"dms-test-co-b"};
 try{
 assert.equal((await req("/init","POST",{projectId:"dms-test-project-a",kind:"OTHER",name:"unsafe.html"})).status,415);
 const init=await req("/init","POST",{projectId:"dms-test-project-a",kind:"OTHER",name:"smoke.txt"});assert.equal(init.status,200,JSON.stringify(init.data));const id=init.data.documentId;
 assert.equal((await req("/project/dms-test-project-a/list")).status,200);
 assert.equal((await req("/project/dms-test-project-a/list","GET",undefined,alien)).status,403);
 assert.equal((await req("/project/dms-test-project-a/list","GET",undefined,{"x-user":"dms-test-outsider"})).status,403);
 assert.equal((await req("/document/"+id+"/versions","GET",undefined,alien)).status,403);
 const form=new FormData();form.append("documentId",id);form.append("file",new Blob(["RLC DMS SMOKE 20261012"],{type:"text/plain"}),"smoke.txt");
 const up=await fetch(url+"/upload-direct",{method:"POST",body:form});const response=await up.json();assert.equal(up.status,200,JSON.stringify(response));
 const history=await req("/document/"+id+"/versions");assert.equal(history.status,200);assert.equal(history.data.versions.length,1);assert.equal(history.data.versions[0].exists,true);
 const version=history.data.versions[0].id;
 assert.equal((await req("/download/"+version,"GET",undefined,alien)).status,403);
 const dl=await fetch(url+"/download/"+version);assert.equal(dl.status,200);assert.equal(await dl.text(),"RLC DMS SMOKE 20261012");
 console.log("PASS DMS isolated: upload, persistence, versions, binary download, tenant and member isolation, forbidden extension");
 }finally{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();fs.rmSync(tmp,{recursive:true,force:true})}
}main().catch(e=>{console.error(e);process.exitCode=1});
