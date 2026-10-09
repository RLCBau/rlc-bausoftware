import assert from 'node:assert/strict';import express from 'express';import http from 'node:http';
const url=new URL(process.env.DATABASE_URL!);url.pathname='/rlc_cost_center_validation_20261009';process.env.DATABASE_URL=url.toString();process.env.DEV_AUTH='off';
const {prisma}=require('../lib/prisma'),router=require('../routes/costCenters').default;
async function main(){
 await prisma.company.createMany({data:[{id:'cc-a',name:'Fiktiv A',code:'CC-A'},{id:'cc-b',name:'Fiktiv B',code:'CC-B'}]});
 await prisma.user.create({data:{id:'cc-user',email:'cost-center@test.invalid',password:'test',companyId:'cc-a'}});
 await prisma.project.createMany({data:[{id:'cc-pa',name:'A',code:'CC-PA',companyId:'cc-a'},{id:'cc-hidden',name:'Hidden',code:'CC-HIDDEN',companyId:'cc-a'},{id:'cc-pb',name:'B',code:'CC-PB',companyId:'cc-b'}]});await prisma.projectMember.create({data:{projectId:'cc-pa',userId:'cc-user',role:'BAULEITER'}});
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.auth={sub:req.headers['x-no-user']?'':'cc-user',companyId:req.headers['x-company']||'cc-a',companyRole:req.headers['x-role']||'BAULEITER'};next();});app.use('/cc',router);const server=http.createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 async function call(path='',method='GET',body:any=undefined,headers:any={}){const res=await fetch('http://127.0.0.1:'+(server.address() as any).port+'/cc'+path,{method,headers:{'Content-Type':'application/json',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json() as any};}
 const base={projectId:'CC-PA',code:'KS-01',description:'Earthwork',mainArea:'Tiefbau',budget:'123.45'};
 try{
  assert.equal((await call('?projectId=cc-pa','GET',undefined,{'x-no-user':'1'})).status,403);
  assert.equal((await call('?projectId=cc-hidden')).status,403);assert.equal((await call('?projectId=cc-pb')).status,403);
  for(const role of ['MITARBEITER','KALKULATOR','CAPOCANTIERE'])assert.equal((await call('','POST',base,{'x-role':role})).status,403);
  for(const budget of [null,true,-1,'1.001','1e3','1000000000000','',{},'NaN'])assert.equal((await call('','POST',{...base,budget})).status,400);
  assert.equal((await call('','POST',{...base,description:' '})).status,400);assert.equal((await call('','POST',{...base,code:'a'.repeat(101)})).status,400);
  const made=await call('','POST',base);assert.equal(made.status,201);let row=made.data.item;assert.equal(row.budgetText,'123.45');assert.equal(await prisma.auditLog.count(),1);
  assert.equal((await call('','POST',{...base,budget:'999'})).status,409);assert.equal(String((await prisma.projectCostCenter.findUnique({where:{id:row.id}})).budget),'123.45');assert.equal(await prisma.auditLog.count(),1);
  const simultaneous=await Promise.all([call('/'+row.id,'PUT',{budget:'200.01',expectedUpdatedAt:row.updatedAt}),call('/'+row.id,'PUT',{budget:'300.02',expectedUpdatedAt:row.updatedAt})]);assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,409]);row=simultaneous.find(r=>r.status===200)!.data.item;assert.equal(await prisma.auditLog.count(),2);
  assert.equal((await call('/'+row.id,'PUT',{code:'CHANGED',expectedUpdatedAt:row.updatedAt})).status,400);assert.equal((await call('/'+row.id,'PUT',{projectId:'cc-hidden',budget:999})).status,409);
  const foreign=await prisma.projectCostCenter.create({data:{id:'cc-foreign',companyId:'cc-b',projectId:'cc-pb',code:'FOREIGN',description:'Foreign',mainArea:'Other',budget:999}});
  assert.equal((await call('/'+foreign.id+'/history')).status,404);assert.equal((await call('/'+foreign.id,'DELETE',{})).status,404);
  const archived=await call('/'+row.id,'DELETE',{expectedUpdatedAt:row.updatedAt});assert.equal(archived.status,200);assert.equal((await call('?projectId=CC-PA')).data.items.length,0);const all=await call('?projectId=CC-PA&includeInactive=true');assert.equal(all.data.items.length,1);assert.equal(all.data.items[0].active,false);
  assert.equal((await call('','POST',base)).status,409);assert.equal((await call('/'+row.id,'PUT',{active:true,expectedUpdatedAt:row.updatedAt})).status,409);
  row=archived.data.item;const restored=await call('/'+row.id,'PUT',{active:true,expectedUpdatedAt:row.updatedAt});assert.equal(restored.status,200);row=restored.data.item;assert.equal(row.active,true);
  const h=await call('/'+row.id+'/history');assert.equal(h.status,200);assert.equal(h.data.items.length,4);assert.ok(h.data.items.every((x:any)=>x.meta.kind==='PROJECT_COST_CENTER'&&x.meta.projectId==='cc-pa'));assert.ok(h.data.items.some((x:any)=>x.action==='COST_CENTER_RESTORE'));
  const creates=await Promise.all([call('','POST',{...base,code:'PARALLEL'}),call('','POST',{...base,code:'PARALLEL'})]);assert.deepEqual(creates.map(r=>r.status).sort(),[201,409]);assert.equal(await prisma.projectCostCenter.count({where:{code:'PARALLEL'}}),1);
  assert.equal((await call('?projectId=cc-hidden','GET',undefined,{'x-role':'ADMIN'})).status,200);
  const before=await prisma.projectCostCenter.findUnique({where:{id:row.id}});const audits=await prisma.auditLog.count();
  await prisma.$executeRawUnsafe('ALTER TABLE "AuditLog" RENAME TO "_CostCenterAuditUnavailable"');try{assert.equal((await call('/'+row.id,'PUT',{budget:'999.99',expectedUpdatedAt:row.updatedAt})).status,500);}finally{await prisma.$executeRawUnsafe('ALTER TABLE "_CostCenterAuditUnavailable" RENAME TO "AuditLog"');}
  const after=await prisma.projectCostCenter.findUnique({where:{id:row.id}});assert.equal(String(after.budget),String(before.budget));assert.equal(after.updatedAt.toISOString(),before.updatedAt.toISOString());assert.equal(await prisma.auditLog.count(),audits);
  assert.equal(await prisma.ledgerEntry.count(),0);assert.equal(await prisma.accountingRoot.count(),0);
  console.log('PASS cost centers PostgreSQL: tenant/project/roles, exact budget and invalid inputs, duplicate create protection, simultaneous revisions/create, immutable code/project, archive/restore/history, atomic audit rollback, no accounting writes.');
 }finally{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
