
import React,{useEffect,useMemo,useRef,useState} from "react";
import {accountingApi,dateDe,getAccountingProject} from "./accountingApi";
import "./styles.css";
const deliveryLabels:any={OFFEN:"Offen",TEILGELIEFERT:"Teilgeliefert",VOLLSTAENDIG:"Vollständig",MEHRGELIEFERT:"Mehrgeliefert"};
const labels:any={IN_PRUEFUNG:"In Prüfung",GEKLAERT:"Geprüft",REKLAMATION:"Reklamation"};
export default function LieferscheineKosten(){
 const [items,setItems]=useState<any[]>([]),[orders,setOrders]=useState<any[]>([]),[query,setQuery]=useState("");
 const [status,setStatus]=useState("ALL"),[center,setCenter]=useState("ALL"),[invoiceFilter,setInvoiceFilter]=useState("ALL");
 const [from,setFrom]=useState(""),[to,setTo]=useState("");
 const [selected,setSelected]=useState<any>(null),[form,setForm]=useState<any>(null),[history,setHistory]=useState<any[]>([]);
 const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[unreadable,setUnreadable]=useState(0);
 const [error,setError]=useState(""),[message,setMessage]=useState(""),version=useRef(0);
 const root="/api/accounting/delivery-review",projectId=getAccountingProject();
 async function load(){
  const v=++version.current;setReady(false);setError("");
  try{const data=await accountingApi(root);if(v!==version.current)return;setItems(data.items||[]);setOrders(data.orders||[]);setUnreadable(data.unreadable||0);setReady(true);return data.items||[];}
  catch(e:any){if(v===version.current)setError(e.message);}
 }
 useEffect(()=>{void load();return()=>{version.current++;};},[projectId]);
 useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",guard);return()=>window.removeEventListener("beforeunload",guard);},[dirty]);
 const centers=useMemo(()=>Array.from(new Set(items.map(i=>i.costCenter).filter(Boolean))).sort(),[items]);
 const filtered=useMemo(()=>items.filter(i=>{
  const actual=(i.review?.sourceChanged||i.review?.orderChanged)?"IN_PRUEFUNG":i.review?.status||"IN_PRUEFUNG";
  return (status==="ALL"||actual===status)&&(center==="ALL"||i.costCenter===center)&&
   (invoiceFilter==="ALL"||(invoiceFilter==="NONE"?i.invoices.length===0:i.invoices.length>0))&&
   (!from||i.date>=from)&&(!to||i.date<=to)&&
   (!query||[i.number,i.supplier,i.material,i.costCenter,i.review?.order?.number,...i.invoices.map((b:any)=>b.number)].join(" ").toLowerCase().includes(query.toLowerCase()));
 }),[items,query,status,center,invoiceFilter,from,to]);
 function setCurrent(note:any){
  setSelected(note);setForm({allocations:(note.review?.sourceChanged||note.review?.orderChanged)?[]:note.review?.allocations||[],orderId:note.review?.orderId||"",status:(note.review?.sourceChanged||note.review?.orderChanged)?"IN_PRUEFUNG":note.review?.status||"IN_PRUEFUNG",
   supplierConfirmed:(note.review?.sourceChanged||note.review?.orderChanged)?false:note.review?.supplierConfirmed||false,
   quantityConfirmed:(note.review?.sourceChanged||note.review?.orderChanged)?false:note.review?.quantityConfirmed||false,notes:note.review?.notes||""});
  setDirty(false);setHistory([]);
 }
 async function choose(note:any){
  if(busy||!ready||(dirty&&!window.confirm("Ungespeicherte Änderungen verwerfen?")))return;
  setCurrent(note);setError("");setMessage("");setBusy(true);
  try{const data=await accountingApi(root+"/history?deliveryKey="+encodeURIComponent(note.key));setHistory(data.items||[]);}
  catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 function update(k:string,v:any){setForm((f:any)=>({...f,[k]:v}));setDirty(true);}
 async function save(){
  if(!selected||!ready)return;setBusy(true);setError("");setMessage("");
  try{
   await accountingApi(root,{method:"PUT",body:JSON.stringify({...form,deliveryKey:selected.key,sourceHash:selected.sourceHash,revision:selected.review?.revision||0,orderHash:orders.find(o=>o.id===form.orderId)?.orderHash||""})});
   setDirty(false);setMessage("Lieferscheinprüfung gespeichert.");
   const rows=await load(),note=rows?.find((i:any)=>i.key===selected.key);
   if(note)setCurrent(note);
   setHistory((await accountingApi(root+"/history?deliveryKey="+encodeURIComponent(selected.key))).items||[]);
  }catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 function mapPosition(position:number,orderLineId:string){
  setForm((f:any)=>({...f,allocations:[...(f.allocations||[]).filter((a:any)=>a.position!==position),...(orderLineId?[{position,orderLineId}]:[])],quantityConfirmed:false,status:"IN_PRUEFUNG"}));setDirty(true);
 }
 function exportOrders(){
  const cell=(v:any)=>'"'+String(v??"").replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
  const rows=[["Bestellung","Lieferstand","Material","Einheit","Bestellt","Geliefert","Rest","Mehrmenge","Offene Prüfungen"],...orders.flatMap(o=>o.reconciliation.lines.map((l:any)=>[o.number,deliveryLabels[o.reconciliation.status],l.name,l.unit,l.ordered,l.delivered,l.remaining,l.excess,o.reconciliation.excluded.length]))];
  const url=URL.createObjectURL(new Blob(["\ufeff"+rows.map(r=>r.map(cell).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="Bestellungen-Lieferstand.csv";a.click();URL.revokeObjectURL(url);
 }
 const order=orders.find(o=>o.id===form?.orderId);
 function csv(){
  const cell=(v:any)=>'"'+String(v??"").replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
  const rows=[["Lieferschein","Datum","Lieferant","Material","Menge","Einheit","Kostenstelle","Bestellung","Prüfung","Eingangsrechnungen"],...filtered.map(i=>[i.number,i.date,i.supplier,i.material,i.quantity,i.unit,i.costCenter,i.review?.order?.number,((i.review?.sourceChanged||i.review?.orderChanged)?"Quelle / Bestellung geändert":labels[i.review?.status||"IN_PRUEFUNG"]),i.invoices.map((b:any)=>b.number+" ("+b.status+")").join(", ")])];
  const url=URL.createObjectURL(new Blob(["\ufeff"+rows.map(r=>r.map(cell).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="Lieferscheine.csv";a.click();URL.revokeObjectURL(url);
 }
 return <div className="bh-page">
  <div className="bh-header-row"><div><h2>Lieferscheine · Prüfung und Zuordnung</h2><div className="bh-note">Projekt: {projectId} · Mobile, Cloud und Baustelle</div></div><div style={{display:"flex",gap:8}}><button className="bh-btn ghost" disabled={busy||dirty} onClick={()=>void load()}>Aktualisieren</button><button className="bh-btn ghost" disabled={!ready} onClick={csv}>CSV exportieren</button></div></div>
  <div className="bh-note">Lieferscheine dokumentieren Lieferungen und Mengen. Kosten werden über die Eingangsrechnung erfasst. Die Prüfung und Bestellzuordnung verändern weder den freigegebenen Lieferschein noch den Lagerbestand.</div>
  {error&&<div role="alert" className="bh-note">{error}</div>}{message&&<div role="status" className="bh-note">{message}</div>}{unreadable>0&&<div className="bh-note">{unreadable} Datei(en) konnten nicht als freigegebene Lieferscheine gelesen werden. Sie wurden aus der Liste ausgeschlossen.</div>}
  <div className="bh-filters">
   <div><label>Suche</label><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nummer, Lieferant, Material, Bestellung"/></div>
   <div><label>Kostenstelle</label><select value={center} onChange={e=>setCenter(e.target.value)}><option value="ALL">Alle</option>{centers.map(c=><option key={String(c)}>{String(c)}</option>)}</select></div>
   <div><label>Prüfung</label><select value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">Alle</option>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{String(v)}</option>)}</select></div>
   <div><label>Rechnungszuordnung</label><select value={invoiceFilter} onChange={e=>setInvoiceFilter(e.target.value)}><option value="ALL">Alle</option><option value="NONE">Ohne Rechnung</option><option value="LINKED">Mit Rechnung</option></select></div>
   <div><label>Von</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div><div><label>Bis</label><input type="date" min={from} value={to} onChange={e=>setTo(e.target.value)}/></div>
  </div>
  <div className="bh-note">{filtered.length} von {items.length} Lieferscheinen</div>
  <div style={{overflowX:"auto"}}><table className="bh-table"><thead><tr><th>Nr. / Datum</th><th>Lieferant</th><th>Material / Menge</th><th>Kostenstelle</th><th>Bestellung</th><th>Prüfung</th><th>Rechnungen</th><th></th></tr></thead><tbody>
   {filtered.map(i=><tr key={i.key}><td>{i.number||"LS-"+i.reportId}<small className="bh-note" style={{display:"block"}}>{dateDe(i.date)}</small></td><td>{i.supplier||"—"}</td><td>{i.material||"—"}<small className="bh-note" style={{display:"block"}}>{i.quantity??"—"} {i.unit} · {i.rowsCount} Position(en)</small></td><td>{i.costCenter||"—"}</td><td>{i.review?.order?.number||"—"}</td><td>{(i.review?.sourceChanged||i.review?.orderChanged)?"Quelle / Bestellung geändert · neu prüfen":labels[i.review?.status||"IN_PRUEFUNG"]}</td><td>{i.invoices.length?i.invoices.map((b:any)=><div key={b.id}>{b.number} · {b.status}</div>):"Ohne Rechnung"}</td><td><button className="bh-btn ghost" disabled={busy||!ready} onClick={()=>void choose(i)}>Prüfen</button></td></tr>)}
   {!filtered.length&&<tr><td colSpan={8}>{ready?"Keine Lieferscheine im aktuellen Filter.":"Lieferscheine werden geladen."}</td></tr>}
  </tbody></table></div>
  <section className="bh-card"><div className="bh-header-row"><h3>Bestellstände · Teil- und Mehrfachlieferungen</h3><button className="bh-btn ghost" disabled={!ready} onClick={exportOrders}>Lieferstand als CSV</button></div>
   <div className="bh-note">Berechnet aus gespeicherten, gültigen Prüfungen. Änderungen im Formular erst speichern. Der Bestellstatus in der Lagerverwaltung wird weiterhin dort gepflegt.</div>
   {orders.map(o=>{const rec=o.reconciliation;return <details key={o.id} style={{margin:"12px 0"}}><summary>{o.number} · {deliveryLabels[rec.status]} · {rec.included} berücksichtigte Lieferscheine{rec.excluded.length?" · "+rec.excluded.length+" offene Prüfungen":""}{rec.excess?" · Mehrmenge":""}</summary><div style={{overflowX:"auto"}}><table className="bh-table"><thead><tr><th>Material</th><th>Einheit</th><th>Bestellt</th><th>Geliefert</th><th>Rest</th><th>Mehrmenge</th></tr></thead><tbody>{rec.lines.map((l:any)=><tr key={l.id}><td>{l.name}{l.invalid?" · Bestellmenge/Einheit prüfen":""}</td><td>{l.unit||"—"}</td><td>{l.ordered}</td><td>{l.delivered}</td><td>{l.remaining??"—"}</td><td>{l.excess??"—"}</td></tr>)}</tbody></table></div>{rec.excluded.map((x:any)=><div className="bh-note" key={x.deliveryKey}>{items.find(i=>i.key===x.deliveryKey)?.number||x.deliveryKey} · {x.reason}</div>)}</details>;})}
   {!orders.length&&<div className="bh-note">Keine Bestellungen für diese Projekt vorhanden.</div>}
  </section>
  {selected&&form&&<section className="bh-card">
   <div className="bh-header-row"><h3>{selected.number||selected.filename} · Lieferscheinprüfung</h3><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{selected.pdfUrl&&<button className="bh-btn ghost" onClick={()=>window.open("https://api.rlcbausoftware.com"+selected.pdfUrl,"_blank","noopener,noreferrer")}>PDF öffnen</button>}<button className="bh-btn" disabled={busy||dirty} onClick={()=>window.location.assign("/buchhaltung/eingang?deliveryNoteKey="+encodeURIComponent(selected.key))}>Eingangsrechnung erfassen</button></div></div>
   {(selected.review?.sourceChanged||selected.review?.orderChanged)&&<div className="bh-note">Die Quelle oder die Bestellung wurde seit der letzten Prüfung geändert. Lieferant und Mengen erneut prüfen.</div>}
   <fieldset disabled={busy||!ready} style={{border:0,padding:0}}><div className="bh-filters">
    <div><label>Bestellung</label><select value={form.orderId} onChange={e=>{update("orderId",e.target.value);update("allocations",[]);update("supplierConfirmed",false);update("quantityConfirmed",false);update("status","IN_PRUEFUNG");}}><option value="">Ohne Bestellung</option>{orders.map(o=><option key={o.id} value={o.id}>{o.number} · {o.supplier||"—"} · {o.status}</option>)}</select></div>
    <div><label>Prüfstatus</label><select value={form.status} onChange={e=>update("status",e.target.value)}>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{String(v)}</option>)}</select></div>
    <div><label>Prüfvermerk / Reklamationsgrund</label><textarea maxLength={5000} value={form.notes} onChange={e=>update("notes",e.target.value)}/></div>
   </div>
   <div style={{display:"flex",gap:20,flexWrap:"wrap",margin:"10px 0"}}><label><input type="checkbox" checked={form.supplierConfirmed} onChange={e=>update("supplierConfirmed",e.target.checked)}/> Lieferant geprüft</label><label><input type="checkbox" checked={form.quantityConfirmed} onChange={e=>update("quantityConfirmed",e.target.checked)}/> Mengen und Einheiten geprüft</label></div>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16}}>
    <div><h4>Geliefert · {selected.supplier||"Lieferant unbekannt"}</h4><table className="bh-table"><thead><tr><th>Material</th><th>Menge</th><th>Einheit</th>{order&&<th>Bestellposition</th>}</tr></thead><tbody>{selected.rows.map((r:any)=><tr key={r.position}><td>{r.material||"—"}</td><td>{r.quantity??"—"}</td><td>{r.unit||"—"}</td>{order&&<td><select aria-label={"Bestellposition für Lieferposition "+r.position} value={form.allocations?.find((a:any)=>a.position===r.position)?.orderLineId||""} onChange={e=>mapPosition(r.position,e.target.value)}><option value="">Nicht zugeordnet</option>{order.lines.map((l:any)=><option key={l.id} value={l.id}>{l.name} · {l.qty} {l.unit}</option>)}</select></td>}</tr>)}</tbody></table></div>
    <div><h4>Bestellt · {order?.supplier||"Keine Bestellung ausgewählt"}</h4>{order&&<table className="bh-table"><thead><tr><th>Material</th><th>Menge</th><th>Einheit</th></tr></thead><tbody>{order.lines.map((r:any)=><tr key={r.id}><td>{r.name}</td><td>{r.qty}</td><td>{r.unit||"—"}</td></tr>)}</tbody></table>}{selected.review?.orderSnapshot&&<div className="bh-note">Die Historie enthält den Bestellstand zum Prüfzeitpunkt. Die Tabelle zeigt den aktuellen Bestellstand. Bei Änderungen erneut vergleichen.</div>}</div>
   </div>
   <div className="bh-note">Alle Lieferpositionen mit ihrer vollständigen Menge einer Bestellposition mit gleicher Einheit zuordnen und anschließend die Prüfung abschließen. Geprüfte, vollständig zugeordnete Lieferscheine fließen in den rechnerischen Lieferstand ein. Rücklieferungen und Einheitenumrechnungen gesondert klären.</div>
   <button className="bh-btn" disabled={!dirty} onClick={()=>void save()}>Prüfung speichern</button></fieldset>
   <h4>Historie</h4>{history.map(h=><div className="bh-note" key={h.id}>{dateDe(h.createdAt)} · {h.userId} · {labels[h.meta?.after?.status]||h.action}{h.meta?.after?.orderSnapshot?.number?" · "+h.meta.after.orderSnapshot.number:""}{h.meta?.after?.notes?" · "+h.meta.after.notes:""}</div>)}{!history.length&&<div className="bh-note">Noch keine Prüfungen gespeichert.</div>}
  </section>}
 </div>;
}
