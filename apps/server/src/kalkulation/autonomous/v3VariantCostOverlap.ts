import type {RlcAutonomousCalcResult} from "./types";
const normalize=(s:string)=>String(s||"").toLocaleLowerCase("de-DE").replace(/\b(?:dn|da)\s*\d+\b/g," ").replace(/\d+(?:[.,]\d+)?/g," ").replace(/[^a-zäöüß]+/g," ").trim();
export function diagnoseV3VariantCostOverlap(base:RlcAutonomousCalcResult|null,variant:RlcAutonomousCalcResult|null){
 const a=base?.costLines||[],b=variant?.costLines||[];
 const matches=b.flatMap((v,index)=>{
   const key=normalize(v.name), words=new Set(key.split(" ").filter(w=>w.length>=5));
   return a.filter(x=>x.group===v.group).map(x=>{
     const other=normalize(x.name), tokens=other.split(" ").filter(w=>w.length>=5);
     const overlap=tokens.filter(w=>words.has(w)).length;
     return {base:x.name,variant:v.name,group:v.group,variantLine:index,sharedTokens:overlap,similarity:tokens.length&&words.size?overlap/Math.max(tokens.length,words.size):0};
   }).filter(x=>x.similarity>=0.7&&x.sharedTokens>=2);
 });
 const duplicateGroups=[...new Set(matches.map(m=>m.group))];
 return {baseLineCount:a.length,variantLineCount:b.length,possibleOverlaps:matches,duplicateGroups,
   status:!a.length||!b.length?"missing_cost_lines":matches.length?"possible_double_count":"no_lexical_overlap_detected",
   provenDoubleCount:false as const,approvedForEP:false as const,productionWriteAllowed:false as const};
}
