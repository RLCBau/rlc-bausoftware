import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/ki/Sprachsteuerung.tsx

import React, { useMemo, useState } from "react";
import { useProject } from "../../store/useProject";

const shell = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "12px 16px",
  fontFamily: "Inter,system-ui,Arial"
} as const;

const card = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 16,
  background: "#fff"
} as const;

const input = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 14
} as const;

const btn = {
  padding: "8px 12px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  borderRadius: 8,
  fontSize: 13,
  cursor: "pointer"
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
  const { currentProject } = useProject();
  const projectId = currentProject?.id ?? "";
  const projectCode = currentProject?.code ?? "";

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
      setError("Kein Projekt ausgewÃ¤hlt.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ki/sprachsteuerung", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId: projectId || "",
          projectCode: projectCode || "",
          text: text.trim()
        })
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
    <div className={rlcClass(null, shell)}>
      <h2>Sprachsteuerung</h2>

      <div className={rlcClass(null, card)}>
        <div className="rlc-migrated-pages-ki-sprach-tsx-1092">
          Projekt: {effectiveProject || "â€”"}
        </div>

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="gesprochenes Kommandoâ€¦" className={rlcClass(null,
          input)} />
        

        <div className="rlc-migrated-pages-ki-sprach-tsx-1093">
          <button className={rlcClass(null, btn)} onClick={() => void simulate()} disabled={loading}>
            {loading ? "Analysiere..." : "Befehl auswerten"}
          </button>
        </div>

        {error &&
        <div className="rlc-migrated-pages-ki-sprach-tsx-1094">
            {error}
          </div>
        }
      </div>

      <div className={rlcClass(null, { ...card, marginTop: 16 })}>
        <h3 className="rlc-migrated-pages-ki-sprach-tsx-1095">Erkannte Eingaben</h3>

        {!rows.length && !loading &&
        <div className="rlc-migrated-pages-ki-sprach-tsx-1096">Noch keine Eingaben verarbeitet.</div>
        }

        {!!rows.length &&
        <ul className="rlc-migrated-pages-ki-sprach-tsx-1097">
            {rows.map((r, i) =>
          <li key={`${r}-${i}`} className="rlc-migrated-pages-ki-sprach-tsx-1098">
                {r}
              </li>
          )}
          </ul>
        }
      </div>

      {(!!actions.length || !!summary) &&
      <div className={rlcClass(null, { ...card, marginTop: 16 })}>
          <h3 className="rlc-migrated-pages-ki-sprach-tsx-1099">KI-Auswertung</h3>

          {summary &&
        <div className="rlc-migrated-pages-ki-sprach-tsx-1100">
              {summary}
            </div>
        }

          {!!actions.length &&
        <div className="rlc-migrated-pages-ki-sprach-tsx-1101">
              {actions.map((a, i) =>
          <div
            key={`${a.type}-${a.label}-${i}`} className="rlc-migrated-pages-ki-sprach-tsx-1102">









            
                  <div>
                    <div className="rlc-migrated-pages-ki-sprach-tsx-1103">{a.label}</div>
                    <div className="rlc-migrated-pages-ki-sprach-tsx-1104">
                      Typ: {a.type}
                    </div>
                  </div>

                  {a.type !== "unknown" &&
            <button className={rlcClass(null, btn)} onClick={() => runAction(a)}>
                      Ã–ffnen â†’
                    </button>
            }
                </div>
          )}
            </div>
        }
        </div>
      }
    </div>);

}

