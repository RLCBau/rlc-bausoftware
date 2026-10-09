import {decomposeTechnicalPosition} from './technicalPositionDecomposer';
import type {RlcAutonomousCalcInput} from './types';
import {validateEvidence} from './technicalEvidence';
import type {FrostschutzParameters,AsphaltCutParameters} from './technicalProductionRecipe';

export type ProductivityRecord =
  | {type:'frostschutz';id:string;unit:'m3';grain:string;parameters:FrostschutzParameters;approved:boolean}
  | {type:'asphalt_cut';id:string;unit:'m';thicknessMinCm:number;thicknessMaxCm:number;parameters:AsphaltCutParameters;approved:boolean};

/** Closed-world registry: NEVER infer dimensions from similar neighboring positions. */
export class TechnicalProductivityRegistry {
 private readonly records = new Map<string,ProductivityRecord>();
 add(record:ProductivityRecord):void {
   if(!record.id.trim()||this.records.has(record.id))throw new Error('duplicate_or_empty_recipe_id');
   if(!record.approved)throw new Error('unapproved_recipe');
   const checks = record.type==='frostschutz' ? (()=>{
     const p=record.parameters;
     return [[p.evidence.density,'t/m3',p.densityTPerCompactedM3],
      [p.evidence.material,'EUR/t',p.materialEURPerT],
      [p.evidence.transport,'EUR/t',p.transportEURPerT],
      [p.evidence.loaderProductivity,'m3/h',p.loaderM3PerHour],
      [p.evidence.rollerProductivity,'m3/h',p.rollerM3PerHour],
      [p.evidence.workerProductivity,'m3/h',p.workerM3PerHour]] as const;
   })() : (()=>{
     const p=record.parameters;
     return [[p.evidence.speed,'m/h',p.cuttingMPerHour],
      [p.evidence.blade,'EUR/m',p.bladeWearEURPerM],
      [p.evidence.operator,'h/h',p.operatorHoursPerMachineHour]] as const;
   })();
   for(const [evidence,unit,value] of checks)
     if(validateEvidence(evidence,unit,value).length)throw new Error('invalid_recipe_evidence');
   this.records.set(record.id,record);
 }
 resolve(row:RlcAutonomousCalcInput):{record:ProductivityRecord|null;reason:string} {
   const d=decomposeTechnicalPosition(row);
   if(d.object==='frostschutz_layer'&&d.unit==='m3'&&d.dimensions.grain){
     const eligible=[...this.records.values()].filter((r):r is Extract<ProductivityRecord,{type:'frostschutz'}>=>r.type==='frostschutz'&&r.grain===d.dimensions.grain&&r.approved);
     return eligible.length===1?{record:eligible[0],reason:'exact_frostschutz_grain_unit'}:{record:null,reason:eligible.length?'ambiguous_recipe':'no_exact_recipe'};
   }
   if(d.object==='asphalt_cut'&&d.unit==='m'&&d.dimensions.thicknessCm){
     const eligible=[...this.records.values()].filter((r):r is Extract<ProductivityRecord,{type:'asphalt_cut'}>=>r.type==='asphalt_cut'&&r.approved&&r.thicknessMinCm===d.dimensions.thicknessCm&&r.thicknessMaxCm===d.dimensions.thicknessCm);
     return eligible.length===1?{record:eligible[0],reason:'exact_asphalt_thickness_unit'}:{record:null,reason:eligible.length?'ambiguous_recipe':'no_exact_recipe'};
   }
   return {record:null,reason:'missing_or_incompatible_technical_signature'};
 }
 size():number{return this.records.size;}
}
