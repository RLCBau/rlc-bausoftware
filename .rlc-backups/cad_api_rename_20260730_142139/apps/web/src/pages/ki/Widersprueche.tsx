// apps/web/src/pages/ki/Widersprueche.tsx
import React from "react";
import * as XLSX from "xlsx";

/* ================== Tipi ================== */
type Row = {
  posNr: string;
  kurztext: string;
  einheit: string;
  menge?: number;          // optional — se assente vale 0
  ep?: number;             // EP netto
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

/* ================== UI helpers ================== */
const card: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 10, padding: 16, background: "#fff" };
const inp:  React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 14 };
const tbl:  React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th:   React.CSSProperties = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap", background:"#f7f7f7" };
const td:   React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid #f0f0f0", verticalAlign:"top" };

function num(n?: number) { return Number.isFinite(n) ? (n as number).toLocaleString(undefined, { maximumFractionDigits: 3 }) : ""; }
function toNumber(v: any) {
  if (v == null) return undefined;
  const s = String(v).replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

/* ================== Import helpers ================== */
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
  for (const [k, v] of Object.entries(o)) {
    const key = normalizeHeader(k);
    m[key] = v;
  }
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

/* ================== Diff ================== */
function compare(lv: Row[], angebot: Row[]): DiffRow[] {
  const mapLV = new Map(lv.map(r => [r.posNr, r]));
  const mapAG = new Map(angebot.map(r => [r.posNr, r]));
  const allKeys = new Set([...mapLV.keys(), ...mapAG.keys()]);

  const diffs: DiffRow[] = [];
  for (const key of Array.from(allKeys).sort()) {
    const L = mapLV.get(key) || null;
    const A = mapAG.get(key) || null;

    if (L && !A) {
      diffs.push({ posNr: key, lv: L, angebot: null, type: "missing_in_offer", details: ["Im Angebot fehlt diese Position."] });
      continue;
    }
    if (!L && A) {
      diffs.push({ posNr: key, lv: null, angebot: A, type: "missing_in_lv", details: ["Im LV fehlt diese Position."] });
      continue;
    }

    const details: string[] = [];
    let type: DiffType = "match";

    if ((L!.kurztext || "").trim() !== (A!.kurztext || "").trim()) {
      details.push("Kurztext unterschiedlich");
      type = "text_diff";
    }
    if ((L!.einheit || "").trim() !== (A!.einheit || "").trim()) {
      details.push(`Einheit: LV=${L!.einheit || "—"} • Angebot=${A!.einheit || "—"}`);
      type = type === "match" ? "unit_diff" : type;
    }
    const dQty = (L!.menge ?? 0) - (A!.menge ?? 0);
    if (Math.abs(dQty) > 1e-6) {
      details.push(`Menge: LV=${num(L!.menge)} • Angebot=${num(A!.menge)} (Δ ${num(-dQty)})`);
      type = type === "match" ? "qty_diff" : type;
    }
    const dEP = (L!.ep ?? 0) - (A!.ep ?? 0);
    if (Math.abs(dEP) > 1e-6) {
      details.push(`EP (netto): LV=${num(L!.ep)} • Angebot=${num(A!.ep)} (Δ ${num(-dEP)})`);
      type = type === "match" ? "price_diff" : type;
    }

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
  const style = { ...base, ...(map[t] || {}) };
  const label: Record<DiffType, string> = {
    match: "ok",
    text_diff: "Text",
    unit_diff: "Einheit",
    qty_diff: "Menge",
    price_diff: "Preis",
    missing_in_offer: "Fehlt im Angebot",
    missing_in_lv: "Fehlt im LV",
  };
  return <span style={style}>{label[t]}</span>;
}

/* ================== Component ================== */
export default function Widersprueche() {
  const [projectId, setProjectId] = React.useState("");
  const [lv, setLV] = React.useState<Row[]>([]);
  const [ag, setAG] = React.useState<Row[]>([]);
  const [diffs, setDiffs] = React.useState<DiffRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  async function onLoadLV(files: FileList | null) {
    if (!files || !files[0]) return;
    try { setLV(await readXlsxOrCsv(files[0])); setDiffs([]); setError(null); }
    catch (e: any) { setError(e?.message || "Fehler beim Import LV."); }
  }
  async function onLoadAG(files: FileList | null) {
    if (!files || !files[0]) return;
    try { setAG(await readXlsxOrCsv(files[0])); setDiffs([]); setError(null); }
    catch (e: any) { setError(e?.message || "Fehler beim Import Angebot."); }
  }

  function runCompare() {
    if (!lv.length || !ag.length) { alert("Bitte beide Dateien (LV & Angebot) laden."); return; }
    setDiffs(compare(lv, ag));
  }

  function exportCSV() {
    if (!diffs.length) { alert("Kein Report vorhanden."); return; }
    const data = diffs.map(d => ({
      PosNr: d.posNr,
      Typ: d.type,
      LV_Kurztext: d.lv?.kurztext ?? "",
      LV_Einheit: d.lv?.einheit ?? "",
      LV_Menge: d.lv?.menge ?? "",
      LV_EP: d.lv?.ep ?? "",
      Angebot_Kurztext: d.angebot?.kurztext ?? "",
      Angebot_Einheit: d.angebot?.einheit ?? "",
      Angebot_Menge: d.angebot?.menge ?? "",
      Angebot_EP: d.angebot?.ep ?? "",
      Details: d.details.join(" | "),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Widersprueche");
    XLSX.writeFile(wb, `Widersprueche_${projectId || "ohneProjekt"}.csv`);
  }

  /** Vai a Nachträge con prefill */
  function gotoNachtrag(prefill: Partial<Row>) {
    if (!projectId) { alert("Bitte Projekt-ID eingeben."); return; }
    const payload = {
      projectId,
      kurztext: prefill.kurztext ?? "",
      einheit: prefill.einheit ?? "",
      menge: prefill.menge ?? "",
      ep: prefill.ep ?? "",
      posNr: prefill.posNr ?? "",
      grund: "KI: Widerspruch/Abweichung erkannt",
    };
    const url = `/kalkulation/nachtraege?projectId=${encodeURIComponent(projectId)}&prefill=${encodeURIComponent(JSON.stringify(payload))}`;
    window.location.href = url;
  }

  /** Aggiorna davvero il LV usando l'endpoint server /api/lv/update */
  async function updateLV(r?: Row) {
    if (!r) return;
    if (!projectId) { alert("Bitte Projekt-ID eingeben."); return; }
    const payload = {
      projectId,
      posNr: r.posNr,
      kurztext: r.kurztext,
      einheit: r.einheit,
      ep: r.ep,
      quelle: "KI-Vergleich",
    };
    try {
      const res = await api<{ ok: boolean; count: number; updated: boolean }>("/api/lv/update", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      alert(`✅ LV aktualisiert (${res.updated ? "vorhandene Position" : "neu hinzugefügt"})`);
    } catch (e: any) {
      alert("❌ Update fehlgeschlagen: " + (e?.message || e));
    }
  }

  return (
    <div style={{ display: "grid", gap: 16, padding: 16 }}>
      <h1>Widersprüche im LV/Angebot</h1>

      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ marginBottom: 6, fontSize: 13, color: "var(--muted)" }}>Projekt-ID</div>
            <input style={{ ...inp, width: "100%" }} value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="z. B. BA-2025-834" />
          </div>
          <div />
          <div>
            <div style={{ marginBottom: 6, fontSize: 13, color: "var(--muted)" }}>LV (CSV/XLSX)</div>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onLoadLV(e.target.files)} />
            <div style={{ fontSize: 12, opacity: .7, marginTop: 6 }}>
              Colonne consigliate: <code>PosNr, Kurztext, Einheit, Menge, EP</code>
            </div>
          </div>
          <div>
            <div style={{ marginBottom: 6, fontSize: 13, color: "var(--muted)" }}>Angebot (CSV/XLSX)</div>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onLoadAG(e.target.files)} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn" onClick={runCompare} disabled={!lv.length || !ag.length}>Vergleichen</button>
          <button className="btn" onClick={exportCSV} disabled={!diffs.length}>Report exportieren (CSV)</button>
          <div style={{ fontSize: 12, marginLeft: "auto", opacity: .75 }}>
            Geladen: LV {lv.length} Pos. • Angebot {ag.length} Pos.
          </div>
        </div>
        {error && <div style={{ color: "#b91c1c", marginTop: 8 }}>{error}</div>}
      </div>

      {!!diffs.length && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Erkannte Widersprüche</h3>
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
                        <div style={{ fontSize: 12, opacity: .8 }}>{d.lv.einheit} · Menge {num(d.lv.menge)} · EP {num(d.lv.ep)}</div>
                      </>
                    ) : <span style={{ opacity: .6 }}>—</span>}
                  </td>
                  <td style={td}>
                    {d.angebot ? (
                      <>
                        <div style={{ fontWeight: 600 }}>{d.angebot.kurztext}</div>
                        <div style={{ fontSize: 12, opacity: .8 }}>{d.angebot.einheit} · Menge {num(d.angebot.menge)} · EP {num(d.angebot.ep)}</div>
                      </>
                    ) : <span style={{ opacity: .6 }}>—</span>}
                  </td>
                  <td style={td}>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {d.details.map((x, k) => <li key={k} style={{ fontSize: 13 }}>{x}</li>)}
                    </ul>
                  </td>
                  <td style={td}>
                    <div style={{ display: "grid", gap: 6 }}>
                      {(d.type === "missing_in_lv" || d.type === "text_diff" || d.type === "unit_diff" || d.type === "qty_diff" || d.type === "price_diff") && (
                        <button className="btn" onClick={() => gotoNachtrag(d.angebot || d.lv || undefined)}>
                          → Nachtrag erstellen
                        </button>
                      )}
                      {(d.type !== "missing_in_offer") && d.lv && d.angebot && (
                        <button className="btn" onClick={() => updateLV(d.angebot || undefined)}>
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
    </div>
  );
}
