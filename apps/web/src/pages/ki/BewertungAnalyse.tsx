import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/ki/BewertungAnalyse.tsx

import React from "react";
import * as XLSX from "xlsx";
import { useProject } from "../../store/useProject";
import { apiUrl } from "../../lib/apiBase";
import { saveProjectLvPosition } from "../../api/projectLvCompat";

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
  totals: {sumEPxQty: number;};
  score?: number;
  notes?: string;
};

type DiffType =
"match" |
"text_diff" |
"unit_diff" |
"qty_diff" |
"price_diff" |
"missing_in_offer" |
"missing_in_lv";

type DiffRow = {
  posNr: string;
  lv?: Row | null;
  angebot?: Row | null;
  type: DiffType;
  details: string[];
};

const card: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  background: "#FFFFFF",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};

const inp: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 11px",
  fontSize: 13,
  color: "#0F172A",
  background: "#FFFFFF"
};

const button: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  borderRadius: 10,
  padding: "9px 12px",
  background: "#FFFFFF",
  color: "#0F172A",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer"
};

const tbl: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse"
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #CBD5E1",
  whiteSpace: "nowrap",
  background: "#F8FAFC",
  color: "#334155",
  fontSize: 12,
  fontWeight: 700
};

const td: React.CSSProperties = {
  padding: "9px 12px",
  borderBottom: "1px solid #E5E7EB",
  verticalAlign: "top",
  color: "#0F172A",
  fontSize: 13
};

function num(n?: number) {
  return Number.isFinite(n) ?
  (n as number).toLocaleString("de-DE", { maximumFractionDigits: 2 }) :
  "";
}

function toNumber(v: unknown) {
  if (v == null || v === "") return undefined;
  const raw = String(v).trim();

  if (!raw) return undefined;

  const normalized = raw.
  replace(/\s/g, "").
  replace(/\.(?=\d{3}(?:\D|$))/g, "").
  replace(",", ".");

  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeHeader(h: string) {
  const s = h.trim().toLowerCase();

  if (/^pos/.test(s) || s === "position" || s === "positionsnummer" || s === "nr") {
    return "posNr";
  }
  if (/kurz|kurztext|bezeichnung|beschreibung|langtext/.test(s)) {
    return "kurztext";
  }
  if (/einheit|me|unit/.test(s)) {
    return "einheit";
  }
  if (/menge|qty|anzahl|mengen?/.test(s)) {
    return "menge";
  }
  if (/^ep$|einheitspreis|preis/.test(s)) {
    return "ep";
  }

  return s;
}

function rowFromObj(o: Record<string, any>): Row | null {
  const m: Record<string, any> = {};

  for (const [k, v] of Object.entries(o)) {
    m[normalizeHeader(k)] = v;
  }

  const pos = String(m.posNr ?? "").trim();
  if (!pos) return null;

  return {
    posNr: pos,
    kurztext: String(m.kurztext ?? "").trim(),
    einheit: String(m.einheit ?? "").trim(),
    menge: toNumber(m.menge),
    ep: toNumber(m.ep)
  };
}

async function readXlsxOrCsv(file: File): Promise<Row[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const firstSheet = wb.SheetNames[0];
  const ws = wb.Sheets[firstSheet];
  const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
    raw: false,
    defval: ""
  });

  const rows: Row[] = [];
  for (const obj of json) {
    const r = rowFromObj(obj);
    if (r) rows.push(r);
  }

  return rows;
}

function textSim(a: string, b: string) {
  const aa = String(a || "").toLowerCase().trim();
  const bb = String(b || "").toLowerCase().trim();

  if (!aa && !bb) return 1;
  if (!aa || !bb) return 0;

  const A = new Set(aa.split(/\W+/).filter(Boolean));
  const B = new Set(bb.split(/\W+/).filter(Boolean));

  if (!A.size && !B.size) return 1;
  if (!A.size || !B.size) return 0;

  let inter = 0;
  for (const w of A) {
    if (B.has(w)) inter++;
  }

  return inter / Math.max(A.size, B.size);
}

