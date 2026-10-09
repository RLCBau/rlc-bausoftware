import {Router} from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {COMPANIES_ROOT} from "../lib/companiesRoot";
import {requirePermission} from "../middleware/rbac";
const r=Router();
const validRisk=new Set(["UNKNOWN","UNLIKELY","RISK","HIGH_RISK"]);
const company=(req:any)=>String(req.auth?.companyId||"");
function location(id:string){const d=path.join(COMPANIES_ROOT,id,"privacy-compliance");fs.mkdirSync(d,{recursive:true,mode:0o700});return path.join(d,"breach-register.json");}
function load(id:string){const f=location(id);if(!fs.existsSync(f))return [];const value=JSON.parse(fs.readFileSync(f,"utf8"));if(!Array.isArray(value))throw Error("INCIDENT_REGISTER_INVALID");return value;}
function save(id:string,items:any[]){const f=location(id),tmp=f+"."+crypto.randomUUID()+".tmp";fs.writeFileSync(tmp,JSON.stringify(items,null,2),{mode:0o600,flag:"wx"});fs.renameSync(tmp,f);fs.chmodSync(f,0o600);}
function evaluate(x:any){const errors:string[]=[];const risk=x.risk;const due=new Date(Date.parse(x.awareAt)+72*3600*1000).toISOString();
 if(x.role==="PROCESSOR"&&!x.controllerNotifiedAt)errors.push("CONTROLLER_NOTICE_NOT_DOCUMENTED");
 if(x.role==="CONTROLLER"&&(risk==="RISK"||risk==="HIGH_RISK")&&!x.authorityNotifiedAt)errors.push("AUTHORITY_NOTICE_REQUIRED");
 if(x.role==="CONTROLLER"&&risk==="HIGH_RISK"&&!x.subjectsNotifiedAt&&!x.subjectNoticeException)errors.push("SUBJECT_NOTICE_REQUIRED");
 if(x.authorityNotifiedAt&&Date.parse(x.authorityNotifiedAt)>Date.parse(due)&&!x.delayReason)errors.push("LATE_NOTICE_REASON_REQUIRED");
 if(!x.incidentDetails||!x.impact||!x.mitigation)errors.push("BREACH_DOCUMENTATION_INCOMPLETE");
 return {errors,authorityDeadline:x.role==="CONTROLLER"?due:null,requiresManualReview:risk==="UNKNOWN"};}
r.use(requirePermission("privacy:*"));
r.get("/breaches",(req:any,res)=>{const id=company(req);if(!id)return res.status(403).json({ok:false});const items=load(id);res.json({ok:true,items:items.map(x=>({...x,compliance:evaluate(x)}))});});
r.post("/breaches",(req:any,res)=>{const id=company(req),b=req.body||{};if(!id)return res.status(403).json({ok:false});if(!["CONTROLLER","PROCESSOR"].includes(b.role)||!validRisk.has(b.risk)||!b.incidentDetails)return res.status(400).json({ok:false,error:"INVALID_BREACH"});
 const awareAt=b.awareAt?new Date(b.awareAt):new Date();if(!Number.isFinite(awareAt.getTime())||awareAt.getTime()>Date.now())return res.status(400).json({ok:false,error:"INVALID_AWARENESS_TIME"});
 const now=new Date().toISOString();const item={id:crypto.randomUUID(),role:b.role,risk:b.risk,awareAt:awareAt.toISOString(),incidentDetails:String(b.incidentDetails).slice(0,5000),impact:String(b.impact||"").slice(0,5000),mitigation:String(b.mitigation||"").slice(0,5000),controllerNotifiedAt:null,authorityNotifiedAt:null,subjectsNotifiedAt:null,subjectNoticeException:"",delayReason:"",createdAt:now,updatedAt:now,events:[{at:now,event:"REGISTERED"}]};
 const items=load(id);items.unshift(item);save(id,items);res.status(201).json({ok:true,item,compliance:evaluate(item)});
});
r.patch("/breaches/:id",(req:any,res)=>{const id=company(req),items=load(id),i=items.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({ok:false,error:"NOT_FOUND"});
 const allowed=["risk","impact","mitigation","controllerNotifiedAt","authorityNotifiedAt","subjectsNotifiedAt","subjectNoticeException","delayReason","notificationEvidence"];const patch:any={};
 const notificationFields=["controllerNotifiedAt","authorityNotifiedAt","subjectsNotifiedAt"];
 if(notificationFields.some(k=>Object.prototype.hasOwnProperty.call(req.body||{},k)&&req.body[k]!==null)&& !String(req.body?.notificationEvidence||"").trim())return res.status(422).json({ok:false,error:"NOTIFICATION_DELIVERY_EVIDENCE_REQUIRED"});
 for(const k of allowed)if(Object.prototype.hasOwnProperty.call(req.body||{},k)){const v=req.body[k];if(k==="risk"&&!validRisk.has(v))return res.status(400).json({ok:false,error:"INVALID_RISK"});if(k.endsWith("At")&&v!==null&&(!Number.isFinite(Date.parse(v))||Date.parse(v)>Date.now()))return res.status(400).json({ok:false,error:"INVALID_TIMESTAMP"});patch[k]=k==="risk"||v===null?v:String(v).slice(0,5000);}
 const now=new Date().toISOString();items[i]={...items[i],...patch,updatedAt:now,events:[...items[i].events,{at:now,event:"UPDATED",fields:Object.keys(patch)}]};save(id,items);res.json({ok:true,item:items[i],compliance:evaluate(items[i])});
});
export default r;
