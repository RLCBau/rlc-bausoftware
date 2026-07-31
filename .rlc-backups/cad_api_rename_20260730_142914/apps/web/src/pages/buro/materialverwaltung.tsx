import React from "react";
import { MaterialDB } from "./store.material";
import { MaterialItem, MatMove, MatAttachment } from "./types";

const th:React.CSSProperties={textAlign:"left",padding:"8px 10px",borderBottom:"1px solid var(--line)",fontSize:13,whiteSpace:"nowrap"};
const td:React.CSSProperties={padding:"6px 10px",borderBottom:"1px solid var(--line)",fontSize:13,verticalAlign:"middle"};
const inp:React.CSSProperties={border:"1px solid var(--line)",borderRadius:6,padding:"6px 8px",fontSize:13};
const lbl:React.CSSProperties={fontSize:12,opacity:.8};

export default function Materialverwaltung(){
  const [all,setAll]=React.useState<MaterialItem[]>(MaterialDB.list());
  const [sel,setSel]=React.useState<MaterialItem|null>(all[0]??null);
  const [q,setQ]=React.useState(""); const [proj,setProj]=React.useState(""); const [onlyLow,setOnlyLow]=React.useState(false);
  const refresh=()=>setAll(MaterialDB.list());

  const filtered=()=>all.filter(m=>{
    const s=(m.name+" "+(m.code??"")+" "+(m.projectId??"")+" "+(m.location??"")).toLowerCase();
    const okQ=!q||s.includes(q.toLowerCase());
    const okP=!proj||(m.projectId??"")===proj;
    const okL=!onlyLow || ((m.stock??0) <= (m.minStock??0));
    return okQ&&okP&&okL;
  });
  const projects=Array.from(new Set(all.map(m=>m.projectId).filter(Boolean))) as string[];

  const add=()=>{const it=MaterialDB.create(); refresh(); setSel(it);};
  const del=()=>{if(!sel)return; if(!confirm("Artikel löschen?"))return; MaterialDB.remove(sel.id); refresh(); setSel(MaterialDB.list()[0]??null);};

  // ✅ FIX scrittura
  const up=(p:Partial<MaterialItem>)=>{
    if(!sel)return;
    const next={...sel,...p,updatedAt:Date.now()};
    setSel(next);
    MaterialDB.upsert(next);
    setAll(MaterialDB.list());
  };

  const move=(dir:"IN"|"OUT")=>{
    if(!sel) return;
    const qty = Number(prompt(dir==="IN"?"Eingang Menge:":"Ausgang Menge:","1")); if(!qty||qty<=0) return;
    const m:MatMove={ id:crypto.randomUUID(), when:new Date().toISOString(), dir, qty, projectId: sel.projectId||"", note:"" };
    MaterialDB.addMove(sel.id,m); refresh();
  };

  const onDrop=async (ev:React.DragEvent)=>{ ev.preventDefault(); if(!sel) return; const f=ev.dataTransfer.files?.[0]; if(!f) return; await MaterialDB.attach(sel.id,f); refresh(); };
  const open=(a:MatAttachment)=>{ const w=window.open(a.dataURL,"_blank"); if(!w) alert("Popup blockiert."); };

  const importCSV=()=>pickFile(async f=>{ const n=MaterialDB.importCSV(await f.text()); alert(`Import: ${n} Artikel.`); refresh(); });
  const exportCSV=()=>download("text/csv;charset=utf-8","material.csv",MaterialDB.exportCSV(filtered()));
  const exportJSON=()=>download("application/json","material_backup.json",MaterialDB.exportJSON());
  const importJSON=()=>pickFile(async f=>{ const n=MaterialDB.importJSON(await f.text()); alert(`Backup importiert: ${n}.`); refresh(); });

  const printLabel=()=>{ if(!sel) return;
    const html = `
      <html><body style="font-family:Inter,Arial;padding:12px">
      <div style="border:1px solid #333;padding:10px;width:280px">
        <div style="font-weight:700">${escapeHtml(sel.name||"")}</div>
        <div>${escapeHtml(sel.code||"")}</div>
        <div style="font-size:12;opacity:.8">${escapeHtml(sel.location||"")}</div>
      </div>
      <script>window.print();</script></body></html>`;
    const w=window.open("","_blank"); if(!w) return alert("Popup blockiert.");
    w.document.write(html); w.document.close();
  };

  return (
    <div style={{display:"grid",gridTemplateRows:"auto 1fr",gap:10,padding:10}}>
      <div className="card" style={{padding:"8px 10px",display:"flex",gap:8,alignItems:"center"}}>
        <button className="btn" onClick={add}>+ Artikel</button>
        <button className="btn" onClick={del} disabled={!sel}>Löschen</button>
        <div style={{flex:1}}/>
        <input placeholder="Suche Name / Code / Projekt…" value={q} onChange={e=>setQ(e.target.value)} style={{...inp,width:280}}/>
        <select value={proj} onChange={e=>setProj(e.target.value)} style={{...inp,width:160}}>
          <option value="">Alle Projekte</option>{projects.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        <label style={{display:"flex",alignItems:"center",gap:6}}>
          <input type="checkbox" checked={onlyLow} onChange={e=>setOnlyLow(e.target.checked)}/> <span style={{fontSize:13}}>nur Unterbestand</span>
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
              <th style={th}>Name</th><th style={th}>Code</th><th style={th}>Projekt</th><th style={th}>Ort</th>
              <th style={th}>Einheit</th><th style={th}>Bestand</th><th style={th}>min</th><th style={th}>Preis Netto</th>
            </tr></thead>
            <tbody>
              {filtered().map(it=>{
                const low=(it.stock??0) <= (it.minStock??0);
                return (
                  <tr key={it.id} onClick={()=>setSel(it)} style={{cursor:"pointer",background:sel?.id===it.id?"#f1f5ff":undefined}}>
                    <td style={td}><b>{it.name}</b></td>
                    <td style={td}>{it.code||"—"}</td>
                    <td style={td}>{it.projectId||"—"}</td>
                    <td style={td}>{it.location||"—"}</td>
                    <td style={td}>{it.unit||"—"}</td>
                    <td style={{...td,color:low?"#c03":undefined}}>{it.stock??0}</td>
                    <td style={td}>{it.minStock??0}</td>
                    <td style={td}>{it.priceNet?`${it.priceNet.toFixed(2)} €`:"—"}</td>
                  </tr>
                );
              })}
              {filtered().length===0 && <tr><td style={{...td,opacity:.6}} colSpan={8}>Keine Artikel.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* EDITOR */}
        <div className="card" onDragOver={e=>e.preventDefault()} onDrop={onDrop} style={{padding:12}}>
          {!sel? <div style={{opacity:.7}}>Links Artikel wählen oder neu anlegen.</div> : (
            <div style={{display:"grid",gridTemplateColumns:"130px 1fr 130px 1fr",gap:10}}>
              <label style={lbl}>Name</label>
              <input style={inp} value={sel.name} onChange={e=>up({name:e.target.value})}/>
              <label style={lbl}>Code (Barcode/RFID)</label>
              <input style={inp} value={sel.code??""} onChange={e=>up({code:e.target.value})}/>
              <label style={lbl}>Projekt-ID</label>
              <input style={inp} value={sel.projectId??""} onChange={e=>up({projectId:e.target.value})}/>
              <label style={lbl}>Ort/Lager</label>
              <input style={inp} value={sel.location??""} onChange={e=>up({location:e.target.value})}/>
              <label style={lbl}>Einheit</label>
              <input style={inp} value={sel.unit??""} onChange={e=>up({unit:e.target.value})}/>
              <label style={lbl}>Bestand</label>
              <input type="number" style={inp} value={sel.stock??0} onChange={e=>up({stock:+e.target.value})}/>
              <label style={lbl}>Mindestbestand</label>
              <input type="number" style={inp} value={sel.minStock??0} onChange={e=>up({minStock:+e.target.value})}/>
              <label style={lbl}>Preis Netto (€)</label>
              <input type="number" step="0.01" style={inp} value={sel.priceNet??0} onChange={e=>up({priceNet:+e.target.value})}/>
              <label style={lbl}>Lieferant</label>
              <input style={inp} value={sel.supplier??""} onChange={e=>up({supplier:e.target.value})}/>
              <div style={{gridColumn:"1 / -1",display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button className="btn" onClick={()=>move("IN")}>+ Eingang</button>
                <button className="btn" onClick={()=>move("OUT")}>− Ausgang</button>
                <button className="btn" onClick={printLabel}>Etikett drucken</button>
              </div>

              <label style={{...lbl,gridColumn:"1 / -1"}}>Bewegungen</label>
              <div style={{gridColumn:"1 / -1"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr><th style={th}>Datum</th><th style={th}>Typ</th><th style={th}>Menge</th><th style={th}>Projekt</th><th style={th}>Notiz</th></tr></thead>
                  <tbody>
                    {(sel.moves||[]).slice().sort((a,b)=>new Date(b.when).getTime()-new Date(a.when).getTime()).map(m=>(
                      <tr key={m.id}>
                        <td style={td}>{new Date(m.when).toLocaleString()}</td>
                        <td style={td}>{m.dir}</td>
                        <td style={td}>{m.qty}</td>
                        <td style={td}>{m.projectId||"—"}</td>
                        <td style={td}>{m.note||"—"}</td>
                      </tr>
                    ))}
                    {(sel.moves||[]).length===0 && <tr><td style={{...td,opacity:.6}} colSpan={5}>Keine Bewegungen.</td></tr>}
                  </tbody>
                </table>
              </div>

              <label style={{...lbl,gridColumn:"1 / -1"}}>Dokumente / Bilder (Drag&Drop)</label>
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

function escapeHtml(s:string){return s.replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]!));}
function pickFile(onPick:(f:File)=>void){ const i=document.createElement("input"); i.type="file"; i.onchange=()=>{const f=i.files?.[0]; if(f) onPick(f);}; i.click(); }
function download(type:string,name:string,data:string){ const b=new Blob([data],{type}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
