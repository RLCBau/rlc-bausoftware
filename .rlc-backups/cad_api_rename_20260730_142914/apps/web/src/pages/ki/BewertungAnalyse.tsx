import React from "react";
import * as XLSX from "xlsx";

type Row = {
  posNr: string;
  kurztext: string;
  einheit: string;
  menge?: number;
  ep?: number; // netto
};

type Offer = {
  id: string;
  name: string;
  rows: Row[];
  totals: { sumEPxQty: number };
  score?: number;
  notes?: string;
};

type DiffType =
  | "match"
  | "text_diff"
  | "unit_diff"
  | "qty_diff"
  | "price_diff"
  | "missing_in_offer"
  | "missing_in_lv";

type DiffRow = {
  posNr: string;
  lv?: Row | null;
  angebot?: Row | null;
  type: DiffType;
  details: string[];
};

const card: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 10, padding: 16, background: "#fff" };
const inp:  React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 14 };
const tbl:  React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th:   React.CSSProperties = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap", background: "#f7f7f7" };
const td:   React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid #eee", verticalAlign: "top" };

function num(n?: number) { return Number.isFinite(n) ? (n as number).toLocaleString(undefined, { maximumFractionDigits: 2 }) : ""; }
function toNumber(v: any) {
  if (v == null) return undefined;
  const s = String(v).replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
function normalizeHeader(h: string) {
  const s = h.trim().toLowerCase();
  if (/^pos/.test(s) || s === "position" || s === "positionsnummer" || s === "nr") return "posNr";
  if (/kurz|kurztext|bezeichnung|beschreibung|langtext/.test(s)) return "kurztext";
  if (/einheit|me|unit/.test(s)) return "einheit";
  if (/menge|qty|anzahl|mengen?/.test(s)) return "menge";
  if (/ep|einheitspreis|preis/.test(s)) return "ep";
  return s;
}
function rowFromObj(o: Record<string, any>): Row | null {
  const m: any = {};
  for (const [k, v] of Object.entries(o)) m[normalizeHeader(k)] = v;
  const pos = String(m.posNr ?? "").trim();
  if (!pos) return null;
  return {
    posNr: pos,
    kurztext: String(m.kurztext ?? "").trim(),
    einheit: String(m.einheit ?? "").trim(),
    menge: toNumber(m.menge),
    ep: toNumber(m.ep),
  };
}
async function readXlsxOrCsv(file: File): Promise<Row[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { raw: false, defval: "" });
  const rows: Row[] = [];
  for (const obj of json) {
    const r = rowFromObj(obj);
    if (r) rows.push(r);
  }
  return rows;
}

// similarità bag-of-words grezza (0..1)
function textSim(a: string, b: string) {
  const A = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const B = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.max(A.size, B.size);
}

function compare(lv: Row[], angebot: Row[]): DiffRow[] {
  const mapLV = new Map(lv.map(r => [r.posNr, r]));
  const mapAG = new Map(angebot.map(r => [r.posNr, r]));
  const allKeys = new Set([...mapLV.keys(), ...mapAG.keys()]);
  const diffs: DiffRow[] = [];

  for (const key of Array.from(allKeys).sort()) {
    const L = mapLV.get(key) || null;
    const A = mapAG.get(key) || null;

    if (L && !A) { diffs.push({ posNr: key, lv: L, angebot: null, type: "missing_in_offer", details: ["Im Angebot fehlt diese Position."] }); continue; }
    if (!L && A) { diffs.push({ posNr: key, lv: null, angebot: A, type: "missing_in_lv", details: ["Im LV fehlt diese Position."] }); continue; }

    const details: string[] = [];
    let type: DiffType = "match";

    if ((L!.kurztext || "").trim() !== (A!.kurztext || "").trim()) { details.push("Kurztext unterschiedlich"); type = "text_diff"; }
    if ((L!.einheit || "").trim() !== (A!.einheit || "").trim()) { details.push(`Einheit: LV=${L!.einheit || "—"} • Angebot=${A!.einheit || "—"}`); if (type === "match") type = "unit_diff"; }

    const dQty = (L!.menge ?? 0) - (A!.menge ?? 0);
    if (Math.abs(dQty) > 1e-6) { details.push(`Menge: LV=${num(L!.menge)} • Angebot=${num(A!.menge)} (Δ ${num(-dQty)})`); if (type === "match") type = "qty_diff"; }

    const dEP = (L!.ep ?? 0) - (A!.ep ?? 0);
    if (Math.abs(dEP) > 1e-6) { details.push(`EP (netto): LV=${num(L!.ep)} • Angebot=${num(A!.ep)} (Δ ${num(-dEP)})`); if (type === "match") type = "price_diff"; }

    diffs.push({ posNr: key, lv: L!, angebot: A!, type, details });
  }
  return diffs;
}

