import { useMemo } from "react";

export type Col<T extends Record<string, unknown>> = {
  key: keyof T & string;
  header: string;
  width?: number;
  editable?: boolean;
  type?: "text" | "number" | "checkbox";
  align?: "left" | "right" | "center";
};

type Props<T extends Record<string, unknown>> = {
  title: string;
  columns: Col<T>[];
  rows: T[];
  onChange: (rows: T[]) => void;
  sumKeys?: (keyof T & string)[];
  dense?: boolean;
  zebra?: boolean;
  rowSeparator?: boolean;
  onRowClick?: (row: T, index: number) => void;
  createEmptyRow?: () => T;
};

function toNumber(v: unknown): number {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function getAlign<T extends Record<string, unknown>>(col: Col<T>): "left" | "right" | "center" {
  return col.align || (col.type === "number" ? "right" : "left");
}

export default function DataSheet<T extends Record<string, unknown>>({
  title,
  columns,
  rows,
  onChange,
  sumKeys = [],
  dense = false,
  zebra = false,
  rowSeparator = false,
  onRowClick,
  createEmptyRow,
}: Props<T>) {
  function updateCell(
    rowIndex: number,
    key: keyof T & string,
    value: unknown,
    col?: Col<T>
  ) {
    const next = rows.slice();
    const row = { ...next[rowIndex] } as T;

    if (col?.type === "number") {
      (row as Record<string, unknown>)[key] = toNumber(value);
    } else if (col?.type === "checkbox") {
      (row as Record<string, unknown>)[key] = Boolean(value);
    } else {
      (row as Record<string, unknown>)[key] = String(value ?? "");
    }

    next[rowIndex] = row;
    onChange(next);
  }

  function addRow() {
    const empty =
      createEmptyRow?.() ??
      (Object.fromEntries(
        columns.map((c) => [
          c.key,
          c.type === "checkbox" ? false : c.type === "number" ? 0 : "",
        ])
      ) as T);

    onChange([...(rows || []), empty]);
  }

  function deleteRow(rowIndex: number) {
    const next = rows.slice();
    next.splice(rowIndex, 1);
    onChange(next);
  }

  const totals = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const key of sumKeys) {
      acc[key] = rows.reduce((sum, row) => sum + toNumber(row[key]), 0);
    }
    return acc;
  }, [rows, sumKeys]);

  return (
    <div className={`card ${dense ? "card--dense" : ""}`}>
      <div className="card-title">{title}</div>

      <div className="toolbar">
        <button type="button" className="input" onClick={addRow}>
          + Zeile
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          className={`table ${zebra ? "table--zebra" : ""} ${
            rowSeparator ? "table--rowsep" : ""
          }`}
        >
          <thead>
            <tr>
              <th style={{ width: 90 }}>Aktion</th>
              {columns.map((col) => (
                <th key={col.key} style={{ width: col.width }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                onClick={() => onRowClick?.(row, rowIndex)}
                className={onRowClick ? "row--clickable" : ""}
              >
                <td>
                  <button
                    type="button"
                    className="input danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRow(rowIndex);
                    }}
                  >
                    Löschen
                  </button>
                </td>

                {columns.map((col) => {
                  const value = row[col.key];
                  const align = getAlign(col);

                  if (!col.editable) {
                    return (
                      <td key={col.key} style={{ textAlign: align }}>
                        <span className={align === "right" ? "cell-number" : ""}>
                          {col.type === "number"
                            ? toNumber(value).toFixed(2)
                            : String(value ?? "")}
                        </span>
                      </td>
                    );
                  }

                  if (col.type === "checkbox") {
                    return (
                      <td key={col.key} style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(e) =>
                            updateCell(rowIndex, col.key, e.currentTarget.checked, col)
                          }
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                    );
                  }

                  return (
                    <td key={col.key} style={{ textAlign: align }}>
                      <input
                        type="text"
                        className="input"
                        style={{
                          width: col.width ? Math.max(col.width - 20, 80) : 160,
                          textAlign: align,
                        }}
                        value={col.type === "number" ? String(value ?? 0) : String(value ?? "")}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          updateCell(rowIndex, col.key, e.currentTarget.value, col)
                        }
                        placeholder={col.type === "number" ? "z. B. 12.50" : ""}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}

            {sumKeys.length > 0 && (
              <tr>
                <td style={{ fontWeight: 600 }}>Summe</td>
                {columns.map((col) => {
                  const align = getAlign(col);
                  return (
                    <td
                      key={col.key}
                      style={{ textAlign: align, fontWeight: 600 }}
                    >
                      {sumKeys.includes(col.key)
                        ? (totals[col.key] || 0).toFixed(2)
                        : ""}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}





