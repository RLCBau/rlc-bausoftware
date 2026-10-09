
import React,{useEffect,useRef,useState} from "react";
import {Link} from "react-router-dom";
import {accountingApi,dateDe,euro,getAccountingProject} from "./accountingApi";
import "./styles.css";
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const fresh=()=>({title:"",text:"",account:"1000",contraAccount:"1200",amount:"",costCenter:"",startDate:today(),endDate:"",frequency:"MONTHLY",active:true});
export default function Dauerbuchungen(){
 const projectId=getAccountingProject();
 const [rows,setRows]=useState<any[]>([]),[centers,setCenters]=useState<any[]>([]);
 const [selected,setSelected]=useState<any>(null),[form,setForm]=useState(fresh);
 const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [through,setThrough]=useState(today),[preview,setPreview]=useState<any>(null),[dates,setDates]=useState<string[]>([]);
 const [history,setHistory]=useState<any>(null),[ready,setReady]=useState(false);
 const requestId=useRef(crypto.randomUUID()),version=useRef(0);
 const root="/api/accounting/recurring-ledger";
 const locked=Boolean(selected?._count?.occurrences);
 async function load(){
  const v=++version.current;setReady(false);
  try{const data=await accountingApi(root);if(v!==version.current)return;setRows(data.items||[]);setCenters(data.centers||[]);setReady(true);}
  catch(e:any){if(v===version.current)setError(e.message);}
 }
 useEffect(()=>{void load();return()=>{version.current++;};},[projectId]);
 useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",guard);return()=>window.removeEventListener("beforeunload",guard);},[dirty]);
 function choose(row:any){
  if(busy || (dirty&&!window.confirm("Ungespeicherte Änderungen verwerfen?")))return;
  setSelected(row);setForm(row?{...fresh(),...row,amount:String(row.amount)}:fresh());setDirty(false);setError("");setMessage("");setPreview(null);setDates([]);setHistory(null);requestId.current=crypto.randomUUID();
 }
 function update(key:string,value:any){setForm(f=>({...f,[key]:value}));setDirty(true);setPreview(null);}
 async function save(){
  setBusy(true);setError("");setMessage("");
  try{
   const data=await accountingApi(selected?root+"/"+selected.id:root,{method:selected?"PUT":"POST",body:JSON.stringify({...form,revision:selected?.revision,requestId:requestId.current})});
   setSelected(data.item);setForm({...fresh(),...data.item,amount:String(data.item.amount)});setDirty(false);setPreview(null);setMessage("Vorlage gespeichert.");await load();
   const h=await accountingApi(root+"/"+data.item.id+"/history");setHistory(h);
   setSelected((s:any)=>({...s,_count:{occurrences:h.occurrences.length}}));
  }catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 async function showPreview(){
  if(!selected||dirty)return;setBusy(true);setError("");setMessage("");
  try{const p=await accountingApi(root+"/"+selected.id+"/preview?through="+encodeURIComponent(through));setPreview(p);setDates(p.dates.slice(0,120));}
  catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 async function generate(){
  if(!selected||!preview||dirty||!dates.length)return;
  if(!window.confirm(dates.length+" Journalbuchungen zu je "+euro(preview.amount)+" € verbindlich buchen?"))return;
  setBusy(true);setError("");setMessage("");
  try{const r=await accountingApi(root+"/"+selected.id+"/generate",{method:"POST",body:JSON.stringify({through,dates,revision:preview.revision})});setMessage(r.created+" Buchungen erstellt; bereits gebuchte Fälligkeiten werden übersprungen.");setPreview(null);setDates([]);setSelected((s:any)=>({...s,_count:{occurrences:Math.max(1,s?._count?.occurrences||0)}}));await load();setHistory(await accountingApi(root+"/"+selected.id+"/history"));}
  catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 async function showHistory(){
  if(!selected)return;setBusy(true);setError("");
  try{setHistory(await accountingApi(root+"/"+selected.id+"/history"));}
  catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 const labels:any={MONTHLY:"Monatlich",QUARTERLY:"Vierteljährlich",YEARLY:"Jährlich"};
 return <div className="bh-page">
  <div className="bh-header-row"><div><h2>Dauerbuchungen</h2><div className="bh-note">Projekt: {projectId} · Wiederkehrende Journalbuchungen mit Vorschau und Bestätigung.</div></div><Link className="bh-btn ghost" to="/buchhaltung/kassenbuch">Journal öffnen</Link></div>
  <div className="bh-note">Jede Fälligkeit wird einmal gebucht. Am Monatsende wird der ursprüngliche Starttag verwendet, begrenzt auf den letzten Kalendertag. Gebuchte Vorlagen können pausiert werden; Preis- oder Kontoänderungen benötigen eine neue Vorlage. Das Journal wird separat von Lieferanten-, Personal- und Gerätekosten ausgewertet.</div>
  {error&&<div className="bh-note" role="alert">{error}</div>}{message&&<div className="bh-note" role="status">{message.replace("Fälligkeiten","Fälligkeiten")}</div>}
  <div className="bh-header-row"><h3>Vorlagen</h3><button className="bh-btn" disabled={busy||!ready} onClick={()=>choose(null)}>+ Neue Vorlage</button></div>
  <div style={{overflowX:"auto"}}><table className="bh-table"><thead><tr><th>Bezeichnung</th><th>Intervall</th><th>Start</th><th>Betrag</th><th>Kostenstelle</th><th>Status</th><th></th></tr></thead><tbody>
   {rows.map(r=><tr key={r.id}><td>{r.title}</td><td>{labels[r.frequency]}</td><td>{dateDe(r.startDate)}</td><td>{euro(r.amount)} €</td><td>{r.costCenter||"—"}</td><td>{r.active?"Aktiv":"Pausiert"}</td><td><button className="bh-btn ghost" disabled={busy} onClick={()=>choose(r)}>Öffnen</button></td></tr>)}
   {!rows.length&&<tr><td colSpan={7}>{ready?"Keine Vorlagen vorhanden.":"Vorlagen werden geladen."}</td></tr>}
  </tbody></table></div>
  <h3>{selected?"Vorlage bearbeiten":"Neue Vorlage"}</h3>
  <fieldset disabled={busy||!ready} style={{border:0,padding:0}}>
   <div className="bh-filters">
    <div><label>Bezeichnung</label><input maxLength={250} disabled={locked} value={form.title} onChange={e=>update("title",e.target.value)}/></div>
    <div><label>Buchungstext</label><input maxLength={1000} disabled={locked} value={form.text} onChange={e=>update("text",e.target.value)}/></div>
    <div><label>Konto</label><input disabled={locked} value={form.account} onChange={e=>update("account",e.target.value)}/></div>
    <div><label>Gegenkonto</label><input disabled={locked} value={form.contraAccount} onChange={e=>update("contraAccount",e.target.value)}/></div>
    <div><label>Betrag (+ Einnahme / − Ausgabe)</label><input inputMode="decimal" disabled={locked} value={form.amount} onChange={e=>update("amount",e.target.value)}/></div>
    <div><label>Kostenstelle</label><select disabled={locked} value={form.costCenter||""} onChange={e=>update("costCenter",e.target.value)}><option value="">Ohne Zuordnung</option>{form.costCenter&&!centers.some(c=>c.code===form.costCenter)&&<option value={form.costCenter}>{form.costCenter} (inaktiv)</option>}{centers.map(c=><option key={c.code} value={c.code}>{c.code} · {c.description}</option>)}</select></div>
    <div><label>Startdatum</label><input type="date" min="1900-01-01" disabled={locked} value={form.startDate} onChange={e=>update("startDate",e.target.value)}/></div>
    <div><label>Enddatum (optional)</label><input type="date" min={form.startDate} disabled={locked} value={form.endDate} onChange={e=>update("endDate",e.target.value)}/></div>
    <div><label>Intervall</label><select disabled={locked} value={form.frequency} onChange={e=>update("frequency",e.target.value)}>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{String(label)}</option>)}</select></div>
    <div><label>Status</label><select value={form.active?"active":"paused"} onChange={e=>update("active",e.target.value==="active")}><option value="active">Aktiv</option><option value="paused">Pausiert</option></select></div>
   </div>
   <button className="bh-btn" onClick={()=>void save()} disabled={!dirty}>Vorlage speichern</button>
  </fieldset>
  {selected&&<><h3>Fällige Buchungen</h3><div className="bh-filters"><div><label>Bis einschließlich</label><input type="date" max={today()} value={through} disabled={busy} onChange={e=>{setThrough(e.target.value);setPreview(null);setDates([]);}}/></div><div style={{alignSelf:"end"}}><button className="bh-btn ghost" disabled={busy||dirty||!ready} onClick={()=>void showPreview()}>Vorschau laden</button></div></div>
   {dirty&&<div className="bh-note">Änderungen vor der Vorschau speichern.</div>}
   {preview&&<><div className="bh-note">{preview.dates.length} offene Fälligkeiten. Höchstens 120 pro Buchungslauf.</div><div style={{display:"flex",gap:12,flexWrap:"wrap",margin:"12px 0"}}>{preview.dates.map((d:string)=><label key={d}><input type="checkbox" disabled={busy||(!dates.includes(d)&&dates.length>=120)} checked={dates.includes(d)} onChange={e=>setDates(x=>e.target.checked?[...x,d]:x.filter(v=>v!==d))}/>{dateDe(d)} · {euro(preview.amount)} €</label>)}</div><button className="bh-btn" disabled={busy||dirty||!dates.length} onClick={()=>void generate()}>{dates.length} Fälligkeiten buchen</button></>}
   <h3>Historie und erzeugte Buchungen</h3><button className="bh-btn ghost" disabled={busy} onClick={()=>void showHistory()}>Historie laden</button>
   {history&&<><div style={{overflowX:"auto"}}><table className="bh-table"><thead><tr><th>Fälligkeit</th><th>Journal-ID</th><th>Betrag</th></tr></thead><tbody>{history.occurrences.map((o:any)=><tr key={o.id}><td>{dateDe(o.date)}</td><td>{o.ledgerId}</td><td>{euro(o.ledger.amount)} €</td></tr>)}{!history.occurrences.length&&<tr><td colSpan={3}>Noch keine Buchungen.</td></tr>}</tbody></table></div>{history.items.map((h:any)=><div key={h.id} className="bh-note">{dateDe(h.createdAt)} · {h.action} · {h.userId}</div>)}</>}
  </>}
 </div>;
}
