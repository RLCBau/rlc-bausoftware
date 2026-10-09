import {shortlistLunaFamilies,LunaInterpretation} from './v3LunaFamilyMatcher';
import {loadFamilyProductivityCoverage} from './v3FamilyProductivityCoverage';
const norm=(s:string)=>s.toLocaleLowerCase('de-DE');
const removal=/abbruch|abtragen|ausbauen|rückbau|entsorgen|demontage/;
const installation=/einbauen|herstellen|verlegen|montieren|aufbringen/;
/** Reject strong operation contradictions; shortlist remains advisory only. */
export function rankTechnicalFamilies(trade:string,shortText:string,longText:string,unit:string,ai:LunaInterpretation,archive:ReturnType<typeof loadFamilyProductivityCoverage>,families:string[]){
 const raw=shortlistLunaFamilies(trade,shortText,longText,ai,archive,families);
 const scope=norm(shortText+' '+longText), op=ai.operation||'unknown';
 const candidates=raw.candidates.map(c=>{
  const name=norm(c.family), issues:string[]=[];
  if(op==='remove'&&installation.test(name)&&!removal.test(name))issues.push('operation_conflict');
  if(['construct','install','supply'].includes(op)&&removal.test(name)&&!installation.test(name))issues.push('operation_conflict');
  if(removal.test(scope)&&installation.test(name)&&!removal.test(name))issues.push('scope_conflict');
  if(/\bm²|\bm2/i.test(unit)&&/regie\/personal|regie\/bagger/i.test(name))issues.push('unit_scope_conflict');
  return {...c,issues,eligible:issues.length===0};
 });
 const eligible=candidates.filter(c=>c.eligible);
 return {status:'needs_review' as const,selectedFamily:null,approvedForEP:false,candidates,eligibleCount:eligible.length,reason:eligible.length?'technical_candidate_requires_validation':'no_eligible_family'};
}
