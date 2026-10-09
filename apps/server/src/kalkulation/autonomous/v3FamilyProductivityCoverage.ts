import fs from 'fs';
export type FamilyProductivityStatus={family:string;positions:number;method:string;verifiedRate:number|null;status:string;approvedForEP:boolean};
/** Registry is a routing index only. Never treat a candidate model as validated productivity. */
export function loadFamilyProductivityCoverage(filePath:string){
 const data=JSON.parse(fs.readFileSync(filePath,'utf8'));
 if(data.schema!=='rlc-productivity-coverage/v1'||!Array.isArray(data.families))throw new Error('invalid_productivity_coverage_schema');
 const index=new Map<string,FamilyProductivityStatus>();
 for(const row of data.families){
  if(!row.family||index.has(row.family))throw new Error('invalid_or_duplicate_family');
  if(row.approvedForEP!==false||row.verifiedRate!==null)throw new Error('unreviewed_productivity_cannot_be_approved');
  index.set(row.family,row);
 }
 return {familyCount:index.size,lookup:(family:string)=>index.get(family)||null,mayPrice:(_family:string)=>false};
}
