import type {RlcAutonomousCalcInput} from './types';
import type {TechnicalCostResult} from './technicalCostComposer';
import {TechnicalProductivityRegistry} from './technicalProductivityRegistry';
import {calculateAsphaltCutProduction,calculateFrostschutzProduction} from './technicalProductionRecipe';

/** V3 isolated execution: all matches revalidate technical evidence. */
export function calculateWithTechnicalRegistry(row:RlcAutonomousCalcInput,registry:TechnicalProductivityRegistry):TechnicalCostResult {
 const match=registry.resolve(row);
 if(!match.record)return {status:'needs_review',unitPriceEUR:null,lines:[],reason:[match.reason],scope:'registry/no_match'};
 return match.record.type==='frostschutz' ? calculateFrostschutzProduction(row,match.record.parameters) : calculateAsphaltCutProduction(row,match.record.parameters);
}