function badge(t: DiffType) {
  const base: React.CSSProperties = { padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600, display: "inline-block" };
  const map: Record<DiffType, React.CSSProperties> = {
    match: { background: "#eaf7ef", color: "#0a6b3a" },
    text_diff: { background: "#fff7ed", color: "#9a3412" },
    unit_diff: { background: "#fef9c3", color: "#a16207" },
    qty_diff: { background: "#fef9c3", color: "#a16207" },
    price_diff: { background: "#e0e7ff", color: "#3730a3" },
    missing_in_offer: { background: "#fee2e2", color: "#991b1b" },
    missing_in_lv: { background: "#fae8ff", color: "#6b21a8" },
  };
  const label: Record<DiffType, string> = {
    match: "ok",
    text_diff: "Text",
    unit_diff: "Einheit",
    qty_diff: "Menge",
    price_diff: "Preis",
    missing_in_offer: "Fehlt im Angebot",
    missing_in_lv: "Fehlt im LV",
  };
  return <span style={{ ...base, ...(map[t] || {}) }}>{label[t]}</span>;
}

export default function BewertungAnalyse() {
  const [projectId, setProjectId] = React.useState("");
  const [lv, setLV] = React.useState<Row[]>([]);
  const [offers, setOffers] = React.useState<Offer[]>([]);
  const [weights, setWeights] = React.useState({ price: 0.6, unit: 0.15, qty: 0.15, text: 0.1 });
  const [aiSummary, setAiSummary] = React.useState<string>("");

  const [selectedOffer, setSelectedOffer] = React.useState<number | null>(null);
  const [diffs, setDiffs] = React.useState<DiffRow[]>([]);

  async function loadLV(files: FileList | null) {
    if (!files || !files[0]) return;
    setLV(await readXlsxOrCsv(files[0]));
    setDiffs([]);
  }
  async function loadOffer(i: number, files: FileList | null) {
    if (!files || !files[0]) return;
    const rows = await readXlsxOrCsv(files[0]);
    const totals = { sumEPxQty: rows.reduce((s, r) => s + (r.menge ?? 0) * (r.ep ?? 0), 0) };
    setOffers(prev => {
      const id = prev[i]?.id || crypto.randomUUID();
      const name = files[0].name;
      const next = [...prev];
      next[i] = { id, name, rows, totals };
      return next;
    });
    setDiffs([]);
  }

  function calcScores() {
    if (!lv.length || !offers.length) { alert("LV e almeno un’offerta necessari."); return; }
    const totals = offers.map(o => o?.totals.sumEPxQty || 0);
    const min = Math.min(...totals), max = Math.max(...totals);
    const mapLV = new Map(lv.map(r => [r.posNr, r]));

    const results = offers.map(off => {
      const priceScore = max === min ? 1 : 1 - (off.totals.sumEPxQty - min) / (max - min);
      let unitOK = 0, unitTot = 0, qtyScore = 0, qtyTot = 0, textScore = 0, textTot = 0;
      for (const r of off.rows) {
        const L = mapLV.get(r.posNr);
        if (!L) continue;
        unitTot++; if ((L.einheit || "").trim() === (r.einheit || "").trim()) unitOK++;
        qtyTot++;  const lq = L.menge ?? 0, aq = r.menge ?? 0; const q = lq === 0 && aq === 0 ? 1 : 1 - Math.min(1, Math.abs(lq - aq) / Math.max(1e-9, lq));
        qtyScore += Math.max(0, q);
        textTot++; textScore += textSim(L.kurztext, r.kurztext);
      }
      const unitScore = unitTot ? unitOK / unitTot : 0.5;
      const qtySc = qtyTot ? qtyScore / qtyTot : 0.5;
      const textSc = textTot ? textScore / textTot : 0.5;
      const total = weights.price * priceScore + weights.unit * unitScore + weights.qty * qtySc + weights.text * textSc;
      return { ...off, score: Math.round(total * 1000) / 1000 };
    }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    setOffers(results);
  }

  async function runAIReview() {
    if (!offers.length) return;
    try {
      const body = {
        projectId,
        lv: lv.slice(0, 60),
        offers: offers.map(o => ({ name: o.name, total: o.totals.sumEPxQty, score: o.score ?? 0, sample: o.rows.slice(0, 40) })),
        weights
      };
      const res = await fetch("/api/ki/offer-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAiSummary(data.summary || "");
      if (data.perOffer) setOffers(prev => prev.map((o, i) => ({ ...o, notes: data.perOffer?.[i]?.notes || o.notes })));
    } catch (e: any) {
      alert(e?.message || "KI-Review fehlgeschlagen");
    }
  }

  function showDiffs(i: number) {
    setSelectedOffer(i);
    const off = offers[i];
    if (!off) return;
    setDiffs(compare(lv, off.rows));
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  function gotoNachtrag(prefill: Partial<Row>) {
    const payload = {
      projectId,
      kurztext: prefill.kurztext ?? "",
      einheit: prefill.einheit ?? "",
      menge: prefill.menge ?? "",
      ep: prefill.ep ?? "",
      posNr: prefill.posNr ?? "",
      grund: "KI: Abweichung in Angebotsanalyse",
    };
    const url = `/kalkulation/nachtraege?projectId=${encodeURIComponent(projectId)}&prefill=${encodeURIComponent(JSON.stringify(payload))}`;
    window.location.href = url;
  }

  async function updateLV(r: Row | undefined) {
    if (!r) return;
    try {
      const res = await fetch("/api/lv/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          kurztext: r.kurztext,
          einheit: r.einheit,
          preis: r.ep ?? null,
          quelle: "Bewertung/Angebotsanalyse",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      alert("LV-Position hinzugefügt/aktualisiert.");
    } catch (e: any) {
      alert(e?.message || "LV-Update fehlgeschlagen");
    }
  }

  return (
    <div style={{ display: "grid", gap: 16, padding: 16 }}>
      <h1>Bewertung & Angebotsanalyse</h1>

      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ marginBottom: 6, fontSize: 13, color: "var(--muted)" }}>Projekt-ID</div>
            <input style={{ ...inp, width: "100%" }} value={projectId} onChange={e => setProjectId(e.target.value)} placeholder="z. B. BA-2025-834" />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12 }}>
          <div>
            <div style={{ marginBottom: 6, fontSize: 13, color: "var(--muted)" }}>LV (CSV/XLSX)</div>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={e => loadLV(e.target.files)} />
          </div>
          <div />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 12 }}>
          {[0,1,2].map(i => (
            <div key={i}>
              <div style={{ marginBottom: 6, fontSize: 13, color: "var(--muted)" }}>Angebot {i+1}</div>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={e => loadOffer(i, e.target.files)} />
              {offers[i] && (
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  <div><strong>{offers[i].name}</strong></div>
                  <div>Summe (EP×Menge): {num(offers[i].totals.sumEPxQty)} €</div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px dashed var(--line)", marginTop: 12, paddingTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <Weight label="Preis" value={weights.price} onChange={v => setWeights(p => ({ ...p, price: v }))} />
          <Weight label="Einheit" value={weights.unit} onChange={v => setWeights(p => ({ ...p, unit: v }))} />
          <Weight label="Menge" value={weights.qty} onChange={v => setWeights(p => ({ ...p, qty: v }))} />
          <Weight label="Text" value={weights.text} onChange={v => setWeights(p => ({ ...p, text: v }))} />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn" onClick={calcScores} disabled={!lv.length || !offers.length}>Punkte berechnen & ranken</button>
          <button className="btn" onClick={runAIReview} disabled={!offers.length}>KI-Bewertung erzeugen</button>
          <div style={{ marginLeft: "auto", fontSize: 12, opacity: .75 }}>
            Geladen: LV {lv.length} Pos. • Angebote {offers.filter(Boolean).length}
          </div>
        </div>
      </div>

      {!!offers.length && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Ranking</h3>
          <table style={tbl}>
            <thead>
              <tr>
                <th style={th}>#</th>
                <th style={th}>Angebot</th>
                <th style={th}>Summe (EP×Menge)</th>
                <th style={th}>Score (0–1)</th>
                <th style={th}>KI-Hinweise</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o, i) => (
                <tr key={o.id}>
                  <td style={td}>{i+1}</td>
                  <td style={td}><strong>{o.name}</strong></td>
                  <td style={td}>{num(o.totals.sumEPxQty)} €</td>
                  <td style={td}>{o.score?.toFixed(3)}</td>
                  <td style={td}>{o.notes ? <div style={{ whiteSpace: "pre-wrap" }}>{o.notes}</div> : <span style={{ opacity:.6 }}>—</span>}</td>
                  <td style={td}>
                    <button className="btn" onClick={() => showDiffs(i)} disabled={!lv.length}>Abweichungen anzeigen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!!diffs.length && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>
            Abweichungen – {selectedOffer != null ? offers[selectedOffer]?.name : ""}
          </h3>
          <table style={tbl}>
            <thead>
              <tr>
                <th style={th}>Pos</th>
                <th style={th}>Typ</th>
                <th style={th}>LV</th>
                <th style={th}>Angebot</th>
                <th style={th}>Details</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((d, i) => (
                <tr key={`${d.posNr}-${i}`}>
                  <td style={{ ...td, fontWeight: 600 }}>{d.posNr}</td>
                  <td style={td}>{badge(d.type)}</td>
                  <td style={td}>
                    {d.lv ? (
                      <>
                        <div style={{ fontWeight: 600 }}>{d.lv.kurztext}</div>
                        <div style={{ fontSize: 12, opacity: .8 }}>
                          {d.lv.einheit} · Menge {num(d.lv.menge)} · EP {num(d.lv.ep)}
                        </div>
                      </>
                    ) : <span style={{ opacity:.6 }}>—</span>}
                  </td>
                  <td style={td}>
                    {d.angebot ? (
                      <>
                        <div style={{ fontWeight: 600 }}>{d.angebot.kurztext}</div>
                        <div style={{ fontSize: 12, opacity: .8 }}>
                          {d.angebot.einheit} · Menge {num(d.angebot.menge)} · EP {num(d.angebot.ep)}
                        </div>
                      </>
                    ) : <span style={{ opacity:.6 }}>—</span>}
                  </td>
                  <td style={td}>
                    <ul style={{ margin:0, paddingLeft:18 }}>
                      {d.details.map((x,k)=><li key={k} style={{ fontSize:13 }}>{x}</li>)}
                    </ul>
                  </td>
                  <td style={td}>
                    <div style={{ display:"grid", gap:6 }}>
                      {(d.type === "missing_in_lv" || d.type === "text_diff" || d.type === "unit_diff" || d.type === "qty_diff" || d.type === "price_diff") && (
                        <button className="btn" onClick={() => gotoNachtrag(d.angebot || d.lv || undefined)}>
                          → Nachtrag erstellen
                        </button>
                      )}
                      {(d.type !== "missing_in_offer") && d.angebot && (
                        <button className="btn" onClick={() => updateLV(d.angebot!)}>
                          → LV aktualisieren
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aiSummary && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>KI-Zusammenfassung</h3>
          <div style={{ whiteSpace: "pre-wrap" }}>{aiSummary}</div>
        </div>
      )}
    </div>
  );
}

function Weight({ label, value, onChange }: { label: string; value: number; onChange: (v:number)=>void }) {
  return (
    <label style={{ display:"grid", gap:6 }}>
      <div style={{ fontSize: 13, color: "var(--muted)" }}>{label} – {value.toFixed(2)}</div>
      <input type="range" min={0} max={1} step={0.05} value={value} onChange={e => onChange(Number(e.target.value))} />
    </label>
  );
}
