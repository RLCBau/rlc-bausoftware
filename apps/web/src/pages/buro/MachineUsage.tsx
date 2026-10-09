import React from "react";
import {Link} from "react-router-dom";
import {useProject} from "../../store/useProject";
import {officeAddonRequest as request} from "./OfficeAddons";
type Form={machineId:string;date:string;hours:string;hourlyRate:string;activity:string;costCenter:string;documentId:string;notes:string};
type Entry=Form & {id:string;revision:number;status:string;amount:string;machine?:{name:string;serial?:string};cancelReason?:string};
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const empty=():Form=>({machineId:"",date:today(),hours:"8",hourlyRate:"0",activity:"",costCenter:"",documentId:"",notes:""});
const money=(v:any)=>Number(v || 0).toLocaleString("de-DE",{style:"currency",currency:"EUR"});
export default function MachineUsage(){
 const {getSelectedProject}=useProject();const project=getSelectedProject(),projectId=String(project?.id || "");
 const [period,setPeriod]=React.useState(today().slice(0,7));
 const from=period+"-01",to=new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),0)).toISOString().slice(0,10);
 const fresh=():Form=>({...empty(),date:period===today().slice(0,7)?today():from});
 const key=projectId+"|"+period,active=React.useRef(key);active.current=key;const generation=React.useRef(0);
 const [items,setItems]=React.useState<Entry[]>([]),[resources,setResources]=React.useState<any>({machines:[],costCenters:[],canBook:false}),[documents,setDocuments]=React.useState<any[]>([]);
 const [form,setForm]=React.useState(empty),[selected,setSelected]=React.useState<Entry | undefined>(),[dirty,setDirty]=React.useState(false),[requestId,setRequestId]=React.useState(()=>crypto.randomUUID());
 const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(""),[message,setMessage]=React.useState(""),[history,setHistory]=React.useState<any[]>([]);
 const [reason,setReason]=React.useState(""),[showCancelled,setShowCancelled]=React.useState(false),[totals,setTotals]=React.useState({hours:"0",amount:"0"});
 const load=React.useCallback(async()=>{
  const n=++generation.current;if(!projectId)return;setBusy(true);setError("");
  try{
   const [data,refs,links]=await Promise.all([request("/api/office-addons/machine-usage?projectId="+encodeURIComponent(projectId)+"&from="+from+"&to="+to),request("/api/office-addons/machine-usage/resources?projectId="+encodeURIComponent(projectId)),request("/api/office-addons/links?projectId="+encodeURIComponent(projectId))]);
   if(n!==generation.current || active.current!==key)return;setItems(data.items || []);setTotals(data.totals);setResources(refs);setDocuments(links.documents || []);
  }catch(e:any){if(n===generation.current)setError(e.message);}finally{if(n===generation.current)setBusy(false);}
 },[projectId,key,from,to]);
 React.useEffect(()=>{setItems([]);setResources({machines:[],costCenters:[],canBook:false});setDocuments([]);setSelected(undefined);setForm(fresh());setRequestId(crypto.randomUUID());setDirty(false);setHistory([]);setTotals({hours:"0",amount:"0"});setError("");setMessage("");setBusy(false);void load();return()=>{generation.current++;};},[load]);
 React.useEffect(()=>{if(!dirty)return;const fn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",fn);return()=>window.removeEventListener("beforeunload",fn);},[dirty]);
 React.useEffect(()=>{let live=true;setHistory([]);if(!selected)return;request("/api/office-addons/machine-usage/"+selected.id+"/history").then(data=>{if(live)setHistory(data.items || []);}).catch(()=>{if(live)setHistory([{id:"error",error:true}]);});return()=>{live=false;};},[selected?.id,selected?.revision,key]);
 function choose(row?:Entry){if(dirty&&!window.confirm("Ungespeicherte Änderungen verwerfen?"))return;setSelected(row);setForm(row?{machineId:row.machineId,date:row.date,hours:row.hours,hourlyRate:row.hourlyRate,activity:row.activity,costCenter:row.costCenter || "",documentId:row.documentId || "",notes:row.notes || ""}:fresh());setRequestId(crypto.randomUUID());setReason("");setDirty(false);setMessage("");setError("");}
 function field(k:keyof Form,value:string){setForm(f=>({...f,[k]:value}));setDirty(true);setMessage("");}
 async function save(e:React.FormEvent){
  e.preventDefault();if(busy || !projectId)return;const source=key;setBusy(true);setError("");setMessage("");
  try{
   const data=await request("/api/office-addons/machine-usage"+(selected?"/"+selected.id:""),{method:selected?"PUT":"POST",body:JSON.stringify({...form,projectId,...(selected?{revision:selected.revision}:{requestId})})});
   if(active.current!==source)return;await load();if(active.current!==source)return;setSelected({...data.item,machine:resources.machines.find((m:any)=>m.id===data.item.machineId)});setForm({...form,hours:data.item.hours,hourlyRate:data.item.hourlyRate});setDirty(false);setMessage(form.date<from || form.date>to?"Geräteeinsatz gespeichert. Datum liegt außerhalb des gewählten Monatsfilters.":"Geräteeinsatz gespeichert.");
  }catch(e:any){if(active.current===source)setError(e.message);}finally{if(active.current===source)setBusy(false);}
 }
 async function action(kind:"book"|"cancel"){
  if(!selected || busy || dirty)return;
  if(!window.confirm(kind==="book"?"Geräteeinsatz in die interne Kostenrechnung übernehmen?":"Geräteeinsatz mit Begründung stornieren?"))return;
  const source=key;setBusy(true);setError("");
  try{
   const data=await request("/api/office-addons/machine-usage/"+selected.id+"/"+kind,{method:"POST",body:JSON.stringify({revision:selected.revision,...(kind==="cancel"?{reason}:{})})});
   if(active.current!==source)return;await load();if(active.current!==source)return;setSelected({...data.item,machine:selected.machine});setMessage(kind==="book"?"Geräteeinsatz gebucht.":"Geräteeinsatz storniert.");
  }catch(e:any){if(active.current===source)setError(e.message);}finally{if(active.current===source)setBusy(false);}
 }
 const visible=items.filter(x=>showCancelled||x.status!=="Storniert"),locked=!!selected && selected.status!=="Entwurf";
 const machines=selected&&!resources.machines.some((m:any)=>m.id===selected.machineId)?[...resources.machines,{id:selected.machineId,name:selected.machine?.name || "Archiviertes Gerät"}]:resources.machines;
 function csv(){
  const rows=[["Datum","Gerät","Tätigkeit","Stunden","Stundensatz EUR","Betrag EUR","Kostenstelle","Status","Stornogrund"],...visible.map(x=>[x.date,x.machine?.name,x.activity,x.hours,x.hourlyRate,x.amount,x.costCenter,x.status,x.cancelReason])];
  const cell=(v:any)=>{const s=String(v??"");return '"'+(/^[=+\-@\t\r]/.test(s)?"'":"")+s.replace(/"/g,'""')+'"';};
  const url=URL.createObjectURL(new Blob(["\uFEFF"+rows.map(r=>r.map(cell).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="Geraeteverrechnung-"+period+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <div className="card">
  <header className="rlc-page-hero rlc-page-hero--split"><div><div className="rlc-page-hero__eyebrow">Büro & Verwaltung · Interne Kostenrechnung</div><h1>Geräteverrechnung</h1><p>{[project?.code,project?.name].filter(Boolean).join(" · ") || "Projekt auswählen"} · {totals.hours} gebuchte Stunden · {money(totals.amount)}</p></div><div className="rlc-page-hero__actions"><button className="rlc-page-hero__button" disabled={busy || !projectId} onClick={()=>choose()}>+ Geräteeinsatz</button></div></header>
  <div className="rlc-page-toolbar" style={{flexWrap:"wrap"}}><Link className="btn" to="/buro/maschinenverwaltung">Maschinen</Link><Link className="btn" to="/buro/freimeldungen">Freimeldungen</Link><Link className="btn" to="/buchhaltung/kostenstellen">Kostenstellen</Link><label>Monat <input type="month" min="1900-01" max="9999-12" value={period} disabled={busy} onChange={e=>{if(!e.target.value || dirty&&!window.confirm("Ungespeicherte Änderungen verwerfen?"))return;setPeriod(e.target.value);}}/></label><label><input type="checkbox" checked={showCancelled} onChange={e=>setShowCancelled(e.target.checked)}/> Stornierte anzeigen</label><button className="btn" disabled={busy} onClick={()=>{if(dirty&&!window.confirm("Ungespeicherte Änderungen verwerfen?"))return;setSelected(undefined);setForm(fresh());setRequestId(crypto.randomUUID());setDirty(false);void load();}}>Aktualisieren</button><button className="btn" disabled={!visible.length} onClick={csv}>CSV exportieren</button></div>
  {error&&<div className="card" role="alert">{error}</div>}{message&&<div className="card" role="status">{message}</div>}
  {!projectId?<div className="rlc-page-empty">Bitte zuerst ein Projekt auswählen.</div>:<div className="rlc-page-workspace" style={{gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,340px),1fr))",alignItems:"start"}}>
   <section className="rlc-page-list"><div className="rlc-page-list-head">{visible.length} Geräteeinsätze</div><div className="rlc-page-list-scroll">{visible.map(x=><button type="button" className={"rlc-page-document"+(selected?.id===x.id?" is-active":"")} key={x.id} disabled={busy} onClick={()=>choose(x)}><strong>{x.machine?.name}</strong><div className="rlc-page-document-meta">{x.date} · {x.status}</div><div>{x.activity}</div><div>{x.hours} h · {money(x.amount)} · {x.costCenter || "Ohne Kostenstelle"}</div></button>)}{!visible.length&&<div className="rlc-page-empty">{busy?"Geräteeinsätze werden geladen …":"Noch keine Geräteeinsätze vorhanden."}</div>}</div></section>
   <section className="rlc-page-detail"><div className="rlc-page-detail-head"><h2>{selected?.machine?.name || "Neuer Geräteeinsatz"}</h2>{selected&&<span>{selected.status} · Version {selected.revision} · {money(selected.amount)}</span>}</div><form onSubmit={save} style={{display:"grid",gap:14,padding:18}}>
    <fieldset disabled={busy || locked} style={{display:"grid",gap:14,padding:0,border:0}}>
     <label style={{display:"grid",gap:6}}>Gerät<select required value={form.machineId} onChange={e=>{const id=e.target.value,m=resources.machines.find((m:any)=>m.id===id);setForm(f=>({...f,machineId:id,hourlyRate:m?.hourlyRate || "0"}));setDirty(true);}}><option value="">Gerät auswählen</option>{machines.map((m:any)=><option key={m.id} value={m.id}>{m.name}{m.serial?" · "+m.serial:""}</option>)}</select></label>
     {!machines.length&&<p className="muted">Zuerst ein Gerät diesem Projekt zuordnen oder einen Einsatz planen.</p>}
     <label style={{display:"grid",gap:6}}>Datum<input required type="date" value={form.date} onChange={e=>field("date",e.target.value)}/></label>
     <label style={{display:"grid",gap:6}}>Tätigkeit<input required maxLength={250} value={form.activity} onChange={e=>field("activity",e.target.value)}/></label>
     <label style={{display:"grid",gap:6}}>Tatsächliche Stunden<input required inputMode="decimal" value={form.hours} onChange={e=>field("hours",e.target.value)}/></label>
     <label style={{display:"grid",gap:6}}>Stundensatz EUR netto<input required inputMode="decimal" value={form.hourlyRate} onChange={e=>field("hourlyRate",e.target.value)}/></label>
     <label style={{display:"grid",gap:6}}>Kostenstelle<select value={form.costCenter} onChange={e=>field("costCenter",e.target.value)}><option value="">Ohne Kostenstelle</option>{resources.costCenters.map((c:any)=><option key={c.code} value={c.code}>{c.code} · {c.description}</option>)}{selected?.costCenter&&!resources.costCenters.some((c:any)=>c.code===selected.costCenter)&&<option value={selected.costCenter}>{selected.costCenter} · Inaktiv</option>}</select></label>
     <label style={{display:"grid",gap:6}}>Dokument aus der Projektakte<select value={form.documentId} onChange={e=>field("documentId",e.target.value)}><option value="">Kein Dokument verknüpft</option>{documents.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
     <label style={{display:"grid",gap:6}}>Bemerkung<textarea rows={4} maxLength={5000} value={form.notes} onChange={e=>field("notes",e.target.value)}/></label>
    </fieldset>
    <p className="muted">Kosten entstehen aus gebuchten tatsächlichen Einsätzen. Der gebuchte Stundensatz bleibt erhalten. Buchhaltung oder Administrator bestätigen die Übernahme in die interne Kostenrechnung.</p>
    {!locked&&<button className="btn btn-primary" disabled={busy || (!!selected&&!dirty)}>{busy?"Wird gespeichert …":"Entwurf speichern"}</button>}
    {selected?.status==="Entwurf"&&resources.canBook&&<button className="btn btn-primary" type="button" disabled={busy || dirty || selected.date>today()} onClick={()=>void action("book")}>In Kostenrechnung übernehmen</button>}
    {selected&&selected.status!=="Storniert"&&(selected.status==="Entwurf"||resources.canBook)&&<><label style={{display:"grid",gap:6}}>Stornogrund<textarea rows={2} maxLength={5000} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="btn" type="button" disabled={busy || dirty || !reason.trim()} onClick={()=>void action("cancel")}>Stornieren</button></>}
    {selected?.cancelReason&&<p className="muted">Storno: {selected.cancelReason}</p>}
   </form>
   {selected&&<section style={{padding:18,borderTop:"1px solid var(--border, #e2e8f0)"}}><h3>Verlauf</h3>{history.map(h=>h.error?<p role="alert" key={h.id}>Verlauf konnte nicht geladen werden.</p>:<div key={h.id} style={{padding:"8px 0"}}><strong>{h.meta?.after?.status || "Angelegt"}</strong> · {new Date(h.createdAt).toLocaleString("de-DE")}<div className="muted">Version {h.meta?.after?.revision} · {money(h.meta?.after?.amount)}</div></div>)}</section>}
   </section>
  </div>}
 </div>;
}
