// apps/web/src/pages/ki/LVAuto.tsx

import React, { useState } from "react";
import { useProject } from "../../store/useProject";

const shell = {
  maxWidth: 1100,
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
} as const;

const head = {
  ...thtd,
  background: "#f8fafc",
  fontWeight: 600,
} as const;

type LVRow = {
  id?: string;
  pos: string;
  kurz: string;
  lang: string;
  einheit: string;
  menge: number;
  preis?: number | null;
};

type GenerateResponse = {
  rows?: Array<{
    id?: string;
    pos?: string;
    posNr?: string;
    kurz?: string;
    kurztext?: string;
    lang?: string;
    langtext?: string;
    einheit?: string;
    menge?: number | string;
    preis?: number | string | null;
  }>;
  items?: Array<{
    id?: string;
    pos?: string;
    posNr?: string;
    kurz?: string;
    kurztext?: string;
    lang?: string;
    langtext?: string;
    einheit?: string;
    menge?: number | string;
    preis?: number | string | null;
  }>;
};

export default function LVAuto() {
  const { projectId, projectCode } = useProject();

  const [desc, setDesc] = useState("");
  const [rows, setRows] = useState<LVRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveProject = projectCode || projectId || "";

  async function generate() {
    if (!desc.trim()) {
      setError("Bitte eine Baubeschreibung eingeben.");
      return;
    }

    if (!effectiveProject) {
      setError("Kein Projekt ausgewählt.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ki/lv-auto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: projectId || "",
          projectCode: projectCode || "",
          description: desc.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error((await res.text()) || "LV-Generierung fehlgeschlagen");
      }

      const data: GenerateResponse = await res.json();
      const source = Array.isArray(data?.rows)
        ? data.rows
        : Array.isArray(data?.items)
        ? data.items
        : [];

      const normalized: LVRow[] = source.map((r, i) => ({
        id: r.id,
        pos: String(r.pos || r.posNr || `${String(i + 1).padStart(2, "0")}.00.000`),
        kurz: String(r.kurz || r.kurztext || ""),
        lang: String(r.lang || r.langtext || ""),
        einheit: String(r.einheit || ""),
        menge: toNumber(r.menge, 0),
        preis: r.preis == null ? null : toNumber(r.preis, 0),
      }));

      setRows(normalized);
    } catch (e: any) {
      setError(e?.message || "Fehler bei LV-Generierung");
    } finally {
      setLoading(false);
    }
  }

  async function saveToLV() {
    if (!rows.length) {
      setError("Keine LV-Positionen zum Speichern vorhanden.");
      return;
    }

    if (!effectiveProject) {
      setError("Kein Projekt ausgewählt.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      for (const r of rows) {
        const res = await fetch("/api/lv/add", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectId: projectId || effectiveProject,
            projectCode: projectCode || "",
            posNr: r.pos,
            kurztext: r.kurz,
            langtext: r.lang,
            einheit: r.einheit,
            menge: r.menge,
            preis: r.preis ?? null,
            quelle: "KI LV-Auto",
          }),
        });

        if (!res.ok) {
          throw new Error(await res.text());
        }
      }

      alert("LV-Positionen gespeichert ✅");
    } catch (e: any) {
      setError(e?.message || "Speichern ins LV fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={shell}>
      <h2>Automatische LV-Erstellung</h2>

      <div style={card}>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
          Projekt: {effectiveProject || "—"}
        </div>

        <textarea
          style={{ ...input, height: 120 }}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Baubeschreibung eingeben…"
        />

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button style={btn} onClick={() => void generate()} disabled={loading}>
            {loading ? "Generiere..." : "LV generieren"}
          </button>

          <button
            style={btn}
            onClick={() => void saveToLV()}
            disabled={!rows.length || saving}
          >
            {saving ? "Speichert..." : "Ins LV speichern"}
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

        <table style={table}>
          <thead>
            <tr>
              <th style={head}>Pos</th>
              <th style={head}>Kurztext</th>
              <th style={head}>Langtext</th>
              <th style={head}>Einheit</th>
              <th style={head}>Menge</th>
              <th style={head}>Preis</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id || `${r.pos}-${idx}`}>
                <td style={thtd}>{r.pos}</td>
                <td style={thtd}>{r.kurz}</td>
                <td style={thtd}>{r.lang}</td>
                <td style={thtd}>{r.einheit}</td>
                <td style={thtd}>{formatNumber(r.menge)}</td>
                <td style={thtd}>
                  {r.preis != null ? `${formatNumber(r.preis)} €` : "—"}
                </td>
              </tr>
            ))}

            {!rows.length && !loading && (
              <tr>
                <td colSpan={6} style={{ ...thtd, color: "#6b7280" }}>
                  Noch keine LV-Positionen generiert.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
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

function formatNumber(v: number) {
  return v.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}





