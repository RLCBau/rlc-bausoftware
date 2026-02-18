import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LV, type LVPos } from "./store.lv";

/** Unterstützte Formate (Anzeige) */
const SUPPORTED: { code: Fmt; label: string; sub: string }[] = [
  { code: "GAEB90",   label: "GAEB 90",     sub: "D81–D86" },
  { code: "GAEB2000", label: "GAEB 2000",   sub: "P81–P86, P94" },
  { code: "GAEBXML",  label: "GAEB XML 3.x", sub: "X80–X86, X94" },
  { code: "DA",       label: "Aufmaß (DA)", sub: "DA11 (1979/2009), X31" },
];

type Fmt = "GAEB90" | "GAEB2000" | "GAEBXML" | "DA";
type Detect = { format: Fmt; name: string; count: number; rows: any[] };
type FilterMode = "alle" | "neu" | "vorhanden";

/** Vorschlag-Map für ME-Normalisierung */
const ME_SUGGEST: Record<string, string> = {
  qm: "m²", m2: "m²", "m^2": "m²",
  qkm: "km²",
  qdm: "dm²",
  qcm: "cm²",
  qmm: "mm²",
  mtr: "m", meter: "m",
  stk: "St", st: "St", stck: "St",
  std: "h", stunden: "h",
  min: "min",
  t: "t", to: "t", tonnen: "t",
  kg: "kg", g: "g",
  l: "l",
  "m3": "m³", "m^3": "m³", qm3: "m³",
  km: "km",
  pauschal: "PS", ps: "PS",
};

