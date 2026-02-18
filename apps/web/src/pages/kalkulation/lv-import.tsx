import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LV, type LVPos } from "./store.lv";
import { Projects } from "./projectStore";

const MWST_KEY = "rlc_lv_mwst_v1";

export default function LVImportPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<LVPos[]>([]);
  const [mwst, setMwst] = useState<number>(() => Number(localStorage.getItem(MWST_KEY) ?? 19));
  const fileRef = useRef<HTMLInputElement>(null);

  // initial load
  useEffect(() => { setRows(LV.list()); }, []);
  useEffect(() => { localStorage.setItem(MWST_KEY, String(mwst || 0)); }, [mwst]);

  const curProject = Projects.getCurrent();

  // helpers
  const save = (r: LVPos) => { LV.upsert(r); setRows(LV.list()); };
  const addRow = () => {
    LV.upsert({ id: crypto.randomUUID(), posNr: "", kurztext: "", einheit: "m", menge: 0, preis: 0 });
    setRows(LV.list());
  };
  const del = (id: string) => { LV.remove(id); setRows(LV.list()); };
  const clearAll = () => { if (confirm("Alle Zeilen wirklich löschen?")) { LV.clear(); setRows([]); } };

  // CSV
  const exportCSV = () => {
    const csv = LV.exportCSV(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "lv.csv"; a.click();
    URL.revokeObjectURL(url);
  };
  const importCSV = (text: string) => { LV.importCSV(text); setRows(LV.list()); };

  // Paste rows (semicolon CSV)
  const pasteRows = () => {
    const example = `PosNr;Kurztext;Einheit;Menge;Preis;Confidence
01.0001;"Aushub Baugrube";m³;120;35.5;`;
    const t = prompt("Zeilen einfügen (CSV mit ; – Kopfzeile erlaubt):", example);
    if (!t) return;
    LV.importCSV(t); setRows(LV.list());
  };

  // XLSX (SpreadsheetML)
  const exportXLSX = () => {
    const xmlHeader =
      `<?xml version="1.0"?>` +
      `<?mso-application progid="Excel.Sheet"?>` +
      `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
      `xmlns:o="urn:schemas-microsoft-com:office:office" ` +
      `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
      `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`;
    const sheetOpen = `<Worksheet ss:Name="LV"><Table>`;
    const headRow = `<Row>` +
      ["PosNr","Kurztext","Einheit","Menge","EP (netto)","Confidence","Zeilen-Netto"]
        .map(h => `<Cell><Data ss:Type="String">${esc(h)}</Data></Cell>`).join("") +
      `</Row>`;
    const body = rows.map(r => {
      const z = (r.menge || 0) * (r.preis || 0);
      return `<Row>` +
        `<Cell><Data ss:Type="String">${esc(r.posNr||"")}</Data></Cell>` +
        `<Cell><Data ss:Type="String">${esc(r.kurztext||"")}</Data></Cell>` +
        `<Cell><Data ss:Type="String">${esc(r.einheit||"")}</Data></Cell>` +
        `<Cell><Data ss:Type="Number">${num(r.menge)}</Data></Cell>` +
        `<Cell><Data ss:Type="Number">${num(r.preis)}</Data></Cell>` +
        `<Cell><Data ss:Type="Number">${num(r.confidence)}</Data></Cell>` +
        `<Cell><Data ss:Type="Number">${num(z)}</Data></Cell>` +
      `</Row>`;
    }).join("");
    const foot = `<Row><Cell><Data ss:Type="String">MwSt %</Data></Cell><Cell/><Cell/><Cell/><Cell/><Cell/>` +
      `<Cell><Data ss:Type="Number">${mwst}</Data></Cell></Row>`;
    const xml = xmlHeader + sheetOpen + headRow + body + foot + `</Table></Worksheet></Workbook>`;
    const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "lv.xlsx"; a.click();
    URL.revokeObjectURL(url);
  };

  // Auto-PosNr helper
  const autoPosNr = () => {
    const next = [...rows];
    let i = 1;
    for (const r of next) {
      if (!r.posNr || /^\s*$/.test(r.posNr)) {
        r.posNr = `01.${String(i).padStart(4, "0")}`;
        LV.upsert(r); i++;
      }
    }
    setRows(LV.list());
  };

  const totals = useMemo(() => {
    const netto = rows.reduce((s, r) => s + (r.menge || 0) * (r.preis || 0), 0);
    const brutto = netto * (1 + (mwst || 0) / 100);
    return { netto, brutto };
  }, [rows, mwst]);

  return (
    <div style={{ padding: 16 }}>
      <h2>LV hochladen / erstellen</h2>

      <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:12, flexWrap:"wrap" }}>
        <div><b>Projekt:</b> {curProject ? `${curProject.number} — ${curProject.name}` : "kein Projekt ausgewählt"}</div>
        <label style={{ marginLeft:12 }}>MwSt %
          <input type="number" value={mwst} onChange={e=>setMwst(Number(e.target.value||0))} style={{ width:70, marginLeft:6 }} />
        </label>

        <button onClick={()=>fileRef.current?.click()}>CSV Import</button>
        <input
          ref={fileRef} type="file" accept=".csv" style={{ display:"none" }}
          onChange={(e)=>{
            const f=e.target.files?.[0]; if(!f) return;
            const r=new FileReader(); r.onload=()=>importCSV(String(r.result||"")); r.readAsText(f,"utf-8");
          }}
        />
        <button onClick={pasteRows}>Zeilen einfügen</button>
        <button onClick={exportCSV}>CSV Export</button>
        <button onClick={exportXLSX}>XLSX Export</button>
        <button onClick={addRow}>+ Zeile</button>
        <button onClick={autoPosNr}>Auto-Position</button>
        <button onClick={clearAll}>Alles löschen</button>

        {/* Navigation */}
        <button style={{ marginLeft:"auto" }} onClick={()=>navigate("/kalkulation/manuell")} title="Wechsel zur Kalkulation – Manuell">
          ⇢ in „Kalkulation manuell“
        </button>
        <button onClick={()=>navigate("/kalkulation/mit-ki")} title="Wechsel zur Kalkulation – KI">
          ⇢ in „Kalkulation mit KI“
        </button>
      </div>

      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              {["Position","Kurztext","ME","Menge (Formel)","EP (netto)","Menge (calc.)","Zeilenpreis","Aktion"].map((h,i)=>
                <th key={i} style={th}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(r=>{
              const zeile = (r.menge||0) * (r.preis||0);
              return (
                <tr key={r.id}>
                  <td style={td}><input value={r.posNr} onChange={e=>save({ ...r, posNr: e.target.value })} style={inp(110)} /></td>
                  <td style={td}><input value={r.kurztext} onChange={e=>save({ ...r, kurztext: e.target.value })} style={inp(520)} /></td>
                  <td style={td}><input value={r.einheit} onChange={e=>save({ ...r, einheit: e.target.value })} style={inp(60)} /></td>
                  <td style={tdNum}><input type="number" value={r.menge} onChange={e=>save({ ...r, menge: num(e.target.value) })} style={inp(120,"right")} /></td>
                  <td style={tdNum}><input type="number" value={r.preis ?? 0} onChange={e=>save({ ...r, preis: num(e.target.value) })} style={inp(120,"right")} /></td>
                  <td style={{...tdNum, color:"#999"}}>{r.menge ?? 0}</td>
                  <td style={{...tdNum, fontWeight:600}}>{fmt(zeile)}</td>
                  <td style={td}><button onClick={()=>del(r.id)}>Löschen</button></td>
                </tr>
              );
            })}
            {rows.length===0 && <tr><td colSpan={8} style={{ padding:12, color:"#666" }}>Noch keine Zeilen.</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ display:"flex", justifyContent:"flex-end", gap:24, marginTop:16 }}>
        <div style={sumBox}><div>Gesamt Netto</div><div style={{ fontWeight:700 }}>{fmt(totals.netto)}</div></div>
        <div style={sumBox}><div>Gesamt Brutto</div><div style={{ fontWeight:700 }}>{fmt(totals.brutto)}</div></div>
      </div>
    </div>
  );
}

/* UI helpers */
const th: React.CSSProperties = { textAlign:"left", padding:"8px 6px", borderBottom:"1px solid #eee", background:"#fafafa", fontWeight:600, whiteSpace:"nowrap" };
const td: React.CSSProperties = { padding:"6px", borderBottom:"1px solid #f0f0f0" };
const tdNum: React.CSSProperties = { ...td, textAlign:"right" };
const sumBox: React.CSSProperties = { border:"1px solid #eee", borderRadius:8, padding:"10px 14px", minWidth:220, background:"#fcfcfc" };
const inp = (w:number, align:"left"|"right"="left"): React.CSSProperties => ({ width:w, padding:"6px 8px", textAlign:align });

const num = (v:any) => Number(v || 0);
const fmt = (v:number) => new Intl.NumberFormat("de-DE", { style:"currency", currency:"EUR" }).format(v || 0);
const esc = (s:string) => (s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
