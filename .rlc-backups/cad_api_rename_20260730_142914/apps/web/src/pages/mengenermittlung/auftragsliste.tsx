import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loadAufmass } from "../../lib/storage";

const shell: React.CSSProperties = {
  maxWidth: 1260, margin: "0 auto", padding: "12px 16px 40px",
  fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif", color: "#0f172a",
};
const toolbar: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" };
const btn: React.CSSProperties = { padding: "6px 10px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer" };
const textInput: React.CSSProperties = { width: 220, border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thtd: React.CSSProperties = { border: "1px solid #e2e8f0", padding: "6px 8px", verticalAlign: "middle" };
const head: React.CSSProperties = { ...thtd, background: "#f8fafc", fontWeight: 600, textAlign: "left", position: "sticky", top: 0, zIndex: 1 };

type Auftrag = {
  id: string; bezeichnung: string; bauleiter: string; ort: string; status: "offen"|"laufend"|"abgeschlossen"; projektId: string;
}

const DEMO: Auftrag[] = [
  { id: "A-1001", bezeichnung: "TW-BA-III – Trinkwasserleitung BA III", bauleiter: "M. König", ort: "D-81234", status: "laufend", projektId: "PROJ-001" },
  { id: "A-1002", bezeichnung: "Straßenausbau Musterstraße", bauleiter: "S. Kramer", ort: "D-73321", status: "offen", projektId: "PROJ-002" },
  { id: "A-1003", bezeichnung: "Gehweg Sanierung Süd", bauleiter: "A. Roth", ort: "D-70180", status: "abgeschlossen", projektId: "PROJ-003" },
];

export default function Auftragsliste() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Auftrag[]>(DEMO);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (x) =>
        x.id.toLowerCase().includes(s) ||
        x.bezeichnung.toLowerCase().includes(s) ||
        x.bauleiter.toLowerCase().includes(s) ||
        x.ort.toLowerCase().includes(s) ||
        x.projektId.toLowerCase().includes(s)
    );
  }, [items, q]);

  useEffect(() => {
    // Segnale: evidenziamo quali progetti hanno già Aufmaß salvato
    setItems((prev) =>
      prev.map((a) => {
        const doc = loadAufmass(a.projektId);
        return { ...a, bezeichnung: doc ? `${a.bezeichnung} (Aufmaß: ${doc.zeilen.length} Pos.)` : a.bezeichnung };
      })
    );
  }, []);

  return (
    <div style={shell}>
      <h2 style={{ margin: "4px 0 12px", fontSize: 20, fontWeight: 700 }}>Auftragsliste</h2>
      <div style={toolbar}>
        <input placeholder="Suche (Auftrag / Ort / ProjektID …)" style={textInput} value={q} onChange={(e)=>setQ(e.target.value)} />
        <button style={btn} onClick={() => setQ("")}>Zurücksetzen</button>
      </div>
      <div style={{ overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
        <table style={table}>
          <thead>
            <tr>
              <th style={head}>Auftrag</th>
              <th style={head}>Bezeichnung</th>
              <th style={head}>Bauleiter</th>
              <th style={head}>Ort</th>
              <th style={head}>Status</th>
              <th style={head}>Projekt-ID</th>
              <th style={head}>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(a=>(
              <tr key={a.id}>
                <td style={thtd}>{a.id}</td>
                <td style={thtd}>{a.bezeichnung}</td>
                <td style={thtd}>{a.bauleiter}</td>
                <td style={thtd}>{a.ort}</td>
                <td style={thtd}>{a.status}</td>
                <td style={thtd}>{a.projektId}</td>
                <td style={thtd}>
                  <button style={btn} onClick={()=>nav(`/mengenermittlung/aufmaseditor?projekt=${encodeURIComponent(a.projektId)}`)}>
                    Im Aufmaßeditor öffnen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
