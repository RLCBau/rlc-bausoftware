import { rlcClass } from "../../ui/rlcRuntimeStyle";import { savePdfWithCompanyHeader as saveRlcPdfWithCompanyHeader } from "../../lib/pdf/companyPdfHeader";
import React, { useMemo, useState } from "react";
import "./styles.css";

/* =========================
   TYPES
   ========================= */
type Forderung = {
  id: number;
  nr: string;
  kunde: string;
  datum: string;
  faellig: string;
  brutto: number;
  bezahlt: number;
  stufe: 0 | 1 | 2 | 3;
  letzteMahnung?: string;
  gebuehr?: number;
  zinssatz?: number;
  notiz?: string;
};

type Zeitraum = "ALL" | "30" | "60" | "90" | "THIS_MONTH" | "YTD";
type Status = "ALL" | "OVERDUE" | "DUNNED" | "CLEARED";

/* =========================
   HELPERS
   ========================= */
const fmt = (n: number) =>
safeNumber(n).toLocaleString("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
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

const parseDE = (s: string) => {
  const value = safeTrim(s);
  if (!value) return new Date("1970-01-01");

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
    const [d, m, y] = value.split(".").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? new Date("1970-01-01") : dt;
};

const daysBetween = (a: Date, b: Date) =>
Math.round((+a - +b) / 86400000);

const isSameMonth = (d: Date, ref = new Date()) =>
d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();

const withinDays = (d: Date, days: number) => {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - days);
  return d >= from;
};

const todayDE = () => new Date().toLocaleDateString("de-DE");

const offen = (f: Forderung) => Math.max(0, safeNumber(f.brutto) - safeNumber(f.bezahlt));
const overdueDays = (f: Forderung) =>
Math.max(0, daysBetween(new Date(), parseDE(f.faellig)));

const defaultGebuehr = (stufe: number) =>
stufe === 1 ? 5 : stufe === 2 ? 10 : stufe >= 3 ? 20 : 0;

const defaultZins = (stufe: number) => stufe >= 2 ? 9.0 : 5.0;

function escapeHtml(s: unknown) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (m) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[m]!
  );
}

function csvEscape(v: unknown) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

/* =========================
   COMPONENT
   ========================= */
