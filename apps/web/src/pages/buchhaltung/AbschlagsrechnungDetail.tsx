// apps/web/src/pages/buchhaltung/AbschlagsrechnungDetail.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useProject } from "../../store/useProject";

const API =
  (import.meta as any)?.env?.VITE_API_URL ||
  (import.meta as any)?.env?.VITE_BACKEND_URL ||
  "http://localhost:4000";

type AbschlagStatus = "Entwurf" | "Freigegeben" | "Gebucht";

type AbschlagRow = {
  lvPos: string;
  kurztext: string;
  einheit: string;
  qty: number;
  ep: number;
  total: number;
};

type AbschlagItem = {
  id: string;
  projectId: string;
  nr: number;
  date: string;
  title?: string;
  netto: number;
  mwst: number;
  brutto: number;
  status: AbschlagStatus;
  rows: AbschlagRow[];
};

const fmtEUR = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    v || 0
  );

function safeNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const base = String(API || "").replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Server-Fehler (${res.status})`);
  }
  return (await res.json()) as T;
}

function recalc(a: AbschlagItem): AbschlagItem {
  const mwst = safeNum(a.mwst) || 19;
  const rows = Array.isArray(a.rows) ? a.rows : [];
  const netto = rows.reduce((sum, r) => sum + safeNum(r.total), 0);
  const brutto = netto * (1 + mwst / 100);
  return { ...a, mwst, rows, netto, brutto };
}

/* =================== PDF HELPERS =================== */

function drawBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  lw = 0.6
) {
  doc.setLineWidth(lw);
  doc.rect(x, y, w, h);
}

function textCenterX(doc: jsPDF, txt: string, x: number, y: number, w: number) {
  const tw = doc.getTextWidth(txt);
  doc.text(txt, x + (w - tw) / 2, y);
}

/**
 * CENTRATURA SICURA:
 * - usa baseline "middle" per evitare che il testo esca dai riquadri
 * - niente baselineFix che spinge verso il basso
 */
function textCenterXY(
  doc: jsPDF,
  txt: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize: number,
  style: "normal" | "bold" = "normal"
) {
  doc.setFont("helvetica", style);
  doc.setFontSize(fontSize);

  const cx = x + w / 2;
  const cy = y + h / 2;

  // jsPDF supporta baseline/align nella options
  doc.text(String(txt ?? ""), cx, cy, { align: "center", baseline: "middle" } as any);
}

async function printJsPdf(doc: jsPDF) {
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);

  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) {
    doc.save("document.pdf");
    URL.revokeObjectURL(url);
    return;
  }

  const timer = window.setInterval(() => {
    try {
      if (w.document?.readyState === "complete") {
        window.clearInterval(timer);
        w.focus();
        w.print();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch {}
  }, 200);
}

function buildAbschlagPdf(args: {
  projectCode: string;
  projectName: string;
  item: AbschlagItem;
}) {
  const { projectCode, projectName, item } = args;

  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 10;

  // --- GRID PARAMS ---
  const headerY = 10;
  const headerH = 34;
  const outerX = margin;
  const outerW = pageW - margin * 2;

  const leftW = 74;
  const rightW = 56;
  const midW = outerW - leftW - rightW;

  const leftX = outerX;
  const midX = outerX + leftW;
  const rightX = outerX + leftW + midW;

  // contenitore esterno
  drawBox(doc, outerX, headerY, outerW, headerH, 0.9);

  // colonne
  drawBox(doc, leftX, headerY, leftW, headerH, 0.6);
  drawBox(doc, midX, headerY, midW, headerH, 0.6);
  drawBox(doc, rightX, headerY, rightW, headerH, 0.6);

  // LEFT (font leggermente più piccolo per “stare” meglio)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Abschlagsrechnung", leftX + 10, headerY + 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(`Projekt: ${projectCode}`, leftX + 10, headerY + 22);
  doc.text(`${projectName}`, leftX + 10, headerY + 28);

  // MID (padding costante)
  const pad = 10;
  const line1Y = headerY + 14;
  const line2Y = headerY + 26;

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.text("Titel:", midX + pad, line1Y);
  doc.text("Status:", midX + pad, line2Y);

  doc.setFont("helvetica", "bold");
  doc.text(
    String(item.title || `Abschlagsrechnung ${item.nr}`),
    midX + pad + 14,
    line1Y
  );
  doc.text(String(item.status), midX + pad + 14, line2Y);

   // RIGHT: 3 righe, label sopra + valore sotto (NO sovrapposizione)
  const rowH = headerH / 3;

  doc.setLineWidth(0.6);
  doc.line(rightX, headerY + rowH, rightX + rightW, headerY + rowH);
  doc.line(rightX, headerY + rowH * 2, rightX + rightW, headerY + rowH * 2);

  function rightCell(label: string, value: string, topY: number) {
    const labelY = topY + 4.2;      // riga alta
    const valueY = topY + rowH - 4; // riga bassa

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    doc.text(label, rightX + rightW / 2, labelY, { align: "center" } as any);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(value, rightX + rightW / 2, valueY, { align: "center" } as any);
  }

  rightCell("Nr.", String(item.nr), headerY);
  rightCell("Datum", String(item.date || ""), headerY + rowH);
  rightCell("MwSt", `${safeNum(item.mwst)} %`, headerY + rowH * 2);

  // spazio sotto header
  let y = headerY + headerH + 10;

  const body = (item.rows || []).map((r) => [
    r.lvPos || "",
    r.kurztext || "",
    r.einheit || "",
    (safeNum(r.qty) || 0).toString(),
    fmtEUR(safeNum(r.ep)),
    fmtEUR(safeNum(r.total)),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["LV-Pos", "Kurztext", "Einheit", "Menge", "EP", "Gesamt"]],
    body,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: 3.5,
      minCellHeight: 10,
      lineWidth: 0.35,
      valign: "middle",
    },
    headStyles: {
      fontStyle: "bold",
      lineWidth: 0.5,
    },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 88 },
      2: { cellWidth: 18 },
      3: { halign: "right", cellWidth: 20 },
      4: { halign: "right", cellWidth: 22 },
      5: { halign: "right", cellWidth: 24 },
    },
    margin: { left: margin, right: margin },
  });

  const lastY = (doc as any).lastAutoTable?.finalY
    ? (doc as any).lastAutoTable.finalY
    : y + 60;

  // Totali box
  const totalsW = 86;
  const totalsH = 26;
  const totalsX = pageW - margin - totalsW;
  const totalsY = lastY + 12;

  drawBox(doc, totalsX, totalsY, totalsW, totalsH, 0.9);

  const tRow = totalsH / 3;
  doc.setLineWidth(0.6);
  doc.line(totalsX, totalsY + tRow, totalsX + totalsW, totalsY + tRow);
  doc.line(totalsX, totalsY + tRow * 2, totalsX + totalsW, totalsY + tRow * 2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text("Netto", totalsX + 6, totalsY + tRow / 2 + 3.2);
  doc.text("Brutto", totalsX + 6, totalsY + tRow + tRow / 2 + 3.2);
  doc.text("Gesamt", totalsX + 6, totalsY + tRow * 2 + tRow / 2 + 3.2);

  doc.setFont("helvetica", "bold");
  doc.text(fmtEUR(item.netto), totalsX + totalsW - 6, totalsY + tRow / 2 + 3.2, {
    align: "right",
  });
  doc.text(fmtEUR(item.brutto), totalsX + totalsW - 6, totalsY + tRow + tRow / 2 + 3.2, {
    align: "right",
  });
  doc.text(fmtEUR(item.brutto), totalsX + totalsW - 6, totalsY + tRow * 2 + tRow / 2 + 3.2, {
    align: "right",
  });

  // Footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("RLC Bausoftware", margin, 290);

  return doc;
}

/* =================== COMPONENT =================== */

export default function AbschlagsrechnungDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { currentProject, getSelectedProject } = useProject() as any;

  const p = currentProject || getSelectedProject?.() || null;
  const projectKey = (p?.code || "").trim();

  const [items, setItems] = useState<AbschlagItem[]>([]);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const current = useMemo(
    () => items.find((x) => x.id === String(id || "")) || null,
    [items, id]
  );

  async function load() {
    if (!projectKey) {
      setInfo("Kein Projekt ausgewählt.");
      setItems([]);
      return;
    }
    setLoading(true);
    setInfo(null);
    try {
      const data: any = await apiJson(`/api/abschlag/list/${encodeURIComponent(projectKey)}`);
      setItems((Array.isArray(data?.items) ? data.items : []).map(recalc));
      setFilePath(data?.file || null);
    } catch (e: any) {
      setInfo((e?.message || "Fehler beim Laden") + `\n\nAPI: ${String(API)}`);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function save(nextItems?: AbschlagItem[]) {
    if (!projectKey) return;
    setLoading(true);
    setInfo(null);
    try {
      const payload = { items: (nextItems ?? items).map(recalc) };
      const data: any = await apiJson(`/api/abschlag/save/${encodeURIComponent(projectKey)}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setFilePath(data?.file || null);
      setInfo(`Gespeichert (${data?.saved ?? (nextItems ?? items).length}).`);
      await load();
    } catch (e: any) {
      setInfo((e?.message || "Fehler beim Speichern") + `\n\nAPI: ${String(API)}`);
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  function patchCurrent(patch: Partial<AbschlagItem>) {
    if (!current) return;
    const next = items.map((x) =>
      x.id === current.id ? recalc({ ...x, ...patch } as any) : x
    );
    setItems(next);
  }

  function patchRow(idx: number, patch: Partial<AbschlagRow>) {
    if (!current) return;
    const rows = (current.rows || []).map((r, i) => {
      if (i !== idx) return r;
      const qty = patch.qty !== undefined ? safeNum(patch.qty) : safeNum(r.qty);
      const ep = patch.ep !== undefined ? safeNum(patch.ep) : safeNum(r.ep);
      const total = qty * ep;
      return { ...r, ...patch, qty, ep, total };
    });
    patchCurrent({ rows });
  }

  function addRow() {
    if (!current) return;
    patchCurrent({
      rows: [
        ...(current.rows || []),
        { lvPos: "", kurztext: "", einheit: "m", qty: 0, ep: 0, total: 0 },
      ],
    });
  }

  function removeRow(idx: number) {
    if (!current) return;
    patchCurrent({ rows: (current.rows || []).filter((_, i) => i !== idx) });
  }

  async function printNow() {
    if (!current) return;
    const doc = buildAbschlagPdf({
      projectCode: String(p?.code || ""),
      projectName: String(p?.name || ""),
      item: current,
    });
    await printJsPdf(doc);
  }

  function exportPdf() {
    if (!current) return;
    const doc = buildAbschlagPdf({
      projectCode: String(p?.code || ""),
      projectName: String(p?.name || ""),
      item: current,
    });
    doc.save(`${p?.code || "Projekt"}_Abschlag_${current.nr}.pdf`);
  }

  if (!p) {
    return (
      <div style={{ padding: 16 }}>
        <h2>Abschlagsrechnung</h2>
        <div style={{ color: "#666" }}>Kein Projekt ausgewählt.</div>
        <button onClick={() => navigate(-1)} style={{ marginTop: 12 }}>
          ← Zurück
        </button>
      </div>
    );
  }

  if (!current) {
    return (
      <div style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button onClick={() => navigate("/buchhaltung/abschlagsrechnungen")}>
            ← Zurück
          </button>
          <button onClick={() => void load()} disabled={loading}>
            Laden
          </button>
        </div>
        {info ? (
          <div style={{ marginTop: 12, color: "#991B1B", whiteSpace: "pre-wrap" }}>
            {info}
          </div>
        ) : (
          <div style={{ marginTop: 12, color: "#666" }}>Lädt…</div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <nav style={{ color: "#888", fontSize: 13 }}>
            RLC / 7. Buchhaltung / Abrechnung / Abschlagsrechnungen / Detail
          </nav>
          <h2 style={{ margin: "6px 0 0 0" }}>
            {current.title || `Abschlagsrechnung ${current.nr}`}
          </h2>
          <div style={{ color: "#666", marginTop: 6 }}>
            <b>{p.code}</b> — {p.name}
          </div>
          <div style={{ color: "#888", marginTop: 6, fontSize: 12 }}>
            Datei: <span style={{ fontFamily: "monospace" }}>{filePath || ""}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => navigate("/buchhaltung/abschlagsrechnungen")}>← Zurück</button>
          <button onClick={() => void load()} disabled={loading}>
            Laden
          </button>
          <button onClick={() => void save()} disabled={loading}>
            Speichern
          </button>
          <button onClick={printNow} disabled={loading}>
            Drucken
          </button>
          <button onClick={exportPdf} disabled={loading}>
            PDF
          </button>
        </div>
      </div>

      {info && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #FECACA",
            background: "#FEF2F2",
            color: "#991B1B",
            fontSize: 13,
            whiteSpace: "pre-wrap",
          }}
        >
          {info}
        </div>
      )}

      <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, minWidth: 220, background: "#fff" }}>
          <div style={{ color: "#666" }}>Netto</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{fmtEUR(current.netto)}</div>
        </div>
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, minWidth: 220, background: "#fff" }}>
          <div style={{ color: "#666" }}>Brutto</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{fmtEUR(current.brutto)}</div>
        </div>
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, minWidth: 220, background: "#fff" }}>
          <div style={{ color: "#666" }}>MwSt</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{safeNum(current.mwst)} %</div>
        </div>
      </div>

      <div style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        <div style={{ padding: 12, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, color: "#555" }}>
              Titel{" "}
              <input
                value={current.title || ""}
                onChange={(e) => patchCurrent({ title: e.target.value })}
                style={{ marginLeft: 6, padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8, width: 280 }}
              />
            </label>
            <label style={{ fontSize: 13, color: "#555" }}>
              Datum{" "}
              <input
                type="date"
                value={current.date}
                onChange={(e) => patchCurrent({ date: e.target.value })}
                style={{ marginLeft: 6, padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8 }}
              />
            </label>
            <label style={{ fontSize: 13, color: "#555" }}>
              Status{" "}
              <select
                value={current.status}
                onChange={(e) => patchCurrent({ status: e.target.value as any })}
                style={{ marginLeft: 6, padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8 }}
              >
                <option value="Entwurf">Entwurf</option>
                <option value="Freigegeben">Freigegeben</option>
                <option value="Gebucht">Gebucht</option>
              </select>
            </label>
          </div>

          <button onClick={addRow} disabled={loading} style={{ fontWeight: 700 }}>
            + Position hinzufügen
          </button>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead style={{ background: "#fafafa" }}>
            <tr>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }}>LV-Pos</th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }}>Kurztext</th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }}>Einheit</th>
              <th style={{ textAlign: "right", padding: 12, borderBottom: "1px solid #eee" }}>Menge</th>
              <th style={{ textAlign: "right", padding: 12, borderBottom: "1px solid #eee" }}>EP</th>
              <th style={{ textAlign: "right", padding: 12, borderBottom: "1px solid #eee" }}>Gesamt</th>
              <th style={{ textAlign: "right", padding: 12, borderBottom: "1px solid #eee" }}>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {(current.rows || []).map((r, idx) => (
              <tr key={idx}>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>
                  <input
                    value={r.lvPos || ""}
                    onChange={(e) => patchRow(idx, { lvPos: e.target.value })}
                    style={{ width: 120, padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8 }}
                  />
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>
                  <input
                    value={r.kurztext || ""}
                    onChange={(e) => patchRow(idx, { kurztext: e.target.value })}
                    style={{ width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8 }}
                  />
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>
                  <input
                    value={r.einheit || ""}
                    onChange={(e) => patchRow(idx, { einheit: e.target.value })}
                    style={{ width: 90, padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8 }}
                  />
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3", textAlign: "right" }}>
                  <input
                    type="number"
                    value={safeNum(r.qty)}
                    onChange={(e) => patchRow(idx, { qty: Number(e.target.value) })}
                    style={{ width: 110, padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8, textAlign: "right" }}
                  />
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3", textAlign: "right" }}>
                  <input
                    type="number"
                    value={safeNum(r.ep)}
                    onChange={(e) => patchRow(idx, { ep: Number(e.target.value) })}
                    style={{ width: 110, padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8, textAlign: "right" }}
                  />
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3", textAlign: "right", fontWeight: 800 }}>
                  {fmtEUR(safeNum(r.total))}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3", textAlign: "right" }}>
                  <button onClick={() => removeRow(idx)} disabled={loading}>
                    Löschen
                  </button>
                </td>
              </tr>
            ))}

            {(current.rows || []).length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 14, color: "#777" }}>
                  Keine Positionen. Wenn du aus „Verknüpfung“ übernommen hast, werden sie hier sichtbar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
