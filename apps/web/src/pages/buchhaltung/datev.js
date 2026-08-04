import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import "./styles.css";
/* =========================
   HELPERS
   ========================= */
const fmt = (n) => safeNumber(n).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});
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
const parseDE = (s) => {
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
export default function DATEV() {
    const [rows, setRows] = useState([
        {
            id: 1,
            quelle: "Rechnungen",
            belegNr: "R-2025-102",
            buchungsdatum: "30.10.2025",
            belegdatum: "30.10.2025",
            text: "Erlöse Rohrbau",
            debitor: "10001",
            konto: "8400",
            gegenkonto: "1200",
            betrag: 5355.0,
            ustSchluessel: "3",
            kost1: "KS-02"
        },
        {
            id: 2,
            quelle: "Eingangsrechnungen",
            belegNr: "E-2025-077",
            buchungsdatum: "28.10.2025",
            belegdatum: "27.10.2025",
            text: "Material Rohr DN200",
            kreditor: "70021",
            konto: "3400",
            gegenkonto: "1200",
            betrag: -1240.5,
            ustSchluessel: "8",
            kost1: "KS-01"
        },
        {
            id: 3,
            quelle: "Kassenbuch",
            belegNr: "K-0009",
            buchungsdatum: "25.10.2025",
            belegdatum: "25.10.2025",
            text: "Büromaterial bar",
            konto: "4920",
            gegenkonto: "1000",
            betrag: -36.5,
            ustSchluessel: "8"
        }
    ]);
    const [kontenplan, setKontenplan] = useState("SKR03");
    const [quelle, setQuelle] = useState("ALL");
    const [zeitraum, setZeitraum] = useState("THIS_MONTH");
    const [query, setQuery] = useState("");
    const [belegkreis, setBelegkreis] = useState("RLC");
    const [standardBank, setStandardBank] = useState("1200");
    const [standardKasse, setStandardKasse] = useState("1000");
    const [debitoren] = useState([
        {
            nr: "10001",
            name: "Muster GmbH",
            plz: "80331",
            ort: "München",
            strasse: "Hauptstr. 1",
            land: "DE",
            email: "info@muster.de",
            konto: kontenplan === "SKR03" ? "10000" : "120000"
        }
    ]);
    const [kreditoren] = useState([
        {
            nr: "70021",
            name: "Bauhandel AG",
            plz: "90402",
            ort: "Nürnberg",
            strasse: "Industriepark 5",
            land: "DE",
            email: "office@bauhandel.de",
            konto: kontenplan === "SKR03" ? "70000" : "160000"
        }
    ]);
    const filtered = useMemo(() => {
        let arr = rows.slice();
        if (quelle !== "ALL") {
            arr = arr.filter((r) => r.quelle === quelle);
        }
        arr = arr.filter((r) => {
            const d = parseDE(r.buchungsdatum);
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
        if (query.trim()) {
            const q = query.toLowerCase().trim();
            arr = arr.filter((r) => [
                r.text,
                r.belegNr,
                r.konto,
                r.gegenkonto,
                r.debitor,
                r.kreditor,
                r.kost1,
                r.kost2
            ].
                map((x) => safeTrim(x).toLowerCase()).
                join(" ").
                includes(q));
        }
        arr = arr.map((r) => {
            let gk = safeTrim(r.gegenkonto);
            if (r.quelle === "Rechnungen" && !safeTrim(r.debitor)) {
                gk = gk || (kontenplan === "SKR03" ? "10000" : "120000");
            }
            if (r.quelle === "Eingangsrechnungen" && !safeTrim(r.kreditor)) {
                gk = gk || (kontenplan === "SKR03" ? "70000" : "160000");
            }
            if (r.quelle === "Kassenbuch" && !gk) {
                gk = standardKasse;
            }
            return {
                ...r,
                belegNr: safeTrim(r.belegNr),
                buchungsdatum: safeTrim(r.buchungsdatum),
                belegdatum: safeTrim(r.belegdatum),
                text: safeTrim(r.text),
                debitor: safeTrim(r.debitor),
                kreditor: safeTrim(r.kreditor),
                konto: safeTrim(r.konto),
                gegenkonto: gk,
                ustSchluessel: safeTrim(r.ustSchluessel),
                kost1: safeTrim(r.kost1),
                kost2: safeTrim(r.kost2),
                betrag: safeNumber(r.betrag, 0)
            };
        });
        arr.sort((a, b) => parseDE(b.buchungsdatum).getTime() - parseDE(a.buchungsdatum).getTime() ||
            b.id - a.id);
        return arr;
    }, [rows, quelle, zeitraum, query, kontenplan, standardKasse]);
    const totals = useMemo(() => {
        const sum = filtered.reduce((s, r) => s + safeNumber(r.betrag), 0);
        const soll = filtered.
            filter((r) => safeNumber(r.betrag) < 0).
            reduce((s, r) => s + Math.abs(safeNumber(r.betrag)), 0);
        const haben = filtered.
            filter((r) => safeNumber(r.betrag) > 0).
            reduce((s, r) => s + safeNumber(r.betrag), 0);
        return { sum, soll, haben };
    }, [filtered]);
    const update = (id, key, val) => setRows((prev) => prev.map((r) => r.id === id ?
        {
            ...r,
            [key]: key === "betrag" ?
                safeNumber(val, 0) :
                val
        } :
        r));
    const exportBuchungsstapelCSV = (useFiltered) => {
        const list = useFiltered ? filtered : rows;
        if (!list.length) {
            alert("Keine Daten für den Export vorhanden.");
            return;
        }
        const header = [
            "Umsatz (ohne Soll/Haben-Kz)",
            "Soll/Haben-Kennzeichen",
            "Konto",
            "Gegenkonto",
            "BU-Schlüssel",
            "Buchungsdatum",
            "Belegfeld1",
            "Belegdatum",
            "Buchungstext",
            "KOST1",
            "KOST2",
            "Belegkreis"
        ];
        const toRow = (r) => {
            const shk = safeNumber(r.betrag) < 0 ? "S" : "H";
            const betragAbs = Math.abs(safeNumber(r.betrag));
            const konto = safeTrim(r.konto);
            const geg = safeTrim(r.gegenkonto) || (r.quelle === "Rechnungen" ?
                safeTrim(r.debitor) || (kontenplan === "SKR03" ? "10000" : "120000") :
                r.quelle === "Eingangsrechnungen" ?
                    safeTrim(r.kreditor) || (kontenplan === "SKR03" ? "70000" : "160000") :
                    r.quelle === "Kassenbuch" ?
                        standardKasse :
                        standardBank);
            const bu = safeTrim(r.ustSchluessel);
            return [
                betragAbs.toFixed(2).replace(".", ","),
                shk,
                konto,
                geg,
                bu,
                safeTrim(r.buchungsdatum),
                safeTrim(r.belegNr),
                safeTrim(r.belegdatum),
                safeTrim(r.text),
                safeTrim(r.kost1),
                safeTrim(r.kost2),
                safeTrim(belegkreis)
            ];
        };
        const csv = [header.map(csvEscape).join(";"), ...list.map((r) => toRow(r).map(csvEscape).join(";"))].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        const href = URL.createObjectURL(blob);
        a.href = href;
        a.download = "DATEV_Buchungsstapel.csv";
        a.click();
        URL.revokeObjectURL(href);
    };
    const exportStammdatenCSV = (typ) => {
        const src = typ === "Debitor" ? debitoren : kreditoren;
        if (!src.length) {
            alert("Keine Stammdaten für den Export vorhanden.");
            return;
        }
        const header = [
            "Nr",
            "Name",
            "Straße",
            "PLZ",
            "Ort",
            "Land",
            "E-Mail",
            "USt-ID",
            "Sammelkonto"
        ];
        const csv = [
            header.map(csvEscape).join(";"),
            ...src.map((s) => [
                s.nr,
                s.name,
                s.strasse || "",
                s.plz || "",
                s.ort || "",
                s.land || "",
                s.email || "",
                s.ustId || "",
                s.konto || ""
            ].
                map(csvEscape).
                join(";"))
        ].
            join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        const href = URL.createObjectURL(blob);
        a.href = href;
        a.download = `DATEV_${typ}_Stammdaten.csv`;
        a.click();
        URL.revokeObjectURL(href);
    };
    function openPrint(html) {
        const w = window.open("", "_blank", "noopener,noreferrer,width=1000,height=700");
        if (!w) {
            alert("Pop-ups blockiert – bitte zulassen!");
            return;
        }
        w.document.open();
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => {
            try {
                w.print();
            }
            catch { }
        }, 400);
    }
    const printPreview = (useFiltered) => {
        const list = useFiltered ? filtered : rows;
        const body = list.
            map((r) => `
        <tr>
          <td>${escapeHtml(r.quelle)}</td>
          <td>${escapeHtml(r.belegNr)}</td>
          <td>${escapeHtml(r.buchungsdatum)}</td>
          <td>${safeNumber(r.betrag) < 0 ? "S" : "H"}</td>
          <td style="text-align:right">${fmt(Math.abs(safeNumber(r.betrag)))}</td>
          <td>${escapeHtml(r.konto || "")}</td>
          <td>${escapeHtml(r.gegenkonto || "")}</td>
          <td>${escapeHtml(r.ustSchluessel || "")}</td>
          <td>${escapeHtml(r.kost1 || "")}</td>
          <td>${escapeHtml(r.text || "")}</td>
        </tr>
      `).
            join("");
        const html = `<!doctype html><html><head><meta charset="utf-8"/><title>DATEV Preview</title>
    <style>
      body{font-family:Arial, sans-serif;margin:32px;color:#222}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}
      th{background:#f5f5f5}
      .right{text-align:right}
    </style></head><body>
    <h1>DATEV – Buchungsstapel (Preview)</h1>
    <div>Datensätze: ${list.length} · Soll: ${fmt(totals.soll)} € · Haben: ${fmt(totals.haben)} €</div>
    <table>
      <thead>
        <tr><th>Quelle</th><th>Beleg</th><th>Datum</th><th>SHK</th><th class="right">Umsatz €</th><th>Konto</th><th>Gegenkonto</th><th>BU</th><th>KOST1</th><th>Text</th></tr>
      </thead>
      <tbody>${body || `<tr><td colspan="10" style="color:#666">Keine Daten.</td></tr>`}</tbody>
    </table>
    </body></html>`;
        openPrint(html);
    };
    return (_jsxs("div", { className: "bh-page", children: [_jsxs("div", { className: "bh-header-row", children: [_jsx("h2", { children: "DATEV Export" }), _jsxs("div", { className: "bh-actions", children: [_jsx("button", { className: "bh-btn", onClick: () => exportBuchungsstapelCSV(true), children: "Buchungsstapel CSV (gefiltert)" }), _jsx("button", { className: "bh-btn ghost", onClick: () => printPreview(true), children: "PDF Preview (gefiltert)" }), _jsx("button", { className: "bh-btn ghost", onClick: () => exportStammdatenCSV("Debitor"), children: "Debitoren CSV" }), _jsx("button", { className: "bh-btn ghost", onClick: () => exportStammdatenCSV("Kreditor"), children: "Kreditoren CSV" })] })] }), _jsxs("div", { className: "bh-filters", children: [_jsxs("div", { children: [_jsx("label", { children: "Kontenplan" }), _jsxs("select", { value: kontenplan, onChange: (e) => setKontenplan(e.target.value), children: [_jsx("option", { value: "SKR03", children: "SKR03" }), _jsx("option", { value: "SKR04", children: "SKR04" })] })] }), _jsxs("div", { children: [_jsx("label", { children: "Quelle" }), _jsxs("select", { value: quelle, onChange: (e) => setQuelle(e.target.value), children: [_jsx("option", { value: "ALL", children: "Alle" }), _jsx("option", { value: "Rechnungen", children: "Rechnungen (Ausgang)" }), _jsx("option", { value: "Eingangsrechnungen", children: "Eingangsrechnungen" }), _jsx("option", { value: "Kassenbuch", children: "Kassenbuch" })] })] }), _jsxs("div", { children: [_jsx("label", { children: "Zeitraum" }), _jsxs("select", { value: zeitraum, onChange: (e) => setZeitraum(e.target.value), children: [_jsx("option", { value: "THIS_MONTH", children: "Dieser Monat" }), _jsx("option", { value: "30", children: "Letzte 30 Tage" }), _jsx("option", { value: "60", children: "Letzte 60 Tage" }), _jsx("option", { value: "90", children: "Letzte 90 Tage" }), _jsx("option", { value: "YTD", children: "YTD" }), _jsx("option", { value: "ALL", children: "Alle" })] })] }), _jsxs("div", { children: [_jsx("label", { children: "Suche" }), _jsx("input", { type: "text", value: query, onChange: (e) => setQuery(e.target.value), placeholder: "Beleg / Text / Konto" })] }), _jsxs("div", { children: [_jsx("label", { children: "Belegkreis" }), _jsx("input", { type: "text", value: belegkreis, onChange: (e) => setBelegkreis(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { children: "Standard Bank (Gegenkonto)" }), _jsx("input", { type: "text", value: standardBank, onChange: (e) => setStandardBank(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { children: "Standard Kasse (Gegenkonto)" }), _jsx("input", { type: "text", value: standardKasse, onChange: (e) => setStandardKasse(e.target.value) })] }), _jsxs("div", { className: "rlc-migrated-pages-buchhaltung-datev-tsx-172", children: ["Soll: ", fmt(totals.soll), " \u20AC \u00B7 Haben: ", fmt(totals.haben), " \u20AC \u00B7 \u0394 ", fmt(totals.haben - totals.soll), " \u20AC"] })] }), _jsxs("table", { className: "bh-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Quelle" }), _jsx("th", { children: "Beleg" }), _jsx("th", { children: "Buchungsdatum" }), _jsx("th", { children: "Belegdatum" }), _jsx("th", { children: "Text" }), _jsx("th", { children: "Konto" }), _jsx("th", { children: "Gegenkonto" }), _jsx("th", { children: "BU" }), _jsx("th", { children: "KOST1" }), _jsx("th", { className: "right", children: "Umsatz (\u20AC)" }), _jsx("th", { children: "SHK" })] }) }), _jsxs("tbody", { children: [filtered.map((r) => {
                                const shk = safeNumber(r.betrag) < 0 ? "S" : "H";
                                return (_jsxs("tr", { children: [_jsx("td", { children: r.quelle }), _jsx("td", { children: r.belegNr }), _jsx("td", { children: _jsx("input", { type: "text", value: r.buchungsdatum, onChange: (e) => update(r.id, "buchungsdatum", e.target.value), className: "rlc-migrated-pages-buchhaltung-datev-tsx-173" }) }), _jsx("td", { children: _jsx("input", { type: "text", value: r.belegdatum, onChange: (e) => update(r.id, "belegdatum", e.target.value), className: "rlc-migrated-pages-buchhaltung-datev-tsx-174" }) }), _jsx("td", { children: _jsx("input", { type: "text", value: r.text, onChange: (e) => update(r.id, "text", e.target.value), className: "rlc-migrated-pages-buchhaltung-datev-tsx-175" }) }), _jsx("td", { children: _jsx("input", { type: "text", value: r.konto || "", onChange: (e) => update(r.id, "konto", e.target.value), className: "rlc-migrated-pages-buchhaltung-datev-tsx-176" }) }), _jsx("td", { children: _jsx("input", { type: "text", value: r.gegenkonto || "", onChange: (e) => update(r.id, "gegenkonto", e.target.value), className: "rlc-migrated-pages-buchhaltung-datev-tsx-177" }) }), _jsx("td", { children: _jsxs("select", { value: r.ustSchluessel || "", onChange: (e) => update(r.id, "ustSchluessel", e.target.value), children: [_jsx("option", { value: "", children: "\u2014" }), _jsx("option", { value: "3", children: "3 \u00B7 19% USt" }), _jsx("option", { value: "2", children: "2 \u00B7 7% USt" }), _jsx("option", { value: "8", children: "8 \u00B7 19% Vorst." }), _jsx("option", { value: "9", children: "9 \u00B7 7% Vorst." }), _jsx("option", { value: "0", children: "0 \u00B7 steuerfrei" })] }) }), _jsx("td", { children: _jsx("input", { type: "text", value: r.kost1 || "", onChange: (e) => update(r.id, "kost1", e.target.value), className: "rlc-migrated-pages-buchhaltung-datev-tsx-178" }) }), _jsx("td", { className: "right", children: fmt(Math.abs(safeNumber(r.betrag))) }), _jsx("td", { children: shk })] }, r.id));
                            }), filtered.length === 0 &&
                                _jsx("tr", { children: _jsx("td", { colSpan: 11, className: "rlc-migrated-pages-buchhaltung-datev-tsx-179", children: "Keine Buchungen im aktuellen Filter." }) }), _jsxs("tr", { className: "rlc-migrated-pages-buchhaltung-datev-tsx-180", children: [_jsx("td", { colSpan: 9, className: "rlc-migrated-pages-buchhaltung-datev-tsx-181", children: "Summe (gefiltert):" }), _jsx("td", { className: "right", children: fmt(filtered.reduce((s, r) => s + Math.abs(safeNumber(r.betrag)), 0)) }), _jsx("td", {})] })] })] }), _jsx("div", { className: "bh-note rlc-migrated-pages-buchhaltung-datev-tsx-182", children: "*CSV-Layout semplificato per import. Mappa avanzata (EXTF, Feldl\u00E4ngen, Zeichensatz, Kopfzeile) integrabile su richiesta." })] }));
}
