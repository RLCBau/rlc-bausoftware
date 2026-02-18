import React from "react";

/** ====== STORE INTERFACE (usa il tuo store reale) ======
 * Mi appoggio a un KommsDB con funzioni: list(), createThread(), removeThread(id),
 * addMessage(threadId, msg), upsertThread(patch), attach(threadId, file).
 * Se il tuo store ha nomi diversi, mappali internamente.
 */
import { KommsDB } from "./store.komms";
import { KThread, KMessage, KAttachment } from "./types";

const th: React.CSSProperties = { textAlign:"left", padding:"8px 10px", borderBottom:"1px solid var(--line)", fontSize:13, whiteSpace:"nowrap" };
const td: React.CSSProperties = { padding:"6px 10px", borderBottom:"1px solid var(--line)", fontSize:13, verticalAlign:"middle" };
const inp: React.CSSProperties = { border:"1px solid var(--line)", borderRadius:6, padding:"6px 8px", fontSize:13 };
const lbl: React.CSSProperties = { fontSize:12, opacity:.8 };

export default function Kommunikation() {
  const [threads, setThreads] = React.useState<KThread[]>(KommsDB.list());
  const [selId, setSelId] = React.useState<string | null>(threads[0]?.id ?? null);
  const [q, setQ] = React.useState("");
  const [onlyUnread, setOnlyUnread] = React.useState(false);
  const [proj, setProj] = React.useState("");
  const [compose, setCompose] = React.useState({ to:"", cc:"", subject:"", body:"" });

  const sel = threads.find(t => t.id === selId) ?? null;
  const refresh = () => setThreads(KommsDB.list());

  // actions thread
  const newThread = () => { const t = KommsDB.createThread(); refresh(); setSelId(t.id); };
  const delThread = () => { if (!sel) return; if (!confirm("Konversation löschen?")) return; KommsDB.removeThread(sel.id); refresh(); setSelId(KommsDB.list()[0]?.id ?? null); };
  const update = (patch: Partial<KThread>) => { if (!sel) return; KommsDB.upsertThread({ ...sel, ...patch, updatedAt: Date.now() }); refresh(); };

  // filters
  const filtered = () => threads.filter(t => {
    const text = (t.subject + " " + (t.participants ?? []).join(" ") + " " + (t.projectId ?? "")).toLowerCase();
    const okQ = !q || text.includes(q.toLowerCase());
    const okUnread = !onlyUnread || (t.unreadCount ?? 0) > 0;
    const okP = !proj || (t.projectId ?? "") === proj;
    return okQ && okUnread && okP;
  });

  // message send
  const send = async () => {
    if (!sel) return;
    const body = compose.body.trim();
    if (!body) return;
    const msg: KMessage = {
      id: crypto.randomUUID(),
      when: Date.now(),
      from: "Ich",
      to: compose.to ? compose.to.split(",").map(s=>s.trim()).filter(Boolean) : [],
      cc: compose.cc ? compose.cc.split(",").map(s=>s.trim()).filter(Boolean) : [],
      subject: compose.subject || sel.subject || "(ohne Betreff)",
      body,
      attachments: []
    };
    await KommsDB.addMessage(sel.id, msg);
    setCompose({ ...compose, body:"" });
    refresh();
  };

  // drop attachments to thread
  const onDrop = async (ev: React.DragEvent) => {
    ev.preventDefault();
    if (!sel) return;
    const f = ev.dataTransfer.files?.[0];
    if (!f) return;
    await KommsDB.attach(sel.id, f); // allega a thread come “Dateien”
    refresh();
  };

  // attachment preview
  const Att: React.FC<{a:KAttachment}> = ({ a }) => {
    const isImg = (a.mime||"").startsWith("image/");
    const isPDF = (a.mime||"").includes("pdf");
    const open = () => { const w=window.open(a.dataURL, "_blank"); if(!w) alert("Popup blockiert."); };
    return (
      <div style={{ border:"1px solid var(--line)", borderRadius:6, overflow:"hidden", background:"#fff" }}>
        <div style={{ padding:"6px 8px", fontSize:12, display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.name}</span>
          <div style={{ flex:1 }} />
          <button className="btn" onClick={open}>Öffnen</button>
        </div>
        {isImg && <img src={a.dataURL} alt={a.name} style={{ width:"100%", height:"auto", display:"block" }}/>}
        {isPDF && <iframe title={a.name} src={a.dataURL} style={{ width:"100%", height:200, border:0 }} />}
      </div>
    );
  };

  // quick mark read
  const markAllRead = () => { if (!sel) return; const t = { ...sel, unreadCount:0 } as KThread; KommsDB.upsertThread(t); refresh(); };

  // projects list (simple from threads)
  const projects = Array.from(new Set(threads.map(t=>t.projectId).filter(Boolean))) as string[];

  return (
    <div style={{ display:"grid", gridTemplateRows:"auto 1fr", gap:10, padding:10 }}>
      {/* Toolbar */}
      <div className="card" style={{ padding:"8px 10px", display:"flex", gap:8, alignItems:"center" }}>
        <button className="btn" onClick={newThread}>+ Neue Konversation</button>
        <button className="btn" onClick={delThread} disabled={!sel}>Löschen</button>
        <div style={{ flex:1 }} />
        <input placeholder="Suche Betreff / Teilnehmer / Projekt…" value={q} onChange={e=>setQ(e.target.value)} style={{ ...inp, width:300 }} />
        <select value={proj} onChange={e=>setProj(e.target.value)} style={{ ...inp, width:160 }}>
          <option value="">Alle Projekte</option>
          {projects.map(p => <option key={p} value={p as string}>{p}</option>)}
        </select>
        <label style={{ display:"flex", alignItems:"center", gap:6 }}>
          <input type="checkbox" checked={onlyUnread} onChange={e=>setOnlyUnread(e.target.checked)} />
          <span style={{fontSize:13}}>Nur ungelesene</span>
        </label>
      </div>

      {/* Grid: thread list | detail */}
      <div style={{ display:"grid", gridTemplateColumns:"minmax(380px, 44vw) 1fr", gap:10, minHeight:"60vh" }}>
        {/* Left: threads table */}
        <div className="card" style={{ padding:0, overflow:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr>
                <th style={th}>Betreff</th>
                <th style={th}>Projekt</th>
                <th style={th}>Teilnehmer</th>
                <th style={th}>Ungelesen</th>
                <th style={th}>Aktualisiert</th>
              </tr>
            </thead>
            <tbody>
              {filtered().map(t=>(
                <tr key={t.id} onClick={()=>setSelId(t.id)} style={{ cursor:"pointer", background: t.id===selId ? "#f1f5ff" : undefined }}>
                  <td style={td} title={t.subject}><b>{t.subject || "(ohne Betreff)"}</b></td>
                  <td style={td}>{t.projectId || "—"}</td>
                  <td style={td} title={(t.participants||[]).join(", ")}>{(t.participants||[]).slice(0,3).join(", ")}{(t.participants||[]).length>3?"…":""}</td>
                  <td style={td}>{t.unreadCount ?? 0}</td>
                  <td style={td}>{new Date(t.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right: detail */}
        <div className="card" style={{ padding:12, display:"grid", gridTemplateRows:"auto auto 1fr auto", gap:10 }} onDragOver={e=>e.preventDefault()} onDrop={onDrop}>
          {!sel ? (
            <div style={{opacity:.7}}>Links eine Konversation wählen oder neu erstellen.</div>
          ) : (
            <>
              {/* Header editable */}
              <div style={{ display:"grid", gridTemplateColumns:"120px 1fr 120px 1fr", gap:10 }}>
                <label style={lbl}>Betreff</label>
                <input style={inp} value={sel.subject} onChange={e=>update({ subject:e.target.value })} />
                <label style={lbl}>Projekt-ID</label>
                <input style={inp} value={sel.projectId ?? ""} onChange={e=>update({ projectId: e.target.value })} />
                <label style={lbl}>Teilnehmer</label>
                <input style={inp} placeholder="kommagetrennt" value={(sel.participants ?? []).join(", ")} onChange={e=>update({ participants: e.target.value.split(",").map(s=>s.trim()).filter(Boolean) })} />
                <div />
                <div style={{ display:"flex", gap:8 }}>
                  <button className="btn" onClick={markAllRead}>Als gelesen markieren</button>
                </div>
              </div>

              {/* Thread attachments */}
              {(sel.attachments?.length ?? 0) > 0 && (
                <div>
                  <div style={{fontWeight:700, marginBottom:6}}>Dateien</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))", gap:8 }}>
                    {sel.attachments!.map(a => <Att key={a.id} a={a} />)}
                  </div>
                </div>
              )}

              {/* Messages */}
              <div style={{ border:"1px solid var(--line)", borderRadius:8, overflow:"auto", background:"#fff", padding:10 }}>
                {sel.messages.length === 0 ? (
                  <div style={{opacity:.6}}>Noch keine Nachrichten.</div>
                ) : (
                  sel.messages
                    .slice()
                    .sort((a,b)=>a.when-b.when)
                    .map(m=>(
                      <div key={m.id} style={{ padding:"8px 10px", borderBottom:"1px dashed var(--line)" }}>
                        <div style={{ display:"flex", gap:6, alignItems:"baseline" }}>
                          <div style={{ fontWeight:700 }}>{m.from}</div>
                          <div style={{ fontSize:12, opacity:.7 }}>{new Date(m.when).toLocaleString()}</div>
                        </div>
                        {m.subject && <div style={{ fontSize:13, margin:"2px 0 6px 0" }}><b>{m.subject}</b></div>}
                        <div style={{ whiteSpace:"pre-wrap", fontSize:13 }}>{m.body}</div>
                        {m.attachments?.length ? (
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:8, marginTop:8 }}>
                            {m.attachments.map(a => <Att key={a.id} a={a} />)}
                          </div>
                        ) : null}
                      </div>
                    ))
                )}
              </div>

              {/* Composer */}
              <div style={{ display:"grid", gridTemplateColumns:"80px 1fr 40px 1fr", gap:8 }}>
                <label style={lbl}>An</label>
                <input style={inp} value={compose.to} onChange={e=>setCompose(p=>({...p, to:e.target.value}))} placeholder="mail1@..., mail2@..." />
                <label style={lbl}>CC</label>
                <input style={inp} value={compose.cc} onChange={e=>setCompose(p=>({...p, cc:e.target.value}))} />
                <label style={lbl}>Betreff</label>
                <input style={{ ...inp, gridColumn:"2 / -1" }} value={compose.subject} onChange={e=>setCompose(p=>({...p, subject:e.target.value}))} />
                <label style={{ ...lbl, gridColumn:"1 / -1" }}>Nachricht</label>
                <textarea style={{ ...inp, gridColumn:"1 / -1", minHeight:120, resize:"vertical" }} value={compose.body} onChange={e=>setCompose(p=>({...p, body:e.target.value}))} placeholder="Schreibe eine Nachricht… (Anhänge: Datei auf diesen Bereich ziehen)" />
                <div style={{ gridColumn:"1 / -1", display:"flex", justifyContent:"flex-end", gap:8 }}>
                  <button className="btn" onClick={send} disabled={!compose.body.trim()}>Senden</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===== util opzionale per import .eml/.msg (placeholder) =====
   Aggiungi nel tuo store una funzione KommsDB.importEmail(file)
   e un bottone nella toolbar se vuoi. Qui manteniamo core messaging.
*/
