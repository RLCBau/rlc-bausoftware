import type {RlcAutonomousCalcResult} from "./types";
type Line=RlcAutonomousCalcResult["costLines"][number];
const key=(line:Line)=>[line.group,line.name.trim().toLocaleLowerCase("de-DE"),line.unit.trim().toLocaleLowerCase("de-DE"),line.unitPrice.toFixed(2)].join("|");
/** Find repeatable catalog-rate gaps without copying unsupported source documents. */
export function inventoryRlcMotorSourceGaps(results:ReadonlyArray<RlcAutonomousCalcResult|null>){
 const grouped=new Map<string,{group:string;name:string;unit:string;unitPrice:number;occurrences:number;withNotes:number;withoutNotes:number;notes:Set<string>}>();
 for(const result of results)for(const line of result?.costLines||[]){
  if(!Number.isFinite(line.unitPrice)||line.unitPrice<0)continue;
  const id=key(line);
  let found=grouped.get(id);
  if(!found){found={group:line.group,name:line.name,unit:line.unit,unitPrice:line.unitPrice,occurrences:0,withNotes:0,withoutNotes:0,notes:new Set()};grouped.set(id,found);}
  found.occurrences++;
  if(line.note?.trim()){found.withNotes++;found.notes.add(line.note.trim());}else found.withoutNotes++;
 }
 const entries=[...grouped.values()].filter(x=>x.withoutNotes>0).map(x=>({
  group:x.group,name:x.name,unit:x.unit,unitPrice:x.unitPrice,occurrences:x.occurrences,
  withoutNotes:x.withoutNotes,withNotes:x.withNotes,sourceStatus:x.notes.size===1?"reference_candidate":x.notes.size>1?"conflicting_reference_notes":"missing_source",
  candidateNote:x.notes.size===1?[...x.notes][0]:null,certified:false as const
 })).sort((a,b)=>b.withoutNotes-a.withoutNotes||a.name.localeCompare(b.name));
 return {entries,missingOccurrences:entries.reduce((sum,e)=>sum+e.withoutNotes,0),
  candidateOccurrences:entries.filter(e=>e.sourceStatus==="reference_candidate").reduce((sum,e)=>sum+e.withoutNotes,0),
  approvedForEP:false as const,productionWriteAllowed:false as const};
}