function compare(lv: Row[], angebot: Row[]): DiffRow[] {
  const mapLV = new Map(lv.map((r) => [r.posNr, r]));
  const mapAG = new Map(angebot.map((r) => [r.posNr, r]));
  const allKeys = new Set([...mapLV.keys(), ...mapAG.keys()]);
  const diffs: DiffRow[] = [];

  for (const key of Array.from(allKeys).sort()) {
    const L = mapLV.get(key) || null;
    const A = mapAG.get(key) || null;

    if (L && !A) {
      diffs.push({
        posNr: key,
        lv: L,
        angebot: null,
        type: "missing_in_offer",
        details: ["Im Angebot fehlt diese Position."]
      });
      continue;
    }

    if (!L && A) {
      diffs.push({
        posNr: key,
        lv: null,
        angebot: A,
        type: "missing_in_lv",
        details: ["Im LV fehlt diese Position."]
      });
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
      if (type === "match") type = "unit_diff";
    }

    const lvQty = L!.menge ?? 0;
    const agQty = A!.menge ?? 0;
    const dQty = lvQty - agQty;

    if (Math.abs(dQty) > 1e-6) {
      details.push(`Menge: LV=${num(lvQty)} • Angebot=${num(agQty)} (Δ ${num(-dQty)})`);
      if (type === "match") type = "qty_diff";
    }

    const lvEP = L!.ep ?? 0;
    const agEP = A!.ep ?? 0;
    const dEP = lvEP - agEP;

    if (Math.abs(dEP) > 1e-6) {
      details.push(`EP (netto): LV=${num(lvEP)} • Angebot=${num(agEP)} (Δ ${num(-dEP)})`);
      if (type === "match") type = "price_diff";
    }

    diffs.push({
      posNr: key,
      lv: L!,
      angebot: A!,
      type,
      details
    });
  }

  return diffs;
}

function badge(t: DiffType) {
  const base: React.CSSProperties = {
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    display: "inline-block"
  };

  const map: Record<DiffType, React.CSSProperties> = {
    match: { background: "#eaf7ef", color: "#0a6b3a" },
    text_diff: { background: "#fff7ed", color: "#9a3412" },
    unit_diff: { background: "#fef9c3", color: "#a16207" },
    qty_diff: { background: "#fef9c3", color: "#a16207" },
    price_diff: { background: "#e0e7ff", color: "#3730a3" },
    missing_in_offer: { background: "#fee2e2", color: "#991b1b" },
    missing_in_lv: { background: "#fae8ff", color: "#6b21a8" }
  };

  const label: Record<DiffType, string> = {
    match: "ok",
    text_diff: "Text",
    unit_diff: "Einheit",
    qty_diff: "Menge",
    price_diff: "Preis",
    missing_in_offer: "Fehlt im Angebot",
    missing_in_lv: "Fehlt im LV"
  };

  return <span className={rlcClass(null, { ...base, ...(map[t] || {}) })}>{label[t]}</span>;
}

