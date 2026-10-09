import {rankTechnicalFamilies} from './v3SemanticFamilyGate';
import {loadFamilyProductivityCoverage} from './v3FamilyProductivityCoverage';
import {familyContradictions} from './v3FamilyContradictionGate';
import {extractPrimaryWorkScope} from './v3PrimaryWorkScope';
const normalize=(s:string)=>s.toLocaleLowerCase('de-DE').replace(/[^a-zäöüß0-9]+/g,' ');
/** Conservative feature ranking. Results are advisory and never auto-approved. */
export function selectByTechnicalFeatures(trade:string,shortText:string,longText:string,unit:string,ai:any,archive:ReturnType<typeof loadFamilyProductivityCoverage>,families:string[]){
 const gate=rankTechnicalFamilies(trade,shortText,longText,unit,ai,archive,families);
 const primary=extractPrimaryWorkScope(shortText,longText,ai);
 const scope=normalize(primary.principalText+' '+primary.primaryLangtext+' '+primary.aiMainWork);
 const technical=(ai?.technicalParameters||[]).map((x:any)=>normalize(String(x.name||'')+' '+String(x.value||''))).join(' ');
 const resources=(ai?.resourcePlan||[]).map((x:any)=>normalize(String(x.task||''))).join(' ');
 const choices=gate.candidates.filter(x=>x.eligible&&!familyContradictions(shortText,longText,x.family).length).map(x=>{
  const terms=(normalize(x.family.split('/').slice(1).join(' ')).match(/[a-zäöüß]{5,}/g)||[]);
  const score=terms.reduce((s,t)=>s+(scope.includes(t)?3:0)+(technical.includes(t)?2:0)+(resources.includes(t)?1:0),0);
  return {...x,featureScore:score,featureEvidence:terms.filter(t=>scope.includes(t)||technical.includes(t)||resources.includes(t))};
 }).sort((a,b)=>b.featureScore-a.featureScore);
 const winner=choices.length&&choices[0].featureScore>=3&&(choices.length===1||choices[0].featureScore>=choices[1].featureScore+3)?choices[0]:null;
 return {status:'needs_review' as const,proposedFamily:winner?.family||null,alternatives:choices,approval:false,reason:winner?'feature_candidate_requires_validation':'insufficient_distinctive_features'};
}
