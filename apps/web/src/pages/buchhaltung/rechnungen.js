import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { savePdfWithCompanyHeader as saveRlcPdfWithCompanyHeader } from "../../lib/pdf/companyPdfHeader";
import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { useProject } from "../../store/useProject";
import { apiUrl } from "../../lib/apiBase";
const RECHNUNG_STORAGE_KEY = "rlc_rechnungen_v1";
const fmt = (n) => Number(n || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});
const brutto = (r) => safeNumber(r.netto) * (1 + safeNumber(r.mwstPct) / 100);
const offen = (r) => Math.max(0, brutto(r) - safeNumber(r.gezahlt));
const statusOf = (r) => {
    const b = brutto(r);
    const g = safeNumber(r.gezahlt);
    if (g <= 0.01)
        return "OPEN";
    if (g >= b - 0.01)
        return "PAID";
    return "PART";
};
const parseDate = (s) => {
    if (!s)
        return new Date("1970-01-01");
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
        const [d, m, y] = s.split(".").map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
    }
    const dt = new Date(s);
    return Number.isNaN(dt.getTime()) ? new Date("1970-01-01") : dt;
};
const withinDays = (d, days) => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - days);
    return d >= from;
};
const isSameMonth = (d, ref) => d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
function safeTrim(v) {
    return String(v ?? "").trim();
}
function safeNumber(v, fallback = 0) {
    if (v === null || v === undefined || v === "")
        return fallback;
    const normalized = typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : fallback;
}
function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[m]);
}
function labelOf(s) {
    return s === "OPEN" ? "Offen" : s === "PART" ? "Teilbezahlt" : "Bezahlt";
}
function getAufmassKey(projectId) {
    return `RLC_AUFMASS_${projectId}`;
}
function loadAufmass(projectId) {
    if (!projectId)
        return [];
    try {
        const raw = localStorage.getItem(getAufmassKey(projectId));
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function loadRechnungen() {
    try {
        const raw = localStorage.getItem(RECHNUNG_STORAGE_KEY);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function saveRechnungen(rows) {
    localStorage.setItem(RECHNUNG_STORAGE_KEY, JSON.stringify(rows));
}
function authHeaders() {
    for (const key of ["rlc_token", "token", "authToken", "accessToken", "rlc_auth_token"]) {
        const token = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (token?.trim())
            return { Authorization: `Bearer ${token.trim()}` };
    }
    return {};
}
function normalizeServerRechnung(row, index) {
    const positionsRaw = Array.isArray(row?.positions) ?
        row.positions :
        Array.isArray(row?.rows) ?
            row.rows :
            [];
    const positions = positionsRaw.map((p, i) => {
        const qty = safeNumber(p?.qty ?? p?.quantity ?? p?.menge, 0);
        const ep = safeNumber(p?.ep ?? p?.price, 0);
        const factor = safeNumber(p?.factor, 1) || 1;
        return {
            ...p,
            id: safeTrim(p?.id || `${row?.id || index}-${i + 1}`),
            pos: safeTrim(p?.pos || p?.position || i + 1),
            text: safeTrim(p?.text || p?.beschreibung || p?.kurztext),
            unit: safeTrim(p?.unit || p?.einheit),
            qty,
            ep,
            factor,
            total: safeNumber(p?.total, qty * ep * factor)
        };
    });
    return {
        ...row,
        id: row?.id ?? index + 1,
        nr: safeTrim(row?.nr || row?.rechnungNr),
        datum: safeTrim(row?.datum || row?.date),
        kunde: safeTrim(row?.kunde || row?.customerName),
        netto: safeNumber(row?.netto, positions.reduce((sum, p) => sum + p.total, 0)),
        mwstPct: safeNumber(row?.mwstPct ?? row?.mwst, 19),
        gezahlt: safeNumber(row?.gezahlt, 0),
        typ: (["ABSCHLAG", "SCHLUSS"].includes(String(row?.typ)) ? row.typ : "RECHNUNG"),
        positions
    };
}
function nextRechnungNr(rows) {
    const year = new Date().getFullYear();
    const nextId = rows.length ? Math.max(...rows.map((r) => safeNumber(r.id))) + 1 : 1;
    return `R-${year}-${String(nextId).padStart(3, "0")}`;
}
function aufmassToPositions(rows) {
    return rows.
        filter((r) => safeNumber(r.ist, 0) > 0).
        map((r) => {
        const factor = safeNumber(r.factor, 1) || 1;
        const qty = safeNumber(r.ist, 0);
        const ep = safeNumber(r.ep, 0);
        return {
            id: safeTrim(r.id),
            pos: safeTrim(r.pos),
            text: safeTrim(r.text),
            unit: safeTrim(r.unit) || "m",
            qty,
            ep,
            factor,
            total: qty * ep * factor,
            note: safeTrim(r.note)
        };
    });
}
function printableInvoiceHTML(r) {
    const b = brutto(r);
    const mwst = b - r.netto;
    const of = offen(r);
    const posRows = r.positions.length ?
        r.positions.
            map((p) => `
        <tr>
          <td>${escapeHtml(p.pos)}</td>
          <td>${escapeHtml(p.text)}</td>
          <td>${escapeHtml(p.unit)}</td>
          <td class="right">${fmt(p.qty)}</td>
          <td class="right">${fmt(p.ep)}</td>
          <td class="right">${fmt(p.factor)}</td>
          <td class="right">${fmt(p.total)}</td>
        </tr>
      `).
            join("") :
        `<tr><td colspan="7" class="muted">Keine Positionen vorhanden.</td></tr>`;
    return `
<!doctype html><html><head>
<meta charset="utf-8"/>
<title>Rechnung ${escapeHtml(r.nr)}</title>
<style>
  body{ font-family: Arial, sans-serif; margin:32px; color:#222; }
  h1{ margin:0 0 4px 0; }
  h2{ margin:0 0 16px 0; }
  .muted{ color:#666; }
  table{ width:100%; border-collapse:collapse; margin-top:16px; }
  th,td{ border-bottom:1px solid #ddd; padding:8px; text-align:left; vertical-align:top; }
  .right{ text-align:right; }
  .tot{ font-weight:700; background:#f7f7f7; }
  .meta{ margin-top:10px; line-height:1.5; }
</style>
</head><body>
  <h1>${r.typ === "ABSCHLAG" ? "Abschlagsrechnung" : r.typ === "SCHLUSS" ? "Schlussrechnung" : "Rechnung"}</h1>
  <div class="muted">RLC Bausoftware – Buchhaltung</div>
  <h2>${escapeHtml(r.nr)}</h2>

  <div class="meta">
    <div><b>Kunde:</b> ${escapeHtml(r.kunde)}</div>
    <div><b>Datum:</b> ${escapeHtml(r.datum)}</div>
    ${r.faellig ? `<div><b>Fällig:</b> ${escapeHtml(r.faellig)}</div>` : ""}
    ${r.projectCode ? `<div><b>Projekt:</b> ${escapeHtml(r.projectCode)}</div>` : ""}
    ${r.hinweis ? `<div><b>Hinweis:</b> ${escapeHtml(r.hinweis)}</div>` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th>Pos.</th>
        <th>Leistung</th>
        <th>ME</th>
        <th class="right">Menge</th>
        <th class="right">EP (€)</th>
        <th class="right">Faktor</th>
        <th class="right">Gesamt (€)</th>
      </tr>
    </thead>
    <tbody>
      ${posRows}
      <tr class="tot"><td colspan="6" class="right">Netto</td><td class="right">${fmt(r.netto)}</td></tr>
      <tr class="tot"><td colspan="6" class="right">MwSt (${fmt(r.mwstPct)} %)</td><td class="right">${fmt(mwst)}</td></tr>
      <tr class="tot"><td colspan="6" class="right">Brutto</td><td class="right">${fmt(b)}</td></tr>
      <tr class="tot"><td colspan="6" class="right">Gezahlt</td><td class="right">${fmt(r.gezahlt || 0)}</td></tr>
      <tr class="tot"><td colspan="6" class="right">Offen</td><td class="right">${fmt(of)}</td></tr>
    </tbody>
  </table>

  <p class="muted" style="margin-top:16px">Automatisch erstellt · ${new Date().toLocaleString("de-DE")}</p>
</body></html>`;
}
function printableReportHTML(list) {
    const rows = list.
        map((r) => {
        const b = brutto(r);
        const of = offen(r);
        return `<tr>
      <td>${escapeHtml(r.nr)}</td>
      <td>${escapeHtml(r.datum)}</td>
      <td>${escapeHtml(r.kunde)}</td>
      <td>${escapeHtml(r.typ)}</td>
      <td class="right">${fmt(r.netto)}</td>
      <td class="right">${fmt(b - r.netto)}</td>
      <td class="right">${fmt(b)}</td>
      <td class="right">${fmt(r.gezahlt || 0)}</td>
      <td class="right">${fmt(of)}</td>
      <td>${labelOf(statusOf(r))}</td>
    </tr>`;
    }).
        join("");
    const totals = list.reduce((acc, r) => {
        const b = brutto(r);
        acc.netto += safeNumber(r.netto);
        acc.mwst += b - safeNumber(r.netto);
        acc.brutto += b;
        acc.gez += safeNumber(r.gezahlt);
        acc.off += Math.max(0, b - safeNumber(r.gezahlt));
        return acc;
    }, { netto: 0, mwst: 0, brutto: 0, gez: 0, off: 0 });
    return `
<!doctype html><html><head>
<meta charset="utf-8"/>
<title>Rechnungen Report</title>
<style>
  body{ font-family: Arial, sans-serif; margin:32px; color:#222; }
  h1{ margin:0 0 16px 0; }
  .muted{ color:#666; }
  table{ width:100%; border-collapse:collapse; margin-top:16px; }
  th,td{ border-bottom:1px solid #ddd; padding:8px; text-align:left; }
  .right{ text-align:right; }
  tfoot td{ font-weight:700; background:#f7f7f7; }
</style>
</head><body>
  <h1>Rechnungen – Report</h1>
  <div class="muted">Automatisch erstellt · ${new Date().toLocaleString("de-DE")}</div>

  <table>
    <thead>
      <tr>
        <th>Nr.</th><th>Datum</th><th>Kunde</th><th>Typ</th>
        <th class="right">Netto (€)</th><th class="right">MwSt (€)</th><th class="right">Brutto (€)</th>
        <th class="right">Gezahlt (€)</th><th class="right">Offen (€)</th><th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="10" class="muted">Keine Daten.</td></tr>`}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4" class="right">Gesamt</td>
        <td class="right">${fmt(totals.netto)}</td>
        <td class="right">${fmt(totals.mwst)}</td>
        <td class="right">${fmt(totals.brutto)}</td>
        <td class="right">${fmt(totals.gez)}</td>
        <td class="right">${fmt(totals.off)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
</body></html>`;
}
function openPrint(html) {
    const printWin = window.open("", "_blank", "noopener,noreferrer,width=1000,height=700");
    if (!printWin) {
        alert("Pop-ups blockiert – bitte im Browser zulassen!");
        return;
    }
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
        try {
            printWin.focus();
            printWin.print();
        }
        catch (err) {
            console.error("Fehler beim Drucken:", err);
            alert("Druckfenster konnte nicht geöffnet werden.");
        }
    }, 400);
}
async function downloadSinglePDF(r) {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf")
    ]);
    const wrapper = document.createElement("div");
    wrapper.style.position = "fixed";
    wrapper.style.left = "-10000px";
    wrapper.style.top = "0";
    wrapper.style.width = "794px";
    wrapper.style.padding = "24px";
    wrapper.style.background = "#fff";
    wrapper.innerHTML = printableInvoiceHTML(r);
    document.body.appendChild(wrapper);
    const canvas = await html2canvas(wrapper, { scale: 2 });
    document.body.removeChild(wrapper);
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    pdf.addImage(imgData, "PNG", x, y, w, h);
    saveRlcPdfWithCompanyHeader(pdf, `${r.nr}.pdf`);
}
async function downloadAllPDF(list) {
    if (!list.length) {
        alert("Keine Rechnungen für den PDF-Download vorhanden.");
        return;
    }
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf")
    ]);
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    for (let idx = 0; idx < list.length; idx++) {
        const r = list[idx];
        const wrapper = document.createElement("div");
        wrapper.style.position = "fixed";
        wrapper.style.left = "-10000px";
        wrapper.style.top = "0";
        wrapper.style.width = "794px";
        wrapper.style.padding = "24px";
        wrapper.style.background = "#fff";
        wrapper.innerHTML = printableInvoiceHTML(r);
        document.body.appendChild(wrapper);
        const canvas = await html2canvas(wrapper, { scale: 2 });
        document.body.removeChild(wrapper);
        const imgData = canvas.toDataURL("image/png");
        if (idx > 0)
            pdf.addPage();
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
        const w = canvas.width * ratio;
        const h = canvas.height * ratio;
        const x = (pageW - w) / 2;
        const y = (pageH - h) / 2;
        pdf.addImage(imgData, "PNG", x, y, w, h);
    }
    saveRlcPdfWithCompanyHeader(pdf, "Rechnungen.pdf");
}
function StatusChip({ value }) {
    const map = {
        OPEN: { bg: "#fdecea", fg: "#b02a1a", label: "Offen" },
        PART: { bg: "#fff7e6", fg: "#9a6700", label: "Teilbezahlt" },
        PAID: { bg: "#eafaf1", fg: "#0a6c3e", label: "Bezahlt" }
    };
    const c = map[value];
    return (_jsx("span", { className: rlcClass(null, {
            background: c.bg,
            color: c.fg,
            padding: "3px 8px",
            borderRadius: 999,
            fontSize: 12
        }), children: c.label }));
}
export default function Rechnungen() {
    const { getSelectedProject } = useProject();
    const project = getSelectedProject();
    const projectId = safeTrim(project?.id);
    const projectCode = safeTrim(project?.code);
    const projectKey = projectCode || projectId;
    const projectName = safeTrim(project?.name);
    const customerName = safeTrim(project?.client) || "Neuer Kunde";
    const [rows, setRows] = useState(() => loadRechnungen());
    const [serverReady, setServerReady] = useState(false);
    const [aufmassRows, setAufmassRows] = useState([]);
    const [mwstDefault, setMwstDefault] = useState(19);
    const currentPositions = useMemo(() => aufmassToPositions(aufmassRows), [aufmassRows]);
    const currentNetto = useMemo(() => currentPositions.reduce((s, p) => s + safeNumber(p.total), 0), [currentPositions]);
    useEffect(() => {
        let cancelled = false;
        setServerReady(false);
        if (!projectKey) {
            setRows(loadRechnungen());
            setAufmassRows(loadAufmass(projectId));
            return () => {
                cancelled = true;
            };
        }
        void Promise.all([
            fetch(apiUrl(`/api/kalkulation/rechnung/${encodeURIComponent(projectKey)}`), {
                credentials: "include",
                headers: { Accept: "application/json", ...authHeaders() }
            }),
            fetch(apiUrl(`/api/aufmass/aufmass/${encodeURIComponent(projectKey)}`), {
                credentials: "include",
                headers: { Accept: "application/json", ...authHeaders() }
            })
        ]).then(async ([rechnungResponse, aufmassResponse]) => {
            if (cancelled)
                return;
            const rechnungJson = await rechnungResponse.json().catch(() => []);
            const aufmassJson = await aufmassResponse.json().catch(() => []);
            if (rechnungResponse.ok && Array.isArray(rechnungJson)) {
                const normalized = rechnungJson.map(normalizeServerRechnung);
                setRows(normalized);
                saveRechnungen(normalized);
            }
            else {
                setRows(loadRechnungen());
            }
            const serverAufmass = Array.isArray(aufmassJson) ?
                aufmassJson :
                Array.isArray(aufmassJson?.items) ?
                    aufmassJson.items :
                    [];
            setAufmassRows(aufmassResponse.ok && serverAufmass.length ? serverAufmass : loadAufmass(projectId || projectKey));
            setServerReady(rechnungResponse.ok && Array.isArray(rechnungJson));
        }).catch(() => {
            if (cancelled)
                return;
            setRows(loadRechnungen());
            setAufmassRows(loadAufmass(projectId || projectKey));
            setServerReady(false);
        });
        return () => {
            cancelled = true;
        };
    }, [projectId, projectKey]);
    useEffect(() => {
        saveRechnungen(rows);
        if (!serverReady || !projectKey)
            return;
        const timer = window.setTimeout(() => {
            void fetch(apiUrl(`/api/kalkulation/rechnung/${encodeURIComponent(projectKey)}/replace`), {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({ items: rows })
            });
        }, 500);
        return () => window.clearTimeout(timer);
    }, [rows, projectKey, serverReady]);
    const filteredProjectRows = useMemo(() => {
        if (!projectKey)
            return rows;
        return rows.filter((r) => safeTrim(r.projectId) === projectId || safeTrim(r.projectCode) === projectCode);
    }, [rows, projectId, projectCode, projectKey]);
    const [zeitraum, setZeitraum] = useState("THIS_MONTH");
    const [kunde, setKunde] = useState("ALL");
    const [status, setStatus] = useState("ALL");
    const kundenListe = useMemo(() => ["ALL", ...Array.from(new Set(filteredProjectRows.map((r) => safeTrim(r.kunde)).filter(Boolean)))], [filteredProjectRows]);
    const filtered = useMemo(() => {
        let arr = filteredProjectRows.slice();
        arr = arr.filter((r) => {
            const d = parseDate(r.datum);
            switch (zeitraum) {
                case "30":
                    return withinDays(d, 30);
                case "60":
                    return withinDays(d, 60);
                case "90":
                    return withinDays(d, 90);
                case "YTD":
                    return d.getFullYear() === new Date().getFullYear();
                case "THIS_MONTH":
                    return isSameMonth(d, new Date());
                default:
                    return true;
            }
        });
        if (kunde !== "ALL")
            arr = arr.filter((r) => safeTrim(r.kunde) === kunde);
        if (status !== "ALL")
            arr = arr.filter((r) => statusOf(r) === status);
        return arr;
    }, [filteredProjectRows, zeitraum, kunde, status]);
    const totals = useMemo(() => {
        const netto = filtered.reduce((s, r) => s + safeNumber(r.netto), 0);
        const brut = filtered.reduce((s, r) => s + brutto(r), 0);
        const gez = filtered.reduce((s, r) => s + safeNumber(r.gezahlt), 0);
        const off = filtered.reduce((s, r) => s + offen(r), 0);
        const mwstSum = filtered.reduce((s, r) => s + (brutto(r) - safeNumber(r.netto)), 0);
        return { netto, mwstSum, brut, gez, off };
    }, [filtered]);
    const createFromAufmass = (typ) => {
        if (!projectId) {
            alert("Kein Projekt gewählt.");
            return;
        }
        if (!currentPositions.length) {
            alert("Kein abrechenbares Aufmaß gefunden.");
            return;
        }
        setRows((prev) => {
            const nextId = prev.length ? Math.max(...prev.map((r) => safeNumber(r.id))) + 1 : 1;
            const nr = nextRechnungNr(prev);
            const datum = new Date().toLocaleDateString("de-DE");
            const newRow = {
                id: nextId,
                nr,
                datum,
                faellig: "",
                kunde: customerName,
                netto: Number(currentNetto.toFixed(2)),
                mwstPct: mwstDefault,
                gezahlt: 0,
                hinweis: typ === "ABSCHLAG" ?
                    `Abschlagsrechnung aus Aufmaß (${projectCode || projectName})` :
                    typ === "SCHLUSS" ?
                        `Schlussrechnung aus Aufmaß (${projectCode || projectName})` :
                        `Rechnung aus Aufmaß (${projectCode || projectName})`,
                typ,
                projectId,
                projectCode,
                positions: currentPositions
            };
            return [...prev, newRow];
        });
    };
    const duplicate = (r) => {
        setRows((prev) => {
            const nextId = prev.length ? Math.max(...prev.map((x) => safeNumber(x.id))) + 1 : 1;
            return [
                ...prev,
                {
                    ...r,
                    id: nextId,
                    nr: nextRechnungNr(prev),
                    datum: new Date().toLocaleDateString("de-DE")
                }
            ];
        });
    };
    const remove = (id) => {
        setRows((prev) => prev.filter((r) => r.id !== id));
    };
    const update = (i, key, val) => {
        setRows((prev) => {
            const copy = [...prev];
            if (!copy[i])
                return prev;
            if (key === "netto" || key === "mwstPct" || key === "gezahlt") {
                copy[i][key] = safeNumber(val, 0);
            }
            else {
                copy[i][key] = val;
            }
            return copy;
        });
    };
    const exportCSV = (useFiltered) => {
        const src = useFiltered ? filtered : filteredProjectRows;
        if (!src.length) {
            alert("Keine Daten für CSV-Export vorhanden.");
            return;
        }
        const data = src.map((r) => ({
            Nr: r.nr,
            Typ: r.typ,
            Datum: r.datum,
            Faellig: r.faellig || "",
            Kunde: r.kunde,
            Projekt: r.projectCode || "",
            Netto: fmt(r.netto),
            MwStPct: fmt(r.mwstPct),
            Brutto: fmt(brutto(r)),
            Gezahlt: fmt(r.gezahlt || 0),
            Offen: fmt(offen(r)),
            Status: labelOf(statusOf(r)),
            Hinweis: r.hinweis || ""
        }));
        const headers = Object.keys(data[0]);
        const csv = [
            headers.join(";"),
            ...data.map((row) => headers.
                map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).
                join(";"))
        ].
            join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        const href = URL.createObjectURL(blob);
        a.href = href;
        a.download = useFiltered ? "rechnungen_gefiltert.csv" : "rechnungen_alle.csv";
        a.click();
        URL.revokeObjectURL(href);
    };
    const printSinglePDF = (r) => openPrint(printableInvoiceHTML(r));
    const printAllPDF = (useFiltered) => openPrint(printableReportHTML(useFiltered ? filtered : filteredProjectRows));
    return (_jsxs("div", { className: "bh-page", children: [_jsxs("div", { className: "bh-header-row", children: [_jsxs("div", { children: [_jsx("h2", { children: "Rechnungen / Abschl\u00E4ge" }), _jsx("div", { className: "bh-note rlc-migrated-pages-buchhaltung-rechnungen-tsx-262", children: projectCode ?
                                    _jsxs(_Fragment, { children: ["Projekt: ", _jsx("b", { children: projectCode }), " ", projectName ? `— ${projectName}` : ""] }) :
                                    "Kein Projekt ausgewählt" })] }), _jsxs("div", { className: "bh-actions", children: [_jsx("button", { className: "bh-btn", onClick: () => createFromAufmass("RECHNUNG"), children: "+ Neue Rechnung aus Aufma\u00DF" }), _jsx("button", { className: "bh-btn", onClick: () => createFromAufmass("ABSCHLAG"), children: "+ Abschlagsrechnung" }), _jsx("button", { className: "bh-btn", onClick: () => createFromAufmass("SCHLUSS"), children: "+ Schlussrechnung" }), _jsx("button", { className: "bh-btn ghost", onClick: () => exportCSV(true), children: "Export CSV (gefiltert)" }), _jsx("button", { className: "bh-btn ghost", onClick: () => exportCSV(false), children: "Export CSV (alle)" }), _jsx("button", { className: "bh-btn ghost", onClick: () => printAllPDF(true), children: "PDF Report (gefiltert)" }), _jsx("button", { className: "bh-btn ghost", onClick: () => printAllPDF(false), children: "PDF Report (alle)" }), _jsx("button", { className: "bh-btn ghost", onClick: () => downloadAllPDF(filtered), children: "Download PDF (gefiltert)" }), _jsx("button", { className: "bh-btn ghost", onClick: () => downloadAllPDF(filteredProjectRows), children: "Download PDF (alle)" })] })] }), _jsxs("div", { className: "bh-filters", children: [_jsxs("div", { children: [_jsx("label", { children: "Zeitraum" }), _jsxs("select", { value: zeitraum, onChange: (e) => setZeitraum(e.target.value), children: [_jsx("option", { value: "THIS_MONTH", children: "Dieser Monat" }), _jsx("option", { value: "30", children: "Letzte 30 Tage" }), _jsx("option", { value: "60", children: "Letzte 60 Tage" }), _jsx("option", { value: "90", children: "Letzte 90 Tage" }), _jsx("option", { value: "YTD", children: "YTD" }), _jsx("option", { value: "ALL", children: "Alle" })] })] }), _jsxs("div", { children: [_jsx("label", { children: "Kunde" }), _jsx("select", { value: kunde, onChange: (e) => setKunde(e.target.value), children: kundenListe.map((k) => _jsx("option", { value: k, children: k === "ALL" ? "Alle" : k }, k)) })] }), _jsxs("div", { children: [_jsx("label", { children: "Status" }), _jsxs("select", { value: status, onChange: (e) => setStatus(e.target.value), children: [_jsx("option", { value: "ALL", children: "Alle" }), _jsx("option", { value: "OPEN", children: "Offen" }), _jsx("option", { value: "PART", children: "Teilbezahlt" }), _jsx("option", { value: "PAID", children: "Bezahlt" })] })] }), _jsxs("div", { children: [_jsx("label", { children: "Standard MwSt %" }), _jsx("input", { type: "number", step: "0.1", value: mwstDefault, onChange: (e) => setMwstDefault(safeNumber(e.target.value, 19)), className: "rlc-migrated-pages-buchhaltung-rechnungen-tsx-263" })] })] }), _jsxs("div", { className: "bh-note rlc-migrated-pages-buchhaltung-rechnungen-tsx-264", children: ["Aktuelles Aufma\u00DF: ", _jsx("b", { children: currentPositions.length }), " abrechenbare Position(en) \u00B7 Netto aktuell:", " ", _jsxs("b", { children: [fmt(currentNetto), " \u20AC"] })] }), _jsxs("div", { className: "rlc-migrated-pages-buchhaltung-rechnungen-tsx-265", children: [_jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "bh-note", children: "Netto" }), _jsxs("div", { className: "rlc-migrated-pages-buchhaltung-rechnungen-tsx-266", children: [fmt(totals.netto), " \u20AC"] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "bh-note", children: "MwSt" }), _jsxs("div", { className: "rlc-migrated-pages-buchhaltung-rechnungen-tsx-267", children: [fmt(totals.mwstSum), " \u20AC"] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "bh-note", children: "Brutto" }), _jsxs("div", { className: "rlc-migrated-pages-buchhaltung-rechnungen-tsx-268", children: [fmt(totals.brut), " \u20AC"] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "bh-note", children: "Gezahlt" }), _jsxs("div", { className: "rlc-migrated-pages-buchhaltung-rechnungen-tsx-269", children: [fmt(totals.gez), " \u20AC"] })] }), _jsxs("div", { className: "bh-card", children: [_jsx("div", { className: "bh-note", children: "Offen" }), _jsxs("div", { className: "rlc-migrated-pages-buchhaltung-rechnungen-tsx-270", children: [fmt(totals.off), " \u20AC"] })] })] }), _jsxs("table", { className: "bh-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Aktionen" }), _jsx("th", { children: "Nr." }), _jsx("th", { children: "Typ" }), _jsx("th", { children: "Datum" }), _jsx("th", { children: "F\u00E4llig" }), _jsx("th", { children: "Kunde" }), _jsx("th", { children: "Netto (\u20AC)" }), _jsx("th", { children: "MWSt (%)" }), _jsx("th", { children: "Brutto (\u20AC)" }), _jsx("th", { children: "Gezahlt (\u20AC)" }), _jsx("th", { children: "Offen (\u20AC)" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "PDF" })] }) }), _jsxs("tbody", { children: [filtered.map((r) => {
                                const idx = rows.findIndex((x) => x.id === r.id);
                                return (_jsxs("tr", { children: [_jsx("td", { children: _jsxs("div", { className: "rlc-migrated-pages-buchhaltung-rechnungen-tsx-271", children: [_jsx("button", { className: "bh-btn ghost", onClick: () => duplicate(r), children: "Duplizieren" }), _jsx("button", { className: "bh-btn rlc-migrated-pages-buchhaltung-rechnungen-tsx-272", onClick: () => remove(r.id), children: "L\u00F6schen" })] }) }), _jsx("td", { children: r.nr }), _jsx("td", { children: _jsxs("select", { value: r.typ, onChange: (e) => update(idx, "typ", e.target.value), children: [_jsx("option", { value: "RECHNUNG", children: "Rechnung" }), _jsx("option", { value: "ABSCHLAG", children: "Abschlag" }), _jsx("option", { value: "SCHLUSS", children: "Schluss" })] }) }), _jsx("td", { children: _jsx("input", { type: "text", value: r.datum, onChange: (e) => update(idx, "datum", e.target.value), className: "rlc-migrated-pages-buchhaltung-rechnungen-tsx-273" }) }), _jsx("td", { children: _jsx("input", { type: "text", value: r.faellig || "", onChange: (e) => update(idx, "faellig", e.target.value), className: "rlc-migrated-pages-buchhaltung-rechnungen-tsx-274" }) }), _jsx("td", { children: _jsx("input", { type: "text", value: r.kunde, onChange: (e) => update(idx, "kunde", e.target.value), className: "rlc-migrated-pages-buchhaltung-rechnungen-tsx-275" }) }), _jsx("td", { children: _jsx("input", { type: "number", step: "0.01", value: r.netto, onChange: (e) => update(idx, "netto", safeNumber(e.target.value, 0)), className: "rlc-migrated-pages-buchhaltung-rechnungen-tsx-276" }) }), _jsx("td", { children: _jsx("input", { type: "number", step: "0.1", value: r.mwstPct, onChange: (e) => update(idx, "mwstPct", safeNumber(e.target.value, 19)), className: "rlc-migrated-pages-buchhaltung-rechnungen-tsx-277" }) }), _jsx("td", { children: fmt(brutto(r)) }), _jsx("td", { children: _jsx("input", { type: "number", step: "0.01", value: r.gezahlt, onChange: (e) => update(idx, "gezahlt", safeNumber(e.target.value, 0)), className: "rlc-migrated-pages-buchhaltung-rechnungen-tsx-278" }) }), _jsx("td", { className: "rlc-migrated-pages-buchhaltung-rechnungen-tsx-279", children: fmt(offen(r)) }), _jsx("td", { children: _jsx(StatusChip, { value: statusOf(r) }) }), _jsx("td", { children: _jsxs("div", { className: "rlc-migrated-pages-buchhaltung-rechnungen-tsx-280", children: [_jsx("button", { className: "bh-btn ghost", onClick: () => printSinglePDF(r), children: "PDF" }), _jsx("button", { className: "bh-btn ghost", onClick: () => downloadSinglePDF(r), children: "Download" })] }) })] }, r.id));
                            }), !filtered.length &&
                                _jsx("tr", { children: _jsx("td", { colSpan: 13, className: "rlc-migrated-pages-buchhaltung-rechnungen-tsx-281", children: "Keine Rechnungen f\u00FCr die aktuelle Auswahl gefunden." }) })] })] }), _jsxs("div", { className: "bh-note rlc-migrated-pages-buchhaltung-rechnungen-tsx-282", children: ["Flow aktiv: ", _jsx("b", { children: "Angebot \u2192 Aufma\u00DF/Mengenermittlung \u2192 Rechnung" })] })] }));
}
