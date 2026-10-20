'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),express=require('express');
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
(async()=>{
 const project=await db.project.findFirst({where:{code:'BA-2026-028'},select:{id:true,code:true,companyId:true}});assert(project);
 const roots=[project.id,project.code],base='/app/data/projects';
 const samples=roots.map(root=>{const dir=path.join(base,root);const queue=[dir];while(queue.length){const cur=queue.shift();if(!fs.existsSync(cur))continue;for(const e of fs.readdirSync(cur,{withFileTypes:true})){const p=path.join(cur,e.name);if(e.isDirectory()){if(p.split(path.sep).length-dir.split(path.sep).length<5)queue.push(p)}else if(e.name.toLowerCase().endsWith('.pdf'))return path.relative(dir,p).replaceAll(path.sep,'/')}}return null});
 assert(samples.every(Boolean),'Missing PDFs in UUID or legacy root');
 const app=express();app.use((req,res,next)=>{if(req.headers['x-test-user']==='absent')return res.status(401).end();req.auth={sub:'INTEGRATION_USER',role:'ADMIN',companyRole:'ADMIN',companyId:project.companyId};next()});
 const files=require('../routes/filesStatic.ts').default;app.use('/files',files);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});const host='http://127.0.0.1:'+server.address().port;
 try{for(const rel of samples){const url=host+'/files/'+project.id+'/'+rel.split('/').map(encodeURIComponent).join('/');const r=await fetch(url);assert.equal(r.status,200,rel+': '+r.status);const b=Buffer.from(await r.arrayBuffer());assert.equal(b.subarray(0,5).toString(),'%PDF-',rel+' invalid header');const wrong=await fetch(host+'/files/not-a-real-project/'+rel);assert.equal(wrong.status,403);console.log('PASS PDF',rel,'bytes='+b.length)}const noauth=await fetch(host+'/files/'+project.id+'/'+samples[0],{headers:{'x-test-user':'absent'}});assert.equal(noauth.status,401);console.log('PASS PDF authorization (401 unauthenticated / 403 foreign project)')}
 finally{await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
