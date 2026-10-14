import assert from 'node:assert/strict';
import express from 'express';import http from 'node:http';
const url=new URL(process.env.DATABASE_URL!);url.pathname='/rlc_verw_contract_20261012';process.env.DATABASE_URL=url.toString();
const {prisma}=require('../lib/prisma'),router=require('../routes/contracts').default;
async function main(){
await prisma.company.createMany({data:[{id:'ct-a',code:'CT-A',name:'Firma A'},{id:'ct-b',code:'CT-B',name:'Firma B'}]});
await prisma.user.createMany({data:[{id:'ct-user',companyId:'ct-a',email:'contract-a@test.invalid',password:'x'},{id:'ct-b-user',companyId:'ct-b',email:'contract-b@test.invalid',password:'x'}]});
await prisma.project.createMany({data:[{id:'ct-p',companyId:'ct-a',code:'CT-P',name:'Project A'},{id:'ct-q',companyId:'ct-b',code:'CT-Q',name:'Project B'}]});
await prisma.projectMember.create({data:{projectId:'ct-p',userId:'ct-user',role:'BAULEITER'}});
const doc=await prisma.document.create({data:{id:'ct-doc',projectId:'ct-p',name:'Contract.pdf',kind:'PDF'}});
const foreignDoc=await prisma.document.create({data:{id:'ct-doc-b',projectId:'ct-q',name:'Foreign.pdf',kind:'PDF'}});
const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.auth={sub:req.headers['x-user']||'ct-user',companyId:req.headers['x-company']||'ct-a',companyRole:req.headers['x-role']||'BAULEITER'};next()});app.use('/contracts',router);
const server=http.createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
async function call(p:string,method='GET',body?:any,h:any={}){const res=await fetch('http://127.0.0.1:'+(server.address() as any).port+'/contracts'+p,{method,headers:{'Content-Type':'application/json',...h},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json() as any}}
try{
assert.equal((await call('/?projectId=ct-p','GET',undefined,{'x-company':'ct-b','x-user':'ct-b-user'})).status,404);
const made=await call('/','POST',{projectId:'ct-p',title:'Test Contract',status:'Entwurf'});assert.equal(made.status,200,JSON.stringify(made.data));const id=made.data.item.id;
assert.equal((await call('/'+id+'/document','POST',{documentId:'ct-doc-b'})).status,404);
assert.equal((await call('/'+id+'/document','POST',{documentId:'ct-doc'})).status,200);
assert.equal((await call('/'+id,'PUT',{status:'Aktiv'})).status,200);
assert.equal((await call('/'+id,'PUT',{title:'Changed'})).status,409);
assert.equal((await call('/'+id+'/document','POST',{documentId:'ct-doc-b'})).status,409);
assert.equal((await call('/'+id,'DELETE')).status,409);
assert.equal((await call('/'+id,'PUT',{title:'Foreign'},{'x-company':'ct-b','x-user':'ct-b-user'})).status,404);
const made2=await call('/','POST',{projectId:'ct-p',title:'Active without document',status:'Aktiv'});assert.equal(made2.status,200);
const late=await call('/'+made2.data.item.id+'/document','POST',{documentId:'ct-doc'});
assert.equal(late.status,409);
console.log('PASS contract smoke: scope, document link, foreign denial, active locks, cross-tenant, late attachment status');
}finally{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();}
}main().catch(e=>{console.error(e);process.exitCode=1});
