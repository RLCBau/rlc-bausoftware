import assert from 'node:assert/strict';import express from 'express';import http from 'http';
const url=new URL(process.env.DATABASE_URL!);url.pathname='/rlc_schedule_validation_20261010';process.env.DATABASE_URL=url.toString();process.env.DEV_AUTH='off';
const {prisma}=require('../lib/prisma'),router=require('../routes/buero/bauzeitenplan').default,{proposeSchedule,scheduleInput}=require('../domain/planSchedule');
const task=(id:string,extra:any={})=>({id,name:id,dauerTage:2,start:'2026-10-10',end:'2026-10-11',progress:0,notes:'preserve',assignee:'named',milestone:false,deps:[],ressourcen:{Team:1},...extra});
async function main(){
 const options={start:'2026-10-10',weekdays:[1,2,3,4,5],excludeNonWorking:true};
 const source={start:options.start,tasks:[task('a'),task('b'),task('c',{deps:['a'],milestone:true,dauerTage:1,end:'2026-10-10',ressourcen:{}})],capacity:{Team:1}};
 const proposal=proposeSchedule(source,options,['2026-10-12']);assert.deepEqual(proposal.blocked,[]);assert.equal(proposal.changes[0].start.slice(0,10),'2026-10-13');assert.equal(proposal.changes[0].end.slice(0,10),'2026-10-14');assert.equal(proposal.changes[1].start.slice(0,10),'2026-10-15');assert.equal(proposal.changes[2].start.slice(0,10),'2026-10-15');assert.deepEqual(proposeSchedule(source,options,['2026-10-12']),proposal);
 const pinned=proposeSchedule({...source,tasks:[task('a',{progress:50,start:'2026-10-12',end:'2026-10-13'}),task('b')]},options,[]);assert.equal(pinned.changes[0].start.slice(0,10),'2026-10-12');assert.equal(pinned.changes[0].pinned,true);assert.equal(pinned.changes[1].start.slice(0,10),'2026-10-14');
 assert.ok(proposeSchedule({...source,capacity:{}},options,[]).blocked.length);
 assert.ok(proposeSchedule({...source,tasks:[task('a',{progress:50}),task('b',{progress:100})]},options,[]).blocked.length);
 assert.ok(proposeSchedule({...source,tasks:[task('a',{progress:50,deps:['b']}),task('b')]},options,[]).blocked.length);
 assert.throws(()=>proposeSchedule({...source,tasks:[task('a',{deps:['b']}),task('b',{deps:['a']})]},options,[]));
 for(const b of [{...options,start:'2026-02-30'},{...options,weekdays:[]},{...options,weekdays:[1,1]},{...options,excludeNonWorking:'true'}])assert.throws(()=>scheduleInput(b));
 const long=proposeSchedule({...source,tasks:[task('a',{dauerTage:367,start:null,end:null})]},options,[]);assert.ok(long.blocked.length);
 await prisma.company.createMany({data:[{id:'sc-a',code:'SC-A',name:'Fiktiv A'},{id:'sc-b',code:'SC-B',name:'Fiktiv B'}]});
 await prisma.user.create({data:{id:'sc-user',companyId:'sc-a',email:'schedule@test.invalid',password:'test'}});
 await prisma.project.createMany({data:[{id:'sc-p',companyId:'sc-a',code:'SC-P',name:'A'},{id:'sc-hidden',companyId:'sc-a',code:'SC-H',name:'Hidden'},{id:'sc-foreign',companyId:'sc-b',code:'SC-B-P',name:'B'}]});
 await prisma.projectMember.create({data:{projectId:'sc-p',userId:'sc-user',role:'BAULEITER'}});
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.auth={sub:'sc-user',companyId:req.headers['x-company']||'sc-a',companyRole:req.headers['x-role']||'BAULEITER'};next();});app.use('/plan',router);const server=http.createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 async function call(path:string,body:any,headers:any={}){const res=await fetch('http://127.0.0.1:'+(server.address() as any).port+'/plan/'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return {status:res.status,data:await res.json() as any};}
 try{
 const old=(await call('load',{projectId:'sc-p'})).data.version;const saved=await call('save',{projectId:'sc-p',expectedVersion:old,...source});assert.equal(saved.status,200);
 const body={projectId:'SC-P',expectedVersion:saved.data.version,...options};
 for(const h of [{'x-company':'sc-b'},{'x-role':'GAST'}])assert.equal((await call('schedule-preview',body,h)).status,403);
 assert.equal((await call('schedule-preview',{...body,projectId:'sc-hidden'})).status,403);
 assert.equal((await call('schedule-preview',{...body,expectedVersion:old})).status,409);
 const before=JSON.stringify(await prisma.planTask.findMany({orderBy:{id:'asc'}}));const audit=await prisma.auditLog.count(),snapshots=await prisma.planSnapshot.count();
 let p=await call('schedule-preview',body);assert.equal(p.status,200);assert.deepEqual(p.data.blocked,[]);
 assert.equal(JSON.stringify(await prisma.planTask.findMany({orderBy:{id:'asc'}})),before);assert.equal(await prisma.auditLog.count(),audit);assert.equal(await prisma.planSnapshot.count(),snapshots);
 assert.equal((await call('schedule-apply',body)).status,400);assert.equal((await call('schedule-apply',{...body,fingerprint:'0'.repeat(64)})).status,409);
 const {berlinMidnight,nextCalendarDay,NON_WORKING_DAY}=require('../domain/nonWorkingDay');
 await prisma.officeCalendarEvent.create({data:{id:'sc-holiday',companyId:'sc-a',title:'Fiktiv frei',start:berlinMidnight('2026-10-12'),end:berlinMidnight(nextCalendarDay('2026-10-12')),allDay:true,sourceType:NON_WORKING_DAY}});
 assert.equal((await call('schedule-apply',{...body,fingerprint:p.data.fingerprint})).status,409);
 p=await call('schedule-preview',body);assert.equal(p.data.changes[0].start.slice(0,10),'2026-10-13');
 await prisma.projectTask.create({data:{id:'sc-target',companyId:'sc-a',projectId:'sc-p',title:'Manual target',tags:[],sourceType:'bauzeitenplan',sourceId:'a'}});
 await prisma.resourceAssignment.create({data:{id:'sc-assignment',companyId:'sc-a',projectId:'sc-p',resourceType:'EMPLOYEE',resourceId:'external-reference',date:new Date('2026-10-12T12:00Z'),hours:8,notes:'Manual target'}});
 const targets=JSON.stringify([await prisma.projectTask.findMany(),await prisma.resourceAssignment.findMany(),await prisma.officeCalendarEvent.findMany()]);
 await prisma.$executeRawUnsafe(`CREATE FUNCTION public.reject_plan_schedule_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='CONSTRUCTION_PLAN_SCHEDULE' THEN RAISE EXCEPTION 'Isolated audit rollback test'; END IF; RETURN NEW; END $$`);
 await prisma.$executeRawUnsafe('CREATE TRIGGER reject_plan_schedule_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION public.reject_plan_schedule_audit()');
 try{assert.equal((await call('schedule-apply',{...body,fingerprint:p.data.fingerprint})).status,503);}finally{await prisma.$executeRawUnsafe('DROP TRIGGER reject_plan_schedule_audit ON "AuditLog"');await prisma.$executeRawUnsafe('DROP FUNCTION public.reject_plan_schedule_audit()');}
 assert.equal(JSON.stringify(await prisma.planTask.findMany({orderBy:{id:'asc'}})),before);assert.equal(await prisma.auditLog.count(),audit);assert.equal(await prisma.planSnapshot.count(),snapshots);
 const pair=await Promise.all([call('schedule-apply',{...body,fingerprint:p.data.fingerprint}),call('schedule-apply',{...body,fingerprint:p.data.fingerprint})]);assert.deepEqual(pair.map(r=>r.status).sort(),[200,409]);const applied=pair.find(r=>r.status===200)!.data;
 assert.notEqual(applied.version,body.expectedVersion);assert.equal(await prisma.auditLog.count({where:{action:'CONSTRUCTION_PLAN_SCHEDULE'}}),1);
 assert.equal((await call('schedule-apply',{...body,fingerprint:p.data.fingerprint})).status,409);
 const again={...body,expectedVersion:applied.version};const same=await call('schedule-preview',again);assert.equal(same.data.changedCount,0);assert.equal((await call('schedule-apply',{...again,fingerprint:same.data.fingerprint})).data.version,applied.version);
 assert.equal(JSON.stringify([await prisma.projectTask.findMany(),await prisma.resourceAssignment.findMany(),await prisma.officeCalendarEvent.findMany()]),targets);assert.equal(await prisma.ledgerEntry.count(),0);
 const invalid=await call('save',{projectId:'sc-p',expectedVersion:applied.version,...source,capacity:{}});assert.equal(invalid.status,200);const bad={...body,expectedVersion:invalid.data.version};const bp=await call('schedule-preview',bad);assert.ok(bp.data.blocked.length);assert.equal((await call('schedule-apply',{...bad,fingerprint:bp.data.fingerprint})).status,409);
 assert.ok((await call('history',{projectId:'sc-p'})).data.items.some((r:any)=>r.action==='CONSTRUCTION_PLAN_SCHEDULE'));
 console.log('PASS plan scheduling: deterministic calendar spans/dependencies/capacity, holidays constrain starts, progress pinned, cycles/missing capacities/horizon blocked, two fictional firms/roles/projects, read-only preview, stale source/calendar fingerprints, concurrent apply, post-write audit rollback, idempotent unchanged reapply, existing task/calendar/resource targets and accounting preserved.');
 }finally{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
