import {loadFamilyProductivityCoverage} from './v3FamilyProductivityCoverage';
export type GaebScope={id:string;family:string;unit:string;shortText:string;longText:string};
const required:Record<string,string[]>={excavation_cycle:['bucketM3','fillFactor','cycleSeconds','effectiveMinutesPerHour','workers'],haulage_cycle:['payloadTonnes','cycleMinutes','effectiveMinutesPerHour','workers'],compaction_area:['effectiveWidthM','speedMPerMinute','passes','effectiveMinutesPerHour','workers'],paving_area:['areaM2PerCycle','cycleMinutes','effectiveMinutesPerHour','workers'],pipe_install:['lengthMPerCycle','cycleMinutes','effectiveMinutesPerHour','workers'],asphalt_output:['tonnesPerCycle','cycleMinutes','effectiveMinutesPerHour','workers'],concrete_output:['m3PerCycle','cycleMinutes','effectiveMinutesPerHour','workers'],landscaping_output:['m2PerCycle','cycleMinutes','effectiveMinutesPerHour','workers'],inspection_duration:['testsPerCycle','minutesPerCycle','effectiveMinutesPerHour','workers']};
/** Technical GAEB routing, never an approved productivity or unit price. */
export function routeGaebToProductivity(row:GaebScope,archive:ReturnType<typeof loadFamilyProductivityCoverage>){
 const canonicalFamily=row.family.includes('/')?row.family:'';
 const family=canonicalFamily?archive.lookup(canonicalFamily):null;
 const text=(row.shortText+' '+row.longText).toLowerCase();
 const technicalParameters:{name:string;value:number;unit:string;source:string}[]=[];
 const thickness=text.match(/bettungsdicke\s*:\s*(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*cm/);
 if(thickness){technicalParameters.push({name:'thickness_min',value:Number(thickness[1].replace(',','.'))/100,unit:'m',source:'LV Langtext'});technicalParameters.push({name:'thickness_max',value:Number(thickness[2].replace(',','.'))/100,unit:'m',source:'LV Langtext'});}
 const candidate=family?.method||'unknown';
 return {id:row.id,family:row.family,candidateMethod:candidate,technicalParameters,requiredProductionInputs:required[candidate]||['technical_work_decomposition','site_productivity_evidence'],status:'needs_review' as const,approvedForEP:false,unitPriceEUR:null};
}
