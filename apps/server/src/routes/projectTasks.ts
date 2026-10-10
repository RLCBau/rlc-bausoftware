import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { InputError } from '../domain/officeAddons';
import { PlanError, planDay } from '../domain/constructionPlan';
import { scopedTaskProject, requireTaskWrite, taskWriteAllowed, taskVersion, taskAudit, handoffFailure, createTaskCalendar } from '../services/planHandoff';
const router=Router();
function taskInput(body:any,current:any={}){
 const data:any={};
 for(const [key,max,required] of [['title',250,true],['description',5000,false],['assignee',250,false],['sourceType',120,false],['sourceId',120,false]] as const){
  if(body[key]===undefined&&current.id)continue;
  const value=body[key]??'';if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new InputError(key+': ungültiger Text.');data[key]=value.trim()||(required?'':null);
 }
 if(current.id&&(body.sourceType!==undefined||body.sourceId!==undefined)){
  if((body.sourceType!==undefined&&(data.sourceType||null)!==current.sourceType)||(body.sourceId!==undefined&&(data.sourceId||null)!==current.sourceId))throw new InputError('Quellverknüpfung darf nicht geändert werden.');
 }
 if(body.done!==undefined){if(typeof body.done!=='boolean')throw new InputError('done: Wahrheitswert erforderlich.');data.done=body.done;}
 if(body.priority!==undefined||!current.id){data.priority=body.priority??'med';if(!['low','med','high'].includes(data.priority))throw new InputError('Priorität ungültig.');}
 if(body.tags!==undefined||!current.id){const value=body.tags??[];if(!Array.isArray(value)||value.length>50||value.some((t:any)=>typeof t!=='string'||t.length>120))throw new InputError('Tags ungültig.');data.tags=Array.from(new Set(value.map((t:string)=>t.trim()).filter(Boolean)));}
 if(body.due!==undefined||!current.id){if(body.due!==undefined&&body.due!==null&&typeof body.due!=='string')throw new InputError('Fälligkeit: Datum erforderlich.');data.due=body.due?planDay(body.due):null;}
 return data;
}
async function currentTask(req:any,tx:any){
 const cid=String(req.auth?.companyId||'');const current=await tx.projectTask.findFirst({where:{id:String(req.params.id||''),companyId:cid}});if(!current)throw new PlanError('NOT_FOUND',404);
 const project=await scopedTaskProject(req,tx,current.projectId);await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${project.id} FOR UPDATE`;
 const locked=await tx.projectTask.findUnique({where:{id:current.id}});if(!locked)throw new PlanError('NOT_FOUND',404);return {current:locked,project};
}
router.get('/',async(req:any,res)=>{try{const project=await scopedTaskProject(req,prisma,req.query.projectId);const items=await prisma.projectTask.findMany({where:{companyId:project.companyId,projectId:project.id},orderBy:[{done:'asc'},{due:'asc'},{updatedAt:'desc'}]});res.json({ok:true,items,canEdit:taskWriteAllowed(req)});}catch(e){handoffFailure(res,e);}});
router.post('/',async(req:any,res)=>{try{requireTaskWrite(req);const data=taskInput(req.body);if(data.sourceType==='bauzeitenplan')throw new PlanError('Bitte gespeicherten Bauzeitenplan über die Planübernahme verwenden.',409);const item=await prisma.$transaction(async tx=>{const project=await scopedTaskProject(req,tx,req.body?.projectId);await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${project.id} FOR UPDATE`;const item=await tx.projectTask.create({data:{...data,companyId:project.companyId,projectId:project.id}});await taskAudit(tx,req,project,'PROJECT_TASK_CREATE','project-task:'+item.id,null,item);return item;});res.json({ok:true,item});}catch(e){handoffFailure(res,e);}});
router.put('/:id',async(req:any,res)=>{try{requireTaskWrite(req);const item=await prisma.$transaction(async tx=>{const {current,project}=await currentTask(req,tx);taskVersion(req.body,current);const data=taskInput(req.body,current);data.updatedAt=new Date(Math.max(Date.now(),current.updatedAt.getTime()+1));const item=await tx.projectTask.update({where:{id:current.id},data});await taskAudit(tx,req,project,'PROJECT_TASK_UPDATE','project-task:'+item.id,current,item);return item;});res.json({ok:true,item});}catch(e){handoffFailure(res,e);}});
router.post('/:id/calendar',async(req:any,res)=>{try{requireTaskWrite(req);const data=await prisma.$transaction(async tx=>{const {current,project}=await currentTask(req,tx);return createTaskCalendar(tx,req,project,current);});res.json({ok:true,...data});}catch(e){handoffFailure(res,e);}});
router.get('/:id/history',async(req:any,res)=>{try{const current=await prisma.projectTask.findFirst({where:{id:String(req.params.id),companyId:String(req.auth?.companyId||'')}});if(!current)throw new PlanError('NOT_FOUND',404);const project=await scopedTaskProject(req,prisma,current.projectId);const items=await prisma.auditLog.findMany({where:{companyId:project.companyId,resource:'project-task:'+current.id},select:{id:true,action:true,meta:true,createdAt:true},orderBy:[{createdAt:'desc'},{id:'desc'}],take:100});res.json({ok:true,items,limit:100});}catch(e){handoffFailure(res,e);}});
router.delete('/:id',async(req:any,res)=>{try{requireTaskWrite(req);await prisma.$transaction(async tx=>{const {current,project}=await currentTask(req,tx);taskVersion(req.body,current);await taskAudit(tx,req,project,'PROJECT_TASK_DELETE','project-task:'+current.id,current,null);await tx.projectTask.delete({where:{id:current.id}});});res.json({ok:true});}catch(e){handoffFailure(res,e);}});
export default router;
