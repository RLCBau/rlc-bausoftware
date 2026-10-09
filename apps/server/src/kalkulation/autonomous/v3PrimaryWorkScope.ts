/** Separate contractual principal scope from ancillary verbs, keeping evidence visible. */
const clean=(s:string)=>s.toLocaleLowerCase('de-DE').replace(/width:\d+pt|\\\*\w+/g,' ').replace(/\s+/g,' ').trim();
export function extractPrimaryWorkScope(shortText:string,longText:string,ai:any){
 const short=clean(shortText),long=clean(longText),main=clean(String(ai?.mainWork||''));
 const ancillary=/\b(einschl(?:ießlich)?|inklusive|nebst|sowie|mit allen nebenleistungen)\b/i;
 const head=long.split(ancillary)[0].trim();
 const operations=[{name:'remove',re:/\b(abbrechen|abbruch|ausbauen|abtragen|rückbauen|demontieren)\b/},{name:'supply',re:/\b(liefern|lieferung|bereitstellen)\b/},{name:'install',re:/\b(einbauen|verlegen|montieren|herstellen|aufbringen)\b/}];
 const evidence=[short,head,main].filter(Boolean);
 const matches=operations.filter(o=>o.re.test(short+' '+head)).map(o=>o.name);
 return {principalText:short||head,primaryLangtext:head,aiMainWork:main,operationCandidates:matches,operationAmbiguous:matches.length!==1,ancillaryText:long.slice(head.length).trim(),evidence,status:'needs_review' as const};
}
