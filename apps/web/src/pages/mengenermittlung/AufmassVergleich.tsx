// apps/web/src/pages/mengenermittlung/SollIst.tsx
import React from "react";
import { useProject } from "../../store/useProject";

const API_BASE =
  (import.meta as any)?.env?.VITE_API_URL || "http://localhost:4000/api";

/** Tipi di riga normalizzati */
type Row = {
  pos: string;
  text?: string;
  unit?: string;
  soll?: number;   // LV
  ist?: number;    // Aufmaß
  ep?: number;     // opzionale
};

type Joined = {
  pos: string;
  text: string;
  unit: string;
  soll: number;
  ist: number;
  diff: number;
  diffPct: number; // in %
  ep: number;
  totalSoll: number;
  totalIst: number;
};

const fmtEUR = (v: number) => "€ " + (isFinite(v) ? v.toFixed(2) : "0.00");
const num = (v: any) => {
  if (v == null) return 0;
  const n = Number(String(v).replace(",", "."));
  return isFinite(n) ? n : 0;
};
const normPos = (s: string) =>
  (s || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/^0+(\d)/, "$1"); // leva zeri iniziali singolarmente

/** Parser CSV minimale: separatore ; o , auto */
function parseCSV(text: string): any[] {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const sep = l.includes(";") ? ";" : ",";
      return l
        .split(sep)
        .map((c) => c.replace(/^"(.*)"$/, "$1").trim());
    });

  if (rows.length === 0) return [];
  const looksHeader = rows[0].some((h) =>
    /pos|kurz|text|einheit|soll|ist|ep/i.test(h)
  );
  const data = looksHeader ? rows.slice(1) : rows;

  return data.map((cols) => {
    const [c0, c1, c2, c3, c4, c5] = cols;
    const obj: any = {};
    obj.pos =
      /[0-9]+\.[0-9]+/.test(c0) || /[0-9]{3,}/.test(c0) ? c0 : (c1 || c0);
    obj.text = c1 && c1 !== obj.pos ? c1 : c2;
    obj.unit = c2 && c2 !== obj.text ? c2 : c3;
    obj.soll = num(c3);
    obj.ist = num(c4);
    obj.ep = num(c5);
    return obj;
  });
}

