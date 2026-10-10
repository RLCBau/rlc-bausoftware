import assert from 'node:assert/strict';import express from 'express';import http from 'http';
const url=new URL(process.env.DATABASE_URL!);url.pathname='/rlc_supplier_links_validation_20261010';process.env.DATABASE_URL=url.toString();process.env.DEV_AUTH='off';
const {prisma}=require('../lib/prisma'),addons=require('../routes/officeAddons').default,contacts=require('../routes/businessContacts').default,{FileKind}=require('@prisma/client');
async function main(){
 await prisma.company.createMany({data:[{id:'sl-a',code:'SL-A',name:'Fiktive Firma A'},{id:'sl-b',code:'SL-B',name:'Fiktive Firma B'}]});
 await prisma.user.create({data:{id:'sl-user',companyId:'sl-a',email:'supplier-links@test.invalid',password:'test'}});
 await prisma.project.createMany({data:[{id:'sl-p',companyId:'sl-a',code:'SL-P',name:'Mitgliedsprojekt'},{id:'sl-private',companyId:'sl-a',code:'SL-PRIVATE',name:'Privates Projekt'},{id:'sl-foreign',companyId:'sl-b',code:'SL-B-P',name:'Fremdes Projekt'}]});
 await prisma.projectMember.create({data:{projectId:'sl-p',userId:'sl-user',role:'BAULEITER'}});
 await prisma.party.createMany({data:[{id:'sl-supplier',companyId:'sl-a',type:'SUPPLIER',name:'Lieferant A'},{id:'sl-other',companyId:'sl-a',type:'SUPPLIER',name:'Lieferant B'},{id:'sl-customer',companyId:'sl-a',type:'CUSTOMER',name:'Kunde'},{id:'sl-foreign-supplier',companyId:'sl-b',type:'SUPPLIER',name:'Fremdlieferant'},{id:'sl-archived',companyId:'sl-a',type:'SUPPLIER',name:'Archivlieferant'}]});
 await prisma.partyContactProfile.create({data:{partyId:'sl-archived',archived:true}});
 for(const [id,projectId,companyId] of [['sl-contract','sl-p','sl-a'],['sl-private-contract','sl-private','sl-a'],['sl-foreign-contract','sl-foreign','sl-b']])await prisma.contract.create({data:{id,projectId,companyId,title:'Fiktiver NU Vertrag',partner:'Historischer Partnertext',contractType:'Nachunternehmervertrag',tags:[]}});
 await prisma.document.createMany({data:[{id:'sl-doc',projectId:'sl-p',kind:Object.values(FileKind)[0] as any,name:'Fiktiver Nachweis.pdf'},{id:'sl-private-doc',projectId:'sl-private',kind:Object.values(FileKind)[0] as any,name:'Privater Nachweis.pdf'}]});
 const originalContracts=JSON.stringify(await prisma.contract.findMany({orderBy:{id:'asc'}})),originalParties=JSON.stringify(await prisma.party.findMany({orderBy:{id:'asc'}}));
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.auth={sub:req.headers['x-no-user']?'':'sl-user',companyId:req.headers['x-company']||'sl-a',companyRole:req.headers['x-role']||'ADMIN'};next();});app.use('/addons',addons);app.use('/contacts',contacts);const server=http.createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 async function call(path:string,body:any=undefined,method='GET',headers:any={}){const res=await fetch('http://127.0.0.1:'+(server.address() as any).port+path,{method,headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,data:await res.json() as any};}
 const b={projectId:'sl-p',contractId:'sl-contract',documentId:'sl-doc',supplierPartyId:'sl-supplier',title:'Fiktive Versicherung',issuer:'Fiktiver Versicherer',type:'Versicherung',status:'Ungeprüft',validFrom:'2000-01-01',validUntil:'2000-12-31',notes:'Fixture'};
 try{
 for(const supplierPartyId of ['sl-foreign-supplier','sl-customer','missing','sl-archived',123])assert.equal((await call('/addons/certificates',{...b,supplierPartyId},'POST')).status,400);
 assert.equal((await call('/addons/certificates',b,'POST',{'x-role':'KALKULATOR'})).status,403);
 assert.equal((await call('/addons/certificates',{...b,projectId:'sl-private',contractId:'sl-private-contract',documentId:'sl-private-doc'},'POST',{'x-role':'BAULEITER'})).status,404);
 const made=await call('/addons/certificates',b,'POST');assert.equal(made.status,201,JSON.stringify(made.data));const path='/addons/certificates/'+made.data.item.id;
 const privateCert=await call('/addons/certificates',{...b,projectId:'sl-private',contractId:'sl-private-contract',documentId:'sl-private-doc'},'POST');assert.equal(privateCert.status,201);
 const legacy={...b} as any;delete legacy.supplierPartyId;const oldClient=await call('/addons/certificates',legacy,'POST');assert.equal(oldClient.status,201);assert.equal(oldClient.data.item.supplierPartyId,null);
 const view=await call('/contacts/sl-supplier/certificates');assert.equal(view.status,200);assert.equal(view.data.items.length,2);assert.equal(view.data.items[0].expiry,'Abgelaufen');
 const member=await call('/contacts/sl-supplier/certificates',undefined,'GET',{'x-role':'BAULEITER'});assert.equal(member.data.items.length,1);assert.equal(member.data.items[0].project.id,'sl-p');
 assert.equal((await call('/contacts/sl-supplier/certificates',undefined,'GET',{'x-role':'KALKULATOR'})).status,403);assert.equal((await call('/contacts/sl-supplier/certificates',undefined,'GET',{'x-role':'GAST'})).status,403);assert.equal((await call('/contacts/sl-supplier/certificates',undefined,'GET',{'x-no-user':'1'})).status,401);
 assert.equal((await call('/contacts/sl-supplier/certificates',undefined,'GET',{'x-company':'sl-b'})).status,404);assert.equal((await call('/contacts/sl-customer/certificates')).status,404);
 const listed=await call('/addons/certificates?projectId=sl-p');assert.equal(listed.data.items.find((x:any)=>x.id===made.data.item.id).supplierParty.name,'Lieferant A');
 const checked=await call(path,{...b,revision:1,status:'Geprüft'},'PUT');assert.equal(checked.status,200);assert.equal(checked.data.item.reviewedBy,'sl-user');
 assert.equal((await call(path,{...b,supplierPartyId:'sl-other',revision:2,status:'Geprüft'},'PUT')).status,400);
 const oldUpdate=await call(path,{...legacy,revision:2,status:'Geprüft',notes:'Old client update'},'PUT');assert.equal(oldUpdate.status,200);assert.equal(oldUpdate.data.item.supplierPartyId,'sl-supplier');
 const relink=await call(path,{...b,supplierPartyId:'sl-other',revision:3,status:'Ungeprüft'},'PUT');assert.equal(relink.status,200);assert.equal(relink.data.item.reviewedBy,null);assert.equal(relink.data.item.reviewedAt,null);
 const paired=await Promise.all([call(path,{...b,supplierPartyId:'sl-other',revision:4,notes:'A'},'PUT'),call(path,{...b,supplierPartyId:'sl-other',revision:4,notes:'B'},'PUT')]);assert.deepEqual(paired.map(x=>x.status).sort(),[200,409]);
 assert.equal((await call('/contacts/sl-supplier/certificates')).data.items.length,1);assert.equal((await call('/contacts/sl-other/certificates')).data.items.length,1);
 await prisma.document.update({where:{id:'sl-private-doc'},data:{deletedAt:new Date()}});assert.equal((await call('/contacts/sl-supplier/certificates')).data.items[0].document,null);
 const supplierRow=(await call('/contacts?type=SUPPLIER&includeArchived=true')).data.items.find((x:any)=>x.id==='sl-other');
 assert.equal((await call('/contacts/sl-other/archive',{expectedVersion:supplierRow.version},'POST')).status,200);
 assert.equal((await call('/addons/certificates',{...b,supplierPartyId:'sl-other'},'POST')).status,400);
 const keep=await call(path,{...b,supplierPartyId:'sl-other',revision:5,notes:'Keep historical link'},'PUT');assert.equal(keep.status,200);
 const persisted=JSON.stringify(await prisma.contractCertificate.findUnique({where:{id:made.data.item.id}})),audits=await prisma.auditLog.count();
 await prisma.$executeRawUnsafe("CREATE FUNCTION public.reject_supplier_link_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='OFFICE_ADDON_UPDATE' THEN RAISE EXCEPTION 'Isolated supplier link rollback test'; END IF; RETURN NEW; END $$");
 await prisma.$executeRawUnsafe('CREATE TRIGGER reject_supplier_link_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION public.reject_supplier_link_audit()');
 try{assert.equal((await call(path,{...b,supplierPartyId:'sl-supplier',revision:6},'PUT')).status,500);assert.equal(JSON.stringify(await prisma.contractCertificate.findUnique({where:{id:made.data.item.id}})),persisted);assert.equal(await prisma.auditLog.count(),audits);}
 finally{await prisma.$executeRawUnsafe('DROP TRIGGER reject_supplier_link_audit ON "AuditLog"');await prisma.$executeRawUnsafe('DROP FUNCTION public.reject_supplier_link_audit()');}
 const archive=await call(path,{...b,supplierPartyId:'sl-other',revision:6,status:'Archiviert'},'PUT');assert.equal(archive.status,200);
 assert.equal((await call('/contacts/sl-other/certificates')).data.items.length,0);assert.equal((await call('/contacts/sl-other/certificates?includeArchived=true')).data.items.length,1);
 assert.equal((await call(path,{...b,supplierPartyId:'sl-supplier',revision:7},'PUT')).status,400);
 const history=await call(path+'/history');assert.ok(history.data.items.some((x:any)=>x.meta?.before?.supplierPartyId==='sl-supplier'&&x.meta?.after?.supplierPartyId==='sl-other'));
 await assert.rejects(prisma.party.delete({where:{id:'sl-other'}}));
 assert.equal(JSON.stringify(await prisma.contract.findMany({orderBy:{id:'asc'}})),originalContracts);assert.equal(JSON.stringify(await prisma.party.findMany({orderBy:{id:'asc'}})),originalParties);
 assert.equal(await prisma.invoice.count(),0);assert.equal(await prisma.vendorBill.count(),0);assert.equal(await prisma.payment.count(),0);assert.equal(await prisma.ledgerEntry.count(),0);
 console.log('PASS supplier certificate links: optional Party FK, legacy create/update omission compatibility, tenant/supplier-type/archive validation, membership-filtered cross-project supplier view, deleted document metadata hidden, manual-review reset on supplier change, concurrent revision conflict, historical archived supplier links retained, certificate archival locks, atomic link/audit rollback, audited reassignment and FK delete protection; original parties/contracts and accounting unchanged.');
 }finally{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
