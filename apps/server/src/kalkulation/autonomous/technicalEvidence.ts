export type TechnicalEvidence={id:string;sourceType:'supplier_list'|'invoice'|'site_measurement'|'machine_log'|'transport_quote';url?:string;documentId?:string;date:string;item:string;unit:string;value:number;approvedBy?:string;approvedAt?:string};
export type EvidenceBundle={density:TechnicalEvidence;material:TechnicalEvidence;transport:TechnicalEvidence;loaderProductivity:TechnicalEvidence;rollerProductivity:TechnicalEvidence;workerProductivity:TechnicalEvidence};
export function validateEvidence(e:TechnicalEvidence,expectedUnit:string,expectedValue:number):string[]{
 const errors:string[]=[];
 if(!e||!e.id||!e.sourceType||!e.date||!e.item)errors.push('incomplete_evidence');
 if(!e?.url&&!e?.documentId)errors.push('evidence_document_missing');
 if(e?.unit!==expectedUnit)errors.push('evidence_unit_mismatch');
 if(!Number.isFinite(e?.value)||e.value!==expectedValue||e.value<=0)errors.push('evidence_value_mismatch');
 if(!e?.approvedBy||!e?.approvedAt)errors.push('evidence_not_approved');
 if(e?.sourceType==='supplier_list'&&/productivity|transport|verdichtung|leistung/i.test(e.item))errors.push('invalid_source_type_for_technical_parameter');
 return errors;
}
