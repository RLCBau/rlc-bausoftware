import React from 'react';
import {apiUrl} from '../../lib/apiBase';
async function request(path:string,body:any){let token='';try{token=localStorage.getItem('rlc_token')||JSON.parse(localStorage.getItem('rlc_auth')||'{}').token||'';}catch{}const res=await fetch(apiUrl('/api/buero/bauzeitenplan/'+path),{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});const d=await res.json();if(!res.ok||d.ok===false)throw new Error(d.error||'Terminierung nicht verfügbar.');return d;}
type Props={projectId:string;version:string;start:string;disabled:boolean;onBusy:(v:boolean)=>void;onApplied:(v:any)=>void};
export default function PlanSchedule({projectId,version,start,disabled,onBusy,onApplied}:Props){
 const [from,setFrom]=React.useState(start),[weekdays,setWeekdays]=React.useState([1,2,3,4,5]),[exclude,setExclude]=React.useState(true),[preview,setPreview]=React.useState<any>(),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
 const body={projectId,expectedVersion:version,start:from,weekdays,excludeNonWorking:exclude},signature=JSON.stringify(body),current=React.useRef(signature),guard=React.useRef(false);current.current=signature;
 React.useEffect(()=>{setPreview(undefined);},[signature]);
 React.useEffect(()=>()=>{current.current='';},[]);
 async function run(apply:boolean){if(disabled||guard.current)return;guard.current=true;setBusy(true);onBusy(true);setError('');const captured=signature;
 try{const result=await request(apply?'schedule-apply':'schedule-preview',{...body,...(apply?{fingerprint:preview?.fingerprint}:{})});if(current.current!==captured)return;if(apply){setPreview(undefined);onApplied(result);}else setPreview(result);}catch(e:any){if(current.current===captured){setError(e.message);if(apply)setPreview(undefined);}}finally{guard.current=false;setBusy(false);onBusy(false);}}
 return <section className="card" style={{marginBottom:12}}><h2>Terminvorschlag prüfen</h2><p className="muted">Gespeicherten Plan vorwärts terminieren: Vorgänge werden frühestens ab ihrem bisherigen Beginn angesetzt. Begonnene und abgeschlossene Vorgänge (Fortschritt &gt; 0) bleiben fixiert. Abhängigkeiten: Nachfolger beginnt frühestens am Tag nach Vorgängerende.</p>
 <p className="muted">Dauern bleiben durchgehende Kalendertage. Wochentage und Firmenruhetage begrenzen nur den Beginn; Ressourcenbedarf belegt den gesamten Zeitraum einschließlich Wochenenden. Kapazitäten gelten für benannte Planressourcen innerhalb dieses Projekts. Personen- und Maschineneinsätze werden separat übernommen. Vorschau: maximal 500 Vorgänge und 366 Tage, deterministischer Vorschlag ohne Garantie der kürzesten Gesamtdauer.</p>
 {error&&<p role="alert">{error}</p>}
 <fieldset disabled={disabled||busy} style={{border:0,padding:0,margin:0}}><div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
 <label>Planstart <input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
 <div>{['So','Mo','Di','Mi','Do','Fr','Sa'].map((label,n)=><label key={n} style={{marginRight:8}}><input type="checkbox" checked={weekdays.includes(n)} onChange={e=>setWeekdays(v=>e.target.checked?[...v,n]:v.filter(x=>x!==n))}/>{label}</label>)}</div>
 <label><input type="checkbox" checked={exclude} onChange={e=>setExclude(e.target.checked)}/> Firmenruhetage als Beginn ausschließen</label>
 <button className="btn" disabled={!from||!weekdays.length} onClick={()=>void run(false)}>Terminvorschau berechnen</button></div></fieldset>
 {preview&&<><p>{preview.changedCount} Vorgänge mit geänderten Terminen · Fenster bis {preview.windowEnd}</p>
 {preview.blocked.length>0&&<div role="alert"><strong>Konflikte – Übernahme gesperrt</strong><ul>{preview.blocked.map((s:string)=><li key={s}>{s}</li>)}</ul></div>}
 <div style={{overflow:'auto',maxHeight:320}}><table style={{width:'100%'}}><thead><tr><th>Vorgang</th><th>Bisher</th><th>Vorschlag</th><th>Status</th></tr></thead><tbody>{preview.changes.map((r:any)=><tr key={r.id}><td>{r.name}</td><td>{r.beforeStart?.slice(0,10)||'–'} → {r.beforeEnd?.slice(0,10)||'–'}</td><td>{r.start?.slice(0,10)||'–'} → {r.end?.slice(0,10)||'–'}</td><td>{r.pinned?'Fixiert':r.changed?'Änderung':'Unverändert'}</td></tr>)}</tbody></table></div>
 {preview.holidays.length>0&&<details><summary>Firmenruhetage und Geltungsbereiche prüfen ({preview.holidays.length})</summary>{preview.holidays.map((h:any,n:number)=><p key={n}>{h.date} · {h.title} · {h.location||'Ohne Ortsangabe'}</p>)}</details>}
 <p className="muted">Übernahme speichert die vorgeschlagenen Plantermine mit Änderungsverlauf. Bereits übernommene Aufgaben, Kalendertermine und Einsätze bleiben eigenständig.</p>
 <button className="btn btn-primary" disabled={disabled||busy||preview.blocked.length>0||(!preview.changedCount&&from===start)} onClick={()=>void run(true)}>Vorgeschlagene Termine übernehmen</button></>}
 {busy&&<p role="status">Plan und Kalender werden geprüft…</p>}</section>;
}
