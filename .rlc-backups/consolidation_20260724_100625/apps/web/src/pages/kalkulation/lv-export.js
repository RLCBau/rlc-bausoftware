import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useMemo, useRef, useState } from "react";
const parseNum = (v) => {
    if (v === null || v === undefined || v === "")
        return undefined;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
};
/** CSV <-> JSON minimal (separatore ;) */
function parseCSV(text) {
    const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
    if (lines.length === 0)
        return [];
    const headers = lines[0].split(";").map(s => s.trim().toLowerCase());
    const idx = (alts) => headers.findIndex(h => alts.includes(h));
    const iPos = idx(["posnr", "positionsnummer", "pos", "position"]);
    const iKurz = idx(["kurztext", "kurz", "bezeichnung"]);
    const iLang = idx(["langtext", "text", "beschreibung"]);
    const iME = idx(["me", "einheit", "eh", "unit"]);
    const iMenge = idx(["menge", "qty", "m"]);
    const iEP = idx(["ep", "einheitspreis", "preis", "preis_ep", "preis (ep)"]);
    const iGP = idx(["gp", "gesamtpreis", "ges preis", "preis (gp)"]);
    const out = [];
    for (let r = 1; r < lines.length; r++) {
        const cols = lines[r].split(";");
        if (cols.length === 1 && cols[0].trim() === "")
            continue;
        out.push({
            posnr: String(cols[iPos] ?? "").trim(),
            kurztext: String(cols[iKurz] ?? "").trim(),
            langtext: iLang >= 0 ? String(cols[iLang] ?? "").trim() : undefined,
            me: iME >= 0 ? String(cols[iME] ?? "").trim() : undefined,
            menge: iMenge >= 0 ? parseNum(cols[iMenge]) : undefined,
            ep: iEP >= 0 ? cols[iEP] : undefined,
            gp: iGP >= 0 ? cols[iGP] : undefined,
        });
    }
    return out;
}
function toCSV(rows, include) {
    const head = [
        include.posnr ? "PosNr" : null,
        include.kurztext ? "Kurztext" : null,
        include.langtext ? "Langtext" : null,
        include.me ? "ME" : null,
        include.menge ? "Menge" : null,
    ].filter(Boolean);
    const body = rows.map(r => [
        include.posnr ? r.posnr : null,
        include.kurztext ? r.kurztext?.replace(/;/g, ",") : null,
        include.langtext ? (r.langtext ?? "").replace(/;/g, ",") : null,
        include.me ? (r.me ?? "") : null,
        include.menge ? (r.menge ?? "") : null,
    ].filter(v => v !== null).join(";"));
    return [head.join(";"), ...body].join("\n");
}
export default function LVExportOhnePreisePage() {
    const [rows, setRows] = useState([]);
    const [query, setQuery] = useState("");
    const [include, setInclude] = useState({
        posnr: true, kurztext: true, langtext: false, me: true, menge: true,
    });
    const [stripEmptyLines, setStripEmptyLines] = useState(true);
    const [outputSepComma, setOutputSepComma] = useState(false); // opzionale
    const fileRef = useRef(null);
    /** filtra + rimuovi colonne prezzo */
    const cleaned = useMemo(() => {
        const q = query.trim().toLowerCase();
        const base = rows
            .map(r => ({ ...r, ep: undefined, gp: undefined, preis: undefined })) // rimuovi prezzi
            .filter(r => !stripEmptyLines ||
            (r.posnr?.trim() || r.kurztext?.trim()));
        if (!q)
            return base;
        return base.filter(r => r.posnr.toLowerCase().includes(q) ||
            (r.kurztext || "").toLowerCase().includes(q) ||
            (r.langtext || "").toLowerCase().includes(q));
    }, [rows, query, stripEmptyLines]);
    const exportCSV = () => {
        let csv = toCSV(cleaned, include);
        if (outputSepComma)
            csv = csv.replace(/;/g, ",");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "LV_ohne_Preise.csv";
        a.click();
        URL.revokeObjectURL(url);
    };
    return (_jsxs("div", { style: { padding: 24, display: "flex", flexDirection: "column", gap: 12 }, children: [_jsx("div", { style: { fontSize: 20, fontWeight: 700, color: "#111827" }, children: "LV ohne Preise exportieren" }), _jsxs("div", { style: toolbar, children: [_jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [_jsx("input", { placeholder: "Suche\u2026 (PosNr, Kurz-/Langtext)", value: query, onChange: (e) => setQuery(e.target.value), style: searchInput }), _jsxs("label", { style: btnSecondary, children: ["CSV-Import (LV)", _jsx("input", { ref: fileRef, type: "file", accept: ".csv,text/csv", style: { display: "none" }, onChange: (e) => {
                                            const f = e.target.files?.[0];
                                            if (!f)
                                                return;
                                            const r = new FileReader();
                                            r.onload = () => {
                                                const text = String(r.result || "");
                                                setRows(parseCSV(text));
                                            };
                                            r.readAsText(f, "utf-8");
                                        } })] }), _jsx("button", { style: btnPrimary, disabled: cleaned.length === 0, onClick: exportCSV, children: "CSV-Export (ohne Preise)" })] }), _jsxs("div", { style: { fontSize: 12, color: "#6b7280" }, children: ["Positionen: ", rows.length, " \u2022 Export: ", cleaned.length] })] }), _jsx("div", { style: card, children: _jsxs("div", { style: { display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }, children: [_jsx("div", { style: { fontWeight: 600 }, children: "Spalten im Export:" }), [
                            ["posnr", "PosNr"],
                            ["kurztext", "Kurztext"],
                            ["langtext", "Langtext"],
                            ["me", "ME"],
                            ["menge", "Menge"],
                        ].map(([k, label]) => (_jsxs("label", { style: chk, children: [_jsx("input", { type: "checkbox", checked: include[k], onChange: (e) => setInclude({ ...include, [k]: e.target.checked }) }), " ", label] }, k))), _jsxs("label", { style: chk, children: [_jsx("input", { type: "checkbox", checked: stripEmptyLines, onChange: (e) => setStripEmptyLines(e.target.checked) }), " Leere Zeilen entfernen"] }), _jsxs("label", { style: chk, children: [_jsx("input", { type: "checkbox", checked: outputSepComma, onChange: (e) => setOutputSepComma(e.target.checked) }), " Komma statt Semikolon"] })] }) }), _jsx("div", { style: { border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }, children: _jsx("div", { style: { overflow: "auto", maxHeight: "65vh" }, children: _jsxs("table", { style: { borderCollapse: "separate", borderSpacing: 0, width: "100%" }, children: [_jsx("thead", { style: { position: "sticky", top: 0, background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }, children: _jsxs("tr", { children: [include.posnr && _jsx("th", { style: th(120), children: "PosNr" }), include.kurztext && _jsx("th", { style: th(360), children: "Kurztext" }), include.langtext && _jsx("th", { style: th(420), children: "Langtext" }), include.me && _jsx("th", { style: th(80), children: "ME" }), include.menge && _jsx("th", { style: th(100), children: "Menge" })] }) }), _jsxs("tbody", { children: [cleaned.map((r, i) => (_jsxs("tr", { style: { background: i % 2 ? "#fcfcfc" : "white" }, children: [include.posnr && _jsx("td", { style: td(120), children: r.posnr }), include.kurztext && _jsx("td", { style: td(360), title: r.kurztext, children: r.kurztext }), include.langtext && _jsx("td", { style: td(420), title: r.langtext, children: r.langtext }), include.me && _jsx("td", { style: td(80), children: r.me ?? "" }), include.menge && _jsx("td", { style: td(100), children: r.menge ?? "" })] }, i))), rows.length === 0 && (_jsx("tr", { children: _jsxs("td", { colSpan: 5, style: { padding: 16, color: "#6b7280" }, children: ["Noch keine Daten. CSV importieren (Spalten-Beispiele: ", _jsx("b", { children: "PosNr;Kurztext;Langtext;ME;Menge;EP;GP" }), "). Preise werden beim Export automatisch entfernt."] }) }))] })] }) }) })] }));
}
/** ===== Styles ===== */
const toolbar = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    border: "1px solid #e5e7eb",
    background: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
};
const card = { border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "white" };
const btnPrimary = { padding: "8px 12px", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb", color: "white", cursor: "pointer", fontWeight: 600 };
const btnSecondary = { padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "white", color: "#111827", cursor: "pointer", fontWeight: 600 };
const searchInput = { width: 260, height: 36, borderRadius: 8, border: "1px solid #e5e7eb", outline: "none", padding: "0 10px", fontSize: 14 };
const chk = { display: "flex", alignItems: "center", gap: 6, userSelect: "none" };
function th(w) { return { position: "sticky", top: 0, background: "#f8fafc", textAlign: "left", padding: "10px 8px", fontSize: 12, borderBottom: "1px solid #e5e7eb", minWidth: w, maxWidth: w, zIndex: 1 }; }
function td(w) { return { padding: "8px", fontSize: 12, borderBottom: "1px solid #f1f5f9", minWidth: w, maxWidth: w, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }; }
