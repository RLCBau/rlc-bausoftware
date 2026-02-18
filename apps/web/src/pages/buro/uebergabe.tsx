import React from "react";
import { UebergabeDB } from "./store.uebergabe";
import { HandoverDoc, HandoverItem, HandoverSign, HandoverAttachment } from "./types";

const inp:React.CSSProperties={border:"1px solid var(--line)",borderRadius:6,padding:"6px 8px",fontSize:13};
const lbl:React.CSSProperties={fontSize:12,opacity:.8};
const th:React.CSSProperties={textAlign:"left",padding:"8px 10px",borderBottom:"1px solid var(--line)",fontSize:13,whiteSpace:"nowrap"};
const td:React.CSSProperties={padding:"6px 10px",borderBottom:"1px solid var(--line)",fontSize:13,verticalAlign:"middle"};

export default function Uebergabe(){
  const [all,setAll]=React.useState<HandoverDoc[]>(UebergabeDB.list());
  const [sel,setSel]=React.useState<HandoverDoc|null>(all[0]??null);
  const [q,setQ]=React.useState(""); const [proj,setProj]=React.useState("");
  const refresh=()=>setAll(UebergabeDB.list());

  const itemsFiltered=()=>all.filter(d=>{
    const s=(d.title+" "+(d.projectId??"")+" "+(d.client??"")).toLowerCase();
    const okQ=!q||s.includes(q.toLowerCase());
    const okP=!proj||(d.projectId===proj);
    return okQ&&okP;
  });
  const projects=Array.from(new Set(all.map(d=>d.projectId).filter(Boolean))) as string[];

  const add=()=>{const d=UebergabeDB.create(); refresh(); setSel(d); };
  const del=()=>{ if(!sel)return; if(!confirm("Protokoll löschen?"))return; UebergabeDB.remove(sel.id); refresh(); setSel(UebergabeDB.list()[0]??null); };

  // ✅ campi editabili
  const up=(p:Partial<HandoverDoc>)=>{
    if(!sel)return;
    const next={...sel,...p,updatedAt:Date.now()};
    setSel(next); UebergabeDB.upsert(next); setAll(UebergabeDB.list());
  };

  const addItem=()=>{ if(!sel) return; const it:HandoverItem={id:crypto.randomUUID(),text:"",status:"open",note:""}; up({ checklist:[it,...(sel.checklist||[])] }); };
  const delItem=(id:string)=>{ if(!sel) return; up({ checklist:(sel.checklist||[]).filter(i=>i.id!==id) }); };

  const addSign=(role:"auftragnehmer"|"auftraggeber")=>{
    if(!sel) return;
    pickFile(async f=>{
      const url=await fileToDataURL(f);
      const s:HandoverSign={role,name:"",when:new Date().toISOString(),image:url};
      const signs={...(sel.signs||{})}; (signs as any)[role]=s; up({signs});
    });
  };

  const onDrop=async (ev:React.DragEvent)=>{ ev.preventDefault(); if(!sel) return; const f=ev.dataTransfer.files?.[0]; if(!f) return; await UebergabeDB.attach(sel.id,f); refresh(); };
  const open=(a:HandoverAttachment)=>{ const w=window.open(a.dataURL,"_blank"); if(!w) alert("Popup blockiert."); };

  const exportCSV=()=>download("text/csv;charset=utf-8","uebergabe.csv",UebergabeDB.exportCSV(itemsFiltered()));
  const exportJSON=()=>download("application/json","uebergabe_backup.json",UebergabeDB.exportJSON());
  const importJSON=()=>pickFile(async f=>{ const n=UebergabeDB.importJSON(await f.text()); alert(`Backup importiert: ${n}.`); refresh(); });

  return (
    <div style={{display:"grid",gridTemplateRows:"auto 1fr",gap:10,padding:10}}>
      {/* Toolbar */}
      <div className="card" style={{padding:"8px 10px",display:"flex",gap:8,alignItems:"center"}}>
        <button className="btn" onClick={add}>+ Protokoll</button>
        <button className="btn" onClick={del} disabled={!sel}>Löschen</button>
        <div style={{flex:1}}/>
        <input placeholder="Suche Titel / Kunde / Projekt…" value={q} onChange={e=>setQ(e.target.value)} style={{...inp,width:280}}/>
        <select value={proj} onChange={e=>setProj(e.target.value)} style={{...inp,width:160}}>
          <option value="">Alle Projekte</option>{projects.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        <button className="btn" onClick={exportCSV}>Export CSV</button>
        <button className="btn" onClick={importJSON}>Import JSON</button>
        <button className="btn" onClick={exportJSON}>Export JSON</button>
      </div>

      {/* Tabelle + Editor */}
      <div style={{display:"grid",gridTemplateColumns:"minmax(520px,48vw) 1fr",gap:10,minHeight:"60vh"}}>
        {/* LISTA */}
        <div className="card" style={{padding:0,overflow:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>
              <th style={th}>Titel</th><th style={th}>Projekt</th><th style={th}>Kunde</th>
              <th style={th}>Adresse</th><th style={th}>Status</th><th style={th}>Stand</th>
            </tr></thead>
            <tbody>
              {itemsFiltered().map(d=>{
                const total=d.checklist?.length||0;
                const done=d.checklist?.filter(i=>i.status==="ok").length||0;
                return (
                  <tr key={d.id} onClick={()=>setSel(d)} style={{cursor:"pointer",background:sel?.id===d.id?"#f1f5ff":undefined}}>
                    <td style={td}><b>{d.title}</b></td>
                    <td style={td}>{d.projectId||"—"}</td>
                    <td style={td}>{d.client||"—"}</td>
                    <td style={td}>{d.address||"—"}</td>
                    <td style={td}>{d.status||"Entwurf"}</td>
                    <td style={td}>{done}/{total}</td>
                  </tr>
                );
              })}
              {itemsFiltered().length===0 && <tr><td style={{...td,opacity:.6}} colSpan={6}>Keine Protokolle.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* EDITOR */}
        <div className="card" onDragOver={e=>e.preventDefault()} onDrop={onDrop} style={{padding:12}}>
          {!sel? <div style={{opacity:.7}}>Links Protokoll wählen oder neu anlegen.</div> : (
            <div style={{display:"grid",gridTemplateColumns:"140px 1fr 140px 1fr",gap:10}}>
              <label style={lbl}>Titel</label>
              <input style={inp} value={sel.title} onChange={e=>up({title:e.target.value})}/>
              <label style={lbl}>Projekt-ID</label>
              <input style={inp} value={sel.projectId??""} onChange={e=>up({projectId:e.target.value})}/>
              <label style={lbl}>Kunde</label>
              <input style={inp} value={sel.client??""} onChange={e=>up({client:e.target.value})}/>
              <label style={lbl}>Adresse</label>
              <input style={inp} value={sel.address??""} onChange={e=>up({address:e.target.value})}/>
              <label style={lbl}>Datum</label>
              <input type="date" style={inp} value={toDateInput(sel.date)} onChange={e=>up({date:new Date(e.target.value).toISOString()})}/>
              <label style={lbl}>Status</label>
              <select style={inp} value={sel.status??"Entwurf"} onChange={e=>up({status:e.target.value as any})}>
                <option>Entwurf</option><option>Im Gange</option><option>Abgeschlossen</option><option>Abgelehnt</option>
              </select>

              <label style={{...lbl,gridColumn:"1 / -1"}}>Checkliste</label>
              <div style={{gridColumn:"1 / -1"}}>
                <div style={{marginBottom:6}}><button className="btn" onClick={addItem}>+ Punkt</button></div>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr><th style={th}>Punkt</th><th style={th}>Status</th><th style={th}>Notiz</th><th style={th}></th></tr></thead>
                  <tbody>
                    {(sel.checklist||[]).map(it=>(
                      <tr key={it.id}>
                        <td style={td}><input style={{...inp,width:"100%"}} value={it.text} onChange={e=>up({checklist:(sel.checklist||[]).map(x=>x.id===it.id?{...it,text:e.target.value}:x)})}/></td>
                        <td style={td}>
                          <select style={inp} value={it.status} onChange={e=>up({checklist:(sel.checklist||[]).map(x=>x.id===it.id?{...it,status:e.target.value as any}:x)})}>
                            <option value="open">offen</option><option value="ok">ok</option><option value="mangel">Mangel</option>
                          </select>
                        </td>
                        <td style={td}><input style={{...inp,width:"100%"}} value={it.note??""} onChange={e=>up({checklist:(sel.checklist||[]).map(x=>x.id===it.id?{...it,note:e.target.value}:x)})}/></td>
                        <td style={{...td,whiteSpace:"nowrap"}}><button className="btn" onClick={()=>delItem(it.id)}>Entfernen</button></td>
                      </tr>
                    ))}
                    {(sel.checklist||[]).length===0 && <tr><td style={{...td,opacity:.6}} colSpan={4}>Keine Punkte.</td></tr>}
                  </tbody>
                </table>
              </div>

              <label style={{...lbl,gridColumn:"1 / -1"}}>Unterschriften</label>
              <div style={{gridColumn:"1 / -1",display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {(["auftragnehmer","auftraggeber"] as const).map(role=>{
                  const s=(sel.signs||{} as any)[role] as HandoverSign|undefined;
                  return (
                    <div key={role} style={{border:"1px solid var(--line)",borderRadius:6,padding:8,background:"#fff"}}>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <b style={{textTransform:"capitalize"}}>{role}</b>
                        <div style={{flex:1}} />
                        <button className="btn" onClick={()=>addSign(role)}>+ Bild</button>
                      </div>
                      <div style={{marginTop:8,display:"grid",gridTemplateColumns:"100px 1fr 120px 1fr",gap:8}}>
                        <label style={lbl}>Name</label>
                        <input style={inp} value={s?.name??""} onChange={e=>up({signs:{...(sel.signs||{}),[role]:{...s,name:e.target.value}} as any})}/>
                        <label style={lbl}>Datum</label>
                        <input type="date" style={inp} value={toDateInput(s?.when)} onChange={e=>up({signs:{...(sel.signs||{}),[role]:{...s,when:new Date(e.target.value).toISOString()}} as any})}/>
                        {s?.image && <img src={s.image} alt="sign" style={{gridColumn:"1 / -1",maxHeight:100}}/>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <label style={{...lbl,gridColumn:"1 / -1"}}>Anhänge (Drag&Drop)</label>
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
async function fileToDataURL(f:File){ return await new Promise<string>(res=>{ const r=new FileReader(); r.onload=()=>res(String(r.result)); r.readAsDataURL(f); }); }
function pickFile(onPick:(f:File)=>void){ const i=document.createElement("input"); i.type="file"; i.onchange=()=>{const f=i.files?.[0]; if(f) onPick(f);}; i.click(); }
function download(type:string,name:string,data:string){ const b=new Blob([data],{type}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