export default function GaebPage() {
  const nav = useNavigate();
  const [det, setDet] = useState<Detect | null>(null);
  const [info, setInfo] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [openRows, setOpenRows] = useState<Record<number, boolean>>({});
  const [filterMode, setFilterMode] = useState<FilterMode>("alle");

  const preview = useMemo(() => (det?.rows ?? []).slice(0, 500), [det]);

  async function onUpload(f: File) {
    setBusy(true); setInfo("Datei wird verarbeitet …");
    try {
      const fd = new FormData(); fd.append("file", f);
      const r = await fetch("http://localhost:4000/api/gaeb/import", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || r.statusText);
      setDet({ format: j.format, name: f.name, count: j.count, rows: j.rows });
      if (!j.count) {
  setInfo(`Hinweis: ${j.format} erkannt, aber keine Positionen extrahiert. `
    + `Für GAEB 2000 (.P94) ist der Parser noch nicht aktiviert. `
    + `Bitte GAEB XML (X80–X86) nutzen oder als CSV importieren.`);
} else {
  setInfo(`Import erfolgreich: ${j.format} • ${j.count.toLocaleString("de-DE")} Positionen.`);
}

      setOpenRows({});
    } catch (e:any) {
      setDet(null); setInfo("Fehler: " + (e?.message || e));
    } finally { setBusy(false); }
  }

  function upsertToLV(rows: any[]) {
    let ins = 0, upd = 0;
    const cur = LV.list();
    const map = new Map(cur.map(x => [x.posNr, x] as const));
    for (const r of rows) {
      const posNr = String(r.posNr ?? "").trim();
      if (!posNr) continue; // skip ungültig
      const found = map.get(posNr);
      if (found) {
        LV.upsert({
          ...found,
          kurztext: found.kurztext || r.kurztext || "",
          einheit: found.einheit || r.einheit || "",
          preis: r.preis != null ? Number(r.preis) : found.preis,
          menge: Number(found.menge || 0) + Number(r.menge || 0),
        } as LVPos);
        upd++;
      } else {
        LV.upsert({
          id: crypto.randomUUID(),
          posNr,
          kurztext: r.kurztext || "",
          einheit: r.einheit || "",
          menge: Number(r.menge || 0),
          preis: r.preis != null ? Number(r.preis) : undefined,
          confidence: undefined,
        });
        ins++;
      }
    }
    setInfo(`Zum LV übernommen — neu: ${ins}, aktualisiert: ${upd}.`);
  }

  async function exportGAEB(fmt: Fmt) {
    setBusy(true); setInfo("");
    try {
      const rows = LV.list();
      const r = await fetch("http://localhost:4000/api/gaeb/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: fmt, rows })
      });
      if (!r.ok) { const j = await r.json().catch(()=>({})); throw new Error(j?.error || r.statusText); }
      const blob = await r.blob();
      const a = document.createElement("a"); const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = fmt === "GAEBXML" ? "lv.x86.xml" : (fmt==="GAEB2000" ? "lv.p81" : "lv.d81");
      a.click(); URL.revokeObjectURL(url);
      setInfo(`Export erstellt (${fmt}).`);
    } catch (e:any) { setInfo("Export-Fehler: " + (e?.message || e)); }
    finally { setBusy(false); }
  }

  function exportCSV(rows: any[]) {
    const head = "PosNr;Kurztext;ME;Menge;EP;Langtext";
    const body = rows.map(r => [
      r.posNr ?? "",
      JSON.stringify(r.kurztext ?? ""),
      r.einheit ?? "",
      r.menge ?? "",
      r.preis ?? "",
      JSON.stringify(r.langtext ?? "")
    ].join(";")).join("\n");
    const csv = head + "\n" + body;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "gaeb-preview.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const accept =
    ".D81,.D82,.D83,.D84,.D85,.D86," +
    ".P81,.P82,.P83,.P84,.P85,.P86,.P94," +
    ".X80,.X81,.X82,.X83,.X84,.X85,.X86,.X94,.XML," +
    ".DA11,.X31";

  /* ========= Validierung & Filter ========= */
  const lvNow = LV.list();
  const existingSet = useMemo(() => new Set(lvNow.map(r => String(r.posNr || ""))), [lvNow]);

  const issues = useMemo(() => {
    const iss: Record<number, { empty?: boolean; dupInFile?: boolean; existsInLV?: boolean; meSuggest?: string }> = {};
    if (!det?.rows) return iss;
    const seen = new Set<string>();
    det.rows.forEach((r: any, idx: number) => {
      const pos = String(r.posNr ?? "").trim();
      const lowME = String(r.einheit ?? "").trim().toLowerCase();
      const sug = ME_SUGGEST[lowME];
      if (!pos) iss[idx] = { ...(iss[idx]||{}), empty: true };
      if (pos) {
        if (seen.has(pos)) iss[idx] = { ...(iss[idx]||{}), dupInFile: true };
        seen.add(pos);
        if (existingSet.has(pos)) iss[idx] = { ...(iss[idx]||{}), existsInLV: true };
      }
      if (sug && sug !== r.einheit) iss[idx] = { ...(iss[idx]||{}), meSuggest: sug };
    });
    return iss;
  }, [det, existingSet]);

  const filteredPreview = useMemo(() => {
    let arr = preview;
    if (filterMode === "neu") {
      arr = preview.filter((_, i) => !issues[i]?.existsInLV);
    } else if (filterMode === "vorhanden") {
      arr = preview.filter((_, i) => !!issues[i]?.existsInLV);
    }
    return arr;
  }, [preview, filterMode, issues]);

  const counts = useMemo(() => {
    let leer = 0, dupl = 0, inLV = 0, suggest = 0;
    if (det?.rows) {
      det.rows.forEach((_: any, i: number) => {
        if (issues[i]?.empty) leer++;
        if (issues[i]?.dupInFile) dupl++;
        if (issues[i]?.existsInLV) inLV++;
        if (issues[i]?.meSuggest) suggest++;
      });
    }
    return { leer, dupl, inLV, suggest };
  }, [det, issues]);

  return (
    <div style={{ padding: 18 }}>
      <h2 style={{ marginTop: 0, marginBottom: 8 }}>GAEB Import / Export</h2>

      {/* Formate */}
      <div style={card}>
        <div style={cardHead}>Formate unterstützt</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {SUPPORTED.map(f => (
            <span key={f.code} style={tag}>
              <b>{f.label}</b> <span style={{ opacity: .7 }}>({f.sub})</span>
            </span>
          ))}
        </div>
      </div>

      {/* Import */}
      <div style={card}>
        <div style={cardHead}>Datei importieren</div>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <input type="file" accept={accept} onChange={e=>e.target.files?.[0] && onUpload(e.target.files[0])} disabled={busy}/>
          {det && (
            <>
              <span style={{ ...badge, ...badgeByFmt(det.format) }}>{det.format}</span>
              <span style={{ color:"#555" }}>{det.name}</span>
              <span style={{ color:"#999" }}>{det.count.toLocaleString("de-DE")} Positionen</span>
              <button onClick={()=>upsertToLV(det.rows)} disabled={busy}>→ Ins LV übernehmen (Upsert)</button>
              <button onClick={()=>nav("/kalkulation/manuell")}>In „Kalkulation manuell“ öffnen</button>
              <button onClick={()=>nav("/kalkulation/mit-ki")}>In „Kalkulation mit KI“ öffnen</button>
              <button onClick={()=>nav("/kalkulation/lv-import")}>In „LV erstellen & hochladen“ öffnen</button>
              <button onClick={()=>exportCSV(det.rows)}>CSV-Export (Vorschau)</button>
            </>
          )}
        </div>
        <div style={{ marginTop:8, color: info.startsWith("Fehler") ? "#b00" : "#0a7" }}>
          {busy ? "Bitte warten …" : (info || "Wählen Sie eine GAEB-Datei aus.")}
        </div>
      </div>

      {/* Validierung / Filter */}
      {det && (
        <div style={card}>
          <div style={cardHead}>Validierung & Filter</div>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <span style={{ ...pill, borderColor:"#d33", color:"#d33" }}>
              Leer PosNr: {counts.leer}
            </span>
            <span style={{ ...pill, borderColor:"#c80", color:"#c80" }}>
              Duplikate (Datei): {counts.dupl}
            </span>
            <span style={{ ...pill, borderColor:"#06c", color:"#06c" }}>
              Bereits im LV: {counts.inLV}
            </span>
            <span style={{ ...pill, borderColor:"#2a7", color:"#2a7" }}>
              ME-Vorschläge: {counts.suggest}
            </span>

            <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
              <button style={{ ...chip, ...(filterMode==="alle"?chipActive:{}) }} onClick={()=>setFilterMode("alle")}>Alle</button>
              <button style={{ ...chip, ...(filterMode==="neu"?chipActive:{}) }} onClick={()=>setFilterMode("neu")}>Nur neue</button>
              <button style={{ ...chip, ...(filterMode==="vorhanden"?chipActive:{}) }} onClick={()=>setFilterMode("vorhanden")}>Bereits im LV</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      <div style={card}>
        <div style={cardHead}>Vorschau (max. 500 Zeilen)</div>
        <div style={{ border:"1px solid #eee", borderRadius:8, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead style={{ background:"#fafafa" }}>
              <tr>
                {["PosNr","Kurztext","ME","Menge","EP","Langtext","Hinweise"].map((h,i)=>
                  <th key={i} style={th}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredPreview.map((r, i) => {
                const idx = preview.indexOf(r); // Mapping in issues
                const open = !!openRows[idx];
                const issue = issues[idx] || {};
                const rowStyle: React.CSSProperties = {
                  background: issue.empty ? "#fff5f5" : (issue.dupInFile ? "#fff9e6" : (issue.existsInLV ? "#f6faff" : (i%2?"#fcfcfc":"#fff")))
                };
                const meLow = String(r.einheit ?? "").trim().toLowerCase();
                const meSug = issue.meSuggest;

                return (
                  <tr key={i} style={rowStyle}>
                    <td style={td}>{r.posNr ?? ""}</td>
                    <td style={td}>{r.kurztext ?? ""}</td>
                    <td style={td}>
                      {r.einheit ?? ""}
                      {meSug && <span style={{ ...miniTag, marginLeft:6 }} title="Vorschlag zur Normalisierung">ME → {meSug}</span>}
                    </td>
                    <td style={{ ...td, textAlign:"right" }}>{r.menge ?? ""}</td>
                    <td style={{ ...td, textAlign:"right" }}>{r.preis ?? ""}</td>
                    <td style={td}>
                      {r.langtext ? (
                        <>
                          <button style={linkBtn} onClick={() => setOpenRows(s => ({ ...s, [idx]: !open }))}>
                            {open ? "−" : "+"} anzeigen
                          </button>
                          {open && <div style={{ marginTop:6, whiteSpace:"pre-wrap", color:"#444" }}>{String(r.langtext)}</div>}
                        </>
                      ) : <span style={{ color:"#999" }}>—</span>}
                    </td>
                    <td style={td}>
                      {issue.empty && <span style={{ ...miniTag, borderColor:"#d33", color:"#d33" }}>PosNr leer</span>}
                      {issue.dupInFile && <span style={{ ...miniTag, borderColor:"#c80", color:"#c80", marginLeft:6 }}>Duplikat (Datei)</span>}
                      {issue.existsInLV && <span style={{ ...miniTag, borderColor:"#06c", color:"#06c", marginLeft:6 }}>im LV vorhanden</span>}
                    </td>
                  </tr>
                );
              })}
              {!filteredPreview.length && (
                <tr><td colSpan={7} style={{ padding:10, color:"#777" }}>Keine Daten.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Export */}
      <div style={card}>
        <div style={cardHead}>Export aus aktuellem LV</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button onClick={()=>exportGAEB("GAEBXML")} disabled={busy}>GAEB XML 3.x (X80–X86)</button>
          <button onClick={()=>exportGAEB("GAEB2000")} disabled={busy}>GAEB 2000 (P81…)</button>
          <button onClick={()=>exportGAEB("GAEB90")} disabled={busy}>GAEB 90 (D81…)</button>
        </div>
        <div style={{ marginTop:8, color:"#666" }}>
          Hinweis: GAEB-Generatoren sind Platzhalter und werden später ersetzt.
        </div>
      </div>
    </div>
  );
}

/* ---------- UI ---------- */
const card: React.CSSProperties = { border:"1px solid #e6e6e6", borderRadius:10, padding:12, marginTop:12, background:"#fff" };
const cardHead: React.CSSProperties = { fontWeight:700, marginBottom:8, fontSize:15 };
const th: React.CSSProperties = { textAlign:"left", padding:"6px 8px", borderBottom:"1px solid #eee", whiteSpace:"nowrap" };
const td: React.CSSProperties = { padding:"6px 8px", borderBottom:"1px solid #f7f7f7", verticalAlign:"top" };
const tag: React.CSSProperties = { border:"1px solid #bbb", borderRadius:999, padding:"2px 10px", background:"#fafafa", fontSize:12 };
const badge: React.CSSProperties = { border:"1px solid #bbb", borderRadius:999, padding:"2px 10px", fontSize:12, background:"#fff" };
const miniTag: React.CSSProperties = { border:"1px solid #bbb", borderRadius:999, padding:"0 6px", fontSize:11, background:"#fff" };
const pill: React.CSSProperties = { border:"1px solid #ccc", borderRadius:999, padding:"2px 10px", fontSize:12, background:"#fff" };
const chip: React.CSSProperties = { border:"1px solid #ddd", background:"#fff", borderRadius:999, padding:"4px 10px", cursor:"pointer" };
const chipActive: React.CSSProperties = { borderColor:"#2b7", background:"#f2fffa", fontWeight:600 };
const linkBtn: React.CSSProperties = { border:"none", background:"transparent", padding:0, color:"#0a6", cursor:"pointer" };

function badgeByFmt(fmt: string): React.CSSProperties {
  const map: Record<string, string> = { GAEB90:"#2a7", GAEB2000:"#06c", GAEBXML:"#a50", DA:"#888" };
  const c = map[fmt] || "#555";
  return { borderColor: c, color: c, background: "#fff" };
}
