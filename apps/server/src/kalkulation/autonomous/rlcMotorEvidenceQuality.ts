import type {RlcAutonomousCalcResult} from "./types";

/** RLC Motor-owned source quality: references are inventory, not authorization. */
export function inspectRlcMotorEvidence(result:RlcAutonomousCalcResult|null){
 const details=(result?.costLines||[]).map((line,index)=>{
  const note=String(line.note||"").trim();
  const hasUrl=/https?:\/\/[^\s;)]+/i.test(note);
  const dated=/\b20\d{2}[-./]\d{1,2}[-./]\d{1,2}\b/.test(note);
  const internal=!!line.provenance&&line.provenance.origin==="rlc_v2_family_catalog";
  const kind=!note?"catalog_without_source":hasUrl&&dated?"dated_external_reference":hasUrl?"external_reference_without_date":"unverified_note";
  return {index,group:line.group,name:line.name,kind,originRecorded:internal,
    sourceNote:note||null,verified:false as const};
 });
 const counts=details.reduce((a,x)=>(a[x.kind]=(a[x.kind]||0)+1,a),{} as Record<string,number>);
 return {details,counts,verified:0 as const,approvedForEP:false as const,productionWriteAllowed:false as const};
}
