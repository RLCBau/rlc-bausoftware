import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LV } from "./store.lv";
/** Unterstützte Formate (Anzeige) */
const SUPPORTED = [
    { code: "GAEB90", label: "GAEB 90", sub: "D81–D86" },
    { code: "GAEB2000", label: "GAEB 2000", sub: "P81–P86, P94" },
    { code: "GAEBXML", label: "GAEB XML 3.x", sub: "X80–X86, X94" },
    { code: "DA", label: "Aufmaß (DA)", sub: "DA11 (1979/2009), X31" },
];
/** Vorschlag-Map für ME-Normalisierung */
const ME_SUGGEST = {
    qm: "m²", m2: "m²", "m^2": "m²",
    qkm: "km²",
    qdm: "dm²",
    qcm: "cm²",
    qmm: "mm²",
    mtr: "m", meter: "m",
    stk: "St", st: "St", stck: "St",
    std: "h", stunden: "h",
    min: "min",
    t: "t", to: "t", tonnen: "t",
    kg: "kg", g: "g",
    l: "l",
    "m3": "m³", "m^3": "m³", qm3: "m³",
    km: "km",
    pauschal: "PS", ps: "PS",
};
export default function GaebPage() {
    const nav = useNavigate();
    const [det, setDet] = useState(null);
    const [info, setInfo] = useState("");
    const [busy, setBusy] = useState(false);
    const [openRows, setOpenRows] = useState({});
    const [filterMode, setFilterMode] = useState("alle");
    const preview = useMemo(() => (det?.rows ?? []).slice(0, 500), [det]);
    async function onUpload(f) {
        setBusy(true);
        setInfo("Datei wird verarbeitet …");
        try {
            const fd = new FormData();
            fd.append("file", f);
            const r = await fetch("https://api.rlcbausoftware.com/api/gaeb/import", { method: "POST", body: fd });
            const j = await r.json();
            if (!r.ok)
                throw new Error(j?.error || r.statusText);
            setDet({ format: j.format, name: f.name, count: j.count, rows: j.rows });
            if (!j.count) {
                setInfo(`Hinweis: ${j.format} erkannt, aber keine Positionen extrahiert. `
                    + `Für GAEB 2000 (.P94) ist der Parser noch nicht aktiviert. `
                    + `Bitte GAEB XML (X80–X86) nutzen oder als CSV importieren.`);
            }
            else {
                setInfo(`Import erfolgreich: ${j.format} • ${j.count.toLocaleString("de-DE")} Positionen.`);
            }
            setOpenRows({});
        }
        catch (e) {
            setDet(null);
            setInfo("Fehler: " + (e?.message || e));
        }
        finally {
            setBusy(false);
        }
    }
    function upsertToLV(rows) {
        let ins = 0, upd = 0;
        const cur = LV.list();
        const map = new Map(cur.map(x => [x.posNr, x]));
        for (const r of rows) {
            const posNr = String(r.posNr ?? "").trim();
            if (!posNr)
                continue; // skip ungültig
            const found = map.get(posNr);
            if (found) {
                LV.upsert({
                    ...found,
                    kurztext: found.kurztext || r.kurztext || "",
                    einheit: found.einheit || r.einheit || "",
                    preis: r.preis != null ? Number(r.preis) : found.preis,
                    menge: Number(found.menge || 0) + Number(r.menge || 0),
                });
                upd++;
            }
            else {
                LV.upsert({
                    id: crypto.randomUUID(),
                    posNr,
                    kurztext: r.kurztext || "",
                    einheit: r.einheit || "",
                    menge: Number(r.menge || 0),
                    preis: r.preis != null ? Number(r.preis) : undefined,
                    confidence: undefined,
                });
                ins++;
            }
        }
        setInfo(`Zum LV übernommen — neu: ${ins}, aktualisiert: ${upd}.`);
    }
    async function exportGAEB(fmt) {
        setBusy(true);
        setInfo("");
        try {
            const rows = LV.list();
            const r = await fetch("https://api.rlcbausoftware.com/api/gaeb/export", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ format: fmt, rows })
            });
            if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                throw new Error(j?.error || r.statusText);
            }
            const blob = await r.blob();
            const a = document.createElement("a");
            const url = URL.createObjectURL(blob);
            a.href = url;
            a.download = fmt === "GAEBXML" ? "lv.x86.xml" : (fmt === "GAEB2000" ? "lv.p81" : "lv.d81");
            a.click();
            URL.revokeObjectURL(url);
            setInfo(`Export erstellt (${fmt}).`);
        }
        catch (e) {
            setInfo("Export-Fehler: " + (e?.message || e));
        }
        finally {
            setBusy(false);
        }
    }
    function exportCSV(rows) {
        const head = "PosNr;Kurztext;ME;Menge;EP;Langtext";
        const body = rows.map(r => [
            r.posNr ?? "",
            JSON.stringify(r.kurztext ?? ""),
            r.einheit ?? "",
            r.menge ?? "",
            r.preis ?? "",
            JSON.stringify(r.langtext ?? "")
        ].join(";")).join("\n");
        const csv = head + "\n" + body;
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = "gaeb-preview.csv";
        a.click();
        URL.revokeObjectURL(url);
    }
    const accept = ".D81,.D82,.D83,.D84,.D85,.D86," +
        ".P81,.P82,.P83,.P84,.P85,.P86,.P94," +
        ".X80,.X81,.X82,.X83,.X84,.X85,.X86,.X94,.XML," +
        ".DA11,.X31";
    /* ========= Validierung & Filter ========= */
    const lvNow = LV.list();
    const existingSet = useMemo(() => new Set(lvNow.map(r => String(r.posNr || ""))), [lvNow]);
    const issues = useMemo(() => {
        const iss = {};
        if (!det?.rows)
            return iss;
        const seen = new Set();
        det.rows.forEach((r, idx) => {
            const pos = String(r.posNr ?? "").trim();
            const lowME = String(r.einheit ?? "").trim().toLowerCase();
            const sug = ME_SUGGEST[lowME];
            if (!pos)
                iss[idx] = { ...(iss[idx] || {}), empty: true };
            if (pos) {
                if (seen.has(pos))
                    iss[idx] = { ...(iss[idx] || {}), dupInFile: true };
                seen.add(pos);
                if (existingSet.has(pos))
                    iss[idx] = { ...(iss[idx] || {}), existsInLV: true };
            }
            if (sug && sug !== r.einheit)
                iss[idx] = { ...(iss[idx] || {}), meSuggest: sug };
        });
        return iss;
    }, [det, existingSet]);
    const filteredPreview = useMemo(() => {
        let arr = preview;
        if (filterMode === "neu") {
            arr = preview.filter((_, i) => !issues[i]?.existsInLV);
        }
        else if (filterMode === "vorhanden") {
            arr = preview.filter((_, i) => !!issues[i]?.existsInLV);
        }
        return arr;
    }, [preview, filterMode, issues]);
    const counts = useMemo(() => {
        let leer = 0, dupl = 0, inLV = 0, suggest = 0;
        if (det?.rows) {
            det.rows.forEach((_, i) => {
                if (issues[i]?.empty)
                    leer++;
                if (issues[i]?.dupInFile)
                    dupl++;
                if (issues[i]?.existsInLV)
                    inLV++;
                if (issues[i]?.meSuggest)
                    suggest++;
            });
        }
        return { leer, dupl, inLV, suggest };
    }, [det, issues]);
    return (_jsxs("div", { style: { padding: 18 }, children: [_jsx("h2", { style: { marginTop: 0, marginBottom: 8 }, children: "GAEB Import / Export" }), _jsxs("div", { style: card, children: [_jsx("div", { style: cardHead, children: "Formate unterst\u00FCtzt" }), _jsx("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: SUPPORTED.map(f => (_jsxs("span", { style: tag, children: [_jsx("b", { children: f.label }), " ", _jsxs("span", { style: { opacity: .7 }, children: ["(", f.sub, ")"] })] }, f.code))) })] }), _jsxs("div", { style: card, children: [_jsx("div", { style: cardHead, children: "Datei importieren" }), _jsxs("div", { style: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }, children: [_jsx("input", { type: "file", accept: accept, onChange: e => e.target.files?.[0] && onUpload(e.target.files[0]), disabled: busy }), det && (_jsxs(_Fragment, { children: [_jsx("span", { style: { ...badge, ...badgeByFmt(det.format) }, children: det.format }), _jsx("span", { style: { color: "#555" }, children: det.name }), _jsxs("span", { style: { color: "#999" }, children: [det.count.toLocaleString("de-DE"), " Positionen"] }), _jsx("button", { onClick: () => upsertToLV(det.rows), disabled: busy, children: "\u2192 Ins LV \u00FCbernehmen (Upsert)" }), _jsx("button", { onClick: () => nav("/kalkulation/manuell"), children: "In \u201EKalkulation manuell\u201C \u00F6ffnen" }), _jsx("button", { onClick: () => nav("/kalkulation/mit-ki"), children: "In \u201EKalkulation mit KI\u201C \u00F6ffnen" }), _jsx("button", { onClick: () => nav("/kalkulation/lv-import"), children: "In \u201ELV erstellen & hochladen\u201C \u00F6ffnen" }), _jsx("button", { onClick: () => exportCSV(det.rows), children: "CSV-Export (Vorschau)" })] }))] }), _jsx("div", { style: { marginTop: 8, color: info.startsWith("Fehler") ? "#b00" : "#0a7" }, children: busy ? "Bitte warten …" : (info || "Wählen Sie eine GAEB-Datei aus.") })] }), det && (_jsxs("div", { style: card, children: [_jsx("div", { style: cardHead, children: "Validierung & Filter" }), _jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [_jsxs("span", { style: { ...pill, borderColor: "#d33", color: "#d33" }, children: ["Leer PosNr: ", counts.leer] }), _jsxs("span", { style: { ...pill, borderColor: "#c80", color: "#c80" }, children: ["Duplikate (Datei): ", counts.dupl] }), _jsxs("span", { style: { ...pill, borderColor: "#06c", color: "#06c" }, children: ["Bereits im LV: ", counts.inLV] }), _jsxs("span", { style: { ...pill, borderColor: "#2a7", color: "#2a7" }, children: ["ME-Vorschl\u00E4ge: ", counts.suggest] }), _jsxs("div", { style: { marginLeft: "auto", display: "flex", gap: 6 }, children: [_jsx("button", { style: { ...chip, ...(filterMode === "alle" ? chipActive : {}) }, onClick: () => setFilterMode("alle"), children: "Alle" }), _jsx("button", { style: { ...chip, ...(filterMode === "neu" ? chipActive : {}) }, onClick: () => setFilterMode("neu"), children: "Nur neue" }), _jsx("button", { style: { ...chip, ...(filterMode === "vorhanden" ? chipActive : {}) }, onClick: () => setFilterMode("vorhanden"), children: "Bereits im LV" })] })] })] })), _jsxs("div", { style: card, children: [_jsx("div", { style: cardHead, children: "Vorschau (max. 500 Zeilen)" }), _jsx("div", { style: { border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 }, children: [_jsx("thead", { style: { background: "#fafafa" }, children: _jsx("tr", { children: ["PosNr", "Kurztext", "ME", "Menge", "EP", "Langtext", "Hinweise"].map((h, i) => _jsx("th", { style: th, children: h }, i)) }) }), _jsxs("tbody", { children: [filteredPreview.map((r, i) => {
                                            const idx = preview.indexOf(r); // Mapping in issues
                                            const open = !!openRows[idx];
                                            const issue = issues[idx] || {};
                                            const rowStyle = {
                                                background: issue.empty ? "#fff5f5" : (issue.dupInFile ? "#fff9e6" : (issue.existsInLV ? "#f6faff" : (i % 2 ? "#fcfcfc" : "#fff")))
                                            };
                                            const meLow = String(r.einheit ?? "").trim().toLowerCase();
                                            const meSug = issue.meSuggest;
                                            return (_jsxs("tr", { style: rowStyle, children: [_jsx("td", { style: td, children: r.posNr ?? "" }), _jsx("td", { style: td, children: r.kurztext ?? "" }), _jsxs("td", { style: td, children: [r.einheit ?? "", meSug && _jsxs("span", { style: { ...miniTag, marginLeft: 6 }, title: "Vorschlag zur Normalisierung", children: ["ME \u2192 ", meSug] })] }), _jsx("td", { style: { ...td, textAlign: "right" }, children: r.menge ?? "" }), _jsx("td", { style: { ...td, textAlign: "right" }, children: r.preis ?? "" }), _jsx("td", { style: td, children: r.langtext ? (_jsxs(_Fragment, { children: [_jsxs("button", { style: linkBtn, onClick: () => setOpenRows(s => ({ ...s, [idx]: !open })), children: [open ? "−" : "+", " anzeigen"] }), open && _jsx("div", { style: { marginTop: 6, whiteSpace: "pre-wrap", color: "#444" }, children: String(r.langtext) })] })) : _jsx("span", { style: { color: "#999" }, children: "\u2014" }) }), _jsxs("td", { style: td, children: [issue.empty && _jsx("span", { style: { ...miniTag, borderColor: "#d33", color: "#d33" }, children: "PosNr leer" }), issue.dupInFile && _jsx("span", { style: { ...miniTag, borderColor: "#c80", color: "#c80", marginLeft: 6 }, children: "Duplikat (Datei)" }), issue.existsInLV && _jsx("span", { style: { ...miniTag, borderColor: "#06c", color: "#06c", marginLeft: 6 }, children: "im LV vorhanden" })] })] }, i));
                                        }), !filteredPreview.length && (_jsx("tr", { children: _jsx("td", { colSpan: 7, style: { padding: 10, color: "#777" }, children: "Keine Daten." }) }))] })] }) })] }), _jsxs("div", { style: card, children: [_jsx("div", { style: cardHead, children: "Export aus aktuellem LV" }), _jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [_jsx("button", { onClick: () => exportGAEB("GAEBXML"), disabled: busy, children: "GAEB XML 3.x (X80\u2013X86)" }), _jsx("button", { onClick: () => exportGAEB("GAEB2000"), disabled: busy, children: "GAEB 2000 (P81\u2026)" }), _jsx("button", { onClick: () => exportGAEB("GAEB90"), disabled: busy, children: "GAEB 90 (D81\u2026)" })] }), _jsx("div", { style: { marginTop: 8, color: "#666" }, children: "Hinweis: GAEB-Generatoren sind Platzhalter und werden sp\u00E4ter ersetzt." })] })] }));
}
/* ---------- UI ---------- */
const card = { border: "1px solid #e6e6e6", borderRadius: 10, padding: 12, marginTop: 12, background: "#fff" };
const cardHead = { fontWeight: 700, marginBottom: 8, fontSize: 15 };
const th = { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #eee", whiteSpace: "nowrap" };
const td = { padding: "6px 8px", borderBottom: "1px solid #f7f7f7", verticalAlign: "top" };
const tag = { border: "1px solid #bbb", borderRadius: 999, padding: "2px 10px", background: "#fafafa", fontSize: 12 };
const badge = { border: "1px solid #bbb", borderRadius: 999, padding: "2px 10px", fontSize: 12, background: "#fff" };
const miniTag = { border: "1px solid #bbb", borderRadius: 999, padding: "0 6px", fontSize: 11, background: "#fff" };
const pill = { border: "1px solid #ccc", borderRadius: 999, padding: "2px 10px", fontSize: 12, background: "#fff" };
const chip = { border: "1px solid #ddd", background: "#fff", borderRadius: 999, padding: "4px 10px", cursor: "pointer" };
const chipActive = { borderColor: "#2b7", background: "#f2fffa", fontWeight: 600 };
const linkBtn = { border: "none", background: "transparent", padding: 0, color: "#0a6", cursor: "pointer" };
function badgeByFmt(fmt) {
    const map = { GAEB90: "#2a7", GAEB2000: "#06c", GAEBXML: "#a50", DA: "#888" };
    const c = map[fmt] || "#555";
    return { borderColor: c, color: c, background: "#fff" };
}
