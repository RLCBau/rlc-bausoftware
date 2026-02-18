import React from "react";
import { MachinesDB } from "./store.machines";
import { Machine, MaintRecord, MachAttachment } from "./types";

const th:React.CSSProperties={textAlign:"left",padding:"8px 10px",borderBottom:"1px solid var(--line)",fontSize:13,whiteSpace:"nowrap"};
const td:React.CSSProperties={padding:"6px 10px",borderBottom:"1px solid var(--line)",fontSize:13,verticalAlign:"middle"};
const inp:React.CSSProperties={border:"1px solid var(--line)",borderRadius:6,padding:"6px 8px",fontSize:13};
const lbl:React.CSSProperties={fontSize:12,opacity:.8};

export default function Maschinenverwaltung(){
  const [all,setAll]=React.useState<Machine[]>(MachinesDB.list());
  const [sel,setSel]=React.useState<Machine|null>(all[0]??null);
  const [q,setQ]=React.useState(""); const [proj,setProj]=React.useState(""); const [onlyDue,setOnlyDue]=React.useState(false);
  const refresh=()=>setAll(MachinesDB.list());

  const filtered=()=>all.filter(m=>{
    const s=(m.name+" "+(m.type??"")+" "+(m.serial??"")+" "+(m.projectId??"")).toLowerCase();
    const okQ=!q||s.includes(q.toLowerCase());
    const okP=!proj||(m.projectId??"")===proj;
    const due = isDue(m);
    const okD=!onlyDue || due;
    return okQ&&okP&&okD;
  });
  const projects=Array.from(new Set(all.map(m=>m.projectId).filter(Boolean))) as string[];

  const add=()=>{const m=MachinesDB.create(); refresh(); setSel(m);};
  const del=()=>{if(!sel)return; if(!confirm("Maschine löschen?"))return; MachinesDB.remove(sel.id); refresh(); setSel(MachinesDB.list()[0]??null);};

  // ✅ FIX scrittura
  const up=(p:Partial<Machine>)=>{
    if(!sel)return;
    const next={...sel,...p,updatedAt:Date.now()};
    setSel(next);
    MachinesDB.upsert(next);
    setAll(MachinesDB.list());
  };

  const addMaint=()=>{ if(!sel) return; const r:MaintRecord={id:crypto.randomUUID(),date:new Date().toISOString(),hours:sel.hours||0,notes:""}; up({maintenance:[r,...(sel.maintenance||[])]}); };
  const delMaint=(id:string)=>{ if(!sel) return; up({maintenance:(sel.maintenance||[]).filter(x=>x.id!==id)}); };

  const onDrop=async (ev:React.DragEvent)=>{ ev.preventDefault(); if(!sel) return; const f=ev.dataTransfer.files?.[0]; if(!f) return; await MachinesDB.attach(sel.id,f); refresh(); };
  const open=(a:MachAttachment)=>{ const w=window.open(a.dataURL,"_blank"); if(!w) alert("Popup blockiert."); };

  const importCSV=()=>pickFile(async f=>{ const n=MachinesDB.importCSV(await f.text()); alert(`Import: ${n} Maschinen.`); refresh(); });
  const exportCSV=()=>download("text/csv;charset=utf-8","maschinen.csv",MachinesDB.exportCSV(filtered()));
  const exportJSON=()=>download("application/json","maschinen_backup.json",MachinesDB.exportJSON());
  const importJSON=()=>pickFile(async f=>{ const n=MachinesDB.importJSON(await f.text()); alert(`Backup importiert: ${n}.`); refresh(); });

  const recalcNext=()=>{ if(!sel) return;
    const last = sel.lastService ?? new Date().toISOString();
    const days = sel.serviceIntervalDays ?? 180;
    const next = new Date(new Date(last).getTime() + days*86400000).toISOString();
    up({ nextService: next });
  };

  return (
    <div style={{display:"grid",gridTemplateRows:"auto 1fr",gap:10,padding:10}}>
      <div className="card" style={{padding:"8px 10px",display:"flex",gap:8,alignItems:"center"}}>
        <button className="btn" onClick={add}>+ Maschine</button>
        <button className="btn" onClick={del} disabled={!sel}>Löschen</button>
        <div style={{flex:1}}/>
        <input placeholder="Suche Name / Typ / Seriennr. / Projekt…" value={q} onChange={e=>setQ(e.target.value)} style={{...inp,width:300}}/>
        <select value={proj} onChange={e=>setProj(e.target.value)} style={{...inp,width:160}}>
          <option value="">Alle Projekte</option>{projects.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        <label style={{display:"flex",alignItems:"center",gap:6}}>
          <input type="checkbox" checked={onlyDue} onChange={e=>setOnlyDue(e.target.checked)}/> <span style={{fontSize:13}}>nur fällige</span>
        </label>
        <button className="btn" onClick={importCSV}>Import CSV</button>
        <button className="btn" onClick={exportCSV}>Export CSV</button>
        <button className="btn" onClick={importJSON}>Import JSON</button>
        <button className="btn" onClick={exportJSON}>Export JSON</button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"minmax(520px,48vw) 1fr",gap:10,minHeight:"60vh"}}>
        {/* LISTA */}
        <div className="card" style={{padding:0,overflow:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>
              <th style={th}>Name</th><th style={th}>Typ</th><th style={th}>Seriennr.</th>
              <th style={th}>Projekt</th><th style={th}>Stunden</th><th style={th}>nächster Service</th><th style={th}>Status</th>
            </tr></thead>
            <tbody>
              {filtered().map(m=>{
                const due=isDue(m); const days=daysLeft(m.nextService);
                return (
                  <tr key={m.id} onClick={()=>setSel(m)} style={{cursor:"pointer",background:sel?.id===m.id?"#f1f5ff":undefined}}>
                    <td style={td}><b>{m.name}</b></td>
                    <td style={td}>{m.type||"—"}</td>
                    <td style={td}>{m.serial||"—"}</td>
                    <td style={td}>{m.projectId||"—"}</td>
                    <td style={td}>{m.hours??0}</td>
                    <td style={td}>{m.nextService?fmt(m.nextService):"—"} {m.nextService && <span style={{marginLeft:6,opacity:.7}}>({days} Tg)</span>}</td>
                    <td style={td}>{due?"⚠️ fällig":(m.status||"Betrieb")}</td>
                  </tr>
                );
              })}
              {filtered().length===0 && <tr><td style={{...td,opacity:.6}} colSpan={7}>Keine Maschinen.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* EDITOR */}
        <div className="card" onDragOver={e=>e.preventDefault()} onDrop={onDrop} style={{padding:12}}>
          {!sel? <div style={{opacity:.7}}>Links Maschine wählen oder neu anlegen.</div> : (
            <div style={{display:"grid",gridTemplateColumns:"130px 1fr 130px 1fr",gap:10}}>
              <label style={lbl}>Name</label>
              <input style={inp} value={sel.name} onChange={e=>up({name:e.target.value})}/>
              <label style={lbl}>Typ</label>
              <input style={inp} value={sel.type??""} onChange={e=>up({type:e.target.value})}/>
              <label style={lbl}>Seriennr.</label>
              <input style={inp} value={sel.serial??""} onChange={e=>up({serial:e.target.value})}/>
              <label style={lbl}>Projekt-ID</label>
              <input style={inp} value={sel.projectId??""} onChange={e=>up({projectId:e.target.value})}/>
              <label style={lbl}>Standort</label>
              <input style={inp} value={sel.location??""} onChange={e=>up({location:e.target.value})}/>
              <label style={lbl}>Status</label>
              <select style={inp} value={sel.status??"Betrieb"} onChange={e=>up({status:e.target.value as any})}>
                <option>Betrieb</option><option>Wartung</option><option>Außer Betrieb</option>
              </select>
              <label style={lbl}>Betriebsstunden</label>
              <input type="number" style={inp} value={sel.hours??0} onChange={e=>up({hours:+e.target.value})}/>
              <label style={lbl}>Letzter Service</label>
              <input type="date" style={inp} value={toDateInput(sel.lastService)} onChange={e=>up({lastService:new Date(e.target.value).toISOString()})}/>
              <label style={lbl}>Intervall (Tage)</label>
              <input type="number" style={inp} value={sel.serviceIntervalDays??180} onChange={e=>up({serviceIntervalDays:+e.target.value})}/>
              <label style={lbl}>Nächster Service</label>
              <div style={{display:"flex",gap:8}}>
                <input type="date" style={{...inp,flex:1}} value={toDateInput(sel.nextService)} onChange={e=>up({nextService:new Date(e.target.value).toISOString()})}/>
                <button className="btn" onClick={recalcNext}>Berechnen</button>
              </div>

              <label style={{...lbl,gridColumn:"1 / -1"}}>Wartungsprotokolle</label>
              <div style={{gridColumn:"1 / -1",display:"grid",gap:6}}>
                <div style={{display:"flex",gap:8,alignItems:"center"}}><button className="btn" onClick={addMaint}>+ Eintrag</button></div>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr><th style={th}>Datum</th><th style={th}>Std.</th><th style={th}>Notizen</th><th style={th}></th></tr></thead>
                  <tbody>
                    {(sel.maintenance||[]).map(r=>(
                      <tr key={r.id}>
                        <td style={td}><input type="date" style={inp} value={toDateInput(r.date)} onChange={e=>up({maintenance:(sel.maintenance||[]).map(x=>x.id===r.id?{...r,date:new Date(e.target.value).toISOString()}:x)})}/></td>
                        <td style={td}><input type="number" style={inp} value={r.hours??0} onChange={e=>up({maintenance:(sel.maintenance||[]).map(x=>x.id===r.id?{...r,hours:+e.target.value}:x)})}/></td>
                        <td style={td}><input style={{...inp,width:"100%"}} value={r.notes??""} onChange={e=>up({maintenance:(sel.maintenance||[]).map(x=>x.id===r.id?{...r,notes:e.target.value}:x)})}/></td>
                        <td style={{...td,whiteSpace:"nowrap"}}><button className="btn" onClick={()=>delMaint(r.id)}>Entfernen</button></td>
                      </tr>
                    ))}
                    {(sel.maintenance||[]).length===0 && <tr><td style={{...td,opacity:.6}} colSpan={4}>Keine Einträge.</td></tr>}
                  </tbody>
                </table>
              </div>

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

function toDateInput(iso?:string){ if(!iso) return ""; const d=new Date(iso); const p=(n:number)=>n.toString().padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
function fmt(iso?:string){ return iso?new Date(iso).toLocaleDateString():"—"; }
function daysLeft(iso?:string){ if(!iso) return NaN; return Math.ceil((new Date(iso).getTime()-Date.now())/86400000); }
function isDue(m:Machine){ const d=daysLeft(m.nextService); return (!isNaN(d) && d<=14) || (m.status==="Wartung"); }
function pickFile(onPick:(f:File)=>void){ const i=document.createElement("input"); i.type="file"; i.onchange=()=>{const f=i.files?.[0]; if(f) onPick(f);}; i.click(); }
function download(type:string,name:string,data:string){ const b=new Blob([data],{type}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
