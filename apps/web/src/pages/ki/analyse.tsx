// apps/web/src/pages/ki/Analyse.tsx

import React, { useState } from "react";
import { useProject } from "../../store/useProject";

/* ================= STYLES ================= */

const shell = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "12px 16px",
  fontFamily: "Inter,system-ui,Arial",
} as const;

const btn = {
  padding: "6px 10px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  borderRadius: 6,
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
} as const;

const head = {
  ...thtd,
  background: "#f8fafc",
  fontWeight: 600,
} as const;

/* ================= TYPES ================= */

type AnalyseRow = {
  pos: string;
  kosten: number;
  risk: "niedrig" | "mittel" | "hoch";
};

/* ================= COMPONENT ================= */

export default function Analyse() {
  const { projectId, projectCode } = useProject();

  const [res, setRes] = useState<AnalyseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!projectId && !projectCode) {
      setError("Kein Projekt ausgewählt");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const r = await fetch("/api/ki/analyse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          projectCode,
        }),
      });

      const data = await r.json();

      if (!r.ok) {
        throw new Error(data?.error || "Analyse fehlgeschlagen");
      }

      // sicurezza dati
      const rows: AnalyseRow[] = Array.isArray(data?.rows)
        ? data.rows.map((r: any) => ({
            pos: String(r.pos || "-"),
            kosten: Number(r.kosten || 0),
            risk: r.risk || "niedrig",
          }))
        : [];

      setRes(rows);
    } catch (e: any) {
      setError(e?.message || "Fehler bei Analyse");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={shell}>
      <h2>LV-Analyse (KI)</h2>

      <div style={{ marginBottom: 10, fontSize: 12, color: "#6b7280" }}>
        Projekt: {projectCode || projectId || "-"}
      </div>

      <button style={btn} onClick={run} disabled={loading}>
        {loading ? "Analysiert..." : "Analyse starten"}
      </button>

      {error && (
        <div style={{ marginTop: 10, color: "#b91c1c" }}>
          {error}
        </div>
      )}

      <table style={table}>
        <thead>
          <tr>
            <th style={head}>Pos</th>
            <th style={head}>Kosten (€)</th>
            <th style={head}>Risiko</th>
          </tr>
        </thead>

        <tbody>
          {res.map((r) => (
            <tr key={r.pos}>
              <td style={thtd}>{r.pos}</td>

              <td style={thtd}>
                {r.kosten.toLocaleString("de-DE", {
                  minimumFractionDigits: 2,
                })}
              </td>

              <td
                style={{
                  ...thtd,
                  fontWeight: 600,
                  color:
                    r.risk === "hoch"
                      ? "#b91c1c"
                      : r.risk === "mittel"
                      ? "#d97706"
                      : "#065f46",
                }}
              >
                {r.risk}
              </td>
            </tr>
          ))}

          {res.length === 0 && !loading && (
            <tr>
              <td colSpan={3} style={{ ...thtd, color: "#6b7280" }}>
                Noch keine Analyse durchgeführt.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}





