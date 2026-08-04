import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/ki/Nachtraege.tsx

import React, { useMemo, useState } from "react";
import { useProject } from "../../store/useProject";

const shell = {
  maxWidth: 1000,
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
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "8px 10px",
  margin: "6px 0",
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

const table = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  marginTop: 12
} as const;

const thtd = {
  border: "1px solid #e2e8f0",
  padding: "6px 8px",
  verticalAlign: "top" as const
} as const;

const head = {
  ...thtd,
  background: "#f8fafc",
  fontWeight: 600
} as const;

type DiffType =
"qty_diff" |
"price_diff" |
"text_diff" |
"missing_in_offer" |
"missing_in_lv";

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
  const { currentProject } = useProject();
  const projectId = currentProject?.id ?? "";
  const projectCode = currentProject?.code ?? "";

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
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId: projectId || "",
          projectCode: projectCode || "",
          lvText: lv.trim(),
          angebotText: off.trim()
        })
      });

      if (!res.ok) {
        throw new Error((await res.text()) || "Vergleich fehlgeschlagen");
      }

      const data: ApiResponse = await res.json();
      const rows = Array.isArray(data?.diffs) ?
      data.diffs :
      Array.isArray(data?.items) ?
      data.items :
      [];

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
      grund: `KI Nachtragserkennung: ${d.details}`
    };

    const url =
    `/kalkulation/nachtraege?projectId=${encodeURIComponent(projectId || effectiveProject)}` +
    `&prefill=${encodeURIComponent(JSON.stringify(payload))}`;

    window.location.href = url;
  }

  return (
    <div className={rlcClass(null, shell)}>
      <h2>Nachtragserkennung</h2>

      <div className={rlcClass(null, card)}>
        <div className="rlc-migrated-pages-ki-nachtraege-tsx-1087">
          Projekt: {effectiveProject || "â€”"}
        </div>

        <textarea className={rlcClass(null,
        { ...input, height: 120 })}
        value={lv}
        onChange={(e) => setLv(e.target.value)}
        placeholder="LV-Text" />
        

        <textarea className={rlcClass(null,
        { ...input, height: 120 })}
        value={off}
        onChange={(e) => setOff(e.target.value)}
        placeholder="Angebot-Text" />
        

        <div className="rlc-migrated-pages-ki-nachtraege-tsx-1088">
          <button className={rlcClass(null, btn)} onClick={() => void check()} disabled={loading}>
            {loading ? "Vergleiche..." : "Vergleichen"}
          </button>
        </div>

        {error &&
        <div className="rlc-migrated-pages-ki-nachtraege-tsx-1089">
            {error}
          </div>
        }
      </div>

      <div className={rlcClass(null, { ...card, marginTop: 16 })}>
        <h3 className="rlc-migrated-pages-ki-nachtraege-tsx-1090">Ergebnis</h3>

        {summary &&
        <div className="rlc-migrated-pages-ki-nachtraege-tsx-1091">
            {summary}
          </div>
        }

        <table className={rlcClass(null, table)}>
          <thead>
            <tr>
              <th className={rlcClass(null, head)}>Pos</th>
              <th className={rlcClass(null, head)}>Typ</th>
              <th className={rlcClass(null, head)}>LV</th>
              <th className={rlcClass(null, head)}>Angebot</th>
              <th className={rlcClass(null, head)}>Details</th>
              <th className={rlcClass(null, head)}>Aktion</th>
            </tr>
          </thead>

          <tbody>
            {diffs.map((d, i) =>
            <tr key={`${d.posNr}-${d.type}-${i}`}>
                <td className={rlcClass(null, thtd)}>{d.posNr}</td>
                <td className={rlcClass(null, thtd)}>{labelForType(d.type)}</td>
                <td className={rlcClass(null, thtd)}>{d.lvText || "â€”"}</td>
                <td className={rlcClass(null, thtd)}>{d.angebotText || "â€”"}</td>
                <td className={rlcClass(null, thtd)}>{d.details}</td>
                <td className={rlcClass(null, thtd)}>
                  <button className={rlcClass(null, btn)} onClick={() => gotoNachtrag(d)}>
                    Nachtrag erstellen â†’
                  </button>
                </td>
              </tr>
            )}

            {!diffs.length && !loading &&
            <tr>
                <td colSpan={6} className={rlcClass(null, { ...thtd, color: "#6b7280" })}>
                  Noch keine Abweichungen erkannt.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>);

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

