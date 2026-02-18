// src/pages/pdf/PDFViewer.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { saveCadExport } from "../../utils/cadImport";
import { useProject } from "../../store/useProject";
import { usePersistedState } from "../../store/persist";

import * as pdfjs from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.mjs";

/* ===========================================
   Tipi
=========================================== */
type WordItem = {
  str: string;
  x: number; y: number; w: number; h: number; // px canvas
};

type LineItem = {
  id: string;
  page: number;
  text: string;
  x: number; y: number; w: number; h: number; // bbox della riga
  value?: { kind: "AREA" | "LINE"; amount: number };
};

type LogRow = {
  id: string;
  page: number;
  label: string;
  kind: "AREA" | "LINE";
  value: number;
  unit: "m2" | "m";
  when: string;
};

type SavedPDF = {
  id: string;
  name: string;
  source: "url" | "file";
  url?: string;     // se source === "url"
  blobUrl?: string; // se source === "file" (oggetto URL, valido in sessione)
  pages: number;
  addedAt: number;
};

/* ===========================================
   Riconoscimento quantità
   - supporta: m, lm, lfm, m², m2, qm, m^2
   - numeri con migliaia/decimali misti
=========================================== */
const RX_LEN  = /(-?\d{1,3}(?:[ .'\u00A0]\d{3})*(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?)[ \t]*?(?:m(?![^\s\d])|lm|lfm|lfdm)\b/i;
const RX_AREA = /(-?\d{1,3}(?:[ .'\u00A0]\d{3})*(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?)[ \t]*?(?:m²|m2|qm|m\^2)\b/i;

function normalizeNumberLike(nraw: string): number {
  const lastDot = nraw.lastIndexOf(".");
  const lastComma = nraw.lastIndexOf(",");
  let dec = ".";
  if (lastComma > lastDot) dec = ",";

  let s = nraw.replace(/[ '\u00A0]/g, "");
  if (dec === ",") {
    s = s.replace(/\./g, "");
    s = s.replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const v = Number(s);
  return isFinite(v) ? v : 0;
}

function parseQuantity(line: string): { kind: "LINE" | "AREA"; amount: number } | null {
  const a = line.replace(/\u00A0/g, " ").trim();
  const area = a.match(RX_AREA);
  if (area)  return { kind: "AREA", amount: normalizeNumberLike(area[1]) };
  const len = a.match(RX_LEN);
  if (len)   return { kind: "LINE", amount: normalizeNumberLike(len[1]) };
  return null;
}

/* ===========================================
   Stili tabellari coerenti
=========================================== */
const th: React.CSSProperties = {
  textAlign:"left",
  padding:"8px 10px",
  borderBottom:"1px solid var(--line)",
  fontSize:13,
  whiteSpace:"nowrap",
  background:"#0e141b",
  color:"#e5e7eb",
};
const td: React.CSSProperties = {
  padding:"8px 10px",
  borderBottom:"1px solid #1f2937",
  fontSize:13,
  color:"#dbe1ea"
};

const chip: React.CSSProperties = {
  display:"inline-flex",
  alignItems:"center",
  gap:6,
  border:"1px solid #263040",
  background:"#0f1620",
  color:"#dbe1ea",
  borderRadius:8,
  padding:"6px 8px",
  cursor:"pointer",
};

/* ===========================================
   Component
=========================================== */
export default function PDFViewer() {
  const navigate = useNavigate();
  const { projectId } = useProject();

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = React.useRef<HTMLDivElement | null>(null);

  // ⬇️ IMPORTANTE: il documento PDF non viene più "persistito" (non serializzabile)
  const [pdf, setPdf] = React.useState<pdfjs.PDFDocumentProxy | null>(null);

  const [page, setPage] = React.useState<pdfjs.PDFPageProxy | null>(null);
  const [pageNum, setPageNum] = usePersistedState<number>(1, { key:"pdf.pageNum", projectScoped:true });
  const [scale, setScale] = usePersistedState<number>(1.2, { key:"pdf.scale", projectScoped:true });
  const [status, setStatus] = usePersistedState<string>("Kein PDF geladen", { key:"pdf.status", projectScoped:true });

  // Righe estratte
  const [lines, setLines] = React.useState<LineItem[]>([]);
  const [selectedId, setSelectedId] = usePersistedState<string | null>(null, { key:"pdf.selected", projectScoped:true });
  const selected = lines.find(l => l.id === selectedId) || null;

  // Stato: righe inserite/esportate + evidenza rossa
  const [exportedIds, setExportedIds] = usePersistedState<string[]>([], { key:"pdf.exportedIds", projectScoped:true });
  const exportedSet = React.useMemo(()=> new Set(exportedIds), [exportedIds]);

  const [log, setLog] = usePersistedState<LogRow[]>([], { key:"pdf.log", projectScoped:true });

  // Libreria PDF caricati per progetto (persistente)
  const [library, setLibrary] = usePersistedState<SavedPDF[]>([], { key:"pdf.library", projectScoped:true });

  // NEW: PDF attivo (persistente). Serve a riaprire in automatico il viewer
  const [activeId, setActiveId] = usePersistedState<string | null>(null, { key:"pdf.activeId", projectScoped:true });

  // URL loader input
  const [url, setUrl] = React.useState("");

  // Carica automaticamente da query ?src=
  React.useEffect(() => {
    const q = new URLSearchParams(location.search);
    const src = q.get("src");
    if (src) openFromUrl(src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Se torno alla pagina e ho un attivo ma pdf nullo, riapro automaticamente
  React.useEffect(() => {
    if (!pdf && activeId) {
      const it = library.find(x => x.id === activeId);
      if (it) openLibraryItem(it);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, activeId, library]);

  /* ========== OPERAZIONI DI CARICAMENTO ========== */
  async function openFromFile(f: File) {
    try {
      setStatus("Lade PDF aus Datei …");
      const buf = await f.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: buf }).promise;

      setPdf(doc);
      await setPageSafe(doc, 1);
      setStatus(`Geladen: ${f.name} (${doc.numPages} Seiten)`);
      setExportedIds([]); setLog([]); setSelectedId(null);

      // Registra in libreria (URL di sessione)
      const blobUrl = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
      const item: SavedPDF = {
        id: `file:${Date.now()}:${Math.random().toString(36).slice(2,8)}`,
        name: f.name,
        source: "file",
        blobUrl,
        pages: doc.numPages,
        addedAt: Date.now(),
      };
      setLibrary(prev => [item, ...prev]);
      setActiveId(item.id); // ⬅️ segno come attivo
    } catch (e) {
      console.error(e);
      setStatus("Fehler beim Laden der Datei");
    }
  }

  async function openFromUrl(u: string, nameHint?: string) {
    try {
      setStatus("Lade PDF aus URL …");
      const doc = await pdfjs.getDocument(u).promise;

      setPdf(doc);
      await setPageSafe(doc, 1);
      setStatus(`Geladen: ${nameHint || u} (${doc.numPages} Seiten)`);
      setExportedIds([]); setLog([]); setSelectedId(null);

      // Registra in libreria (persistente)
      const clean = u;
      const item: SavedPDF = {
        id: `url:${clean}`,
        name: nameHint || (clean.split("/").pop() || "datei.pdf"),
        source: "url",
        url: clean,
        pages: doc.numPages,
        addedAt: Date.now(),
      };
      setLibrary(prev => {
        const others = prev.filter(x => x.id !== item.id);
        return [item, ...others];
      });
      setActiveId(item.id); // ⬅️ segno come attivo
    } catch (e) {
      console.error(e);
      setStatus("Fehler beim Laden der URL");
    }
  }

  async function setPageSafe(doc: pdfjs.PDFDocumentProxy, n: number) {
    const nn = Math.max(1, Math.min(doc.numPages, n));
    const p = await doc.getPage(nn);
    setPage(p);
    if (pageNum !== nn) { setPageNum(nn); setSelectedId(null); }
  }

  /* ========== RENDER DELLA PAGINA + TEXT LAYER ========== */
  React.useEffect(() => {
    (async () => {
      const p = page, c = canvasRef.current, tl = textLayerRef.current;
      if (!p || !c || !tl) return;

      const vp = p.getViewport({ scale });
      c.width = vp.width; c.height = vp.height;

      // Canvas render
      const ctx = c.getContext("2d")!;
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,c.width,c.height);
      await p.render({ canvasContext: ctx, viewport: vp }).promise;

      // Text layer
      tl.innerHTML = "";
      Object.assign(tl.style, { width:`${vp.width}px`, height:`${vp.height}px`, position:"absolute", left:"0", top:"0" });

      // 1) Estrai parole
      const content = await p.getTextContent();
      const words: WordItem[] = [];
      (content.items as any[]).forEach(it => {
        const str = String(it.str || "");
        const trm = it.transform as number[]; // [a,b,c,d,e,f]
        const fontH = Math.hypot(trm[2], trm[3]) * scale;
        const x = trm[4] * scale;
        const y = vp.height - trm[5] * scale - fontH;
        const w = (it.width as number) * scale;
        const h = fontH;
        if (str.trim()) words.push({ str, x, y, w, h });
      });

      // 2) Raggruppa in righe
      const TOL_Y = 4; // px
      words.sort((a,b)=> (a.y===b.y ? a.x-b.x : a.y-b.y));
      const groups: WordItem[][] = [];
      for (const w of words) {
        const last = groups[groups.length-1];
        if (!last) { groups.push([w]); continue; }
        const yMed = last.reduce((s, t)=>s+t.y,0)/last.length;
        if (Math.abs(w.y - yMed) <= TOL_Y) {
          last.push(w);
        } else {
          groups.push([w]);
        }
      }

      // 3) Costruisci righe + parsing quantità
      const nextLines: LineItem[] = [];
      groups.forEach((g, idx) => {
        g.sort((a,b)=>a.x-b.x);
        const text = g.map(w=>w.str).join(" ");
        const x = Math.min(...g.map(w=>w.x));
        const y = Math.min(...g.map(w=>w.y));
        const w = Math.max(...g.map(w=>w.x + w.w)) - x;
        const h = Math.max(...g.map(w=>w.h));
        const pad = 6;
        const rec = parseQuantity(text);

        nextLines.push({
          id: `P${pageNum}_L${idx}`,
          page: pageNum,
          text,
          x: Math.max(0, x - pad),
          y: Math.max(0, y - pad/2),
          w: w + pad*2,
          h: h + pad,
          value: rec || undefined,
        });
      });

      setLines(nextLines);

      // 4) Disegna hint + hitbox
      nextLines.forEach(L => {
        const hint = document.createElement("div");
        hint.dataset.id = L.id;
        Object.assign(hint.style, {
          position:"absolute", left:`${L.x}px`, top:`${L.y}px`,
          width:`${L.w}px`, height:`${L.h}px`
        });

        const isExported = exportedSet.has(L.id);
        if (isExported) {
          hint.style.background = "rgba(239,68,68,.18)";
          hint.style.outline = "1px solid rgba(239,68,68,.5)";
        } else if (L.value) {
          const col = L.value.kind === "AREA" ? "22,163,74" : "59,130,246";
          hint.style.background = `rgba(${col},.18)`;
          hint.style.outline = `1px solid rgba(${col},.45)`;
        }

        const hit = document.createElement("div");
        hit.dataset.id = L.id;
        Object.assign(hit.style, {
          position:"absolute", left:`${L.x}px`, top:`${L.y}px`,
          width:`${L.w}px`, height:`${L.h}px`,
          opacity:"0.001", pointerEvents:"auto"
        });

        tl.appendChild(hint);
        tl.appendChild(hit);
      });

      const onClick = (ev: MouseEvent) => {
        const el = ev.target as HTMLElement;
        const id = el?.dataset?.id;
        if (id) setSelectedId(id);
      };
      tl.addEventListener("click", onClick);
      return () => tl.removeEventListener("click", onClick);
    })();
  }, [page, scale, pageNum, exportedSet, setSelectedId]);

  /* ========== Navigazione pagina ========== */
  async function goto(n: number) {
    if (!pdf) return;
    await setPageSafe(pdf, n);
  }

  /* ========== Flusso stile CAD: Einfügen + export per riga ========== */
  function insertCurrent() {
    if (!selected) { alert("Seleziona una riga sul PDF."); return; }
    const rec = selected.value || parseQuantity(selected.text);
    if (!rec || !isFinite(rec.amount) || rec.amount === 0) {
      alert("Nessuna quantità riconosciuta in questa riga (supportati: m / lm / lfm / m² / m2 / qm).");
      return;
    }
    // rosso nel viewer (persistenza)
    setExportedIds(prev => {
      const next = new Set(prev);
      next.add(selected.id);
      return Array.from(next);
    });

    const row: LogRow = {
      id: selected.id,
      page: selected.page,
      label: (selected.text.length > 180 ? selected.text.slice(0,180)+"…" : selected.text) || `PDF p.${pageNum}`,
      kind: rec.kind,
      value: rec.amount,
      unit: rec.kind === "AREA" ? "m2" : "m",
      when: new Date().toLocaleString(),
    };
    setLog(prev => [row, ...prev]);
  }

  function exportRow(r: LogRow, target: "aufmasseditor" | "kalkulation") {
    saveCadExport({
      target,
      kind: r.kind,
      layer: `PDF p.${r.page}`,
      label: r.label,
      area_m2: r.kind === "AREA" ? r.value : 0,
      length_m: r.kind === "LINE" ? r.value : 0,
      points: [],
    });
    const to = target === "aufmasseditor"
      ? "/mengenermittlung/aufmasseditor?import=cad"
      : "/kalkulation/manuell?import=cad";
    navigate(to);
  }

  /* ========== Export file ========== */
  function exportPNG(){
    if(!canvasRef.current) return;
    const url = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a"); a.href = url; a.download = "pdf-view.png"; a.click();
  }
  function exportCSV(){
    const rows:string[] = ["#;Label;Tipo;Valore;Unità;Pagina;Quando"];
    log.forEach((r,i)=>rows.push([String(i+1), csvSafe(r.label), r.kind, String(r.value), r.unit, String(r.page), r.when].join(";")));
    downloadBlob(rows.join("\n"), "pdf-inserimenti.csv", "text/csv;charset=utf-8");
  }

  /* ========== Libreria PDF (persistente per progetto) ========== */
  function openLibraryItem(it: SavedPDF) {
    if (it.source === "url" && it.url) {
      openFromUrl(it.url, it.name);
    } else if (it.source === "file" && it.blobUrl) {
      openFromUrl(it.blobUrl, it.name);
    }
  }
  function removeLibraryItem(id: string) {
    setLibrary(prev => prev.filter(x => x.id !== id));
    if (activeId === id) setActiveId(null);
  }

  /* ========== UI ========== */
  return (
    <div style={{ display:"grid", gap:12, padding:12, background:"#0b0d12", color:"#e5e7eb", minHeight:"100vh" }}>
      {/* Barra top: caricamento + stato */}
      <div className="card" style={{ display:"flex", gap:8, alignItems:"center", padding:"8px 10px", background:"#111827", border:"1px solid #1f2937", borderRadius:8 }}>
        <b style={{ color:"#f3f4f6" }}>PDF:</b>
        <input type="file" accept="application/pdf"
               onChange={e => { const f=e.currentTarget.files?.[0]; if(f) openFromFile(f); }} />
        <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…/file.pdf"
               style={{ border:"1px solid #374151", background:"#0f1620", color:"#e5e7eb", borderRadius:6, padding:"6px 8px", width:360 }} />
        <button className="btn" onClick={()=>url && openFromUrl(url)} style={btn()}>URL laden</button>
        <div style={{ flex:1 }} />
        <span style={{ opacity:.8 }}>{status}</span>
      </div>

      {/* Viewer */}
      <div className="card" style={{ position:"relative", border:"1px solid #141821", borderRadius:8, overflow:"auto", background:"#0f1115" }}>
        <div style={{ position:"relative", margin:10 }}>
          <canvas ref={canvasRef} style={{ display:"block" }} />
          <div ref={textLayerRef} />
          {selected && (
            <div style={{
              position:"absolute",
              left:selected.x, top:selected.y, width:selected.w, height:selected.h,
              outline:"2px solid #22d3ee", pointerEvents:"none"
            }}/>
          )}
        </div>
        {/* controlli pagina/zoom */}
        <div style={{ position:"absolute", right:10, top:10, display:"flex", gap:6 }}>
          <button className="btn" onClick={()=>setScale(s=>Math.min(4, s*1.15))} style={btn()}>Zoom +</button>
          <button className="btn" onClick={()=>setScale(s=>Math.max(0.25, s/1.15))} style={btn()}>Zoom −</button>
          <button className="btn" onClick={()=>pdf && setPageSafe(pdf, pageNum-1)} disabled={!pdf || pageNum<=1} style={btn()}>‹</button>
          <div className="btn" style={{ ...btn(true), pointerEvents:"none" }}>{pageNum}{pdf ? ` / ${pdf.numPages}` : ""}</div>
          <button className="btn" onClick={()=>pdf && setPageSafe(pdf, pageNum+1)} disabled={!pdf || (pdf && pageNum>=pdf.numPages)} style={btn()}>›</button>
        </div>
      </div>

      {/* Einfügen + tabella inserimenti */}
      <div className="card" style={{ padding:10, display:"grid", gap:10, background:"#0f1115", border:"1px solid #1f2937", borderRadius:8 }}>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <b>Selezione corrente:</b>
          <div style={{ flex:1, opacity:.9 }}>
            {selected
              ? (selected.value
                   ? `${selected.value.kind==="AREA" ? selected.value.amount+" m²" : selected.value.amount+" m"}`
                   : "— nessuna quantità riconosciuta —")
              : "— nessuna riga selezionata —"}
          </div>
          <button className="btn" onClick={insertCurrent} disabled={!selected} style={btn()}>Einfügen</button>
          <div style={{ width:1, height:24, background:"#253042" }} />
          <button className="btn" onClick={exportPNG} style={btn()}>Export PNG</button>
          <button className="btn" onClick={exportCSV} style={btn()}>Export CSV</button>
        </div>

        <div>
          <b>Elementi inseriti:</b>
          {log.length===0 && <div style={{ opacity:.7, marginTop:6 }}>Ancora nessun inserimento.</div>}
          {log.length>0 && (
            <table style={{ width:"100%", borderCollapse:"collapse", marginTop:6 }}>
              <thead>
                <tr>
                  <th style={th}>#</th>
                  <th style={th}>Label</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Valore</th>
                  <th style={th}>Unità</th>
                  <th style={th}>Pagina</th>
                  <th style={th}>Quando</th>
                  <th style={th}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {log.map((r, i) => (
                  <tr key={r.when + r.id}>
                    <td style={td}>{i+1}</td>
                    <td style={{ ...td, maxWidth:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.label}</td>
                    <td style={td}>{r.kind}</td>
                    <td style={td}>{r.value}</td>
                    <td style={td}>{r.unit}</td>
                    <td style={td}>{r.page}</td>
                    <td style={td}>{r.when}</td>
                    <td style={td}>
                      <div style={{ display:"flex", gap:6 }}>
                        <button className="btn" onClick={()=>exportRow(r,"aufmasseditor")} style={btn()}>→ Aufmaß</button>
                        <button className="btn" onClick={()=>exportRow(r,"kalkulation")} style={btn()}>→ Kalkulation</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Libreria PDF memorizzati (persistente) */}
      <div className="card" style={{ padding:10, background:"#0f1115", border:"1px solid #1f2937", borderRadius:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <b>Libreria PDF (Projekt: {projectId || "—"})</b>
          <div style={{ opacity:.7 }}>— tutti i file aperti restano qui; clicca per riaprirli</div>
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:10 }}>
          {library.length === 0 && <div style={{ opacity:.65 }}>Nessun PDF memorizzato.</div>}
          {library.map(item => (
            <div key={item.id} style={chip} onClick={()=>openLibraryItem(item)} title={item.name}>
              <span style={{ fontWeight:600, maxWidth:260, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {item.name}{activeId===item.id ? " • (attivo)" : ""}
              </span>
              <span style={{ opacity:.8 }}>• {item.pages} p.</span>
              <button
                className="btn"
                onClick={(e)=>{ e.stopPropagation(); removeLibraryItem(item.id); }}
                style={{ ...btn(), padding:"4px 6px" }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===========================================
   Helpers
=========================================== */
function btn(neutral = false): React.CSSProperties {
  return {
    background: neutral ? "#111827" : "#0f1620",
    border: "1px solid #263040",
    color: "#e5e7eb",
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer"
  };
}

function downloadBlob(text: string, name: string, type: string) {
  const blob = new Blob([text], { type }); const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function csvSafe(s: string) {
  if (/[;\n"]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
}
