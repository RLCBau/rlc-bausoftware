import {InputError} from "./officeAddons";
import {planningDate,planningNotes} from "./resourcePlanning";
export const releaseStatuses=["Entwurf","Gemeldet","Bestätigt","Storniert","Archiviert"] as const;
export const releaseConditions=["Einsatzbereit","Wartung erforderlich","Nicht einsatzbereit"] as const;
export function releaseInput(body:any){
 if(!body || typeof body!=="object" || Array.isArray(body))throw new InputError("Ungültige Freimeldung.");
 const id=(value:unknown,name:string)=>{if(typeof value!=="string" || !value.trim() || value.length>100)throw new InputError(name+" erforderlich.");return value.trim();};
 const releaseDate=planningDate(body.releaseDate),availableFrom=planningDate(body.availableFrom);
 if(availableFrom<releaseDate)throw new InputError("Verfügbarkeit darf nicht vor dem Einsatzende liegen.");
 if(!releaseStatuses.includes(body.status))throw new InputError("Ungültiger Status.");
 if(!releaseConditions.includes(body.condition))throw new InputError("Ungültiger Gerätezustand.");
 if(body.documentId!=null && typeof body.documentId!=="string")throw new InputError("Ungültiges Dokument.");
 return {machineId:id(body.machineId,"Gerät"),releaseDate:new Date(releaseDate+"T00:00:00.000Z"),availableFrom:new Date(availableFrom+"T00:00:00.000Z"),condition:body.condition as string,status:body.status as string,notes:planningNotes(body.notes),documentId:body.documentId? id(body.documentId,"Dokument"):null};
}
export function releaseTransition(before:string,after:string){
 const rules:Record<string,string[]>={"Entwurf":["Gemeldet","Storniert"],"Gemeldet":["Bestätigt","Storniert"],"Bestätigt":["Archiviert"],"Storniert":["Archiviert"],"Archiviert":[]};
 if(before===after)return;
 if(!rules[before]?.includes(after))throw new InputError("Dieser Statuswechsel ist nicht zulässig.");
}
