import {InputError} from './officeAddons';
export class ContactError extends InputError{constructor(message:string,public status=400){super(message);}}
function text(v:any,name:string,max:number,required=false,multiline=false){if(v==null&&!required)return '';if(typeof v!=='string'||v.length>max||(required&&!v.trim())||(!multiline&&/[\r\n\x00]/.test(v)))throw new InputError(name+': ungültiger Text.');return v.trim();}
function email(v:any){const value=text(v,'E-Mail',254);if(value&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new InputError('E-Mail-Adresse prüfen.');return value;}
export function addressInput(v:any){if(!v||typeof v!=='object'||Array.isArray(v))throw new InputError('Adressfelder erforderlich.');return {street:text(v.street,'Straße',250),postalCode:text(v.postalCode,'PLZ',30),city:text(v.city,'Ort',150),country:text(v.country,'Land',80)};}
export function contactInput(b:any,old?:any){
 if(!b||typeof b!=='object'||Array.isArray(b)||JSON.stringify(b).length>65536)throw new InputError('Kontaktdaten ungültig oder zu groß.');
 if(!['CUSTOMER','SUPPLIER','PARTNER'].includes(b.type))throw new InputError('Kontaktart auswählen.');
 if(old&&b.type!==old.type)throw new InputError('Bestehende buchhalterische Kontaktart bleibt unverändert.');
 const website=text(b.website,'Website',500);if(website){let u:URL;try{u=new URL(website);}catch{throw new InputError('Vollständige Website mit https:// eingeben.');}if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new InputError('Website muss HTTP oder HTTPS ohne Zugangsdaten sein.');}
 if(!Array.isArray(b.contacts)||b.contacts.length>20||!Array.isArray(b.sites)||b.sites.length>20)throw new InputError('Höchstens 20 Ansprechpartner und 20 Standorte.');
 const contacts=b.contacts.map((p:any)=>({name:text(p?.name,'Ansprechpartner',250,true),role:text(p?.role,'Funktion',150),email:email(p?.email),phone:text(p?.phone,'Telefon',100)}));
 const sites=b.sites.map((s:any)=>({name:text(s?.name,'Standort',250,true),...addressInput(s)}));
 let address=old?.address??null;
 if(b.address!==undefined){const data=addressInput(b.address);if(old?.address!=null&&(typeof old.address!=='object'||Array.isArray(old.address)))throw new ContactError('Ältere Adressstruktur zunächst separat prüfen; nicht überschrieben.',409);address={...(old?.address||{}),...data};}
 else if(!old)address=addressInput({});
 if(typeof b.subcontractor!=='boolean'||b.subcontractor&&b.type!=='SUPPLIER')throw new InputError('Nachunternehmerkennzeichen nur für Lieferanten.');
 return {party:{type:b.type,name:text(b.name,'Firma / Name',250,true),vatId:text(b.vatId,'USt-IdNr.',50)||null,email:email(b.email)||null,phone:text(b.phone,'Telefon',100)||null,...(address===null?{}:{address})},profile:{website,trade:text(b.trade,'Gewerk / Kategorie',150),notes:text(b.notes,'Bemerkung',5000,false,true),subcontractor:b.subcontractor,contacts,sites}};
}
