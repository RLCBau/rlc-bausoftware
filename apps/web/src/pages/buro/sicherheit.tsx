import React from "react";
import { SafetyDB } from "./store.sicherheit";
import { SafetyRecord, SafetyAttachment } from "./types";

const inp:React.CSSProperties={border:"1px solid var(--line)",borderRadius:6,padding:"6px 8px",fontSize:13};
const th:React.CSSProperties={textAlign:"left",padding:"8px 10px",borderBottom:"1px solid var(--line)",fontSize:13,whiteSpace:"nowrap"};
const td:React.CSSProperties={padding:"6px 10px",borderBottom:"1px solid var(--line)",fontSize:13,verticalAlign:"middle"};
const lbl:React.CSSProperties={fontSize:12,opacity:.8};

export default function Sicherheit(){
  const [all,setAll]=React.useState<SafetyRecord[]>(SafetyDB.list());
  const [sel,setSel]=React.useState<SafetyRecord|null>(all[0]??null);
  const [q,setQ]=React.useState("");
  const refresh=()=>setAll(SafetyDB.list());

  const filtered=()=>all.filter(r=>{
    const s=(r.title+" "+(r.person??"")+" "+(r.project??"")).toLowerCase();
    return !q || s.includes(q.toLowerCase());
  });

  const add=()=>{const n=SafetyDB.create();refresh();setSel(n);};
  const del=()=>{if(!sel)return;if(!confirm("Unterweisung löschen?"))return;SafetyDB.remove(sel.id);refresh();setSel(SafetyDB.list()[0]??null);};

  const up=(p:Partial<SafetyRecord>)=>{
    if(!sel)return;
    const next={...sel,...p,updatedAt:Date.now()};
    setSel(next);
    SafetyDB.upsert(next);
    setAll(SafetyDB.list());
  };

  const onDrop=async (ev:React.DragEvent)=>{
    ev.preventDefault();
    if(!sel)return;
    const f=ev.dataTransfer.files?.[0];
    if(!f)return;
    await SafetyDB.attach(sel.id,f);
    refresh();
  };

  const open=(a:SafetyAttachment)=>{ const w=window.open(a.dataURL,"_blank"); if(!w) alert("Popup blockiert."); };

  const exportCSV=()=>download("text/csv;charset=utf-8","sicherheit.csv",SafetyDB.exportCSV(filtered()));

  return (
    <div style={{display:"grid",gridTemplateRows:"auto 1fr",gap:10,padding:10}}>
      {/* Toolbar */}
      <div className="card" style={{padding:"8px 10px",display:"flex",gap:8,alignItems:"center"}}>
        <button className="btn" onClick={add}>+ Unterweisung</button>
        <button className="btn" onClick={del} disabled={!sel}>Löschen</button>
        <div style={{flex:1}}/>
        <input placeholder="Suche Titel / Person / Projekt…" value={q} onChange={e=>setQ(e.target.value)} style={{...inp,width:260}}/>
        <button className="btn" onClick={exportCSV}>Export CSV</button>
      </div>

      {/* Tabelle + Editor */}
      <div style={{display:"grid",gridTemplateColumns:"minmax(520px,48vw) 1fr",gap:10,minHeight:"60vh"}}>
        {/* LISTA */}
        <div className="card" style={{padding:0,overflow:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>
              <th style={th}>Titel</th>
              <th style={th}>Person</th>
              <th style={th}>Projekt</th>
              <th style={th}>Datum</th>
              <th style={th}>Nächste Unterweisung</th>
            </tr></thead>
            <tbody>
              {filtered().map(r=>{
                const warn = daysLeft(r.nextDate)<=30;
                return (
                  <tr key={r.id} onClick={()=>setSel(r)} style={{cursor:"pointer",background:sel?.id===r.id?"#f1f5ff":undefined}}>
                    <td style={td}><b>{r.title}</b></td>
                    <td style={td}>{r.person||"—"}</td>
                    <td style={td}>{r.project||"—"}</td>
                    <td style={td}>{r.date?fmt(r.date):"—"}</td>
                    <td style={{...td,color:warn?"#c03":undefined}}>{r.nextDate?fmt(r.nextDate):"—"}</td>
                  </tr>
                );
              })}
              {filtered().length===0 && <tr><td style={{...td,opacity:.6}} colSpan={5}>Keine Unterweisungen.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* EDITOR */}
        <div className="card" onDragOver={e=>e.preventDefault()} onDrop={onDrop} style={{padding:12}}>
          {!sel?<div style={{opacity:.7}}>Links Unterweisung wählen oder neu anlegen.</div>:(
            <div style={{display:"grid",gridTemplateColumns:"130px 1fr 130px 1fr",gap:10}}>
              <label style={lbl}>Titel</label>
              <input style={inp} value={sel.title} onChange={e=>up({title:e.target.value})}/>
              <label style={lbl}>Projekt</label>
              <input style={inp} value={sel.project??""} onChange={e=>up({project:e.target.value})}/>
              <label style={lbl}>Person</label>
              <input style={inp} value={sel.person??""} onChange={e=>up({person:e.target.value})}/>
              <label style={lbl}>Datum</label>
              <input type="date" style={inp} value={toDateInput(sel.date)} onChange={e=>up({date:new Date(e.target.value).toISOString()})}/>
              <label style={lbl}>Nächste Unterweisung</label>
              <input type="date" style={inp} value={toDateInput(sel.nextDate)} onChange={e=>up({nextDate:new Date(e.target.value).toISOString()})}/>
              <label style={lbl}>Bemerkung</label>
              <textarea style={{...inp,minHeight:80,resize:"vertical",gridColumn:"1 / -1"}} value={sel.notes??""} onChange={e=>up({notes:e.target.value})}/>
              <label style={{...lbl,gridColumn:"1 / -1"}}>Dokumente / Fotos (Drag&Drop)</label>
              <div style={{gridColumn:"1 / -1",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:8}}>
                {(sel.attachments||[]).map(a=>(
                  <div key={a.id} style={{border:"1px solid var(--line)",borderRadius:6,overflow:"hidden",background:"#fff"}}>
                    <div style={{padding:"6px 8px",fontSize:12,display:"flex",gap:8,alignItems:"center"}}>
                      <b style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</b>
                      <div style={{flex:1}}/><button className="btn" onClick={()=>open(a)}>Öffnen</button>
                    </div>
                    {((a.mime||"").startsWith("image/")) && <img src={a.dataURL} alt={a.name} style={{width:"100%",height:"auto"}}/>}
                  </div>
                ))}
                {(sel.attachments||[]).length===0 && <div style={{opacity:.6}}>Keine Anhänge.</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function fmt(iso?:string){ return iso?new Date(iso).toLocaleDateString():"—"; }
function daysLeft(iso?:string){ if(!iso)return Infinity; return Math.ceil((new Date(iso).getTime()-Date.now())/86400000); }
function toDateInput(iso?:string){ if(!iso)return""; const d=new Date(iso); const p=(n:number)=>n.toString().padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
function download(type:string,name:string,data:string){ const b=new Blob([data],{type}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
