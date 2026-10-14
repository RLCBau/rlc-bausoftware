import {scheduleInput,proposeSchedule} from '../domain/planSchedule';
import {PlanError} from '../domain/constructionPlan';
import {InputError} from '../domain/officeAddons';
import {calendarDay,nextCalendarDay,berlinDay,berlinMidnight,NON_WORKING_DAY} from '../domain/nonWorkingDay';
import {loadConstructionPlan,planVersion,storeConstructionPlan} from './constructionPlan';
export async function previewPlanSchedule(tx:any,project:any,req:any){
 const input=scheduleInput(req.body),plan=await loadConstructionPlan(tx,project.id);
 if(typeof req.body.expectedVersion!=='string'||req.body.expectedVersion!==plan.version)throw new PlanError('Plan inzwischen geändert. Bitte neu laden.',409);
 calendarDay(input.start);const end=new Date(input.start+'T12:00Z');end.setUTCDate(end.getUTCDate()+365);const until=calendarDay(end.toISOString().slice(0,10));
 const holidays=await tx.officeCalendarEvent.findMany({where:{companyId:project.companyId,sourceType:NON_WORKING_DAY,start:{lt:berlinMidnight(nextCalendarDay(until))},end:{gt:berlinMidnight(input.start)}},select:{id:true,start:true,end:true,title:true,location:true,updatedAt:true},orderBy:{id:'asc'}});
 if(holidays.length>2000)throw new InputError('Zu viele Firmenruhetage.');
 const proposal=proposeSchedule(plan,input,holidays.map((r:any)=>berlinDay(r.start)));
 return {...proposal,input,holidays:holidays.map((r:any)=>({date:berlinDay(r.start),title:r.title,location:r.location||''})),fingerprint:planVersion({version:plan.version,input,holidays}),version:plan.version};
}
export async function applyPlanSchedule(tx:any,project:any,req:any){
 const preview=await previewPlanSchedule(tx,project,req);
 if(typeof req.body.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(req.body.fingerprint))throw new InputError('Vorschau erforderlich.');
 if(req.body.fingerprint!==preview.fingerprint)throw new PlanError('Vorschau inzwischen geändert. Bitte erneut prüfen.',409);
 if(preview.blocked.length)throw new PlanError('Terminierung enthält Konflikte. Bitte prüfen.',409);
 const before=await loadConstructionPlan(tx,project.id);
 if(!preview.changedCount&&before.start===preview.data.start)return {...before,changedCount:0};
 const after=await storeConstructionPlan(tx,project,req,preview.data,before);
 await tx.auditLog.create({data:{companyId:project.companyId,userId:String(req.auth.sub||req.auth.userId),action:'CONSTRUCTION_PLAN_SCHEDULE',resource:'construction-plan:'+project.id,meta:JSON.parse(JSON.stringify({input:preview.input,holidays:preview.holidays,changes:preview.changes,fingerprint:preview.fingerprint,beforeVersion:before.version,afterVersion:after.version,policy:'FORWARD_ONLY_CALENDAR_SPAN_PIN_PROGRESS'}))}});
 return {...after,changedCount:preview.changedCount};
}