/** Parser JSON (array di oggetti) */
function parseJSON(text: string): any[] {
  try {
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Normalizza oggetto generico a Row */
function toRow(raw: any, kind: "soll" | "ist"): Row {
  return {
    pos: normPos(String(raw.pos ?? raw.Pos ?? raw.position ?? "")),
    text: raw.text ?? raw.kurztext ?? raw.Kurztext ?? "",
    unit: raw.unit ?? raw.einheit ?? raw.Einheit ?? "",
    soll:
      kind === "soll"
        ? num(raw.soll ?? raw.Soll ?? raw.lv ?? raw.LV ?? raw.menge)
        : undefined,
    ist:
      kind === "ist"
        ? num(raw.ist ?? raw.Ist ?? raw.abgerechnet ?? raw.menge)
        : undefined,
    ep: num(raw.ep ?? raw.EP ?? raw.einheitspreis),
  };
}

/** Merge per pos */
function joinRows(sollRows: Row[], istRows: Row[]): Joined[] {
  const map = new Map<string, Row>();

  sollRows.forEach((r) => {
    const key = r.pos;
    const ex = map.get(key) || { pos: key };
    map.set(key, { ...ex, ...r });
  });
  istRows.forEach((r) => {
    const key = r.pos;
    const ex = map.get(key) || { pos: key };
    map.set(key, { ...ex, ...r });
  });

  const out: Joined[] = [];
  map.forEach((r) => {
    const soll = num(r.soll);
    const ist = num(r.ist);
    const ep = num(r.ep);
    const diff = soll - ist;
    const base = soll !== 0 ? soll : Math.max(1, ist);
    const diffPct = base ? (diff / base) * 100 : 0;
    out.push({
      pos: r.pos,
      text: r.text || "",
      unit: r.unit || "",
      soll,
      ist,
      diff,
      diffPct,
      ep,
      totalSoll: soll * ep,
      totalIst: ist * ep,
    });
  });

  out.sort((a, b) =>
    a.pos.localeCompare(b.pos, undefined, { numeric: true })
  );
  return out;
}

export default function SollIst() {
  const currentProject = useProject((s) => s.currentProject);
  const [sollSrc, setSollSrc] = React.useState("");
  const [istSrc, setIstSrc] = React.useState("");
  const [rows, setRows] = React.useState<Joined[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const sumSoll = rows.reduce((s, r) => s + r.soll, 0);
  const sumIst = rows.reduce((s, r) => s + r.ist, 0);
  const sumDiff = sumSoll - sumIst;
  const sumTotSoll = rows.reduce((s, r) => s + r.totalSoll, 0);
  const sumTotIst = rows.reduce((s, r) => s + r.totalIst, 0);

  const parseAndJoin = React.useCallback(() => {
    const parse = (txt: string, kind: "soll" | "ist"): Row[] => {
      const t = txt.trim();
      if (!t) return [];
      const isJson = t.startsWith("[") || t.startsWith("{");
      const arr = isJson ? parseJSON(t) : parseCSV(t);
      return arr.map((o) => toRow(o, kind)).filter((r) => r.pos);
    };
    const sRows = parse(sollSrc, "soll");
    const iRows = parse(istSrc, "ist");
    setRows(joinRows(sRows, iRows));
  }, [sollSrc, istSrc]);

  React.useEffect(() => {
    parseAndJoin();
  }, [parseAndJoin]);

  const onFile = (kind: "soll" | "ist", f: File | null) => {
    if (!f) return;
    f.text().then((t) =>
      kind === "soll" ? setSollSrc(t) : setIstSrc(t)
    );
  };

  const exportCsv = () => {
    const header = [
      "Pos",
      "Kurztext",
      "Einheit",
      "LV (Soll)",
      "Ist (Abgerechnet)",
      "Differenz",
      "Diff (%)",
      "EP (€)",
      "Gesamt Soll (€)",
      "Gesamt Ist (€)",
    ];
    const lines = rows.map((r) => [
      r.pos,
      r.text.replaceAll('"', '""'),
      r.unit,
      r.soll.toString().replace(".", ","),
      r.ist.toString().replace(".", ","),
      r.diff.toString().replace(".", ","),
      r.diffPct.toFixed(2).replace(".", ","),
      r.ep.toFixed(2).replace(".", ","),
      r.totalSoll.toFixed(2).replace(".", ","),
      r.totalIst.toFixed(2).replace(".", ","),
    ]);
    const csv = [header, ...lines]
      .map((a) => a.map((c) => `"${c}"`).join(";"))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "aufmass_vergleich.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const tint = (diff: number): string => {
    if (Math.abs(diff) < 1e-9) return "#eaf7ea"; // uguali
    if (diff > 0) return "#fff4e5"; // manca
    return "#fdecea"; // sopra Soll
  };

  const loadFromServer = async () => {
    if (!currentProject?.id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `${API_BASE}/aufmass/vergleich?projectId=${encodeURIComponent(
          currentProject.id
        )}`
      );
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const sRows = (data.soll || []).map((o: any) =>
        toRow(o, "soll")
      );
      const iRows = (data.ist || []).map((o: any) =>
        toRow(o, "ist")
      );
      setRows(joinRows(sRows, iRows));
      // opzionale: mostri anche i dati grezzi nei textarea in formato JSON
      setSollSrc(JSON.stringify(data.soll || [], null, 2));
      setIstSrc(JSON.stringify(data.ist || [], null, 2));
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Fehler beim Laden vom Server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ padding: 10 }}>
      {/* Header stile AufmassEditor */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16 }}>
          Aufmaßvergleich: Soll–Ist
        </div>
        {currentProject && (
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Projekt: <b>{currentProject.code}</b> – {currentProject.name}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button
          className="btn"
          onClick={loadFromServer}
          disabled={!currentProject || loading}
        >
          Vom Server laden
        </button>
        <button className="btn" onClick={exportCsv}>
          CSV exportieren
        </button>
      </div>

      {error && (
        <div
          className="card"
          style={{
            marginBottom: 10,
            padding: 8,
            color: "#b00020",
            fontSize: 13,
          }}
        >
          Fehler: {error}
        </div>
      )}

      {/* Sorgenti (come “Eingabe-Bereich” in AufmassEditor) */}
      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <div>
            <div style={lbl}>LV (Soll) – Datei oder Text einfügen</div>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 6,
                alignItems: "center",
              }}
            >
              <input
                type="file"
                onChange={(e) =>
                  onFile("soll", e.target.files?.[0] ?? null)
                }
              />
              <button
                className="btn"
                type="button"
                onClick={() => setSollSrc("")}
              >
                Leeren
              </button>
            </div>
            <textarea
              value={sollSrc}
              onChange={(e) => setSollSrc(e.target.value)}
              placeholder={`CSV oder JSON. Typische Spalten: pos;text;unit;soll;ep`}
              style={ta}
            />
          </div>
          <div>
            <div style={lbl}>Aufmaß (Ist) – Datei oder Text einfügen</div>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 6,
                alignItems: "center",
              }}
            >
              <input
                type="file"
                onChange={(e) =>
                  onFile("ist", e.target.files?.[0] ?? null)
                }
              />
              <button
                className="btn"
                type="button"
                onClick={() => setIstSrc("")}
              >
                Leeren
              </button>
            </div>
            <textarea
              value={istSrc}
              onChange={(e) => setIstSrc(e.target.value)}
              placeholder={`CSV oder JSON. Typische Spalten: pos;text;unit;ist;ep`}
              style={ta}
            />
          </div>
        </div>
      </div>

      {/* Tabella confronto – stile Tabelle AufmassEditor */}
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: 800,
          }}
        >
          <thead>
            <tr>
              <th style={th}>Pos.</th>
              <th style={th}>Kurztext</th>
              <th style={th}>Einheit</th>
              <th style={th}>LV (Soll)</th>
              <th style={th}>Ist (Abgerechnet)</th>
              <th style={th}>Differenz</th>
              <th style={th}>Diff (%)</th>
              <th style={th}>EP (€)</th>
              <th style={th}>Gesamt Soll</th>
              <th style={th}>Gesamt Ist</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.pos} style={{ background: tint(r.diff) }}>
                <td style={td}>{r.pos}</td>
                <td style={td}>{r.text}</td>
                <td style={td}>{r.unit}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  {r.soll.toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                </td>
                <td
                  style={{
                    ...td,
                    whiteSpace: "nowrap",
                    fontWeight: 700,
                  }}
                >
                  {r.ist.toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                </td>
                <td
                  style={{
                    ...td,
                    whiteSpace: "nowrap",
                    fontWeight: 700,
                  }}
                >
                  {r.diff.toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                </td>
                <td style={td}>{r.diffPct.toFixed(2)}%</td>
                <td style={td}>{r.ep ? r.ep.toFixed(2) : ""}</td>
                <td style={td}>{r.ep ? fmtEUR(r.totalSoll) : ""}</td>
                <td style={td}>{r.ep ? fmtEUR(r.totalIst) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={td} colSpan={3} />
              <td style={{ ...td, fontWeight: 700 }}>
                {sumSoll.toLocaleString(undefined, {
                  maximumFractionDigits: 3,
                })}
              </td>
              <td style={{ ...td, fontWeight: 700 }}>
                {sumIst.toLocaleString(undefined, {
                  maximumFractionDigits: 3,
                })}
              </td>
              <td style={{ ...td, fontWeight: 700 }}>
                {sumDiff.toLocaleString(undefined, {
                  maximumFractionDigits: 3,
                })}
              </td>
              <td style={td} />
              <td style={{ ...td, fontWeight: 700 }}>Summe</td>
              <td style={{ ...td, fontWeight: 700 }}>
                {fmtEUR(sumTotSoll)}
              </td>
              <td style={{ ...td, fontWeight: 700 }}>
                {fmtEUR(sumTotIst)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {loading && (
        <div style={{ marginTop: 8, fontSize: 12 }}>Laden…</div>
      )}
    </div>
  );
}

/* Stili coerenti con le altre pagine (AufmassEditor) */
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
const lbl: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.8,
  marginBottom: 4,
};
const ta: React.CSSProperties = {
  width: "100%",
  height: 140,
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  fontSize: 12,
  lineHeight: 1.35,
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "8px 10px",
};
