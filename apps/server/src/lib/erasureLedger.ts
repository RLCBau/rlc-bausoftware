import fs from "fs";
import path from "path";
import crypto from "crypto";
import { COMPANIES_ROOT } from "./companiesRoot";

export type ErasureRecord = {
  eventId: string; companyId: string; subjectUserId: string;
  requestId: string; erasedAt: string; scope: "TEST_ACCOUNT" | "APPROVED_ERASURE";
};
const ledgerPath = () => path.join(COMPANIES_ROOT, "..", "privacy-erasure-ledger.jsonl");
export function erasureLedgerPath(){ return ledgerPath(); }
export function appendErasureEvent(event:ErasureRecord){
  if (!event.companyId || !event.subjectUserId || !event.requestId) throw new Error("ERASURE_EVENT_INVALID");
  const f=ledgerPath();
  fs.mkdirSync(path.dirname(f),{recursive:true,mode:0o700});
  fs.appendFileSync(f,JSON.stringify(event)+"\n",{encoding:"utf8",mode:0o600,flag:"a"});
  fs.chmodSync(f,0o600);
}
export function verifyErasureLedger(){
  const f=ledgerPath();
  if(!fs.existsSync(f)) return {exists:false,count:0,records:[] as ErasureRecord[]};
  const lines=fs.readFileSync(f,"utf8").split("\n").filter(Boolean);
  const records:ErasureRecord[]=lines.map((line,i)=>{
    const row=JSON.parse(line) as ErasureRecord;
    if(!row.eventId||!row.companyId||!row.subjectUserId||!row.requestId||!row.erasedAt)
      throw new Error("ERASURE_LEDGER_BAD_RECORD_"+i);
    return row;
  });
  return {exists:true,count:records.length,records};
}
export async function checkRestoredErasureState(db:{
  user:{count:(a:any)=>Promise<number>}
}){
  const ledger=verifyErasureLedger();
  if (!ledger.exists) return {ready:false,error:"ERASURE_LEDGER_MISSING",checked:0};
  for(const entry of ledger.records){
    if(await db.user.count({where:{id:entry.subjectUserId,companyId:entry.companyId}}))
      return {ready:false,error:"ERASED_USER_REAPPEARED",eventId:entry.eventId,checked:ledger.count};
  }
  return {ready:true,checked:ledger.count};
}
export function newErasureRecord(companyId:string,subjectUserId:string,requestId:string):ErasureRecord {
  return {eventId:crypto.randomUUID(),companyId,subjectUserId,requestId,erasedAt:new Date().toISOString(),scope:"TEST_ACCOUNT"};
}
