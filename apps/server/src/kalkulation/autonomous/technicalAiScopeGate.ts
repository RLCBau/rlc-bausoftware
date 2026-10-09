export function checkTechnicalAiScope(shortText:string,longText:string,unit:string,answer:any):string[]{
 const short=shortText.toLowerCase(); const whole=(shortText+' '+longText).toLowerCase();
 const kinds=new Set((Array.isArray(answer?.resourcePlan)?answer.resourcePlan:[]).map((x:any)=>x.type));
 const issues:string[]=[];
 if(/herstellen/.test(short)&&answer.operation==='supply')issues.push('construction_misread_as_supply');
 if(/abbrechen|rückbauen|ausbauen/.test(short)&&!['remove','dispose'].includes(answer.operation))issues.push('demolition_operation_mismatch');
 if(/entsorgen|kippgebühr|entsorgung/.test(whole)&&!kinds.has('disposal'))issues.push('disposal_missing');
 if(/abfahren|abtransport|fördern/.test(whole)&&!kinds.has('transport'))issues.push('transport_missing');
 if(/zwischengelagert|bauseits gestellt/.test(whole)&&kinds.has('material'))issues.push('existing_material_purchase_risk');
 if(answer?.unit&&answer.unit.trim().toLowerCase()!==unit.trim().toLowerCase())issues.push('billing_unit_mismatch');
 return issues;
}
