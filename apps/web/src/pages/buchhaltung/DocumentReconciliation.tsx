import React, {useEffect, useState} from "react";
import {accountingApi, euro} from "./accountingApi";

type ReconRow = {id:string;type:string;number:string;status:string;gross:number;paid:number;open:number;paymentCount:number;journalIssueCount:number;overpaid:boolean};
export default function DocumentReconciliation(){
 const [rows,setRows]=useState<ReconRow[]>([]);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(false);
 const [filter,setFilter]=useState("issues");
 const refresh=async()=>{
   setLoading(true);setError("");
   try {const result=await accountingApi("/api/accounting/reconciliation");setRows(result.items||[]);}
   catch(e:any){setError(e?.message||"Belegabgleich fehlgeschlagen.");setRows([]);}
   finally{setLoading(false);}
 };
 useEffect(()=>{void refresh()},[]);
 const issues=rows.filter(x=>x.overpaid||x.journalIssueCount>0);
 const shown=filter==="issues"?issues:filter==="open"?rows.filter(x=>x.open>0.009):rows;
 return <section className="bh-card" style={{marginTop:16}}>
   <div className="bh-header-row"><div><h3>Belegabgleich · Rechnungen und Journal</h3><div className="bh-note">Nur Prüfung: keine automatische Buchung, keine Änderung an Belegen.</div></div><button className="bh-btn ghost" disabled={loading} onClick={()=>void refresh()}>Aktualisieren</button></div>
   {error&&<div className="bh-note" role="alert">{error}</div>}
   {!error&&<><div className="bh-note">{rows.length} Belege · {issues.length} Belege mit Auffälligkeiten</div>
   <div className="rlc-page-toolbar" style={{flexWrap:"wrap",margin:"12px 0"}}>
     {([["issues","Auffälligkeiten"],["open","Offen"],["all","Alle Belege"]] as const).map(([v,label])=><button key={v} type="button" className={"btn"+(filter===v?" btn-primary":"")} onClick={()=>setFilter(v)}>{label}</button>)}
   </div>
   <div style={{overflowX:"auto"}}><table className="bh-table"><thead><tr><th>Typ</th><th>Beleg</th><th>Brutto</th><th>Bezahlt netto</th><th>Offen</th><th>Zahlungen</th><th>Journal-Prüfung</th></tr></thead><tbody>
    {shown.map(x=><tr key={x.type+":"+x.id}><td>{x.type==="INVOICE"?"Ausgang":"Eingang"}</td><td>{x.number||x.id}</td><td>{euro(x.gross)} €</td><td>{euro(x.paid)} €</td><td>{euro(x.open)} €</td><td>{x.paymentCount}</td><td>{x.overpaid?"Überzahlung":x.journalIssueCount?x.journalIssueCount+" Buchung(en) prüfen":"OK"}</td></tr>)}
    {!shown.length&&<tr><td colSpan={7}>{loading?"Lädt …":"Keine Belege in dieser Ansicht."}</td></tr>}
   </tbody></table></div></>}
 </section>;
}
