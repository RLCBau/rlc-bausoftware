import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

type Mangel = {
  id: string;
  foto?: string;
  titel: string;
  beschreibung: string;
  kategorie: string;
  prioritaet: "niedrig"|"mittel"|"hoch"|"kritisch";
  status: "offen"|"in Bearbeitung"|"behoben"|"abgenommen";
  ort?: string;
  lvPos?: string;
  regieberichtId?: string;
  faelligAm?: string;
  verantwortlicher?: string;
  notiz?: string;
  erkannt?: string;
  erstelltAm: string;
  email?: string;
};
type Opt = { id: string; label: string };

const API = (import.meta.env.VITE_API_URL?.replace(/\/$/,'') || "http://localhost:4000");


export default function Maengel() {
  const nav = useNavigate();

  const [projectId, setProjectId] = useState("");
  const [items, setItems] = useState<Mangel[]>([]);
  const [busy, setBusy] = useState(false);
  const [useAI, setUseAI] = useState(true);

  const [lvOpts, setLvOpts] = useState<Opt[]>([]);
  const [regieOpts, setRegieOpts] = useState<Opt[]>([]);

  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!projectId) { setLvOpts([]); setRegieOpts([]); return; }
    fetch(`${API}/api/lookup/lv?projectId=${encodeURIComponent(projectId)}`).then(r=>r.json()).then(d=>setLvOpts(d.items||[])).catch(()=>{});
    fetch(`${API}/api/lookup/regieberichte?projectId=${encodeURIComponent(projectId)}`).then(r=>r.json()).then(d=>setRegieOpts(d.items||[])).catch(()=>{});
  }, [projectId]);

  async function uploadFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !projectId) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("projectId", projectId);
      fd.append("file", f);
      const res = await fetch(`${API}/api/ki/maengel/upload?ai=${useAI ? "1":"0"}`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const neu: Mangel = {
        id: crypto.randomUUID(),
        foto: data.url,
        titel: data.detected?.title || "Mangel",
        beschreibung: data.detected?.desc || "",
        kategorie: data.detected?.cat || "Allgemein",
        prioritaet: data.detected?.prio || "mittel",
        status: "offen",
        ort: "",
        lvPos: data.detected?.lv || "",
        regieberichtId: "",
        faelligAm: new Date(Date.now() + 7*86400000).toISOString().slice(0,10),
        verantwortlicher: "",
        notiz: "",
        erkannt: JSON.stringify(data.detected),
        erstelltAm: new Date().toISOString()
      };
      setItems(arr => [neu, ...arr]);
    } catch (e:any) {
      alert("Upload/Erkennung fehlgeschlagen: " + e.message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
      setBusy(false);
    }
  }

  function update(i:number, patch: Partial<Mangel>) {
    setItems(arr => arr.map((m,idx)=> idx===i ? { ...m, ...patch } : m));
  }
  function remove(i:number) { setItems(arr => arr.filter((_,idx)=> idx!==i)); }

  async function speichern() {
    if (!projectId) return alert("Projekt-ID fehlt.");
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/ki/maengel/save`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ projectId, items })
      });
      if (!res.ok) throw new Error(await res.text());
      alert("Gespeichert.");
    } catch (e:any) { alert("Speichern fehlgeschlagen: " + e.message); }
    finally { setBusy(false); }
  }
  async function laden() {
    if (!projectId) return alert("Projekt-ID fehlt.");
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/ki/maengel/load`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ projectId })
      });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setItems(d.items||[]);
    } catch (e:any) { alert("Laden fehlgeschlagen: " + e.message); }
    finally { setBusy(false); }
  }
  async function exportPdf(list: Mangel[]) {
    if (!projectId || !list.length) return;
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/ki/maengel/pdf`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ projectId, items: list })
      });
      if (!r.ok) throw new Error(await r.text());
      const { url } = await r.json();
      window.open(url, "_blank");
      return url;
    } catch (e:any) { alert("PDF-Export fehlgeschlagen: " + e.message); }
    finally { setBusy(false); }
  }
  async function notifySingle(m: Mangel) {
    if (!m.email) return alert("E-Mail fehlt.");
    const url = await exportPdf([m]); if (!url) return;
    const html = `
      <p>Guten Tag,</p>
      <p><b>${m.titel}</b> – Priorität: ${m.prioritaet} – Status: ${m.status}</p>
      <p>Ort: ${m.ort||"-"} – Fällig: ${m.faelligAm||"-"}</p>
      <p>LV-Pos.: ${m.lvPos||"-"} – Regiebericht: ${m.regieberichtId||"-"}</p>
      <p>Protokoll: <a href="${url}" target="_blank">${url}</a></p>`;
    await fetch(`${API}/api/ki/maengel/notify`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        projectId, to: m.email, subject: `Mangel: ${m.titel} (${projectId})`,
        html, attachPdf: { path: "uploads" + url.replace("/files","/"), filename: "Maengelprotokoll.pdf" }
      })
    }).then(r=>{ if(!r.ok) throw new Error("Mail fehlgeschlagen"); alert("E-Mail gesendet."); })
      .catch(e=>alert(String(e)));
  }

  async function searchLv(term: string) {
    if (!projectId) return;
    const r = await fetch(`${API}/api/lookup/lv?projectId=${encodeURIComponent(projectId)}&q=${encodeURIComponent(term)}`);
    const d = await r.json(); setLvOpts(d.items||[]);
  }
  async function searchRegie(term: string) {
    if (!projectId) return;
    const r = await fetch(`${API}/api/lookup/regieberichte?projectId=${encodeURIComponent(projectId)}&q=${encodeURIComponent(term)}`);
    const d = await r.json(); setRegieOpts(d.items||[]);
  }

  // NAV: apri pagine dedicate
  function openLV(pos?: string) {
    if (!pos) return;
    nav(`/mengenermittlung/PositionLV?pos=${encodeURIComponent(pos)}&project=${encodeURIComponent(projectId)}`);
  }
  function openRegie(id?: string) {
    if (!id) return;
    nav(`/mengenermittlung/regieberichte?rid=${encodeURIComponent(id)}&project=${encodeURIComponent(projectId)}`);
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Mängelmanagement KI-gestützt</h1>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        <label>Projekt-ID:&nbsp;<input value={projectId} onChange={e=>setProjectId(e.target.value)} placeholder="P-2025-001" /></label>
        <input ref={fileRef} type="file" accept="image/*" onChange={uploadFotos} />
        <label>KI aktiv:&nbsp;<input type="checkbox" checked={useAI} onChange={e=>setUseAI(e.target.checked)} /></label>
        <button onClick={laden} disabled={!projectId || busy}>Laden</button>
        <button onClick={speichern} disabled={!projectId || busy}>{busy ? "..." : "Speichern"}</button>
        <button onClick={()=>exportPdf(items)} disabled={!items.length || busy}>Mängelprotokoll (PDF)</button>
      </div>

      <datalist id="lvlist">{lvOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</datalist>
      <datalist id="regielist">{regieOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</datalist>

      <div style={{ marginTop: 14, overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              {["Foto","Titel","Beschreibung","Kategorie","Priorität","Status","Ort/Bereich","LV-Pos.","Regiebericht","Fällig am","Verantw.","E-Mail","Notiz","Aktion"].map(h=>(
                <th key={h} style={{ borderBottom:"1px solid #ccc", textAlign:"left", padding:8 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((m,i)=>(
              <tr key={m.id}>
                <td style={{ padding:6, minWidth:110 }}>{m.foto ? <a href={m.foto} target="_blank">Foto</a> : "-"}</td>
                <td style={{ padding:6 }}><input value={m.titel} onChange={e=>update(i,{titel:e.target.value})} /></td>
                <td style={{ padding:6 }}><input value={m.beschreibung} onChange={e=>update(i,{beschreibung:e.target.value})} /></td>
                <td style={{ padding:6 }}><input value={m.kategorie} onChange={e=>update(i,{kategorie:e.target.value})} placeholder="Erdarbeiten/Leitungen/..." /></td>
                <td style={{ padding:6 }}>
                  <select value={m.prioritaet} onChange={e=>update(i,{prioritaet:e.target.value as any})}>
                    <option>niedrig</option><option>mittel</option><option>hoch</option><option>kritisch</option>
                  </select>
                </td>
                <td style={{ padding:6 }}>
                  <select value={m.status} onChange={e=>update(i,{status:e.target.value as any})}>
                    <option>offen</option><option>in Bearbeitung</option><option>behoben</option><option>abgenommen</option>
                  </select>
                </td>
                <td style={{ padding:6 }}><input value={m.ort||""} onChange={e=>update(i,{ort:e.target.value})} /></td>

                <td style={{ padding:6, minWidth:260 }}>
                  <div style={{ display:"flex", gap:6 }}>
                    <input list="lvlist"
                      value={m.lvPos||""}
                      onChange={e=>{ update(i,{lvPos:e.target.value}); searchLv(e.target.value); }}
                      placeholder="ERD-1001 …" />
                    <button onClick={()=>openLV(m.lvPos)} disabled={!m.lvPos}>Öffnen</button>
                  </div>
                </td>

                <td style={{ padding:6, minWidth:260 }}>
                  <div style={{ display:"flex", gap:6 }}>
                    <input list="regielist"
                      value={m.regieberichtId||""}
                      onChange={e=>{ update(i,{regieberichtId:e.target.value}); searchRegie(e.target.value); }}
                      placeholder="RB-2025-…" />
                    <button onClick={()=>openRegie(m.regieberichtId)} disabled={!m.regieberichtId}>Öffnen</button>
                  </div>
                </td>

                <td style={{ padding:6 }}><input type="date" value={m.faelligAm||""} onChange={e=>update(i,{faelligAm:e.target.value})}/></td>
                <td style={{ padding:6 }}><input value={m.verantwortlicher||""} onChange={e=>update(i,{verantwortlicher:e.target.value})} /></td>
                <td style={{ padding:6 }}><input value={m.email||""} onChange={e=>update(i,{email:e.target.value})} placeholder="name@firma.de" /></td>
                <td style={{ padding:6 }}><input value={m.notiz||""} onChange={e=>update(i,{notiz:e.target.value})} /></td>
                <td style={{ padding:6, width:180 }}>
                  <button onClick={()=>notifySingle(m)}>Benachrichtigen</button>
                  <button onClick={()=>remove(i)} style={{ marginLeft:6 }}>Entf.</button>
                </td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={14} style={{ padding:10, color:"#777" }}>Keine Mängel erfasst.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
