import {rankTechnicalFamilies} from './v3SemanticFamilyGate';
import {loadFamilyProductivityCoverage} from './v3FamilyProductivityCoverage';
/** A distinct technical headword is required; do not force a choice among ambiguous candidates. */
export function selectStrictFamily(trade:string,shortText:string,longText:string,unit:string,ai:any,archive:ReturnType<typeof loadFamilyProductivityCoverage>,families:string[]){
 const result=rankTechnicalFamilies(trade,shortText,longText,unit,ai,archive,families);
 const eligible=result.candidates.filter(x=>x.eligible);
 const short=shortText.toLocaleLowerCase('de-DE');
 const anchored=eligible.filter(c=>{
  const tail=c.family.split('/').slice(1).join(' ').toLocaleLowerCase('de-DE');
  const words=tail.match(/[a-zäöüß]{5,}/g)||[];
  return words.length>0&&words.every(w=>short.includes(w));
 });
 const unique=anchored.length===1?anchored[0]:null;
 return {status:'needs_review' as const,candidate:unique?.family||null,method:unique?.method||null,ambiguous:!unique,eligibleCount:eligible.length,strictMatches:anchored.length,approvedForEP:false};
}
