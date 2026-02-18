import { useMemo } from "react";

export type Col<T> = {
  key: keyof T & string;
  header: string;
  width?: number;
  editable?: boolean;
  type?: "text" | "number" | "checkbox";
  align?: "left" | "right" | "center";
};

export default function DataSheet<T extends Record<string, any>>({
  title,
  columns,
  rows,
  onChange,
  sumKeys = [],
  dense = false,
  zebra = false,
  rowSeparator = false,
  onRowClick,
}: {
  title: string;
  columns: Col<T>[];
  rows: T[];
  onChange: (rows: T[]) => void;
  sumKeys?: (keyof T & string)[];
  dense?: boolean;
  zebra?: boolean;
  rowSeparator?: boolean;
  onRowClick?: (row: T, index: number) => void;
}) {
  function toNumber(v: unknown) {
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  function updateCell(i: number, key: keyof T & string, value: any, col?: Col<T>) {
    const next = rows.slice();
    if (col?.type === "number") next[i][key] = toNumber(value);
    else if (col?.type === "checkbox") next[i][key] = Boolean(value);
    else next[i][key] = value;
    onChange(next);
  }

  function addRow() { onChange([...(rows || []), {} as T]); }
  function deleteRow(i: number) {
    const next = rows.slice(); next.splice(i, 1); onChange(next);
  }

  const totals = useMemo(() => {
    const acc: Record<string, number> = {};
    sumKeys.forEach(k => (acc[k] = rows.reduce((a, r) => a + (toNumber(r[k]) || 0), 0)));
    return acc;
  }, [rows, sumKeys]);

  return (
    <div className={`card ${dense ? "card--dense" : ""}`}>
      <div className="card-title">{title}</div>
      <div className="toolbar">
        <button className="input" onClick={addRow}>+ Zeile</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className={`table ${zebra ? "table--zebra" : ""} ${rowSeparator ? "table--rowsep" : ""}`}>
          <thead>
            <tr>
              <th style={{ width: 60 }}>Aktion</th>
              {columns.map(c => (<th key={c.key} style={{ width: c.width }}>{c.header}</th>))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} onClick={() => onRowClick?.(r, i)} className={onRowClick ? "row--clickable" : ""}>
                <td>
                  <button className="input danger" onClick={(e)=>{e.stopPropagation(); deleteRow(i);}}>Löschen</button>
                </td>
                {columns.map(c => {
                  const v = r[c.key];
                  const align = c.align || (c.type === "number" ? "right" : "left");
                  if (!c.editable) {
                    return (
                      <td key={c.key} style={{ textAlign: align as any }}>
                        <span className={align === "right" ? "cell-number" : ""}>
                          {c.type === "number" ? toNumber(v).toFixed(2) : String(v ?? "")}
                        </span>
                      </td>
                    );
                  }
                  if (c.type === "checkbox") {
                    return (
                      <td key={c.key} style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(v)}
                          onChange={(e) => updateCell(i, c.key, e.currentTarget.checked, c)}
                        />
                      </td>
                    );
                  }
                  return (
                    <td key={c.key} style={{ textAlign: align as any }}>
                      <input
                        style={{ width: c.width ? c.width - 20 : 160, textAlign: align as any }}
                        defaultValue={v ?? ""}
                        onBlur={(e) => updateCell(i, c.key, e.currentTarget.value, c)}
                        type="text"
                        placeholder={c.type === "number" ? "z.B. 1*3+2" : ""}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {sumKeys.length > 0 && (
              <tr>
                <td style={{ fontWeight: 600 }}>Summe</td>
                {columns.map(c => (
                  <td key={c.key}
                      style={{ textAlign: (c.align || (c.type === "number" ? "right" : "left")) as any, fontWeight: 600 }}>
                    {sumKeys.includes(c.key) ? (totals[c.key] || 0).toFixed(2) : ""}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


