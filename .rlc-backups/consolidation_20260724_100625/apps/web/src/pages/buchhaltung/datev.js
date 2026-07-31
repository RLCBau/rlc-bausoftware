import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useMemo, useState } from "react";
import "./styles.css";
/* =========================
   HELPERS
   ========================= */
const fmt = (n) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseDE = (s) => {
    if (!s)
        return new Date("1970-01-01");
    const [d, m, y] = s.split(".").map(Number);
    return new Date(y, m - 1, d);
};
const withinDays = (d, days) => { const from = new Date(); from.setDate(from.getDate() - days); return d >= from; };
const isSameMonth = (d, ref) => d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
/* =========================
   COMPONENT
   ========================= */
export default function DATEV() {
    /* Demo journal (unificato da Rechnungen/Eingangsrechnungen/Kasse) */
    const [rows, setRows] = useState([
        { id: 1, quelle: "Rechnungen", belegNr: "R-2025-102", buchungsdatum: "30.10.2025", belegdatum: "30.10.2025", text: "Erlöse Rohrbau", debitor: "10001", konto: "8400", gegenkonto: "1200", betrag: 5355.00, ustSchluessel: "3", kost1: "KS-02" },
        { id: 2, quelle: "Eingangsrechnungen", belegNr: "E-2025-077", buchungsdatum: "28.10.2025", belegdatum: "27.10.2025", text: "Material Rohr DN200", kreditor: "70021", konto: "3400", gegenkonto: "1200", betrag: -1240.50, ustSchluessel: "8", kost1: "KS-01" },
        { id: 3, quelle: "Kassenbuch", belegNr: "K-0009", buchungsdatum: "25.10.2025", belegdatum: "25.10.2025", text: "Büromaterial bar", konto: "4920", gegenkonto: "1000", betrag: -36.50, ustSchluessel: "8" },
    ]);
    const [kontenplan, setKontenplan] = useState("SKR03");
    const [quelle, setQuelle] = useState("ALL");
    const [zeitraum, setZeitraum] = useState("THIS_MONTH");
    const [query, setQuery] = useState("");
    const [belegkreis, setBelegkreis] = useState("RLC");
    const [standardBank, setStandardBank] = useState("1200"); // Bank
    const [standardKasse, setStandardKasse] = useState("1000"); // Kasse
    /* ====== Stammdaten demo ====== */
    const [debitoren] = useState([
        { nr: "10001", name: "Muster GmbH", plz: "80331", ort: "München", strasse: "Hauptstr. 1", land: "DE", email: "info@muster.de", konto: kontenplan === "SKR03" ? "10000" : "120000" },
    ]);
    const [kreditoren] = useState([
        { nr: "70021", name: "Bauhandel AG", plz: "90402", ort: "Nürnberg", strasse: "Industriepark 5", land: "DE", email: "office@bauhandel.de", konto: kontenplan === "SKR03" ? "70000" : "160000" },
    ]);
    /* ====== Filtering ====== */
    const filtered = useMemo(() => {
        let arr = rows.slice();
        if (quelle !== "ALL")
            arr = arr.filter(r => r.quelle === quelle);
        arr = arr.filter(r => {
            const d = parseDE(r.buchungsdatum);
            switch (zeitraum) {
                case "30": return withinDays(d, 30);
                case "60": return withinDays(d, 60);
                case "90": return withinDays(d, 90);
                case "THIS_MONTH": return isSameMonth(d, new Date());
                case "YTD": return d.getFullYear() === new Date().getFullYear();
                default: return true;
            }
        });
        if (query.trim()) {
            const q = query.toLowerCase();
            arr = arr.filter(r => (r.text || "").toLowerCase().includes(q) ||
                (r.belegNr || "").toLowerCase().includes(q) ||
                (r.konto || "").toLowerCase().includes(q) ||
                (r.gegenkonto || "").toLowerCase().includes(q) ||
                (r.debitor || "").toLowerCase().includes(q) ||
                (r.kreditor || "").toLowerCase().includes(q));
        }
        // normalizza conti standard
        arr = arr.map(r => {
            let gk = r.gegenkonto || "";
            if (r.quelle === "Rechnungen" && !r.debitor)
                gk = gk || (kontenplan === "SKR03" ? "10000" : "120000");
            if (r.quelle === "Eingangsrechnungen" && !r.kreditor)
                gk = gk || (kontenplan === "SKR03" ? "70000" : "160000");
            if (r.quelle === "Kassenbuch" && !gk)
                gk = standardKasse;
            return { ...r, gegenkonto: gk };
        });
        // ordina per data
        arr.sort((a, b) => parseDE(b.buchungsdatum).getTime() - parseDE(a.buchungsdatum).getTime() || b.id - a.id);
        return arr;
    }, [rows, quelle, zeitraum, query, kontenplan, standardKasse]);
    const totals = useMemo(() => {
        const sum = filtered.reduce((s, r) => s + r.betrag, 0);
        const soll = filtered.filter(r => r.betrag < 0).reduce((s, r) => s + Math.abs(r.betrag), 0);
        const haben = filtered.filter(r => r.betrag > 0).reduce((s, r) => s + r.betrag, 0);
        return { sum, soll, haben };
    }, [filtered]);
    /* ====== Inline update ====== */
    const update = (id, key, val) => setRows(prev => prev.map(r => (r.id === id ? { ...r, [key]: val } : r)));
    /* ====== EXPORT: DATEV Buchungsstapel (CSV) ======
       Colonne principali (compat semplificata):
       - UMSATZ_OHNE_SHK ; SHK ; KTO ; GEGKTO ; BU ; DATUM ; BELEG ; BELEGDAT ; TEXT ; KOST1 ; KOST2 ; BELEGKREIS
       Dove SHK: S/H (Soll/Haben), BU: BU-Schlüssel (z.B. 3=19% USt, 2=7%, 8=19% Vorsteuer)  */
    const exportBuchungsstapelCSV = (useFiltered) => {
        const list = useFiltered ? filtered : rows;
        if (!list.length)
            return;
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
            const shk = r.betrag < 0 ? "S" : "H";
            const betragAbs = Math.abs(r.betrag);
            const konto = r.konto || "";
            const geg = r.gegenkonto || (r.quelle === "Rechnungen" ? (r.debitor || (kontenplan === "SKR03" ? "10000" : "120000")) :
                r.quelle === "Eingangsrechnungen" ? (r.kreditor || (kontenplan === "SKR03" ? "70000" : "160000")) :
                    r.quelle === "Kassenbuch" ? standardKasse : standardBank);
            const bu = r.ustSchluessel || "";
            return [
                betragAbs.toFixed(2).replace(".", ","), // Umsatz
                shk,
                konto,
                geg,
                bu,
                r.buchungsdatum,
                r.belegNr,
                r.belegdatum,
                (r.text || "").replace(/;/g, ","),
                r.kost1 || "",
                r.kost2 || "",
                belegkreis
            ].join(";");
        };
        const csv = [header.join(";"), ...list.map(toRow)].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "DATEV_Buchungsstapel.csv";
        a.click();
        URL.revokeObjectURL(a.href);
    };
    /* ====== EXPORT: Debitoren/Kreditoren Stammdaten (CSV) ====== */
    const exportStammdatenCSV = (typ) => {
        const src = typ === "Debitor" ? debitoren : kreditoren;
        if (!src.length)
            return;
        const header = ["Nr", "Name", "Straße", "PLZ", "Ort", "Land", "E-Mail", "USt-ID", "Sammelkonto"];
        const csv = [
            header.join(";"),
            ...src.map(s => [s.nr, s.name, s.strasse || "", s.plz || "", s.ort || "", s.land || "", s.email || "", s.ustId || "", s.konto || ""].join(";")),
        ].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `DATEV_${typ}_Stammdaten.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };
    /* ====== PRINT PREVIEW ====== */
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
        setTimeout(() => { try {
            w.print();
        }
        catch { } }, 400);
    }
    const printPreview = (useFiltered) => {
        const list = useFiltered ? filtered : rows;
        const body = list.map(r => `
      <tr>
        <td>${r.quelle}</td>
        <td>${r.belegNr}</td>
        <td>${r.buchungsdatum}</td>
        <td>${r.betrag < 0 ? "S" : "H"}</td>
        <td style="text-align:right">${fmt(Math.abs(r.betrag))}</td>
        <td>${r.konto || ""}</td>
        <td>${r.gegenkonto || ""}</td>
        <td>${r.ustSchluessel || ""}</td>
        <td>${r.kost1 || ""}</td>
        <td>${(r.text || "").replace(/</g, "&lt;")}</td>
      </tr>
    `).join("");
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
    /* =========================
       RENDER
       ========================= */
    return (_jsxs("div", { className: "bh-page", children: [_jsxs("div", { className: "bh-header-row", children: [_jsx("h2", { children: "DATEV Export" }), _jsxs("div", { className: "bh-actions", children: [_jsx("button", { className: "bh-btn", onClick: () => exportBuchungsstapelCSV(true), children: "Buchungsstapel CSV (gefiltert)" }), _jsx("button", { className: "bh-btn ghost", onClick: () => printPreview(true), children: "PDF Preview (gefiltert)" }), _jsx("button", { className: "bh-btn ghost", onClick: () => exportStammdatenCSV("Debitor"), children: "Debitoren CSV" }), _jsx("button", { className: "bh-btn ghost", onClick: () => exportStammdatenCSV("Kreditor"), children: "Kreditoren CSV" })] })] }), _jsxs("div", { className: "bh-filters", children: [_jsxs("div", { children: [_jsx("label", { children: "Kontenplan" }), _jsxs("select", { value: kontenplan, onChange: e => setKontenplan(e.target.value), children: [_jsx("option", { value: "SKR03", children: "SKR03" }), _jsx("option", { value: "SKR04", children: "SKR04" })] })] }), _jsxs("div", { children: [_jsx("label", { children: "Quelle" }), _jsxs("select", { value: quelle, onChange: e => setQuelle(e.target.value), children: [_jsx("option", { value: "ALL", children: "Alle" }), _jsx("option", { value: "Rechnungen", children: "Rechnungen (Ausgang)" }), _jsx("option", { value: "Eingangsrechnungen", children: "Eingangsrechnungen" }), _jsx("option", { value: "Kassenbuch", children: "Kassenbuch" })] })] }), _jsxs("div", { children: [_jsx("label", { children: "Zeitraum" }), _jsxs("select", { value: zeitraum, onChange: e => setZeitraum(e.target.value), children: [_jsx("option", { value: "THIS_MONTH", children: "Dieser Monat" }), _jsx("option", { value: "30", children: "Letzte 30 Tage" }), _jsx("option", { value: "60", children: "Letzte 60 Tage" }), _jsx("option", { value: "90", children: "Letzte 90 Tage" }), _jsx("option", { value: "YTD", children: "YTD" }), _jsx("option", { value: "ALL", children: "Alle" })] })] }), _jsxs("div", { children: [_jsx("label", { children: "Suche" }), _jsx("input", { type: "text", value: query, onChange: e => setQuery(e.target.value), placeholder: "Beleg / Text / Konto" })] }), _jsxs("div", { children: [_jsx("label", { children: "Belegkreis" }), _jsx("input", { type: "text", value: belegkreis, onChange: e => setBelegkreis(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { children: "Standard Bank (Gegenkonto)" }), _jsx("input", { type: "text", value: standardBank, onChange: e => setStandardBank(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { children: "Standard Kasse (Gegenkonto)" }), _jsx("input", { type: "text", value: standardKasse, onChange: e => setStandardKasse(e.target.value) })] }), _jsxs("div", { style: { alignSelf: "end", fontWeight: 600 }, children: ["Soll: ", fmt(totals.soll), " \u20AC \u00B7 Haben: ", fmt(totals.haben), " \u20AC \u00B7 \u0394 ", fmt(totals.haben - totals.soll), " \u20AC"] })] }), _jsxs("table", { className: "bh-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Quelle" }), _jsx("th", { children: "Beleg" }), _jsx("th", { children: "Buchungsdatum" }), _jsx("th", { children: "Belegdatum" }), _jsx("th", { children: "Text" }), _jsx("th", { children: "Konto" }), _jsx("th", { children: "Gegenkonto" }), _jsx("th", { children: "BU" }), _jsx("th", { children: "KOST1" }), _jsx("th", { className: "right", children: "Umsatz (\u20AC)" }), _jsx("th", { children: "SHK" })] }) }), _jsxs("tbody", { children: [filtered.map(r => {
                                const shk = r.betrag < 0 ? "S" : "H";
                                const i = rows.findIndex(x => x.id === r.id);
                                return (_jsxs("tr", { children: [_jsx("td", { children: r.quelle }), _jsx("td", { children: r.belegNr }), _jsx("td", { children: _jsx("input", { type: "text", value: r.buchungsdatum, onChange: e => update(r.id, "buchungsdatum", e.target.value), style: { width: 110 } }) }), _jsx("td", { children: _jsx("input", { type: "text", value: r.belegdatum, onChange: e => update(r.id, "belegdatum", e.target.value), style: { width: 110 } }) }), _jsx("td", { children: _jsx("input", { type: "text", value: r.text, onChange: e => update(r.id, "text", e.target.value), style: { minWidth: 200 } }) }), _jsx("td", { children: _jsx("input", { type: "text", value: r.konto || "", onChange: e => update(r.id, "konto", e.target.value), style: { width: 100 } }) }), _jsx("td", { children: _jsx("input", { type: "text", value: r.gegenkonto || "", onChange: e => update(r.id, "gegenkonto", e.target.value), style: { width: 100 } }) }), _jsx("td", { children: _jsxs("select", { value: r.ustSchluessel || "", onChange: e => update(r.id, "ustSchluessel", e.target.value), children: [_jsx("option", { value: "", children: "\u2014" }), _jsx("option", { value: "3", children: "3 \u00B7 19% USt" }), _jsx("option", { value: "2", children: "2 \u00B7 7% USt" }), _jsx("option", { value: "8", children: "8 \u00B7 19% Vorst." }), _jsx("option", { value: "9", children: "9 \u00B7 7% Vorst." }), _jsx("option", { value: "0", children: "0 \u00B7 steuerfrei" })] }) }), _jsx("td", { children: _jsx("input", { type: "text", value: r.kost1 || "", onChange: e => update(r.id, "kost1", e.target.value), style: { width: 110 } }) }), _jsx("td", { className: "right", children: fmt(Math.abs(r.betrag)) }), _jsx("td", { children: shk })] }, r.id));
                            }), _jsxs("tr", { style: { background: "#fafafa", fontWeight: 600 }, children: [_jsx("td", { colSpan: 9, style: { textAlign: "right" }, children: "Summe (gefiltert):" }), _jsx("td", { className: "right", children: fmt(Math.abs(totals.sum)) }), _jsx("td", {})] })] })] }), _jsx("div", { className: "bh-note", style: { marginTop: 8 }, children: "*CSV-Layout semplificato per import. Mappa avanzata (EXTF, Feldl\u00E4ngen, Zeichensatz, Kopfzeile) integrabile su richiesta." })] }));
}
