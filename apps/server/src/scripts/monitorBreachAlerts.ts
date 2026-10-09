import fs from "fs";
import path from "path";
import crypto from "crypto";
import { COMPANIES_ROOT } from "../lib/companiesRoot";
import { sendMailLogged } from "../lib/mailer";

const WARNING_MS=24*3600*1000;
function atomicJson(file:string,value:unknown){
  const tmp=file+"."+crypto.randomUUID()+".tmp";
  fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600,flag:"wx"});
  fs.renameSync(tmp,file);fs.chmodSync(file,0o600);
}
export function assessBreachAlerts(items:any[],now=Date.now()){
  const result:any[]=[];
  for(const incident of items){
    const time=Date.parse(String(incident.awareAt||""));
    if(!Number.isFinite(time))continue;
    const role=incident.role, risk=incident.risk;
    let kind:string|null=null,due:number|null=null;
    if(role==="PROCESSOR" && !incident.controllerNotifiedAt)kind="PROCESSOR_CONTROLLER_NOTICE";
    else if(role==="CONTROLLER" && risk==="UNKNOWN")kind="CONTROLLER_RISK_ASSESSMENT";
    else if(role==="CONTROLLER" && ["RISK","HIGH_RISK"].includes(risk) && !incident.authorityNotifiedAt){
      due=time+72*3600*1000;
      if(now>=due-WARNING_MS)kind=now>due?"AUTHORITY_NOTICE_OVERDUE":"AUTHORITY_NOTICE_DUE";
    }
    if(!kind && role==="CONTROLLER" && risk==="HIGH_RISK" && !incident.subjectsNotifiedAt && !incident.subjectNoticeException)kind="SUBJECT_NOTICE_REVIEW";
    if(kind) result.push({id:incident.id,kind,deadline:due?new Date(due).toISOString():null});
  }
  return result;
}
export async function runBreachAlerts(){
  const recipient=String(process.env.RLC_PRIVACY_ALERT_TO||"").trim();
  const validRecipient=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient);
  let total=0,sent=0,unsent=0;
  if(!fs.existsSync(COMPANIES_ROOT))return {total,sent,unsent};
  for(const dir of fs.readdirSync(COMPANIES_ROOT,{withFileTypes:true})){
    if(!dir.isDirectory()||!/^[a-zA-Z0-9_-]{1,100}$/.test(dir.name))continue;
    const root=path.join(COMPANIES_ROOT,dir.name,"privacy-compliance");
    const register=path.join(root,"breach-register.json");
    if(!fs.existsSync(register))continue;
    const items=JSON.parse(fs.readFileSync(register,"utf8"));
    if(!Array.isArray(items))throw Error("INVALID_BREACH_REGISTER");
    const alerts=assessBreachAlerts(items);
    const queue=path.join(root,"breach-alerts.json");
    const previous=fs.existsSync(queue)?JSON.parse(fs.readFileSync(queue,"utf8")):[];
    if(!Array.isArray(previous))throw Error("INVALID_BREACH_ALERT_QUEUE");
    const keys=new Set(previous.map((a:any)=>a.key));
    for(const alert of alerts){
      const key=[alert.id,alert.kind,new Date().toISOString().slice(0,10)].join(":");
      if(keys.has(key))continue;
      const record:any={...alert,key,createdAt:new Date().toISOString(),status:"PENDING",deliveryReference:null};
      previous.push(record);keys.add(key);total++;unsent++;
    }
    atomicJson(queue,previous);
    // Send only to an explicitly configured internal privacy recipient; never to authorities.
    if(validRecipient && process.env.DISABLE_EMAIL!=="1"){
      for(const record of previous.filter((x:any)=>x.status==="PENDING")){
        const notice=await sendMailLogged({to:recipient,subject:"RLC DSGVO: Data-Breach-Prüfung erforderlich",text:"Interner Hinweis: Eine DSGVO-Meldung ist zu prüfen. Vorgang: "+record.id+"; Status: "+record.kind+"; Frist: "+(record.deadline||"unverzüglich")+". Bitte im geschützten RLC Datenschutzbereich prüfen. Keine automatische Behördenmeldung."});
        if(!notice?.messageId || notice.messageId==="skipped" || !(notice.accepted||[]).includes(recipient))throw Error("BREACH_ALERT_DELIVERY_NOT_ACCEPTED");
        record.status="SMTP_ACCEPTED";record.deliveryReference=String(notice.messageId);record.sentAt=new Date().toISOString();sent++;unsent--;
        atomicJson(queue,previous);
      }
    }
  }
  return {total,sent,unsent,deliveryConfigured:validRecipient};
}
if(require.main===module)runBreachAlerts().then(x=>console.log("BREACH_ALERT_MONITOR_PASS "+JSON.stringify(x))).catch(e=>{console.error("BREACH_ALERT_MONITOR_FAIL",e.message);process.exitCode=2});