export default function Mahnwesen() {
  const [rows, setRows] = useState<Forderung[]>([
  {
    id: 1,
    nr: "R-2025-001",
    kunde: "Muster GmbH",
    datum: "30.09.2025",
    faellig: "30.10.2025",
    brutto: 5355.0,
    bezahlt: 1200,
    stufe: 1,
    letzteMahnung: "05.11.2025",
    gebuehr: 5,
    zinssatz: 5,
    notiz: "Erinnerung per Mail"
  },
  {
    id: 2,
    nr: "R-2025-002",
    kunde: "Bau AG",
    datum: "15.09.2025",
    faellig: "15.10.2025",
    brutto: 3439.1,
    bezahlt: 0,
    stufe: 2,
    letzteMahnung: "01.11.2025",
    gebuehr: 10,
    zinssatz: 9
  },
  {
    id: 3,
    nr: "R-2025-003",
    kunde: "Stadtwerke",
    datum: "28.10.2025",
    faellig: "27.11.2025",
    brutto: 10486.0,
    bezahlt: 0,
    stufe: 0
  },
  {
    id: 4,
    nr: "R-2025-004",
    kunde: "Privat Huber",
    datum: "01.09.2025",
    faellig: "01.10.2025",
    brutto: 890.0,
    bezahlt: 890.0,
    stufe: 0
  }]
  );

  const [sel, setSel] = useState<Record<number, boolean>>({});
  const toggleSel = (id: number) => setSel((s) => ({ ...s, [id]: !s[id] }));
  const allFilteredSelected = (arr: Forderung[]) =>
  arr.length > 0 && arr.every((r) => sel[r.id]);
  const toggleAll = (arr: Forderung[]) => {
    const all = allFilteredSelected(arr);
    const next: Record<number, boolean> = { ...sel };
    arr.forEach((r) => {
      next[r.id] = !all;
    });
    setSel(next);
  };

  const [zeitraum, setZeitraum] = useState<Zeitraum>("THIS_MONTH");
  const [status, setStatus] = useState<Status>("ALL");
  const [kunde, setKunde] = useState<string>("ALL");

  const kundenListe = useMemo(
    () => ["ALL", ...Array.from(new Set(rows.map((r) => r.kunde).filter(Boolean)))],
    [rows]
  );

  const filtered = useMemo(() => {
    let arr = rows.slice();

    arr = arr.filter((r) => {
      const d = parseDE(r.datum);
      switch (zeitraum) {
        case "30":
          return withinDays(d, 30);
        case "60":
          return withinDays(d, 60);
        case "90":
          return withinDays(d, 90);
        case "THIS_MONTH":
          return isSameMonth(d, new Date());
        case "YTD":
          return d.getFullYear() === new Date().getFullYear();
        default:
          return true;
      }
    });

    if (kunde !== "ALL") {
      arr = arr.filter((r) => r.kunde === kunde);
    }

    if (status !== "ALL") {
      arr = arr.filter((r) => {
        const of = offen(r);
        const od = overdueDays(r);
        const hatMahnung = (r.stufe || 0) > 0 || !!r.letzteMahnung;

        if (status === "CLEARED") return of <= 0.01;
        if (status === "DUNNED") return of > 0.01 && hatMahnung;
        if (status === "OVERDUE") return of > 0.01 && od > 0;
        return true;
      });
    }

    arr.sort(
      (a, b) =>
      overdueDays(b) - overdueDays(a) ||
      safeNumber(b.stufe) - safeNumber(a.stufe)
    );

    return arr;
  }, [rows, zeitraum, status, kunde]);

  const totals = useMemo(() => {
    const off = filtered.reduce((s, r) => s + offen(r), 0);
    const due = filtered.reduce(
      (s, r) => s + (overdueDays(r) > 0 ? offen(r) : 0),
      0
    );
    return { off, due };
  }, [filtered]);

  const selectedIds = useMemo(
    () =>
    Object.keys(sel).
    filter((k) => sel[+k]).
    map(Number),
    [sel]
  );

  const update = <K extends keyof Forderung,>(id: number, key: K, val: Forderung[K]) => {
    setRows((prev) =>
    prev.map((r) =>
    r.id === id ?
    {
      ...r,
      [key]:
      key === "bezahlt" || key === "gebuehr" || key === "zinssatz" ?
      safeNumber(val, 0) :
      val
    } :
    r
    )
    );
  };

  const hochstufen = (ids: number[]) => {
    if (!ids.length) return;

    setRows((prev) =>
    prev.map((r) => {
      if (!ids.includes(r.id)) return r;

      const next = Math.min(3, safeNumber(r.stufe) + 1) as 0 | 1 | 2 | 3;

      return {
        ...r,
        stufe: next,
        letzteMahnung: todayDE(),
        gebuehr: r.gebuehr ?? defaultGebuehr(next),
        zinssatz: r.zinssatz ?? defaultZins(next)
      };
    })
    );
  };

  const zuruecksetzen = (ids: number[]) => {
    if (!ids.length) return;

    setRows((prev) =>
    prev.map((r) =>
    ids.includes(r.id) ?
    {
      ...r,
      stufe: 0,
      letzteMahnung: undefined,
      gebuehr: undefined
    } :
    r
    )
    );
  };

  const exportCSV = (useFiltered: boolean) => {
    const list = useFiltered ? filtered : rows;

    const data = list.map((r) => ({
      Rechnung: r.nr,
      Kunde: r.kunde,
      Datum: r.datum,
      Faellig: r.faellig,
      Brutto: fmt(r.brutto),
      Bezahlt: fmt(r.bezahlt || 0),
      Offen: fmt(offen(r)),
      Überfällig_Tage: overdueDays(r),
      Stufe: r.stufe,
      LetzteMahnung: r.letzteMahnung || "",
      Gebühr: fmt(r.gebuehr ?? defaultGebuehr(r.stufe)),
      Zinssatz: String(r.zinssatz ?? defaultZins(r.stufe)).replace(".", ","),
      Notiz: r.notiz || ""
    }));

    if (!data.length) {
      alert("Keine Daten für den Export vorhanden.");
      return;
    }

    const headers = Object.keys(data[0]);
    const csv = [
    headers.map(csvEscape).join(";"),
    ...data.map((row) =>
    headers.map((h) => csvEscape((row as Record<string, unknown>)[h])).join(";")
    )].
    join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = useFiltered ? "mahnwesen_gefiltert.csv" : "mahnwesen_alle.csv";
    a.click();
    URL.revokeObjectURL(href);
  };

  function openPrint(html: string) {
    const w = window.open("", "_blank", "noopener,noreferrer,width=1000,height=700");
    if (!w) {
      alert("Pop-ups blockiert – bitte erlauben.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      try {
        w.print();
      } catch {}
    }, 400);
  }

  const printMahnungEinzeln = (r: Forderung) => openPrint(briefHTML(r));
  const printMahnungListe = (list: Forderung[]) => {
    if (!list.length) {
      alert("Keine Daten für den Report vorhanden.");
      return;
    }
    openPrint(reportHTML(list));
  };

  const downloadMahnungEinzeln = async (r: Forderung) => {
    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");

    const node = buildBriefNode(r);
    const canvas = await html2canvas(node, { scale: 2 });
    node.remove();

    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    addCanvas(pdf, canvas);
    saveRlcPdfWithCompanyHeader(pdf, `Mahnung_${r.nr}.pdf`);
  };

  const downloadMahnungListe = async (list: Forderung[]) => {
    if (!list.length) {
      alert("Keine Daten für den PDF-Download vorhanden.");
      return;
    }

    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");

    const pdf = new jsPDF({ unit: "pt", format: "a4" });

    for (let i = 0; i < list.length; i++) {
      const node = buildBriefNode(list[i]);
      const canvas = await html2canvas(node, { scale: 2 });
      node.remove();

      if (i > 0) pdf.addPage();
      addCanvas(pdf, canvas);
    }

    saveRlcPdfWithCompanyHeader(pdf, "Mahnschreiben.pdf");
  };

  const addCanvas = (pdf: any, canvas: HTMLCanvasElement) => {
    const img = canvas.toDataURL("image/png");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    pdf.addImage(img, "PNG", x, y, w, h);
  };

  const buildBriefNode = (r: Forderung) => {
    const wrap = document.createElement("div");
    wrap.style.position = "fixed";
    wrap.style.left = "-10000px";
    wrap.style.top = "0";
    wrap.style.width = "794px";
    wrap.style.background = "#fff";
    wrap.style.padding = "28px";
    wrap.innerHTML = briefInnerHTML(r);
    document.body.appendChild(wrap);
    return wrap;
  };

  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <h2>Mahnwesen</h2>
        <div className="bh-actions">
          <button className="bh-btn ghost" onClick={() => exportCSV(true)}>
            Export CSV (gefiltert)
          </button>
          <button className="bh-btn ghost" onClick={() => exportCSV(false)}>
            Export CSV (alle)
          </button>
          <button className="bh-btn ghost" onClick={() => printMahnungListe(filtered)}>
            PDF Report (gefiltert)
          </button>
          <button className="bh-btn ghost" onClick={() => downloadMahnungListe(filtered)}>
            Download PDF (gefiltert)
          </button>
          <button className="bh-btn" onClick={() => hochstufen(selectedIds)}>
            Ausgewählte hochstufen
          </button>
          <button
            className="bh-btn rlc-migrated-pages-buchhaltung-mahnwesen-tsx-249"

            onClick={() => zuruecksetzen(selectedIds)}>
            
            Stufe zurücksetzen
          </button>
        </div>
      </div>

      <div className="bh-filters">
        <div>
          <label>Zeitraum (Rechnungsdatum)</label>
          <select value={zeitraum} onChange={(e) => setZeitraum(e.target.value as Zeitraum)}>
            <option value="THIS_MONTH">Dieser Monat</option>
            <option value="30">Letzte 30 Tage</option>
            <option value="60">Letzte 60 Tage</option>
            <option value="90">Letzte 90 Tage</option>
            <option value="YTD">YTD</option>
            <option value="ALL">Alle</option>
          </select>
        </div>

        <div>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="ALL">Alle</option>
            <option value="OVERDUE">Überfällig</option>
            <option value="DUNNED">Abgemahnt</option>
            <option value="CLEARED">Ausgeglichen</option>
          </select>
        </div>

        <div>
          <label>Kunde</label>
          <select value={kunde} onChange={(e) => setKunde(e.target.value)}>
            {kundenListe.map((k) =>
            <option key={k} value={k}>
                {k === "ALL" ? "Alle" : k}
              </option>
            )}
          </select>
        </div>

        <div className="rlc-migrated-pages-buchhaltung-mahnwesen-tsx-250">
          Offen gesamt: {fmt(totals.off)} € · Davon überfällig: {fmt(totals.due)} €
        </div>
      </div>

      <table className="bh-table">
        <thead>
          <tr>
            <th className="rlc-migrated-pages-buchhaltung-mahnwesen-tsx-251">
              <input
                type="checkbox"
                checked={allFilteredSelected(filtered)}
                onChange={() => toggleAll(filtered)} />
              
            </th>
            <th>Rechnung</th>
            <th>Kunde</th>
            <th>Datum</th>
            <th>Fällig</th>
            <th className="right">Brutto (€)</th>
            <th className="right">Bezahlt (€)</th>
            <th className="right">Offen (€)</th>
            <th>Überfällig (Tage)</th>
            <th>Stufe</th>
            <th>Gebühr (€)</th>
            <th>Zins p.a. (%)</th>
            <th>Letzte Mahnung</th>
            <th>Aktionen</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          {filtered.map((r) => {
            const of = offen(r);
            const od = overdueDays(r);
            const idSel = !!sel[r.id];
            const warn = of > 0.01 && od > 0;

            return (
              <tr key={r.id} className={rlcClass(null, { background: warn ? "#fff7f5" : undefined })}>
                <td>
                  <input
                    type="checkbox"
                    checked={idSel}
                    onChange={() => toggleSel(r.id)} />
                  
                </td>

                <td>{r.nr}</td>
                <td>{r.kunde}</td>
                <td>{r.datum}</td>
                <td>{r.faellig}</td>
                <td className="right">{fmt(r.brutto)}</td>

                <td className="right">
                  <input
                    type="number"
                    step="0.01"
                    value={r.bezahlt}
                    onChange={(e) => update(r.id, "bezahlt", safeNumber(e.target.value, 0))} className="rlc-migrated-pages-buchhaltung-mahnwesen-tsx-252" />

                  
                </td>

                <td className={rlcClass(
                  "right",
                  {
                    fontWeight: 600,
                    color: of > 0 ? "#c0392b" : "#2c3e50"
                  })}>
                  
                  {fmt(of)}
                </td>

                <td className={rlcClass(null,
                {
                  fontWeight: 600,
                  color: od > 0 ? "#b02a1a" : "#2c3e50"
                })}>
                  
                  {od}
                </td>

                <td>
                  <select
                    value={r.stufe}
                    onChange={(e) =>
                    update(r.id, "stufe", Number(e.target.value) as Forderung["stufe"])
                    }>
                    
                    <option value={0}>0 – Erinnerung</option>
                    <option value={1}>1 – 1. Mahnung</option>
                    <option value={2}>2 – 2. Mahnung</option>
                    <option value={3}>3 – Letzte Mahnung</option>
                  </select>
                </td>

                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={r.gebuehr ?? defaultGebuehr(r.stufe)}
                    onChange={(e) => update(r.id, "gebuehr", safeNumber(e.target.value, 0))} className="rlc-migrated-pages-buchhaltung-mahnwesen-tsx-253" />

                  
                </td>

                <td>
                  <input
                    type="number"
                    step="0.1"
                    value={r.zinssatz ?? defaultZins(r.stufe)}
                    onChange={(e) => update(r.id, "zinssatz", safeNumber(e.target.value, 0))} className="rlc-migrated-pages-buchhaltung-mahnwesen-tsx-254" />

                  
                </td>

                <td>
                  <input
                    type="text"
                    value={r.letzteMahnung || ""}
                    placeholder="tt.mm.jjjj"
                    onChange={(e) => update(r.id, "letzteMahnung", e.target.value)} className="rlc-migrated-pages-buchhaltung-mahnwesen-tsx-255" />

                  
                </td>

                <td>
                  <div className="rlc-migrated-pages-buchhaltung-mahnwesen-tsx-256">
                    <button className="bh-btn ghost" onClick={() => hochstufen([r.id])}>
                      Hochstufen
                    </button>
                    <button
                      className="bh-btn ghost rlc-migrated-pages-buchhaltung-mahnwesen-tsx-257"

                      onClick={() => zuruecksetzen([r.id])}>
                      
                      Zurücksetzen
                    </button>
                    <button className="bh-btn ghost" onClick={() => printMahnungEinzeln(r)}>
                      Print
                    </button>
                    <button className="bh-btn ghost" onClick={() => downloadMahnungEinzeln(r)}>
                      Download
                    </button>
                  </div>
                </td>

                <td>
                  {of <= 0.01 ?
                  <span className="chip ok">Ausgeglichen</span> :
                  r.stufe > 0 ?
                  <span className="chip warn">Abgemahnt</span> :
                  od > 0 ?
                  <span className="chip warn">Überfällig</span> :

                  <span className="chip">Offen</span>
                  }
                </td>
              </tr>);

          })}

          {filtered.length === 0 &&
          <tr>
              <td colSpan={15} className="rlc-migrated-pages-buchhaltung-mahnwesen-tsx-258">
                Keine Forderungen im aktuellen Filter.
              </td>
            </tr>
          }

          <tr className="rlc-migrated-pages-buchhaltung-mahnwesen-tsx-259">
            <td colSpan={7} className="rlc-migrated-pages-buchhaltung-mahnwesen-tsx-260">
              Summe (gefiltert) – Offen:
            </td>
            <td className="right">{fmt(totals.off)}</td>
            <td colSpan={7}></td>
          </tr>
        </tbody>
      </table>

      <div className="bh-note rlc-migrated-pages-buchhaltung-mahnwesen-tsx-261">
        *Demo – Per l’invio email: POST <code>/api/mahnung/send</code> con HTML/PDF,
        CC Bauleiter; per automatismi, pianifica escalation (z.B. +7 / +14 / +21 giorni).
      </div>
    </div>);

}

