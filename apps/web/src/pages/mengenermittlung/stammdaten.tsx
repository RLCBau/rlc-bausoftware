// apps/web/src/pages/mengenermittlung/Stammdaten.tsx
import React, { useEffect, useState } from "react";

const shell: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "12px 16px 40px",
  fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif",
  color: "#0f172a",
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thtd: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  padding: "6px 8px",
  verticalAlign: "middle",
};

const head: React.CSSProperties = {
  ...thtd,
  background: "#f8fafc",
  fontWeight: 600,
  textAlign: "left",
};

const textInput: React.CSSProperties = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "6px 8px",
};

const btn: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  borderRadius: 6,
  fontSize: 13,
  cursor: "pointer",
};

type Regel = {
  id: string;
  einheit: string;
  standardFormel: string;
  beschreibung?: string;
};

const KEY = "rlc.mengenermittlung.stammdaten";

const createId = () =>
  (crypto as any)?.randomUUID
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.random()}`;

/* ============================================================
   DEFAULT REGELN (IMPORTANTISSIMO)
============================================================ */

const DEFAULTS: Regel[] = [
  { id: createId(), einheit: "m", standardFormel: "=L", beschreibung: "Länge" },
  { id: createId(), einheit: "m²", standardFormel: "=L*B", beschreibung: "Fläche" },
  { id: createId(), einheit: "m³", standardFormel: "=L*B*H", beschreibung: "Volumen" },
];

function normalizeUnit(v: string) {
  return String(v || "").trim().toLowerCase();
}

export default function Stammdaten() {
  const [regeln, setRegeln] = useState<Regel[]>([]);

  /* ================= LOAD ================= */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);

      if (!raw) {
        setRegeln(DEFAULTS);
        return;
      }

      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed) || parsed.length === 0) {
        setRegeln(DEFAULTS);
        return;
      }

      setRegeln(parsed);
    } catch (e) {
      console.warn("Stammdaten load error", e);
      setRegeln(DEFAULTS);
    }
  }, []);

  /* ================= SAVE ================= */
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(regeln));
    } catch (e) {
      console.warn("Stammdaten save error", e);
    }
  }, [regeln]);

  /* ================= ACTIONS ================= */

  const add = () =>
    setRegeln((p) => [
      ...p,
      {
        id: createId(),
        einheit: "",
        standardFormel: "",
        beschreibung: "",
      },
    ]);

  const del = (id: string) =>
    setRegeln((p) => p.filter((x) => x.id !== id));

  const upd = (id: string, patch: Partial<Regel>) =>
    setRegeln((p) =>
      p.map((x) => (x.id === id ? { ...x, ...patch } : x))
    );

  /* ================= DUPLICATE CHECK ================= */

  const duplicates = React.useMemo(() => {
    const map = new Map<string, number>();
    regeln.forEach((r) => {
      const key = normalizeUnit(r.einheit);
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [regeln]);

  /* ================= UI ================= */

  return (
    <div style={shell}>
      <h2 style={{ margin: "4px 0 12px", fontSize: 20, fontWeight: 700 }}>
        Stammdaten – Standardformeln
      </h2>

      <div style={{ marginBottom: 10 }}>
        <button style={btn} onClick={add}>
          + Regel hinzufügen
        </button>
      </div>

      <div
        style={{
          overflow: "auto",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
        }}
      >
        <table style={table}>
          <thead>
            <tr>
              <th style={head}>Einheit</th>
              <th style={head}>Standard-Formel</th>
              <th style={head}>Beschreibung</th>
              <th style={head}>Aktion</th>
            </tr>
          </thead>

          <tbody>
            {regeln.length === 0 && (
              <tr>
                <td colSpan={4} style={{ ...thtd, color: "#64748b" }}>
                  Keine Regeln vorhanden
                </td>
              </tr>
            )}

            {regeln.map((r) => {
              const isDup = duplicates.get(normalizeUnit(r.einheit))! > 1;

              return (
                <tr key={r.id}>
                  <td style={thtd}>
                    <input
                      style={{
                        ...textInput,
                        borderColor: isDup ? "#ef4444" : "#cbd5e1",
                      }}
                      value={r.einheit}
                      placeholder="z.B. m²"
                      onChange={(e) =>
                        upd(r.id, { einheit: e.target.value })
                      }
                    />
                  </td>

                  <td style={thtd}>
                    <input
                      style={textInput}
                      value={r.standardFormel}
                      placeholder="z.B. =L*B"
                      onChange={(e) =>
                        upd(r.id, {
                          standardFormel: e.target.value,
                        })
                      }
                    />
                  </td>

                  <td style={thtd}>
                    <input
                      style={textInput}
                      value={r.beschreibung || ""}
                      placeholder="optional"
                      onChange={(e) =>
                        upd(r.id, {
                          beschreibung: e.target.value,
                        })
                      }
                    />
                  </td>

                  <td style={thtd}>
                    <button
                      style={{ ...btn, color: "#b91c1c" }}
                      onClick={() => del(r.id)}
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
        Diese Regeln werden im Aufmaß-Editor verwendet:
        <br />
        <code>m → =L</code> | <code>m² → =L*B</code> | <code>m³ → =L*B*H</code>
      </p>
    </div>
  );
}





