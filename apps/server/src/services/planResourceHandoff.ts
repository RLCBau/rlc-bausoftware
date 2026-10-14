import crypto from 'crypto';
import { InputError } from '../domain/officeAddons';
import { PlanError } from '../domain/constructionPlan';
import { calendarDay,nextCalendarDay,berlinDay,NON_WORKING_DAY,berlinMidnight } from '../domain/nonWorkingDay';
import { loadConstructionPlan,planVersion } from './constructionPlan';
import { lockPlanningResource,assertPlanningCapacity } from './planningCapacity';
const linkId=(p:string,t:string,type:string,id:string,day:string)=>{const h=crypto.createHash('sha256').update(JSON.stringify(['RLC_PLAN_RESOURCE',p,t,type,id,day])).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
export async function planResourceOptions(tx:any,project:any,req:any){
 const admin=['ADMIN','ADMINISTRATOR'].includes(String(req.auth?.companyRole||req.auth?.role||'').toUpperCase());
 const employees=await tx.companyEmployee.findMany({where:{companyId:project.companyId,active:true},select:{id:true,name:true},orderBy:{name:'asc'},take:2001});
 const machines=await tx.companyMachine.findMany({where:{companyId:project.companyId,active:true,...(admin?{}:{OR:[{projectId:null},{projectId:''},{projectId:project.id}]})},select:{id:true,name:true,projectId:true},orderBy:{name:'asc'},take:2001});
 if(employees.length>2000||machines.length>2000)throw new InputError('Zu viele Ressourcen. Bitte Stammdaten eingrenzen.');return {employees,machines};
}
function mappingInput(body:any,source:any){
 if(!['EMPLOYEE','MACHINE'].includes(body.resourceType)||typeof body.resourceId!=='string'||!body.resourceId||body.resourceId.length>120)throw new InputError('Ressource auswählen.');
 if(typeof body.hours!=='number'||!Number.isFinite(body.hours)||body.hours<=0||body.hours>24||Math.abs(body.hours*100-Math.round(body.hours*100))>1e-8)throw new InputError('Planstunden > 0 bis 24 mit höchstens zwei Nachkommastellen erforderlich.');
 if(!Array.isArray(body.weekdays)||!body.weekdays.length||body.weekdays.length>7||new Set(body.weekdays).size!==body.weekdays.length||body.weekdays.some((d:any)=>!Number.isInteger(d)||d<0||d>6))throw new InputError('Wochentage auswählen.');
 if(typeof body.excludeNonWorking!=='boolean')throw new InputError('Ruhetagsauswahl erforderlich.');
 if(!source.start||!source.end)throw new InputError('Gespeicherter Vorgang benötigt Beginn und Ende.');
 const from=calendarDay(body.from),to=calendarDay(body.to);if(from>to||from<source.start.slice(0,10)||to>source.end.slice(0,10))throw new InputError('Zeitraum muss im gespeicherten Vorgang liegen.');
 const all:string[]=[];for(let d=from;d<=to;d=nextCalendarDay(d)){all.push(d);if(all.length>366)throw new InputError('Höchstens 366 Kalendertage pro Übernahme.');}
 const requirement=body.requirement??'';if(typeof requirement!=='string'||(requirement&&!Object.prototype.hasOwnProperty.call(source.ressourcen,requirement)))throw new InputError('Planbedarf nicht gefunden.');
 return {resourceType:body.resourceType,resourceId:body.resourceId,hours:body.hours,weekdays:[...body.weekdays].sort(),excludeNonWorking:body.excludeNonWorking,from,to,requirement,all};
}
export async function prepareResourceHandoff(tx:any,project:any,req:any){
 const plan=await loadConstructionPlan(tx,project.id);if(typeof req.body.expectedVersion!=='string'||req.body.expectedVersion!==plan.version)throw new PlanError('Plan inzwischen geändert. Bitte neu laden.',409);
 const source=plan.tasks.find((r:any)=>r.id===req.body.taskId);if(!source)throw new PlanError('Vorgang nicht gefunden.',404);
 const input=mappingInput(req.body,source),options=await planResourceOptions(tx,project,req),resource=(input.resourceType==='EMPLOYEE'?options.employees:options.machines).find((r:any)=>r.id===input.resourceId);if(!resource)throw new PlanError('RESOURCE_FORBIDDEN',403);
 const currentResource=await (input.resourceType==='EMPLOYEE'?tx.companyEmployee:tx.companyMachine).findUnique({where:{id:input.resourceId},select:{updatedAt:true}});
 const holidays=await tx.officeCalendarEvent.findMany({where:{companyId:project.companyId,sourceType:NON_WORKING_DAY,start:{lt:berlinMidnight(nextCalendarDay(input.to))},end:{gt:berlinMidnight(input.from)}},orderBy:{id:'asc'},select:{id:true,start:true,end:true,title:true,location:true,updatedAt:true}});
 const rows=await tx.resourceAssignment.findMany({where:{companyId:project.companyId,resourceType:input.resourceType,resourceId:input.resourceId,date:{gte:new Date(input.from+'T00:00Z'),lte:new Date(input.to+'T23:59:59.999Z')}},orderBy:{id:'asc'}});
 if(rows.some((r:any)=>!Number.isFinite(r.hours)||r.hours<0))throw new PlanError('Bestehende Planstunden ungültig. Bitte prüfen.',503);
 const receiptResource='plan-resource:'+planVersion([project.companyId,project.id,source.id,input.resourceType,input.resourceId]);
 const receipts=await tx.auditLog.findMany({where:{companyId:project.companyId,action:'PLAN_RESOURCE_HANDOFF',resource:receiptResource},select:{id:true,meta:true},orderBy:{id:'asc'}});
 const known=new Set(receipts.flatMap((r:any)=>r.meta?.assignmentIds||[])),inputHash=planVersion({input,planVersion:plan.version,sourceId:source.id});
 const days=input.all.map(day=>{
  const id=linkId(project.id,source.id,input.resourceType,input.resourceId,day),existing=rows.find((r:any)=>r.id===id),total=rows.filter((r:any)=>r.date.toISOString().slice(0,10)===day).reduce((s:number,r:any)=>s+r.hours,0);
  if(!Number.isFinite(total)||total<0)throw new PlanError('Bestehende Stunden nicht verfügbar.',503);
  const nonWorking=holidays.filter((r:any)=>berlinDay(r.start)===day).map((r:any)=>({title:r.title,location:r.location||''}));
  let status='new';if(existing)status=existing.projectId===project.id?'existing':'moved';else if(known.has(id))status='deleted';else if(!input.weekdays.includes(new Date(day+'T12:00Z').getUTCDay()))status='weekday';else if(input.excludeNonWorking&&nonWorking.length)status='nonworking';else if(total+input.hours>24+1e-9)status='overcapacity';
  return {date:day,id,status,existingHours:existing?.hours??null,totalHours:total,requestedHours:input.hours,nonWorking};
 });
 const fingerprint=planVersion({input,version:plan.version,resourceUpdatedAt:currentResource.updatedAt.toISOString(),holidays,rows,receipts});
 return {plan,source,input,resource,receiptResource,receipts,inputHash,days,fingerprint};
}
export function resourcePreview(data:any){const {days,fingerprint,resource,source,input}=data;return {days,fingerprint,resource:{id:resource.id,name:resource.name,type:input.resourceType},task:{id:source.id,name:source.name},newCount:days.filter((d:any)=>d.status==='new').length,existingCount:days.filter((d:any)=>d.status==='existing').length,blocked:days.some((d:any)=>['deleted','moved','overcapacity'].includes(d.status))};}
export async function commitResourceHandoff(tx:any,project:any,req:any){
 if(!['EMPLOYEE','MACHINE'].includes(req.body?.resourceType)||typeof req.body.resourceId!=='string'||!req.body.resourceId)throw new InputError('Ressource auswählen.');
 await lockPlanningResource(tx,project.companyId,req.body.resourceType,req.body.resourceId);
 const data=await prepareResourceHandoff(tx,project,req);if(typeof req.body.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(req.body.fingerprint))throw new InputError('Vorschau erforderlich.');
 const preview=resourcePreview(data),replay=data.receipts.some((r:any)=>r.meta?.inputHash===data.inputHash)&&data.days.every((d:any)=>['existing','weekday','nonworking'].includes(d.status));
 if(!replay&&req.body.fingerprint!==data.fingerprint)throw new PlanError('Vorschau inzwischen geändert. Bitte neu prüfen.',409);
 if(preview.blocked)throw new PlanError('Gelöschte/verschobene Verknüpfung oder mehr als 24 Planstunden. Bitte in Einsatzplanung prüfen.',409);
 const additions=data.days.filter((d:any)=>d.status==='new');if(!additions.length)return {...preview,createdCount:0,replayed:replay};
 const notes=`Bauzeitenplan: ${data.source.name}${data.input.requirement?' · Bedarf '+data.input.requirement:''}`;
 for(const day of additions){const date=new Date(day.date+'T12:00Z');await assertPlanningCapacity(tx,project.companyId,data.input.resourceType,data.input.resourceId,date,data.input.hours);await tx.resourceAssignment.create({data:{id:day.id,companyId:project.companyId,projectId:project.id,resourceType:data.input.resourceType,resourceId:data.input.resourceId,date,hours:data.input.hours,notes}});}
 await tx.auditLog.create({data:{companyId:project.companyId,userId:String(req.auth.sub||req.auth.userId),action:'PLAN_RESOURCE_HANDOFF',resource:data.receiptResource,meta:JSON.parse(JSON.stringify({projectId:project.id,sourceTask:data.source,planVersion:data.plan.version,input:data.input,inputHash:data.inputHash,assignmentIds:additions.map((d:any)=>d.id),preview:resourcePreview(data)}))}});
 return {...preview,createdCount:additions.length,replayed:false};
}