function authHeaders(extra?: Record<string, string>): HeadersInit {
  let token = "";
  try {
    token =
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("rlc_token") ||
    "";
  } catch {


    // Browser-Speicher nicht verfügbar
  }return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function normalizeWeights(w: {price: number;unit: number;qty: number;text: number;}) {
  const safe = {
    price: clamp01(w.price),
    unit: clamp01(w.unit),
    qty: clamp01(w.qty),
    text: clamp01(w.text)
  };

  const sum = safe.price + safe.unit + safe.qty + safe.text;
  if (sum <= 0) {
    return { price: 0.25, unit: 0.25, qty: 0.25, text: 0.25 };
  }

  return {
    price: safe.price / sum,
    unit: safe.unit / sum,
    qty: safe.qty / sum,
    text: safe.text / sum
  };
}

function clamp01(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export default function BewertungAnalyse({ embedded = false }: {embedded?: boolean;}) {
  const projectCtx = useProject() as any;
  const contextProjectId = String(
    projectCtx?.projectCode ||
    projectCtx?.currentProject?.code ||
    projectCtx?.projectId ||
    projectCtx?.currentProjectId ||
    projectCtx?.currentProject?.id ||
    ""
  ).trim();

  const [projectId, setProjectId] = React.useState(contextProjectId);
  const [lv, setLV] = React.useState<Row[]>([]);
  const [offers, setOffers] = React.useState<Offer[]>([]);
  const [weights, setWeights] = React.useState({
    price: 0.6,
    unit: 0.15,
    qty: 0.15,
    text: 0.1
  });
  const [aiSummary, setAiSummary] = React.useState("");

  const [selectedOfferId, setSelectedOfferId] = React.useState<string | null>(null);
  const [diffs, setDiffs] = React.useState<DiffRow[]>([]);
  const [serverStatus, setServerStatus] = React.useState("");

  React.useEffect(() => {
    if (!projectId.trim() && contextProjectId) setProjectId(contextProjectId);
  }, [contextProjectId, projectId]);

  const validOffers = React.useMemo(() => offers.filter(Boolean).filter((o) => !!o?.id), [offers]);
  const normalizedWeights = React.useMemo(() => normalizeWeights(weights), [weights]);

  async function loadLV(files: FileList | null) {
    if (!files || !files[0]) return;
    const rows = await readXlsxOrCsv(files[0]);
    setLV(rows);
    setDiffs([]);
    setAiSummary("");
  }

  async function loadOffer(i: number, files: FileList | null) {
    if (!files || !files[0]) return;

    const rows = await readXlsxOrCsv(files[0]);
    const totals = {
      sumEPxQty: rows.reduce((s, r) => s + (r.menge ?? 0) * (r.ep ?? 0), 0)
    };

    setOffers((prev) => {
      const id = prev[i]?.id || crypto.randomUUID();
      const name = files[0].name;
      const next = [...prev];
      next[i] = { id, name, rows, totals };
      return next;
    });

    setDiffs([]);
    setAiSummary("");
  }

  function calcScores() {
    if (!lv.length || !validOffers.length) {
      alert("LV und mindestens ein Angebot sind erforderlich.");
      return;
    }

    const totals = validOffers.map((o) => o.totals.sumEPxQty || 0);
    const min = Math.min(...totals);
    const max = Math.max(...totals);

    const mapLV = new Map(lv.map((r) => [r.posNr, r]));

    const results = validOffers.
    map((off) => {
      const priceScore = max === min ? 1 : 1 - (off.totals.sumEPxQty - min) / (max - min);

      let unitOK = 0;
      let unitTot = 0;
      let qtyScore = 0;
      let qtyTot = 0;
      let textScoreAcc = 0;
      let textTot = 0;

      for (const r of off.rows) {
        const L = mapLV.get(r.posNr);
        if (!L) continue;

        unitTot++;
        if ((L.einheit || "").trim() === (r.einheit || "").trim()) unitOK++;

        qtyTot++;
        const lq = L.menge ?? 0;
        const aq = r.menge ?? 0;
        const q =
        lq === 0 && aq === 0 ?
        1 :
        1 - Math.min(1, Math.abs(lq - aq) / Math.max(1e-9, Math.abs(lq)));

        qtyScore += Math.max(0, q);

        textTot++;
        textScoreAcc += textSim(L.kurztext, r.kurztext);
      }

      const unitScore = unitTot ? unitOK / unitTot : 0.5;
      const qtySc = qtyTot ? qtyScore / qtyTot : 0.5;
      const textSc = textTot ? textScoreAcc / textTot : 0.5;

      const total =
      normalizedWeights.price * priceScore +
      normalizedWeights.unit * unitScore +
      normalizedWeights.qty * qtySc +
      normalizedWeights.text * textSc;

      return {
        ...off,
        score: Math.round(total * 1000) / 1000
      };
    }).
    sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    setOffers(results);
  }

  async function runAIReview() {
    if (!validOffers.length) return;

    try {
      const body = {
        projectId,
        lv: lv.slice(0, 60),
        offers: validOffers.map((o) => ({
          id: o.id,
          name: o.name,
          total: o.totals.sumEPxQty,
          score: o.score ?? 0,
          sample: o.rows.slice(0, 40)
        })),
        weights: normalizedWeights
      };

      const res = await fetch(apiUrl("/api/ki/offer-review"), {
        method: "POST",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      setAiSummary(data.summary || "");

      if (Array.isArray(data.perOffer)) {
        setOffers((prev) =>
        prev.map((o) => {
          const match = data.perOffer.find((x: any) => x?.id === o.id || x?.name === o.name);
          return { ...o, notes: match?.notes || o.notes };
        })
        );
      }
    } catch (e: any) {
      alert(e?.message || "KI-Review fehlgeschlagen");
    }
  }

  function showDiffs(i: number) {
    const off = validOffers[i];
    if (!off) return;

    setSelectedOfferId(off.id);
    setDiffs(compare(lv, off.rows));

    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: "smooth"
    });
  }

  function gotoNachtrag(prefill: Partial<Row>) {
    const payload = {
      projectId,
      kurztext: prefill.kurztext ?? "",
      einheit: prefill.einheit ?? "",
      menge: prefill.menge ?? "",
      ep: prefill.ep ?? "",
      posNr: prefill.posNr ?? "",
      grund: "KI: Abweichung in Angebotsanalyse"
    };

    const url = `/kalkulation/nachtraege?projectId=${encodeURIComponent(
      projectId
    )}&prefill=${encodeURIComponent(JSON.stringify(payload))}`;

    window.location.href = url;
  }

  async function updateLV(r: Row | undefined) {
    if (!r) return;
    if (!projectId.trim()) {
      alert("Projekt-ID fehlt.");
      return;
    }

    try {
      await saveProjectLvPosition(projectId.trim(), {
        posNr: r.posNr,
        kurztext: r.kurztext,
        einheit: r.einheit,
        menge: r.menge ?? null,
        preis: r.ep ?? null,
        quelle: "Bewertung/Angebotsanalyse"
      });
      alert("LV-Position hinzugefügt/aktualisiert.");
    } catch (e: any) {
      alert(e?.message || "LV-Update fehlgeschlagen");
    }
  }

  async function saveRankingToServer() {
    if (!projectId.trim()) {
      setServerStatus("Kein Projekt gewählt.");
      return;
    }

    try {
      setServerStatus("Speichere Angebotsranking auf Server …");
      const res = await fetch(
        apiUrl(`/api/kalkulation/storage/angebotsranking/${encodeURIComponent(projectId.trim())}/save`),
        {
          method: "POST",
          credentials: "include",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            data: {
              projectId: projectId.trim(),
              lv,
              offers,
              weights,
              aiSummary,
              selectedOfferId,
              diffs,
              savedAt: new Date().toISOString()
            }
          })
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setServerStatus("Angebotsranking auf Server gespeichert.");
    } catch (e: any) {
      setServerStatus(`Server-Speichern fehlgeschlagen: ${e?.message || e}`);
    }
  }

  async function loadRankingFromServer() {
    if (!projectId.trim()) {
      setServerStatus("Kein Projekt gewählt.");
      return;
    }

    try {
      setServerStatus("Lade Angebotsranking vom Server …");
      const res = await fetch(
        apiUrl(`/api/kalkulation/storage/angebotsranking/${encodeURIComponent(projectId.trim())}`),
        { credentials: "include", headers: authHeaders() }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      const data = json?.data || {};
      setLV(Array.isArray(data.lv) ? data.lv : []);
      setOffers(Array.isArray(data.offers) ? data.offers : []);
      if (data.weights) setWeights(data.weights);
      setAiSummary(String(data.aiSummary || ""));
      setSelectedOfferId(data.selectedOfferId || null);
      setDiffs(Array.isArray(data.diffs) ? data.diffs : []);
      setServerStatus(json?.exists ? "Angebotsranking vom Server geladen." : "Kein gespeichertes Ranking gefunden.");
    } catch (e: any) {
      setServerStatus(`Server-Laden fehlgeschlagen: ${e?.message || e}`);
    }
  }

  const selectedOffer = validOffers.find((o) => o.id === selectedOfferId) || null;

  return (
    <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-956">
      {!embedded ? <h1>Bewertung & Angebotsanalyse</h1> : null}

      <div className={rlcClass(null, card)}>
        <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-957">
          <div>
            <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-958">
              Projekt-ID
            </div>
            <input className={rlcClass(null,
            { ...inp, width: "100%" })}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="z. B. BA-2025-834" />
            
          </div>
        </div>

        <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-959">






          
          <div>
            <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-960">
              LV (CSV/XLSX)
            </div>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => loadLV(e.target.files)} />
          </div>
          <div />
        </div>

        <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-961">






          
          {[0, 1, 2].map((i) =>
          <div key={i}>
              <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-962">
                Angebot {i + 1}
              </div>
              <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => loadOffer(i, e.target.files)} />
            
              {offers[i] &&
            <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-963">
                  <div>
                    <strong>{offers[i].name}</strong>
                  </div>
                  <div>Summe (EP×Menge): {num(offers[i].totals.sumEPxQty)} €</div>
                </div>
            }
            </div>
          )}
        </div>

        <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-964">








          
          <Weight
            label="Preis"
            value={weights.price}
            onChange={(v) => setWeights((p) => ({ ...p, price: v }))} />
          
          <Weight
            label="Einheit"
            value={weights.unit}
            onChange={(v) => setWeights((p) => ({ ...p, unit: v }))} />
          
          <Weight
            label="Menge"
            value={weights.qty}
            onChange={(v) => setWeights((p) => ({ ...p, qty: v }))} />
          
          <Weight
            label="Text"
            value={weights.text}
            onChange={(v) => setWeights((p) => ({ ...p, text: v }))} />
          
        </div>

        <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-965">
          Normalisierte Gewichte: Preis {normalizedWeights.price.toFixed(2)} · Einheit{" "}
          {normalizedWeights.unit.toFixed(2)} · Menge {normalizedWeights.qty.toFixed(2)} · Text{" "}
          {normalizedWeights.text.toFixed(2)}
        </div>

        <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-966">
          <button className={rlcClass(null, button)} onClick={calcScores} disabled={!lv.length || !validOffers.length}>
            Punkte berechnen & ranken
          </button>

          <button className={rlcClass(null, button)} onClick={runAIReview} disabled={!validOffers.length}>
            KI-Bewertung erzeugen
          </button>
          <button className={rlcClass(null, button)} onClick={saveRankingToServer} disabled={!projectId.trim() || !validOffers.length}>
            Server speichern
          </button>
          <button className={rlcClass(null, button)} onClick={loadRankingFromServer} disabled={!projectId.trim()}>
            Server laden
          </button>

          <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-967">
            Geladen: LV {lv.length} Pos. • Angebote {validOffers.length}
          </div>
        </div>
        {serverStatus ? <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-968">{serverStatus}</div> : null}
      </div>

      {!!validOffers.length &&
      <div className={rlcClass(null, card)}>
          <h3 className="rlc-migrated-pages-ki-bewertunganalyse-tsx-969">Ranking</h3>
          <table className={rlcClass(null, tbl)}>
            <thead>
              <tr>
                <th className={rlcClass(null, th)}>#</th>
                <th className={rlcClass(null, th)}>Angebot</th>
                <th className={rlcClass(null, th)}>Summe (EP×Menge)</th>
                <th className={rlcClass(null, th)}>Score (0–1)</th>
                <th className={rlcClass(null, th)}>KI-Hinweise</th>
                <th className={rlcClass(null, th)}></th>
              </tr>
            </thead>
            <tbody>
              {validOffers.map((o, i) =>
            <tr key={o.id}>
                  <td className={rlcClass(null, td)}>{i + 1}</td>
                  <td className={rlcClass(null, td)}>
                    <strong>{o.name}</strong>
                  </td>
                  <td className={rlcClass(null, td)}>{num(o.totals.sumEPxQty)} €</td>
                  <td className={rlcClass(null, td)}>{o.score != null ? o.score.toFixed(3) : "—"}</td>
                  <td className={rlcClass(null, td)}>
                    {o.notes ?
                <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-970">{o.notes}</div> :

                <span className="rlc-migrated-pages-ki-bewertunganalyse-tsx-971">—</span>
                }
                  </td>
                  <td className={rlcClass(null, td)}>
                    <button className={rlcClass(null, button)} onClick={() => showDiffs(i)} disabled={!lv.length}>
                      Abweichungen anzeigen
                    </button>
                  </td>
                </tr>
            )}
            </tbody>
          </table>
        </div>
      }

      {!!diffs.length &&
      <div className={rlcClass(null, card)}>
          <h3 className="rlc-migrated-pages-ki-bewertunganalyse-tsx-972">
            Abweichungen – {selectedOffer ? selectedOffer.name : ""}
          </h3>

          <table className={rlcClass(null, tbl)}>
            <thead>
              <tr>
                <th className={rlcClass(null, th)}>Pos</th>
                <th className={rlcClass(null, th)}>Typ</th>
                <th className={rlcClass(null, th)}>LV</th>
                <th className={rlcClass(null, th)}>Angebot</th>
                <th className={rlcClass(null, th)}>Details</th>
                <th className={rlcClass(null, th)}></th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((d, i) => {
              const nachtragBase = d.angebot ?? d.lv;
              const canCreateNachtrag =
              (d.type === "missing_in_lv" ||
              d.type === "text_diff" ||
              d.type === "unit_diff" ||
              d.type === "qty_diff" ||
              d.type === "price_diff") &&
              !!nachtragBase;

              const canUpdateLv = d.type !== "missing_in_offer" && d.angebot != null;

              return (
                <tr key={`${d.posNr}-${i}`}>
                    <td className={rlcClass(null, { ...td, fontWeight: 600 })}>{d.posNr}</td>
                    <td className={rlcClass(null, td)}>{badge(d.type)}</td>

                    <td className={rlcClass(null, td)}>
                      {d.lv ?
                    <>
                          <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-973">{d.lv.kurztext}</div>
                          <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-974">
                            {d.lv.einheit} · Menge {num(d.lv.menge)} · EP {num(d.lv.ep)}
                          </div>
                        </> :

                    <span className="rlc-migrated-pages-ki-bewertunganalyse-tsx-975">—</span>
                    }
                    </td>

                    <td className={rlcClass(null, td)}>
                      {d.angebot ?
                    <>
                          <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-976">{d.angebot.kurztext}</div>
                          <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-977">
                            {d.angebot.einheit} · Menge {num(d.angebot.menge)} · EP {num(d.angebot.ep)}
                          </div>
                        </> :

                    <span className="rlc-migrated-pages-ki-bewertunganalyse-tsx-978">—</span>
                    }
                    </td>

                    <td className={rlcClass(null, td)}>
                      <ul className="rlc-migrated-pages-ki-bewertunganalyse-tsx-979">
                        {d.details.map((x, k) =>
                      <li key={k} className="rlc-migrated-pages-ki-bewertunganalyse-tsx-980">
                            {x}
                          </li>
                      )}
                      </ul>
                    </td>

                    <td className={rlcClass(null, td)}>
                      <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-981">
                        {canCreateNachtrag && nachtragBase &&
                      <button className={rlcClass(null,
                      button)}
                      onClick={() => gotoNachtrag(nachtragBase)}>
                        
                            → Nachtrag erstellen
                          </button>
                      }

                        {(() => {
                        const angebotRow = d.angebot ?? undefined;
                        if (!canUpdateLv || !angebotRow) return null;

                        return (
                          <button className={rlcClass(null,
                          button)}
                          onClick={() => updateLV(angebotRow)}>
                            
      → LV aktualisieren
    </button>);

                      })()}
                      </div>
                    </td>
                  </tr>);

            })}
            </tbody>
          </table>
        </div>
      }

      {aiSummary &&
      <div className={rlcClass(null, card)}>
          <h3 className="rlc-migrated-pages-ki-bewertunganalyse-tsx-982">KI-Zusammenfassung</h3>
          <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-983">{aiSummary}</div>
        </div>
      }
    </div>);

}

function Weight({
  label,
  value,
  onChange




}: {label: string;value: number;onChange: (v: number) => void;}) {
  return (
    <label className="rlc-migrated-pages-ki-bewertunganalyse-tsx-984">
      <div className="rlc-migrated-pages-ki-bewertunganalyse-tsx-985">
        {label} – {value.toFixed(2)}
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      
    </label>);

}
