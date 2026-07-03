// apps/web/src/pages/ki/Sprachsteuerung.tsx

import React, { useMemo, useState } from "react";
import { useProject } from "../../store/useProject";

const shell = {
  maxWidth: 900,
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
  padding: "8px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
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

type SprachAction = {
  type: "regie" | "lv" | "nachtrag" | "unknown";
  label: string;
  payload?: Record<string, any>;
};

type SprachResult = {
  transcript?: string;
  actions?: SprachAction[];
  summary?: string;
};

export default function Sprachsteuerung() {
  const { projectId, projectCode } = useProject();

  const [text, setText] = useState("");
  const [rows, setRows] = useState<string[]>([]);
  const [actions, setActions] = useState<SprachAction[]>([]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveProject = useMemo(
    () => projectCode || projectId || "",
    [projectCode, projectId]
  );

  async function simulate() {
    if (!text.trim()) {
      setError("Bitte einen gesprochenen Befehl eingeben.");
      return;
    }

    if (!effectiveProject) {
      setError("Kein Projekt ausgewählt.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ki/sprachsteuerung", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: projectId || "",
          projectCode: projectCode || "",
          text: text.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error((await res.text()) || "Sprachanalyse fehlgeschlagen");
      }

      const data: SprachResult = await res.json();

      const transcript = data?.transcript || text.trim();
      const nextActions = Array.isArray(data?.actions) ? data.actions : [];
      const nextSummary = data?.summary || "";

      setRows((prev) => [`Erkannt: ${transcript}`, ...prev]);
      setActions(nextActions);
      setSummary(nextSummary);
      setText("");
    } catch (e: any) {
      setError(e?.message || "Fehler bei Sprachsteuerung");
    } finally {
      setLoading(false);
    }
  }

  function runAction(a: SprachAction) {
    const payload = a.payload || {};

    if (a.type === "nachtrag") {
      const url =
        `/kalkulation/nachtraege?projectId=${encodeURIComponent(projectId || effectiveProject)}` +
        `&prefill=${encodeURIComponent(JSON.stringify(payload))}`;
      window.location.href = url;
      return;
    }

    if (a.type === "lv") {
      const url =
        `/kalkulation/lv?projectId=${encodeURIComponent(projectId || effectiveProject)}` +
        `&prefill=${encodeURIComponent(JSON.stringify(payload))}`;
      window.location.href = url;
      return;
    }

    if (a.type === "regie") {
      const url =
        `/ki/regie-auto?projectId=${encodeURIComponent(projectId || effectiveProject)}` +
        `&prefill=${encodeURIComponent(JSON.stringify(payload))}`;
      window.location.href = url;
      return;
    }
  }

  return (
    <div style={shell}>
      <h2>Sprachsteuerung</h2>

      <div style={card}>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
          Projekt: {effectiveProject || "—"}
        </div>

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="gesprochenes Kommando…"
          style={input}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button style={btn} onClick={() => void simulate()} disabled={loading}>
            {loading ? "Analysiere..." : "Befehl auswerten"}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 10, color: "#b91c1c" }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Erkannte Eingaben</h3>

        {!rows.length && !loading && (
          <div style={{ color: "#6b7280" }}>Noch keine Eingaben verarbeitet.</div>
        )}

        {!!rows.length && (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {rows.map((r, i) => (
              <li key={`${r}-${i}`} style={{ marginBottom: 6 }}>
                {r}
              </li>
            ))}
          </ul>
        )}
      </div>

      {(!!actions.length || !!summary) && (
        <div style={{ ...card, marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>KI-Auswertung</h3>

          {summary && (
            <div style={{ marginBottom: 12, whiteSpace: "pre-wrap" }}>
              {summary}
            </div>
          )}

          {!!actions.length && (
            <div style={{ display: "grid", gap: 8 }}>
              {actions.map((a, i) => (
                <div
                  key={`${a.type}-${a.label}-${i}`}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{a.label}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      Typ: {a.type}
                    </div>
                  </div>

                  {a.type !== "unknown" && (
                    <button style={btn} onClick={() => runAction(a)}>
                      Öffnen →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}





