export type ReviewedFamily={id:string;referenceFamily:string|null;referenceStatus:string;reviewer:string|null;reviewEvidence:string|null;reviewedAt:string|null;proposedFamily:string|null};
/** Independent reference labels must never be generated from the classifier itself. */
export function scoreReviewedFamilies(rows:ReviewedFamily[]){
 const ids=new Set<string>();let verified=0,correct=0,incorrect=0;
 for(const r of rows){
  if(!r.id||ids.has(r.id))throw Error('duplicate_or_missing_id');ids.add(r.id);
  if(r.referenceStatus==='verified'){
   if(!r.referenceFamily||!r.reviewer||!r.reviewEvidence||!r.reviewedAt)throw Error('unsubstantiated_reference_label:'+r.id);
   verified++;if(r.proposedFamily===r.referenceFamily)correct++;else incorrect++;
  }else if(r.referenceStatus!=='unreviewed')throw Error('invalid_review_status:'+r.id);
 }
 return {total:rows.length,verified,unreviewed:rows.length-verified,correct,incorrect,accuracy:verified?correct/verified:null,productionApproved:false};
}
