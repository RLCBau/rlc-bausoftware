import React,{useEffect,useState} from "react";
import {accountingApi,dateDe,euro} from "./accountingApi";
export default function BankMatching({invoices,bills}:{invoices:any[];bills:any[]}){
 const [rows,setRows]=useState<any[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false),[choices,setChoices]=useState<Record<string,string>>({});
 const load=async()=>{try{const r=await accountingApi("/api/accounting/bank-entries");setRows(r.items||[]);setError("");}catch(e:any){setError(e.message||"Bankdaten nicht verfügbar.");}};
 useEffect(()=>{void load()},[]);
 const match=async(row:any)=>{
  const selection=choices[row.id];if(!selection)return;
  const [refType,refId]=selection.split(":");
  if(!window.confirm("Bankbewegung endgültig mit diesem Beleg referenzieren? Es wird keine Zahlung oder Buchung erzeugt."))return;
  setBusy(true);setError("");
  try{await accountingApi("/api/accounting/bank-entries/"+encodeURIComponent(row.id)+"/match",{method:"POST",body:JSON.stringify({refType,refId})});await load();}
  catch(e:any){setError(e.message||"Abgleich fehlgeschlagen.");}
  finally{setBusy(false);}
 };
 return <section className="card" style={{padding:16}}><div className="bh-header-row"><div><h3>Gespeicherte Bankbewegungen · Belegzuordnung</h3><p className="bh-note">Manuelle, protokollierte 1:1-Referenzierung. Keine automatische Zahlungsbuchung; nur volle Rechnungsbeträge.</p></div><button className="btn" onClick={()=>void load()} disabled={busy}>Aktualisieren</button></div>
 {error&&<p role="alert">{error}</p>}
 <div style={{overflowX:"auto"}}><table className="bh-table"><thead><tr><th>Datum</th><th>Betrag</th><th>Verwendungszweck</th><th>Beleg</th><th>Aktion</th></tr></thead><tbody>
 {rows.map(r=>{const target=r.amount>0?invoices:bills;const kind=r.amount>0?"INVOICE":"VENDOR_BILL";const exact=target.filter((x:any)=>Math.abs(Number(x.grossAmount)-Math.abs(Number(r.amount)))<0.011&&(kind==="INVOICE"?["issued","ausgestellt","open","partial","paid"].includes(String(x.status||"").toLowerCase()):String(x.status||"").toLowerCase()==="booked"));
 return <tr key={r.id}><td>{dateDe(r.bookingDate)}</td><td>{euro(r.amount)} €</td><td>{r.purpose}</td><td>{r.matchedId?<strong>{r.matchedType} · {r.matchedId}</strong>:<select aria-label="Passenden Beleg wählen" value={choices[r.id]||""} onChange={e=>setChoices(v=>({...v,[r.id]:e.target.value}))}><option value="">Beleg auswählen</option>{exact.map((x:any)=><option key={x.id} value={kind+":"+x.id}>{x.number} · {euro(x.grossAmount)} €</option>)}</select>}</td><td>{r.matchedId?"Zuordnung gespeichert":<button className="btn" disabled={busy||!choices[r.id]} onClick={()=>void match(r)}>Zuordnen</button>}</td></tr>})}
 {!rows.length&&<tr><td colSpan={5}>Keine gespeicherten Bankbewegungen vorhanden.</td></tr>}</tbody></table></div></section>;
}
