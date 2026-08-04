import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/ki/Widersprueche.tsx
import React from "react";
import * as XLSX from "xlsx";
import { useProject } from "../../store/useProject";
import { apiUrl } from "../../lib/apiBase";
import { saveProjectLvPosition } from "../../api/projectLvCompat";
/* ================== UI helpers ================== */
const card = {
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16,
    background: "#FFFFFF",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};
const inp = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "9px 11px",
    fontSize: 13,
    color: "#0F172A",
    background: "#FFFFFF"
};
const button = {
    border: "1px solid #CBD5E1",
    borderRadius: 10,
    padding: "9px 12px",
    background: "#FFFFFF",
    color: "#0F172A",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer"
};
const tbl = {
    width: "100%",
    borderCollapse: "collapse"
};
const th = {
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: "1px solid #CBD5E1",
    whiteSpace: "nowrap",
    background: "#F8FAFC",
    color: "#334155",
    fontSize: 12,
    fontWeight: 700
};
const td = {
    padding: "9px 12px",
    borderBottom: "1px solid #E5E7EB",
    verticalAlign: "top",
    color: "#0F172A",
    fontSize: 13
};
function num(n) {
    return Number.isFinite(n) ?
        n.toLocaleString("de-DE", { maximumFractionDigits: 3 }) :
        "";
}
function toNumber(v) {
    if (v == null || v === "")
        return undefined;
    if (typeof v === "number")
        return Number.isFinite(v) ? v : undefined;
    const raw = String(v).trim();
    if (!raw)
        return undefined;
    const hasComma = raw.includes(",");
    const hasDot = raw.includes(".");
    let normalized = raw.replace(/\s/g, "");
    if (hasComma && hasDot) {
        normalized = normalized.replace(/\./g, "").replace(",", ".");
    }
    else if (hasComma) {
        normalized = normalized.replace(",", ".");
    }
    const n = Number(normalized);
    return Number.isFinite(n) ? n : undefined;
}
function authHeaders(extra) {
    let token = "";
    try {
        token =
            localStorage.getItem("token") ||
                localStorage.getItem("authToken") ||
                localStorage.getItem("accessToken") ||
                localStorage.getItem("rlc_token") ||
                "";
    }
    catch {
        // Browser-Speicher nicht verfügbar
    }
    return {
        ...(extra || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}
async function api(url, init) {
    const headers = new Headers(init?.headers || {});
    if (!headers.has("Content-Type") && init?.body) {
        headers.set("Content-Type", "application/json");
    }
    const res = await fetch(url, {
        ...init,
        headers
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
/* ================== Import helpers ================== */
function normalizeHeader(h) {
    const s = h.trim().toLowerCase();
    if (/^pos/.test(s) || s === "position" || s === "positionsnummer" || s === "nr")
        return "posNr";
    if (/kurz|kurztext|bezeichnung|beschreibung|langtext/.test(s))
        return "kurztext";
    if (/einheit|me|unit/.test(s))
        return "einheit";
    if (/menge|qty|anzahl|mengen?/.test(s))
        return "menge";
    if (/^ep$|einheitspreis|preis/.test(s))
        return "ep";
    return s;
}
function normalizeRow(r) {
    return {
        posNr: String(r.posNr || "").trim(),
        kurztext: String(r.kurztext || "").trim(),
        einheit: String(r.einheit || "").trim(),
        menge: toNumber(r.menge),
        ep: toNumber(r.ep)
    };
}
function rowFromObj(o) {
    const m = {};
    for (const [k, v] of Object.entries(o)) {
        const key = normalizeHeader(k);
        m[key] = v;
    }
    const pos = String(m.posNr ?? "").trim();
    if (!pos)
        return null;
    return normalizeRow({
        posNr: pos,
        kurztext: m.kurztext,
        einheit: m.einheit,
        menge: m.menge,
        ep: m.ep
    });
}
async function readXlsxOrCsv(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, {
        raw: false,
        defval: ""
    });
    const rows = [];
    for (const obj of json) {
        const r = rowFromObj(obj);
        if (r)
            rows.push(r);
    }
    return rows;
}
/* ================== Diff ================== */
function compare(lv, angebot) {
    const mapLV = new Map(lv.map((r) => [r.posNr, r]));
    const mapAG = new Map(angebot.map((r) => [r.posNr, r]));
    const allKeys = new Set([...mapLV.keys(), ...mapAG.keys()]);
    const diffs = [];
    for (const key of Array.from(allKeys).sort()) {
        const L = mapLV.get(key) || null;
        const A = mapAG.get(key) || null;
        if (L && !A) {
            diffs.push({
                posNr: key,
                lv: L,
                angebot: null,
                type: "missing_in_offer",
                details: ["Im Angebot fehlt diese Position."]
            });
            continue;
        }
        if (!L && A) {
            diffs.push({
                posNr: key,
                lv: null,
                angebot: A,
                type: "missing_in_lv",
                details: ["Im LV fehlt diese Position."]
            });
            continue;
        }
        const details = [];
        let type = "match";
        if ((L.kurztext || "").trim() !== (A.kurztext || "").trim()) {
            details.push("Kurztext unterschiedlich");
            type = "text_diff";
        }
        if ((L.einheit || "").trim() !== (A.einheit || "").trim()) {
            details.push(`Einheit: LV=${L.einheit || "—"} • Angebot=${A.einheit || "—"}`);
            if (type === "match")
                type = "unit_diff";
        }
        const dQty = (L.menge ?? 0) - (A.menge ?? 0);
        if (Math.abs(dQty) > 1e-6) {
            details.push(`Menge: LV=${num(L.menge)} • Angebot=${num(A.menge)} (Δ ${num(-dQty)})`);
            if (type === "match")
                type = "qty_diff";
        }
        const dEP = (L.ep ?? 0) - (A.ep ?? 0);
        if (Math.abs(dEP) > 1e-6) {
            details.push(`EP (netto): LV=${num(L.ep)} • Angebot=${num(A.ep)} (Δ ${num(-dEP)})`);
            if (type === "match")
                type = "price_diff";
        }
        diffs.push({
            posNr: key,
            lv: L,
            angebot: A,
            type,
            details
        });
    }
    return diffs;
}
function badge(t) {
    const base = {
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        display: "inline-block"
    };
    const map = {
        match: { background: "#eaf7ef", color: "#0a6b3a" },
        text_diff: { background: "#fff7ed", color: "#9a3412" },
        unit_diff: { background: "#fef9c3", color: "#a16207" },
        qty_diff: { background: "#fef9c3", color: "#a16207" },
        price_diff: { background: "#e0e7ff", color: "#3730a3" },
        missing_in_offer: { background: "#fee2e2", color: "#991b1b" },
        missing_in_lv: { background: "#fae8ff", color: "#6b21a8" }
    };
    const style = { ...base, ...(map[t] || {}) };
    const label = {
        match: "ok",
        text_diff: "Text",
        unit_diff: "Einheit",
        qty_diff: "Menge",
        price_diff: "Preis",
        missing_in_offer: "Fehlt im Angebot",
        missing_in_lv: "Fehlt im LV"
    };
    return _jsx("span", { className: rlcClass(null, style), children: label[t] });
}
/* ================== Component ================== */
export default function Widersprueche({ embedded = false }) {
    const projectCtx = useProject();
    const storeProjectId = projectCtx?.projectId ||
        projectCtx?.currentProjectId ||
        projectCtx?.currentProject?.id ||
        "";
    const projectCode = projectCtx?.projectCode ||
        projectCtx?.currentProject?.code ||
        "";
    const [projectInput, setProjectInput] = React.useState("");
    const [lv, setLV] = React.useState([]);
    const [ag, setAG] = React.useState([]);
    const [diffs, setDiffs] = React.useState([]);
    const [error, setError] = React.useState(null);
    const [serverStatus, setServerStatus] = React.useState("");
    const effectiveProjectId = projectInput.trim() || storeProjectId || projectCode || "";
    async function onLoadLV(files) {
        if (!files || !files[0])
            return;
        try {
            setLV(await readXlsxOrCsv(files[0]));
            setDiffs([]);
            setError(null);
        }
        catch (e) {
            setError(e?.message || "Fehler beim Import LV.");
        }
    }
    async function onLoadAG(files) {
        if (!files || !files[0])
            return;
        try {
            setAG(await readXlsxOrCsv(files[0]));
            setDiffs([]);
            setError(null);
        }
        catch (e) {
            setError(e?.message || "Fehler beim Import Angebot.");
        }
    }
    function runCompare() {
        if (!lv.length || !ag.length) {
            alert("Bitte beide Dateien (LV & Angebot) laden.");
            return;
        }
        setDiffs(compare(lv, ag));
    }
    function exportCSV() {
        if (!diffs.length) {
            alert("Kein Report vorhanden.");
            return;
        }
        const data = diffs.map((d) => ({
            PosNr: d.posNr,
            Typ: d.type,
            LV_Kurztext: d.lv?.kurztext ?? "",
            LV_Einheit: d.lv?.einheit ?? "",
            LV_Menge: d.lv?.menge ?? "",
            LV_EP: d.lv?.ep ?? "",
            Angebot_Kurztext: d.angebot?.kurztext ?? "",
            Angebot_Einheit: d.angebot?.einheit ?? "",
            Angebot_Menge: d.angebot?.menge ?? "",
            Angebot_EP: d.angebot?.ep ?? "",
            Details: d.details.join(" | ")
        }));
        const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(data), {
            FS: ";",
            RS: "\n"
        });
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `Widersprueche_${effectiveProjectId || "ohneProjekt"}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }
    function gotoNachtrag(prefill) {
        if (!effectiveProjectId) {
            alert("Bitte Projekt-ID eingeben.");
            return;
        }
        const payload = {
            projectId: effectiveProjectId,
            projectCode: projectCode || "",
            kurztext: prefill.kurztext ?? "",
            einheit: prefill.einheit ?? "",
            menge: prefill.menge ?? "",
            ep: prefill.ep ?? "",
            posNr: prefill.posNr ?? "",
            grund: "KI: Widerspruch/Abweichung erkannt"
        };
        const url = `/kalkulation/nachtraege?projectId=${encodeURIComponent(effectiveProjectId)}` +
            `&prefill=${encodeURIComponent(JSON.stringify(payload))}`;
        window.location.href = url;
    }
    async function updateLV(r) {
        if (!r)
            return;
        if (!effectiveProjectId) {
            alert("Bitte Projekt-ID eingeben.");
            return;
        }
        const payload = {
            projectId: effectiveProjectId,
            projectCode: projectCode || "",
            posNr: r.posNr,
            kurztext: r.kurztext,
            einheit: r.einheit,
            menge: r.menge ?? null,
            preis: r.ep ?? null,
            quelle: "KI-Vergleich"
        };
        try {
            const res = await saveProjectLvPosition(effectiveProjectId, payload);
            alert(`✅ LV aktualisiert (${res.updated ? "vorhandene Position" : "neu hinzugefügt"})`);
        }
        catch (e) {
            alert("❌ Update fehlgeschlagen: " + (e?.message || e));
        }
    }
    async function saveReportToServer() {
        if (!effectiveProjectId) {
            setServerStatus("Kein Projekt gewählt.");
            return;
        }
        try {
            setServerStatus("Speichere Prüfung auf Server …");
            const res = await fetch(apiUrl(`/api/kalkulation/storage/angebotspruefung/${encodeURIComponent(effectiveProjectId)}/save`), {
                method: "POST",
                credentials: "include",
                headers: authHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({
                    data: {
                        projectId: effectiveProjectId,
                        lv,
                        angebot: ag,
                        diffs,
                        savedAt: new Date().toISOString()
                    }
                })
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || json?.ok === false) {
                throw new Error(json?.error || `HTTP ${res.status}`);
            }
            setServerStatus("Prüfung auf Server gespeichert.");
        }
        catch (e) {
            setServerStatus(`Server-Speichern fehlgeschlagen: ${e?.message || e}`);
        }
    }
    async function loadReportFromServer() {
        if (!effectiveProjectId) {
            setServerStatus("Kein Projekt gewählt.");
            return;
        }
        try {
            setServerStatus("Lade Prüfung vom Server …");
            const res = await fetch(apiUrl(`/api/kalkulation/storage/angebotspruefung/${encodeURIComponent(effectiveProjectId)}`), { credentials: "include", headers: authHeaders() });
            const json = await res.json().catch(() => null);
            if (!res.ok || json?.ok === false) {
                throw new Error(json?.error || `HTTP ${res.status}`);
            }
            const data = json?.data || {};
            setLV(Array.isArray(data.lv) ? data.lv.map(normalizeRow) : []);
            setAG(Array.isArray(data.angebot) ? data.angebot.map(normalizeRow) : []);
            setDiffs(Array.isArray(data.diffs) ? data.diffs : []);
            setServerStatus(json?.exists ? "Prüfung vom Server geladen." : "Keine gespeicherte Prüfung gefunden.");
        }
        catch (e) {
            setServerStatus(`Server-Laden fehlgeschlagen: ${e?.message || e}`);
        }
    }
    return (_jsxs("div", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1057", children: [!embedded ? _jsx("h1", { children: "Widerspr\u00FCche im LV/Angebot" }) : null, _jsxs("div", { className: rlcClass(null, card), children: [_jsxs("div", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1058", children: [_jsxs("div", { children: [_jsx("div", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1059", children: "Projekt-ID" }), _jsx("input", { className: rlcClass(null, { ...inp, width: "100%" }), value: projectInput, onChange: (e) => setProjectInput(e.target.value), placeholder: "z. B. BA-2025-834" })] }), _jsx("div", {}), _jsxs("div", { children: [_jsx("div", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1060", children: "LV (CSV/XLSX)" }), _jsx("input", { type: "file", accept: ".xlsx,.xls,.csv", onChange: (e) => onLoadLV(e.target.files) }), _jsxs("div", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1061", children: ["Empfohlene Spalten: ", _jsx("code", { children: "PosNr, Kurztext, Einheit, Menge, EP" })] })] }), _jsxs("div", { children: [_jsx("div", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1062", children: "Angebot (CSV/XLSX)" }), _jsx("input", { type: "file", accept: ".xlsx,.xls,.csv", onChange: (e) => onLoadAG(e.target.files) })] })] }), _jsxs("div", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1063", children: ["Aktiv: ", effectiveProjectId || "kein Projekt gewählt"] }), _jsxs("div", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1064", children: [_jsx("button", { className: rlcClass(null, button), onClick: runCompare, disabled: !lv.length || !ag.length, children: "Vergleichen" }), _jsx("button", { className: rlcClass(null, button), onClick: exportCSV, disabled: !diffs.length, children: "Report exportieren (CSV)" }), _jsx("button", { className: rlcClass(null, button), onClick: saveReportToServer, disabled: !diffs.length || !effectiveProjectId, children: "Server speichern" }), _jsx("button", { className: rlcClass(null, button), onClick: loadReportFromServer, disabled: !effectiveProjectId, children: "Server laden" }), _jsxs("div", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1065", children: ["Geladen: LV ", lv.length, " Pos. \u2022 Angebot ", ag.length, " Pos."] })] }), error && _jsx("div", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1066", children: error }), serverStatus ? _jsx("div", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1067", children: serverStatus }) : null] }), !!diffs.length &&
                _jsxs("div", { className: rlcClass(null, card), children: [_jsx("h3", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1068", children: "Erkannte Widerspr\u00FCche" }), _jsxs("table", { className: rlcClass(null, tbl), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Pos" }), _jsx("th", { className: rlcClass(null, th), children: "Typ" }), _jsx("th", { className: rlcClass(null, th), children: "LV" }), _jsx("th", { className: rlcClass(null, th), children: "Angebot" }), _jsx("th", { className: rlcClass(null, th), children: "Details" }), _jsx("th", { className: rlcClass(null, th) })] }) }), _jsx("tbody", { children: diffs.map((d, i) => {
                                        const nachtragBase = d.angebot ?? d.lv;
                                        const canCreateNachtrag = (d.type === "missing_in_lv" ||
                                            d.type === "text_diff" ||
                                            d.type === "unit_diff" ||
                                            d.type === "qty_diff" ||
                                            d.type === "price_diff") &&
                                            !!nachtragBase;
                                        const canUpdateLv = d.type !== "missing_in_offer" && d.angebot != null;
                                        return (_jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, { ...td, fontWeight: 600 }), children: d.posNr }), _jsx("td", { className: rlcClass(null, td), children: badge(d.type) }), _jsx("td", { className: rlcClass(null, td), children: d.lv ?
                                                        _jsxs(_Fragment, { children: [_jsx("div", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1069", children: d.lv.kurztext }), _jsxs("div", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1070", children: [d.lv.einheit, " \u00B7 Menge ", num(d.lv.menge), " \u00B7 EP ", num(d.lv.ep)] })] }) :
                                                        _jsx("span", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1071", children: "\u2014" }) }), _jsx("td", { className: rlcClass(null, td), children: d.angebot ?
                                                        _jsxs(_Fragment, { children: [_jsx("div", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1072", children: d.angebot.kurztext }), _jsxs("div", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1073", children: [d.angebot.einheit, " \u00B7 Menge ", num(d.angebot.menge), " \u00B7 EP ", num(d.angebot.ep)] })] }) :
                                                        _jsx("span", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1074", children: "\u2014" }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("ul", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1075", children: d.details.map((x, k) => _jsx("li", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1076", children: x }, k)) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsxs("div", { className: "rlc-migrated-pages-ki-widersprueche-tsx-1077", children: [canCreateNachtrag && nachtragBase &&
                                                                _jsx("button", { className: rlcClass(null, button), onClick: () => gotoNachtrag(nachtragBase), children: "\u2192 Nachtrag erstellen" }), (() => {
                                                                const angebotRow = d.angebot ?? undefined;
                                                                if (d.type === "missing_in_offer" || !angebotRow)
                                                                    return null;
                                                                return (_jsx("button", { className: rlcClass(null, button), onClick: () => updateLV(angebotRow), children: "\u2192 LV aktualisieren" }));
                                                            })()] }) })] }, `${d.posNr}-${i}`));
                                    }) })] })] })] }));
}
