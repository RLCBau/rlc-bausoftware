import crypto from "node:crypto";
import {InputError} from "./officeAddons";
type RoomNode = {id:string;parentId:string|null;nummer:string;name:string;sortOrder:number;description:string|null;color:string|null};
type RoomLink = {ortId:string;positionId:string};
export function normalizeRoomTree(body:any) {
 if(!Array.isArray(body?.orte) || !Array.isArray(body?.links))throw new InputError("Orte und Zuordnungen müssen ausdrücklich übergeben werden.");
 if(body.orte.length>2000 || body.links.length>20000)throw new InputError("Orte-Struktur zu groß.");
 const orte:RoomNode[]=body.orte.map((r:any,i:number)=>{
  if(!r || typeof r!=="object")throw new InputError("Ungültiger Ort.");
  const id=String(r.id || "").trim(),parentId=r.parentId?String(r.parentId).trim():null,nummer=String(r.nummer || "").trim(),name=String(r.name || "").trim();
  if(!id || id.length>100 || !nummer || nummer.length>100 || !name || name.length>250)throw new InputError("Jeder Ort benötigt eine gültige ID, Nummer und Bezeichnung.");
  const sortOrder=Number(r.sortOrder ?? i);
  if(!Number.isSafeInteger(sortOrder)||Math.abs(sortOrder)>100000)throw new InputError("Sortierung ungültig.");
  const description=r.description?String(r.description):null;
  if(description && description.length>5000)throw new InputError("Beschreibung zu lang.");
  return {id,parentId,nummer,name,sortOrder,description,color:r.color?String(r.color):null};
 });
 const byId=new Map(orte.map((r:any)=>[r.id,r]));if(byId.size!==orte.length)throw new InputError("Doppelte Orts-ID.");
 const siblings=new Set<string>();
 for(const r of orte){
  if(r.parentId && !byId.has(r.parentId))throw new InputError("Übergeordneter Ort fehlt.");
  const sibling=(r.parentId || "")+"\0"+r.nummer.toLocaleLowerCase("de-DE");
  if(siblings.has(sibling))throw new InputError("Ortsnummer in derselben Ebene doppelt.");siblings.add(sibling);
  const chain=new Set<string>();let current:any=r;
  while(current){if(chain.has(current.id))throw new InputError("Zyklische Orte-Hierarchie.");chain.add(current.id);current=current.parentId?byId.get(current.parentId):null;}
 }
 const links:RoomLink[]=body.links.map((r:any)=>{
  const ortId=String(r?.ortId || "").trim(),positionId=String(r?.positionId || "").trim();
  if(!byId.has(ortId) || !positionId || positionId.length>150)throw new InputError("Ungültige Orts-/Positionszuordnung.");
  return {ortId,positionId};
 });
 return {orte,links:Array.from(new Map(links.map(r=>[r.ortId+"\0"+r.positionId,r] as const)).values())};
}
export function roomRevision(rows:any[]):string {
 const normalized=rows.map(r=>({id:r.id,parentId:r.parentId || null,nummer:r.nummer,name:r.name,description:r.description || null,color:r.color || null,sortOrder:r.sortOrder,
  positions:(r.positions || []).map((p:any)=>p.positionId).sort()})).sort((a,b)=>a.id.localeCompare(b.id));
 return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
