// apps/web/src/pages/ki/Vorschlaege.tsx

import React from "react";
import { useProject } from "../../store/useProject";
import { useKiPropose } from "./useKiPropose";
import { useKiSuggest } from "./useKiSuggest";

type LVPos = {
  id: string;
  posNr: string;
  kurztext: string;
  einheit: string;
  menge: number;
  preis?: number;
};

const LV_KEY = "rlc-ki-autolv";

const LV = {
  list(): LVPos[] {
    try {
      const raw = localStorage.getItem(LV_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalizeBasePos) : [];
    } catch {
      return [];
    }
  },

  bulkUpsert(rows: LVPos[]) {
    const normalized = rows.map(normalizeBasePos);
    localStorage.setItem(LV_KEY, JSON.stringify(normalized));
    return normalized.length;
  },
};

function normalizeBasePos(r: Partial<LVPos>): LVPos {
  return {
    id: String(r.id || crypto.randomUUID()),
    posNr: String(r.posNr || ""),
    kurztext: String(r.kurztext || ""),
    einheit: String(r.einheit || ""),
    menge: toNumber(r.menge, 0),
    preis: toOptionalNumber(r.preis),
  };
}

const card: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "#fff",
};

const inp: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid var(--line)",
  fontSize: 13,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid var(--line)",
  fontSize: 13,
  verticalAlign: "middle",
};

type Row = LVPos & {
  confidence?: number;
  langtext?: string;
};

type ProjectLike = {
  id?: string;
  code?: string;
};

