import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LV, type LVPos } from "./store.lv";
import { Projects } from "./projectStore";

const MWST_KEY = "rlc_lv_mwst_v1";
const API_BASE = "https://api.rlcbausoftware.com";

type GaebMode = "x83" | "x84";
type GaebIssue = {
  position?: string;
  posNr?: string;
  type?: string;
  field?: string;
  message?: string;
  reason?: string;
  code?: string;
};

type GaebValidationResult = {
  ok?: boolean;
  valid?: boolean;
  mode?: GaebMode;
  errorCount?: number;
  warningCount?: number;
  errors?: GaebIssue[];
  warnings?: GaebIssue[];
};

export default function LVImportPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<LVPos[]>([]);
  const [mwst, setMwst] = useState<number>(() => Number(localStorage.getItem(MWST_KEY) ?? 19));
  const fileRef = useRef<HTMLInputElement>(null);

  const [gaebResult, setGaebResult] = useState<GaebValidationResult | null>(null);
  const [gaebBusy, setGaebBusy] = useState<GaebMode | null>(null);
  const [gaebInfo, setGaebInfo] = useState<string>("");

  // initial load
  useEffect(() => {
    setRows(LV.list());
  }, []);

  useEffect(() => {
    localStorage.setItem(MWST_KEY, String(mwst || 0));
  }, [mwst]);

  const curProject = Projects.getCurrent();
  const projectCode = String(curProject?.number || "").trim().toUpperCase();

  // helpers
  const save = (r: LVPos) => {
    LV.upsert(r);
    setRows(LV.list());
  };

  const addRow = () => {
    LV.upsert({
      id: crypto.randomUUID(),
      posNr: "",
      kurztext: "",
      einheit: "m",
      menge: 0,
      preis: 0,
    });
    setRows(LV.list());
  };

  const del = (id: string) => {
    LV.remove(id);
    setRows(LV.list());
  };

  const clearAll = () => {
    if (confirm("Alle Zeilen wirklich löschen?")) {
      LV.clear();
      setRows([]);
      setGaebResult(null);
      setGaebInfo("");
    }
  };

  // CSV
  const exportCSV = () => {
    const csv = LV.exportCSV(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lv.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCSV = (text: string) => {
    LV.importCSV(text);
    setRows(LV.list());
    setGaebResult(null);
    setGaebInfo("");
  };

  // Paste rows (semicolon CSV)
  const pasteRows = () => {
    const example = `PosNr;Kurztext;Einheit;Menge;Preis;Confidence
01.0001;"Aushub Baugrube";m³;120;35.5;`;
    const t = prompt("Zeilen einfügen (CSV mit ; – Kopfzeile erlaubt):", example);
    if (!t) return;
    LV.importCSV(t);
    setRows(LV.list());
    setGaebResult(null);
    setGaebInfo("");
  };

  // XLSX (SpreadsheetML)
  const exportXLSX = () => {
    const xmlHeader =
      `<?xml version="1.0"?>` +
      `<?mso-application progid="Excel.Sheet"?>` +
      `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
      `xmlns:o="urn:schemas-microsoft-com:office:office" ` +
      `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
      `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`;
    const sheetOpen = `<Worksheet ss:Name="LV"><Table>`;
    const headRow =
      `<Row>` +
      ["PosNr", "Kurztext", "Einheit", "Menge", "EP (netto)", "Confidence", "Zeilen-Netto"]
        .map((h) => `<Cell><Data ss:Type="String">${esc(h)}</Data></Cell>`)
        .join("") +
      `</Row>`;
    const body = rows
      .map((r) => {
        const z = (r.menge || 0) * (r.preis || 0);
        return (
          `<Row>` +
          `<Cell><Data ss:Type="String">${esc(r.posNr || "")}</Data></Cell>` +
          `<Cell><Data ss:Type="String">${esc(r.kurztext || "")}</Data></Cell>` +
          `<Cell><Data ss:Type="String">${esc(r.einheit || "")}</Data></Cell>` +
          `<Cell><Data ss:Type="Number">${num(r.menge)}</Data></Cell>` +
          `<Cell><Data ss:Type="Number">${num(r.preis)}</Data></Cell>` +
          `<Cell><Data ss:Type="Number">${num(r.confidence)}</Data></Cell>` +
          `<Cell><Data ss:Type="Number">${num(z)}</Data></Cell>` +
          `</Row>`
        );
      })
      .join("");
    const foot =
      `<Row><Cell><Data ss:Type="String">MwSt %</Data></Cell><Cell/><Cell/><Cell/><Cell/><Cell/>` +
      `<Cell><Data ss:Type="Number">${mwst}</Data></Cell></Row>`;
    const xml = xmlHeader + sheetOpen + headRow + body + foot + `</Table></Worksheet></Workbook>`;
    const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lv.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Auto-PosNr helper
  const autoPosNr = () => {
    const next = [...rows];
    let i = 1;
    for (const r of next) {
      if (!r.posNr || /^\s*$/.test(r.posNr)) {
        r.posNr = `01.${String(i).padStart(4, "0")}`;
        LV.upsert(r);
        i++;
      }
    }
    setRows(LV.list());
    setGaebResult(null);
    setGaebInfo("");
  };

  async function validateGAEB(mode: GaebMode): Promise<GaebValidationResult | null> {
    if (!projectCode) {
      alert("Kein Projekt gewählt");
      return null;
    }

    setGaebBusy(mode);
    setGaebInfo("");

    try {
      const r = await fetch(
        `${API_BASE}/api/project-lv/${encodeURIComponent(projectCode)}/export/gaeb/validate?mode=${mode}`,
        { method: "POST" }
      );

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        throw new Error(j?.error || "Validierung fehlgeschlagen");
      }

      const result: GaebValidationResult = {
        ...j,
        mode,
        valid: !!j?.valid,
        errorCount: Number(j?.errorCount || 0),
        warningCount: Number(j?.warningCount || 0),
        errors: normalizeIssues(j?.errors),
        warnings: normalizeIssues(j?.warnings),
      };

      setGaebResult(result);

      if (result.valid) {
        setGaebInfo(`GAEB ${mode.toUpperCase()} ist valide.`);
      } else {
        setGaebInfo(
          `GAEB ${mode.toUpperCase()} ist nicht valide. Fehler: ${result.errorCount || 0}, Warnungen: ${result.warningCount || 0}.`
        );
      }

      return result;
    } catch (e: any) {
      const errResult: GaebValidationResult = {
        mode,
        valid: false,
        errorCount: 1,
        warningCount: 0,
        errors: [
          {
            type: "error",
            field: "system",
            message: e?.message || "Unbekannter Fehler",
          },
        ],
        warnings: [],
      };
      setGaebResult(errResult);
      setGaebInfo(`Validierungs-Fehler: ${e?.message || e}`);
      return errResult;
    } finally {
      setGaebBusy(null);
    }
  }

  async function exportGAEBProject(mode: GaebMode) {
    if (!projectCode) {
      alert("Kein Projekt gewählt");
      return;
    }

    setGaebBusy(mode);
    setGaebInfo("");

    try {
      const validation = await fetch(
        `${API_BASE}/api/project-lv/${encodeURIComponent(projectCode)}/export/gaeb/validate?mode=${mode}`,
        { method: "POST" }
      );

      const val = await validation.json().catch(() => ({}));

      if (!validation.ok) {
        throw new Error(val?.error || "Validierung fehlgeschlagen");
      }

      const result: GaebValidationResult = {
        ...val,
        mode,
        valid: !!val?.valid,
        errorCount: Number(val?.errorCount || 0),
        warningCount: Number(val?.warningCount || 0),
        errors: normalizeIssues(val?.errors),
        warnings: normalizeIssues(val?.warnings),
      };

      setGaebResult(result);

      if (!result.valid) {
        setGaebInfo(
          `Export ${mode.toUpperCase()} blockiert. Fehler: ${result.errorCount || 0}, Warnungen: ${result.warningCount || 0}.`
        );
        return;
      }

      const r = await fetch(
        `${API_BASE}/api/project-lv/${encodeURIComponent(projectCode)}/export/gaeb/${mode}`,
        { method: "POST" }
      );

      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || "Export fehlgeschlagen");
      }

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectCode}.${mode}.xml`;
      a.click();
      URL.revokeObjectURL(url);

      setGaebInfo(`Export ${mode.toUpperCase()} erfolgreich erstellt.`);
    } catch (e: any) {
      setGaebInfo(`Export-Fehler: ${e?.message || e}`);
    } finally {
      setGaebBusy(null);
    }
  }

  const totals = useMemo(() => {
    const netto = rows.reduce((s, r) => s + (r.menge || 0) * (r.preis || 0), 0);
    const brutto = netto * (1 + (mwst || 0) / 100);
    return { netto, brutto };
  }, [rows, mwst]);

  const gaebStatusColor = gaebResult ? (gaebResult.valid ? "#2a7" : "#d33") : "#666";

  return (
    <div style={{ padding: 16 }}>
      <h2>LV hochladen / erstellen</h2>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <b>Projekt:</b> {curProject ? `${curProject.number} — ${curProject.name}` : "kein Projekt ausgewählt"}
        </div>

        <label style={{ marginLeft: 12 }}>
          MwSt %
          <input
            type="number"
            value={mwst}
            onChange={(e) => setMwst(Number(e.target.value || 0))}
            style={{ width: 70, marginLeft: 6 }}
          />
        </label>

        <button onClick={() => fileRef.current?.click()}>CSV Import</button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => importCSV(String(r.result || ""));
            r.readAsText(f, "utf-8");
          }}
        />

        <button onClick={pasteRows}>Zeilen einfügen</button>
        <button onClick={exportCSV}>CSV Export</button>
        <button onClick={exportXLSX}>XLSX Export</button>

        <button
          onClick={() => validateGAEB("x83")}
          disabled={!projectCode || !!gaebBusy}
          title={!projectCode ? "Kein Projekt gewählt" : "GAEB X83 prüfen"}
        >
          {gaebBusy === "x83" ? "X83 prüft …" : "X83 prüfen"}
        </button>

        <button
          onClick={() => exportGAEBProject("x83")}
          disabled={!projectCode || !!gaebBusy}
          title={!projectCode ? "Kein Projekt gewählt" : "GAEB X83 exportieren"}
        >
          {gaebBusy === "x83" ? "X83 Export …" : "X83 Export"}
        </button>

        <button
          onClick={() => validateGAEB("x84")}
          disabled={!projectCode || !!gaebBusy}
          title={!projectCode ? "Kein Projekt gewählt" : "GAEB X84 prüfen"}
        >
          {gaebBusy === "x84" ? "X84 prüft …" : "X84 prüfen"}
        </button>

        <button
          onClick={() => exportGAEBProject("x84")}
          disabled={!projectCode || !!gaebBusy}
          title={!projectCode ? "Kein Projekt gewählt" : "GAEB X84 exportieren"}
        >
          {gaebBusy === "x84" ? "X84 Export …" : "X84 Export"}
        </button>

        <button onClick={addRow}>+ Zeile</button>
        <button onClick={autoPosNr}>Auto-Position</button>
        <button onClick={clearAll}>Alles löschen</button>

        <button
          style={{ marginLeft: "auto" }}
          onClick={() => navigate("/kalkulation/manuell")}
          title="Wechsel zur Kalkulation – Manuell"
        >
          ⇢ in „Kalkulation manuell“
        </button>

        <button
          onClick={() => navigate("/kalkulation/mit-ki")}
          title="Wechsel zur Kalkulation – KI"
        >
          ⇢ in „Kalkulation mit KI“
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ ...badge, borderColor: gaebStatusColor, color: gaebStatusColor }}>
          {gaebResult ? (gaebResult.valid ? "GAEB valide" : "GAEB nicht valide") : "GAEB Status offen"}
        </span>

        <span style={pill}>Projektcode: {projectCode || "—"}</span>

        {gaebResult && (
          <>
            <span style={{ ...pill, borderColor: "#d33", color: "#d33" }}>
              Fehler: {gaebResult.errorCount || 0}
            </span>
            <span style={{ ...pill, borderColor: "#c80", color: "#c80" }}>
              Warnungen: {gaebResult.warningCount || 0}
            </span>
            {gaebResult.mode && <span style={pill}>Modus: {gaebResult.mode.toUpperCase()}</span>}
          </>
        )}
      </div>

      {!!gaebInfo && (
        <div style={{ marginBottom: 12, color: gaebInfo.includes("Fehler") || gaebInfo.includes("blockiert") ? "#b00" : "#0a7" }}>
          {gaebInfo}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Position", "Kurztext", "ME", "Menge (Formel)", "EP (netto)", "Menge (calc.)", "Zeilenpreis", "Aktion"].map(
                (h, i) => (
                  <th key={i} style={th}>
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const zeile = (r.menge || 0) * (r.preis || 0);
              return (
                <tr key={r.id}>
                  <td style={td}>
                    <input value={r.posNr} onChange={(e) => save({ ...r, posNr: e.target.value })} style={inp(110)} />
                  </td>
                  <td style={td}>
                    <input value={r.kurztext} onChange={(e) => save({ ...r, kurztext: e.target.value })} style={inp(520)} />
                  </td>
                  <td style={td}>
                    <input value={r.einheit} onChange={(e) => save({ ...r, einheit: e.target.value })} style={inp(60)} />
                  </td>
                  <td style={tdNum}>
                    <input
                      type="number"
                      value={r.menge}
                      onChange={(e) => save({ ...r, menge: num(e.target.value) })}
                      style={inp(120, "right")}
                    />
                  </td>
                  <td style={tdNum}>
                    <input
                      type="number"
                      value={r.preis ?? 0}
                      onChange={(e) => save({ ...r, preis: num(e.target.value) })}
                      style={inp(120, "right")}
                    />
                  </td>
                  <td style={{ ...tdNum, color: "#999" }}>{r.menge ?? 0}</td>
                  <td style={{ ...tdNum, fontWeight: 600 }}>{fmt(zeile)}</td>
                  <td style={td}>
                    <button onClick={() => del(r.id)}>Löschen</button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 12, color: "#666" }}>
                  Noch keine Zeilen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {gaebResult && !gaebResult.valid && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ marginBottom: 10 }}>GAEB Fehler / Warnungen</h3>

          <div style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#fafafa" }}>
                <tr>
                  <th style={th}>Pos.</th>
                  <th style={th}>Typ</th>
                  <th style={th}>Feld</th>
                  <th style={th}>Meldung</th>
                </tr>
              </thead>
              <tbody>
                {(gaebResult.errors || []).map((err, i) => (
                  <tr key={`e-${i}`} style={{ background: "#fff5f5" }}>
                    <td style={td}>{err.position || err.posNr || "—"}</td>
                    <td style={{ ...td, color: "#d33", fontWeight: 600 }}>{err.type || "error"}</td>
                    <td style={td}>{err.field || "—"}</td>
                    <td style={td}>{err.message || err.reason || err.code || "—"}</td>
                  </tr>
                ))}

                {(gaebResult.warnings || []).map((warn, i) => (
                  <tr key={`w-${i}`} style={{ background: "#fff9e8" }}>
                    <td style={td}>{warn.position || warn.posNr || "—"}</td>
                    <td style={{ ...td, color: "#c80", fontWeight: 600 }}>{warn.type || "warning"}</td>
                    <td style={td}>{warn.field || "—"}</td>
                    <td style={td}>{warn.message || warn.reason || warn.code || "—"}</td>
                  </tr>
                ))}

                {!(gaebResult.errors || []).length && !(gaebResult.warnings || []).length && (
                  <tr>
                    <td colSpan={4} style={{ padding: 12, color: "#666" }}>
                      Keine Detailfehler vorhanden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 24, marginTop: 16 }}>
        <div style={sumBox}>
          <div>Gesamt Netto</div>
          <div style={{ fontWeight: 700 }}>{fmt(totals.netto)}</div>
        </div>
        <div style={sumBox}>
          <div>Gesamt Brutto</div>
          <div style={{ fontWeight: 700 }}>{fmt(totals.brutto)}</div>
        </div>
      </div>
    </div>
  );
}

function normalizeIssues(items: unknown): GaebIssue[] {
  if (!Array.isArray(items)) return [];
  return items.map((it: any) => ({
    position: it?.position ?? it?.posNr ?? it?.positionNo ?? "",
    posNr: it?.posNr ?? it?.position ?? it?.positionNo ?? "",
    type: it?.type ?? "",
    field: it?.field ?? it?.path ?? "",
    message: it?.message ?? it?.reason ?? it?.error ?? "",
    reason: it?.reason ?? it?.message ?? "",
    code: it?.code ?? "",
  }));
}

/* UI helpers */
const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 6px",
  borderBottom: "1px solid #eee",
  background: "#fafafa",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "6px",
  borderBottom: "1px solid #f0f0f0",
};

const tdNum: React.CSSProperties = {
  ...td,
  textAlign: "right",
};

const sumBox: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 8,
  padding: "10px 14px",
  minWidth: 220,
  background: "#fcfcfc",
};

const inp = (w: number, align: "left" | "right" = "left"): React.CSSProperties => ({
  width: w,
  padding: "6px 8px",
  textAlign: align,
});

const badge: React.CSSProperties = {
  border: "1px solid #bbb",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  background: "#fff",
};

const pill: React.CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  background: "#fff",
};

const num = (v: any) => Number(v || 0);

const fmt = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v || 0);

const esc = (s: string) =>
  (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
