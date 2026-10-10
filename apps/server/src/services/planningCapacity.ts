import { PlanError } from '../domain/constructionPlan';
export async function lockPlanningResource(tx:any,companyId:string,type:string,id:string){
 if(type==='EMPLOYEE')await tx.$queryRaw`SELECT id FROM "CompanyEmployee" WHERE id=${id} AND "companyId"=${companyId} FOR UPDATE`;
 else if(type==='MACHINE')await tx.$queryRaw`SELECT id FROM "CompanyMachine" WHERE id=${id} AND "companyId"=${companyId} FOR UPDATE`;
 else throw new PlanError('INVALID_RESOURCE_TYPE',400);
 const resource=await (type==='EMPLOYEE'?tx.companyEmployee:tx.companyMachine).findFirst({where:{id,companyId,active:true},select:{id:true,name:true,updatedAt:true}});
 if(!resource)throw new PlanError('RESOURCE_NOT_FOUND',404);return resource;
}
export async function assertPlanningCapacity(tx:any,companyId:string,type:string,id:string,date:Date,hours:number,excludeId?:string){
 const rows=await tx.resourceAssignment.findMany({where:{companyId,resourceType:type,resourceId:id,date:{gte:new Date(date.toISOString().slice(0,10)+'T00:00Z'),lte:new Date(date.toISOString().slice(0,10)+'T23:59:59.999Z')},...(excludeId?{id:{not:excludeId}}:{})},select:{hours:true}});
 if(rows.some((r:any)=>!Number.isFinite(r.hours)||r.hours<0))throw new PlanError('Bestehende Planstunden ungültig. Bitte prüfen.',503);
 if(rows.reduce((s:number,r:any)=>s+r.hours,0)+hours>24+1e-9)throw new PlanError('PLANNING_DAILY_CAPACITY_EXCEEDED',409);
}
