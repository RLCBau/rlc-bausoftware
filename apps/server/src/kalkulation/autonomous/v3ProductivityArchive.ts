export type SiteProductionObservation={
 id:string;companyId:string;projectId:string;positionId:string;signature:string;unit:string;
 executedQuantity:number;workers:number;productiveWorkerHours:number;machineHours:number;
 haulDistanceKm:number|null;deliveryTonnes:number|null;
 conditions:string;periodStart:string;periodEnd:string;supervisor:string;evidenceId:string;
};
export type ProductivityMetric={signature:string;unit:string;observations:number;totalQuantity:number;totalPersonHours:number;personHoursPerUnit:number;unitsPerPersonHour:number;evidenceIds:string[];status:'site_verified'};
const validPositive=(x:number)=>Number.isFinite(x)&&x>0;
/** Require genuine site measurement; a published benchmark is not a measured observation. */
export function validateSiteObservation(o:SiteProductionObservation):string[]{
 const errors:string[]=[];
 for(const field of ['id','companyId','projectId','positionId','signature','unit','conditions','periodStart','periodEnd','supervisor','evidenceId'] as const)
   if(!o?.[field]?.trim())errors.push('missing_'+field);
 if(!validPositive(o?.executedQuantity))errors.push('invalid_executed_quantity');
 if(!Number.isInteger(o?.workers)||o.workers<=0)errors.push('invalid_workers');
 if(!validPositive(o?.productiveWorkerHours))errors.push('invalid_person_hours');
 if(!Number.isFinite(o?.machineHours)||o.machineHours<0)errors.push('invalid_machine_hours');
 if(o.haulDistanceKm!==null&&(!Number.isFinite(o.haulDistanceKm)||o.haulDistanceKm<0))errors.push('invalid_haul_distance');
 if(o.deliveryTonnes!==null&&(!Number.isFinite(o.deliveryTonnes)||o.deliveryTonnes<0))errors.push('invalid_delivery_tonnes');
 if(o.periodStart&&o.periodEnd&&o.periodEnd<o.periodStart)errors.push('invalid_measurement_period');
 return errors;
}
export function aggregateMeasuredProductivity(rows:SiteProductionObservation[]):ProductivityMetric[]{
 const groups=new Map<string,SiteProductionObservation[]>();
 for(const row of rows){const errors=validateSiteObservation(row);if(errors.length)throw Error('Invalid site observation '+row.id+':'+errors.join(','));
  const key=[row.companyId,row.signature,row.unit].join('|');const group=groups.get(key)||[];group.push(row);groups.set(key,group);
 }
 return [...groups.values()].map(list=>{const totalQuantity=list.reduce((x,o)=>x+o.executedQuantity,0);
  const totalPersonHours=list.reduce((x,o)=>x+o.productiveWorkerHours,0);
  return {signature:list[0].signature,unit:list[0].unit,observations:list.length,totalQuantity,totalPersonHours,personHoursPerUnit:totalPersonHours/totalQuantity,unitsPerPersonHour:totalQuantity/totalPersonHours,evidenceIds:list.map(x=>x.evidenceId),status:'site_verified' as const};});
}
