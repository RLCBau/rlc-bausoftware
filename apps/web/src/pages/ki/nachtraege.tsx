// apps/web/src/pages/ki/Nachtraege.tsx

import React, { useMemo, useState } from "react";
import { useProject } from "../../store/useProject";

const shell = {
  maxWidth: 1000,
  margin: "0 auto",
  padding: "12px 16px",
  fontFamily: "Inter,system-ui,Arial",
} as const;

const card = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 16,
  background: "#fff",
} as const;

const input = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "8px 10px",
  margin: "6px 0",
  fontSize: 14,
} as const;

const btn = {
  padding: "8px 12px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  borderRadius: 8,
  fontSize: 13,
  cursor: "pointer",
} as const;

const table = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  marginTop: 12,
} as const;

const thtd = {
  border: "1px solid #e2e8f0",
  padding: "6px 8px",
  verticalAlign: "top" as const,
} as const;

const head = {
  ...thtd,
  background: "#f8fafc",
  fontWeight: 600,
} as const;

type DiffType =
  | "qty_diff"
  | "price_diff"
  | "text_diff"
  | "missing_in_offer"
  | "missing_in_lv";

type DiffRow = {
  posNr: string;
  type: DiffType;
  lvText?: string;
  angebotText?: string;
  details: string;
};

type ApiResponse = {
  diffs?: DiffRow[];
  items?: DiffRow[];
  summary?: string;
};

export default function Nachtraege() {
  const { projectId, projectCode } = useProject();

  const [lv, setLv] = useState("");
  const [off, setOff] = useState("");
  const [diffs, setDiffs] = useState<DiffRow[]>([]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveProject = useMemo(
    () => projectCode || projectId || "",
    [projectCode, projectId]
  );

  async function check() {
    if (!lv.trim() || !off.trim()) {
      setError("Bitte LV-Text und Angebot-Text eingeben.");
      return;
    }

    setLoading(true);
    setError(null);
    setDiffs([]);
    setSummary("");

    try {
      const res = await fetch("/api/ki/nachtraege-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: projectId || "",
          projectCode: projectCode || "",
          lvText: lv.trim(),
          angebotText: off.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error((await res.text()) || "Vergleich fehlgeschlagen");
      }

      const data: ApiResponse = await res.json();
      const rows = Array.isArray(data?.diffs)
        ? data.diffs
        : Array.isArray(data?.items)
        ? data.items
        : [];

      setDiffs(rows);
      setSummary(data?.summary || "");
    } catch (e: any) {
      setError(e?.message || "Fehler beim Vergleich");
    } finally {
      setLoading(false);
    }
  }

  function gotoNachtrag(d: DiffRow) {
    const payload = {
      projectId: projectId || effectiveProject,
      projectCode: projectCode || "",
      posNr: d.posNr,
      kurztext: d.angebotText || d.lvText || "",
      grund: `KI Nachtragserkennung: ${d.details}`,
    };

    const url =
      `/kalkulation/nachtraege?projectId=${encodeURIComponent(projectId || effectiveProject)}` +
      `&prefill=${encodeURIComponent(JSON.stringify(payload))}`;

    window.location.href = url;
  }

  return (
    <div style={shell}>
      <h2>Nachtragserkennung</h2>

      <div style={card}>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
          Projekt: {effectiveProject || "—"}
        </div>

        <textarea
          style={{ ...input, height: 120 }}
          value={lv}
          onChange={(e) => setLv(e.target.value)}
          placeholder="LV-Text"
        />

        <textarea
          style={{ ...input, height: 120 }}
          value={off}
          onChange={(e) => setOff(e.target.value)}
          placeholder="Angebot-Text"
        />

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button style={btn} onClick={() => void check()} disabled={loading}>
            {loading ? "Vergleiche..." : "Vergleichen"}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 10, color: "#b91c1c" }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Ergebnis</h3>

        {summary && (
          <div style={{ marginBottom: 12, whiteSpace: "pre-wrap" }}>
            {summary}
          </div>
        )}

        <table style={table}>
          <thead>
            <tr>
              <th style={head}>Pos</th>
              <th style={head}>Typ</th>
              <th style={head}>LV</th>
              <th style={head}>Angebot</th>
              <th style={head}>Details</th>
              <th style={head}>Aktion</th>
            </tr>
          </thead>

          <tbody>
            {diffs.map((d, i) => (
              <tr key={`${d.posNr}-${d.type}-${i}`}>
                <td style={thtd}>{d.posNr}</td>
                <td style={thtd}>{labelForType(d.type)}</td>
                <td style={thtd}>{d.lvText || "—"}</td>
                <td style={thtd}>{d.angebotText || "—"}</td>
                <td style={thtd}>{d.details}</td>
                <td style={thtd}>
                  <button style={btn} onClick={() => gotoNachtrag(d)}>
                    Nachtrag erstellen →
                  </button>
                </td>
              </tr>
            ))}

            {!diffs.length && !loading && (
              <tr>
                <td colSpan={6} style={{ ...thtd, color: "#6b7280" }}>
                  Noch keine Abweichungen erkannt.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function labelForType(t: DiffType) {
  switch (t) {
    case "qty_diff":
      return "Mengenabweichung";
    case "price_diff":
      return "Preisabweichung";
    case "text_diff":
      return "Textabweichung";
    case "missing_in_offer":
      return "Fehlt im Angebot";
    case "missing_in_lv":
      return "Fehlt im LV";
    default:
      return t;
  }
}





