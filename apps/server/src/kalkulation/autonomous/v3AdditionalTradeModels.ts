import {calculateEngineeringCycleEstimate} from './v3EngineeringThroughput';
export type AdditionalTradeInput=
 | {kind:'asphalt';tonnesPerCycle:number;cycleMinutes:number;effectiveMinutesPerHour:number;workers:number}
 | {kind:'concrete';m3PerCycle:number;cycleMinutes:number;effectiveMinutesPerHour:number;workers:number}
 | {kind:'landscaping';m2PerCycle:number;cycleMinutes:number;effectiveMinutesPerHour:number;workers:number}
 | {kind:'disposal';tonnesPerLoad:number;roundTripMinutes:number;effectiveMinutesPerHour:number;workers:number}
 | {kind:'inspection';testsPerCycle:number;minutesPerCycle:number;effectiveMinutesPerHour:number;workers:number};
/** Candidate throughput only. Require approved site observations before commercial pricing. */
export function estimateAdditionalTrade(p:AdditionalTradeInput){
 let qty:number,minutes:number,unit:string;
 switch(p.kind){
  case 'asphalt':qty=p.tonnesPerCycle;minutes=p.cycleMinutes;unit='t';break;
  case 'concrete':qty=p.m3PerCycle;minutes=p.cycleMinutes;unit='m3';break;
  case 'landscaping':qty=p.m2PerCycle;minutes=p.cycleMinutes;unit='m2';break;
  case 'disposal':qty=p.tonnesPerLoad;minutes=p.roundTripMinutes;unit='t';break;
  case 'inspection':qty=p.testsPerCycle;minutes=p.minutesPerCycle;unit='test';break;
 }
 return {...calculateEngineeringCycleEstimate({quantityPerCycle:qty,cycleSeconds:minutes*60,effectiveMinutesPerHour:p.effectiveMinutesPerHour,workers:p.workers,unit}),model:p.kind};
}
