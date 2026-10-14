import React,{useCallback,useEffect,useMemo,useState} from "react";
import {Link} from "react-router-dom";
import {accountingApi,dateDe,euro,getAccountingProject} from "./accountingApi";
import "./styles.css";
import BankCsvPreview from "./BankCsvPreview";
import BankMatching from "./BankMatching";
import DocumentReconciliation from "./DocumentReconciliation";
export default function Zahlungsabgleich(){
 const [data,setData]=useState<{payments:any[];invoices:any[];bills:any[]}>({payments:[],invoices:[],bills:[]});
 const [busy,setBusy]=useState(true),[error,setError]=useState(""),[filter,setFilter]=useState("offen");
 const refresh=useCallback(async()=>{setBusy(true);setError("");
  try{const [p,i,b]=await Promise.all([accountingApi("/api/accounting/payments"),accountingApi("/api/accounting/invoices"),accountingApi("/api/accounting/vendor-bills")]);setData({payments:p.items||[],invoices:i.items||[],bills:b.items||[]});}
  catch(e:any){setError(e?.message||"Zahlungsabgleich nicht verfügbar.");setData({payments:[],invoices:[],bills:[]});}
  finally{setBusy(false);}
 },[]);
 useEffect(()=>{void refresh()},[refresh]);
 const rows=useMemo(()=>{
  const byInvoice=new Map(data.invoices.map((r:any)=>[r.id,r]));
  const byBill=new Map(data.bills.map((r:any)=>[r.id,r]));
  return data.payments.map((p:any)=>{
   const kind=String(p.refType||"");const ref=kind==="INVOICE"?byInvoice.get(p.refId):kind==="VENDOR_BILL"?byBill.get(p.refId):undefined;
   const reversal=Boolean(p.data?.reversesPaymentId||p.data?.reversedByPaymentId);
   const issue=!p.refId?"Ohne Belegzuordnung":!ref?"Referenz nicht auffindbar":kind==="INVOICE"&&p.direction!=="IN"?"Richtung prüfen":kind==="VENDOR_BILL"&&p.direction!=="OUT"?"Richtung prüfen":"";
   return {p,ref,issue,reversal};
  });
 },[data]);
 const unmatched=rows.filter(r=>r.issue&&!r.reversal),openInvoices=data.invoices.filter((x:any)=>Number(x.openAmount||0)>0.009),openBills=data.bills.filter((x:any)=>Number(x.openAmount||0)>0.009);
 const shown=filter==="offen"?rows.filter(r=>r.issue&&!r.reversal):filter==="zugeordnet"?rows.filter(r=>!r.issue&&!r.reversal):rows;
 return <div className="bh-page">
  <div className="bh-header-row"><div><h2>Zahlungsabgleich · Kontrollübersicht</h2><div className="bh-note">Projekt: {getAccountingProject()} · Abgleich vorhandener Buchungsreferenzen, kein Bankabruf</div></div><button className="bh-btn ghost" disabled={busy} onClick={()=>void refresh()}>Aktualisieren</button></div>
  <div className="rlc-accounting-recon-kpis">{[["Zahlungen",rows.length],["Ohne sichere Zuordnung",unmatched.length],["Offene Kundenrechnungen",openInvoices.length],["Offene Lieferantenrechnungen",openBills.length]].map(([label,v])=><div className="bh-card" key={label as string}><div className="bh-note">{label}</div><strong style={{fontSize:22}}>{v}</strong></div>)}</div>
  <div className="card"><p className="bh-note" style={{margin:0}}>Dieser Kontrollabgleich verwendet nur bereits erfasste Zahlungen und Rechnungen. Er ersetzt weder Bankkontoauszüge noch eine echte Banktransaktionsabstimmung. Verbuchte Zahlungen werden nicht verändert.</p></div>
  <div className="rlc-page-toolbar" style={{flexWrap:"wrap"}}>{([["offen","Zu prüfen"],["zugeordnet","Zuordnungen"],["alle","Alle"]] as const).map(([v,label])=><button key={v} type="button" className={"btn"+(filter===v?" btn-primary":"")} onClick={()=>setFilter(v)}>{label}</button>)}</div>
  {error&&<div className="card" role="alert">{error}</div>}
  <div className="card" style={{overflowX:"auto"}}>{busy?"Zahlungen werden geladen …":<table className="bh-table"><thead><tr><th>Datum</th><th>Richtung</th><th>Betrag</th><th>Beleg</th><th>Status</th></tr></thead><tbody>{shown.map(({p,ref,issue,reversal})=><tr key={p.id}><td>{dateDe(p.date)}</td><td>{p.direction==="IN"?"Eingang":"Ausgang"}</td><td>{euro(p.amount)} €</td><td>{ref?.number||p.refId||"—"}</td><td>{reversal?"Storno / storniert":issue||"Zugeordnet"}</td></tr>)}{!shown.length&&<tr><td colSpan={5}>Keine Vorgänge in dieser Ansicht.</td></tr>}</tbody></table>}</div>
  <DocumentReconciliation />
  <BankCsvPreview invoices={data.invoices} bills={data.bills} payments={data.payments} />
  <BankMatching invoices={data.invoices} bills={data.bills} />
  <div className="rlc-page-toolbar" style={{flexWrap:"wrap"}}><Link className="btn" to="/buchhaltung/zahlungen">Zahlungen prüfen</Link><Link className="btn" to="/buchhaltung/belegpruefung">Belegprüfung</Link><Link className="btn" to="/buchhaltung/datev">DATEV / Export</Link></div>
 </div>
}
