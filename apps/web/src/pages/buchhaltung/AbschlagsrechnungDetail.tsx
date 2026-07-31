import { savePdfWithCompanyHeader as saveRlcPdfWithCompanyHeader, outputPdfBlobWithCompanyHeader as outputRlcPdfBlobWithCompanyHeader } from "../../lib/pdf/companyPdfHeader";
import { API_BASE } from "../../lib/apiBase";
// apps/web/src/pages/buchhaltung/AbschlagsrechnungDetail.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useProject } from "../../store/useProject";
import "./styles.css";

function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

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
new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR"
}).format(safeNum(v));

function safeTrim(v: unknown) {
  return String(v ?? "").trim();
}

function safeNum(x: unknown, fallback = 0) {
  if (x === null || x === undefined || x === "") return fallback;
  const normalized =
  typeof x === "string" ? x.replace(/\s/g, "").replace(",", ".") : x;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...(init?.headers || {})
  };

  const res = await fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: "include"
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Server-Fehler (${res.status})`);
  }

  return (await res.json()) as T;
}

function recalc(a: AbschlagItem): AbschlagItem {
  const mwst = safeNum(a.mwst, 19);
  const rows = Array.isArray(a.rows) ? a.rows : [];

  const normalizedRows: AbschlagRow[] = rows.map((r) => {
    const qty = safeNum(r.qty);
    const ep = safeNum(r.ep);
    return {
      lvPos: safeTrim(r.lvPos),
      kurztext: safeTrim(r.kurztext),
      einheit: safeTrim(r.einheit) || "m",
      qty,
      ep,
      total: qty * ep
    };
  });

  const netto = normalizedRows.reduce((sum, r) => sum + safeNum(r.total), 0);
  const brutto = netto * (1 + mwst / 100);

  return {
    ...a,
    id: safeTrim(a.id),
    projectId: safeTrim(a.projectId),
    nr: safeNum(a.nr),
    date: safeTrim(a.date),
    title: safeTrim(a.title),
    mwst,
    rows: normalizedRows,
    netto,
    brutto
  };
}

/* =================== PDF HELPERS =================== */

function drawBox(
doc: jsPDF,
x: number,
y: number,
w: number,
h: number,
lw = 0.6)
{
  doc.setLineWidth(lw);
  doc.rect(x, y, w, h);
}

async function printJsPdf(doc: jsPDF) {
  const blob = await outputRlcPdfBlobWithCompanyHeader(doc);
  const url = URL.createObjectURL(blob);

  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) {
    saveRlcPdfWithCompanyHeader(doc, "document.pdf");
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
    } catch {

      // ignore
    }}, 200);
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

  drawBox(doc, outerX, headerY, outerW, headerH, 0.9);
  drawBox(doc, leftX, headerY, leftW, headerH, 0.6);
  drawBox(doc, midX, headerY, midW, headerH, 0.6);
  drawBox(doc, rightX, headerY, rightW, headerH, 0.6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Abschlagsrechnung", leftX + 10, headerY + 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(`Projekt: ${projectCode}`, leftX + 10, headerY + 22);
  doc.text(`${projectName}`, leftX + 10, headerY + 28);

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

  const rowH = headerH / 3;

  doc.setLineWidth(0.6);
  doc.line(rightX, headerY + rowH, rightX + rightW, headerY + rowH);
  doc.line(rightX, headerY + rowH * 2, rightX + rightW, headerY + rowH * 2);

  function rightCell(label: string, value: string, topY: number) {
    const labelY = topY + 4.2;
    const valueY = topY + rowH - 4;

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

  let y = headerY + headerH + 10;

  const body = (item.rows || []).map((r) => [
  r.lvPos || "",
  r.kurztext || "",
  r.einheit || "",
  safeNum(r.qty).toString(),
  fmtEUR(safeNum(r.ep)),
  fmtEUR(safeNum(r.total))]
  );

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
      valign: "middle"
    },
    headStyles: {
      fontStyle: "bold",
      lineWidth: 0.5
    },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 88 },
      2: { cellWidth: 18 },
      3: { halign: "right", cellWidth: 20 },
      4: { halign: "right", cellWidth: 22 },
      5: { halign: "right", cellWidth: 24 }
    },
    margin: { left: margin, right: margin }
  });

  const lastY = (doc as any).lastAutoTable?.finalY ?
  (doc as any).lastAutoTable.finalY :
  y + 60;

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
    align: "right"
  });
  doc.text(fmtEUR(item.brutto), totalsX + totalsW - 6, totalsY + tRow + tRow / 2 + 3.2, {
    align: "right"
  });
  doc.text(fmtEUR(item.brutto), totalsX + totalsW - 6, totalsY + tRow * 2 + tRow / 2 + 3.2, {
    align: "right"
  });

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
  const projectKey = safeTrim(p?.code);

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
      const data: any = await apiJson(
        `/api/abschlag/list/${encodeURIComponent(projectKey)}`
      );

      const nextItems = (Array.isArray(data?.items) ? data.items : []).map(recalc);
      setItems(nextItems);
      setFilePath(data?.file || null);
    } catch (e: any) {
      setInfo((e?.message || "Fehler beim Laden") + `\n\nAPI: ${API_BASE || "(relative)"}`);
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

      const data: any = await apiJson(
        `/api/abschlag/save/${encodeURIComponent(projectKey)}`,
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );

      setFilePath(data?.file || null);
      setInfo(`Gespeichert (${data?.saved ?? (nextItems ?? items).length}).`);
      await load();
    } catch (e: any) {
      setInfo((e?.message || "Fehler beim Speichern") + `\n\nAPI: ${API_BASE || "(relative)"}`);
    } finally {
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
    x.id === current.id ? recalc({ ...x, ...patch } as AbschlagItem) : x
    );

    setItems(next);
  }

  function patchRow(idx: number, patch: Partial<AbschlagRow>) {
    if (!current) return;

    const rows = (current.rows || []).map((r, i) => {
      if (i !== idx) return r;

      const qty = patch.qty !== undefined ? safeNum(patch.qty) : safeNum(r.qty);
      const ep = patch.ep !== undefined ? safeNum(patch.ep) : safeNum(r.ep);

      return {
        ...r,
        ...patch,
        qty,
        ep,
        total: qty * ep
      };
    });

    patchCurrent({ rows });
  }

  function addRow() {
    if (!current) return;

    patchCurrent({
      rows: [
      ...(current.rows || []),
      {
        lvPos: "",
        kurztext: "",
        einheit: "m",
        qty: 0,
        ep: 0,
        total: 0
      }]

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
      item: current
    });

    await printJsPdf(doc);
  }

  function exportPdf() {
    if (!current) return;

    const doc = buildAbschlagPdf({
      projectCode: String(p?.code || ""),
      projectName: String(p?.name || ""),
      item: current
    });

    saveRlcPdfWithCompanyHeader(doc, `${p?.code || "Projekt"}_Abschlag_${current.nr}.pdf`);
  }

  if (!p) {
    return (
      <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-66">
        <h2>Abschlagsrechnung</h2>
        <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-67">Kein Projekt ausgewählt.</div>
        <button onClick={() => navigate(-1)} className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-68">
          ← Zurück
        </button>
      </div>);

  }

  if (!current) {
    return (
      <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-69">
        <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-70">






          
          <button onClick={() => navigate("/buchhaltung/abschlagsrechnungen")}>
            ← Zurück
          </button>
          <button onClick={() => void load()} disabled={loading}>
            Laden
          </button>
        </div>

        {info ?
        <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-71">





          
            {info}
          </div> :

        <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-72">
            {loading ? "Lädt…" : "Kein Eintrag gefunden."}
          </div>
        }
      </div>);

  }

  return (
    <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-73">
      <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-74">






        
        <div>
          <nav className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-75">
            RLC / 7. Buchhaltung / Abrechnung / Abschlagsrechnungen / Detail
          </nav>
          <h2 className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-76">
            {current.title || `Abschlagsrechnung ${current.nr}`}
          </h2>
          <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-77">
            <b>{p.code}</b> — {p.name}
          </div>
          <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-78">
            Datei:{" "}
            <span className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-79">{filePath || ""}</span>
          </div>
        </div>

        <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-80">






          
          <button onClick={() => navigate("/buchhaltung/abschlagsrechnungen")}>
            ← Zurück
          </button>
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

      {info &&
      <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-81">










        
          {info}
        </div>
      }

      <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-82">
        <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-83">







          
          <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-84">Netto</div>
          <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-85">{fmtEUR(current.netto)}</div>
        </div>

        <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-86">







          
          <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-87">Brutto</div>
          <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-88">{fmtEUR(current.brutto)}</div>
        </div>

        <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-89">







          
          <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-90">MwSt</div>
          <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-91">{safeNum(current.mwst)} %</div>
        </div>
      </div>

      <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-92">







        
        <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-93">







          
          <div className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-94">
            <label className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-95">
              Titel{" "}
              <input
                value={current.title || ""}
                onChange={(e) => patchCurrent({ title: e.target.value })} className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-96" />







              
            </label>

            <label className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-97">
              Datum{" "}
              <input
                type="date"
                value={current.date}
                onChange={(e) => patchCurrent({ date: e.target.value })} className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-98" />






              
            </label>

            <label className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-99">
              Status{" "}
              <select
                value={current.status}
                onChange={(e) =>
                patchCurrent({ status: e.target.value as AbschlagStatus })
                } className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-100">






                
                <option value="Entwurf">Entwurf</option>
                <option value="Freigegeben">Freigegeben</option>
                <option value="Gebucht">Gebucht</option>
              </select>
            </label>
          </div>

          <button onClick={addRow} disabled={loading} className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-101">
            + Position hinzufügen
          </button>
        </div>

        <table className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-102">
          <thead className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-103">
            <tr>
              <th className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-104">





                
                LV-Pos
              </th>
              <th className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-105">





                
                Kurztext
              </th>
              <th className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-106">





                
                Einheit
              </th>
              <th className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-107">





                
                Menge
              </th>
              <th className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-108">





                
                EP
              </th>
              <th className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-109">





                
                Gesamt
              </th>
              <th className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-110">





                
                Aktion
              </th>
            </tr>
          </thead>

          <tbody>
            {(current.rows || []).map((r, idx) =>
            <tr key={idx}>
                <td className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-111">
                  <input
                  value={r.lvPos || ""}
                  onChange={(e) => patchRow(idx, { lvPos: e.target.value })} className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-112" />






                
                </td>

                <td className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-113">
                  <input
                  value={r.kurztext || ""}
                  onChange={(e) => patchRow(idx, { kurztext: e.target.value })} className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-114" />






                
                </td>

                <td className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-115">
                  <input
                  value={r.einheit || ""}
                  onChange={(e) => patchRow(idx, { einheit: e.target.value })} className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-116" />






                
                </td>

                <td className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-117">





                
                  <input
                  type="number"
                  value={safeNum(r.qty)}
                  onChange={(e) => patchRow(idx, { qty: safeNum(e.target.value) })} className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-118" />







                
                </td>

                <td className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-119">





                
                  <input
                  type="number"
                  value={safeNum(r.ep)}
                  onChange={(e) => patchRow(idx, { ep: safeNum(e.target.value) })} className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-120" />







                
                </td>

                <td className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-121">






                
                  {fmtEUR(safeNum(r.total))}
                </td>

                <td className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-122">





                
                  <button onClick={() => removeRow(idx)} disabled={loading}>
                    Löschen
                  </button>
                </td>
              </tr>
            )}

            {(current.rows || []).length === 0 &&
            <tr>
                <td colSpan={7} className="rlc-migrated-pages-buchhaltung-abschlagsrechnungdetail-tsx-123">
                  Keine Positionen. Wenn du aus „Verknüpfung“ übernommen hast,
                  werden sie hier sichtbar.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>);

}
