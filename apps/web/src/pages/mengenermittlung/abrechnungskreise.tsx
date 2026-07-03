import React, { useEffect, useMemo, useState } from "react";
import { evaluateExpression } from "../../lib/formulas";
import { AufmassZeile } from "../../lib/types";

type Props = {
  rows?: AufmassZeile[];
  projectId?: string;
  projectCode?: string;
  storageKey?: string;
  readOnly?: boolean;
};

const shell: React.CSSProperties = {
  maxWidth: 1260,
  margin: "0 auto",
  padding: "12px 16px 40px",
  fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif",
  color: "#0f172a",
};

const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  marginBottom: 10,
  flexWrap: "wrap",
};

const textInput: React.CSSProperties = {
  width: 220,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "6px 8px",
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
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const sectionBox: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  marginBottom: 14,
  overflow: "hidden",
};

const sectionHead: React.CSSProperties = {
  padding: "8px 10px",
  background: "#f8fafc",
  fontWeight: 700,
};

const smallBtn: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  background: "#fff",
  padding: "6px 10px",
  cursor: "pointer",
};

const numberInput: React.CSSProperties = {
  width: 110,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "6px 8px",
};

const demoRows: AufmassZeile[] = [
  {
    id: "1",
    posNr: "100.001",
    kurztext: "[AK:K1] Graben ausheben",
    einheit: "m³",
    ep: 16,
    variablen: { L: 12, B: 0.7, H: 1.2 },
    formel: "=L*B*H",
    menge: 0,
    betrag: 0,
  },
  {
    id: "2",
    posNr: "100.002",
    kurztext: "[AK:K1] Rohre verlegen",
    einheit: "m",
    ep: 24.5,
    variablen: { L: 12 },
    formel: "=L",
    menge: 0,
    betrag: 0,
  },
  {
    id: "3",
    posNr: "200.100",
    kurztext: "[AK:K2] Asphaltdeckschicht",
    einheit: "m²",
    ep: 39.9,
    variablen: { L: 22, B: 3 },
    formel: "=L*B",
    menge: 0,
    betrag: 0,
  },
];

const fmt = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

const parseNum = (v: string | number | null | undefined) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const getAkKey = (row: AufmassZeile) => {
  const text = String(row.kurztext || "");
  const m = text.match(/\[AK:(.+?)\]/i);
  return (m?.[1] || "Unzugeordnet").trim();
};

const getStorageKey = (props: Props) => {
  if (props.storageKey) return props.storageKey;
  const code = (props.projectCode || "").trim();
  const id = (props.projectId || "").trim();
  const suffix = code || id || "default";
  return `rlc_abrechnungskreise:${suffix}`;
};

export default function Abrechnungskreise(props: Props) {
  const storageKey = useMemo(() => getStorageKey(props), [props.storageKey, props.projectCode, props.projectId]);

  const [filter, setFilter] = useState("");
  const [rowsState, setRowsState] = useState<AufmassZeile[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) return parsed;
        }
      } catch {
        // ignore
      }
    }
    return props.rows?.length ? props.rows : demoRows;
  });

  useEffect(() => {
    if (props.rows && props.rows.length) {
      setRowsState((prev) => {
        if (!prev.length || prev === demoRows) return props.rows!;
        return prev;
      });
    }
  }, [props.rows]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(rowsState));
    } catch {
      // ignore storage errors
    }
  }, [rowsState, storageKey]);

  const normalizedRows = useMemo(() => {
    return rowsState.map((row) => {
      const menge = evaluateExpression(row.formel || "", (row.variablen || {}) as Record<string, number>);
      const ep = parseNum(row.ep);
      const betrag = menge * ep;
      return {
        ...row,
        ep,
        menge,
        betrag,
      };
    });
  }, [rowsState]);

  const grouped = useMemo(() => {
    const map = new Map<string, AufmassZeile[]>();

    for (const row of normalizedRows) {
      const key = getAkKey(row);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }

    const entries = [...map.entries()].filter(([kreis]) =>
      kreis.toLowerCase().includes(filter.trim().toLowerCase())
    );

    return entries.map(([kreis, pos]) => ({
      kreis,
      pos,
      sumMenge: pos.reduce((a, b) => a + parseNum(b.menge), 0),
      sumBetrag: pos.reduce((a, b) => a + parseNum(b.betrag), 0),
    }));
  }, [normalizedRows, filter]);

  const total = useMemo(
    () => grouped.reduce((a, b) => a + b.sumBetrag, 0),
    [grouped]
  );

  const updateEp = (id: string, value: string) => {
    setRowsState((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              ep: parseNum(value),
            }
          : row
      )
    );
  };

  const updateFormel = (id: string, value: string) => {
    setRowsState((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              formel: value,
            }
          : row
      )
    );
  };

  const resetToInput = () => {
    setRowsState(props.rows?.length ? props.rows : demoRows);
  };

  return (
    <div style={shell}>
      <h2 style={{ margin: "4px 0 12px", fontSize: 20, fontWeight: 700 }}>
        Abrechnungskreise
      </h2>

      <div style={toolbar}>
        <input
          placeholder="Filter Kreis…"
          style={textInput}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        {!props.readOnly && (
          <button type="button" style={smallBtn} onClick={resetToInput}>
            Zurücksetzen
          </button>
        )}
      </div>

      {grouped.length === 0 ? (
        <div style={sectionBox}>
          <div style={{ padding: 12 }}>Keine Daten gefunden.</div>
        </div>
      ) : null}

      {grouped.map((g) => (
        <div key={g.kreis} style={sectionBox}>
          <div style={sectionHead}>{g.kreis}</div>

          <div style={{ overflow: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={head}>Pos-Nr</th>
                  <th style={head}>Kurztext</th>
                  <th style={head}>ME</th>
                  <th style={head}>EP</th>
                  <th style={head}>Formel</th>
                  <th style={head}>Menge</th>
                  <th style={head}>Betrag</th>
                </tr>
              </thead>

              <tbody>
                {g.pos.map((p) => (
                  <tr key={p.id}>
                    <td style={thtd}>{p.posNr}</td>
                    <td style={thtd}>{p.kurztext}</td>
                    <td style={thtd}>{p.einheit}</td>

                    <td style={thtd}>
                      {props.readOnly ? (
                        fmt(parseNum(p.ep))
                      ) : (
                        <input
                          value={String(parseNum(p.ep)).replace(".", ",")}
                          onChange={(e) => updateEp(p.id, e.target.value)}
                          style={numberInput}
                        />
                      )}
                    </td>

                    <td style={thtd}>
                      {props.readOnly ? (
                        p.formel
                      ) : (
                        <input
                          value={p.formel || ""}
                          onChange={(e) => updateFormel(p.id, e.target.value)}
                          style={{ ...textInput, width: 180 }}
                        />
                      )}
                    </td>

                    <td style={thtd}>{fmt(parseNum(p.menge))}</td>
                    <td style={thtd}>{fmt(parseNum(p.betrag))}</td>
                  </tr>
                ))}

                <tr>
                  <td colSpan={5} style={{ ...thtd, textAlign: "right" }}>
                    <b>Summe Kreis</b>
                  </td>
                  <td style={thtd}>
                    <b>{fmt(g.sumMenge)}</b>
                  </td>
                  <td style={thtd}>
                    <b>{fmt(g.sumBetrag)}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div style={{ textAlign: "right", fontWeight: 700 }}>
        Gesamtsumme: {fmt(total)} €
      </div>
    </div>
  );
}





