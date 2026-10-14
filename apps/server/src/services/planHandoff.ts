import { InputError } from '../domain/officeAddons';
import { PlanError } from '../domain/constructionPlan';
import { loadConstructionPlan } from './constructionPlan';
import { berlinMidnight, nextCalendarDay, calendarDay } from '../domain/nonWorkingDay';

export const taskWriteAllowed=(req:any)=>['ADMIN','ADMINISTRATOR','BAULEITER','KALKULATOR'].includes(String(req.auth?.companyRole||req.auth?.role||'').trim().toUpperCase());
export function requireTaskWrite(req:any){if(!taskWriteAllowed(req))throw new PlanError('TASK_WRITE_FORBIDDEN',403);}
export async function scopedTaskProject(req:any,tx:any,value:any){
 const companyId=String(req.auth?.companyId||'').trim(),userId=String(req.auth?.sub||req.auth?.userId||'').trim(),token=String(value||'').trim();
 if(!companyId||!userId||!token)throw new PlanError('PROJECT_FORBIDDEN',403);
 const role=String(req.auth?.companyRole||req.auth?.role||'').trim().toUpperCase();
 const project=await tx.project.findFirst({where:{companyId,OR:[{id:token},{code:token}],...(['ADMIN','ADMINISTRATOR'].includes(role)?{}:{projectMembers:{some:{userId}}})},select:{id:true,companyId:true}});
 if(!project)throw new PlanError('PROJECT_FORBIDDEN',403);return project;
}
export function taskVersion(body:any,current:any){if(typeof body?.expectedUpdatedAt!=='string'||body.expectedUpdatedAt!==current.updatedAt.toISOString())throw new PlanError('Aufgabe inzwischen geändert oder Version fehlt. Bitte neu laden.',409);}
export async function taskAudit(tx:any,req:any,project:any,action:string,resource:string,before:any,after:any){
 await tx.auditLog.create({data:{companyId:project.companyId,userId:String(req.auth.sub||req.auth.userId),action,resource,meta:JSON.parse(JSON.stringify({before,after}))}});
}
export function handoffFailure(res:any,e:any){if(e instanceof InputError)return res.status((e as any).status||400).json({ok:false,error:e.message});console.error('Plan/task handoff failed',e?.code||e?.name);return res.status(503).json({ok:false,error:'Aufgaben/Planübernahme derzeit nicht verfügbar.'});}
export async function createPlanHandoff(tx:any,req:any,project:any){
 if(!['task','calendar'].includes(req.body?.target))throw new InputError('Ziel muss Aufgabe oder Kalender sein.');
 const plan=await loadConstructionPlan(tx,project.id);
 if(typeof req.body.expectedVersion!=='string'||plan.version!==req.body.expectedVersion)throw new PlanError('Plan inzwischen geändert. Bitte aktuellen gespeicherten Plan laden.',409);
 const source=plan.tasks.find((t:any)=>t.id===req.body.taskId);if(!source)throw new PlanError('Gespeicherter Vorgang nicht gefunden.',404);
 const where={companyId:project.companyId,projectId:project.id,sourceType:'bauzeitenplan',sourceId:source.id};
 const model=req.body.target==='task'?tx.projectTask:tx.officeCalendarEvent;
 const matches=await model.findMany({where,orderBy:[{createdAt:'asc'},{id:'asc'}],take:2});
 if(matches.length>1)throw new PlanError('Mehrere vorhandene Verknüpfungen. Bitte im Zielmodul prüfen.',409);
 if(matches.length)return {item:matches[0],created:false,target:req.body.target};
 let data:any;
 if(req.body.target==='task')data={...where,title:source.name,description:source.notes||null,due:source.end?new Date(source.end):null,assignee:source.assignee||null,priority:source.milestone?'high':'med',done:false,tags:['Bauzeitenplan',...(source.milestone?['Meilenstein']:[])]};
 else{
  if(!source.start||!source.end)throw new InputError('Vorgang benötigt gespeicherten Beginn und Ende.');
  const start=calendarDay(source.start.slice(0,10)),end=calendarDay(source.end.slice(0,10));
  data={...where,title:source.name,notes:source.notes||null,start:berlinMidnight(start),end:berlinMidnight(nextCalendarDay(end)),allDay:true,attendees:[],category:source.milestone?'Frist':'Projekt',busyStatus:'busy',reminderMinutes:null,source:'RLC_BAUZEITENPLAN'};
 }
 const item=await model.create({data});
 await taskAudit(tx,req,project,'PLAN_HANDOFF_CREATE',req.body.target==='task'?'project-task:'+item.id:'construction-plan:'+project.id,null,{target:req.body.target,sourceTask:source,planVersion:plan.version,item});return {item,created:true,target:req.body.target};
}
export async function createTaskCalendar(tx:any,req:any,project:any,current:any){
 taskVersion(req.body,current);
 const where={companyId:project.companyId,projectId:project.id,sourceType:'task',sourceId:current.id};
 const matches=await tx.officeCalendarEvent.findMany({where,orderBy:[{createdAt:'asc'},{id:'asc'}],take:2});
 if(matches.length>1)throw new PlanError('Mehrere vorhandene Termine. Bitte im Kalender prüfen.',409);
 if(matches.length)return {item:matches[0],created:false};
 if(!current.due)throw new InputError('Bitte zuerst ein Fälligkeitsdatum speichern.');
 const day=calendarDay(current.due.toISOString().slice(0,10));
 const item=await tx.officeCalendarEvent.create({data:{...where,title:current.title,notes:current.description,start:berlinMidnight(day),end:berlinMidnight(nextCalendarDay(day)),allDay:true,attendees:[],category:'Projekt',busyStatus:'busy',reminderMinutes:null,source:'RLC_AUFGABEN'}});
 await taskAudit(tx,req,project,'TASK_CALENDAR_CREATE','project-task:'+current.id,null,{sourceTask:current,item});return {item,created:true};
}
