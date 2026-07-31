// apps/web/src/pages/placeholders.tsx
import React, { useMemo, useState } from "react";
import { evalExpression } from "../utils/formulas";

export function makeSheetPage(title: string) {
  return function SheetPage() {
    const [rows, setRows] = useState(
      Array.from({ length: 8 }).map((_, i) => ({
        id: i + 1,
        bezeichnung: "",
        wert: "",
      }))
    );

    const exportCsv = () => {
      const header = "Pos;Bezeichnung;Wert\n";
      const body = rows.map(r => `${r.id};${r.bezeichnung};${r.wert}`).join("\n");
      const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/\s+/g, "_")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };

    return (
      <div className="page">
        <div className="page-head">
          <h1>{title}</h1>
          <div className="page-actions">
            <button onClick={() => setRows(r => [...r, { id: r.length + 1, bezeichnung: "", wert: "" }])}>
              Zeile +
            </button>
            <button onClick={exportCsv}>CSV Export</button>
          </div>
        </div>

        <table className="sheet">
          <thead>
            <tr>
              <th style={{ width: 70 }}>Pos</th>
              <th>Bezeichnung</th>
              <th style={{ width: 200 }}>Wert</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="muted">{r.id}</td>
                <td>
                  <input
                    value={r.bezeichnung}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows(prev => prev.map((x, idx) => idx === i ? { ...x, bezeichnung: v } : x));
                    }}
                    placeholder="Text…"
                  />
                </td>
                <td>
                  <input
                    value={r.wert}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows(prev => prev.map((x, idx) => idx === i ? { ...x, wert: v } : x));
                    }}
                    placeholder="Wert / Formel (z.B. 1*3)"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
}

export function AufmassEditorPage() {
  const [rows, setRows] = useState(
    Array.from({ length: 12 }).map((_, i) => ({
      id: i + 1,
      kurztext: "",
      einheit: "",
      formel: "",
    }))
  );

  const summe = useMemo(
    () => rows.reduce((acc, r) => acc + evalExpression(r.formel), 0),
    [rows]
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Aufmaßeditor (Excel)</h1>
        <div className="page-actions">
          <button onClick={() => setRows(r => [...r, { id: r.length + 1, kurztext: "", einheit: "", formel: "" }])}>
            Zeile +
          </button>
        </div>
      </div>

      <table className="sheet">
        <thead>
          <tr>
            <th style={{ width: 70 }}>Pos</th>
            <th>Kurztext</th>
            <th style={{ width: 120 }}>Einheit</th>
            <th style={{ width: 220 }}>Formel (z.B. 2*(3+1))</th>
            <th style={{ width: 150 }}>Ergebnis</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const res = evalExpression(r.formel);
            return (
              <tr key={r.id}>
                <td className="muted">{r.id}</td>
                <td>
                  <input
                    value={r.kurztext}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows(prev => prev.map((x, idx) => idx === i ? { ...x, kurztext: v } : x));
                    }}
                    placeholder="Bezeichnung…"
                  />
                </td>
                <td>
                  <input
                    value={r.einheit}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows(prev => prev.map((x, idx) => idx === i ? { ...x, einheit: v } : x));
                    }}
                    placeholder="m, m², h…"
                  />
                </td>
                <td>
                  <input
                    value={r.formel}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows(prev => prev.map((x, idx) => idx === i ? { ...x, formel: v } : x));
                    }}
                    placeholder="Formel…"
                  />
                </td>
                <td className="number">{res.toLocaleString()}</td>
              </tr>
            );
          })}
          <tr className="sheet-footer">
            <td colSpan={4} className="align-right"><b>Summe</b></td>
            <td className="number"><b>{summe.toLocaleString()}</b></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
