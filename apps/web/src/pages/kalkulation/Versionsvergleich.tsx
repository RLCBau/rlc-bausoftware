// apps/web/src/pages/kalkulation/Versionsvergleich.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** ===== Types (matching backend) ===== */
type VersionMeta = { id: number; filename: string; createdAt: string; count?: number };
type CompareCell = {
  menge: number | null;
  preis: number | null;
  einheit: string | null;
  kurztext: string | null;
  positionsnummer: string | null;
};
type CompareRow = {
  key: string;
  refKurztext: string | null;
  refPos: string | null;
  versions: CompareCell[];
  flags: { mengeEqual: boolean; preisEqual: boolean; einheitEqual: boolean };
};
type CompareResponse = {
  ok: boolean;
  versions: { id: number; filename: string; createdAt: string }[];
  rows: CompareRow[];
};

function getProjectId(): number {
  const p = new URLSearchParams(window.location.search).get("projectId");
  if (p && !isNaN(Number(p))) return Number(p);
  const ls = localStorage.getItem("rlc.currentProjectId");
  if (ls && !isNaN(Number(ls))) return Number(ls);
  return 0;
}

export default function VersionsvergleichPage() {
  const projectId = getProjectId();
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [rows, setRows] = useState<CompareRow[] | null>(null);
  const [serverVersions, setServerVersions] = useState<CompareResponse["versions"]>([]);
  const [query, setQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchList = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/versionsvergleich/list/${projectId}`);
      const j = await r.json();
      if (j?.ok) setVersions(j.versions as VersionMeta[]);
      else setVersions(j.versions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const onUploadFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !projectId) return;
      const fd = new FormData();
      fd.append("projectId", String(projectId));
      Array.from(files).forEach((f) => fd.append("files", f));

      setLoading(true);
      try {
        const r = await fetch(`/api/versionsvergleich/upload`, { method: "POST", body: fd });
        const j = await r.json();
        if (r.status === 501 && j?.error?.toString().toLowerCase().includes("gaeb")) {
          alert("GAEB-Parsing ist in dieser Build noch nicht aktiv. Bitte CSV/XLSX hochladen.");
        } else if (!r.ok) {
          alert(j?.error || "Fehler beim Upload");
        }
        await fetchList();
      } catch (e) {
        console.error(e);
        alert("Fehler beim Upload");
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [projectId, fetchList]
  );

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].sort((a, b) => a - b)
    );
  };

  const onCompare = useCallback(async () => {
    if (selectedIds.length < 2) {
      alert("Bitte mindestens zwei Versionen auswählen.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`/api/versionsvergleich/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionIds: selectedIds }),
      });
      const j: CompareResponse = await r.json();
      if (!r.ok) {
        alert((j as any)?.error || "Fehler beim Vergleich");
        return;
      }
      setServerVersions(j.versions);
      setRows(j.rows);
    } catch (e) {
      console.error(e);
      alert("Fehler beim Vergleich");
    } finally {
      setLoading(false);
    }
  }, [selectedIds]);

  const exportExcel = useCallback(async () => {
    if (selectedIds.length < 2) {
      alert("Bitte mindestens zwei Versionen auswählen.");
      return;
    }
    try {
      const r = await fetch(`/api/versionsvergleich/export/excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionIds: selectedIds }),
      });
      if (!r.ok) {
        const j = await r.json();
        alert(j?.error || "Fehler beim Excel-Export");
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Angebotsvergleich.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Fehler beim Excel-Export");
    }
  }, [selectedIds]);

  const exportPDF = useCallback(async () => {
    if (selectedIds.length < 2) {
      alert("Bitte mindestens zwei Versionen auswählen.");
      return;
    }
    try {
      const r = await fetch(`/api/versionsvergleich/export/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionIds: selectedIds }),
      });
      if (!r.ok) {
        const j = await r.json();
        alert(j?.error || "Fehler beim PDF-Export");
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Angebotsvergleich.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Fehler beim PDF-Export");
    }
  }, [selectedIds]);

  /** ===== Filter (Suche im Tabellen-Body) ===== */
  const filteredRows = useMemo(() => {
    if (!rows || !query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const a = (r.refPos ?? "").toString().toLowerCase();
      const b = (r.refKurztext ?? "").toString().toLowerCase();
      return a.includes(q) || b.includes(q);
    });
  }, [rows, query]);

  /** ===== Style helpers ===== */
  const computeMode = <T,>(vals: T[]) => {
    const map = new Map<string, { v: T; c: number }>();
    vals.forEach((v) => {
      const k = String(v ?? "");
      map.set(k, { v, c: (map.get(k)?.c || 0) + 1 });
    });
    let best: { v: T; c: number } | null = null;
    for (const e of map.values()) if (!best || e.c > best.c) best = e;
    return best?.v;
  };

  const table = useMemo(() => {
    if (!filteredRows || serverVersions.length === 0) return null;

    return (
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ overflow: "auto", maxHeight: "65vh" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
            <thead
              style={{
                position: "sticky",
                top: 0,
                background: "#f8fafc",
                zIndex: 1,
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <tr>
                <th style={th(140)}>PosNr</th>
                <th style={th(360)}>Kurztext</th>
                {serverVersions.map((v) => (
                  <th key={v.id} style={th(180)} colSpan={3}>
                    {v.filename}
                  </th>
                ))}
              </tr>
              <tr>
                <th style={th(140)} />
                <th style={th(360)} />
                {serverVersions.map((v) => (
                  <React.Fragment key={`sub-${v.id}`}>
                    <th style={th(80)}>Preis</th>
                    <th style={th(60)}>Menge</th>
                    <th style={th(60)}>ME</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, idx) => {
                const preisVals = r.versions.map((c) => c.preis ?? "");
                const mengeVals = r.versions.map((c) => c.menge ?? "");
                const ehVals = r.versions.map((c) => c.einheit ?? "");

                const preisMode = computeMode(preisVals);
                const mengeMode = computeMode(mengeVals);
                const ehMode = computeMode(ehVals);

                return (
                  <tr key={r.key} style={{ background: idx % 2 ? "#fcfcfc" : "white" }}>
                    <td style={td(140)} title={r.refPos ?? ""}>{r.refPos ?? ""}</td>
                    <td style={td(360)} title={r.refKurztext ?? ""}>
                      {(r.refKurztext ?? "").toString()}
                    </td>
                    {r.versions.map((c, i) => {
                      const preisEqualAll = r.flags.preisEqual;
                      const mengeEqualAll = r.flags.mengeEqual;
                      const ehEqualAll = r.flags.einheitEqual;

                      const preisBad = !preisEqualAll && String(c.preis ?? "") !== String(preisMode ?? "");
                      const mengeBad = !mengeEqualAll && String(c.menge ?? "") !== String(mengeMode ?? "");
                      const ehBad = !ehEqualAll && String(c.einheit ?? "") !== String(ehMode ?? "");

                      return (
                        <React.Fragment key={`${r.key}-${i}`}>
                          <td style={tdColored(80, preisEqualAll ? "ok" : preisBad ? "bad" : "neutral")}>
                            {c.preis ?? ""}
                          </td>
                          <td style={tdColored(60, mengeEqualAll ? "ok" : mengeBad ? "bad" : "neutral")}>
                            {c.menge ?? ""}
                          </td>
                          <td style={tdColored(60, ehEqualAll ? "ok" : ehBad ? "bad" : "neutral")}>
                            {c.einheit ?? ""}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }, [filteredRows, serverVersions]);

  /** ===== Empty-State in DE, professionell ===== */
  if (!projectId) {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#111827", marginBottom: 12 }}>
          Versionsvergleich / Angebotsanalyse
        </h2>
        <div style={cardMuted}>
          <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 6 }}>Kein Projekt ausgewählt.</div>
          <div style={{ fontSize: 14, color: "#4b5563" }}>
            Bitte wähle ein Projekt unter <b>„Projekt auswählen / erstellen“</b> oder öffne diese Seite
            mit einem Link wie <code>?projectId=123</code>.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      {/* Titel */}
      <div style={pageTitle}>Versionsvergleich / Angebotsanalyse</div>

      {/* Toolbar – gleiche Sprache/Look wie „Preise einfügen“ */}
      <div style={toolbar}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Suche… (PosNr, Kurztext)"
              style={searchInput}
            />
          </div>

          <label style={btnSecondary}>
            CSV/XLSX-Import
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              multiple
              onChange={(e) => onUploadFiles(e.target.files)}
              style={{ display: "none" }}
            />
          </label>

          <button onClick={fetchList} style={btnSecondary} disabled={loading}>
            Aktualisieren
          </button>

          <button onClick={onCompare} style={btnPrimary} disabled={loading || selectedIds.length < 2}>
            Vergleichen ({selectedIds.length})
          </button>

          <button onClick={exportExcel} style={btnGhost} disabled={selectedIds.length < 2}>
            CSV/Excel-Export
          </button>
          <button onClick={exportPDF} style={btnGhost} disabled={selectedIds.length < 2}>
            PDF-Export
          </button>
        </div>

        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Projekt #{projectId} • {loading ? "Laden…" : rows ? `${filteredRows?.length ?? 0} Positionen` : `${versions.length} Versionen`}
        </div>
      </div>

      {/* Linke Box: Versionen auswählen */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 420px" }}>
          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Versionen</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 340, overflow: "auto" }}>
              {versions.map((v) => (
                <label key={v.id} style={versionItem}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(v.id)}
                    onChange={() => toggleSelect(v.id)}
                    style={{ marginRight: 8 }}
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", width: "100%", gap: 8 }}>
                    <div style={{ overflow: "hidden" }}>
                      <div style={{ fontWeight: 600, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                        {v.filename}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        {new Date(v.createdAt).toLocaleString()} • {v.count ?? "-"} Pos.
                      </div>
                    </div>
                    <div style={chip}>#{v.id}</div>
                  </div>
                </label>
              ))}
              {versions.length === 0 && <div style={{ color: "#6b7280" }}>Keine Versionen vorhanden.</div>}
            </div>
          </div>
        </div>

        {/* Rechte Box: Tabelle */}
        <div style={{ flex: "1 1 600px", minWidth: 480 }}>
          {rows ? (
            table
          ) : (
            <div style={cardMuted}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Noch kein Vergleich durchgeführt</div>
              <div style={{ color: "#6b7280", fontSize: 14 }}>
                Wähle links mindestens zwei Versionen aus und klicke <b>Vergleichen</b>.
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#6b7280" }}>
        Hinweis: Grün = alle Werte identisch; Rot = abweichender Wert gegenüber dem häufigsten Wert.
      </div>
    </div>
  );
}

/** ===== Styles (angepasst an „Preise einfügen“) ===== */
const wrap: React.CSSProperties = { padding: 24, display: "flex", flexDirection: "column", gap: 12 };
const pageTitle: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 6 };

const toolbar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  border: "1px solid #e5e7eb",
  background: "#f8fafc",
  borderRadius: 10,
  padding: 12,
  marginBottom: 12,
};

const searchInput: React.CSSProperties = {
  width: 260,
  height: 36,
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  outline: "none",
  padding: "0 10px",
  fontSize: 14,
};

const btnPrimary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "white",
  cursor: "pointer",
  fontWeight: 600,
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "white",
  color: "#111827",
  cursor: "pointer",
  fontWeight: 600,
};

const btnGhost: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#f8fafc",
  color: "#111827",
  cursor: "pointer",
  fontWeight: 600,
};

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 12,
  background: "white",
};

const cardMuted: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 16,
  background: "#f8fafc",
};

const versionItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: 8,
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "white",
};

const chip: React.CSSProperties = {
  fontSize: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 999,
  padding: "2px 8px",
  color: "#374151",
};

function th(w: number): React.CSSProperties {
  return {
    position: "sticky",
    top: 36,
    background: "#f8fafc",
    textAlign: "left",
    padding: "10px 8px",
    fontSize: 12,
    borderBottom: "1px solid #e5e7eb",
    minWidth: w,
    maxWidth: w,
    zIndex: 1,
  };
}
function td(w: number): React.CSSProperties {
  return {
    padding: "8px",
    fontSize: 12,
    borderBottom: "1px solid #f1f5f9",
    minWidth: w,
    maxWidth: w,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}
function tdColored(w: number, state: "ok" | "bad" | "neutral"): React.CSSProperties {
  const base = td(w);
  if (state === "ok") return { ...base, background: "#ecfdf5" };   // grünlich
  if (state === "bad") return { ...base, background: "#fef2f2" };   // rötlich
  return base;
}
