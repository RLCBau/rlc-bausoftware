import type {RlcAutonomousCalcResult} from "./types";
type ResourceLine=RlcAutonomousCalcResult["costLines"][number];
const norm=(s:string)=>String(s||"").normalize("NFKC").toLocaleLowerCase("de-DE").replace(/\s+/g," ").trim();
const signature=(line:ResourceLine)=>[line.group,norm(line.name),norm(line.unit),Number(line.unitPrice).toFixed(2)].join("|");

/** Evidence reuse requires exact resource, unit and 2026 rate identity; never fabricates certification. */
export function matchV3UrkSourceCandidates(target:RlcAutonomousCalcResult|null, reference:ReadonlyArray<RlcAutonomousCalcResult|null>){
 const catalog=new Map<string,Set<string>>();
 for(const result of reference)for(const line of result?.costLines||[]){
  if(!line.note?.trim())continue;
  const key=signature(line);
  if(!catalog.has(key))catalog.set(key,new Set());
  catalog.get(key)!.add(line.note.trim());
 }
 const matches=(target?.costLines||[]).map((line,index)=>{
  const original=line.note?.trim()||null;
  const candidates=original?[]:[...(catalog.get(signature(line))||[])];
  return {index,group:line.group,name:line.name,sourceStatus:original?"already_documented":candidates.length===1?"exact_candidate":candidates.length>1?"ambiguous_candidates":"unmatched",
    candidateSource:candidates.length===1?candidates[0]:null,documentaryEvidenceVerified:false as const};
 });
 return {matches,exactCandidates:matches.filter(x=>x.sourceStatus==="exact_candidate").length,
   ambiguous:matches.filter(x=>x.sourceStatus==="ambiguous_candidates").length,
   unmatched:matches.filter(x=>x.sourceStatus==="unmatched").length,
   approvedForEP:false as const,productionWriteAllowed:false as const};
}
