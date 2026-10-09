import {loadFamilyProductivityCoverage} from './v3FamilyProductivityCoverage';
export type LunaInterpretation={mainWork?:string;operation?:string;resourcePlan?:Array<{type:string;task:string}>};
/** Conservative lexical shortlist; overlap cannot be treated as proven classification. */
export function shortlistLunaFamilies(trade:string,shortText:string,longText:string,ai:LunaInterpretation,archive:ReturnType<typeof loadFamilyProductivityCoverage>,familyNames:string[]){
 const text=[shortText,longText,ai.mainWork||'',...(ai.resourcePlan||[]).map(x=>x.task)].join(' ').toLocaleLowerCase('de-DE');
 const tokens=new Set((text.match(/[a-zäöüß]{5,}/g)||[]));
 const exact=familyNames.filter(x=>x.startsWith(trade+'/'));
 const candidates=exact.map(f=>{
  const segments=f.split('/').slice(1).join(' ').toLocaleLowerCase('de-DE');
  const words=segments.match(/[a-zäöüß]{5,}/g)||[];
  const matched=words.filter(w=>tokens.has(w));
  return {family:f,method:archive.lookup(f)?.method||'unknown',matched,score:words.length?matched.length/words.length:0};
 }).filter(x=>x.score>0&&x.method!=='unknown').sort((a,b)=>b.score-a.score||b.matched.length-a.matched.length).slice(0,5);
 return {status:'needs_review' as const,trade,candidates,selectedFamily:null,approvedForEP:false,reason:candidates.length?'candidate_requires_technical_verification':'no_supported_family_match'};
}
