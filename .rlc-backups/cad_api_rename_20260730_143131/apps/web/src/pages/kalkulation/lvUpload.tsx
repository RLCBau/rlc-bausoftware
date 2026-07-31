import React, { useEffect, useMemo, useRef, useState } from "react";

type LVRow = { position: string; kurztext: string; einheit: string; menge: string; ep: number };

// === UI styles (semplici) ===
const shell = { maxWidth: 1260, margin: "0 auto", padding: "12px 16px 40px", fontFamily: "Inter, system-ui, Arial", color: "#0f172a" } as const;
const toolbar = { display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" } as const;
const btn = { padding: "6px 10px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer" } as const;
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 } as const;
const thtd = { border: "1px solid #e2e8f0", padding: "6px 8px", verticalAlign: "middle" } as const;
const head = { ...thtd, background: "#f8fafc", fontWeight: 600, textAlign: "left" as const } as const;
const input = { width: "100%", border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 6px" } as const;

const STORAGE_KEY = (proj: string) => `rlc_lvupload_${proj || "default"}`;
const LV_STORE_KEY = "rlc_lv_data_v1"; // stesso della Manuell

export default function LVUpload() {
  const [rows, setRows] = useState<LVRow[]>([]);
  const [projekt, setProjekt] = useState<string>(() => localStorage.getItem("rlc_lvupload_current") || "PROJ-ANG-001");
  const [mwst, setMwst] = useState<number>(() => Number(localStorage.getItem("rlc_lvupload_mwst")) || 19);
  const fileRef = useRef<HTMLInputElement>(null);

  // load per progetto
  useEffect(() => {
    localStorage.setItem("rlc_lvupload_current", projekt);
    try {
      const raw = localStorage.getItem(STORAGE_KEY(projekt));
      setRows(raw ? JSON.parse(raw) : []);
    } catch { setRows([]); }
  }, [projekt]);

  // autosave
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY(projekt), JSON.stringify(rows));
  }, [rows, projekt]);

  useEffect(() => localStorage.setItem("rlc_lvupload_mwst", String(mwst)), [mwst]);

  // ===== helpers =====
  const safeNumber = (v: any) => {
    if (v == null || v === "") return 0;
    const s = String(v).trim().replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  // valuta formula semplice (solo numeri + operatori)
  const evalFormula = (expr: string): number => {
    if (!expr) return 0;
    const s = expr.replace(/,/g, ".").replace(/\s+/g, "");
    if (!/^[0-9+\-*/().]*$/.test(s)) return 0; // sicurezza
    try {
      // eslint-disable-next-line no-new-func
      const value = Function(`"use strict"; return (${s});`)();
      return Number.isFinite(value) ? Number(value) : 0;
    } catch { return 0; }
  };

  const parsedRows = useMemo(() => {
    return rows.map(r => {
      const menge = evalFormula(r.menge);
      const einheit = mapEinheit(r.einheit, r.kurztext);
      const zeile = roundForUnit(menge, einheit) * (safeNumber(r.ep) || 0);
      return { ...r, _mengeNum: roundForUnit(menge, einheit), _einheitNorm: einheit, _zeilenpreis: zeile };
    });
  }, [rows]);

  const totals = useMemo(() => {
    const netto = parsedRows.reduce((s, r: any) => s + (r._zeilenpreis || 0), 0);
    const brutto = netto * (1 + (mwst || 0) / 100);
    return { netto, brutto };
  }, [parsedRows, mwst]);

  // ===== import/export =====
  const importCsv = (f: File) => {
    const r = new FileReader();
    r.onload = () => {
      const text = String(r.result || "");
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return;

      // trova header
      const header = lines[0].split(";").map(s => s.replace(/^"|"$/g, "").trim().toLowerCase());
      const iPos = header.findIndex(h => /position|pos[-\s]?nr/.test(h));
      const iKurz = header.findIndex(h => /kurztext|text|bezeichnung/.test(h));
      const iEin = header.findIndex(h => /einheit|me|unit/.test(h));
      const iMenge = header.findIndex(h => /menge|formel|qty/.test(h));
      const iEp = header.findIndex(h => /ep|einzelpreis|preis/.test(h));

      const body = (iPos>=0 && iKurz>=0 && iEin>=0 && iMenge>=0 && iEp>=0 ? lines.slice(1) : lines).map(l =>
        l.split(";").map(s => s.replace(/^"|"$/g, ""))
      );

      const arr: LVRow[] = body.map(c => ({
        position: c[iPos>=0?iPos:0] || "",
        kurztext: c[iKurz>=0?iKurz:1] || "",
        einheit:  c[iEin>=0?iEin:2] || "m",
        menge:    c[iMenge>=0?iMenge:3] || "0",
        ep:       safeNumber(c[iEp>=0?iEp:4] || 0),
      }));
      setRows(arr);
    };
    r.readAsText(f, "utf-8");
  };

  const exportCsv = () => {
    const hdr = "Position;Kurztext;Einheit;Menge(Formula);EP;Zeilenpreis\n";
    const body = parsedRows.map((r:any) =>
      [r.position, jsonCell(r.kurztext), r._einheitNorm, r.menge, fix(r.ep), fix(r._zeilenpreis)].join(";")
    ).join("\n");
    download(hdr + body, `LV_${projekt}.csv`);
  };

  const exportXlsx = () => {
    const xmlHeader =
      `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>` +
      `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
      `xmlns:o="urn:schemas-microsoft-com:office:office" ` +
      `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
      `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`;
    const sheetOpen = `<Worksheet ss:Name="LV"><Table>`;
    const headRow = `<Row>` + ["Position","Kurztext","Einheit","Menge","EP","Zeilenpreis"]
      .map(h => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join("") + `</Row>`;
    const body = parsedRows.map((r:any) =>
      `<Row>` +
      `<Cell><Data ss:Type="String">${escapeXml(r.position)}</Data></Cell>` +
      `<Cell><Data ss:Type="String">${escapeXml(r.kurztext)}</Data></Cell>` +
      `<Cell><Data ss:Type="String">${escapeXml(r._einheitNorm)}</Data></Cell>` +
      `<Cell><Data ss:Type="Number">${num(r._mengeNum)}</Data></Cell>` +
      `<Cell><Data ss:Type="Number">${num(r.ep)}</Data></Cell>` +
      `<Cell><Data ss:Type="Number">${num(r._zeilenpreis)}</Data></Cell>` +
      `</Row>`
    ).join("");
    const foot = `<Row><Cell><Data ss:Type="String">MwSt %</Data></Cell><Cell/><Cell/><Cell/><Cell/>` +
                 `<Cell><Data ss:Type="Number">${mwst}</Data></Cell></Row>`;
    const xml = xmlHeader + sheetOpen + headRow + body + foot + `</Table></Worksheet></Workbook>`;
    const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
    downloadBlob(blob, `LV_${projekt}.xlsx`);
  };

  // bulk paste da clipboard/Excel (prompt)
  const pasteBulk = () => {
    const t = prompt("Incolla righe (CSV con ; — header facoltativo):");
    if (!t) return;
    try {
      const fake = new File([t], "paste.csv", { type: "text/csv" });
      importCsv(fake);
    } catch {}
  };

  // auto pos numbering es. 01.0001 …
  const autoNumber = () => {
    let kap = "01";
    let n = 1;
    const pad = (x:number, len:number) => String(x).padStart(len, "0");
    const out = rows.map(r => {
      const pos = r.position?.trim();
      const next = pos ? pos : `${kap}.${pad(n,4)}`;
      n++;
      return { ...r, position: next };
    });
    setRows(out);
  };

  // invia a Kalkulation Manuell
  const sendToManuell = () => {
    const existing = (() => {
      try { return JSON.parse(localStorage.getItem(LV_STORE_KEY) || "[]"); } catch { return []; }
    })();
    const mapped = parsedRows.map((r: any) => ({
      id: crypto.randomUUID(),
      posNr: r.position || "",
      kurztext: r.kurztext || "",
      einheit: r._einheitNorm || "m",
      menge: r._mengeNum || 0,
      preis: r.ep || 0,
      confidence: undefined
    }));
    localStorage.setItem(LV_STORE_KEY, JSON.stringify([...mapped, ...existing]));
    // naviga
    try { (window as any).router?.navigate?.("/kalkulation/manuell"); } catch {}
    // fallback
    window.location.href = "/kalkulation/manuell";
  };

  // ===== CRUD =====
  const add = () => setRows(p => [...p, { position: "", kurztext: "", einheit: "m", menge: "0", ep: 0 }]);
  const upd = (i:number, patch: Partial<LVRow>) => setRows(p => p.map((x,idx)=>idx===i?{...x,...patch}:x));
  const del = (i:number) => setRows(p => p.filter((_,idx)=>idx!==i));
  const clear = () => { if (confirm("Sicuro di cancellare tutto?")) setRows([]); };

  return (
    <div style={shell}>
      <h2 style={{ margin:"4px 0 12px", fontSize:20, fontWeight:700 }}>LV hochladen / erstellen</h2>

      <div style={toolbar}>
        <label>Projekt:
          <input style={{...input, width:220, marginLeft:6}} value={projekt} onChange={e=>setProjekt(e.target.value)} />
        </label>

        <label style={btn}>CSV Import
          <input ref={fileRef} type="file" accept=".csv,text/csv"
                 onChange={e=>{const f=e.target.files?.[0]; if(f) importCsv(f); if (fileRef.current) fileRef.current.value="";}}
                 style={{display:"none"}}/>
        </label>
        <button style={btn} onClick={pasteBulk}>Incolla righe</button>
        <button style={btn} onClick={exportCsv}>CSV Export</button>
        <button style={btn} onClick={exportXlsx}>XLSX Export</button>

        <button style={btn} onClick={add}>+ Zeile</button>
        <button style={btn} onClick={autoNumber}>Auto-Position</button>
        <button style={{...btn, color:"#b91c1c"}} onClick={clear}>Alles löschen</button>

        <label style={{ marginLeft: 16 }}>MwSt %
          <input type="number" style={{...input, width:80, marginLeft:6}} value={mwst} onChange={e=>setMwst(Number(e.target.value||0))}/>
        </label>

        <button style={{...btn, marginLeft: "auto", background:"#0ea5e9", color:"#fff", borderColor:"#0284c7"}} onClick={sendToManuell}>
          → In “Kalkulation manuell”
        </button>
      </div>

      <div style={{ overflow:"auto", border:"1px solid #e2e8f0", borderRadius:8 }}>
        <table style={table}>
          <thead>
            <tr>
              <th style={head}>Position</th>
              <th style={head}>Kurztext</th>
              <th style={head}>ME</th>
              <th style={head}>Menge (Formel)</th>
              <th style={head}>EP (netto)</th>
              <th style={head}>Menge (calc.)</th>
              <th style={head}>Zeilenpreis</th>
              <th style={head}>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {parsedRows.map((r:any,i:number)=>(
              <tr key={i}>
                <td style={thtd}><input style={input} value={r.position} onChange={e=>upd(i,{position:e.target.value})}/></td>
                <td style={thtd}><input style={input} value={r.kurztext} onChange={e=>upd(i,{kurztext:e.target.value})}/></td>
                <td style={thtd}><input style={input} value={r.einheit} onChange={e=>upd(i,{einheit:e.target.value})}/></td>
                <td style={thtd}><input style={input} value={rows[i].menge} onChange={e=>upd(i,{menge:e.target.value})} placeholder="es. 12*3+5/2"/></td>
                <td style={thtd}><input style={input} type="number" step="0.01" value={rows[i].ep} onChange={e=>upd(i,{ep:Number(e.target.value)})}/></td>
                <td style={thtd}>{fmtQty(r._mengeNum, r._einheitNorm)}</td>
                <td style={thtd}>{fmt(r._zeilenpreis)}</td>
                <td style={thtd}><button style={{...btn,color:"#b91c1c"}} onClick={()=>del(i)}>Löschen</button></td>
              </tr>
            ))}
            {parsedRows.length===0 && (
              <tr><td colSpan={8} style={{...thtd, textAlign:"center", color:"#64748b"}}>Noch keine Zeilen.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display:"flex", justifyContent:"flex-end", gap:24, marginTop:16 }}>
        <div style={sumBox}><div>Gesamt Netto</div><div style={{ fontWeight: 700 }}>{fmt(totals.netto)}</div></div>
        <div style={sumBox}><div>Gesamt Brutto</div><div style={{ fontWeight: 700 }}>{fmt(totals.brutto)}</div></div>
      </div>
    </div>
  );
}

/* === Helpers === */
const sumBox: React.CSSProperties = { border:"1px solid #eee", borderRadius:8, padding:"10px 14px", minWidth:220, background:"#fcfcfc" };

function download(text: string, name: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, name);
}
function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
const escapeXml = (s:string) => (s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const jsonCell = (s:string) => JSON.stringify(s ?? "");
const fix = (v:number) => (Number(v)||0).toString().replace(".", ",");
const num = (v:any) => Number(v || 0);
const fmt = (v:number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v || 0);

function mapEinheit(einheit: string, text: string): string {
  const e = (einheit || "").trim().toLowerCase();
  if (e === "m2" || e === "m²") return "m²";
  if (e === "m3" || e === "m³") return "m³";
  if (e === "stk" || e === "stück") return "Stk";
  if (e === "m") return "m";
  const t = (text || "").toLowerCase();
  if (/\bm²|\bm2|fläche|belag|schicht/.test(t)) return "m²";
  if (/\bm³|\bm3|kubatur|aushub|volumen/.test(t)) return "m³";
  if (/\bstk|stück|schacht|anschluss\b/.test(t)) return "Stk";
  return "m";
}
function roundForUnit(v: number, einheit: string): number {
  const e = (einheit || "").toLowerCase();
  if (e === "stk" || e === "stück") return Math.round(v);
  if (e === "m³" || e === "m3") return Math.round(v * 1000) / 1000;
  return Math.round(v * 100) / 100;
}
function fmtQty(v:number, e:string) {
  const dec = (e.toLowerCase()==="stk"||e.toLowerCase()==="stück") ? 0 : (e.toLowerCase()==="m³"||e.toLowerCase()==="m3") ? 3 : 2;
  return `${v.toFixed(dec)} ${e}`;
}
