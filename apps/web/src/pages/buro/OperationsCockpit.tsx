import React from "react";
import {Link} from "react-router-dom";
import {useProject} from "../../store/useProject";
import {officeAddonRequest as request} from "./OfficeAddons";
const modules:Record<string,{title:string;to:string}>={
 guarantees:{title:"Bürgschaften",to:"/buro/buergschaften"},certificates:{title:"NU-Nachweise",to:"/buro/nachunternehmer"},bids:{title:"Angebotsvergleich",to:"/kalkulation/preisspiegel"},releases:{title:"Freimeldungen",to:"/buro/freimeldungen"},usage:{title:"Geräteeinsätze im Entwurf",to:"/buro/geraeteverrechnung"},shipments:{title:"Offene Sendungen",to:"/buro/versanderfassung"},planning:{title:"Einsatzplanung",to:"/buro/ressourcenplanung"},recurring:{title:"Dauerbuchungen",to:"/buchhaltung/dauerbuchungen"}
};
export default function OperationsCockpit(){
 const {getSelectedProject}=useProject();const project=getSelectedProject(),projectId=String(project?.id||project?.code||"");
 const [data,setData]=React.useState<any>(),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(""),[onlyAttention,setOnlyAttention]=React.useState(false);
 const generation=React.useRef(0);
 const load=React.useCallback(async()=>{
  const n=++generation.current;if(!projectId){setData(undefined);return;}setBusy(true);setError("");
  try{const result=await request("/api/office-addons/cockpit?projectId="+encodeURIComponent(projectId));if(n===generation.current)setData(result);}
  catch(e:any){if(n===generation.current){setData(undefined);setError(e.message);}}finally{if(n===generation.current)setBusy(false);}
 },[projectId]);
 React.useEffect(()=>{setData(undefined);void load();return()=>{generation.current++;};},[load]);
 const currentData=data&&[data.project?.id,data.project?.code].includes(projectId)?data:undefined;
 const visible=(currentData?.cards||[]).filter((c:any)=>!onlyAttention||!c.available||c.open>0);
 function csv(){if(!currentData)return;const cell=(v:any)=>{const s=String(v??"");return '"'+(/^\s*[=+\-@]|^[\t\r\n]/.test(s)?"'":"")+s.replace(/"/g,'""')+'"';};const rows=[["Projekt","Bereich","Verfügbarkeit","Zähler","Hinweis","Datum","Schwere"],...visible.flatMap((c:any)=>c.items?.length?[...c.items.map((x:any)=>[currentData.project.code,modules[c.key]?.title,"Verfügbar",c.total,x.title+" · "+x.reason,x.date,x.severity]),...(c.truncated?[[currentData.project.code,modules[c.key]?.title,"Auszug",c.total,"Erste 20 Hinweise; vollständige Liste im Bereich öffnen","",""]]:[])]:[[currentData.project.code,modules[c.key]?.title,c.available?"Verfügbar":"Nicht verfügbar",c.available?c.total:"",c.available?"Keine Hinweise":c.error,"",""]])];
  const url=URL.createObjectURL(new Blob(["\uFEFF"+rows.map((r:any)=>r.map(cell).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="Projekt-Cockpit.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <div className="card"><header className="rlc-page-hero rlc-page-hero--split"><div><div className="rlc-page-hero__eyebrow">Büro & Verwaltung · Projektsteuerung</div><h1>Projekt-Cockpit</h1><p>{[project?.code,project?.name].filter(Boolean).join(" · ")||"Projekt auswählen"}</p></div><button className="rlc-page-hero__button" disabled={busy||!projectId} onClick={()=>void load()}>{busy?"Wird geladen …":"Aktualisieren"}</button></header>
 <div className="rlc-page-toolbar" style={{flexWrap:"wrap"}}><Link className="btn" to="/buro">Büroübersicht</Link><label><input type="checkbox" checked={onlyAttention} onChange={e=>setOnlyAttention(e.target.checked)}/> Nur Bereiche mit Hinweisen</label><button className="btn" disabled={!currentData} onClick={csv}>CSV exportieren</button>{currentData&&<span className="muted">Stand: {new Date(currentData.asOf).toLocaleString("de-DE",{timeZone:"Europe/Berlin"})}</span>}</div>
 {error&&<div className="card" role="alert">{error}</div>}
 {!projectId?<div className="rlc-page-empty">Bitte zuerst ein Projekt auswählen.</div>:<><p className="muted">Vorhandene Vorgänge im ausgewählten Projekt. Fristen nach deutschem Kalendertag. Die Zähler beziehen sich jeweils auf den angezeigten Bereich. Diese Ansicht erzeugt keine Buchungen und keine Nachrichten.</p>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,340px),1fr))",gap:14}}>
 {visible.map((c:any)=><section className="card" key={c.key}><div style={{display:"flex",gap:12,justifyContent:"space-between",alignItems:"center"}}><h2 style={{fontSize:18}}>{modules[c.key]?.title}</h2><strong style={{fontSize:28}}>{c.available?c.total:"–"}</strong></div>
 {!c.available?<p role="alert">{c.error} Bitte erneut laden oder den Bereich öffnen.</p>:<><p className="muted">{c.label}{c.period?" · "+c.period.from+" bis "+c.period.to:""} · {c.open} Hinweise{c.attention?" · "+c.attention+" Fristen / Probleme":""}</p>
 {c.items.map((x:any)=><div key={x.id} style={{padding:"10px 0",borderTop:"1px solid var(--border,#e2e8f0)"}}><strong>{x.title}</strong><div style={{color:x.severity==="danger"?"#b42318":x.severity==="warning"?"#b54708":undefined}}>{x.reason}{x.date?" · "+x.date:""}</div></div>)}
 {!c.open&&<p className="muted">Keine Hinweise in diesem Bereich.</p>}{c.truncated&&<p className="muted">Erste 20 Hinweise; alle Vorgänge im Bereich öffnen.</p>}</>}
 <Link className="btn" to={modules[c.key]?.to||"/buro"}>Bereich öffnen</Link></section>)}
 </div>{currentData&&!visible.length&&<div className="rlc-page-empty">Keine Bereiche für diesen Filter.</div>}</>}
 </div>;
}
