import React, { useMemo, useState } from "react";
import { useLieferscheine } from "./stores";
import type { Lieferschein } from "./types";
import "./styles.css";

const eur = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseDate(s: string) {
  // supporta ISO o dd.mm.yyyy
  if (!s) return new Date(0);
  if (/\d{2}\.\d{2}\.\d{4}/.test(s)) {
    const [d, m, y] = s.split(".").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

type SortKey = "datum_desc" | "datum_asc" | "kosten_desc" | "kosten_asc";

export default function LieferscheineKosten() {
  const [ls, setLs] = useLieferscheine();

  const [q, setQ] = useState("");
  const [ks, setKs] = useState<string>("ALL");
  const [lieferant, setLieferant] = useState<string>("ALL");
  const [sort, setSort] = useState<SortKey>("datum_desc");

  const kostenstellen = useMemo(() => {
    const all = Array.from(new Set(ls.map((x) => x.kostenstelle).filter(Boolean)));
    all.sort((a, b) => String(a).localeCompare(String(b)));
    return ["ALL", ...all];
  }, [ls]);

  const lieferanten = useMemo(() => {
    const all = Array.from(new Set(ls.map((x) => x.lieferant).filter(Boolean)));
    all.sort((a, b) => String(a).localeCompare(String(b)));
    return ["ALL", ...all];
  }, [ls]);

  const filtered = useMemo(() => {
    let arr = ls.slice();

    if (ks !== "ALL") arr = arr.filter((x) => x.kostenstelle === ks);
    if (lieferant !== "ALL") arr = arr.filter((x) => (x.lieferant || "") === lieferant);

    if (q.trim()) {
      const qq = q.trim().toLowerCase();
      arr = arr.filter((x) => {
        const hay = [
          x.nummer,
          x.datum,
          x.kostenstelle,
          x.lieferant,
          String(x.kosten ?? ""),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(qq);
      });
    }

    arr.sort((a, b) => {
      const da = parseDate(a.datum).getTime();
      const db = parseDate(b.datum).getTime();
      const ka = Number(a.kosten || 0);
      const kb = Number(b.kosten || 0);

      switch (sort) {
        case "datum_asc":
          return da - db;
        case "datum_desc":
          return db - da;
        case "kosten_asc":
          return ka - kb;
        case "kosten_desc":
          return kb - ka;
        default:
          return db - da;
      }
    });

    return arr;
  }, [ls, q, ks, lieferant, sort]);

  const sum = useMemo(() => filtered.reduce((s, x) => s + (x.kosten || 0), 0), [filtered]);

  const addEmpty = () => {
    const now = new Date();
    const iso = now.toISOString().slice(0, 10);
    const item: Lieferschein = {
      id: cryptoRandomId(),
      nummer: `LS-${String(ls.length + 1).padStart(3, "0")}`,
      datum: iso,
      kostenstelle: "Projekt",
      kosten: 0,
      lieferant: "",
    };
    setLs((prev) => [item, ...prev]);
  };

  const update = (id: string, patch: Partial<Lieferschein>) => {
    setLs((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const remove = (id: string) => {
    if (!confirm("Lieferschein löschen?")) return;
    setLs((prev) => prev.filter((x) => x.id !== id));
  };

  const exportCSV = () => {
    const rows = filtered.map((x) => ({
      Nummer: x.nummer || "",
      Datum: x.datum || "",
      Kostenstelle: x.kostenstelle || "",
      Lieferant: x.lieferant || "",
      Kosten: Number(x.kosten || 0).toFixed(2),
    }));
    downloadCSV(rows, "lieferscheine_kosten.csv");
  };

  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <h2>Lieferscheine (Kosten)</h2>
        <div className="bh-actions">
          <button className="bh-btn" onClick={addEmpty}>+ Neu</button>
          <button className="bh-btn ghost" onClick={exportCSV} disabled={!filtered.length}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="bh-filters">
        <div>
          <label>Suche</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nummer / Lieferant / Kostenstelle…"
          />
        </div>
        <div>
          <label>Kostenstelle</label>
          <select value={ks} onChange={(e) => setKs(e.target.value)}>
            {kostenstellen.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Lieferant</label>
          <select value={lieferant} onChange={(e) => setLieferant(e.target.value)}>
            {lieferanten.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Sortierung</label>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="datum_desc">Datum (neu → alt)</option>
            <option value="datum_asc">Datum (alt → neu)</option>
            <option value="kosten_desc">Kosten (hoch → niedrig)</option>
            <option value="kosten_asc">Kosten (niedrig → hoch)</option>
          </select>
        </div>

        <div className="bh-filters-right">
          <div style={{ fontWeight: 700, paddingTop: 22 }}>
            Summe: {eur(sum)} €
          </div>
        </div>
      </div>

      <div className="bh-panel">
        <div className="bh-panel-head">
          <h3>Einträge ({filtered.length})</h3>
        </div>

        <table className="bh-table">
          <thead>
            <tr>
              <th>Nummer</th>
              <th>Datum</th>
              <th>Kostenstelle</th>
              <th>Lieferant</th>
              <th style={{ textAlign: "right" }}>Kosten (€)</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((x) => (
              <tr key={x.id}>
                <td>
                  <input
                    value={x.nummer || ""}
                    onChange={(e) => update(x.id, { nummer: e.target.value })}
                    style={{ width: 160 }}
                  />
                </td>
                <td>
                  <input
                    value={x.datum || ""}
                    onChange={(e) => update(x.id, { datum: e.target.value })}
                    style={{ width: 140 }}
                  />
                </td>
                <td>
                  <input
                    value={x.kostenstelle || ""}
                    onChange={(e) => update(x.id, { kostenstelle: e.target.value })}
                    style={{ width: 220 }}
                  />
                </td>
                <td>
                  <input
                    value={x.lieferant || ""}
                    onChange={(e) => update(x.id, { lieferant: e.target.value })}
                    style={{ width: 220 }}
                  />
                </td>
                <td style={{ textAlign: "right" }}>
                  <input
                    value={String(x.kosten ?? 0)}
                    onChange={(e) => update(x.id, { kosten: Number(e.target.value || 0) })}
                    style={{ width: 140, textAlign: "right" }}
                  />
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="bh-btn ghost" onClick={() => remove(x.id)}>
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "#777" }}>
                  Keine Lieferscheine im aktuellen Filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="bh-note" style={{ marginTop: 10 }}>
          Hinweis: Diese Seite nutzt den Buchhaltung-Store <code>useLieferscheine()</code>
          (Key: <code>rlc_bh_lieferscheine</code>).
        </div>
      </div>
    </div>
  );
}

function downloadCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => String(r[h] ?? "")).join(";")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function cryptoRandomId() {
  try {
    // @ts-ignore
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}
