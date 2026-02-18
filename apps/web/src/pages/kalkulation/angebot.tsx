import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LV, type LVPos } from "./store.lv";
import { Projects } from "./projectStore";

type PdfOptions = {
  city?: string;              // Ort (für Deckblatt/Signaturzeile)
  dateISO?: string;           // Datum (ISO) – default heute
  payment?: string;           // Zahlungsbedingungen / Notizen
  mwst: number;               // MwSt %
  showWatermark: boolean;     // "Powered by OpenAI"
  colorHeader: boolean;       // farbiger Tabellenkopf
  showTableHeader: boolean;   // Tabellenkopf sichtbar
  showChapterRows: boolean;   // Zeilenzwischen-Summen pro Kapitel (bei posNr 01., 02., ...)
};

const MWST_KEY = "rlc_lv_mwst_v1";
const PDFOPT_KEY = "rlc_offer_pdf_options_v1";

export default function AngebotPage() {
  const navigate = useNavigate();

  // Daten
  const project = Projects.getCurrent();
  const [rows, setRows] = useState<LVPos[]>([]);
  const [opts, setOpts] = useState<PdfOptions>(() => {
    const saved = localStorage.getItem(PDFOPT_KEY);
    const mwst = Number(localStorage.getItem(MWST_KEY) ?? 19);
    return saved
      ? { ...JSON.parse(saved), mwst }
      : {
          city: "",
          dateISO: new Date().toISOString().slice(0, 10),
          payment:
            "Zahlungsbedingungen: 30 Tage netto. Angebot gültig 30 Tage.",
          mwst,
          showWatermark: false,
          colorHeader: true,
          showTableHeader: true,
          showChapterRows: true,
        };
  });

  // Load LV
  useEffect(() => setRows(LV.list()), []);
  useEffect(() => localStorage.setItem(MWST_KEY, String(opts.mwst || 0)), [opts.mwst]);
  useEffect(() => localStorage.setItem(PDFOPT_KEY, JSON.stringify(opts)), [opts]);

  const totals = useMemo(() => {
    const netto = rows.reduce((s, r) => s + (r.menge || 0) * (r.preis || 0), 0);
    const brutto = netto * (1 + (opts.mwst || 0) / 100);
    return { netto, brutto };
  }, [rows, opts.mwst]);

  // Kapitel-Zwischensummen (optional)
  const withChapterRows = useMemo(() => {
    if (!opts.showChapterRows) return rows.map(r => ({ ...r, _chapterRow: false as const }));
    const out: (LVPos & { _chapterRow: boolean; _chapterKey?: string })[] = [];
    let curKey = "";
    let curSum = 0;

    const flush = () => {
      if (!curKey) return;
      out.push({
        id: `chap-${curKey}-${out.length}`,
        posNr: curKey,
        kurztext: `Kapitel ${curKey} – Zwischensumme`,
        einheit: "",
        menge: 0,
        preis: undefined,
        confidence: undefined,
        _chapterRow: true,
        _chapterKey: curKey,
      } as any);
      curSum = 0;
    };

    const getKey = (posNr?: string) => {
      const m = String(posNr || "").match(/^(\d{2})\./);
      return m ? m[1] + "." : "";
    };

    for (const r of rows) {
      const key = getKey(r.posNr);
      if (key && key !== curKey) {
        if (curKey) flush();
        curKey = key;
      }
      curSum += (r.menge || 0) * (r.preis || 0);
      out.push({ ...(r as any), _chapterRow: false });
    }
    if (curKey) flush();
    return out;
  }, [rows, opts.showChapterRows]);

  // ===== Export XLSX (SpreadsheetML) =====
  const exportXLSX = () => {
    const list = rows;
    const xmlHeader =
      `<?xml version="1.0"?>` +
      `<?mso-application progid="Excel.Sheet"?>` +
      `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
      `xmlns:o="urn:schemas-microsoft-com:office:office" ` +
      `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
      `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`;
    const sheetOpen = `<Worksheet ss:Name="Angebot"><Table>`;
    const headRow = `<Row>` +
      ["PosNr","Kurztext","Einheit","Menge","EP (netto)","Zeilen-Netto"]
        .map(h => `<Cell><Data ss:Type="String">${esc(h)}</Data></Cell>`).join("") +
      `</Row>`;
    const body = list.map(r => {
      const z = (r.menge || 0) * (r.preis || 0);
      return `<Row>` +
        `<Cell><Data ss:Type="String">${esc(r.posNr || "")}</Data></Cell>` +
        `<Cell><Data ss:Type="String">${esc(r.kurztext || "")}</Data></Cell>` +
        `<Cell><Data ss:Type="String">${esc(r.einheit || "")}</Data></Cell>` +
        `<Cell><Data ss:Type="Number">${num(r.menge)}</Data></Cell>` +
        `<Cell><Data ss:Type="Number">${num(r.preis)}</Data></Cell>` +
        `<Cell><Data ss:Type="Number">${num(z)}</Data></Cell>` +
      `</Row>`;
    }).join("");
    const foot =
      `<Row><Cell><Data ss:Type="String">MwSt %</Data></Cell><Cell/><Cell/><Cell/><Cell/>` +
      `<Cell><Data ss:Type="Number">${opts.mwst}</Data></Cell></Row>`;
    const xml = xmlHeader + sheetOpen + headRow + body + foot + `</Table></Worksheet></Workbook>`;
    const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "angebot.xlsx"; a.click();
    URL.revokeObjectURL(url);
  };

  // ===== PDF (server) =====
  const exportPDF = async () => {
    try {
      const payload = {
        title: "Angebot",
        project: project ? {
          number: project.number,
          name: project.name,
          client: project.client,
          location: project.location,
        } : undefined,
        options: opts,
        rows: rows.map(r => ({
          posNr: r.posNr,
          text: r.kurztext,
          einheit: r.einheit,
          menge: r.menge,
          preis: r.preis ?? 0,
          zeilen: (r.menge || 0) * (r.preis || 0),
        })),
        totals,
      };
      const res = await fetch("http://localhost:4000/api/pdf/angebot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("PDF Fehler");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "Angebot.pdf"; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("PDF Export fehlgeschlagen: " + (e?.message || e));
    }
  };

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ color:"#888", fontSize:13 }}>RLC / 1. Kalkulation /</div>
          <h2 style={{ margin:"4px 0 12px" }}>Angebot generieren (PDF/Excel)</h2>
        </div>
        <div style={projBadge}>
          {project ? (<><b>{project.number}</b><span>— {project.name}</span></>) : "kein Projekt ausgewählt"}
        </div>
      </div>

      {/* Optionen */}
      <div style={panel}>
        <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
          <label>Ort
            <input value={opts.city || ""} onChange={e=>setOpts(v=>({ ...v, city: e.target.value }))} style={inp(220)} placeholder="München" />
          </label>
          <label>Datum
            <input type="date" value={opts.dateISO || ""} onChange={e=>setOpts(v=>({ ...v, dateISO: e.target.value }))} style={inp(170)} />
          </label>
          <label>MwSt %
            <input type="number" value={opts.mwst} onChange={e=>setOpts(v=>({ ...v, mwst: Number(e.target.value || 0) }))} style={inp(90)} />
          </label>
        </div>

        <div style={{ marginTop:10 }}>
          <label style={{ display:"block" }}>Zahlungsbedingungen / Notizen</label>
          <textarea
            value={opts.payment || ""}
            onChange={e=>setOpts(v=>({ ...v, payment: e.target.value }))}
            rows={3}
            style={{ width:"100%", padding:"8px 10px", border:"1px solid #ddd", borderRadius:6 }}
          />
        </div>

        <div style={{ display:"flex", gap:16, marginTop:10, flexWrap:"wrap" }}>
          <label><input type="checkbox" checked={opts.showWatermark} onChange={e=>setOpts(v=>({ ...v, showWatermark: e.target.checked }))} /> Watermark „Powered by OpenAI“</label>
          <label><input type="checkbox" checked={opts.colorHeader} onChange={e=>setOpts(v=>({ ...v, colorHeader: e.target.checked }))} /> Farbiger Tabellenkopf</label>
          <label><input type="checkbox" checked={opts.showTableHeader} onChange={e=>setOpts(v=>({ ...v, showTableHeader: e.target.checked }))} /> Tabellenkopf anzeigen</label>
          <label><input type="checkbox" checked={opts.showChapterRows} onChange={e=>setOpts(v=>({ ...v, showChapterRows: e.target.checked }))} /> Kapitel-Zwischensummen</label>
        </div>

        <div style={{ display:"flex", gap:8, marginTop:12 }}>
          <button onClick={exportPDF} style={primaryBtn}>PDF erzeugen</button>
          <button onClick={exportXLSX}>Excel (XLSX)</button>
          <button onClick={()=>navigate("/kalkulation/lv-import")}>⇢ LV bearbeiten</button>
          <button onClick={()=>navigate("/kalkulation/manuell")}>⇢ Kalkulation manuell</button>
          <button onClick={()=>navigate("/kalkulation/mit-ki")}>⇢ Kalkulation mit KI</button>
        </div>
      </div>

      {/* Tabelle Vorschau */}
      <div style={{ marginTop:12, overflowX:"auto", border:"1px solid #eee", borderRadius:8 }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead style={{ background:"#fafafa" }}>
            <tr>
              {["PosNr","Kurztext","ME","Menge","EP (netto)","Zeilen-Netto"].map((h,i)=>
                <th key={i} style={th}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {withChapterRows.map((r:any, i) => {
              const z = (r.menge || 0) * (r.preis || 0);
              if (r._chapterRow) {
                return (
                  <tr key={`chap-${i}`} style={{ background:"#f6f9ff", fontWeight:600 }}>
                    <td style={td}>{r.posNr}</td>
                    <td style={td}>{r.kurztext}</td>
                    <td style={td}></td>
                    <td style={tdNum}></td>
                    <td style={tdNum}></td>
                    <td style={{ ...tdNum }}>{/* sum displayed in PDF; optional here */}</td>
                  </tr>
                );
              }
              return (
                <tr key={r.id}>
                  <td style={td}>{r.posNr}</td>
                  <td style={td}>{r.kurztext}</td>
                  <td style={td}>{r.einheit}</td>
                  <td style={tdNum}>{fmtNum(r.menge)}</td>
                  <td style={tdNum}>{fmtNum(r.preis)}</td>
                  <td style={{ ...tdNum, fontWeight:600 }}>{fmt(z)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ padding:12, color:"#777" }}>Kein LV vorhanden.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Totali */}
      <div style={{ display:"flex", justifyContent:"flex-end", gap:16, marginTop:14 }}>
        <div style={sumBox}><div>Gesamt Netto</div><div style={{ fontWeight:700 }}>{fmt(totals.netto)}</div></div>
        <div style={sumBox}><div>Gesamt Brutto</div><div style={{ fontWeight:700 }}>{fmt(totals.brutto)}</div></div>
      </div>
    </div>
  );
}

/* ---- UI helpers ---- */
const th: React.CSSProperties = { textAlign:"left", padding:"8px 6px", borderBottom:"1px solid #eee", fontWeight:600, whiteSpace:"nowrap" };
const td: React.CSSProperties = { padding:"6px", borderBottom:"1px solid #f5f5f5" };
const tdNum: React.CSSProperties = { ...td, textAlign:"right" };
const inp = (w:number): React.CSSProperties => ({ width:w, padding:"6px 8px", border:"1px solid #ddd", borderRadius:6 });
const panel: React.CSSProperties = { border:"1px solid #eee", borderRadius:10, background:"#fff", padding:14 };
const projBadge: React.CSSProperties = { border:"1px solid #eee", borderRadius:999, padding:"6px 12px", background:"#fafafa", display:"flex", gap:8, alignItems:"center", whiteSpace:"nowrap" };
const sumBox: React.CSSProperties = { border:"1px solid #eee", borderRadius:8, padding:"10px 14px", minWidth:220, background:"#fcfcfc" };
const primaryBtn: React.CSSProperties = { fontWeight:700, border:"1px solid #2b7", background:"#eafff4", padding:"6px 10px", borderRadius:6 };

const num = (v:any) => Number(v || 0);
const fmt = (v:number) => new Intl.NumberFormat("de-DE", { style:"currency", currency:"EUR" }).format(v || 0);
const fmtNum = (v:any) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(Number(v || 0));
const esc = (s:string) => (s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
