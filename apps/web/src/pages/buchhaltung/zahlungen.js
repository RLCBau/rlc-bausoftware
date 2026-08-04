import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { savePdfWithCompanyHeader as saveRlcPdfWithCompanyHeader } from "../../lib/pdf/companyPdfHeader";
import { useMemo, useState } from "react";
import "./styles.css";
/* =========================
   HELPERS
   ========================= */
const fmt = (n) => safeNumber(n).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});
const brutto = (r) => safeNumber(r.netto) * (1 + safeNumber(r.mwstPct) / 100);
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
function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[m]);
}
const parseDate = (s) => {
    const value = safeTrim(s);
    if (!value)
        return new Date("1970-01-01");
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
        const [d, m, y] = value.split(".").map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
    }
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? new Date("1970-01-01") : dt;
};
const withinDays = (d, days) => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - days);
    return d >= from;
};
const isSameMonth = (d, ref) => d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
function csvEscape(v) {
    return `"${String(v ?? "").replace(/"/g, '""')}"`;
}
/* =========================
   COMPONENT
   ========================= */
export default function Zahlungseingaenge() {
    const [rechnungen] = useState([
        {
            id: 1,
            nr: "R-2025-001",
            kunde: "Muster GmbH",
            datum: "30.10.2025",
            netto: 4500,
            mwstPct: 19,
            gezahlt: 1200
        },
        {
            id: 2,
            nr: "R-2025-002",
            kunde: "Bau AG",
            datum: "29.10.2025",
            netto: 2890,
            mwstPct: 19,
            gezahlt: 2890
        },
        {
            id: 3,
            nr: "R-2025-003",
            kunde: "Stadtwerke",
            datum: "15.09.2025",
            netto: 9800,
            mwstPct: 7,
            gezahlt: 0
        }
    ]);
    const [zahlungen, setZahlungen] = useState([
        {
            id: 1,
            datum: "02.11.2025",
            kunde: "Muster GmbH",
            betrag: 1000,
            methode: "Überweisung",
            verwendungszweck: "R-2025-001"
        },
        {
            id: 2,
            datum: "01.11.2025",
            kunde: "Stadtwerke",
            betrag: 3500,
            methode: "Überweisung",
            verwendungszweck: "Teilzahlung Baugrube"
        }
    ]);
    const [zeitraum, setZeitraum] = useState("THIS_MONTH");
    const [kunde, setKunde] = useState("ALL");
    const [methode, setMethode] = useState("ALL");
    const [match, setMatch] = useState("ALL");
    const kundenListe = useMemo(() => [
        "ALL",
        ...Array.from(new Set([...rechnungen.map((r) => r.kunde), ...zahlungen.map((z) => z.kunde)]))
    ], [rechnungen, zahlungen]);
    const assignedByRechnung = useMemo(() => {
        const map = new Map();
        for (const z of zahlungen) {
            if (z.rechnungId && safeNumber(z.betrag) > 0) {
                map.set(z.rechnungId, (map.get(z.rechnungId) || 0) + safeNumber(z.betrag));
            }
        }
        return map;
    }, [zahlungen]);
    const rechnungenMitRest = useMemo(() => {
        return rechnungen.map((r) => {
            const extra = assignedByRechnung.get(r.id) || 0;
            const b = brutto(r);
            const bezahltGes = safeNumber(r.gezahlt) + extra;
            const offen = Math.max(0, b - bezahltGes);
            return { ...r, brutto: b, bezahltGes, offen };
        });
    }, [rechnungen, assignedByRechnung]);
    const filtered = useMemo(() => {
        let list = zahlungen.slice();
        list = list.filter((z) => {
            const d = parseDate(z.datum);
            switch (zeitraum) {
                case "30":
                    return withinDays(d, 30);
                case "60":
                    return withinDays(d, 60);
                case "90":
                    return withinDays(d, 90);
                case "THIS_MONTH":
                    return isSameMonth(d, new Date());
                default:
                    return true;
            }
        });
        if (kunde !== "ALL")
            list = list.filter((z) => z.kunde === kunde);
        if (methode !== "ALL")
            list = list.filter((z) => z.methode === methode);
        if (match !== "ALL") {
            list = list.filter((z) => (z.rechnungId ? "matched" : "unmatched") === match);
        }
        list.sort((a, b) => parseDate(b.datum).getTime() - parseDate(a.datum).getTime() || b.id - a.id);
        return list;
    }, [zahlungen, zeitraum, kunde, methode, match]);
    /* CRUD */
    const addZahlung = () => {
        const id = zahlungen.length ? Math.max(...zahlungen.map((z) => z.id)) + 1 : 1;
        setZahlungen((prev) => [
            ...prev,
            {
                id,
                datum: new Date().toLocaleDateString("de-DE"),
                kunde: "Neuer Kunde",
                betrag: 0,
                methode: "Überweisung"
            }
        ]);
    };
    const removeZahlung = (id) => setZahlungen((prev) => prev.filter((z) => z.id !== id));
    const updateZahlung = (index, key, value) => {
        setZahlungen((prev) => {
            const c = [...prev];
            if (!c[index])
                return prev;
            c[index] = {
                ...c[index],
                [key]: key === "betrag" ? safeNumber(value, 0) : value
            };
            return c;
        });
    };
    /* Auto-Match */
    const autoMatch = () => {
        const tol = 0.5;
        setZahlungen((prev) => prev.map((z) => {
            if (z.rechnungId || safeNumber(z.betrag) <= 0)
                return z;
            const vz = safeTrim(z.verwendungszweck);
            const byNr = rechnungenMitRest.find((r) => vz.includes(r.nr));
            if (byNr)
                return { ...z, rechnungId: byNr.id };
            const cand = rechnungenMitRest.
                filter((r) => r.kunde === z.kunde && r.offen > 0).
                find((r) => Math.abs(r.offen - safeNumber(z.betrag)) <= tol);
            if (cand)
                return { ...z, rechnungId: cand.id };
            return z;
        }));
    };
    /* EXPORT CSV */
    const exportCSV = (useFiltered) => {
        const data = (useFiltered ? filtered : zahlungen).map((z) => ({
            Datum: z.datum,
            Kunde: z.kunde,
            Betrag: fmt(z.betrag),
            Methode: z.methode,
            Verwendungszweck: z.verwendungszweck || "",
            Rechnung: z.rechnungId ? rechnungen.find((r) => r.id === z.rechnungId)?.nr || "" : "",
            Status: z.rechnungId ? "zugeordnet" : "offen"
        }));
        if (!data.length) {
            alert("Keine Daten für den Export vorhanden.");
            return;
        }
        const headers = Object.keys(data[0]);
        const csv = [
            headers.map(csvEscape).join(";"),
            ...data.map((row) => headers.map((h) => csvEscape(row[h])).join(";"))
        ].
            join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        const href = URL.createObjectURL(blob);
        a.href = href;
        a.download = useFiltered ?
            "zahlungseingaenge_gefiltert.csv" :
            "zahlungseingaenge_alle.csv";
        a.click();
        URL.revokeObjectURL(href);
    };
    /* DOWNLOAD PDF */
    const downloadPDF = async (useFiltered) => {
        const list = useFiltered ? filtered : zahlungen;
        if (!list.length) {
            alert("Keine Daten für den PDF-Download vorhanden.");
            return;
        }
        const html2canvas = (await import("html2canvas")).default;
        const { jsPDF } = await import("jspdf");
        const node = buildReportNode(list);
        const canvas = await html2canvas(node, { scale: 2 });
        node.remove();
        const pdf = new jsPDF({ unit: "pt", format: "a4" });
        const img = canvas.toDataURL("image/png");
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
        const w = canvas.width * ratio;
        const h = canvas.height * ratio;
        const x = (pageW - w) / 2;
        const y = (pageH - h) / 2;
        pdf.addImage(img, "PNG", x, y, w, h);
        saveRlcPdfWithCompanyHeader(pdf, useFiltered ? "Zahlungseingaenge_gefiltert.pdf" : "Zahlungseingaenge_alle.pdf");
    };
    function buildReportNode(list) {
        const wrap = document.createElement("div");
        wrap.style.position = "fixed";
        wrap.style.left = "-10000px";
        wrap.style.top = "0";
        wrap.style.width = "1024px";
        wrap.style.background = "#fff";
        wrap.style.padding = "24px";
        wrap.innerHTML = `
      <style>
        *{box-sizing:border-box;font-family:Arial}
        h1{margin:0 0 12px}
        table{width:100%;border-collapse:collapse}
        th,td{border-bottom:1px solid #eee;padding:8px;text-align:left}
        .right{text-align:right}
        .chip{padding:2px 8px;border-radius:999px;font-size:12px;display:inline-block}
        .ok{background:#eafaf1;color:#0a6c3e}
        .warn{background:#fff7e6;color:#9a6700}
      </style>
      <h1>Zahlungseingänge – Report</h1>
      <table>
        <thead>
          <tr>
            <th>Datum</th><th>Kunde</th><th class="right">Betrag (€)</th>
            <th>Methode</th><th>Verwendungszweck</th><th>Rechnung</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${list.
            map((z) => {
            const nr = z.rechnungId ?
                rechnungen.find((r) => r.id === z.rechnungId)?.nr || "" :
                "";
            const matched = !!z.rechnungId;
            return `
                <tr>
                  <td>${escapeHtml(z.datum)}</td>
                  <td>${escapeHtml(z.kunde)}</td>
                  <td class="right">${fmt(z.betrag)}</td>
                  <td>${escapeHtml(z.methode)}</td>
                  <td>${escapeHtml(z.verwendungszweck || "")}</td>
                  <td>${escapeHtml(nr)}</td>
                  <td>${matched ? '<span class="chip ok">zugeordnet</span>' : '<span class="chip warn">offen</span>'}</td>
                </tr>`;
        }).
            join("")}
        </tbody>
      </table>
      <div style="margin-top:10px">
        <b>Summe:</b> ${fmt(list.reduce((s, z) => s + safeNumber(z.betrag), 0))} €
      </div>
    `;
        document.body.appendChild(wrap);
        return wrap;
    }
    const sumFiltered = useMemo(() => filtered.reduce((s, z) => s + safeNumber(z.betrag), 0), [filtered]);
    const sumAll = useMemo(() => zahlungen.reduce((s, z) => s + safeNumber(z.betrag), 0), [zahlungen]);
    const sumUnmatched = useMemo(() => zahlungen.filter((z) => !z.rechnungId).reduce((s, z) => s + safeNumber(z.betrag), 0), [zahlungen]);
    /* RENDER */
    return (_jsxs("div", { className: "bh-page", children: [_jsxs("div", { className: "bh-header-row", children: [_jsx("h2", { children: "Zahlungseing\u00E4nge / Zuordnung" }), _jsxs("div", { className: "bh-actions", children: [_jsx("button", { className: "bh-btn", onClick: addZahlung, children: "+ Neuer Zahlungseingang" }), _jsx("button", { className: "bh-btn ghost", onClick: autoMatch, children: "Auto-Match" }), _jsx("button", { className: "bh-btn ghost", onClick: () => exportCSV(true), children: "Export CSV (gefiltert)" }), _jsx("button", { className: "bh-btn ghost", onClick: () => exportCSV(false), children: "Export CSV (alle)" }), _jsx("button", { className: "bh-btn ghost", onClick: () => downloadPDF(true), children: "Download PDF (gefiltert)" }), _jsx("button", { className: "bh-btn ghost", onClick: () => downloadPDF(false), children: "Download PDF (alle)" })] })] }), _jsxs("div", { className: "bh-filters", children: [_jsxs("div", { children: [_jsx("label", { children: "Zeitraum" }), _jsxs("select", { value: zeitraum, onChange: (e) => setZeitraum(e.target.value), children: [_jsx("option", { value: "THIS_MONTH", children: "Dieser Monat" }), _jsx("option", { value: "30", children: "Letzte 30 Tage" }), _jsx("option", { value: "60", children: "Letzte 60 Tage" }), _jsx("option", { value: "90", children: "Letzte 90 Tage" }), _jsx("option", { value: "ALL", children: "Alle" })] })] }), _jsxs("div", { children: [_jsx("label", { children: "Kunde" }), _jsx("select", { value: kunde, onChange: (e) => setKunde(e.target.value), children: kundenListe.map((k) => _jsx("option", { value: k, children: k === "ALL" ? "Alle" : k }, k)) })] }), _jsxs("div", { children: [_jsx("label", { children: "Methode" }), _jsxs("select", { value: methode, onChange: (e) => setMethode(e.target.value), children: [_jsx("option", { value: "ALL", children: "Alle" }), _jsx("option", { value: "\u00DCberweisung", children: "\u00DCberweisung" }), _jsx("option", { value: "Bar", children: "Bar" }), _jsx("option", { value: "Karte", children: "Karte" }), _jsx("option", { value: "Scheck", children: "Scheck" }), _jsx("option", { value: "Sonstiges", children: "Sonstiges" })] })] }), _jsxs("div", { children: [_jsx("label", { children: "Status" }), _jsxs("select", { value: match, onChange: (e) => setMatch(e.target.value), children: [_jsx("option", { value: "ALL", children: "Alle" }), _jsx("option", { value: "matched", children: "zugeordnet" }), _jsx("option", { value: "unmatched", children: "offen" })] })] })] }), _jsxs("table", { className: "bh-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Aktionen" }), _jsx("th", { children: "Datum" }), _jsx("th", { children: "Kunde" }), _jsx("th", { className: "right", children: "Betrag (\u20AC)" }), _jsx("th", { children: "Methode" }), _jsx("th", { children: "Verwendungszweck" }), _jsx("th", { children: "Rechnung" }), _jsx("th", { children: "Status" }), _jsx("th", { className: "right", children: "Rest offen (Rechnung)" })] }) }), _jsxs("tbody", { children: [filtered.map((z) => {
                                const i = zahlungen.findIndex((x) => x.id === z.id);
                                const r = z.rechnungId ?
                                    rechnungenMitRest.find((x) => x.id === z.rechnungId) :
                                    undefined;
                                const nr = z.rechnungId ?
                                    rechnungen.find((r) => r.id === z.rechnungId)?.nr || "" :
                                    "";
                                const matched = !!z.rechnungId;
                                return (_jsxs("tr", { children: [_jsx("td", { children: _jsx("button", { className: "bh-btn rlc-migrated-pages-buchhaltung-zahlungen-tsx-308", onClick: () => removeZahlung(z.id), children: "L\u00F6schen" }) }), _jsx("td", { children: _jsx("input", { type: "text", value: z.datum, onChange: (e) => updateZahlung(i, "datum", e.target.value), className: "rlc-migrated-pages-buchhaltung-zahlungen-tsx-309" }) }), _jsx("td", { children: _jsx("input", { type: "text", value: z.kunde, onChange: (e) => updateZahlung(i, "kunde", e.target.value), className: "rlc-migrated-pages-buchhaltung-zahlungen-tsx-310" }) }), _jsx("td", { className: "right", children: _jsx("input", { type: "number", step: "0.01", value: z.betrag, onChange: (e) => updateZahlung(i, "betrag", safeNumber(e.target.value, 0)), className: "rlc-migrated-pages-buchhaltung-zahlungen-tsx-311" }) }), _jsx("td", { children: _jsxs("select", { value: z.methode, onChange: (e) => updateZahlung(i, "methode", e.target.value), children: [_jsx("option", { value: "\u00DCberweisung", children: "\u00DCberweisung" }), _jsx("option", { value: "Bar", children: "Bar" }), _jsx("option", { value: "Karte", children: "Karte" }), _jsx("option", { value: "Scheck", children: "Scheck" }), _jsx("option", { value: "Sonstiges", children: "Sonstiges" })] }) }), _jsx("td", { children: _jsx("input", { type: "text", value: z.verwendungszweck || "", onChange: (e) => updateZahlung(i, "verwendungszweck", e.target.value), className: "rlc-migrated-pages-buchhaltung-zahlungen-tsx-312" }) }), _jsx("td", { children: _jsxs("select", { value: z.rechnungId || "", onChange: (e) => updateZahlung(i, "rechnungId", e.target.value ? Number(e.target.value) : undefined), children: [_jsx("option", { value: "", children: "\u2013 ausw\u00E4hlen \u2013" }), rechnungenMitRest.map((r) => _jsxs("option", { value: r.id, children: [r.nr, " \u00B7 ", r.kunde, " \u00B7 offen ", fmt(r.offen), " \u20AC"] }, r.id))] }) }), _jsx("td", { children: matched ?
                                                _jsx("span", { className: "chip ok", children: "zugeordnet" }) :
                                                _jsx("span", { className: "chip warn", children: "offen" }) }), _jsx("td", { className: "right", children: r ? fmt(Math.max(0, r.offen - safeNumber(z.betrag))) : "—" })] }, z.id));
                            }), filtered.length === 0 &&
                                _jsx("tr", { children: _jsx("td", { colSpan: 9, className: "rlc-migrated-pages-buchhaltung-zahlungen-tsx-313", children: "Keine Zahlungseing\u00E4nge im aktuellen Filter." }) }), _jsxs("tr", { className: "rlc-migrated-pages-buchhaltung-zahlungen-tsx-314", children: [_jsx("td", { colSpan: 3, className: "rlc-migrated-pages-buchhaltung-zahlungen-tsx-315", children: "Summe (gefiltert):" }), _jsx("td", { className: "right", children: fmt(sumFiltered) }), _jsx("td", { colSpan: 5 })] })] })] }), _jsxs("div", { className: "bh-note rlc-migrated-pages-buchhaltung-zahlungen-tsx-316", children: ["Gesamt Zahlungen: ", _jsxs("b", { children: [fmt(sumAll), " \u20AC"] }), " \u00B7 Nicht zugeordnet: ", _jsxs("b", { children: [fmt(sumUnmatched), " \u20AC"] })] })] }));
}
