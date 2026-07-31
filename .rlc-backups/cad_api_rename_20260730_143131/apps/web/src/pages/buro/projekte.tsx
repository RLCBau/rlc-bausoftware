import React from "react";
import { ProjekteDB } from "./store";
import { Projekt, ID } from "./types";

const th: React.CSSProperties = { textAlign:"left", padding:"8px 10px", borderBottom:"1px solid var(--line)", fontSize:13, whiteSpace:"nowrap" };
const td: React.CSSProperties = { padding:"6px 10px", borderBottom:"1px solid var(--line)", fontSize:13, verticalAlign:"middle" };
const lbl: React.CSSProperties = { fontSize:13, opacity:.8 };
const inpB: React.CSSProperties  = { border:"1px solid var(--line)", borderRadius:6, padding:"6px 8px", fontSize:13 };
const inpN: React.CSSProperties  = { ...inpB, width: 220 };
const inpS: React.CSSProperties  = { ...inpB, width: 150 };

export default function Projekte() {
  const [all, setAll] = React.useState<Projekt[]>(ProjekteDB.list());
  const [sel, setSel] = React.useState<ID | null>(all[0]?.id ?? null);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<"alle"|"aktiv"|"archiv">("alle");

  const selected = all.find(p => p.id === sel) ?? null;

  const refresh = () => setAll(ProjekteDB.list());

  const add = () => {
    const p = ProjekteDB.create();
    refresh();
    setSel(p.id);
  };
  const dup = () => {
    if (!selected) return;
    const copy = { ...selected, id: crypto.randomUUID(), name: selected.name + " (Kopie)" };
    ProjekteDB.upsert(copy);
    refresh();
    setSel(copy.id);
  };
  const del = () => {
    if (!selected) return;
    if (!confirm("Projekt löschen?")) return;
    ProjekteDB.remove(selected.id);
    const nxt = ProjekteDB.list();
    setAll(nxt);
    setSel(nxt[0]?.id ?? null);
  };

  const update = (patch: Partial<Projekt>) => {
    if (!selected) return;
    ProjekteDB.upsert({ ...selected, ...patch });
    refresh();
  };

  const filtered = all.filter(p => {
    const s = (p.name + " " + (p.baustellenNummer ?? "") + " " + (p.ort ?? "") + " " + (p.bauleiter ?? "")).toLowerCase();
    const okQ = !q || s.includes(q.toLowerCase());
    const okS = status === "alle" ? true : p.status === status;
    return okQ && okS;
  });

  const exportCSV = () => {
    const csv = ProjekteDB.exportCSV(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "projekte.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importCSV = async () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".csv,text/csv";
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      const txt = await f.text();
      const n = ProjekteDB.importCSV(txt);
      alert(`${n} Projekte importiert.`);
      refresh();
    };
    inp.click();
  };

  return (
    <div className="card" style={{ padding: 0 }}>
      {/* Toolbar */}
      <div style={{ display:"flex", gap:8, padding:"8px 10px", borderBottom:"1px solid var(--line)" }}>
        <button className="btn" onClick={add}>+ Projekt</button>
        <button className="btn" onClick={dup} disabled={!selected}>Duplizieren</button>
        <button className="btn" onClick={del} disabled={!selected}>Löschen</button>
        <div style={{ flex:1 }} />
        <input placeholder="Suchen…" value={q} onChange={e=>setQ(e.target.value)} style={{ ...inpN, width:260 }} />
        <select value={status} onChange={e=>setStatus(e.target.value as any)} style={inpS}>
          <option value="alle">Alle</option>
          <option value="aktiv">Aktiv</option>
          <option value="archiv">Archiv</option>
        </select>
        <button className="btn" onClick={importCSV}>Import CSV</button>
        <button className="btn" onClick={exportCSV}>Export CSV</button>
      </div>

      <div style={{ display:"grid", gridTemplateRows:"minmax(220px, 44vh) auto", gap:10, padding:10 }}>
        {/* Tabelle */}
        <div className="card" style={{ padding:0, overflow:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Baustellen-Nr.</th>
                <th style={th}>Ort</th>
                <th style={th}>Bauleiter</th>
                <th style={th}>Status</th>
                <th style={th}>Erstellt</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} onClick={()=>setSel(p.id)} style={{ cursor:"pointer", background: p.id===sel ? "#f1f5ff" : undefined }}>
                  <td style={td}>{p.name}</td>
                  <td style={td}>{p.baustellenNummer}</td>
                  <td style={td}>{p.ort}</td>
                  <td style={td}>{p.bauleiter}</td>
                  <td style={{ ...td, fontWeight:600 }}>{p.status}</td>
                  <td style={td}>{new Date(p.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Editor */}
        <div className="card" style={{ padding:12 }}>
          {!selected ? (
            <div style={{ opacity:.7 }}>Wähle links ein Projekt aus oder erstelle ein neues.</div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"150px 1fr 150px 1fr", gap:10, alignItems:"start" }}>
              <label style={lbl}>Name</label>
              <input style={{ ...inpB, width:"100%" }} value={selected.name} onChange={e=>update({ name: e.target.value })} />

              <label style={lbl}>Baustellen-Nr.</label>
              <input style={inpS} value={selected.baustellenNummer ?? ""} onChange={e=>update({ baustellenNummer: e.target.value })} />

              <label style={lbl}>Ort</label>
              <input style={inpS} value={selected.ort ?? ""} onChange={e=>update({ ort: e.target.value })} />

              <label style={lbl}>Bauleiter</label>
              <input style={inpS} value={selected.bauleiter ?? ""} onChange={e=>update({ bauleiter: e.target.value })} />

              <label style={lbl}>Status</label>
              <select style={inpS} value={selected.status} onChange={e=>update({ status: e.target.value as any })}>
                <option value="aktiv">Aktiv</option>
                <option value="archiv">Archiv</option>
              </select>

              <label style={lbl}>Erstellt</label>
              <div>{new Date(selected.createdAt).toLocaleString()}</div>

              <label style={lbl}>Geändert</label>
              <div>{new Date(selected.updatedAt).toLocaleString()}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
