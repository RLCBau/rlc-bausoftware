import {apiUrl} from '../../lib/apiBase';
import React from "react";
import {Link} from "react-router-dom";
import * as XLSX from "xlsx";
import { useProject } from "../../store/useProject";
import { officeAddonRequest as request } from "../buro/OfficeAddons";
type Line={position:string;title:string;unit:string;quantity:string;unitPrice:string};
type Bid={id:string;title:string;supplier:string;packageKey:string;kind:string;status:string;discountPercent:string;positions:Line[];revision:number;notes?:string;documentId?:string;awardedAt?:string;total?:string};
const empty=():Omit<Bid,"id"|"revision">=>({title:"",supplier:"",packageKey:"LV",kind:"LV",status:"Entwurf",discountPercent:"0",positions:[{position:"",title:"",unit:"",quantity:"",unitPrice:""}],notes:"",documentId:""});
const money=(v:any)=>v==null?"—":Number(v).toLocaleString("de-DE",{style:"currency",currency:"EUR"});
export default function Preisspiegel() {
 const {getSelectedProject}=useProject();const project=getSelectedProject();const projectId=String(project?.id || "");
 const [editingRevision,setEditingRevision]=React.useState<number | undefined>();
 const [bids,setBids]=React.useState<Bid[]>([]);const [selectedId,setSelectedId]=React.useState("");
 const [form,setForm]=React.useState(empty);const [dirty,setDirty]=React.useState(false);const [busy,setBusy]=React.useState(false);const [error,setError]=React.useState("");const [message,setMessage]=React.useState("");
 const [baselineId,setBaselineId]=React.useState("");const [comparison,setComparison]=React.useState<any>(null);const [tab,setTab]=React.useState<"offers"|"compare">("offers");const [documents,setDocuments]=React.useState<any[]>([]);
 const active=React.useRef(projectId);active.current=projectId;const generation=React.useRef(0);const importGeneration=React.useRef(0);const compareGeneration=React.useRef(0);
 const pdfGuard=React.useRef(false);const comparisonRef=React.useRef(comparison);comparisonRef.current=comparison;
 const selected=bids.find(b=>b.id===selectedId);
 const load=React.useCallback(async()=>{
  const n=++generation.current;if(!projectId)return;setBusy(true);setError("");
  try{
   const [data,links]=await Promise.all([request("/api/office-addons/bids?projectId="+encodeURIComponent(projectId)),request("/api/office-addons/links?projectId="+encodeURIComponent(projectId))]);
   if(n!==generation.current || active.current!==projectId)return;
   setBids(data.items);setDocuments(links.documents || []);
  }catch(e:any){if(n===generation.current)setError(e.message);}finally{if(n===generation.current)setBusy(false);}
 },[projectId]);
 React.useEffect(()=>{setBids([]);setSelectedId("");setEditingRevision(undefined);importGeneration.current++;compareGeneration.current++;setBusy(false);setForm(empty());setDirty(false);setComparison(null);setBaselineId("");setDocuments([]);void load();return()=>{generation.current++;};},[load]);
 React.useEffect(()=>{if(!dirty)return;const fn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",fn);return()=>window.removeEventListener("beforeunload",fn);},[dirty]);
 function choose(b?:Bid){if(dirty&&!window.confirm("Ungespeicherte Änderungen verwerfen?"))return;setSelectedId(b?.id || "");setEditingRevision(b?.revision);setForm(b ? {...b,documentId:b.documentId || "",notes:b.notes || ""}:empty());setDirty(false);setError("");setMessage("");}
 function field(k:string,v:any){setForm(f=>({...f,[k]:v}));setDirty(true);setMessage("");}
 function cell(i:number,k:keyof Line,v:string){field("positions",form.positions.map((r,n)=>n===i?{...r,[k]:v}:r));}
 async function save(e:React.FormEvent){
  e.preventDefault();if(!projectId || busy)return;const source=projectId;setBusy(true);setError("");setMessage("");
  try{const r=await request("/api/office-addons/bids"+(selected?"/"+selected.id:""),{method:selected?"PUT":"POST",body:JSON.stringify({...form,projectId,...(selected?{revision:editingRevision}:{})})});
   if(active.current!==source)return;await load();if(active.current!==source)return;setSelectedId(r.item.id);setEditingRevision(r.item.revision);setForm({...r.item,discountPercent:String(r.item.discountPercent),documentId:r.item.documentId || "",notes:r.item.notes || ""});setDirty(false);setComparison(null);setMessage("Angebot gespeichert.");
  }catch(e:any){if(active.current===source)setError(e.message);}finally{if(active.current===source)setBusy(false);}
 }
 async function compare(id=baselineId){
  if(!id)return;const n=++compareGeneration.current;const source=projectId;setBusy(true);setError("");
  try{const data=await request("/api/office-addons/bids/compare/"+encodeURIComponent(id));if(active.current===source && n===compareGeneration.current){setComparison(data);setTab("compare");}}
  catch(e:any){if(active.current===source)setError(e.message);}finally{if(active.current===source)setBusy(false);}
 }
 async function award(id:string,undo=false){
  const b=bids.find(x=>x.id===id);if(!b || busy)return;
  if(!window.confirm(undo?"Angebotsauswahl aufheben?":"Dieses Angebot für das Vergabepaket auswählen?"))return;
  const source=projectId;setBusy(true);setError("");
  try{await request("/api/office-addons/bids/"+id+(undo?"/unselect":"/award"),{method:"POST",body:JSON.stringify({baselineId,revision:b.revision})});
   if(active.current!==source)return;await load();if(active.current!==source)return;await compare();setMessage(undo?"Auswahl aufgehoben.":"Angebot ausgewählt.");
  }catch(e:any){if(active.current===source)setError(e.message);}finally{if(active.current===source)setBusy(false);}
 }
 async function importFile(file?:File){
  if(!file || busy)return;const source=projectId;const n=++importGeneration.current;setError("");setBusy(true);
  if(file.size>5*1024*1024){setError("Datei zu groß: maximal 5 MB.");setBusy(false);return;}
  if(!/\.(csv|xlsx)$/i.test(file.name)){setError("Bitte CSV oder XLSX verwenden.");setBusy(false);return;}
  try{
   const bytes=await file.arrayBuffer();if(active.current!==source || n!==importGeneration.current)return;
   const workbook=XLSX.read(bytes,{type:"array",cellFormula:false,cellHTML:false});
   const rows=XLSX.utils.sheet_to_json<Record<string,any>>(workbook.Sheets[workbook.SheetNames[0]],{defval:""});
   if(!rows.length || rows.length>5000)throw new Error("1 bis 5000 Positionen erforderlich.");
   const norm=(s:string)=>s.toLowerCase().replace(/[\s_.-]/g,"");
   const value=(r:any,aliases:string[])=>{const key=Object.keys(r).find(k=>aliases.includes(norm(k)));return key===undefined?"":String(r[key]).trim();};
   const num=(v:string)=>v.includes(",")?v.replace(/\./g,"").replace(",","."):v;
   const positions=rows.map(r=>({position:value(r,["position","positionsnummer","oz","posnr"]),title:value(r,["kurztext","bezeichnung","title"]),unit:value(r,["einheit","unit"]),quantity:num(value(r,["menge","quantity"])),unitPrice:num(value(r,["ep","einzelpreis","unitprice"]))}));
   if(positions.some(r=>!r.position || !r.unit || !r.quantity || !r.unitPrice))throw new Error("Benötigte Spalten: Position, Kurztext, Einheit, Menge, EP. Bitte prüfen.");
   field("positions",positions);setMessage(positions.length+" Positionen als Entwurf geladen. Bitte prüfen und speichern.");
  }catch(e:any){if(active.current===source && n===importGeneration.current)setError(e.message || "Import fehlgeschlagen.");}finally{if(active.current===source && n===importGeneration.current)setBusy(false);}
 }
 async function exportPdf(){
  if(!comparison?.snapshot?.fingerprint||busy||dirty||pdfGuard.current)return;
  pdfGuard.current=true;const source=projectId,captured=comparison;setBusy(true);setError("");
  try{
   let token="";try{token=localStorage.getItem("rlc_token")||JSON.parse(localStorage.getItem("rlc_auth")||"{}").token||"";}catch{}
   const res=await fetch(apiUrl("/api/office-addons/bids/compare/"+encodeURIComponent(captured.baselineId)+"/pdf"),{method:"POST",credentials:"include",headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:JSON.stringify({fingerprint:captured.snapshot.fingerprint})});
   if(!res.ok){const d=await res.json().catch(()=>({}));throw new Error(d.error||"PDF konnte nicht erstellt werden.");}
   if(!res.headers.get("Content-Type")?.includes("application/pdf"))throw new Error("PDF-Antwort ungültig.");
   const blob=await res.blob();if(active.current!==source||comparisonRef.current!==captured)return;
   const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="Preisspiegel.pdf";a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
   setMessage("PDF aus gespeicherten Angeboten erstellt. Angebotsdaten und Auswahl bleiben erhalten.");
  }catch(e:any){if(active.current===source&&comparisonRef.current===captured)setError(e.message);}
  finally{pdfGuard.current=false;if(active.current===source)setBusy(false);}
 }
 function exportComparison(){
  if(!comparison)return;
  const rows=[["Position","Kurztext","Einheit","Bezugsmenge",...comparison.offers.map((b:any)=>b.supplier+" · EP")],
   ...comparison.positions.map((r:Line,i:number)=>[r.position,r.title,r.unit,r.quantity,...comparison.offers.map((b:any)=>b.cells[i]?.comparable?b.cells[i].unitPrice:b.cells[i]?.reason || "")]),
   ["Vergleichssumme netto","","","",...comparison.offers.map((b:any)=>b.normalizedTotal || "Nicht vergleichbar")]];
  const cell=(v:any)=>{const s=String(v??"");return '"'+(/^[=+\-@\t\r]/.test(s)?"'":"")+s.replace(/"/g,'""')+'"';};
  const blob=new Blob(["\uFEFF"+rows.map(r=>r.map(cell).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="Preisspiegel.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const locked=selected && selected.status!=="Entwurf";
 return <div className="card">
  <header className="rlc-page-hero rlc-page-hero--split"><div><div className="rlc-page-hero__eyebrow">Kalkulation · Einkauf & Vergabe</div><h1>Preisspiegel</h1><p>{[project?.code,project?.name].filter(Boolean).join(" · ") || "Projekt auswählen"} · Lieferanten- und Nachunternehmerangebote vergleichen</p></div><div className="rlc-page-hero__actions"><button className="rlc-page-hero__button" disabled={busy || !projectId} onClick={()=>{choose();setTab("offers");}}>+ Neues Angebot</button></div></header>
  <div className="rlc-page-toolbar" style={{flexWrap:"wrap"}}><button className={"btn"+(tab==="offers"?" btn-primary":"")} onClick={()=>setTab("offers")}>Angebote</button><button className={"btn"+(tab==="compare"?" btn-primary":"")} onClick={()=>setTab("compare")}>Vergleich</button><Link className="btn" to="/buro/dokumente">Projektakte</Link><button className="btn" disabled={busy} onClick={()=>{if(dirty&&!window.confirm("Ungespeicherte Änderungen verwerfen?"))return;setDirty(false);setSelectedId("");setEditingRevision(undefined);setForm(empty());setComparison(null);void load();}}>Aktualisieren</button></div>
  {error && <div className="card" role="alert">{error}</div>}{message && <div className="card" role="status">{message}</div>}
  {!projectId?<div className="rlc-page-empty">Bitte zuerst ein Projekt auswählen.</div>:tab==="offers"?
  <div className="rlc-page-workspace" style={{gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,340px),1fr))",alignItems:"start"}}>
   <section className="rlc-page-list"><div className="rlc-page-list-head">{bids.length} Angebote</div><div className="rlc-page-list-scroll">{bids.map(b=><button className={"rlc-page-document"+(b.id===selectedId?" is-active":"")} type="button" key={b.id} disabled={busy} onClick={()=>choose(b)}><strong>{b.supplier}</strong><div>{b.title}</div><div className="rlc-page-document-meta">{b.packageKey} · {b.kind} · {b.status}</div><div>{money(b.total)} {b.awardedAt?"· Ausgewählt":""}</div></button>)}{!bids.length&&<div className="rlc-page-empty">Noch keine Angebote vorhanden.</div>}</div></section>
   <section className="rlc-page-detail"><div className="rlc-page-detail-head"><h2>{selected?"Angebot bearbeiten":"Neues Angebot"}</h2></div><form onSubmit={save} style={{padding:18,display:"grid",gap:14}}>
    <fieldset disabled={busy || !!locked} style={{border:0,padding:0,display:"grid",gap:12}}>
     <label>Anbieter<input style={{width:"100%"}} required maxLength={250} value={form.supplier} onChange={e=>field("supplier",e.target.value)}/></label>
     <label>Angebot / Bezeichnung<input style={{width:"100%"}} required maxLength={250} value={form.title} onChange={e=>field("title",e.target.value)}/></label>
     <label>Vergabepaket<input style={{width:"100%"}} required maxLength={100} value={form.packageKey} onChange={e=>field("packageKey",e.target.value)}/></label>
     <label>Art <select value={form.kind} onChange={e=>field("kind",e.target.value)}><option value="LV">Leistungsverzeichnis</option><option value="MAT">Material</option></select></label>
     <label>Nachlass % <input required inputMode="decimal" value={form.discountPercent} onChange={e=>field("discountPercent",e.target.value)}/></label>
     <label>Dokument <select value={form.documentId} onChange={e=>field("documentId",e.target.value)}><option value="">Kein Dokument</option>{documents.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
     <label>CSV / XLSX importieren <input type="file" accept=".csv,.xlsx" onChange={e=>{void importFile(e.target.files?.[0]);e.target.value="";}}/></label>
     <div className="muted">Spalten: Position, Kurztext, Einheit, Menge, EP. Beträge netto in EUR.</div>
     <div style={{overflowX:"auto",maxHeight:500}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["Position","Kurztext","Einheit","Menge","EP EUR",""].map((x,i)=><th key={i} style={{textAlign:"left",padding:6}}>{x}</th>)}</tr></thead><tbody>{form.positions.map((r,i)=><tr key={i}>{(["position","title","unit","quantity","unitPrice"] as const).map(k=><td key={k} style={{padding:4}}><input required={k!=="title"} style={{width:k==="title"?220:100}} aria-label={k+" "+(i+1)} value={r[k]} onChange={e=>cell(i,k,e.target.value)}/></td>)}<td><button className="btn" type="button" disabled={form.positions.length===1} onClick={()=>field("positions",form.positions.filter((_,n)=>n!==i))}>Entfernen</button></td></tr>)}</tbody></table></div>
     <button className="btn" type="button" disabled={form.positions.length>=5000} onClick={()=>field("positions",[...form.positions,{position:"",title:"",unit:"",quantity:"",unitPrice:""}])}>+ Position</button>
     <label>Bemerkung<textarea rows={3} style={{width:"100%"}} value={form.notes} onChange={e=>field("notes",e.target.value)}/></label>
    </fieldset>
    <label>Status <select disabled={busy || !selected || !!selected.awardedAt || selected.status==="Archiviert"} value={form.status} onChange={e=>field("status",e.target.value)}>{(selected?.status==="Eingereicht"?["Eingereicht","Archiviert"]:["Entwurf","Eingereicht","Archiviert"]).map(s=><option key={s}>{s}</option>)}</select></label>
    {locked&&<div className="muted">Eingereichte Angebote sind gegen Preisänderungen gesperrt. Korrekturen als neues Angebot erfassen.</div>}
    <button className="btn btn-primary" disabled={busy || selected?.status==="Archiviert" || !!selected?.awardedAt || (!!selected&&!dirty)} type="submit">{busy?"Wird gespeichert …":"Speichern"}</button>
   </form></section>
  </div>:
  <section className="rlc-page-detail" style={{padding:18}}>
   <div className="rlc-page-toolbar"><label>Vergleichsbasis <select disabled={busy} value={baselineId} onChange={e=>{setBaselineId(e.target.value);setComparison(null);}}><option value="">Angebot auswählen</option>{bids.filter(b=>b.status!=="Archiviert").map(b=><option key={b.id} value={b.id}>{b.packageKey} · {b.supplier} · {b.title}</option>)}</select></label><button className="btn btn-primary" disabled={busy || !baselineId} onClick={()=>void compare()}>Vergleichen</button><button className="btn" disabled={busy||!comparison} onClick={exportComparison}>CSV exportieren</button><button className="btn" disabled={busy||dirty||!comparison?.snapshot?.fingerprint} onClick={()=>void exportPdf()}>PDF herunterladen</button></div>
   <p className="muted">Vergleich auf Basis derselben Positionen, Einheiten und Bezugsmengen. Abweichende Mengen und Texte werden gekennzeichnet. Unvollständige Angebote werden nicht gerankt.</p>
   {dirty&&<p className="muted">Ungespeicherte Änderungen zuerst speichern; PDF verwendet ausschließlich gespeicherte Angebote.</p>}
   {comparison?.snapshot&&<p className="muted">PDF im Querformat: bis zu 500 Positionen und 20 Angebote, vier Anbieter pro Gruppe. EP und GP vor Nachlass, Gesamtsummen nach Nachlass; alle Beträge netto in EUR.</p>}
   {comparison&&<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th>Position</th><th>Kurztext</th><th>Menge / Einheit</th>{comparison.offers.map((b:any)=><th key={b.id}>{b.supplier}<div>{b.status}</div><div>{b.discountPercent} % Nachlass</div></th>)}</tr></thead><tbody>{comparison.positions.map((r:Line,i:number)=><tr key={r.position}><td style={{padding:8}}>{r.position}</td><td>{r.title}</td><td>{r.quantity} {r.unit}</td>{comparison.offers.map((b:any)=><td key={b.id} style={{padding:8}}>{b.cells[i]?.comparable?<>{money(b.cells[i].unitPrice)}<div className="muted">GP {money(b.cells[i].amount)} {b.cells[i].quantityDiff?"· Menge abweichend":""} {b.cells[i].textDiff?"· Text abweichend":""}</div></>:b.cells[i]?.reason}</td>)}</tr>)}</tbody><tfoot><tr><th colSpan={3}>Vergleichssumme netto</th>{comparison.offers.map((b:any)=><td key={b.id}><strong>{b.comparable?money(b.normalizedTotal):"Nicht vergleichbar"}</strong>{b.issues.map((s:string)=><div className="muted" key={s}>{s}</div>)}<div>Eigene Angebotsmenge: {money(b.offeredTotal)}</div>{b.status==="Eingereicht"&&b.comparable&&<button className="btn" disabled={busy} onClick={()=>void award(b.id,!!b.awardedAt)}>{b.awardedAt?"Auswahl aufheben":"Angebot auswählen"}</button>}</td>)}</tr></tfoot></table></div>}
  </section>}
 </div>;
}
