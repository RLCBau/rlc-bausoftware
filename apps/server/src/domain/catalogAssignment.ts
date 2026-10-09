import {InputError} from './officeAddons';
import {certificateDate} from './personnelCertificate';
import {berlinToday} from './machineUsage';
export class AssignmentError extends InputError{constructor(message:string,public status=400){super(message);}}
export function assignmentKind(v:any){if(v!=='LICENSE_CLASS'&&v!=='HAZARD_CLASS')throw new InputError('Zuordnungsart ungültig.');return v as string;}
export function assignmentInput(body:any,kind:string,old:any={}){
 if(!body||typeof body!=='object'||Array.isArray(body))throw new InputError('Ungültige Zuordnung.');
 const validUntil=certificateDate(body.validUntil===undefined?old.validUntil?.toISOString():body.validUntil);
 const checkedAt=certificateDate(body.checkedAt===undefined?old.checkedAt?.toISOString():body.checkedAt);
 if(kind==='HAZARD_CLASS'&&validUntil)throw new InputError('Ablaufdatum nur für Führerscheintypen.');
 if(checkedAt&&checkedAt.toISOString().slice(0,10)>berlinToday())throw new InputError('Sichtungsdatum darf nicht in der Zukunft liegen.');
 const notes=body.notes===undefined?old.notes:body.notes;if(notes!=null&&(typeof notes!=='string'||notes.length>5000))throw new InputError('Bemerkung: maximal 5000 Zeichen.');
 const active=body.active===undefined?old.active??true:body.active;if(typeof active!=='boolean')throw new InputError('Aktiv muss Ja oder Nein sein.');
 return {validUntil,checkedAt,notes:notes?.trim()||null,active};
}
