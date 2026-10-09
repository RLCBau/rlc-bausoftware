import React from "react";
import {useProject} from "../../store/useProject";
import {officeAddonRequest as request} from "./OfficeAddons";
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const blank=()=>({title:"",recipient:"",address:"",carrier:"",trackingNumber:"",contents:"",notes:"",packages:"",plannedDate:"",expectedDate:"",documentId:"",deliveryKey:""});
const actions:Record<string,[string,string][]>={
 Entwurf:[["plan","Planen"],["dispatch","Versand bestätigen"],["cancel","Stornieren"]],
 Geplant:[["dispatch","Versand bestätigen"],["cancel","Stornieren"]],
 Versendet:[["deliver","Zustellung bestätigen"],["problem","Problem melden"]],
 Problem:[["deliver","Zustellung bestätigen"],["resume","Problem geklärt"]]
};
export default function Shipments(){
 const {getSelectedProject}=useProject();const project=getSelectedProject(),projectId=String(project?.id||"");
 const [items,setItems]=React.useState<any[]>([]),[docs,setDocs]=React.useState<any[]>([]),[notes,setNotes]=React.useState<any[]>([]);
 const [selected,setSelected]=React.useState<any>(),[form,setForm]=React.useState<any>(blank),[dirty,setDirty]=React.useState(false);
 const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(""),[message,setMessage]=React.useState(""),[history,setHistory]=React.useState<any[]>([]);
 const [query,setQuery]=React.useState(""),[status,setStatus]=React.useState(""),[unreadable,setUnreadable]=React.useState(0);
 const [action,setAction]=React.useState(""),[eventDate,setEventDate]=React.useState(today),[reason,setReason]=React.useState(""),[receivedBy,setReceivedBy]=React.useState(""),[receiptId,setReceiptId]=React.useState(""),[confirmed,setConfirmed]=React.useState(false);
 const active=React.useRef(projectId);active.current=projectId;const gen=React.useRef(0),guard=React.useRef(false),requestId=React.useRef(crypto.randomUUID());
 const base="/api/office-addons/shipments";
 const load=React.useCallback(async()=>{
  const n=++gen.current;if(!projectId)return;setBusy(true);
  try{const [a,b]=await Promise.all([request(base+"?projectId="+encodeURIComponent(projectId)),request(base+"/resources?projectId="+encodeURIComponent(projectId))]);
   if(n!==gen.current||active.current!==projectId)return;setItems(a.items||[]);setDocs(b.documents||[]);setNotes(b.notes||[]);setUnreadable(b.unreadable||0);
  }catch(e:any){if(n===gen.current)setError(e.message);}finally{if(n===gen.current)setBusy(false);}
 },[projectId]);
 function resetAction(){setAction("");setEventDate(today());setReason("");setReceivedBy("");setReceiptId("");setConfirmed(false);}
 React.useEffect(()=>{setSelected(undefined);setForm(blank());setDirty(false);setItems([]);setDocs([]);setNotes([]);setHistory([]);setError("");setMessage("");resetAction();requestId.current=crypto.randomUUID();void load();return()=>{gen.current++;};},[load]);
 React.useEffect(()=>{if(!dirty&&!action)return;const f=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",f);return()=>window.removeEventListener("beforeunload",f);},[dirty,action]);
 React.useEffect(()=>{let live=true;setHistory([]);if(selected)request(base+"/"+selected.id+"/history").then(x=>{if(live)setHistory(x.items||[]);}).catch(()=>{if(live)setHistory([{id:"error",error:true}]);});return()=>{live=false;};},[selected?.id,selected?.revision,projectId]);
 function populate(row:any){setSelected(row);setForm(Object.fromEntries(Object.keys(blank()).map(k=>[k,row?.[k]??""])));setDirty(false);resetAction();}
 function choose(row?:any){if((dirty||action)&&!window.confirm("Ungespeicherte Angaben verwerfen?"))return;populate(row);requestId.current=crypto.randomUUID();setError("");setMessage("");}
 async function mutate(transition=false){
  if(guard.current||busy||!projectId)return;guard.current=true;const p=projectId;setBusy(true);setError("");setMessage("");
  try{
   const payload=transition?{revision:selected.revision,action,date:eventDate,reason,receivedBy,receiptDocumentId:receiptId,receiptConfirmed:confirmed}:{...form,projectId,revision:selected?.revision,requestId:requestId.current};
   const data=await request(base+(selected?"/"+selected.id:"")+(transition?"/transition":""),{method:transition||!selected?"POST":"PUT",body:JSON.stringify(payload)});
   if(active.current!==p)return;populate(data.item);await load();if(active.current===p)setMessage(transition?"Versandstatus dokumentiert.":"Sendung gespeichert.");
  }catch(e:any){if(active.current===p)setError(e.message);}finally{guard.current=false;if(active.current===p)setBusy(false);}
 }
 const locked=selected&&!["Entwurf","Geplant"].includes(selected.status);
 const visible=items.filter(x=>(!status||x.status===status)&&[x.number,x.title,x.recipient,x.carrier,x.trackingNumber].join(" ").toLowerCase().includes(query.toLowerCase()));
 const noteOptions=selected?.deliveryKey&&!notes.some(x=>x.key===selected.deliveryKey)?[...notes,{key:selected.deliveryKey,number:selected.deliverySnapshot?.number||"Gespeicherter Lieferschein"}]:notes;
 function csv(){const cell=(v:any)=>{const s=String(v??"");return '"'+(/^[=+\-@\t\r]/.test(s)?"'":"")+s.replace(/"/g,'""')+'"';};
  const rows=[["Versandnummer","Bezeichnung","Empfänger","Transporteur","Sendungsnummer","Status","Geplant","Erwartet","Versendet","Zugestellt"],...visible.map(x=>[x.number,x.title,x.recipient,x.carrier,x.trackingNumber,x.status,x.plannedDate,x.expectedDate,x.dispatchedDate,x.deliveredDate])];
  const url=URL.createObjectURL(new Blob(["\uFEFF"+rows.map(r=>r.map(cell).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="Sendungen.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <div className="card">
 <header className="rlc-page-hero rlc-page-hero--split"><div><div className="rlc-page-hero__eyebrow">Büro & Verwaltung · Logistik</div><h1>Versanderfassung</h1><p>{[project?.code,project?.name].filter(Boolean).join(" · ")||"Projekt auswählen"}</p></div><button className="rlc-page-hero__button" disabled={busy||!projectId} onClick={()=>choose()}>+ Neue Sendung</button></header>
 <div className="rlc-page-toolbar" style={{flexWrap:"wrap"}}><input className="rlc-page-toolbar__search" aria-label="Sendungen suchen" placeholder="Sendung, Empfänger oder Transporteur …" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Statusfilter" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Alle Status</option>{["Entwurf","Geplant","Versendet","Problem","Zugestellt","Storniert"].map(s=><option key={s}>{s}</option>)}</select><button className="btn" disabled={busy} onClick={()=>{if((dirty||action)&&!window.confirm("Ungespeicherte Angaben verwerfen?"))return;populate(undefined);void load();}}>Aktualisieren</button><button className="btn" disabled={!visible.length} onClick={csv}>CSV exportieren</button></div>
 {error&&<div className="card" role="alert">{error}</div>}{message&&<div className="card" role="status">{message}</div>}
 {!!unreadable&&<p className="muted">{unreadable} Lieferscheine nicht verfügbar.</p>}
 {!projectId?<div className="rlc-page-empty">Bitte zuerst ein Projekt auswählen.</div>:<div className="rlc-page-workspace" style={{gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,340px),1fr))",alignItems:"start"}}>
 <section className="rlc-page-list"><div className="rlc-page-list-head">{visible.length} Sendungen</div><div className="rlc-page-list-scroll">{visible.map(x=><button className={"rlc-page-document"+(selected?.id===x.id?" is-active":"")} disabled={busy} key={x.id} onClick={()=>choose(x)}><strong>{x.title}</strong><div className="rlc-page-document-meta">{x.number} · {x.status}{x.overdue?" · Termin überschritten":""}</div><div>{x.recipient} · {x.carrier}</div></button>)}{!visible.length&&<div className="rlc-page-empty">{busy?"Wird geladen …":"Noch keine Sendungen vorhanden."}</div>}</div></section>
 <section className="rlc-page-detail"><div className="rlc-page-detail-head"><h2>{selected?.number||"Neue Sendung"}{selected?" · "+selected.status:""}</h2></div>
 <form style={{display:"grid",gap:14,padding:18}} onSubmit={e=>{e.preventDefault();void mutate();}}><fieldset disabled={busy||locked} style={{display:"grid",gap:14,border:0,padding:0}}>
 {([["title","Bezeichnung",250],["recipient","Empfänger",250],["address","Lieferadresse",1000],["carrier","Transporteur",250],["trackingNumber","Sendungsnummer",250],["contents","Sendungsinhalt",5000],["notes","Bemerkung",5000]] as const).map(([k,label,max])=><label key={k} style={{display:"grid",gap:6}}>{label}{max>250?<textarea rows={3} maxLength={max} value={form[k]} onChange={e=>{setForm({...form,[k]:e.target.value});setDirty(true);}}/>:<input required={k==="title"} maxLength={max} value={form[k]} onChange={e=>{setForm({...form,[k]:e.target.value});setDirty(true);}}/>}</label>)}
 <label>Packstücke<input type="number" min={1} max={99999} step={1} value={form.packages} onChange={e=>{setForm({...form,packages:e.target.value});setDirty(true);}}/></label>
 {([["plannedDate","Geplanter Versand"],["expectedDate","Erwartete Zustellung"]] as const).map(([k,l])=><label key={k}>{l}<input type="date" value={form[k]} onChange={e=>{setForm({...form,[k]:e.target.value});setDirty(true);}}/></label>)}
 <label>Lieferschein<select value={form.deliveryKey} onChange={e=>{setForm({...form,deliveryKey:e.target.value});setDirty(true);}}><option value="">Ohne Lieferschein</option>{noteOptions.map(n=><option key={n.key} value={n.key}>{n.number||n.filename} · {n.supplier}</option>)}</select></label>
 <label>Dokument aus der Projektakte<select value={form.documentId} onChange={e=>{setForm({...form,documentId:e.target.value});setDirty(true);}}><option value="">Kein Dokument</option>{docs.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
 </fieldset>{!locked&&<button className="btn btn-primary" disabled={busy||!!selected&&!dirty}>Speichern</button>}</form>
 <section style={{padding:18,borderTop:"1px solid var(--border,#e2e8f0)"}}><p className="muted">Interne, manuelle Versanddokumentation. Zustellung wird durch einen Benutzer mit Datum und Empfänger bestätigt.</p>
 {selected&&<div>Versendet: {selected.dispatchedDate||"–"} · Zugestellt: {selected.deliveredDate||"–"}{selected.receivedBy?" · "+selected.receivedBy:""}{selected.lastIssue&&<p>Problem / Klärung: {selected.lastIssue}</p>}{selected.cancelReason&&<p>Stornogrund: {selected.cancelReason}</p>}{selected.receiptDocument&&<p>Zustellbeleg: {selected.receiptDocument.name}</p>}</div>}
 {selected&&actions[selected.status]&&<form onSubmit={e=>{e.preventDefault();void mutate(true);}} style={{display:"grid",gap:12}}><fieldset disabled={busy||dirty} style={{display:"grid",gap:12,border:0,padding:0}}><label>Aktion<select required value={action} onChange={e=>setAction(e.target.value)}><option value="">Aktion auswählen</option>{actions[selected.status].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Ereignisdatum<input required type="date" max={today()} value={eventDate} onChange={e=>setEventDate(e.target.value)}/></label>
 {["problem","resume","cancel"].includes(action)&&<label>Grund<textarea required maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></label>}
 {action==="deliver"&&<><label>Entgegengenommen durch<input required maxLength={250} value={receivedBy} onChange={e=>setReceivedBy(e.target.value)}/></label><label>Zustellbeleg<select value={receiptId} onChange={e=>setReceiptId(e.target.value)}><option value="">Ohne Beleg</option>{docs.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label><input required type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Tatsächliche Zustellung manuell bestätigen</label></>}
 <button className="btn btn-primary" disabled={!action}>Aktion bestätigen</button></fieldset>{dirty&&<p>Änderungen zuerst speichern.</p>}</form>}
 <h3>Verlauf</h3>{history.map(h=><div key={h.id} style={{padding:"8px 0"}}>{h.error?<p role="alert">Verlauf nicht verfügbar.</p>:<><strong>{h.meta?.after?.status}</strong> · {new Date(h.createdAt).toLocaleString("de-DE")}<div className="muted">Version {h.meta?.after?.revision} · {h.userId}</div>{h.meta?.reason&&<div>{h.meta.reason}</div>}</>}</div>)}
 </section></section></div>}</div>;
}
