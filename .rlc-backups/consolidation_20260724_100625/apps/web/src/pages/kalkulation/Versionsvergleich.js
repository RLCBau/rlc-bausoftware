import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// apps/web/src/pages/kalkulation/Versionsvergleich.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
function getProjectId() {
    const p = new URLSearchParams(window.location.search).get("projectId");
    if (p && !isNaN(Number(p)))
        return Number(p);
    const ls = localStorage.getItem("rlc.currentProjectId");
    if (ls && !isNaN(Number(ls)))
        return Number(ls);
    return 0;
}
export default function VersionsvergleichPage() {
    const projectId = getProjectId();
    const [loading, setLoading] = useState(false);
    const [versions, setVersions] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [rows, setRows] = useState(null);
    const [serverVersions, setServerVersions] = useState([]);
    const [query, setQuery] = useState("");
    const fileInputRef = useRef(null);
    const fetchList = useCallback(async () => {
        if (!projectId)
            return;
        setLoading(true);
        try {
            const r = await fetch(`/api/versionsvergleich/list/${projectId}`);
            const j = await r.json();
            if (j?.ok)
                setVersions(j.versions);
            else
                setVersions(j.versions || []);
        }
        catch (e) {
            console.error(e);
        }
        finally {
            setLoading(false);
        }
    }, [projectId]);
    useEffect(() => {
        fetchList();
    }, [fetchList]);
    const onUploadFiles = useCallback(async (files) => {
        if (!files || !projectId)
            return;
        const fd = new FormData();
        fd.append("projectId", String(projectId));
        Array.from(files).forEach((f) => fd.append("files", f));
        setLoading(true);
        try {
            const r = await fetch(`/api/versionsvergleich/upload`, { method: "POST", body: fd });
            const j = await r.json();
            if (r.status === 501 && j?.error?.toString().toLowerCase().includes("gaeb")) {
                alert("GAEB-Parsing ist in dieser Build noch nicht aktiv. Bitte CSV/XLSX hochladen.");
            }
            else if (!r.ok) {
                alert(j?.error || "Fehler beim Upload");
            }
            await fetchList();
        }
        catch (e) {
            console.error(e);
            alert("Fehler beim Upload");
        }
        finally {
            setLoading(false);
            if (fileInputRef.current)
                fileInputRef.current.value = "";
        }
    }, [projectId, fetchList]);
    const toggleSelect = (id) => {
        setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].sort((a, b) => a - b));
    };
    const onCompare = useCallback(async () => {
        if (selectedIds.length < 2) {
            alert("Bitte mindestens zwei Versionen auswählen.");
            return;
        }
        setLoading(true);
        try {
            const r = await fetch(`/api/versionsvergleich/compare`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ versionIds: selectedIds }),
            });
            const j = await r.json();
            if (!r.ok) {
                alert(j?.error || "Fehler beim Vergleich");
                return;
            }
            setServerVersions(j.versions);
            setRows(j.rows);
        }
        catch (e) {
            console.error(e);
            alert("Fehler beim Vergleich");
        }
        finally {
            setLoading(false);
        }
    }, [selectedIds]);
    const exportExcel = useCallback(async () => {
        if (selectedIds.length < 2) {
            alert("Bitte mindestens zwei Versionen auswählen.");
            return;
        }
        try {
            const r = await fetch(`/api/versionsvergleich/export/excel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ versionIds: selectedIds }),
            });
            if (!r.ok) {
                const j = await r.json();
                alert(j?.error || "Fehler beim Excel-Export");
                return;
            }
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "Angebotsvergleich.xlsx";
            a.click();
            URL.revokeObjectURL(url);
        }
        catch (e) {
            console.error(e);
            alert("Fehler beim Excel-Export");
        }
    }, [selectedIds]);
    const exportPDF = useCallback(async () => {
        if (selectedIds.length < 2) {
            alert("Bitte mindestens zwei Versionen auswählen.");
            return;
        }
        try {
            const r = await fetch(`/api/versionsvergleich/export/pdf`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ versionIds: selectedIds }),
            });
            if (!r.ok) {
                const j = await r.json();
                alert(j?.error || "Fehler beim PDF-Export");
                return;
            }
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "Angebotsvergleich.pdf";
            a.click();
            URL.revokeObjectURL(url);
        }
        catch (e) {
            console.error(e);
            alert("Fehler beim PDF-Export");
        }
    }, [selectedIds]);
    /** ===== Filter (Suche im Tabellen-Body) ===== */
    const filteredRows = useMemo(() => {
        if (!rows || !query.trim())
            return rows;
        const q = query.trim().toLowerCase();
        return rows.filter((r) => {
            const a = (r.refPos ?? "").toString().toLowerCase();
            const b = (r.refKurztext ?? "").toString().toLowerCase();
            return a.includes(q) || b.includes(q);
        });
    }, [rows, query]);
    /** ===== Style helpers ===== */
    const computeMode = (vals) => {
        const map = new Map();
        vals.forEach((v) => {
            const k = String(v ?? "");
            map.set(k, { v, c: (map.get(k)?.c || 0) + 1 });
        });
        let best = null;
        for (const e of map.values())
            if (!best || e.c > best.c)
                best = e;
        return best?.v;
    };
    const table = useMemo(() => {
        if (!filteredRows || serverVersions.length === 0)
            return null;
        return (_jsx("div", { style: { border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }, children: _jsx("div", { style: { overflow: "auto", maxHeight: "65vh" }, children: _jsxs("table", { style: { borderCollapse: "separate", borderSpacing: 0, width: "100%" }, children: [_jsxs("thead", { style: {
                                position: "sticky",
                                top: 0,
                                background: "#f8fafc",
                                zIndex: 1,
                                borderBottom: "1px solid #e5e7eb",
                            }, children: [_jsxs("tr", { children: [_jsx("th", { style: th(140), children: "PosNr" }), _jsx("th", { style: th(360), children: "Kurztext" }), serverVersions.map((v) => (_jsx("th", { style: th(180), colSpan: 3, children: v.filename }, v.id)))] }), _jsxs("tr", { children: [_jsx("th", { style: th(140) }), _jsx("th", { style: th(360) }), serverVersions.map((v) => (_jsxs(React.Fragment, { children: [_jsx("th", { style: th(80), children: "Preis" }), _jsx("th", { style: th(60), children: "Menge" }), _jsx("th", { style: th(60), children: "ME" })] }, `sub-${v.id}`)))] })] }), _jsx("tbody", { children: filteredRows.map((r, idx) => {
                                const preisVals = r.versions.map((c) => c.preis ?? "");
                                const mengeVals = r.versions.map((c) => c.menge ?? "");
                                const ehVals = r.versions.map((c) => c.einheit ?? "");
                                const preisMode = computeMode(preisVals);
                                const mengeMode = computeMode(mengeVals);
                                const ehMode = computeMode(ehVals);
                                return (_jsxs("tr", { style: { background: idx % 2 ? "#fcfcfc" : "white" }, children: [_jsx("td", { style: td(140), title: r.refPos ?? "", children: r.refPos ?? "" }), _jsx("td", { style: td(360), title: r.refKurztext ?? "", children: (r.refKurztext ?? "").toString() }), r.versions.map((c, i) => {
                                            const preisEqualAll = r.flags.preisEqual;
                                            const mengeEqualAll = r.flags.mengeEqual;
                                            const ehEqualAll = r.flags.einheitEqual;
                                            const preisBad = !preisEqualAll && String(c.preis ?? "") !== String(preisMode ?? "");
                                            const mengeBad = !mengeEqualAll && String(c.menge ?? "") !== String(mengeMode ?? "");
                                            const ehBad = !ehEqualAll && String(c.einheit ?? "") !== String(ehMode ?? "");
                                            return (_jsxs(React.Fragment, { children: [_jsx("td", { style: tdColored(80, preisEqualAll ? "ok" : preisBad ? "bad" : "neutral"), children: c.preis ?? "" }), _jsx("td", { style: tdColored(60, mengeEqualAll ? "ok" : mengeBad ? "bad" : "neutral"), children: c.menge ?? "" }), _jsx("td", { style: tdColored(60, ehEqualAll ? "ok" : ehBad ? "bad" : "neutral"), children: c.einheit ?? "" })] }, `${r.key}-${i}`));
                                        })] }, r.key));
                            }) })] }) }) }));
    }, [filteredRows, serverVersions]);
    /** ===== Empty-State in DE, professionell ===== */
    if (!projectId) {
        return (_jsxs("div", { style: { padding: 24 }, children: [_jsx("h2", { style: { fontSize: 20, fontWeight: 600, color: "#111827", marginBottom: 12 }, children: "Versionsvergleich / Angebotsanalyse" }), _jsxs("div", { style: cardMuted, children: [_jsx("div", { style: { fontSize: 14, color: "#6b7280", marginBottom: 6 }, children: "Kein Projekt ausgew\u00E4hlt." }), _jsxs("div", { style: { fontSize: 14, color: "#4b5563" }, children: ["Bitte w\u00E4hle ein Projekt unter ", _jsx("b", { children: "\u201EProjekt ausw\u00E4hlen / erstellen\u201C" }), " oder \u00F6ffne diese Seite mit einem Link wie ", _jsx("code", { children: "?projectId=123" }), "."] })] })] }));
    }
    return (_jsxs("div", { style: wrap, children: [_jsx("div", { style: pageTitle, children: "Versionsvergleich / Angebotsanalyse" }), _jsxs("div", { style: toolbar, children: [_jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [_jsx("div", { style: { position: "relative" }, children: _jsx("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "Suche\u2026 (PosNr, Kurztext)", style: searchInput }) }), _jsxs("label", { style: btnSecondary, children: ["CSV/XLSX-Import", _jsx("input", { ref: fileInputRef, type: "file", accept: ".csv,.xlsx,.xls", multiple: true, onChange: (e) => onUploadFiles(e.target.files), style: { display: "none" } })] }), _jsx("button", { onClick: fetchList, style: btnSecondary, disabled: loading, children: "Aktualisieren" }), _jsxs("button", { onClick: onCompare, style: btnPrimary, disabled: loading || selectedIds.length < 2, children: ["Vergleichen (", selectedIds.length, ")"] }), _jsx("button", { onClick: exportExcel, style: btnGhost, disabled: selectedIds.length < 2, children: "CSV/Excel-Export" }), _jsx("button", { onClick: exportPDF, style: btnGhost, disabled: selectedIds.length < 2, children: "PDF-Export" })] }), _jsxs("div", { style: { fontSize: 12, color: "#6b7280" }, children: ["Projekt #", projectId, " \u2022 ", loading ? "Laden…" : rows ? `${filteredRows?.length ?? 0} Positionen` : `${versions.length} Versionen`] })] }), _jsxs("div", { style: { display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap" }, children: [_jsx("div", { style: { flex: "0 0 420px" }, children: _jsxs("div", { style: card, children: [_jsx("div", { style: { fontWeight: 600, marginBottom: 8 }, children: "Versionen" }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 340, overflow: "auto" }, children: [versions.map((v) => (_jsxs("label", { style: versionItem, children: [_jsx("input", { type: "checkbox", checked: selectedIds.includes(v.id), onChange: () => toggleSelect(v.id), style: { marginRight: 8 } }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr auto", width: "100%", gap: 8 }, children: [_jsxs("div", { style: { overflow: "hidden" }, children: [_jsx("div", { style: { fontWeight: 600, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }, children: v.filename }), _jsxs("div", { style: { fontSize: 12, color: "#6b7280" }, children: [new Date(v.createdAt).toLocaleString(), " \u2022 ", v.count ?? "-", " Pos."] })] }), _jsxs("div", { style: chip, children: ["#", v.id] })] })] }, v.id))), versions.length === 0 && _jsx("div", { style: { color: "#6b7280" }, children: "Keine Versionen vorhanden." })] })] }) }), _jsx("div", { style: { flex: "1 1 600px", minWidth: 480 }, children: rows ? (table) : (_jsxs("div", { style: cardMuted, children: [_jsx("div", { style: { fontWeight: 600, marginBottom: 6 }, children: "Noch kein Vergleich durchgef\u00FChrt" }), _jsxs("div", { style: { color: "#6b7280", fontSize: 14 }, children: ["W\u00E4hle links mindestens zwei Versionen aus und klicke ", _jsx("b", { children: "Vergleichen" }), "."] })] })) })] }), _jsx("div", { style: { fontSize: 12, color: "#6b7280" }, children: "Hinweis: Gr\u00FCn = alle Werte identisch; Rot = abweichender Wert gegen\u00FCber dem h\u00E4ufigsten Wert." })] }));
}
/** ===== Styles (angepasst an „Preise einfügen“) ===== */
const wrap = { padding: 24, display: "flex", flexDirection: "column", gap: 12 };
const pageTitle = { fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 6 };
const toolbar = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    border: "1px solid #e5e7eb",
    background: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
};
const searchInput = {
    width: 260,
    height: 36,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    outline: "none",
    padding: "0 10px",
    fontSize: 14,
};
const btnPrimary = {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
};
const btnSecondary = {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "white",
    color: "#111827",
    cursor: "pointer",
    fontWeight: 600,
};
const btnGhost = {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#f8fafc",
    color: "#111827",
    cursor: "pointer",
    fontWeight: 600,
};
const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 12,
    background: "white",
};
const cardMuted = {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 16,
    background: "#f8fafc",
};
const versionItem = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: 8,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "white",
};
const chip = {
    fontSize: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 999,
    padding: "2px 8px",
    color: "#374151",
};
function th(w) {
    return {
        position: "sticky",
        top: 36,
        background: "#f8fafc",
        textAlign: "left",
        padding: "10px 8px",
        fontSize: 12,
        borderBottom: "1px solid #e5e7eb",
        minWidth: w,
        maxWidth: w,
        zIndex: 1,
    };
}
function td(w) {
    return {
        padding: "8px",
        fontSize: 12,
        borderBottom: "1px solid #f1f5f9",
        minWidth: w,
        maxWidth: w,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    };
}
function tdColored(w, state) {
    const base = td(w);
    if (state === "ok")
        return { ...base, background: "#ecfdf5" }; // grünlich
    if (state === "bad")
        return { ...base, background: "#fef2f2" }; // rötlich
    return base;
}
