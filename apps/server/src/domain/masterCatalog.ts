import {InputError} from './officeAddons';
export const catalogKinds=['UNIT','LICENSE_CLASS','HAZARD_CLASS','COST_CENTER_AREA','TIME_TYPE'] as const;
export class CatalogError extends InputError{constructor(message:string,public status=400){super(message);}}
export function catalogKind(value:any):string{if(typeof value!=='string'||!(catalogKinds as readonly string[]).includes(value))throw new InputError('Katalogart ungültig.');return value;}
export function catalogInput(body:any,old:any={}){
 if(!body||typeof body!=='object'||Array.isArray(body))throw new InputError('Ungültiger Katalogeintrag.');
 const kind=catalogKind(body.kind===undefined?old.kind:body.kind);if(old.id&&kind!==old.kind)throw new InputError('Katalogart kann nicht geändert werden.');
 const raw=body.code===undefined?old.code:body.code;if(typeof raw!=='string')throw new InputError('Code erforderlich.');const code=raw.trim().normalize('NFKC').toUpperCase();if(!/^[A-Z0-9][A-Z0-9_.+-]{0,39}$/.test(code))throw new InputError('Code: 1–40 Zeichen, Buchstaben, Zahlen, Punkt, Plus, Minus oder Unterstrich.');if(old.id&&code!==old.code)throw new InputError('Code kann nicht geändert werden.');
 const text=(k:string,max:number,required=false)=>{const raw=body[k]===undefined?old[k]:body[k];if(raw!=null&&typeof raw!=='string')throw new InputError(k+': Text erforderlich.');const v=String(raw??'').trim();if((required&&!v)||v.length>max)throw new InputError(k+': ungültige Länge.');return v||null;};
 const label=text('label',kind==='COST_CENTER_AREA'?150:250,true)!,symbol=text('symbol',25),notes=text('notes',5000);if(kind!=='UNIT'&&symbol)throw new InputError('Einheitensymbol ist nur im Einheitenkatalog zulässig.');
 const active=body.active===undefined?old.active??true:body.active;if(typeof active!=='boolean')throw new InputError('Aktiv muss Ja oder Nein sein.');return {kind,code,label,symbol,notes,active};
}
