import {calculateEngineeringCycleEstimate} from './v3EngineeringThroughput';
export type TradeModelInput =
 | {kind:'excavation';bucketM3:number;fillFactor:number;cycleSeconds:number;effectiveMinutesPerHour:number;workers:number}
 | {kind:'haulage';payloadTonnes:number;cycleMinutes:number;effectiveMinutesPerHour:number;workers:number}
 | {kind:'paving';areaM2PerCycle:number;cycleMinutes:number;effectiveMinutesPerHour:number;workers:number}
 | {kind:'pipe';lengthMPerCycle:number;cycleMinutes:number;effectiveMinutesPerHour:number;workers:number}
 | {kind:'compaction';effectiveWidthM:number;speedMPerMinute:number;passes:number;effectiveMinutesPerHour:number;workers:number};
/** Unit-specific physical throughput. Calculated outputs are NOT verified site observations. */
export function estimateTradeProductivity(p:TradeModelInput){
 let qty:number,seconds:number,unit:string;
 switch(p.kind){
  case 'excavation': qty=p.bucketM3*p.fillFactor; seconds=p.cycleSeconds;unit='m3';if(p.fillFactor>1.5)return {status:'needs_review' as const,reason:'fill_factor_out_of_range'};break;
  case 'haulage':qty=p.payloadTonnes;seconds=p.cycleMinutes*60;unit='t';break;
  case 'paving':qty=p.areaM2PerCycle;seconds=p.cycleMinutes*60;unit='m2';break;
  case 'pipe':qty=p.lengthMPerCycle;seconds=p.cycleMinutes*60;unit='m';break;
  case 'compaction':qty=p.effectiveWidthM*p.speedMPerMinute/p.passes;seconds=60;unit='m2';break;
 }
 const r=calculateEngineeringCycleEstimate({quantityPerCycle:qty,cycleSeconds:seconds,effectiveMinutesPerHour:p.effectiveMinutesPerHour,workers:p.workers,unit});
 return {...r,model:p.kind};
}
