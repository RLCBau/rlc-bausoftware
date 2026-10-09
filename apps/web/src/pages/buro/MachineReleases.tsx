import React from "react";
import {Link} from "react-router-dom";
import {useProject} from "../../store/useProject";
import {officeAddonRequest as request} from "./OfficeAddons";
type Form={machineId:string;releaseDate:string;availableFrom:string;condition:string;status:string;documentId:string;notes:string};
type Release=Form & {id:string;revision:number;machine?:{name:string;serial?:string};reportedAt?:string;confirmedAt?:string};
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const blank=():Form=>({machineId:"",releaseDate:today(),availableFrom:today(),condition:"Einsatzbereit",status:"Entwurf",documentId:"",notes:""});
const conditions=["Einsatzbereit","Wartung erforderlich","Nicht einsatzbereit"];
const transitions:Record<string,string[]>={Entwurf:["Entwurf","Gemeldet","Storniert"],Gemeldet:["Gemeldet","Bestätigt","Storniert"],Bestätigt:["Bestätigt","Archiviert"],Storniert:["Storniert","Archiviert"],Archiviert:["Archiviert"]};
export default function MachineReleases(){
 const {getSelectedProject}=useProject();const project=getSelectedProject(),projectId=String(project?.id || "");
 const [items,setItems]=React.useState<Release[]>([]),[machines,setMachines]=React.useState<any[]>([]),[documents,setDocuments]=React.useState<any[]>([]);
 const [form,setForm]=React.useState(blank),[selected,setSelected]=React.useState<Release | undefined>(),[dirty,setDirty]=React.useState(false);
 const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(""),[message,setMessage]=React.useState(""),[history,setHistory]=React.useState<any[]>([]);
 const [archived,setArchived]=React.useState(false),[query,setQuery]=React.useState("");
 const active=React.useRef(projectId);active.current=projectId;const generation=React.useRef(0);
 const load=React.useCallback(async()=>{
  const n=++generation.current;if(!projectId)return;setBusy(true);setError("");
  try{
   const [data,resources,links]=await Promise.all([request("/api/office-addons/machine-releases?projectId="+encodeURIComponent(projectId)),request("/api/office-addons/machine-releases/resources?projectId="+encodeURIComponent(projectId)),request("/api/office-addons/links?projectId="+encodeURIComponent(projectId))]);
   if(n!==generation.current || active.current!==projectId)return;
   setItems(data.items || []);setMachines(resources.machines || []);setDocuments(links.documents || []);
  }catch(e:any){if(n===generation.current)setError(e.message);}finally{if(n===generation.current)setBusy(false);}
 },[projectId]);
 React.useEffect(()=>{setItems([]);setMachines([]);setDocuments([]);setSelected(undefined);setForm(blank());setDirty(false);setHistory([]);setError("");setMessage("");setBusy(false);void load();return()=>{generation.current++;};},[load]);
 React.useEffect(()=>{if(!dirty)return;const fn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",fn);return()=>window.removeEventListener("beforeunload",fn);},[dirty]);
 React.useEffect(()=>{
  let live=true;setHistory([]);if(!selected)return;
  request("/api/office-addons/machine-releases/"+encodeURIComponent(selected.id)+"/history").then(data=>{if(live)setHistory(data.items || []);}).catch(()=>{if(live)setHistory([{id:"error",error:true}]);});
  return()=>{live=false;};
 },[selected?.id,selected?.revision,projectId]);
 function choose(row?:Release){if(dirty&&!window.confirm("Ungespeicherte Änderungen verwerfen?"))return;setSelected(row);setForm(row?{machineId:row.machineId,releaseDate:row.releaseDate,availableFrom:row.availableFrom,condition:row.condition,status:row.status,documentId:row.documentId || "",notes:row.notes || ""}:blank());setDirty(false);setMessage("");setError("");}
 function field(k:keyof Form,value:string){setForm(f=>({...f,[k]:value}));setDirty(true);setMessage("");}
 async function save(e:React.FormEvent){
  e.preventDefault();if(busy || !projectId)return;const source=projectId;setBusy(true);setError("");setMessage("");
  try{
   const data=await request("/api/office-addons/machine-releases"+(selected?"/"+encodeURIComponent(selected.id):""),{method:selected?"PUT":"POST",body:JSON.stringify({...form,projectId,...(selected?{revision:selected.revision}:{})})});
   if(active.current!==source)return;await load();if(active.current!==source)return;
   setSelected({...data.item,machine:machines.find(m=>m.id===data.item.machineId)});setForm({...form,status:data.item.status});setDirty(false);setMessage("Freimeldung gespeichert.");
  }catch(e:any){if(active.current===source)setError(e.message);}finally{if(active.current===source)setBusy(false);}
 }
 const visible=items.filter(x=>(archived||x.status!=="Archiviert")&&(!query || [x.machine?.name,x.machine?.serial,x.condition,x.notes,x.status].join(" ").toLowerCase().includes(query.toLowerCase())));
 function csv(){
  const rows=[["Gerät","Seriennummer","Einsatzende","Disponierbar ab","Zustand","Status","Bemerkung"],...visible.map(x=>[x.machine?.name,x.machine?.serial,x.releaseDate,x.availableFrom,x.condition,x.status,x.notes])];
  const cell=(v:any)=>{const s=String(v??"");return '"'+(/^[=+\-@\t\r]/.test(s)?"'":"")+s.replace(/"/g,'""')+'"';};
  const blob=new Blob(["\uFEFF"+rows.map(r=>r.map(cell).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="Freimeldungen.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const locked=!!selected && selected.status!=="Entwurf";
 const resourceOptions=selected&&!machines.some(m=>m.id===selected.machineId)?[...machines,{id:selected.machineId,name:selected.machine?.name || "Archiviertes Gerät"}]:machines;
 return <div className="card">
  <header className="rlc-page-hero rlc-page-hero--split"><div><div className="rlc-page-hero__eyebrow">Büro & Verwaltung · Geräte</div><h1>Freimeldungen</h1><p>{[project?.code,project?.name].filter(Boolean).join(" · ") || "Projekt auswählen"} · Einsatzende und Gerätezustand dokumentieren</p></div><div className="rlc-page-hero__actions"><button className="rlc-page-hero__button" disabled={busy || !projectId} onClick={()=>choose()}>+ Neue Freimeldung</button></div></header>
  <div className="rlc-page-toolbar" style={{flexWrap:"wrap"}}><Link className="btn" to="/buro/maschinenverwaltung">Maschinen</Link><Link className="btn" to="/buro/ressourcenplanung">Einsatzplanung</Link><input className="rlc-page-toolbar__search" aria-label="Freimeldungen suchen" placeholder="Gerät, Zustand oder Status suchen …" value={query} onChange={e=>setQuery(e.target.value)}/><label><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/> Archivierte anzeigen</label><button className="btn" disabled={busy} onClick={()=>{if(dirty&&!window.confirm("Ungespeicherte Änderungen verwerfen?"))return;setSelected(undefined);setForm(blank());setDirty(false);void load();}}>Aktualisieren</button><button className="btn" disabled={!visible.length} onClick={csv}>CSV exportieren</button></div>
  {error&&<div className="card" role="alert">{error}</div>}{message&&<div className="card" role="status">{message}</div>}
  {!projectId?<div className="rlc-page-empty">Bitte zuerst ein Projekt auswählen.</div>:<div className="rlc-page-workspace" style={{gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,340px),1fr))",alignItems:"start"}}>
   <section className="rlc-page-list"><div className="rlc-page-list-head">{visible.length} Freimeldungen</div><div className="rlc-page-list-scroll">{visible.map(x=><button type="button" className={"rlc-page-document"+(selected?.id===x.id?" is-active":"")} key={x.id} disabled={busy} onClick={()=>choose(x)}><strong>{x.machine?.name}</strong><div className="rlc-page-document-meta">{x.releaseDate} · {x.status}</div><div>{x.condition} · Disponierbar ab {x.availableFrom}</div></button>)}{!visible.length&&<div className="rlc-page-empty">{busy?"Freimeldungen werden geladen …":"Noch keine Freimeldungen vorhanden."}</div>}</div></section>
   <section className="rlc-page-detail"><div className="rlc-page-detail-head"><h2>{selected?.machine?.name || "Neue Freimeldung"}</h2></div><form onSubmit={save} style={{display:"grid",gap:14,padding:18}}>
    <fieldset disabled={busy || locked} style={{display:"grid",gap:14,padding:0,border:0}}>
     <label style={{display:"grid",gap:6}}>Gerät<select required value={form.machineId} onChange={e=>field("machineId",e.target.value)}><option value="">Gerät auswählen</option>{resourceOptions.map(m=><option key={m.id} value={m.id}>{m.name}{m.serial?" · "+m.serial:""}</option>)}</select></label>
     {!machines.length&&!selected&&<p className="muted">Zuerst ein Gerät diesem Projekt zuordnen oder einen Einsatz in der Einsatzplanung erfassen.</p>}
     <label style={{display:"grid",gap:6}}>Einsatzende<input required type="date" value={form.releaseDate} onChange={e=>field("releaseDate",e.target.value)}/></label>
     <label style={{display:"grid",gap:6}}>Disponierbar ab<input required type="date" min={form.releaseDate} value={form.availableFrom} onChange={e=>field("availableFrom",e.target.value)}/></label>
     <label style={{display:"grid",gap:6}}>Gerätezustand<select value={form.condition} onChange={e=>field("condition",e.target.value)}>{conditions.map(s=><option key={s}>{s}</option>)}</select></label>
     <label style={{display:"grid",gap:6}}>Dokument aus der Projektakte<select value={form.documentId} onChange={e=>field("documentId",e.target.value)}><option value="">Kein Dokument verknüpft</option>{documents.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
     <label style={{display:"grid",gap:6}}>Bemerkung<textarea rows={4} maxLength={5000} value={form.notes} onChange={e=>field("notes",e.target.value)}/></label>
    </fieldset>
    <label style={{display:"grid",gap:6}}>Status<select disabled={busy || !selected || selected.status==="Archiviert"} value={form.status} onChange={e=>field("status",e.target.value)}>{(selected?transitions[selected.status]:["Entwurf"]).map(s=><option key={s} disabled={s==="Bestätigt" && form.releaseDate>today()}>{s}</option>)}</select></label>
    <p className="muted">Gemeldete Angaben bleiben nachvollziehbar gesperrt. Bitte die Verfügbarkeit mit der Einsatzplanung und dem Gerätezustand abstimmen; vorhandene Einsätze bleiben erhalten.</p>
    <button className="btn btn-primary" disabled={busy || selected?.status==="Archiviert" || (!!selected&&!dirty)}>{busy?"Wird gespeichert …":"Speichern"}</button>
   </form>
   {selected&&<section style={{padding:18,borderTop:"1px solid var(--border, #e2e8f0)"}}><h3>Verlauf</h3>{history.map(h=>h.error?<p role="alert" key={h.id}>Verlauf konnte nicht geladen werden.</p>:<div key={h.id} style={{padding:"8px 0"}}><strong>{h.meta?.after?.status || "Angelegt"}</strong> · {new Date(h.createdAt).toLocaleString("de-DE")}<div className="muted">Version {h.meta?.after?.revision}</div></div>)}</section>}
   </section>
  </div>}
 </div>;
}
