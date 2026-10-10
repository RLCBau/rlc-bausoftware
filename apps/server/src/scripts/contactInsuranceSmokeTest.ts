import assert from 'node:assert/strict';import express from 'express';import http from 'http';
const url=new URL(process.env.DATABASE_URL!);url.pathname='/rlc_insurance_validation_20261010';process.env.DATABASE_URL=url.toString();process.env.DEV_AUTH='off';
const {prisma}=require('../lib/prisma'),router=require('../routes/businessContacts').default,{insuranceInput}=require('../domain/contactInsurance');
async function main(){
 await prisma.company.createMany({data:[{id:'in-a',code:'IN-A',name:'Fiktive Firma A'},{id:'in-b',code:'IN-B',name:'Fiktive Firma B'}]});
 await prisma.user.create({data:{id:'in-user',companyId:'in-a',email:'insurance@test.invalid',password:'test'}});
 await prisma.party.createMany({data:[{id:'in-party',companyId:'in-a',type:'SUPPLIER',name:'Fiktiver Lieferant'},{id:'in-other',companyId:'in-a',type:'CUSTOMER',name:'Fiktiver Kunde'},{id:'in-foreign',companyId:'in-b',type:'SUPPLIER',name:'Fremder Lieferant'},{id:'in-archived',companyId:'in-a',type:'PARTNER',name:'Archivierter Partner'}]});
 await prisma.partyContactProfile.create({data:{partyId:'in-archived',archived:true}});
 const original=JSON.stringify(await prisma.party.findMany({orderBy:{id:'asc'}}));
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.auth={sub:req.headers['x-no-user']?'':'in-user',companyId:req.headers['x-company']||'in-a',companyRole:req.headers['x-role']||'ADMIN'};next();});app.use('/contacts',router);const server=http.createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 async function call(path:string,body:any=undefined,method='GET',headers:any={}){const res=await fetch('http://127.0.0.1:'+(server.address() as any).port+'/contacts'+path,{method,headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,data:await res.json() as any,headers:res.headers};}
 const b={title:'Fiktive Haftpflicht',insurer:'Fiktiver Versicherer',policyNumber:'TEST-001',type:'Betriebshaftpflicht',status:'Entwurf',validFrom:'2000-01-01',validUntil:'2000-12-31',cancellationUntil:'2000-09-30',coverage:'1200000,25',annualPremium:'1234.56',notes:'Fiktive Police'};
 const base='/in-party/insurance';
 try{
 assert.equal((await call(base,undefined,'GET',{'x-no-user':'1'})).status,401);
 for(const role of ['BAULEITER','KALKULATOR','CAPOCANTIERE','GAST']){assert.equal((await call(base,undefined,'GET',{'x-role':role})).status,403);assert.equal((await call(base,b,'POST',{'x-role':role})).status,403);}
 assert.equal((await call('/in-foreign/insurance')).status,404);assert.equal((await call(base,b,'POST',{'x-company':'in-b'})).status,404);
 assert.equal((await call('/in-archived/insurance',b,'POST')).status,409);
 for(const patch of [{title:''},{insurer:''},{policyNumber:''},{type:'Unknown'},{status:'Aktiv'},{validFrom:'2026-02-29'},{validFrom:''},{validUntil:'1999-12-31'},{cancellationUntil:'2001-01-01'},{coverage:'-1'},{annualPremium:12.34},{coverage:'1.001'},{annualPremium:'1e3'},{notes:'bad\u0000text'}])assert.equal((await call(base,{...b,...patch},'POST')).status,400,JSON.stringify(patch));
 assert.equal(insuranceInput({...b,validFrom:'2024-02-29',validUntil:'',cancellationUntil:'',coverage:'0,00',annualPremium:''}).coverage,'0.00');
 const made=await call(base,b,'POST',{'x-role':'BUCHHALTUNG'});assert.equal(made.status,201,JSON.stringify(made.data));assert.equal(made.data.item.coverage,'1200000.25');assert.equal(made.data.item.annualPremium,'1234.56');assert.equal(made.data.item.expiry,'Abgelaufen');assert.equal(made.data.item.cancellation,'Abgelaufen');assert.match(made.headers.get('Cache-Control')||'',/no-store/);
 const id=made.data.item.id,path=base+'/'+id;
 assert.equal((await call(base,{...b,insurer:'FIKTIVER VERSICHERER',policyNumber:'test-001'},'POST')).status,409);
 const pair=await Promise.all([call(base,{...b,policyNumber:'Parallel'},'POST'),call(base,{...b,policyNumber:'Parallel'},'POST')]);assert.deepEqual(pair.map(x=>x.status).sort(),[201,409]);
 const other=await call('/in-other/insurance',b,'POST');assert.equal(other.status,201);
 assert.equal((await call('/in-other/insurance/'+id+'/history')).status,404);assert.equal((await call('/in-other/insurance/'+id,{...b,revision:1},'PUT')).status,404);
 assert.equal((await call(path,{...b},'PUT')).status,409);assert.equal((await call(path,{...b,revision:1,status:'Beendet'},'PUT')).status,400);
 const active=await call(path,{...b,revision:1,status:'Aktiv'},'PUT');assert.equal(active.status,200);assert.equal(active.data.item.revision,2);
 const saves=await Promise.all([call(path,{...b,status:'Aktiv',revision:2,notes:'A'},'PUT'),call(path,{...b,status:'Aktiv',revision:2,notes:'B'},'PUT')]);assert.deepEqual(saves.map(x=>x.status).sort(),[200,409]);
 const contact=(await call('?includeArchived=true')).data.items.find((x:any)=>x.id==='in-party');assert.equal((await call('/in-party/archive',{expectedVersion:contact.version},'POST')).status,200);
 assert.equal((await call(base,{...b,policyNumber:'New after archive'},'POST')).status,409);
 const edited=await call(path,{...b,status:'Aktiv',revision:3,coverage:'999999999999.99',annualPremium:'0.00'},'PUT');assert.equal(edited.status,200);assert.equal(edited.data.item.coverage,'999999999999.99');assert.equal(edited.data.item.annualPremium,'0');
 const before=JSON.stringify(await prisma.partyInsurancePolicy.findUnique({where:{id}})),audits=await prisma.auditLog.count();
 await prisma.$executeRawUnsafe("CREATE FUNCTION public.reject_insurance_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='CONTACT_INSURANCE_UPDATE' THEN RAISE EXCEPTION 'Isolated insurance rollback test'; END IF; RETURN NEW; END $$");
 await prisma.$executeRawUnsafe('CREATE TRIGGER reject_insurance_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION public.reject_insurance_audit()');
 try{assert.equal((await call(path,{...b,revision:4,status:'Aktiv',notes:'Rollback'},'PUT')).status,503);assert.equal(JSON.stringify(await prisma.partyInsurancePolicy.findUnique({where:{id}})),before);assert.equal(await prisma.auditLog.count(),audits);}
 finally{await prisma.$executeRawUnsafe('DROP TRIGGER reject_insurance_audit ON "AuditLog"');await prisma.$executeRawUnsafe('DROP FUNCTION public.reject_insurance_audit()');}
 const ended=await call(path,{...b,status:'Beendet',revision:4},'PUT');assert.equal(ended.status,200);assert.equal((await call(path,{...b,status:'Aktiv',revision:5},'PUT')).status,400);
 const archived=await call(path,{...b,status:'Archiviert',revision:5},'PUT');assert.equal(archived.status,200);assert.equal((await call(path,{...b,status:'Archiviert',revision:6,notes:'Overwrite'},'PUT')).status,400);
 const history=await call(path+'/history');assert.equal(history.status,200);assert.equal(history.data.items.length,6);assert.ok(history.data.items.some((x:any)=>x.meta?.after?.coverage==='999999999999.99'));
 await assert.rejects(prisma.party.delete({where:{id:'in-party'}}));
 assert.equal(JSON.stringify(await prisma.party.findMany({orderBy:{id:'asc'}})),original);
 for(const model of ['invoice','vendorBill','payment','ledgerEntry','contractCertificate','document','contract'])assert.equal(await prisma[model].count(),0);
 console.log('PASS contact insurance: isolated tenant/role/contact scope; strict real dates and EUR strings, exact Decimal cents including high values and zero; duplicate parallel creation; versioned concurrent edits; archive lifecycle locks; existing policy upkeep on archived contacts; atomic audit failure rollback; readable history and Party FK protection; original contacts, certificates, documents, contracts and accounting unchanged.');
 }finally{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
