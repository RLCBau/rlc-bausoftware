export type CycleEstimateInput={quantityPerCycle:number;cycleSeconds:number;effectiveMinutesPerHour:number;workers:number;unit:string};
/** Physics estimate only. It cannot authorize an EP without site evidence. */
export function calculateEngineeringCycleEstimate(x:CycleEstimateInput){
 if(!x||!Number.isFinite(x.quantityPerCycle)||x.quantityPerCycle<=0||!Number.isFinite(x.cycleSeconds)||x.cycleSeconds<=0||!Number.isFinite(x.effectiveMinutesPerHour)||x.effectiveMinutesPerHour<=0||x.effectiveMinutesPerHour>60||!Number.isInteger(x.workers)||x.workers<1||!x.unit)return {status:'needs_review' as const,quantityPerHour:null,personHoursPerUnit:null,approvedForEP:false};
 const quantityPerHour=x.quantityPerCycle*3600/x.cycleSeconds*x.effectiveMinutesPerHour/60;
 return {status:'engineering_estimate' as const,quantityPerHour,personHoursPerUnit:x.workers/quantityPerHour,unit:x.unit,approvedForEP:false};
}
