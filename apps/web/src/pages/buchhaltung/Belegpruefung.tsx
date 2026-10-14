import React, {useCallback,useEffect,useMemo,useState} from "react";
import {Link} from "react-router-dom";
import {accountingApi,dateDe,euro,getAccountingProject} from "./accountingApi";
import "./styles.css";

export default function Belegpruefung(){
 const [bills,setBills]=useState<any[]>([]);
 const [busy,setBusy]=useState(true);
 const [error,setError]=useState("");
 const [filter,setFilter]=useState("alle");
 const reload=useCallback(async()=>{
  setBusy(true);setError("");
  try {const data=await accountingApi("/api/accounting/vendor-bills");setBills(Array.isArray(data.items)?data.items:[]);}
  catch(e:any){setBills([]);setError(e?.message||"Belege konnten nicht geladen werden.");}
  finally{setBusy(false);}
 },[]);
 useEffect(()=>{void reload();},[reload]);
 const prepared=useMemo(()=>bills.map(b=>{
  const booked=String(b.status||"").toLowerCase()==="booked";
  const issues:string[]=[];
  if(!String(b.number||"").trim())issues.push("Rechnungsnummer fehlt");
  if(!b.supplierId)issues.push("Lieferant fehlt");
  if(!b.pdfDocId)issues.push("Originalbeleg fehlt");
  if(!(Number(b.grossAmount)>0))issues.push("Bruttobetrag prüfen");
  return {bill:b,booked,issues,open:Number(b.openAmount||0),state:booked?"gebucht":issues.length?"pruefen":"erfasst"};
 }),[bills]);
 const visible=prepared.filter(row=>filter==="alle"||row.state===filter);
 const count=(state:string)=>prepared.filter(x=>x.state===state).length;
 return <div className="bh-page">
 <div className="bh-header-row"><div><h2>Belegprüfung · Eingangsrechnungen</h2><div className="bh-note">Projekt: {getAccountingProject()} · Kontrollansicht ohne Buchung oder Freigabe</div></div><button className="bh-btn ghost" disabled={busy} onClick={()=>void reload()}>Aktualisieren</button></div>
 <div className="rlc-page-toolbar" style={{flexWrap:"wrap"}}>
 {([["alle","Alle"],["pruefen","Prüfbedarf"],["erfasst","Erfasst"],["gebucht","Gebucht"]] as const).map(([value,label])=><button key={value} type="button" className={"btn"+(filter===value?" btn-primary":"")} onClick={()=>setFilter(value)}>{label} ({value==="alle"?prepared.length:count(value)})</button>)}
 </div>
 <div className="card"><p className="bh-note" style={{margin:0}}>Ablauf: Beleg erfassen → Pflichtangaben prüfen → Originaldokument kontrollieren → fachlich prüfen → buchen → Zahlung zuordnen → Export abstimmen. Eine mehrstufige elektronische Freigabe wird hier <strong>nicht</strong> vorgetäuscht.</p></div>
 {error&&<div className="card" role="alert">{error}</div>}
 {busy?<div className="card">Belege werden geladen …</div>:<div className="card" style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["Rechnung","Lieferant","Datum","Brutto","Offen","Prüfstatus","Aktionen"].map(v=><th key={v} style={{textAlign:"left",padding:10,borderBottom:"1px solid #dce5f1"}}>{v}</th>)}</tr></thead><tbody>
 {visible.map(({bill,booked,issues,open,state})=><tr key={bill.id}><td style={{padding:10,borderBottom:"1px solid #e5ebf3"}}>{bill.number||"—"}</td><td>{bill.supplier?.name||"—"}</td><td>{dateDe(bill.date)}</td><td>{euro(bill.grossAmount)} €</td><td>{euro(open)} €</td><td><strong>{booked?"Gebucht":state==="pruefen"?"Prüfbedarf":"Erfasst"}</strong>{issues.length>0&&<div className="bh-note">{issues.join(" · ")}</div>}</td><td><Link className="btn" to="/buchhaltung/eingang">Beleg öffnen</Link>{booked&&open>0.009&&<Link className="btn" to="/buchhaltung/zahlungen">Zahlungen</Link>}</td></tr>)}
 {!visible.length&&<tr><td colSpan={7} style={{padding:18}}>Keine Belege in dieser Ansicht.</td></tr>}</tbody></table></div>}
 <div className="rlc-page-toolbar" style={{flexWrap:"wrap"}}><Link className="btn" to="/buchhaltung/eingang">Eingangsrechnungen</Link><Link className="btn" to="/buchhaltung/zahlungen">Zahlungen & Offene Posten</Link><Link className="btn" to="/buchhaltung/datev">DATEV / Export</Link></div>
 </div>;
}
