import React from "react";
import { CalendarDB } from "./store.calendar";
import { CalEvent } from "./types";

const th: React.CSSProperties = { textAlign:"left", padding:"8px 10px", borderBottom:"1px solid var(--line)", fontSize:13, whiteSpace:"nowrap" };
const td: React.CSSProperties = { padding:"6px 10px", borderBottom:"1px solid var(--line)", fontSize:13, verticalAlign:"middle" };
const inp: React.CSSProperties = { border:"1px solid var(--line)", borderRadius:6, padding:"6px 8px", fontSize:13 };
const lbl: React.CSSProperties = { fontSize:12, opacity:.8 };

export default function OutlookKalender() {
  const [all, setAll] = React.useState<CalEvent[]>(CalendarDB.list());
  const [q, setQ] = React.useState("");
  const [proj, setProj] = React.useState("");
  const [showForm, setShowForm] = React.useState(false);
  const [draft, setDraft] = React.useState<CalEvent>(CalendarDB.blank());

  const refresh = () => setAll(CalendarDB.list());

  const filtered = () => all.filter(e=>{
    const text = (e.title+" "+(e.projectId??"")+" "+(e.location??"")).toLowerCase();
    const okQ = !q || text.includes(q.toLowerCase());
    const okP = !proj || (e.projectId??"")===proj;
    return okQ && okP;
  });

  const projects = Array.from(new Set(all.map(e=>e.projectId).filter(Boolean))) as string[];

  const openForm = (e?: CalEvent) => { setDraft(e ? {...e} : CalendarDB.blank()); setShowForm(true); };
  const save = () => { CalendarDB.upsert(draft); setShowForm(false); refresh(); };
  const del = (id: string) => { if(!confirm("Termin löschen?")) return; CalendarDB.remove(id); refresh(); };

  const importICS = () => pickFile(async f => { const txt = await f.text(); const n = CalendarDB.importICS(txt); alert(`Import: ${n} Termine.`); refresh(); });
  const exportICS = () => downloadBlob(CalendarDB.exportICS(filtered()), "kalender_export.ics", "text/calendar;charset=utf-8");

  const openOutlookDesktop = () => {
    const ics = CalendarDB.exportICS(filtered());
    const url = URL.createObjectURL(new Blob([ics], {type:"text/calendar"}));
    const a = document.createElement("a"); a.href = url; a.download = "RLC_Kalender.ics"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display:"grid", gridTemplateRows:"auto 1fr", gap:10, padding:10 }}>
      {/* Toolbar */}
      <div className="card" style={{ padding:"8px 10px", display:"flex", gap:8, alignItems:"center" }}>
        <button className="btn" onClick={()=>openForm()}>+ Neuer Termin</button>
        <div style={{ flex:1 }} />
        <input placeholder="Suche Titel / Ort / Projekt…" value={q} onChange={e=>setQ(e.target.value)} style={{ ...inp, width:280 }} />
        <select value={proj} onChange={e=>setProj(e.target.value)} style={{ ...inp, width:160 }}>
          <option value="">Alle Projekte</option>
          {projects.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button className="btn" onClick={importICS}>Import .ics</button>
        <button className="btn" onClick={exportICS}>Export .ics</button>
        <button className="btn" onClick={openOutlookDesktop}>In Outlook/Google öffnen</button>
      </div>

      {/* Tabelle */}
      <div className="card" style={{ padding:0, overflow:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <th style={th}>Beginn</th>
              <th style={th}>Ende</th>
              <th style={th}>Titel</th>
              <th style={th}>Projekt</th>
              <th style={th}>Ort</th>
              <th style={th}>Teilnehmer</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered().map(ev=>(
              <tr key={ev.id}>
                <td style={td}>{fmt(ev.start)}</td>
                <td style={td}>{fmt(ev.end)}</td>
                <td style={td}><b>{ev.title}</b></td>
                <td style={td}>{ev.projectId || "—"}</td>
                <td style={td}>{ev.location || "—"}</td>
                <td style={td}>{(ev.attendees??[]).join(", ")}</td>
                <td style={{...td, whiteSpace:"nowrap"}}>
                  <button className="btn" onClick={()=>openForm(ev)}>Bearbeiten</button>
                  <button className="btn" onClick={()=>del(ev.id)}>Löschen</button>
                </td>
              </tr>
            ))}
            {filtered().length===0 && (
              <tr><td style={{...td, opacity:.6}} colSpan={7}>Keine Termine.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal onClose={()=>setShowForm(false)}>
          <div style={{ display:"grid", gridTemplateColumns:"120px 1fr 120px 1fr", gap:10 }}>
            <label style={lbl}>Titel</label>
            <input style={inp} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} />
            <label style={lbl}>Projekt-ID</label>
            <input style={inp} value={draft.projectId??""} onChange={e=>setDraft({...draft,projectId:e.target.value})} />
            <label style={lbl}>Beginn</label>
            <input style={inp} type="datetime-local" value={toLocalInput(draft.start)} onChange={e=>setDraft({...draft,start:new Date(e.target.value).toISOString()})} />
            <label style={lbl}>Ende</label>
            <input style={inp} type="datetime-local" value={toLocalInput(draft.end)} onChange={e=>setDraft({...draft,end:new Date(e.target.value).toISOString()})} />
            <label style={lbl}>Ort</label>
            <input style={inp} value={draft.location??""} onChange={e=>setDraft({...draft,location:e.target.value})} />
            <label style={lbl}>Teilnehmer</label>
            <input style={inp} placeholder="mail1@..., mail2@..." value={(draft.attendees??[]).join(", ")} onChange={e=>setDraft({...draft,attendees:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})} />
            <label style={lbl}>Beschreibung</label>
            <textarea style={{...inp, gridColumn:"1 / -1", minHeight:100}} value={draft.notes??""} onChange={e=>setDraft({...draft,notes:e.target.value})}/>
            <div style={{ gridColumn:"1 / -1", display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button className="btn" onClick={()=>setShowForm(false)}>Abbrechen</button>
              <button className="btn" onClick={save}>Speichern</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ==== Utils ==== */
function fmt(iso?: string) { return iso ? new Date(iso).toLocaleString() : "—"; }
function toLocalInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n:number)=>n.toString().padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pickFile(onPick:(f:File)=>void) {
  const inp=document.createElement("input"); inp.type="file";
  inp.onchange=()=>{const f=inp.files?.[0]; if(f) onPick(f);};
  inp.click();
}
function downloadBlob(text:string,name:string,type:string){
  const blob=new Blob([text],{type}); const a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href);
}
function Modal({children,onClose}:{children:any;onClose:()=>void}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.35)",display:"grid",placeItems:"center",zIndex:9999}}>
      <div className="card" style={{padding:20,minWidth:480,background:"#fff",borderRadius:8}}>
        {children}
        <div style={{marginTop:10,textAlign:"right"}}>
          <button className="btn" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
}
