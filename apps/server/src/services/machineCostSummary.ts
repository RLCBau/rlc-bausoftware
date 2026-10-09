import {prisma} from "../lib/prisma";
import {moneyText,usageDecimal} from "../domain/machineUsage";
function maintenanceCents(value:any){const text=String(value);return text.startsWith("-")?-usageDecimal(text.slice(1),"Wartungskosten",12):usageDecimal(text,"Wartungskosten",12);}
export async function bookedMachineItems(companyId:string,projectIds?:string[],date?:any){
 const rows=await prisma.machineUsageEntry.findMany({where:{companyId,status:"Gebucht",...(projectIds?{projectId:{in:projectIds}}:{}),...(date?{date}:{})},include:{machine:{select:{name:true}}},orderBy:{date:"asc"}});
 return rows.map(row=>({id:row.id,machineId:row.machineId,projectId:row.projectId,name:row.machine.name,date:row.date.toISOString().slice(0,10),hours:String(row.hours),hourlyRate:String(row.hourlyRate),costCenter:row.costCenter || "",amount:String(row.amount)}));
}
export async function machineCostReport(companyId:string,projectIds?:string[],date?:any){
 const projectFilter=projectIds?{projectId:{in:projectIds}}:{};
 const [usage,assignments]=await Promise.all([
  bookedMachineItems(companyId,projectIds,date),
  prisma.resourceAssignment.findMany({where:{companyId,resourceType:"MACHINE",...projectFilter,...(date?{date}:{})}})
 ]);
 const ids=[...new Set([...usage.map(x=>x.machineId),...assignments.map(x=>x.resourceId)])];
 const machines=await prisma.companyMachine.findMany({where:{companyId,...(projectIds?{OR:[{projectId:{in:projectIds}},{id:{in:ids}}]}:{})},orderBy:{name:"asc"}});
 // Maintenance currently has no project allocation; include it only in the company-wide authorized report.
 const maintenance=projectIds?[]:await prisma.companyMachineMaintenance.findMany({where:{companyId,status:"ERLEDIGT",...(date?{date}:{})}});
 const items=machines.map(machine=>{
  const entries=usage.filter(x=>x.machineId===machine.id);
  const hours=entries.reduce((s,x)=>s+usageDecimal(x.hours,"Stunden",2),0n);
  const amount=entries.reduce((s,x)=>s+usageDecimal(x.amount,"Betrag",12),0n);
  const maint=maintenance.filter(x=>x.machineId===machine.id).reduce((s,x)=>s+maintenanceCents(x.costNet),0n);
  return {machineId:machine.id,machineName:machine.name,projectId:projectIds?.length===1?projectIds[0]:null,plannedHours:assignments.filter(x=>x.resourceId===machine.id).reduce((s,x)=>s+x.hours,0),operatingHours:Number(moneyText(hours)),counterHours:machine.hours,hourlyRate:Number(machine.hourlyRate),usageCost:Number(moneyText(amount)),maintenanceCost:Number(moneyText(maint)),totalCost:Number(moneyText(amount+maint))};
 });
 const usageTotal=usage.reduce((sum,x)=>sum+usageDecimal(x.amount,"Betrag",12),0n);
 const maintenanceTotal=maintenance.reduce((sum,x)=>sum+maintenanceCents(x.costNet),0n);
 return {items,totals:{plannedHours:items.reduce((s,x)=>s+x.plannedHours,0),operatingHours:Number(moneyText(usage.reduce((sum,x)=>sum+usageDecimal(x.hours,"Stunden",2),0n))),usageCost:Number(moneyText(usageTotal)),maintenanceCost:Number(moneyText(maintenanceTotal)),totalCost:Number(moneyText(usageTotal+maintenanceTotal))},costSource:"BOOKED_MACHINE_USAGE",maintenanceIncluded:!projectIds};
}
