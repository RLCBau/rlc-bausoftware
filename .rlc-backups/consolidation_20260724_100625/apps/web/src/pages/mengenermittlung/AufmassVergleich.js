import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// apps/web/src/pages/mengenermittlung/SollIst.tsx
import React from "react";
import { useProject } from "../../store/useProject";
const API_BASE = import.meta?.env?.VITE_API_URL || "https://api.rlcbausoftware.com/api";
const fmtEUR = (v) => "€ " + (isFinite(v) ? v.toFixed(2) : "0.00");
const num = (v) => {
    if (v == null)
        return 0;
    const n = Number(String(v).replace(",", "."));
    return isFinite(n) ? n : 0;
};
const normPos = (s) => (s || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/^0+(\d)/, "$1"); // leva zeri iniziali singolarmente
/** Parser CSV minimale: separatore ; o , auto */
function parseCSV(text) {
    const rows = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
        const sep = l.includes(";") ? ";" : ",";
        return l
            .split(sep)
            .map((c) => c.replace(/^"(.*)"$/, "$1").trim());
    });
    if (rows.length === 0)
        return [];
    const looksHeader = rows[0].some((h) => /pos|kurz|text|einheit|soll|ist|ep/i.test(h));
    const data = looksHeader ? rows.slice(1) : rows;
    return data.map((cols) => {
        const [c0, c1, c2, c3, c4, c5] = cols;
        const obj = {};
        obj.pos =
            /[0-9]+\.[0-9]+/.test(c0) || /[0-9]{3,}/.test(c0) ? c0 : (c1 || c0);
        obj.text = c1 && c1 !== obj.pos ? c1 : c2;
        obj.unit = c2 && c2 !== obj.text ? c2 : c3;
        obj.soll = num(c3);
        obj.ist = num(c4);
        obj.ep = num(c5);
        return obj;
    });
}
/** Parser JSON (array di oggetti) */
function parseJSON(text) {
    try {
        const arr = JSON.parse(text);
        return Array.isArray(arr) ? arr : [];
    }
    catch {
        return [];
    }
}
/** Normalizza oggetto generico a Row */
function toRow(raw, kind) {
    return {
        pos: normPos(String(raw.pos ?? raw.Pos ?? raw.position ?? "")),
        text: raw.text ?? raw.kurztext ?? raw.Kurztext ?? "",
        unit: raw.unit ?? raw.einheit ?? raw.Einheit ?? "",
        soll: kind === "soll"
            ? num(raw.soll ?? raw.Soll ?? raw.lv ?? raw.LV ?? raw.menge)
            : undefined,
        ist: kind === "ist"
            ? num(raw.ist ?? raw.Ist ?? raw.abgerechnet ?? raw.menge)
            : undefined,
        ep: num(raw.ep ?? raw.EP ?? raw.einheitspreis),
    };
}
/** Merge per pos */
function joinRows(sollRows, istRows) {
    const map = new Map();
    sollRows.forEach((r) => {
        const key = r.pos;
        const ex = map.get(key) || { pos: key };
        map.set(key, { ...ex, ...r });
    });
    istRows.forEach((r) => {
        const key = r.pos;
        const ex = map.get(key) || { pos: key };
        map.set(key, { ...ex, ...r });
    });
    const out = [];
    map.forEach((r) => {
        const soll = num(r.soll);
        const ist = num(r.ist);
        const ep = num(r.ep);
        const diff = soll - ist;
        const base = soll !== 0 ? soll : Math.max(1, ist);
        const diffPct = base ? (diff / base) * 100 : 0;
        out.push({
            pos: r.pos,
            text: r.text || "",
            unit: r.unit || "",
            soll,
            ist,
            diff,
            diffPct,
            ep,
            totalSoll: soll * ep,
            totalIst: ist * ep,
        });
    });
    out.sort((a, b) => a.pos.localeCompare(b.pos, undefined, { numeric: true }));
    return out;
}
export default function SollIst() {
    const currentProject = useProject((s) => s.currentProject);
    const [sollSrc, setSollSrc] = React.useState("");
    const [istSrc, setIstSrc] = React.useState("");
    const [rows, setRows] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    const sumSoll = rows.reduce((s, r) => s + r.soll, 0);
    const sumIst = rows.reduce((s, r) => s + r.ist, 0);
    const sumDiff = sumSoll - sumIst;
    const sumTotSoll = rows.reduce((s, r) => s + r.totalSoll, 0);
    const sumTotIst = rows.reduce((s, r) => s + r.totalIst, 0);
    const parseAndJoin = React.useCallback(() => {
        const parse = (txt, kind) => {
            const t = txt.trim();
            if (!t)
                return [];
            const isJson = t.startsWith("[") || t.startsWith("{");
            const arr = isJson ? parseJSON(t) : parseCSV(t);
            return arr.map((o) => toRow(o, kind)).filter((r) => r.pos);
        };
        const sRows = parse(sollSrc, "soll");
        const iRows = parse(istSrc, "ist");
        setRows(joinRows(sRows, iRows));
    }, [sollSrc, istSrc]);
    React.useEffect(() => {
        parseAndJoin();
    }, [parseAndJoin]);
    const onFile = (kind, f) => {
        if (!f)
            return;
        f.text().then((t) => kind === "soll" ? setSollSrc(t) : setIstSrc(t));
    };
    const exportCsv = () => {
        const header = [
            "Pos",
            "Kurztext",
            "Einheit",
            "LV (Soll)",
            "Ist (Abgerechnet)",
            "Differenz",
            "Diff (%)",
            "EP (€)",
            "Gesamt Soll (€)",
            "Gesamt Ist (€)",
        ];
        const lines = rows.map((r) => [
            r.pos,
            r.text.replaceAll('"', '""'),
            r.unit,
            r.soll.toString().replace(".", ","),
            r.ist.toString().replace(".", ","),
            r.diff.toString().replace(".", ","),
            r.diffPct.toFixed(2).replace(".", ","),
            r.ep.toFixed(2).replace(".", ","),
            r.totalSoll.toFixed(2).replace(".", ","),
            r.totalIst.toFixed(2).replace(".", ","),
        ]);
        const csv = [header, ...lines]
            .map((a) => a.map((c) => `"${c}"`).join(";"))
            .join("\r\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "aufmass_vergleich.csv";
        a.click();
        URL.revokeObjectURL(a.href);
    };
    const tint = (diff) => {
        if (Math.abs(diff) < 1e-9)
            return "#eaf7ea"; // uguali
        if (diff > 0)
            return "#fff4e5"; // manca
        return "#fdecea"; // sopra Soll
    };
    const loadFromServer = async () => {
        if (!currentProject?.id)
            return;
        try {
            setLoading(true);
            setError(null);
            const res = await fetch(`${API_BASE}/aufmass/vergleich?projectId=${encodeURIComponent(currentProject.id)}`);
            const data = await res.json();
            if (!res.ok || data.ok === false) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            const sRows = (data.soll || []).map((o) => toRow(o, "soll"));
            const iRows = (data.ist || []).map((o) => toRow(o, "ist"));
            setRows(joinRows(sRows, iRows));
            // opzionale: mostri anche i dati grezzi nei textarea in formato JSON
            setSollSrc(JSON.stringify(data.soll || [], null, 2));
            setIstSrc(JSON.stringify(data.ist || [], null, 2));
        }
        catch (e) {
            console.error(e);
            setError(e?.message ?? "Fehler beim Laden vom Server");
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: "card", style: { padding: 10 }, children: [_jsxs("div", { style: {
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    marginBottom: 10,
                }, children: [_jsx("div", { style: { fontWeight: 700, fontSize: 16 }, children: "Aufma\u00DFvergleich: Soll\u2013Ist" }), currentProject && (_jsxs("div", { style: { fontSize: 12, opacity: 0.8 }, children: ["Projekt: ", _jsx("b", { children: currentProject.code }), " \u2013 ", currentProject.name] })), _jsx("div", { style: { flex: 1 } }), _jsx("button", { className: "btn", onClick: loadFromServer, disabled: !currentProject || loading, children: "Vom Server laden" }), _jsx("button", { className: "btn", onClick: exportCsv, children: "CSV exportieren" })] }), error && (_jsxs("div", { className: "card", style: {
                    marginBottom: 10,
                    padding: 8,
                    color: "#b00020",
                    fontSize: 13,
                }, children: ["Fehler: ", error] })), _jsx("div", { className: "card", style: { padding: 12, marginBottom: 12 }, children: _jsxs("div", { style: {
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 12,
                    }, children: [_jsxs("div", { children: [_jsx("div", { style: lbl, children: "LV (Soll) \u2013 Datei oder Text einf\u00FCgen" }), _jsxs("div", { style: {
                                        display: "flex",
                                        gap: 8,
                                        marginBottom: 6,
                                        alignItems: "center",
                                    }, children: [_jsx("input", { type: "file", onChange: (e) => onFile("soll", e.target.files?.[0] ?? null) }), _jsx("button", { className: "btn", type: "button", onClick: () => setSollSrc(""), children: "Leeren" })] }), _jsx("textarea", { value: sollSrc, onChange: (e) => setSollSrc(e.target.value), placeholder: `CSV oder JSON. Typische Spalten: pos;text;unit;soll;ep`, style: ta })] }), _jsxs("div", { children: [_jsx("div", { style: lbl, children: "Aufma\u00DF (Ist) \u2013 Datei oder Text einf\u00FCgen" }), _jsxs("div", { style: {
                                        display: "flex",
                                        gap: 8,
                                        marginBottom: 6,
                                        alignItems: "center",
                                    }, children: [_jsx("input", { type: "file", onChange: (e) => onFile("ist", e.target.files?.[0] ?? null) }), _jsx("button", { className: "btn", type: "button", onClick: () => setIstSrc(""), children: "Leeren" })] }), _jsx("textarea", { value: istSrc, onChange: (e) => setIstSrc(e.target.value), placeholder: `CSV oder JSON. Typische Spalten: pos;text;unit;ist;ep`, style: ta })] })] }) }), _jsx("div", { className: "card", style: { padding: 0, overflow: "auto" }, children: _jsxs("table", { style: {
                        width: "100%",
                        borderCollapse: "collapse",
                        minWidth: 800,
                    }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Pos." }), _jsx("th", { style: th, children: "Kurztext" }), _jsx("th", { style: th, children: "Einheit" }), _jsx("th", { style: th, children: "LV (Soll)" }), _jsx("th", { style: th, children: "Ist (Abgerechnet)" }), _jsx("th", { style: th, children: "Differenz" }), _jsx("th", { style: th, children: "Diff (%)" }), _jsx("th", { style: th, children: "EP (\u20AC)" }), _jsx("th", { style: th, children: "Gesamt Soll" }), _jsx("th", { style: th, children: "Gesamt Ist" })] }) }), _jsx("tbody", { children: rows.map((r) => (_jsxs("tr", { style: { background: tint(r.diff) }, children: [_jsx("td", { style: td, children: r.pos }), _jsx("td", { style: td, children: r.text }), _jsx("td", { style: td, children: r.unit }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: r.soll.toLocaleString(undefined, {
                                            maximumFractionDigits: 3,
                                        }) }), _jsx("td", { style: {
                                            ...td,
                                            whiteSpace: "nowrap",
                                            fontWeight: 700,
                                        }, children: r.ist.toLocaleString(undefined, {
                                            maximumFractionDigits: 3,
                                        }) }), _jsx("td", { style: {
                                            ...td,
                                            whiteSpace: "nowrap",
                                            fontWeight: 700,
                                        }, children: r.diff.toLocaleString(undefined, {
                                            maximumFractionDigits: 3,
                                        }) }), _jsxs("td", { style: td, children: [r.diffPct.toFixed(2), "%"] }), _jsx("td", { style: td, children: r.ep ? r.ep.toFixed(2) : "" }), _jsx("td", { style: td, children: r.ep ? fmtEUR(r.totalSoll) : "" }), _jsx("td", { style: td, children: r.ep ? fmtEUR(r.totalIst) : "" })] }, r.pos))) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { style: td, colSpan: 3 }), _jsx("td", { style: { ...td, fontWeight: 700 }, children: sumSoll.toLocaleString(undefined, {
                                            maximumFractionDigits: 3,
                                        }) }), _jsx("td", { style: { ...td, fontWeight: 700 }, children: sumIst.toLocaleString(undefined, {
                                            maximumFractionDigits: 3,
                                        }) }), _jsx("td", { style: { ...td, fontWeight: 700 }, children: sumDiff.toLocaleString(undefined, {
                                            maximumFractionDigits: 3,
                                        }) }), _jsx("td", { style: td }), _jsx("td", { style: { ...td, fontWeight: 700 }, children: "Summe" }), _jsx("td", { style: { ...td, fontWeight: 700 }, children: fmtEUR(sumTotSoll) }), _jsx("td", { style: { ...td, fontWeight: 700 }, children: fmtEUR(sumTotIst) })] }) })] }) }), loading && (_jsx("div", { style: { marginTop: 8, fontSize: 12 }, children: "Laden\u2026" }))] }));
}
/* Stili coerenti con le altre pagine (AufmassEditor) */
const th = {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
    whiteSpace: "nowrap",
};
const td = {
    padding: "6px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
    verticalAlign: "middle",
};
const lbl = {
    fontSize: 13,
    opacity: 0.8,
    marginBottom: 4,
};
const ta = {
    width: "100%",
    height: 140,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
    fontSize: 12,
    lineHeight: 1.35,
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "8px 10px",
};
