import React from "react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import QRCode from "qrcode";
import * as XLSX from "xlsx";
import { useKiSuggest } from "./useKiSuggest";
import { LV, LVPos } from "./store.lv";

/* ====== STILI ====== */
const th: React.CSSProperties = { textAlign:"left", padding:"8px 10px", borderBottom:"1px solid var(--line)", fontSize:13, whiteSpace:"nowrap" };
const td: React.CSSProperties = { padding:"6px 10px", borderBottom:"1px solid var(--line)", fontSize:13, verticalAlign:"middle" };
const inp: React.CSSProperties = { border:"1px solid var(--line)", borderRadius:6, padding:"6px 8px", fontSize:13 };
const lbl: React.CSSProperties = { fontSize:12, opacity:.8 };

/* ====== COMPONENTE ====== */
export default function AutoLV() {
  const [rows, setRows] = React.useState<(LVPos & { rabatt?: number })[]>([]);
  const { suggest, loading } = useKiSuggest();

  // Finanza generale
  const [mwst, setMwst] = React.useState(19);
  const [aufschlag, setAufschlag] = React.useState(10);

  // Dati intestazione
  const [company, setCompany] = React.useState({
    name: "RLC Bausoftware GmbH",
    address: "Musterstraße 12, 80333 München",
    phone: "+49 89 123456",
    email: "info@rlc-bau.de",
    logoUrl: "/rlc-logo.png"
  });
  const [client, setClient] = React.useState({
    name: "Muster Bau GmbH",
    address: "Hauptstraße 5, 50667 Köln"
  });
  const [offer, setOffer] = React.useState({
    number: `ANG-${new Date().toISOString().slice(0,10).replace(/-/g,"")}`,
    place: "München",
    notes: "Zahlungsbedingungen: 30 Tage netto. Angebot gültig 30 Tage."
  });
  const [watermark, setWatermark] = React.useState(true);

  // Firme digitali (+ nomi)
  const [sigBauleiter, setSigBauleiter] = React.useState<string | null>(null);
  const [sigAuftraggeber, setSigAuftraggeber] = React.useState<string | null>(null);
  const [bauleiterName, setBauleiterName] = React.useState("Bauleiter");
  const [auftraggeberName, setAuftraggeberName] = React.useState("Auftraggeber");

  // Sconti/Markup capitolo
  const [kapRabatt, setKapRabatt] = React.useState<Record<string, number>>({});
  const [kapMarkup, setKapMarkup] = React.useState<Record<string, number>>({});

  // Colori PDF
  const [pdfColors, setPdfColors] = React.useState<{ head:[number,number,number]; chap:[number,number,number] }>(
    { head: [60,120,216], chap: [220,220,220] }
  );

  // Email
  const [mail, setMail] = React.useState({
    to:"", subject:"Ihr Angebot",
    body:"Guten Tag,\nim Anhang finden Sie unser Angebot als PDF.\nMit freundlichen Grüßen\nRLC Bausoftware"
  });

  React.useEffect(() => { setRows(LV.list()); }, []);

  /* ===== Raggruppamento capitoli ===== */
  const chapters = React.useMemo(() => {
    const map = new Map<string, (LVPos & { rabatt?: number })[]>();
    for (const r of rows) {
      const ch = getChapter(r.posNr);
      if (!map.has(ch)) map.set(ch, []);
      map.get(ch)!.push(r);
    }
    return map;
  }, [rows]);

  React.useEffect(() => {
    const nextR = { ...kapRabatt };
    const nextM = { ...kapMarkup };
    for (const ch of chapters.keys()) { if (nextR[ch]==null) nextR[ch]=0; if (nextM[ch]==null) nextM[ch]=0; }
    for (const k of Object.keys(nextR)) if (!chapters.has(k)) delete nextR[k];
    for (const k of Object.keys(nextM)) if (!chapters.has(k)) delete nextM[k];
    setKapRabatt(nextR); setKapMarkup(nextM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters.size]);

  /* ===== KPI ===== */
  const coverage = React.useMemo(() => {
    const priced = rows.filter(r => typeof r.preis === "number").length;
    return { priced, total: rows.length, pct: rows.length ? Math.round(priced / rows.length * 100) : 0 };
  }, [rows]);
  const avgConfidence = React.useMemo(() => {
    if (!rows.length) return 0;
    return rows.reduce((s, r) => s + (r.confidence ?? 0), 0) / rows.length;
  }, [rows]);

  /* ===== Calcoli capitolo/totali ===== */
  const kapTotals = React.useMemo(() => {
    const out: Record<string, { sumRaw:number; sumAfterLineDisc:number; rabattKap:number; sumAfterKap:number; markupKap:number; sumFinalKap:number }> = {};
    chapters.forEach((list, ch) => {
      const sumRaw = list.reduce((s, r) => s + lineRaw(r), 0);
      const sumAfterLineDisc = list.reduce((s, r) => s + lineAfterLineDiscount(r), 0);
      const rabattKap = kapRabatt[ch] || 0;
      const sumAfterKap = sumAfterLineDisc * (1 - rabattKap / 100);
      const markupKap = kapMarkup[ch] || 0;
      const sumFinalKap = sumAfterKap * (1 + markupKap / 100);
      out[ch] = { sumRaw, sumAfterLineDisc, rabattKap, sumAfterKap, markupKap, sumFinalKap };
    });
    return out;
  }, [chapters, kapRabatt, kapMarkup]);

  const netto = React.useMemo(() => Object.values(kapTotals).reduce((s, t) => s + t.sumFinalKap, 0), [kapTotals]);
  const aufschlagWert = netto * (aufschlag / 100);
  const brutto = (netto + aufschlagWert) * (1 + mwst / 100);

  /* ===== Azioni ===== */
  async function calcAll() {
    const updated: (LVPos & { rabatt?: number })[] = [];
    for (const r of rows) {
      const res = await suggest(r.kurztext, r.einheit);
      updated.push({ ...r, preis: res.unitPrice, confidence: res.confidence });
    }
    setRows(updated);
    LV.bulkUpsert(updated);
  }

  const addRow = () => {
    const n: LVPos & { rabatt?: number } = { id: crypto.randomUUID(), posNr: "", kurztext: "", einheit: "", menge: 0, rabatt: 0 };
    const next = [n, ...rows]; setRows(next); LV.bulkUpsert(next);
  };
  const delRow = (id: string) => { const next = rows.filter(r => r.id !== id); setRows(next); LV.remove(id); };
  const update = (id: string, patch: Partial<LVPos> & { rabatt?: number }) => {
    const next = rows.map(r => r.id === id ? { ...r, ...patch } : r);
    setRows(next);
    const row = next.find(r => r.id === id)!;
    LV.upsert(row);
  };

  /* ===== Render ===== */
  return (
    <div style={{ display:"grid", gridTemplateRows:"auto auto auto auto 1fr auto auto auto auto", gap:12, padding:12 }}>
      {/* Header + Azienda/Cliente */}
      <div className="card" style={{ padding:"10px 16px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"110px 1fr", gap:8, alignItems:"center" }}>
          <img src={company.logoUrl} alt="Logo" style={{ height:50, objectFit:"contain" }}/>
          <div>
            <div style={{ fontWeight:800 }}>{company.name}</div>
            <div style={{ opacity:.8, fontSize:13 }}>{company.address}</div>
            <div style={{ opacity:.8, fontSize:13 }}>{company.phone} · {company.email}</div>
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"100px 1fr 100px 1fr", gap:8, alignItems:"center" }}>
          <label style={lbl}>Angebot Nr.</label>
          <input style={inp} value={offer.number} onChange={e=>setOffer({ ...offer, number:e.target.value })}/>
          <label style={lbl}>Ort</label>
          <input style={inp} value={offer.place} onChange={e=>setOffer({ ...offer, place:e.target.value })}/>
          <label style={lbl}>Watermark</label>
          <label style={{ display:"flex", alignItems:"center", gap:6 }}>
            <input type="checkbox" checked={watermark} onChange={e=>setWatermark(e.target.checked)}/> Powered by OpenAI
          </label>
          <label style={lbl}>PDF Farben</label>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <input type="color" onChange={e=>setPdfColors(c=>({ ...c, head: hexToRgb(e.target.value) as any }))}/>
            <span style={{opacity:.7,fontSize:12}}>Tabellenkopf</span>
            <input type="color" onChange={e=>setPdfColors(c=>({ ...c, chap: hexToRgb(e.target.value) as any }))}/>
            <span style={{opacity:.7,fontSize:12}}>Kapitel-Zeile</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding:"10px 16px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div>
          <div style={{ fontWeight:700, marginBottom:6 }}>Kunde</div>
          <div style={{ display:"grid", gridTemplateColumns:"90px 1fr", gap:8 }}>
            <label style={lbl}>Firma</label><input style={inp} value={client.name} onChange={e=>setClient({ ...client, name:e.target.value })}/>
            <label style={lbl}>Adresse</label><input style={inp} value={client.address} onChange={e=>setClient({ ...client, address:e.target.value })}/>
          </div>
        </div>
        <div>
          <div style={{ fontWeight:700, marginBottom:6 }}>Zahlung / Notizen</div>
          <textarea style={{ ...inp, minHeight:64 }} value={offer.notes} onChange={e=>setOffer({ ...offer, notes:e.target.value })}/>
        </div>
      </div>

      {/* Azioni KI */}
      <div className="card" style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px" }}>
        <div style={{ fontWeight:700, fontSize:16 }}>Kalkulation mit KI – Powered by OpenAI</div>
        <div style={{ flex:1 }}/>
        <button className="btn" onClick={addRow}>+ Position</button>
        <button className="btn" onClick={calcAll} disabled={loading || rows.length === 0}>{loading ? "Berechne…" : "KI-Kalkulation starten"}</button>
      </div>

      {/* KPI */}
      <div className="card" style={{ padding:"10px 16px", display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
        <Kpi title="Qualität (avg. Confidence)"><ProgressBar value={avgConfidence*100}/><small style={{ opacity:.8 }}>Ø {(avgConfidence*100).toFixed(0)}%</small></Kpi>
        <Kpi title="Abdeckung (KI-Preis)"><ProgressBar value={coverage.pct}/><small style={{ opacity:.8 }}>{coverage.priced}/{coverage.total} Pos. ({coverage.pct}%)</small></Kpi>
        <Kpi title="Gesamt netto"><div style={{ fontWeight:700, fontSize:16 }}>{netto.toFixed(2)} €</div></Kpi>
        <Kpi title="Gesamt brutto (inkl. Aufschlag & MwSt)"><div style={{ fontWeight:700, fontSize:16 }}>{brutto.toFixed(2)} €</div></Kpi>
      </div>

      {/* Pannello capitolo */}
      <div className="card" style={{ padding:"10px 16px" }}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Kapitel: Rabatt & Markup (%)</div>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          {Array.from(chapters.keys()).map(ch => (
            <div key={ch} style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:26, textAlign:"center", fontWeight:700 }}>{ch}</div>
              <span style={{opacity:.7}}>Rabatt</span>
              <input type="number" style={{ ...inp, width:70 }} value={kapRabatt[ch] ?? 0}
                     onChange={e=>setKapRabatt({ ...kapRabatt, [ch]: +e.target.value })}/>%
              <span style={{opacity:.7}}>Markup</span>
              <input type="number" style={{ ...inp, width:70 }} value={kapMarkup[ch] ?? 0}
                     onChange={e=>setKapMarkup({ ...kapMarkup, [ch]: +e.target.value })}/>%
              <div style={{ opacity:.7, fontSize:12 }}>
                Σ: {(kapTotals[ch]?.sumFinalKap ?? 0).toFixed(2)} €
              </div>
            </div>
          ))}
          {chapters.size===0 && <div style={{ opacity:.6 }}>Noch keine Kapitel.</div>}
        </div>
      </div>

      {/* Tabella LV */}
      <div className="card" style={{ overflow:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
          <tr>
            <th style={th}>Kap.</th>
            <th style={th}>Pos-Nr</th>
            <th style={th}>Kurztext</th>
            <th style={th}>Einheit</th>
            <th style={th}>Menge</th>
            <th style={th}>KI-Preis [€]</th>
            <th style={th}>Rabatt %</th>
            <th style={th}>Zeilen-€ (netto)</th>
            <th style={th}>Confidence</th>
            <th style={th}></th>
          </tr>
          </thead>
          <tbody>
          {Array.from(chapters.entries()).map(([ch, list]) => (
            <React.Fragment key={ch}>
              <tr>
                <td style={{ ...td, background:"#f5f7fb", fontWeight:700 }} colSpan={10}>
                  Kapitel {ch} · Rabatt: {kapTotals[ch]?.rabattKap ?? 0}% · Markup: {kapTotals[ch]?.markupKap ?? 0}% ·
                  Σ Roh: {(kapTotals[ch]?.sumRaw ?? 0).toFixed(2)} € ·
                  Σ nach Zeilenrabatt: {(kapTotals[ch]?.sumAfterLineDisc ?? 0).toFixed(2)} € ·
                  Σ nach Kap.-Rabatt: {(kapTotals[ch]?.sumAfterKap ?? 0).toFixed(2)} € ·
                  Σ Kapitel (final): {(kapTotals[ch]?.sumFinalKap ?? 0).toFixed(2)} €
                </td>
              </tr>

              {list.map(r => {
                const status = r.confidence != null ? (r.confidence > 0.85 ? "ok" : r.confidence > 0.65 ? "warn" : "low") : undefined;
                const raw = lineRaw(r);
                const afterLine = lineAfterLineDiscount(r);
                return (
                  <tr key={r.id} style={{ background:
                    status==="ok"?"#e7f9ee":status==="warn"?"#fff7e0":status==="low"?"#fde8e8":undefined }}>
                    <td style={td} title="Kapitel">{ch}</td>
                    <td style={td}><input style={{ ...inp, width:90 }} value={r.posNr} onChange={e => update(r.id, { posNr:e.target.value })}/></td>
                    <td style={td}><input style={{ ...inp, width:"100%" }} value={r.kurztext} onChange={e => update(r.id, { kurztext:e.target.value })}/></td>
                    <td style={td}><input style={{ ...inp, width:60 }} value={r.einheit} onChange={e => update(r.id, { einheit:e.target.value })}/></td>
                    <td style={td}><input style={{ ...inp, width:80, textAlign:"right" }} type="number" value={r.menge} onChange={e => update(r.id, { menge:+e.target.value })}/></td>
                    <td style={td}>{r.preis?.toFixed(2) ?? "—"}</td>
                    <td style={td}>
                      <input type="number" style={{ ...inp, width:80 }} value={r.rabatt ?? 0}
                             onChange={e => update(r.id, { rabatt:+e.target.value })}/>
                    </td>
                    <td style={td}>{afterLine.toFixed(2)} € <span style={{ opacity:.6, fontSize:12 }}>({raw.toFixed(2)})</span></td>
                    <td style={td}>{r.confidence != null ? (r.confidence * 100).toFixed(0) + " %" : "—"}</td>
                    <td style={{ ...td, whiteSpace:"nowrap" }}>
                      <button className="btn" onClick={() => delRow(r.id)}>Löschen</button>
                    </td>
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
          {rows.length === 0 && <tr><td style={{ ...td, opacity:.6 }} colSpan={10}>Keine Positionen.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Export */}
      <div className="card" style={{ padding:"10px 16px", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <button className="btn" onClick={() => download("text/csv;charset=utf-8", "lv.csv", LV.exportCSV(rows))}>Export CSV</button>
        <button className="btn" onClick={() => pickFile(async f => { const n = LV.importCSV(await f.text()); alert(`Importiert: ${n} Positionen`); setRows(LV.list()); })}>Import CSV</button>
        <button className="btn" onClick={() => exportXLSX({ rows, kapRabatt, kapMarkup, kapTotals, netto, aufschlag, mwst, brutto, company, client, offer })}>Export XLSX</button>
      </div>

      {/* IVA + Aufschlag */}
      <div className="card" style={{ padding:"10px 16px", display:"flex", alignItems:"center", gap:16 }}>
        <div style={{ fontWeight:700 }}>Aufschlag / Gewinn:</div>
        <input type="number" style={{ ...inp, width:80 }} value={aufschlag} onChange={e => setAufschlag(+e.target.value)}/> %
        <div style={{ fontWeight:700, marginLeft:20 }}>MwSt:</div>
        <input type="number" style={{ ...inp, width:80 }} value={mwst} onChange={e => setMwst(+e.target.value)}/> %
        <div style={{ flex:1 }}/>
        <div style={{ fontWeight:700, fontSize:16 }}>Gesamt Brutto: {brutto.toFixed(2)} €</div>
      </div>

      {/* Firme + PDF */}
      <div className="card" style={{ padding:"10px 16px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, alignItems:"start" }}>
        <div>
          <div style={{display:"grid",gridTemplateColumns:"120px 1fr",gap:8,alignItems:"center",marginBottom:6}}>
            <label style={lbl}>Bauleiter (Name)</label>
            <input style={inp} value={bauleiterName} onChange={e=>setBauleiterName(e.target.value)}/>
          </div>
          <SignPad title="Unterschrift Bauleiter" onSave={setSigBauleiter} />
        </div>
        <div>
          <div style={{display:"grid",gridTemplateColumns:"120px 1fr",gap:8,alignItems:"center",marginBottom:6}}>
            <label style={lbl}>Auftraggeber (Name)</label>
            <input style={inp} value={auftraggeberName} onChange={e=>setAuftraggeberName(e.target.value)}/>
          </div>
          <SignPad title="Unterschrift Auftraggeber" onSave={setSigAuftraggeber} />
        </div>
        <div style={{ gridColumn:"1 / -1", display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
          <button className="btn" onClick={() => exportPDF({
            rows, kapRabatt, kapMarkup, kapTotals, netto, aufschlag, mwst, brutto,
            company, client, offer, watermark,
            sigBauleiter, sigAuftraggeber, bauleiterName, auftraggeberName, pdfColors
          })}>
            📄 Angebot (PDF) generieren
          </button>
          <div style={{ opacity:.7, fontSize:13 }}>Mit Logo, QR, digitalen Unterschriften (mit Name+Datum), Kapitel-Zusammenfassung, Wasserzeichen.</div>
        </div>
      </div>

      {/* Invio email */}
      <div className="card" style={{padding:"10px 16px",display:"grid",gridTemplateColumns:"100px 1fr",gap:8}}>
        <label style={lbl}>An:</label>
        <input style={inp} placeholder="kunde@example.com" value={mail.to} onChange={e=>setMail({...mail,to:e.target.value})}/>
        <label style={lbl}>Betreff:</label>
        <input style={inp} value={mail.subject} onChange={e=>setMail({...mail,subject:e.target.value})}/>
        <label style={lbl}>Nachricht:</label>
        <textarea style={{...inp,minHeight:80}} value={mail.body} onChange={e=>setMail({...mail,body:e.target.value})}/>
        <div style={{gridColumn:"1 / -1",display:"flex",gap:8,marginTop:6}}>
          <button className="btn" onClick={()=>handleSendEmail({
            rows, kapRabatt, kapMarkup, kapTotals, netto, aufschlag, mwst, brutto, company, client, offer, watermark,
            sigBauleiter, sigAuftraggeber, bauleiterName, auftraggeberName, pdfColors, mail
          })}>📨 Angebot per E-Mail senden</button>
        </div>
      </div>
    </div>
  );
}

/* ===== Helpers Calcolo ===== */
function getChapter(posNr: string | undefined) { if (!posNr) return "—"; const m = posNr.match(/^(\d{2})/); return m ? m[1] : "—"; }
function lineRaw(r: LVPos) { return (r.menge ?? 0) * (r.preis ?? 0); }
function lineAfterLineDiscount(r: LVPos & { rabatt?: number }) { const raw = lineRaw(r); const rab = (r.rabatt ?? 0); return raw * (1 - rab / 100); }

/* ===== UI Mini ===== */
function Kpi({ title, children }: { title: string; children: React.ReactNode }) { return (<div><div style={{ fontWeight:700, marginBottom:6 }}>{title}</div>{children}</div>); }
function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (<div style={{ height:12, border:"1px solid var(--line)", borderRadius:8, overflow:"hidden", background:"#fafafa" }}>
    <div style={{ width:`${v}%`, height:"100%", transition:"width .3s ease", background:"linear-gradient(90deg,#7bd389,#55c1ff)" }}/>
  </div>);
}
function pickFile(onPick: (f: File) => void) { const i = document.createElement("input"); i.type = "file"; i.onchange = () => { const f = i.files?.[0]; if (f) onPick(f); }; i.click(); }
function download(type: string, name: string, data: string) { const b = new Blob([data], { type }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); URL.revokeObjectURL(a.href); }

/* ===== SignPad ===== */
function SignPad({ title, onSave }: { title: string; onSave: (dataUrl: string | null) => void }) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => { const c = ref.current; if (!c) return; const ctx = c.getContext("2d")!; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round"; }, []);
  const getPos = (e: React.PointerEvent) => { const c = ref.current!; const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: React.PointerEvent) => { setDrawing(true); const ctx = ref.current!.getContext("2d")!; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e: React.PointerEvent) => { if (!drawing) return; const ctx = ref.current!.getContext("2d")!; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); setDirty(true); };
  const up = () => { setDrawing(false); };
  const clear = () => { const c = ref.current!; const ctx = c.getContext("2d")!; ctx.clearRect(0,0,c.width,c.height); setDirty(false); onSave(null); };
  const save = () => { const c = ref.current!; const url = c.toDataURL("image/png"); onSave(url); };
  return (
    <div>
      <div style={{ fontWeight:700, marginBottom:6 }}>{title}</div>
      <div style={{ border:"1px dashed var(--line)", borderRadius:8, padding:8, background:"#fff" }}>
        <canvas ref={ref} width={420} height={140}
                style={{ width:"100%", height:140, display:"block", touchAction:"none" }}
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}/>
      </div>
      <div style={{ display:"flex", gap:8, marginTop:8 }}>
        <button className="btn" onClick={clear} disabled={!dirty}>Löschen</button>
        <button className="btn" onClick={save} disabled={!dirty}>Speichern</button>
      </div>
    </div>
  );
}

/* ===== XLSX EXPORT ===== */
function exportXLSX(opts: {
  rows: (LVPos & { rabatt?: number })[];
  kapRabatt: Record<string, number>;
  kapMarkup: Record<string, number>;
  kapTotals: Record<string, { sumRaw: number; sumAfterLineDisc: number; rabattKap: number; sumAfterKap: number; markupKap:number; sumFinalKap: number }>;
  netto: number; aufschlag: number; mwst: number; brutto: number;
  company: any; client: any; offer: any;
}) {
  const { rows, kapRabatt, kapMarkup, kapTotals, netto, aufschlag, mwst, brutto, company, client, offer } = opts;

  const data1 = [["Kapitel","Pos-Nr","Kurztext","Einheit","Menge","E-Preis","Rabatt %","Zeilen-€ nach Rabatt","Confidence %"]];
  for (const r of rows) {
    const ch = getChapter(r.posNr);
    data1.push([
      ch, r.posNr, r.kurztext, r.einheit, r.menge, r.preis ?? "", r.rabatt ?? 0,
      lineAfterLineDiscount(r), r.confidence != null ? Math.round(r.confidence * 100) : ""
    ]);
  }
  const ws1 = XLSX.utils.aoa_to_sheet(data1);

  const data2 = [["Kapitel","Kap.-Rabatt %","Markup %","Σ Roh","Σ n. Zeilenrabatt","Σ nach Kap.-Rabatt","Σ Kapitel (final)"]];
  Object.entries(kapTotals).forEach(([ch, t]) => {
    data2.push([ch, kapRabatt[ch] ?? 0, kapMarkup[ch] ?? 0, t.sumRaw, t.sumAfterLineDisc, t.sumAfterKap, t.sumFinalKap]);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(data2);

  const aufschlagWert = netto * (aufschlag / 100);
  const steuer = (netto + aufschlagWert) * (mwst / 100);
  const data3 = [
    ["Unternehmen", company.name],
    ["Adresse", company.address],
    ["Angebot Nr.", offer.number],
    ["Kunde", client.name],
    ["Ort", offer.place],
    ["Datum", new Date().toLocaleDateString()],
    [],
    ["Netto", netto],
    ["Aufschlag %", aufschlag],
    ["Aufschlag €", aufschlagWert],
    ["MwSt %", mwst],
    ["MwSt €", steuer],
    ["Brutto", brutto]
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(data3);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "Positionen");
  XLSX.utils.book_append_sheet(wb, ws2, "Kapitel");
  XLSX.utils.book_append_sheet(wb, ws3, "Zusammenfassung");

  const wbout = XLSX.write(wb, { type:"array", bookType:"xlsx" });
  const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Angebot_${offer.number}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ===== PDF ===== */
async function exportPDF(opts: {
  rows: (LVPos & { rabatt?: number })[];
  kapRabatt: Record<string, number>;
  kapMarkup: Record<string, number>;
  kapTotals: Record<string, { sumRaw: number; sumAfterLineDisc: number; rabattKap: number; sumAfterKap: number; markupKap:number; sumFinalKap: number }>;
  netto: number; aufschlag: number; mwst: number; brutto: number;
  company: { name:string; address:string; phone:string; email:string; logoUrl:string };
  client: { name:string; address:string };
  offer: { number:string; place:string; notes:string };
  watermark: boolean;
  sigBauleiter: string | null; sigAuftraggeber: string | null;
  bauleiterName: string; auftraggeberName: string;
  pdfColors: { head:[number,number,number]; chap:[number,number,number] };
}) {
  const doc = await buildPdfDoc(opts);
  doc.save(`Angebot_${opts.offer.number}.pdf`);
}

async function buildPdfDoc(opts: {
  rows: (LVPos & { rabatt?: number })[];
  kapRabatt: Record<string, number>;
  kapMarkup: Record<string, number>;
  kapTotals: Record<string, { sumRaw: number; sumAfterLineDisc: number; rabattKap: number; sumAfterKap: number; markupKap:number; sumFinalKap: number }>;
  netto: number; aufschlag: number; mwst: number; brutto: number;
  company: { name:string; address:string; phone:string; email:string; logoUrl:string };
  client: { name:string; address:string };
  offer: { number:string; place:string; notes:string };
  watermark: boolean;
  sigBauleiter: string | null; sigAuftraggeber: string | null;
  bauleiterName: string; auftraggeberName: string;
  pdfColors: { head:[number,number,number]; chap:[number,number,number] };
}) {
  const { rows, kapRabatt, kapMarkup, kapTotals, netto, aufschlag, mwst, brutto, company, client, offer, watermark, sigBauleiter, sigAuftraggeber, bauleiterName, auftraggeberName, pdfColors } = opts;
  const doc = new jsPDF({ compress:true });

  try { const img = await loadImage(company.logoUrl); doc.addImage(img, "PNG", 155, 10, 40, 15); } catch {}

  doc.setFontSize(16); doc.text("Angebot – KI-Kalkulation", 14, 18);
  doc.setFontSize(10); doc.text(`${company.name} · ${company.address} · ${company.phone} · ${company.email}`, 14, 24);

  doc.setFontSize(11);
  doc.text(`Kunde: ${client.name}`, 14, 32);
  doc.text(client.address, 14, 38);
  doc.text(`Angebot Nr.: ${offer.number}`, 140, 32);
  doc.text(`Ort: ${offer.place}`, 140, 38);
  doc.text(`Datum: ${new Date().toLocaleDateString()}`, 140, 44);

  if (watermark) {
    doc.saveGraphicsState();
    (doc as any).setGState(new (jsPDF as any).GState({ opacity: 0.08 }));
    doc.setFontSize(50);
    doc.text("Powered by OpenAI", 35, 160, { angle: -30 });
    doc.restoreGraphicsState();
  }

  const body = rows.map(r => [
    getChapter(r.posNr), r.posNr || "", r.kurztext || "", r.einheit || "",
    (r.menge ?? 0).toFixed(2),
    r.preis != null ? r.preis.toFixed(2) : "—",
    (r.rabatt ?? 0).toFixed(1) + "%",
    lineAfterLineDiscount(r).toFixed(2) + " €",
    r.confidence != null ? Math.round(r.confidence * 100) + "%" : "—"
  ]);
  (doc as any).autoTable({
    head: [["Kap.","Pos.-Nr","Kurztext","Einheit","Menge","E-Preis [€]","Zeilenrabatt","Zeilen € n. Rabatt","KI-Conf."]],
    body,
    styles: { fontSize:9, cellPadding:2 },
    headStyles: { fillColor: pdfColors.head, textColor:255 },
    startY: 52,
    margin: { left:14, right:14 }
  });

  const y = (doc as any).lastAutoTable.finalY + 6;
  const kapRows = Object.entries(kapTotals).map(([ch, t]) => [
    ch,
    (kapRabatt[ch] ?? 0) + " %",
    (t.sumRaw).toFixed(2) + " €",
    (t.sumAfterLineDisc).toFixed(2) + " €",
    "nach Kap.-Rabatt: " + (t.sumAfterKap).toFixed(2) + " €",
    "Markup " + (t.markupKap ?? 0) + "% → " + (t.sumFinalKap).toFixed(2) + " €"
  ]);
  (doc as any).autoTable({
    head: [["Kapitel","Kap.-Rabatt","Σ Roh","Σ n. Zeilenrabatt","Σ nach Kap.-Rabatt","Σ Kapitel (final)"]],
    body: kapRows,
    styles: { fontSize:9, cellPadding:2 },
    headStyles: { fillColor: pdfColors.chap },
    startY: y,
    margin: { left:14, right:14 }
  });

  const y2 = (doc as any).lastAutoTable.finalY + 8;
  const aufschlagWert = netto * (aufschlag / 100);
  const steuer = (netto + aufschlagWert) * (mwst / 100);

  doc.setFontSize(12); doc.text("Zusammenfassung:", 14, y2);
  doc.setFontSize(11);
  doc.text(`Nettosumme: ${netto.toFixed(2)} €`, 20, y2 + 8);
  doc.text(`Aufschlag (${aufschlag}%): ${(aufschlagWert).toFixed(2)} €`, 20, y2 + 16);
  doc.text(`MwSt (${mwst}%): ${steuer.toFixed(2)} €`, 20, y2 + 24);
  doc.setFont(undefined, "bold");
  doc.text(`Bruttosumme: ${brutto.toFixed(2)} €`, 20, y2 + 34);
  doc.setFont(undefined, "normal");

  const y3 = y2 + 44;
  doc.setFontSize(10);
  doc.text(doc.splitTextToSize(`Hinweise / Bedingungen: ${offer.notes}`, 180), 14, y3);

  const qrData = JSON.stringify({ nr: offer.number, sum: brutto.toFixed(2), company: company.name, client: client.name, date: new Date().toISOString() });
  const qr = await QRCode.toDataURL(qrData, { width: 90 });
  doc.addImage(qr, "PNG", 160, y2 - 2, 30, 30);

  const sigY = y3 + 28;
  const today = new Date().toLocaleDateString();

  doc.setFontSize(11);
  if (sigBauleiter) { try { doc.addImage(sigBauleiter, "PNG", 20, sigY - 22, 60, 22); } catch {} }
  else { doc.text("_____________________________", 20, sigY); }
  doc.text(`Bauleiter: ${bauleiterName}`, 20, sigY + 8);
  doc.text(`Datum: ${today}`, 20, sigY + 14);

  if (sigAuftraggeber) { try { doc.addImage(sigAuftraggeber, "PNG", 120, sigY - 22, 60, 22); } catch {} }
  else { doc.text("_____________________________", 120, sigY); }
  doc.text(`Auftraggeber: ${auftraggeberName}`, 120, sigY + 8);
  doc.text(`Datum: ${today}`, 120, sigY + 14);

  doc.text(`Ort: ${offer.place}`, 20, sigY + 24);

  addPageNumbers(doc, (page, total) => `Seite ${page} / ${total}  ·  © ${new Date().getFullYear()} ${company.name}`);
  return doc;
}

/* ===== EMAIL ===== */
async function handleSendEmail(all: {
  rows:(LVPos & {rabatt?:number})[]; kapRabatt:Record<string,number>; kapMarkup:Record<string,number>;
  kapTotals:Record<string,any>; netto:number; aufschlag:number; mwst:number; brutto:number;
  company:any; client:any; offer:any; watermark:boolean;
  sigBauleiter:string|null; sigAuftraggeber:string|null;
  bauleiterName:string; auftraggeberName:string;
  pdfColors:{ head:[number,number,number]; chap:[number,number,number] };
  mail:{to:string;subject:string;body:string};
}) {
  const { mail } = all;
  if (!mail.to) { alert("Bitte Empfänger-E-Mail angeben."); return; }
  const pdfBase64 = await generatePdfBase64(all);
  const res = await fetch("/api/mail/send-offer", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      to: mail.to,
      subject: mail.subject,
      html: mail.body.replace(/\n/g,"<br/>"),
      pdfBase64,
      fileName: `Angebot_${all.offer.number}.pdf`
    })
  });
  if (!res.ok) { alert("Fehler beim Senden: " + await res.text()); return; }
  alert("E-Mail gesendet.");
}
async function generatePdfBase64(all:any){
  const doc = await buildPdfDoc(all);
  const out = doc.output("datauristring");
  return out.split(",")[1];
}

/* ===== UTILS PDF ===== */
function addPageNumbers(doc: jsPDF, textFor: (page: number, total: number) => string) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.text(textFor(i, pageCount), 14, 295);
  }
}
async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => res(img); img.onerror = rej; img.src = src; });
}
function hexToRgb(hex:string){ const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16); return [r,g,b]; }
