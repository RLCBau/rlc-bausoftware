/** Engineering calculation from measured site cycles, independent of commercial catalogues. */
export type CycleObservation={task:'excavation'|'haulage'|'bedding';cycleSeconds:number;quantityPerCycle:number;quantityUnit:'m3'|'t'|'m2';effectiveMinutesPerHour:number;workers:number;measurementId:string;measuredBy:string;siteId:string};
export function calculateMeasuredCycleProductivity(o:CycleObservation){
 const errors:string[]=[];
 if(!o||!['excavation','haulage','bedding'].includes(o.task))errors.push('task_missing');
 if(!Number.isFinite(o?.cycleSeconds)||o.cycleSeconds<=0)errors.push('cycle_time_missing');
 if(!Number.isFinite(o?.quantityPerCycle)||o.quantityPerCycle<=0)errors.push('cycle_output_missing');
 if(!Number.isFinite(o?.effectiveMinutesPerHour)||o.effectiveMinutesPerHour<=0||o.effectiveMinutesPerHour>60)errors.push('working_minutes_invalid');
 if(!Number.isInteger(o?.workers)||o.workers<=0)errors.push('crew_invalid');
 if(!o?.measurementId||!o?.measuredBy||!o?.siteId)errors.push('measured_evidence_missing');
 if(errors.length)return {status:'needs_review' as const,errors,productionPerHour:null,personHoursPerUnit:null};
 const productionPerHour=o.quantityPerCycle*(o.effectiveMinutesPerHour*60/o.cycleSeconds);
 return {status:'measured' as const,errors:[],productionPerHour,personHoursPerUnit:o.workers/productionPerHour,unit:o.quantityUnit,source:o.measurementId};
}
