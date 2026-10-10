import {loadFamilyProductivityCoverage} from './v3FamilyProductivityCoverage';
import {rankTechnicalFamilies} from './v3SemanticFamilyGate';
import {routeGaebToProductivity} from './v3GaebProductivityBridge';
import {calculateApprovedAiResources,ApprovedCostEvidence} from './technicalAiCostBridge';
import {selectStrictFamily} from './v3StrictFamilySelection';
import {previewGaebResourceCosts,CostRecipe} from './v3GaebCostPreview';
export type ShadowPosition={id:string;trade:string;unit:string;shortText:string;longText:string};
/** Read-only diagnostic pipeline; never writes an EP. */
export function evaluateV3Shadow(p:ShadowPosition,ai:any,archive:ReturnType<typeof loadFamilyProductivityCoverage>,names:string[],approvedRates:ApprovedCostEvidence[]=[],costInput?:{position:string;quantity:number|string;recipe:CostRecipe}){
 const matching=rankTechnicalFamilies(p.trade,p.shortText,p.longText,p.unit,ai,archive,names);
 const eligible=matching.candidates.filter(x=>x.eligible);
 const strict=selectStrictFamily(p.trade,p.shortText,p.longText,p.unit,ai,archive,names);
 const family=eligible.length===1?eligible[0].family:null;
 const routing=family?routeGaebToProductivity({id:p.id,family,unit:p.unit,shortText:p.shortText,longText:p.longText},archive):null;
 const costing=calculateApprovedAiResources({shortText:p.shortText,longText:p.longText,unit:p.unit},ai,approvedRates);
 const resourceCostPreview=costInput?previewGaebResourceCosts({id:p.id,position:costInput.position,quantity:costInput.quantity,unit:p.unit},costInput.recipe):null;
 return {id:p.id,resourceCostPreview,status:'needs_review' as const,candidateFamily:family,strictAdvisoryFamily:strict.candidate,strictMatches:strict.strictMatches,alternatives:eligible.length,method:routing?.candidateMethod||null,technicalParameters:routing?.technicalParameters||[],missingProductionInputs:routing?.requiredProductionInputs||['canonical_family_required'],costingStatus:costing.status,costingReasons:costing.reason,unitPriceEUR:null,productionWriteAllowed:false};
}