export default function Vorschlaege() {
  const projectCtx = useProject() as unknown as {
    currentProject?: ProjectLike | null;
  };

  const currentProject = projectCtx?.currentProject ?? null;
  const effectiveProject = currentProject?.code || currentProject?.id || "";

  const [desc, setDesc] = React.useState("");
  const [items, setItems] = React.useState<Row[]>([]);
  const [busyAdd, setBusyAdd] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { propose, loading: genLoading } = useKiPropose();
  const { suggest, loading: priceLoading } = useKiSuggest();

  async function handleGenerate() {
    const clean = desc.trim();
    if (!clean) {
      setError("Bitte eine Beschreibung eingeben.");
      return;
    }

    setError(null);

    const out = await propose(clean);
    setItems(Array.isArray(out) ? out.map(normalizeRow) : []);
  }

  async function priceAll() {
    setError(null);

    const next = await Promise.all(
      items.map(async (it) => {
        const s = await suggest(it.kurztext, it.einheit);
        return normalizeRow({
          ...it,
          preis: s?.unitPrice,
          confidence: s?.confidence,
        });
      })
    );

    setItems(next);
  }

  async function addToLV() {
    setBusyAdd(true);
    setError(null);

    try {
      LV.bulkUpsert(
        items.map((i) => ({
          id: i.id || crypto.randomUUID(),
          posNr: String(i.posNr || "").trim(),
          kurztext: String(i.kurztext || "").trim(),
          einheit: String(i.einheit || "").trim(),
          menge: toNumber(i.menge, 0),
          preis: toOptionalNumber(i.preis),
        }))
      );

      window.alert(`${items.length} Positionen in LV eingefügt.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fehler beim Übernehmen ins LV";
      setError(msg);
    } finally {
      setBusyAdd(false);
    }
  }

  function patchRow(id: string, patch: Partial<Row>) {
    setItems((prev) =>
      prev.map((x) => (x.id === id ? normalizeRow({ ...x, ...patch }) : x))
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={card}>
        <h1 style={{ margin: "0 0 10px" }}>Vorschläge (KI)</h1>

        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
          Projekt: {effectiveProject || "—"}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 220px",
            gap: 12,
          }}
        >
          <textarea
            style={{ ...inp, minHeight: 110 }}
            placeholder="Projektbeschreibung… (Ort, Gewerke, Leitungen/Trassen, Straßentyp, Tiefen, Materialien, Mengen grob…)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              className="btn"
              onClick={handleGenerate}
              disabled={!desc.trim() || genLoading}
            >
              {genLoading ? "Generiere…" : "Vorschläge generieren"}
            </button>

            <button
              className="btn"
              onClick={priceAll}
              disabled={items.length === 0 || priceLoading}
            >
              {priceLoading ? "Bepreise…" : "KI-Preise berechnen"}
            </button>

            <button
              className="btn"
              onClick={addToLV}
              disabled={items.length === 0 || busyAdd}
            >
              {busyAdd ? "Füge hinzu…" : "→ In LV übernehmen"}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Kap.</th>
              <th style={th}>Pos-Nr</th>
              <th style={th}>Kurztext</th>
              <th style={th}>Einheit</th>
              <th style={th}>Menge</th>
              <th style={th}>E-Preis [€]</th>
              <th style={th}>Confidence</th>
            </tr>
          </thead>

          <tbody>
            {items.map((r) => {
              const kap = getChapter(r.posNr);

              return (
                <tr key={r.id}>
                  <td style={td}>{kap}</td>

                  <td style={td}>
                    <input
                      style={{ ...inp, width: 90 }}
                      value={r.posNr || ""}
                      onChange={(e) => patchRow(r.id, { posNr: e.target.value })}
                    />
                  </td>

                  <td style={td}>
                    <input
                      style={{ ...inp, width: "100%" }}
                      value={r.kurztext}
                      onChange={(e) => patchRow(r.id, { kurztext: e.target.value })}
                    />
                  </td>

                  <td style={td}>
                    <input
                      style={{ ...inp, width: 70 }}
                      value={r.einheit}
                      onChange={(e) => patchRow(r.id, { einheit: e.target.value })}
                    />
                  </td>

                  <td style={td}>
                    <input
                      style={{ ...inp, width: 90, textAlign: "right" }}
                      type="number"
                      value={r.menge ?? 0}
                      onChange={(e) =>
                        patchRow(r.id, { menge: toNumber(e.target.value, 0) })
                      }
                    />
                  </td>

                  <td style={td}>
                    <input
                      style={{ ...inp, width: 100, textAlign: "right" }}
                      type="number"
                      value={r.preis ?? ""}
                      onChange={(e) =>
                        patchRow(r.id, {
                          preis:
                            e.target.value === ""
                              ? undefined
                              : toNumber(e.target.value, 0),
                        })
                      }
                    />
                  </td>

                  <td style={td}>
                    {r.confidence != null
                      ? `${Math.round(r.confidence * 100)}%`
                      : "—"}
                  </td>
                </tr>
              );
            })}

            {items.length === 0 && (
              <tr>
                <td style={{ ...td, opacity: 0.6 }} colSpan={7}>
                  Noch keine Vorschläge.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getChapter(posNr?: string) {
  if (!posNr) return "—";
  const m = posNr.match(/^(\d{2})/);
  return m ? m[1] : "—";
}

function toNumber(v: unknown, fallback = 0): number {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
      ? Number(v.replace(",", "."))
      : Number(v);

  return Number.isFinite(n) ? n : fallback;
}

function toOptionalNumber(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
      ? Number(v.replace(",", "."))
      : Number(v);

  return Number.isFinite(n) ? n : undefined;
}

function clamp01(n?: number): number | undefined {
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(1, n));
}

function normalizeRow(r: Partial<Row>): Row {
  return {
    id: String(r.id || crypto.randomUUID()),
    posNr: String(r.posNr || ""),
    kurztext: String(r.kurztext || ""),
    langtext: r.langtext ? String(r.langtext) : "",
    einheit: String(r.einheit || ""),
    menge: toNumber(r.menge, 0),
    preis: toOptionalNumber(r.preis),
    confidence: clamp01(toOptionalNumber(r.confidence)),
  };
}





