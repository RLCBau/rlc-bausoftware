import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// apps/web/src/pages/mengenermittlung/PositionLV.tsx
import React from "react";
import { useProject } from "../../store/useProject";
import { useNavigate } from "react-router-dom";
const API = import.meta?.env?.VITE_API_URL ||
    import.meta?.env?.VITE_BACKEND_URL ||
    "https://api.rlcbausoftware.com";
const fmtEUR = (v) => "€ " + (isFinite(v) ? v.toFixed(2) : "0.00");
/** parser semplice per formule (tipo 3*2, (12+3)/5, 2/10, 2+1…) */
function calc(formula) {
    const cleaned = (formula || "")
        .replace(/,/g, ".")
        .replace(/[^\d+\-*/().\s]/g, "");
    if (!cleaned.trim())
        return 0;
    try {
        // eslint-disable-next-line no-new-func
        const f = new Function(`return (${cleaned});`);
        const v = Number(f());
        return isFinite(v) ? v : 0;
    }
    catch {
        return 0;
    }
}
const AUFMASS = {
    load(projectId) {
        if (!projectId)
            return [];
        try {
            const key = `RLC_AUFMASS_${projectId}`;
            const raw = localStorage.getItem(key);
            if (!raw)
                return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed))
                return [];
            return parsed;
        }
        catch {
            return [];
        }
    },
};
function posLvStorageKey(projectKey) {
    return `RLC_POSITIONLV_${projectKey}`;
}
function loadPosLvPersist(projectKey) {
    try {
        const raw = localStorage.getItem(posLvStorageKey(projectKey));
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function savePosLvPersist(projectKey, items) {
    try {
        localStorage.setItem(posLvStorageKey(projectKey), JSON.stringify(items));
    }
    catch {
        // ignore
    }
}
function toAufmassJson(rows) {
    return rows.map((r) => ({
        pos: String(r.pos ?? ""),
        text: String(r.text ?? ""),
        unit: String(r.unit ?? "m"),
        soll: Number(r.soll || 0),
        ist: Number(r.ist || 0),
        ep: Number(r.ep || 0),
    }));
}
/* ---- stili coerenti con AufmassEditor ---- */
const pageContainer = {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "1.5rem 1.75rem 2rem",
};
const card = {
    background: "#FFFFFF",
    borderRadius: 12,
    border: "1px solid #E5E7EB",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
    padding: "1.25rem 1.5rem 1.5rem",
};
const toolbar = {
    display: "flex",
    gap: 8,
    padding: "6px 10px 10px",
    borderBottom: "1px solid #E5E7EB",
    alignItems: "center",
};
const btn = {
    fontSize: "0.8rem",
    borderRadius: 999,
    padding: "0.35rem 0.9rem",
    border: "1px solid #D1D5DB",
    background: "#F9FAFB",
    color: "#374151",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
};
const btnPrimary = {
    ...btn,
    background: "#2563EB",
    borderColor: "#1D4ED8",
    color: "#FFFFFF",
    fontWeight: 500,
};
const th = {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "1px solid #E5E7EB",
    fontSize: 13,
    whiteSpace: "nowrap",
    background: "#F9FAFB",
    color: "#4B5563",
};
const td = {
    padding: "6px 10px",
    borderBottom: "1px solid #E5E7EB",
    fontSize: 13,
    verticalAlign: "middle",
};
const lbl = { fontSize: 13, opacity: 0.8 };
const inpBase = {
    border: "1px solid #D1D5DB",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 13,
};
const inpNarrow = { ...inpBase, width: 140 };
const inpWide = { ...inpBase, width: "100%" };
/* modal base */
const modalWrap = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.35)",
    zIndex: 999,
    display: "grid",
    placeItems: "center",
    padding: 20,
};
const modalBox = {
    background: "#fff",
    color: "#111",
    border: "1px solid #E5E7EB",
    borderRadius: 10,
    width: "min(900px,95vw)",
    maxHeight: "80vh",
    padding: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,.2)",
};
const modalTextarea = {
    width: "100%",
    height: "40vh",
    resize: "vertical",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
    fontSize: 14,
    lineHeight: 1.4,
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    padding: 10,
};
async function fetchJsonOrThrow(url) {
    const res = await fetch(url);
    if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status} ${res.statusText}`);
    }
    return res.json().catch(() => ({}));
}
/**
 * Robust LV loader:
 * - prova più endpoint (per evitare 404 se cambia la route)
 * - accetta più formati di risposta (items / lv / array diretto)
 */
async function loadProjectLvAny(apiBase, projectId, projectKey) {
    const tries = [
        `${apiBase}/api/project-lv/${encodeURIComponent(projectId)}`, // atteso
        `${apiBase}/api/lv/project-lv/${encodeURIComponent(projectId)}`, // fallback 1
        `${apiBase}/api/lv/project/${encodeURIComponent(projectId)}`, // fallback 2
        `${apiBase}/api/lv/${encodeURIComponent(projectId)}`, // fallback 3
        `${apiBase}/api/project-lv?projectId=${encodeURIComponent(projectId)}`, // fallback 4
        projectKey
            ? `${apiBase}/api/project-lv/${encodeURIComponent(projectKey)}`
            : "", // fallback 5 (se backend usa code)
    ].filter(Boolean);
    let lastErr = null;
    for (const url of tries) {
        try {
            const data = await fetchJsonOrThrow(url);
            const list = Array.isArray(data?.items)
                ? data.items
                : Array.isArray(data?.lv)
                    ? data.lv
                    : Array.isArray(data?.rows)
                        ? data.rows
                        : Array.isArray(data?.positions)
                            ? data.positions
                            : Array.isArray(data)
                                ? data
                                : [];
            // se endpoint risponde ma lista è vuota, lo accettiamo comunque
            return list;
        }
        catch (e) {
            lastErr = e;
            // prova prossimo
        }
    }
    throw new Error(`LV konnte nicht geladen werden (kein gültiger Endpoint). Letzter Fehler: ${lastErr?.message || String(lastErr || "")}`);
}
export default function PositionLV() {
    const { getSelectedProject } = useProject();
    const project = getSelectedProject();
    // DB-ID (per /api/project-lv/:id)
    const projectId = project?.id ?? null;
    // FS-Key (stessa logica degli altri): preferisci code, fallback id
    const projectKey = (project?.code || project?.id || "").trim();
    const navigate = useNavigate();
    const [rows, setRows] = React.useState([]);
    const [selId, setSelId] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    // modal formula
    const [fOpen, setFOpen] = React.useState(false);
    const [fBuffer, setFBuffer] = React.useState("");
    // modal beschreibung
    const [nOpen, setNOpen] = React.useState(false);
    const [nBuffer, setNBuffer] = React.useState("");
    // Modal KI-Analyse (reale logica: filtra posizioni "auffällig")
    const [analysisOpen, setAnalysisOpen] = React.useState(false);
    const [analysisList, setAnalysisList] = React.useState([]);
    // Busy per salvataggio/caricamento server (aufmass.json)
    const [syncBusy, setSyncBusy] = React.useState(false);
    const selected = rows.find((r) => r.id === selId) ?? null;
    const patch = (id, p) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));
    /* ===== Server: aufmass.json (project root) ===== */
    async function serverLoadAufmass() {
        if (!projectKey)
            return [];
        const url = `${API}/api/aufmass/aufmass/${encodeURIComponent(projectKey)}`;
        const res = await fetch(url);
        if (!res.ok)
            return [];
        const data = await res.json().catch(() => ({}));
        return Array.isArray(data?.rows) ? data.rows : [];
    }
    async function serverSaveAufmass(rowsToSave) {
        if (!projectKey)
            throw new Error("project mancante");
        const url = `${API}/api/aufmass/aufmass/${encodeURIComponent(projectKey)}`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows: rowsToSave }),
        });
        if (!res.ok) {
            const txt = await res.text().catch(() => "");
            throw new Error(txt || `Server-Fehler (${res.status})`);
        }
    }
    /* ===== helper: build rows = LV (DB) + aufmass.json extras + persist (formula/note) ===== */
    const buildMergedRows = React.useCallback((lvItems, aufmassServer) => {
        const persist = projectKey ? loadPosLvPersist(projectKey) : [];
        const persistMap = new Map();
        persist.forEach((p) => {
            const k = String(p.pos || "").trim();
            if (k)
                persistMap.set(k, p);
        });
        const srvMap = new Map();
        aufmassServer.forEach((r) => {
            const k = String(r.pos || "").trim();
            if (k)
                srvMap.set(k, r);
        });
        // 1) LV items (DB) come base
        const mapped = lvItems.map((p, idx) => {
            const pos = String(p.pos ?? p.position ?? p.posNr ?? p.nr ?? p.positionsnummer ?? idx).trim();
            const srv = srvMap.get(pos);
            const persisted = persistMap.get(pos);
            const text = String(srv?.text ??
                p.text ??
                p.kurztext ??
                p.title ??
                p.langtext ??
                "ohne Text");
            const unit = String(srv?.unit ?? p.unit ?? p.einheit ?? p.me ?? "m");
            const soll = Number(srv?.soll ?? p.soll ?? p.quantity ?? p.menge ?? 0);
            const ep = Number(srv?.ep ?? p.ep ?? p.einheitspreis ?? p.price ?? 0);
            const ist = Number(srv?.ist ?? 0);
            return {
                id: String(p.id ?? idx),
                pos,
                text,
                unit,
                soll,
                ep,
                ist,
                formula: String(persisted?.formula ?? ""),
                note: String(persisted?.note ?? ""),
            };
        });
        const seen = new Set(mapped.map((r) => String(r.pos || "").trim()));
        // 2) EXTRA: posizioni presenti in aufmass.json ma NON nel LV DB
        const extras = [];
        for (const r of aufmassServer) {
            const pos = String(r.pos || "").trim();
            if (!pos)
                continue;
            if (seen.has(pos))
                continue;
            const persisted = persistMap.get(pos);
            extras.push({
                id: `AUF_${pos}`,
                pos,
                text: String(r.text ?? ""),
                unit: String(r.unit ?? "m"),
                soll: Number(r.soll ?? 0),
                ep: Number(r.ep ?? 0),
                ist: Number(r.ist ?? 0),
                formula: String(persisted?.formula ?? ""),
                note: String(persisted?.note ?? ""),
            });
        }
        // 3) Fallback legacy localStorage
        if (!aufmassServer.length && projectId) {
            const aufmassLocal = AUFMASS.load(projectId);
            if (aufmassLocal.length) {
                const localMap = new Map();
                for (const a of aufmassLocal) {
                    const k = String(a.pos || "").trim();
                    if (!k)
                        continue;
                    localMap.set(k, (localMap.get(k) ?? 0) + (a.ist ?? 0));
                }
                for (const m of mapped) {
                    const hit = localMap.get(String(m.pos || "").trim());
                    if (hit && !m.ist)
                        m.ist = hit;
                }
                for (const a of aufmassLocal) {
                    const pos = String(a.pos || "").trim();
                    if (!pos)
                        continue;
                    if (seen.has(pos))
                        continue;
                    const persisted = persistMap.get(pos);
                    extras.push({
                        id: `LOCAL_${pos}`,
                        pos,
                        text: String(a.text ?? ""),
                        unit: String(a.unit ?? "m"),
                        soll: Number(a.soll ?? 0),
                        ep: Number(a.ep ?? 0),
                        ist: Number(a.ist ?? 0),
                        formula: String(persisted?.formula ?? ""),
                        note: String(persisted?.note ?? ""),
                    });
                }
            }
        }
        extras.sort((a, b) => (a.pos < b.pos ? -1 : a.pos > b.pos ? 1 : 0));
        return [...mapped, ...extras];
    }, [projectId, projectKey]);
    /* ===== LV + Aufmaß laden und verknüpfen ===== */
    const reloadAll = React.useCallback(async () => {
        if (!projectId) {
            setRows([]);
            setSelId(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            // 1) LV vom Server (DB) - robust (multi endpoint + multi response shape)
            const items = await loadProjectLvAny(API, projectId, projectKey);
            // 2) Aufmaß: server project root
            let aufmassServer = [];
            try {
                aufmassServer = await serverLoadAufmass();
            }
            catch {
                aufmassServer = [];
            }
            const merged = buildMergedRows(items, aufmassServer);
            setRows(merged);
            setSelId((prev) => {
                if (prev && merged.some((r) => r.id === prev))
                    return prev;
                return merged[0]?.id ?? null;
            });
        }
        catch (e) {
            console.error(e);
            setError(e?.message || "Fehler beim Laden des LV");
            setRows([]);
            setSelId(null);
        }
        finally {
            setLoading(false);
        }
    }, [projectId, projectKey, buildMergedRows]);
    React.useEffect(() => {
        void reloadAll();
    }, [reloadAll]);
    /* ===== persist locale formula/note quando rows cambiano ===== */
    React.useEffect(() => {
        if (!projectKey)
            return;
        try {
            const compact = rows.map((r) => ({
                pos: r.pos,
                formula: r.formula ?? "",
                note: r.note ?? "",
            }));
            savePosLvPersist(projectKey, compact);
        }
        catch {
            // ignore
        }
    }, [rows, projectKey]);
    // calcolo ist a partire dalla formula (solo UI, non sostituisce server finché non salvi)
    const applyFormula = (id, formula) => {
        const ist = calc(formula);
        patch(id, { formula, ist });
    };
    // EP/Soll edit
    const onEP = (id, v) => patch(id, { ep: Number(v.replace(",", ".")) || 0 });
    const onSoll = (id, v) => patch(id, { soll: Number(v.replace(",", ".")) || 0 });
    // export CSV
    const exportCsv = () => {
        const head = [
            "Pos",
            "Kurztext",
            "Einheit",
            "LV (Soll)",
            "Ist (Abgerechnet)",
            "Differenz (Soll–Ist)",
            "EP (€)",
            "Gesamt (€)",
            "Beschreibung",
        ];
        const lines = rows.map((r) => {
            const diff = r.soll - r.ist;
            const total = r.ist * r.ep;
            return [
                r.pos,
                r.text.replaceAll('"', '""'),
                r.unit,
                String(r.soll).replace(".", ","),
                String(r.ist).replace(".", ","),
                String(diff).replace(".", ","),
                String(r.ep).replace(".", ","),
                String(total.toFixed(2)).replace(".", ","),
                (r.note ?? "").replaceAll('"', '""'),
            ];
        });
        const csv = [head, ...lines]
            .map((r) => r.map((c) => `"${c}"`).join(";"))
            .join("\r\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "position-lv.csv";
        a.click();
        URL.revokeObjectURL(a.href);
    };
    // totali
    const totalAbgerechnet = rows.reduce((s, r) => s + r.ist * r.ep, 0);
    const lvSumme = rows.reduce((s, r) => s + r.soll * r.ep, 0);
    // colori riga in base alla differenza
    const tint = (r, active) => {
        const diff = r.soll - r.ist;
        let bg = diff === 0 ? "#ECFDF3" : diff > 0 ? "#FEF3C7" : "#FEE2E2";
        if (active)
            bg = diff === 0 ? "#DCFCE7" : diff > 0 ? "#FEF9C3" : "#FECACA";
        return { background: bg };
    };
    // KI-Analyse "reale": filtra posizioni con Auffälligkeiten
    const handleKiAnalyse = () => {
        const auffaellig = rows.filter((r) => {
            if (r.ist === 0 && r.soll > 0)
                return true;
            const diff = Math.abs(r.soll - r.ist);
            if (r.soll > 0 && diff / r.soll > 0.2)
                return true;
            return false;
        });
        setAnalysisList(auffaellig);
        setAnalysisOpen(true);
    };
    /* ===== Server Save/Load (scrive un file JSON in data/projects/<projectKey>/aufmass.json) ===== */
    const handleServerSave = async () => {
        if (!projectKey) {
            alert("Kein Projekt gewählt.");
            return;
        }
        if (syncBusy)
            return;
        setSyncBusy(true);
        try {
            await serverSaveAufmass(toAufmassJson(rows));
            alert(`Gespeichert (Server) • ${rows.length} Position(en)`);
        }
        catch (e) {
            console.error(e);
            alert(`Server-Fehler beim Speichern:\n${e?.message || "Unbekannter Fehler"}`);
        }
        finally {
            setSyncBusy(false);
        }
    };
    const handleServerLoad = async () => {
        if (!projectKey) {
            alert("Kein Projekt gewählt.");
            return;
        }
        if (syncBusy)
            return;
        setSyncBusy(true);
        try {
            await reloadAll();
            alert("Geladen (Server)");
        }
        catch (e) {
            console.error(e);
            alert(`Server-Fehler beim Laden:\n${e?.message || "Unbekannter Fehler"}`);
        }
        finally {
            setSyncBusy(false);
        }
    };
    // scorciatoie tastiera nei modal
    React.useEffect(() => {
        const onKey = (e) => {
            if (fOpen &&
                (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey)))) {
                e.preventDefault();
                if (!selected)
                    return;
                if (e.key === "Escape")
                    setFOpen(false);
                else {
                    applyFormula(selected.id, fBuffer);
                    setFOpen(false);
                }
            }
            if (nOpen &&
                (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey)))) {
                e.preventDefault();
                if (!selected)
                    return;
                if (e.key === "Escape")
                    setNOpen(false);
                else {
                    patch(selected.id, { note: nBuffer });
                    setNOpen(false);
                }
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [fOpen, nOpen, fBuffer, nBuffer, selected]);
    return (_jsxs("div", { style: pageContainer, children: [_jsxs("div", { style: { marginBottom: 14 }, children: [_jsx("div", { style: { fontSize: 12, color: "#6B7280", marginBottom: 4 }, children: "RLC / 2. Mengenermittlung / Nach Position" }), _jsx("div", { style: { fontSize: 18, fontWeight: 600, color: "#111827" }, children: "Mengenermittlung nach Position (LV-\u00DCberblick)" }), project && (_jsxs("div", { style: { marginTop: 2, fontSize: 13, color: "#4B5563" }, children: [_jsx("b", { children: project.code }), " \u2014 ", project.name, project.client ? ` • ${project.client}` : "", project.place ? ` • ${project.place}` : ""] }))] }), _jsxs("section", { style: card, children: [_jsxs("div", { style: toolbar, children: [_jsx("div", { style: { fontWeight: 600, fontSize: 13 }, children: "LV-gest\u00FCtzte Mengenermittlung (Soll\u2013Ist Vergleich)" }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { style: btn, type: "button", onClick: () => navigate("/mengenermittlung/aufmasseditor"), children: "Zum Aufma\u00DF-Editor" }), _jsx("button", { style: btn, type: "button", onClick: exportCsv, children: "CSV exportieren" }), _jsx("button", { style: btn, type: "button", onClick: () => void handleServerLoad(), disabled: !projectKey || syncBusy, title: !projectKey ? "Kein Projekt" : syncBusy ? "..." : "Server laden", children: syncBusy ? "…" : "Server laden" }), _jsx("button", { style: btnPrimary, type: "button", onClick: () => void handleServerSave(), disabled: !projectKey || syncBusy, title: !projectKey ? "Kein Projekt" : syncBusy ? "..." : "Server speichern", children: syncBusy ? "…" : "Server speichern" }), _jsx("button", { style: btnPrimary, type: "button", onClick: handleKiAnalyse, disabled: !rows.length, children: "KI LV analysieren" })] }), _jsxs("div", { style: {
                            display: "grid",
                            gridTemplateRows: "minmax(220px, 44vh) auto",
                            gap: 10,
                            paddingTop: 10,
                        }, children: [_jsx("div", { style: {
                                    borderRadius: 10,
                                    border: "1px solid #E5E7EB",
                                    overflow: "auto",
                                }, children: loading ? (_jsx("div", { style: { padding: "0.75rem 0.9rem", fontSize: 13 }, children: "LV wird geladen \u2026" })) : error ? (_jsx("div", { style: {
                                        padding: "0.75rem 0.9rem",
                                        fontSize: 13,
                                        color: "#B91C1C",
                                        background: "#FEF2F2",
                                    }, children: error })) : rows.length === 0 ? (_jsx("div", { style: {
                                        padding: "0.75rem 0.9rem",
                                        fontSize: 13,
                                        color: "#6B7280",
                                    }, children: "F\u00FCr dieses Projekt wurden noch keine Positionen gefunden." })) : (_jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Pos." }), _jsx("th", { style: th, children: "Kurztext" }), _jsx("th", { style: th, children: "Einheit" }), _jsx("th", { style: th, children: "LV (Soll)" }), _jsx("th", { style: th, children: "Ist (Abgerechnet)" }), _jsx("th", { style: th, children: "Differenz (Soll\u2013Ist)" }), _jsx("th", { style: th, children: "EP (\u20AC)" }), _jsx("th", { style: th, children: "Gesamt" })] }) }), _jsx("tbody", { children: rows.map((r) => {
                                                const active = r.id === selId;
                                                const diff = r.soll - r.ist;
                                                const total = r.ist * r.ep;
                                                return (_jsxs("tr", { onClick: () => setSelId(r.id), style: { cursor: "pointer", ...tint(r, active) }, children: [_jsx("td", { style: td, children: r.pos }), _jsx("td", { style: td, children: _jsx("input", { type: "text", value: r.text, onChange: (e) => patch(r.id, { text: e.target.value }), style: inpWide }) }), _jsx("td", { style: td, children: _jsx("input", { type: "text", value: r.unit, onChange: (e) => patch(r.id, { unit: e.target.value }), style: inpNarrow }) }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: r.soll.toLocaleString("de-DE", {
                                                                maximumFractionDigits: 3,
                                                            }) }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: _jsx("b", { children: r.ist.toLocaleString("de-DE", {
                                                                    maximumFractionDigits: 3,
                                                                }) }) }), _jsx("td", { style: { ...td, fontWeight: 700, whiteSpace: "nowrap" }, children: diff.toLocaleString("de-DE", {
                                                                maximumFractionDigits: 3,
                                                            }) }), _jsx("td", { style: td, children: _jsx("input", { type: "number", step: "0.01", value: r.ep, onChange: (e) => onEP(r.id, e.target.value), style: inpNarrow }) }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: fmtEUR(total) })] }, r.id));
                                            }) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsxs("td", { style: { ...td, fontWeight: 700 }, colSpan: 4, children: ["LV-Summe: ", fmtEUR(lvSumme)] }), _jsxs("td", { style: { ...td, fontWeight: 700 }, colSpan: 4, children: ["Summe Total Abgerechnet: ", fmtEUR(totalAbgerechnet)] })] }) })] })) }), _jsx("div", { style: {
                                    borderRadius: 10,
                                    border: "1px solid #E5E7EB",
                                    padding: 12,
                                }, children: !selected ? (_jsx("div", { style: { opacity: 0.7 }, children: "W\u00E4hle oben eine Position aus." })) : (_jsxs("div", { style: {
                                        display: "grid",
                                        gridTemplateColumns: "130px 1fr 130px 1fr",
                                        gap: 10,
                                        alignItems: "start",
                                    }, children: [_jsx("label", { style: lbl, children: "Pos." }), _jsx("input", { type: "text", value: selected.pos, onChange: (e) => patch(selected.id, { pos: e.target.value }), style: inpNarrow }), _jsx("label", { style: lbl, children: "Einheit" }), _jsx("input", { type: "text", value: selected.unit, onChange: (e) => patch(selected.id, { unit: e.target.value }), style: inpNarrow }), _jsx("label", { style: lbl, children: "Kurztext" }), _jsx("input", { type: "text", value: selected.text, onChange: (e) => patch(selected.id, { text: e.target.value }), style: { ...inpWide, gridColumn: "2 / span 3" } }), _jsx("label", { style: lbl, children: "LV (Soll)" }), _jsx("input", { type: "number", step: "0.001", value: selected.soll, onChange: (e) => onSoll(selected.id, e.target.value), style: inpNarrow }), _jsx("label", { style: lbl, children: "Menge (Formel)" }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("input", { type: "text", value: selected.formula, onFocus: () => {
                                                        setFBuffer(selected.formula ?? "");
                                                        setFOpen(true);
                                                    }, readOnly: true, placeholder: "Doppelklick/Focus \u2192 Editor", style: { ...inpWide, cursor: "pointer" } }), _jsx("button", { style: btn, type: "button", onClick: () => {
                                                        setFBuffer(selected.formula ?? "");
                                                        setFOpen(true);
                                                    }, children: "\u2197\uFE0E Editor" })] }), _jsx("label", { style: lbl, children: "Ist (Abgerechnet)" }), _jsx("div", { style: { fontWeight: 700 }, children: selected.ist.toLocaleString("de-DE", {
                                                maximumFractionDigits: 3,
                                            }) }), _jsx("label", { style: lbl, children: "EP (\u20AC)" }), _jsx("input", { type: "number", step: "0.01", value: selected.ep, onChange: (e) => onEP(selected.id, e.target.value), style: inpNarrow }), _jsx("label", { style: lbl, children: "Beschreibung" }), _jsxs("div", { style: { gridColumn: "2 / span 3" }, children: [_jsx("div", { onClick: () => {
                                                        setNBuffer(selected.note ?? "");
                                                        setNOpen(true);
                                                    }, title: "Editor \u00F6ffnen", style: {
                                                        ...inpWide,
                                                        minHeight: 38,
                                                        padding: "8px 10px",
                                                        cursor: "pointer",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                        background: "#F9FAFB",
                                                    }, children: selected.note && selected.note.trim()
                                                        ? selected.note
                                                        : "z. B. Asphalt im Bereich Nord (klicken für Editor)" }), _jsx("div", { style: { marginTop: 6 }, children: _jsx("button", { style: btn, type: "button", onClick: () => {
                                                            setNBuffer(selected.note ?? "");
                                                            setNOpen(true);
                                                        }, children: "Beschreibung bearbeiten" }) })] }), _jsx("label", { style: lbl, children: "Gesamt (\u20AC)" }), _jsx("div", { style: { fontWeight: 700 }, children: fmtEUR(selected.ist * selected.ep) }), _jsxs("div", { style: {
                                                gridColumn: "1 / -1",
                                                opacity: 0.7,
                                                marginTop: 6,
                                                fontSize: 12,
                                            }, children: ["Tipp: In ", _jsx("b", { children: "Menge (Formel)" }), " kannst du Rechenausdr\u00FCcke eingeben:", " ", _jsx("code", { children: "3*2" }), ", ", _jsx("code", { children: "(12+3)/5" }), ", ", _jsx("code", { children: "2/10" }), ",", " ", _jsx("code", { children: "2+1" }), " \u2026"] })] })) })] })] }), fOpen && selected && (_jsx("div", { style: modalWrap, onMouseDown: (e) => e.target === e.currentTarget && setFOpen(false), children: _jsxs("div", { style: modalBox, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "Formel bearbeiten" }), _jsx("textarea", { style: modalTextarea, value: fBuffer, onChange: (e) => setFBuffer(e.target.value), autoFocus: true, placeholder: "Schreibe hier die Formel\u2026" }), _jsxs("div", { style: {
                                display: "flex",
                                justifyContent: "space-between",
                                marginTop: 10,
                                fontSize: 12,
                            }, children: [_jsxs("div", { style: { opacity: 0.7 }, children: ["Tastatur: ", _jsx("b", { children: "Ctrl/\u2318 + Enter" }), " speichert, ", _jsx("b", { children: "Esc" }), " schlie\u00DFt"] }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("button", { style: btn, onClick: () => setFOpen(false), type: "button", children: "Abbrechen" }), _jsx("button", { style: btnPrimary, type: "button", onClick: () => {
                                                if (!selected)
                                                    return;
                                                applyFormula(selected.id, fBuffer);
                                                setFOpen(false);
                                            }, children: "Speichern" })] })] })] }) })), nOpen && selected && (_jsx("div", { style: modalWrap, onMouseDown: (e) => e.target === e.currentTarget && setNOpen(false), children: _jsxs("div", { style: modalBox, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "Beschreibung bearbeiten" }), _jsx("textarea", { style: modalTextarea, value: nBuffer, onChange: (e) => setNBuffer(e.target.value), autoFocus: true, placeholder: "z. B. Asphalt im Bereich Nord" }), _jsxs("div", { style: {
                                display: "flex",
                                justifyContent: "space-between",
                                marginTop: 10,
                                fontSize: 12,
                            }, children: [_jsxs("div", { style: { opacity: 0.7 }, children: ["Tastatur: ", _jsx("b", { children: "Ctrl/\u2318 + Enter" }), " speichert, ", _jsx("b", { children: "Esc" }), " schlie\u00DFt"] }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("button", { style: btn, onClick: () => setNOpen(false), type: "button", children: "Abbrechen" }), _jsx("button", { style: btnPrimary, type: "button", onClick: () => {
                                                if (!selected)
                                                    return;
                                                patch(selected.id, { note: nBuffer });
                                                setNOpen(false);
                                            }, children: "Speichern" })] })] })] }) })), analysisOpen && (_jsx("div", { style: modalWrap, onMouseDown: (e) => e.target === e.currentTarget && setAnalysisOpen(false), children: _jsxs("div", { style: modalBox, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "KI-Analyse: Auff\u00E4llige Positionen" }), analysisList.length === 0 ? (_jsx("div", { style: { fontSize: 13 }, children: "Keine Auff\u00E4lligkeiten gefunden. Soll- und Ist-Mengen liegen im normalen Bereich." })) : (_jsxs("div", { style: { maxHeight: "50vh", overflow: "auto", fontSize: 13 }, children: [_jsxs("p", { style: { marginBottom: 8 }, children: ["Folgende Positionen haben ", _jsx("b", { children: "noch keine Ist-Menge" }), " oder eine", " ", _jsx("b", { children: "hohe Abweichung" }), ":"] }), _jsx("ul", { style: { paddingLeft: 18 }, children: analysisList.map((r) => (_jsxs("li", { style: { marginBottom: 4 }, children: [_jsx("b", { children: r.pos }), " \u2013 ", r.text, " ", _jsxs("span", { style: { opacity: 0.7 }, children: ["(Soll: ", r.soll, " ", r.unit, ", Ist: ", r.ist, " ", r.unit, ")"] })] }, r.id))) })] })), _jsx("div", { style: {
                                marginTop: 12,
                                display: "flex",
                                justifyContent: "flex-end",
                            }, children: _jsx("button", { style: btnPrimary, type: "button", onClick: () => setAnalysisOpen(false), children: "Schlie\u00DFen" }) })] }) }))] }));
}
