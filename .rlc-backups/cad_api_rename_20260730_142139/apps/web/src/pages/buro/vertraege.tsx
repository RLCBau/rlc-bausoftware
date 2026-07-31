import React from "react";
import { DocsDB } from "./store.docs";
import { Dokument, DocVersion } from "./types";

const th: React.CSSProperties = { textAlign:"left", padding:"8px 10px", borderBottom:"1px solid var(--line)", fontSize:13, whiteSpace:"nowrap" };
const td: React.CSSProperties = { padding:"6px 10px", borderBottom:"1px solid var(--line)", fontSize:13, verticalAlign:"middle" };
const lbl: React.CSSProperties = { fontSize:13, opacity:.8 };
const inp: React.CSSProperties = { border:"1px solid var(--line)", borderRadius:6, padding:"6px 8px", fontSize:13 };

type Sig = { id:string; by:string; role?:string; when:number; imgDataURL:string };
type Hist = { id:string; when:number; type:"status"|"signature"; message:string };

export default function Dokumente() {
  const [all, setAll] = React.useState<Dokument[]>(DocsDB.list());
  const [selId, setSelId] = React.useState<string | null>(all[0]?.id ?? null);
  const [q, setQ] = React.useState("");
  const [tagFilter, setTagFilter] = React.useState("");
  const [zoom, setZoom] = React.useState(1);
  const [showSig, setShowSig] = React.useState(false);

  const sel = all.find(d => d.id === selId) ?? null;
  const cur: DocVersion | undefined = sel?.versions[0];
  const refresh = () => setAll(DocsDB.list());

  // helpers to read/patch optional new fields senza rompere tipi
  const getStatus = () => ((sel as any)?.status as string) || "Entwurf";
  const getSigs = () => ((sel as any)?.signatures as Sig[]) || [];
  const getHist = () => ((sel as any)?.history as Hist[]) || [];
  const patch = (p: Partial<Dokument> & any) => { if (!sel) return; DocsDB.upsert({ ...sel, ...p, updatedAt: Date.now() }); refresh(); };

  // actions
  const addDoc = () => { const d = DocsDB.create(); refresh(); setSelId(d.id); };
  const delDoc = () => { if (!sel) return; if (!confirm("Dokument löschen?")) return; DocsDB.remove(sel.id); refresh(); setSelId(DocsDB.list()[0]?.id ?? null); };
  const update = (patchObj: Partial<Dokument>) => { if (!sel) return; DocsDB.upsert({ ...sel, ...patchObj }); refresh(); };

  const uploadNewVersion = async () => pickFile(async f => { if (!sel) return; await DocsDB.addVersion(sel.id, f); addHist("version", `Neue Version: ${f.name}`); refresh(); });
  const onDrop = async (ev: React.DragEvent) => { ev.preventDefault(); if (!sel) return; const f = ev.dataTransfer.files?.[0]; if (!f) return; await DocsDB.addVersion(sel.id, f); addHist("version", `Neue Version (Drag&Drop): ${f.name}`); refresh(); };

  const download = (v: DocVersion) => { const a = document.createElement("a"); a.href = v.dataURL; a.download = v.fileName; a.click(); };
  const copyDataURL = async (v: DocVersion) => { await navigator.clipboard.writeText(v.dataURL); alert("DataURL copiato."); };

  // import/export
  const doExportCSV = () => downloadBlob(DocsDB.exportCSV(filtered()), "dokumente.csv", "text/csv;charset=utf-8");
  const doImportCSV = async () => pickFile(async f => { const n = DocsDB.importCSV(await f.text()); alert(`${n} Dokumente importiert.`); refresh(); });

  const doExportJSON = () => downloadBlob(DocsDB.exportJSON(), "dokumente_backup.json", "application/json");
  const doImportJSON = async () => pickFile(async f => { const n = DocsDB.importJSON(await f.text()); alert(`Backup importato: ${n} Elemente.`); refresh(); });

  // history
  const addHist = (type: "status" | "signature" | "version", message: string) => {
    if (!sel) return;
    const hist = getHist();
    const rec: Hist = { id: crypto.randomUUID(), when: Date.now(), type: type === "version" ? "status" : (type as any), message };
    patch({ history: [rec, ...hist] });
  };

  // filters
  const filtered = (): Dokument[] => all.filter(d => {
    const s = (d.title + " " + (d.tags ?? []).join(" ")).toLowerCase();
    const okQ = !q || s.includes(q.toLowerCase());
    const okT = !tagFilter || (d.tags ?? []).map(t=>t.toLowerCase()).includes(tagFilter.toLowerCase());
    return okQ && okT;
  });
  const allTags = Array.from(new Set(all.flatMap(d => d.tags ?? []))).sort();

  // preview
  const renderPreview = (v?: DocVersion) => {
    if (!v) return <div style={{opacity:.6}}>Nessuna versione da mostrare.</div>;
    const isPDF = (v.mime || "").includes("pdf") || /\.pdf$/i.test(v.fileName);
    const isImg = (v.mime || "").startsWith("image/") || /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(v.fileName);
    const openNew = () => { const w = window.open(v.dataURL, "_blank"); if (!w) alert("Popup bloccato."); };

    return (
      <div style={{ display:"grid", gridTemplateRows:"auto 1fr", gap:8, height:"100%" }}>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <div style={{ fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={v.fileName}>
            {v.fileName}
          </div>
          <div style={{ flex:1 }} />
          <button className="btn" onClick={()=>setZoom(z => Math.max(0.5, z-0.1))}>-</button>
          <div style={{ minWidth:60, textAlign:"center" }}>{Math.round(zoom*100)}%</div>
          <button className="btn" onClick={()=>setZoom(z => Math.min(2, z+0.1))}>+</button>
          <button className="btn" onClick={openNew}>Apri in nuova scheda</button>
        </div>
        <div style={{ border:"1px solid var(--line)", borderRadius:8, overflow:"auto", background:"#fff" }}>
          {isPDF ? (
            <iframe title="pdf" src={v.dataURL} style={{ width:"100%", height:"100%", border:"0", transform:`scale(${zoom})`, transformOrigin:"0 0" }} />
          ) : isImg ? (
            <div style={{ overflow:"auto" }}>
              <img src={v.dataURL} alt={v.fileName} style={{ width: `${zoom*100}%`, height:"auto", display:"block" }} />
            </div>
          ) : (
            <div style={{ padding:12 }}>
              <div style={{ fontWeight:700, marginBottom:6 }}>Anteprima non supportata.</div>
              <div style={{ opacity:.7, marginBottom:8 }}>Tipo: {v.mime || "—"}</div>
              <button className="btn" onClick={openNew}>Apri / Scarica</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // status change
  const changeStatus = (s: string) => {
    if (!sel) return;
    patch({ status: s });
    addHist("status", `Status → ${s}`);
  };

  // signature capture
  const onSigned = (sig: { imgDataURL:string; by:string; role?:string }) => {
    if (!sel) return;
    const all = getSigs();
    const rec: Sig = { id: crypto.randomUUID(), when: Date.now(), imgDataURL: sig.imgDataURL, by: sig.by, role: sig.role };
    patch({ signatures: [rec, ...all] });
    addHist("signature", `Signatur von ${sig.by}${sig.role ? " ("+sig.role+")" : ""}`);
    setShowSig(false);
  };

  return (
    <div style={{ display:"grid", gridTemplateRows:"auto 1fr", gap:10, padding:10 }}>
      {/* Toolbar */}
      <div className="card" style={{ padding:"8px 10px", display:"flex", gap:8, alignItems:"center" }}>
        <button className="btn" onClick={addDoc}>+ Dokument</button>
        <button className="btn" onClick={delDoc} disabled={!sel}>Löschen</button>
        <div style={{ flex:1 }} />
        <input placeholder="Suchen…" value={q} onChange={e=>setQ(e.target.value)} style={{ ...inp, width:260 }} />
        <select value={tagFilter} onChange={e=>setTagFilter(e.target.value)} style={{ ...inp, width:160 }}>
          <option value="">Alle Tags</option>
          {allTags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className="btn" onClick={uploadNewVersion} disabled={!sel}>Neue Version</button>
        <button className="btn" onClick={doImportCSV}>Import CSV</button>
        <button className="btn" onClick={doExportCSV}>Export CSV</button>
        <button className="btn" onClick={doImportJSON}>Import JSON</button>
        <button className="btn" onClick={doExportJSON}>Export JSON</button>
      </div>

      {/* Griglia: lista+editor (sx) | preview (dx) */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr min(42vw, 640px)", gap:10, minHeight:"60vh" }}>
        {/* SX */}
        <div style={{ display:"grid", gridTemplateRows:"minmax(200px, 40vh) auto", gap:10 }}>
          {/* Tabella */}
          <div className="card" style={{ padding:0, overflow:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Titel</th>
                  <th style={th}>Tags</th>
                  <th style={th}>Status</th>
                  <th style={th}>Letzte Version</th>
                  <th style={th}>Größe</th>
                  <th style={th}>Geändert</th>
                </tr>
              </thead>
              <tbody>
                {filtered().map(d => {
                  const v = d.versions[0];
                  const st = ((d as any).status as string) || "Entwurf";
                  return (
                    <tr key={d.id} onClick={()=>{ setSelId(d.id); setZoom(1); }} style={{ cursor:"pointer", background: d.id===selId ? "#f1f5ff" : undefined }}>
                      <td style={td}>{d.title}</td>
                      <td style={td}>{(d.tags ?? []).join(", ")}</td>
                      <td style={td}><span className="tag">{st}</span></td>
                      <td style={td}>{v ? v.fileName : <i>—</i>}</td>
                      <td style={td}>{v ? (v.size/1024).toFixed(1)+" KB" : "—"}</td>
                      <td style={td}>{new Date(d.updatedAt).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Editor + Versioni + Status/Sign */}
          <div className="card" onDragOver={e=>e.preventDefault()} onDrop={onDrop} style={{ padding:12 }}>
            {!sel ? (
              <div style={{ opacity:.7 }}>Wähle links ein Dokument aus oder erstelle ein neues.</div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"150px 1fr 150px 1fr", gap:10 }}>
                <label style={lbl}>Titel</label>
                <input style={{ ...inp, width:"100%" }} value={sel.title} onChange={e=>update({ title: e.target.value })} />

                <label style={lbl}>Tags</label>
                <input
                  style={{ ...inp, width:"100%" }}
                  placeholder="kommagetrennt"
                  value={(sel.tags ?? []).join(", ")}
                  onChange={e=>update({ tags: e.target.value.split(",").map(s=>s.trim()).filter(Boolean) })}
                />

                <label style={lbl}>Projekt-ID</label>
                <input style={inp} value={sel.projektId ?? ""} onChange={e=>update({ projektId: e.target.value })} />

                <label style={lbl}>Status</label>
                <select style={inp} value={getStatus()} onChange={e=>changeStatus(e.target.value)}>
                  <option>Entwurf</option>
                  <option>Freigegeben</option>
                  <option>Signiert</option>
                </select>

                <label style={lbl}>Signaturen</label>
                <div>
                  <div style={{ display:"flex", gap:8, marginBottom:6, alignItems:"center" }}>
                    <button className="btn" onClick={()=>setShowSig(true)}>Signatur erfassen</button>
                    <small style={{opacity:.7}}>{getSigs().length} vorhanden</small>
                  </div>
                  {getSigs().length>0 && (
                    <div style={{ display:"grid", gap:6 }}>
                      {getSigs().map(s => (
                        <div key={s.id} style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <img src={s.imgDataURL} alt="sig" style={{ height:36, border:"1px solid var(--line)", background:"#fff" }} />
                          <div style={{fontSize:12}}>
                            {s.by}{s.role ? ` (${s.role})` : ""} · {new Date(s.when).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <label style={{ ...lbl, gridColumn:"1 / -1" }}>Versionen (Drag&Drop Datei hier)</label>
                <div style={{ gridColumn:"1 / -1" }}>
                  {!sel.versions.length ? (
                    <div style={{ opacity:.7 }}>Noch keine Version hochgeladen.</div>
                  ) : (
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr>
                          <th style={th}>Datei</th>
                          <th style={th}>Typ</th>
                          <th style={th}>Größe</th>
                          <th style={th}>Hochgeladen</th>
                          <th style={th}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sel.versions.map((v, i) => (
                          <tr key={v.id} style={{ background: i===0 ? "#eef8f0" : undefined }}>
                            <td style={td} title={v.fileName}>{v.fileName}</td>
                            <td style={td}>{v.mime || "—"}</td>
                            <td style={td}>{(v.size/1024).toFixed(1)} KB</td>
                            <td style={td}>{new Date(v.uploadedAt).toLocaleString()}</td>
                            <td style={{ ...td, whiteSpace:"nowrap" }}>
                              <button className="btn" onClick={()=>download(v)}>Download</button>
                              <button className="btn" onClick={()=>copyDataURL(v)}>Kopiere DataURL</button>
                              {i>0 && <button className="btn" onClick={()=>{ DocsDB.restoreVersion(sel.id, v.id); addHist("status","Version wiederhergestellt"); refresh(); }}>Wiederherstellen</button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <label style={{ ...lbl, gridColumn:"1 / -1" }}>Versionshistorie</label>
                <div style={{ gridColumn:"1 / -1" }}>
                  {getHist().length===0 ? <div style={{opacity:.7}}>Keine Einträge.</div> : (
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead><tr><th style={th}>Zeit</th><th style={th}>Ereignis</th></tr></thead>
                      <tbody>
                        {getHist().map(h=>(
                          <tr key={h.id}>
                            <td style={td}>{new Date(h.when).toLocaleString()}</td>
                            <td style={td}>{h.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* DX: PREVIEW */}
        <div className="card" style={{ padding:12, minHeight:300 }}>{renderPreview(cur)}</div>
      </div>

      {showSig && <SignatureModal onClose={()=>setShowSig(false)} onSave={onSigned} />}
    </div>
  );
}

/** ===== Signature Modal (canvas) ===== */
function SignatureModal({ onClose, onSave }:{ onClose:()=>void; onSave:(s:{imgDataURL:string; by:string; role?:string})=>void }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState("Bauleiter");
  React.useEffect(() => {
    const c = ref.current!; const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0,0,c.width,c.height);
    let drawing=false, last:{x:number;y:number}|null=null;
    const pos = (e:PointerEvent)=>{ const r=c.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; };
    const down=(e:PointerEvent)=>{ drawing=true; last=pos(e); };
    const move=(e:PointerEvent)=>{ if(!drawing||!last) return; const p=pos(e); const ctx=c.getContext("2d")!; ctx.lineWidth=2; ctx.lineCap="round"; ctx.strokeStyle="#111"; ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(p.x,p.y); ctx.stroke(); last=p; };
    const up=()=>{ drawing=false; last=null; };
    c.addEventListener("pointerdown",down); c.addEventListener("pointermove",move); window.addEventListener("pointerup",up);
    return ()=>{ c.removeEventListener("pointerdown",down); c.removeEventListener("pointermove",move); window.removeEventListener("pointerup",up); };
  },[]);
  const clear = ()=>{ const c=ref.current!; const ctx=c.getContext("2d")!; ctx.fillStyle="#fff"; ctx.fillRect(0,0,c.width,c.height); };
  const save = ()=>{ if(!name.trim()) { alert("Name für die Signatur angeben."); return; } onSave({ imgDataURL: ref.current!.toDataURL("image/png"), by:name.trim(), role }); };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.35)", display:"grid", placeItems:"center", zIndex:9999 }}>
      <div className="card" style={{ padding:16, width:520, display:"grid", gap:10 }}>
        <div style={{ fontWeight:700, fontSize:16 }}>Digitale Signatur erfassen</div>
        <div style={{ display:"grid", gridTemplateColumns:"110px 1fr 110px 1fr", gap:10 }}>
          <label style={lbl}>Name</label>
          <input style={inp} value={name} onChange={e=>setName(e.target.value)} placeholder="z. B. Max Mustermann" />
          <label style={lbl}>Rolle</label>
          <input style={inp} value={role} onChange={e=>setRole(e.target.value)} placeholder="Bauleiter / Auftraggeber" />
          <div style={{ gridColumn:"1 / -1" }}>
            <canvas ref={ref} width={480} height={180} style={{ border:"1px solid var(--line)", borderRadius:6, background:"#fff", touchAction:"none" }} />
          </div>
          <div style={{ gridColumn:"1 / -1", display:"flex", gap:8, justifyContent:"flex-end" }}>
            <button className="btn" onClick={clear}>Leeren</button>
            <button className="btn" onClick={onClose}>Abbrechen</button>
            <button className="btn" onClick={save}>Speichern</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==== utils UI ====
function pickFile(onPick: (f: File)=>void) {
  const inp = document.createElement("input"); inp.type = "file";
  inp.onchange = () => { const f = inp.files?.[0]; if (f) onPick(f); };
  inp.click();
}
function downloadBlob(text: string, name: string, type: string) {
  const blob = new Blob([text], { type }); const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