/* =========================
   TEMPLATES & HTML
   ========================= */
function briefInnerHTML(r: Forderung) {
  const of = offen(r);
  const od = overdueDays(r);
  const geb = r.gebuehr ?? defaultGebuehr(r.stufe);
  const zinssatz = r.zinssatz ?? defaultZins(r.stufe);
  const zinsProTag = of * (zinssatz / 100) / 365;
  const zinsBisher = Math.max(
    0,
    Math.round(zinsProDagSafe(zinsProTag, od) * 100) / 100
  );

  const stufeTitel =
  r.stufe === 0 ?
  "Zahlungserinnerung" :
  r.stufe === 1 ?
  "1. Mahnung" :
  r.stufe === 2 ?
  "2. Mahnung" :
  "Letzte Mahnung";

  return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(
    stufeTitel
  )} ${escapeHtml(r.nr)}</title>
<style>
body{font-family:Arial, sans-serif;margin:40px;color:#222}
h1{margin:0 0 8px}
.muted{color:#666}
table{width:100%;border-collapse:collapse;margin-top:14px}
th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}
.right{text-align:right}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#fff7e6;color:#9a6700;font-size:12px}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start">
  <div>
    <div style="font-weight:800;font-size:20px">RLC Bausoftware</div>
    <div class="muted">Mahnwesen</div>
  </div>
  <div class="right">
    <div>${new Date().toLocaleDateString("de-DE")}</div>
    <div class="badge">${escapeHtml(stufeTitel)}</div>
  </div>
</div>

<p>Sehr geehrte Damen und Herren (${escapeHtml(r.kunde)}),</p>
<p>zu der unten genannten Rechnung liegt ein offener Betrag vor. Bitte begleichen Sie die Forderung unverzüglich.</p>

<table>
  <tbody>
    <tr><td>Rechnung</td><td>${escapeHtml(r.nr)}</td></tr>
    <tr><td>Rechnungsdatum</td><td>${escapeHtml(r.datum)}</td></tr>
    <tr><td>Fällig am</td><td>${escapeHtml(r.faellig)}</td></tr>
    <tr><td>Überfällig</td><td>${od} Tage</td></tr>
    <tr><td>Gesamt (brutto)</td><td class="right">${fmt(r.brutto)} €</td></tr>
    <tr><td>Bezahlt</td><td class="right">${fmt(r.bezahlt || 0)} €</td></tr>
    <tr><td>Offen</td><td class="right"><b>${fmt(of)} €</b></td></tr>
    ${geb ? `<tr><td>Mahngebühr</td><td class="right">${fmt(geb)} €</td></tr>` : ""}
    ${zinsBisher > 0 ? `<tr><td>Zinsen (bis heute)</td><td class="right">${fmt(zinsBisher)} €</td></tr>` : ""}
  </tbody>
</table>

<p>Bitte überweisen Sie den Gesamtbetrag innerhalb von 7 Tagen auf das bekannte Konto. Bei Rückfragen wenden Sie sich bitte an unsere Buchhaltung.</p>

<p class="muted">Hinweis: Mit Ausbleiben der Zahlung behalten wir uns weitere rechtliche Schritte vor.</p>

<p>Mit freundlichen Grüßen<br/>RLC Bausoftware</p>
</body></html>`;
}

function reportHTML(list: Forderung[]) {
  const body = list.
  map(
    (r) => `
    <tr>
      <td>${escapeHtml(r.nr)}</td>
      <td>${escapeHtml(r.kunde)}</td>
      <td>${escapeHtml(r.datum)}</td>
      <td>${escapeHtml(r.faellig)}</td>
      <td class="right">${fmt(r.brutto)}</td>
      <td class="right">${fmt(r.bezahlt || 0)}</td>
      <td class="right">${fmt(offen(r))}</td>
      <td>${overdueDays(r)}</td>
      <td>${r.stufe}</td>
      <td>${escapeHtml(r.letzteMahnung || "")}</td>
    </tr>
  `
  ).
  join("");

  return `<!doctype html><html><head><meta charset="utf-8"/><title>Mahn-Report</title>
<style>
body{font-family:Arial, sans-serif;margin:32px;color:#222}
h1{margin:0 0 12px}
table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}
.right{text-align:right}
</style></head><body>
<h1>Mahnwesen – Report</h1>
<table>
  <thead><tr>
    <th>Rechnung</th><th>Kunde</th><th>Datum</th><th>Fällig</th>
    <th class="right">Brutto</th><th class="right">Bezahlt</th><th class="right">Offen</th>
    <th>Überfällig</th><th>Stufe</th><th>Letzte Mahnung</th>
  </tr></thead>
  <tbody>${body || `<tr><td colspan="10" style="color:#666">Keine Daten.</td></tr>`}</tbody>
</table>
</body></html>`;
}

function briefHTML(r: Forderung) {
  return briefInnerHTML(r);
}

function zinsProDagSafe(proTag: number, tage: number) {
  if (!isFinite(proTag) || proTag <= 0 || tage <= 0) return 0;
  return proTag * tage;
}
