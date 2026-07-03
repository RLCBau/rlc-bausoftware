import React, { useMemo, useState } from "react";
import { useProject } from "../../store/useProject";
import { useLieferscheine } from "./stores";
import type { Lieferschein } from "./types";
import "./styles.css";

const eur = (n: number) =>
  safeNumber(n).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function safeTrim(v: unknown) {
  return String(v ?? "").trim();
}

function safeNumber(v: unknown, fallback = 0) {
  if (v === null || v === undefined || v === "") return fallback;
  const normalized =
    typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function parseDate(s: string) {
  const value = safeTrim(s);
  if (!value) return new Date(0);

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
    const [d, m, y] = value.split(".").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

type SortKey = "datum_desc" | "datum_asc" | "kosten_desc" | "kosten_asc";

export default function LieferscheineKosten() {
  const { getSelectedProject } = useProject();
  const project = getSelectedProject?.();

  const activeProjectId = safeTrim(project?.id);
  const activeProjectCode = safeTrim(project?.code);
  const activeProjectKey = activeProjectCode || activeProjectId;

  const [ls, setLs] = useLieferscheine();

  const [q, setQ] = useState("");
  const [ks, setKs] = useState<string>("ALL");
  const [lieferant, setLieferant] = useState<string>("ALL");
  const [sort, setSort] = useState<SortKey>("datum_desc");

  const normalizedLs = useMemo(() => {
    return (ls || []).map((x: any) => ({
      ...x,
      id: safeTrim(x.id) || cryptoRandomId(),
      nummer: safeTrim(x.nummer),
      datum: safeTrim(x.datum),
      kostenstelle: safeTrim(x.kostenstelle),
      lieferant: safeTrim(x.lieferant),
      kosten: safeNumber(x.kosten ?? x.betrag ?? 0),
      projekt: safeTrim(x.projekt),
      projectId: safeTrim(x.projectId),
      projectCode: safeTrim(x.projectCode),
    })) as Lieferschein[];
  }, [ls]);

  const projectFiltered = useMemo(() => {
    if (!activeProjectKey) return normalizedLs;

    const hasProjectInfo = normalizedLs.some(
      (x: any) =>
        safeTrim(x.projectCode) || safeTrim(x.projectId) || safeTrim(x.projekt)
    );

    if (!hasProjectInfo) return normalizedLs;

    return normalizedLs.filter((x: any) => {
      return [x.projectCode, x.projectId, x.projekt]
        .map((v) => safeTrim(v))
        .filter(Boolean)
        .includes(activeProjectKey);
    });
  }, [normalizedLs, activeProjectKey]);

  const kostenstellen = useMemo(() => {
    const all = Array.from(
      new Set(projectFiltered.map((x: any) => safeTrim(x.kostenstelle)).filter(Boolean))
    );
    all.sort((a, b) => String(a).localeCompare(String(b), "de"));
    return ["ALL", ...all];
  }, [projectFiltered]);

  const lieferanten = useMemo(() => {
    const all = Array.from(
      new Set(projectFiltered.map((x: any) => safeTrim(x.lieferant)).filter(Boolean))
    );
    all.sort((a, b) => String(a).localeCompare(String(b), "de"));
    return ["ALL", ...all];
  }, [projectFiltered]);

  const filtered = useMemo(() => {
    let arr = projectFiltered.slice();

    if (ks !== "ALL") {
      arr = arr.filter((x: any) => safeTrim(x.kostenstelle) === ks);
    }

    if (lieferant !== "ALL") {
      arr = arr.filter((x: any) => safeTrim(x.lieferant) === lieferant);
    }

    if (q.trim()) {
      const qq = q.trim().toLowerCase();
      arr = arr.filter((x: any) => {
        const hay = [
          x.nummer,
          x.datum,
          x.kostenstelle,
          x.lieferant,
          String(x.kosten ?? ""),
          x.projectCode,
          x.projectId,
          x.projekt,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return hay.includes(qq);
      });
    }

    return arr.slice().sort((a: any, b: any) => {
      const da = parseDate(a.datum).getTime();
      const db = parseDate(b.datum).getTime();
      const ka = safeNumber(a.kosten, 0);
      const kb = safeNumber(b.kosten, 0);

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
  }, [projectFiltered, q, ks, lieferant, sort]);

  const totalSum = useMemo(
    () => filtered.reduce((s, x: any) => s + safeNumber(x.kosten, 0), 0),
    [filtered]
  );

  const addEmpty = () => {
    const now = new Date();
    const iso = now.toISOString().slice(0, 10);

    const item: Lieferschein = {
      id: cryptoRandomId(),
      nummer: `LS-${String(normalizedLs.length + 1).padStart(3, "0")}`,
      datum: iso,
      kostenstelle: "Projekt",
      kosten: 0,
      lieferant: "",
      ...(activeProjectId ? { projectId: activeProjectId } : {}),
      ...(activeProjectCode ? { projectCode: activeProjectCode } : {}),
    };

    setLs((prev: Lieferschein[]) => [item, ...prev]);
  };

  const update = (id: string, patch: Partial<Lieferschein>) => {
    setLs((prev: Lieferschein[]) =>
      prev.map((x) =>
        x.id === id
          ? {
              ...x,
              ...patch,
              ...(patch.kosten !== undefined
                ? { kosten: safeNumber(patch.kosten, 0) }
                : {}),
            }
          : x
      )
    );
  };

  const remove = (id: string) => {
    if (!confirm("Lieferschein löschen?")) return;
    setLs((prev: Lieferschein[]) => prev.filter((x) => x.id !== id));
  };

  const exportCSV = () => {
    const rows = filtered.map((x: any) => ({
      Nummer: x.nummer || "",
      Datum: x.datum || "",
      Kostenstelle: x.kostenstelle || "",
      Lieferant: x.lieferant || "",
      Kosten: safeNumber(x.kosten, 0).toFixed(2),
      Projektcode: x.projectCode || "",
      ProjektID: x.projectId || "",
    }));

    downloadCSV(rows, "lieferscheine_kosten.csv");
  };

  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <div>
          <h2>Lieferscheine (Kosten)</h2>
          <div className="bh-note" style={{ marginTop: 4 }}>
            {activeProjectKey ? (
              <>
                Aktuelles Projekt: <b>{activeProjectKey}</b>
              </>
            ) : (
              "Kein Projekt ausgewählt"
            )}
          </div>
        </div>

        <div className="bh-actions">
          <button className="bh-btn" onClick={addEmpty}>
            + Neu
          </button>
          <button
            className="bh-btn ghost"
            onClick={exportCSV}
            disabled={!filtered.length}
          >
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
                {x === "ALL" ? "Alle" : x}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Lieferant</label>
          <select value={lieferant} onChange={(e) => setLieferant(e.target.value)}>
            {lieferanten.map((x) => (
              <option key={x} value={x}>
                {x === "ALL" ? "Alle" : x}
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
          <div style={{ fontWeight: 700, paddingTop: 22 }}>Summe: {eur(totalSum)} €</div>
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
            {filtered.map((x: any) => (
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
                    value={String(safeNumber(x.kosten, 0))}
                    onChange={(e) =>
                      update(x.id, { kosten: safeNumber(e.target.value, 0) })
                    }
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
          Hinweis: Diese Seite nutzt aktuell den Buchhaltung-Store{" "}
          <code>useLieferscheine()</code> (Key: <code>rlc_bh_lieferscheine</code>).
          Später sollte sie mit derselben Lieferschein-Logik wie mobile/server
          zusammengeführt werden, damit Buchhaltung und Baustelle auf dieselben
          Daten zugreifen.
        </div>
      </div>
    </div>
  );
}

function downloadCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) {
    alert("Keine Daten für den Export vorhanden.");
    return;
  }

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(";"),
    ...rows.map((r) =>
      headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(";")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  const href = URL.createObjectURL(blob);
  a.href = href;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(href);
}

function cryptoRandomId() {
  try {
    // @ts-ignore
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}





