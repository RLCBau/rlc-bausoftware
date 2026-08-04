import { rlcClass } from "../../ui/rlcRuntimeStyle";import React, { useEffect, useMemo, useState } from "react";
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
  maxWidth: 1480,
  margin: "0 auto",
  padding: "16px 18px 40px",
  fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif",
  color: "#0f172a",
  background:
  "radial-gradient(circle at top left, rgba(37,99,235,0.06), transparent 30%), #f6f8fc",
  minHeight: "100%"
};

const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  marginBottom: 14,
  flexWrap: "wrap"
};

const textInput: React.CSSProperties = {
  width: 260,
  border: "1px solid #d9e2f1",
  borderRadius: 10,
  padding: "8px 10px",
  background: "#ffffff",
  color: "#0f172a",
  fontWeight: 650
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  background: "#ffffff",
  borderRadius: 14,
  overflow: "hidden"
};

const thtd: React.CSSProperties = {
  borderBottom: "1px solid #eef2f7",
  padding: "8px 10px",
  verticalAlign: "middle"
};

const head: React.CSSProperties = {
  borderBottom: "1px solid #e5eaf3",
  padding: "8px 10px",
  verticalAlign: "middle",
  background: "#f8fafc",
  color: "#475569",
  fontWeight: 700,
  textAlign: "left"
};

const sectionBox: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  marginBottom: 14,
  overflow: "hidden"
};

const sectionHead: React.CSSProperties = {
  padding: "8px 10px",
  background: "#f8fafc",
  fontWeight: 600
};

const smallBtn: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid #d7e2f0",
  background: "#ffffff",
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 700,
  color: "#0f172a",
  cursor: "pointer",
  boxShadow: "0 2px 8px rgba(15,23,42,0.04)"
};

const numberInput: React.CSSProperties = {
  width: 110,
  border: "1px solid #d9e2f1",
  borderRadius: 10,
  padding: "8px 10px",
  background: "#ffffff",
  color: "#0f172a",
  fontWeight: 650,
  textAlign: "right"
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
  betrag: 0
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
  betrag: 0
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
  betrag: 0
}];


const fmt = (n: number) =>
new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(Number.isFinite(n) ? n : 0);

const parseNum = (v: string | number | null | undefined) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").
  trim().
  replace(/\./g, "").
  replace(",", ".");
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
      }}return props.rows?.length ? props.rows : demoRows;
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
    }}, [rowsState, storageKey]);
  const normalizedRows = useMemo(() => {
    return rowsState.map((row) => {
      const menge = evaluateExpression(row.formel || "", (row.variablen || {}) as Record<string, number>);
      const ep = parseNum(row.ep);
      const betrag = menge * ep;
      return {
        ...row,
        ep,
        menge,
        betrag
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
      sumBetrag: pos.reduce((a, b) => a + parseNum(b.betrag), 0)
    }));
  }, [normalizedRows, filter]);

  const total = useMemo(
    () => grouped.reduce((a, b) => a + b.sumBetrag, 0),
    [grouped]
  );

  const updateEp = (id: string, value: string) => {
    setRowsState((prev) =>
    prev.map((row) =>
    row.id === id ?
    {
      ...row,
      ep: parseNum(value)
    } :
    row
    )
    );
  };

  const updateFormel = (id: string, value: string) => {
    setRowsState((prev) =>
    prev.map((row) =>
    row.id === id ?
    {
      ...row,
      formel: value
    } :
    row
    )
    );
  };

  const resetToInput = () => {
    setRowsState(props.rows?.length ? props.rows : demoRows);
  };

  return (
    <div className={rlcClass(null, shell)}>
      <h2 className="rlc-migrated-pages-mengenermittlung-abrechnungskreise-tsx-1374">
        Abrechnungskreise
      </h2>

      <div className={rlcClass(null, toolbar)}>
        <input
          placeholder="Filter Kreis…" className={rlcClass(null,
          textInput)}
          value={filter}
          onChange={(e) => setFilter(e.target.value)} />
        

        {!props.readOnly &&
        <button type="button" className={rlcClass(null, smallBtn)} onClick={resetToInput}>
            Zurücksetzen
          </button>
        }
      </div>

      {grouped.length === 0 ?
      <div className={rlcClass(null, sectionBox)}>
          <div className="rlc-migrated-pages-mengenermittlung-abrechnungskreise-tsx-1375">Keine Daten gefunden.</div>
        </div> :
      null}

      {grouped.map((g) =>
      <div key={g.kreis} className={rlcClass(null, sectionBox)}>
          <div className={rlcClass(null, sectionHead)}>{g.kreis}</div>

          <div className="rlc-migrated-pages-mengenermittlung-abrechnungskreise-tsx-1376">
            <table className={rlcClass(null, table)}>
              <thead>
                <tr>
                  <th className={rlcClass(null, head)}>Pos-Nr</th>
                  <th className={rlcClass(null, head)}>Kurztext</th>
                  <th className={rlcClass(null, head)}>ME</th>
                  <th className={rlcClass(null, head)}>EP</th>
                  <th className={rlcClass(null, head)}>Formel</th>
                  <th className={rlcClass(null, head)}>Menge</th>
                  <th className={rlcClass(null, head)}>Betrag</th>
                </tr>
              </thead>

              <tbody>
                {g.pos.map((p) =>
              <tr key={p.id}>
                    <td className={rlcClass(null, thtd)}>{p.posNr}</td>
                    <td className={rlcClass(null, thtd)}>{p.kurztext}</td>
                    <td className={rlcClass(null, thtd)}>{p.einheit}</td>

                    <td className={rlcClass(null, thtd)}>
                      {props.readOnly ?
                  fmt(parseNum(p.ep)) :

                  <input
                    value={String(parseNum(p.ep)).replace(".", ",")}
                    onChange={(e) => updateEp(p.id, e.target.value)} className={rlcClass(null,
                    numberInput)} />

                  }
                    </td>

                    <td className={rlcClass(null, thtd)}>
                      {props.readOnly ?
                  p.formel :

                  <input
                    value={p.formel || ""}
                    onChange={(e) => updateFormel(p.id, e.target.value)} className={rlcClass(null,
                    { ...textInput, width: 180 })} />

                  }
                    </td>

                    <td className={rlcClass(null, thtd)}>{fmt(parseNum(p.menge))}</td>
                    <td className={rlcClass(null, thtd)}>{fmt(parseNum(p.betrag))}</td>
                  </tr>
              )}

                <tr>
                  <td colSpan={5} className={rlcClass(null, { ...thtd, textAlign: "right" })}>
                    <b>Summe Kreis</b>
                  </td>
                  <td className={rlcClass(null, thtd)}>
                    <b>{fmt(g.sumMenge)}</b>
                  </td>
                  <td className={rlcClass(null, thtd)}>
                    <b>{fmt(g.sumBetrag)}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rlc-migrated-pages-mengenermittlung-abrechnungskreise-tsx-1377">
        Gesamtsumme: {fmt(total)} €
      </div>
    </div>);

}
