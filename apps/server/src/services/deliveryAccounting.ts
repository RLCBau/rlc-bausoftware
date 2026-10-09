
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {prisma} from "../lib/prisma";
import {PROJECTS_ROOT} from "../lib/projectsRoot";
import {InputError} from "../domain/officeAddons";
function safeKey(v:string){return v.replace(/[^A-Za-z0-9_\-]/g,"_").slice(0,120);}
async function directory(project:any){
 const canonical=safeKey(project.id),code=safeKey(project.code||"");
 const folder=(key:string)=>path.join(PROJECTS_ROOT,key,"lieferscheine");
 if(fs.existsSync(folder(canonical)))return {key:canonical,dir:folder(canonical)};
 if(code && await prisma.project.count({where:{code:project.code}})===1 && fs.existsSync(folder(code)))return {key:canonical,dir:folder(code)};
 return {key:canonical,dir:folder(canonical)};
}
function text(v:any){return typeof v==="string"?v.trim():"";}
function qty(v:any){const n=typeof v==="number"?v:typeof v==="string"&&/^-?\d+([.,]\d+)?$/.test(v.trim())?Number(v.replace(",",".")):NaN;return Number.isFinite(n)?n:null;}
function rowsOf(s:any){
 const rows=Array.isArray(s.rows)&&s.rows.length?s.rows:Array.isArray(s.items?.lieferscheine)&&s.items.lieferscheine.length?s.items.lieferscheine:[s];
 if(rows.length>2000)throw new InputError("Lieferschein enthält mehr als 2000 Positionen.");
 return rows.map((r:any,i:number)=>({position:i+1,material:text(r.material||r.name||r.description),quantity:qty(r.quantity??r.qty),unit:text(r.unit),costCenter:text(r.kostenstelle||r.costCenter)}));
}
function read(dir:string,key:string,filename:string,project:any){
 if(!/^Lieferschein_[A-Za-z0-9_.-]{1,180}\.json$/i.test(filename))throw new InputError("Ungültiger Lieferschein-Schlüssel.");
 const file=path.join(dir,filename),base=fs.realpathSync(dir);
 if(fs.lstatSync(file).isSymbolicLink()||!fs.realpathSync(file).startsWith(base+path.sep))throw new InputError("Ungültiger Lieferschein-Pfad.");
 const stat=fs.statSync(file);if(stat.size>10*1024*1024)throw new InputError("Lieferschein zu groß.");
 const raw=fs.readFileSync(file),s=JSON.parse(raw.toString("utf8"));
 if(!s||typeof s!=="object"||Array.isArray(s))throw new InputError("Lieferschein unlesbar.");
 if(s.workflowStatus && s.workflowStatus!=="FREIGEGEBEN")throw new InputError("Nur freigegebene Lieferscheine zuordnen.");
 const rows=rowsOf(s),first=Array.isArray(s.rows)&&s.rows.length?s.rows[0]:s.items?.lieferscheine?.[0]||s;
 const pdf=filename.replace(/\.json$/i,".pdf");
 return {key:key+":"+filename,filename,projectId:project.id,projectCode:project.code,
  sourceHash:crypto.createHash("sha256").update(raw).digest("hex"),
  number:text(s.lieferscheinNummer||first.lieferscheinNummer||s.number),
  sourceDocId:text(s.sourceDocId||s.docId||s.id),reportId:text(s.reportId),date:text(s.date||first.date).slice(0,10),
  supplier:text(s.supplier||s.lieferant||first.supplier||first.lieferant),
  material:text(s.material||first.material),quantity:qty(s.quantity??s.qty??first.quantity??first.qty),unit:text(s.unit||first.unit),
  costCenter:text(s.kostenstelle||s.costCenter||first.kostenstelle||first.costCenter),
  workflowStatus:"FREIGEGEBEN",rowsCount:rows.length,rows,
  attachmentsCount:Array.isArray(s.attachments)?s.attachments.length:0,
  pdfUrl:fs.existsSync(path.join(dir,pdf))?"/projects/"+encodeURIComponent(path.basename(path.dirname(dir)))+"/lieferscheine/"+encodeURIComponent(pdf):null,
  savedAt:stat.mtime.toISOString()};
}
export async function deliveryList(project:any){
 const {dir,key}=await directory(project);
 if(!fs.existsSync(dir))return {items:[],unreadable:0};
 const items:any[]=[],unreadableFiles:string[]=[];
 for(const filename of fs.readdirSync(dir).filter(f=>/^Lieferschein_.*\.json$/i.test(f))){
  try{items.push(read(dir,key,filename,project));}catch{unreadableFiles.push(filename);}
 }
 items.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
 return {items,unreadable:unreadableFiles.length};
}
export async function deliverySource(project:any,token:unknown){
 if(typeof token!=="string"||token.length>350)throw new InputError("Lieferschein-Schlüssel ungültig.");
 const {dir,key}=await directory(project),prefix=key+":";
 if(!token.startsWith(prefix))throw new InputError("Lieferschein gehört nicht zu diesem Projekt.");
 const filename=token.slice(prefix.length);
 try{return read(dir,key,filename,project);}catch(e){if(e instanceof InputError)throw e;throw new InputError("Lieferschein nicht verfügbar oder unlesbar.");}
}
export async function deliveryBillMetadata(project:any,body:any,old:any={}){
 const patch=body.data&&typeof body.data==="object"&&!Array.isArray(body.data)?body.data:{};
 const supplied=body.deliveryNoteKey!==undefined?body.deliveryNoteKey:patch.deliveryNoteKey;
 if(supplied===undefined)return {deliveryNoteKey:old.deliveryNoteKey||null,deliveryNoteFilename:old.deliveryNoteFilename||null,deliveryNoteNumber:old.deliveryNoteNumber||null};
 if(supplied===null||supplied==="")return {deliveryNoteKey:null,deliveryNoteFilename:null,deliveryNoteNumber:null};
 const note=await deliverySource(project,supplied);
 return {deliveryNoteKey:note.key,deliveryNoteFilename:note.filename,deliveryNoteNumber:note.number||note.reportId};
}

export function orderFingerprint(order:any){
 if(!order)return "";
 const lines=(order.lines||[]).map((l:any)=>[l.id,l.materialId,l.code,l.name,l.unit,String(l.qty),String(l.priceNet)]).sort((a:any,b:any)=>String(a[0]).localeCompare(String(b[0])));
 return crypto.createHash("sha256").update(JSON.stringify([order.number,order.supplier,order.projectId,order.costCenter,lines])).digest("hex");
}
