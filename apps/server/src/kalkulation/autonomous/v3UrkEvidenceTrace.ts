import type {RlcAutonomousCalcResult} from "./types";

/** Read-only origin inventory from V2 Urkalkulation; a source note is not authenticated evidence. */
export function traceV3UrkEvidence(result:RlcAutonomousCalcResult|null){
 const lines=(result?.costLines||[]).map((line,index)=>{
  const raw=typeof line.note==="string"?line.note.trim():"";
  const sourcePresent=raw.length>0;
  const generic=/^(?:rlc\s*20\d\d|intern|katalog|schätzung|annahme|pauschal)/i.test(raw);
  const numericValid=Number.isFinite(line.qty)&&line.qty>=0&&Number.isFinite(line.unitPrice)&&line.unitPrice>=0&&Number.isFinite(line.total)&&line.total>=0;
  return {index,group:line.group,resourceName:line.name,sourceNote:raw||null,provenance:line.provenance||null,sourceStatus:!sourcePresent?"missing":generic?"internal_reference":"unverified_reference",
   numericalIntegrity:numericValid&&Math.abs(line.qty*line.unitPrice-line.total)<=0.02,
   documentaryEvidenceVerified:false as const};
 });
 return {lines,total:lines.length,withSourceNote:lines.filter(x=>!!x.sourceNote).length,
   missingSourceNote:lines.filter(x=>!x.sourceNote).length,
   internalReferences:lines.filter(x=>x.sourceStatus==="internal_reference").length,
   invalidArithmetic:lines.filter(x=>!x.numericalIntegrity).length,
   certifiedResourceCount:0 as const,approvedForEP:false as const,productionWriteAllowed:false as const};
}
