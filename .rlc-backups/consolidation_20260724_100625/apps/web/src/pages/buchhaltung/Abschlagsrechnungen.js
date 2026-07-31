import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
// apps/web/src/pages/buchhaltung/Abschlagsrechnungen.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";
const API = import.meta?.env?.VITE_API_URL ||
    import.meta?.env?.VITE_BACKEND_URL ||
    "https://api.rlcbausoftware.com";
const fmtEUR = (v) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v || 0);
function todayIso() {
    return new Date().toISOString().slice(0, 10);
}
function uuid() {
    return globalThis?.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}
async function apiJson(path, init) {
    const base = String(API || "").replace(/\/+$/, "");
    const res = await fetch(`${base}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...init,
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Server-Fehler (${res.status})`);
    }
    return (await res.json());
}
export default function AbschlagsrechnungenPage() {
    const { currentProject, getSelectedProject } = useProject();
    const navigate = useNavigate();
    const p = currentProject || getSelectedProject?.() || null;
    const projectKey = (p?.code || "").trim();
    const projectId = p?.id || projectKey || "_none_";
    const mwstDefault = 19;
    const [items, setItems] = useState([]);
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [filePath, setFilePath] = useState(null);
    const totals = useMemo(() => {
        const netto = items.reduce((s, a) => s + (a.netto || 0), 0);
        const brutto = items.reduce((s, a) => s + (a.brutto || 0), 0);
        return { netto, brutto };
    }, [items]);
    async function loadFromServer() {
        if (!projectKey) {
            setItems([]);
            setInfo("Kein Projekt ausgewählt.");
            return;
        }
        setLoading(true);
        setInfo(null);
        try {
            const data = await apiJson(`/api/abschlag/list/${encodeURIComponent(projectKey)}`);
            setItems(Array.isArray(data?.items) ? data.items : []);
            setFilePath(data?.file || null);
        }
        catch (e) {
            setInfo((e?.message || "Fehler beim Laden") + `\n\nAPI: ${String(API)}`);
        }
        finally {
            setLoading(false);
        }
    }
    async function saveToServer(nextItems) {
        if (!projectKey) {
            setInfo("Kein Projekt ausgewählt.");
            return;
        }
        setLoading(true);
        setInfo(null);
        try {
            const payload = { items: nextItems ?? items };
            const data = await apiJson(`/api/abschlag/save/${encodeURIComponent(projectKey)}`, {
                method: "POST",
                body: JSON.stringify(payload),
            });
            setFilePath(data?.file || null);
            setInfo(`Gespeichert (${data?.saved ?? (nextItems ?? items).length} Abschlagsrechnung(en)).`);
        }
        catch (e) {
            setInfo((e?.message || "Fehler beim Speichern") + `\n\nAPI: ${String(API)}`);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadFromServer();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectKey]);
    const createNew = async () => {
        if (!projectKey)
            return;
        const nextNr = (items.reduce((m, x) => Math.max(m, x.nr || 0), 0) || 0) + 1;
        const a = {
            id: uuid(),
            projectId,
            nr: nextNr,
            date: todayIso(),
            title: `Abschlagsrechnung ${nextNr}`,
            netto: 0,
            mwst: mwstDefault,
            brutto: 0,
            status: "Entwurf",
            rows: [],
        };
        const next = [a, ...items];
        setItems(next);
        await saveToServer(next);
    };
    const remove = async (id) => {
        if (!confirm("Abschlagsrechnung löschen?"))
            return;
        const next = items.filter((x) => x.id !== id);
        setItems(next);
        await saveToServer(next);
    };
    const setStatus = async (id, status) => {
        const next = items.map((x) => (x.id === id ? { ...x, status } : x));
        setItems(next);
        await saveToServer(next);
    };
    return (_jsxs("div", { style: { padding: 16 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }, children: [_jsxs("div", { children: [_jsx("nav", { style: { color: "#888", fontSize: 13 }, children: "RLC / 7. Buchhaltung / Abrechnung / Abschlagsrechnungen" }), _jsx("h2", { style: { margin: "6px 0 0 0" }, children: "Abschlagsrechnungen" }), _jsx("div", { style: { color: "#666", marginTop: 6 }, children: p ? (_jsxs(_Fragment, { children: [_jsx("b", { children: p.code }), " \u2014 ", p.name, p.place ? _jsxs(_Fragment, { children: [" \u2022 ", p.place] }) : null] })) : ("Kein Projekt ausgewählt") }), filePath ? (_jsxs("div", { style: { color: "#888", marginTop: 6, fontSize: 12 }, children: ["Datei: ", _jsx("span", { style: { fontFamily: "monospace" }, children: filePath })] })) : null] }), _jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [_jsx("button", { onClick: () => navigate(-1), children: "\u2190 Zur\u00FCck" }), _jsx("button", { onClick: () => void loadFromServer(), disabled: loading || !projectKey, children: "Laden" }), _jsx("button", { onClick: () => void saveToServer(), disabled: loading || !projectKey, children: "Speichern" }), _jsx("button", { onClick: () => void createNew(), style: {
                                    fontWeight: 700,
                                    border: "1px solid #2b7",
                                    background: "#eafff4",
                                    padding: "8px 10px",
                                    borderRadius: 8,
                                }, disabled: !projectKey || loading, children: "+ Neue Abschlagsrechnung" })] })] }), info && (_jsx("div", { style: {
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #FECACA",
                    background: "#FEF2F2",
                    color: "#991B1B",
                    fontSize: 13,
                    whiteSpace: "pre-wrap",
                }, children: info })), _jsxs("div", { style: { marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }, children: [_jsxs("div", { style: { border: "1px solid #eee", borderRadius: 12, padding: 12, minWidth: 220, background: "#fff" }, children: [_jsx("div", { style: { color: "#666" }, children: "Summe Netto" }), _jsx("div", { style: { fontWeight: 800, fontSize: 18 }, children: fmtEUR(totals.netto) })] }), _jsxs("div", { style: { border: "1px solid #eee", borderRadius: 12, padding: 12, minWidth: 220, background: "#fff" }, children: [_jsx("div", { style: { color: "#666" }, children: "Summe Brutto" }), _jsx("div", { style: { fontWeight: 800, fontSize: 18 }, children: fmtEUR(totals.brutto) })] })] }), _jsx("div", { style: { marginTop: 14, border: "1px solid #eee", borderRadius: 12, overflow: "hidden", background: "#fff" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 14 }, children: [_jsx("thead", { style: { background: "#fafafa" }, children: _jsxs("tr", { children: [_jsx("th", { style: { textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }, children: "Nr." }), _jsx("th", { style: { textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }, children: "Datum" }), _jsx("th", { style: { textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }, children: "Titel" }), _jsx("th", { style: { textAlign: "right", padding: 12, borderBottom: "1px solid #eee" }, children: "Positionen" }), _jsx("th", { style: { textAlign: "right", padding: 12, borderBottom: "1px solid #eee" }, children: "Netto" }), _jsx("th", { style: { textAlign: "right", padding: 12, borderBottom: "1px solid #eee" }, children: "Brutto" }), _jsx("th", { style: { textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }, children: "Status" }), _jsx("th", { style: { textAlign: "right", padding: 12, borderBottom: "1px solid #eee" }, children: "Aktion" })] }) }), _jsxs("tbody", { children: [items.map((a) => (_jsxs("tr", { children: [_jsxs("td", { style: { padding: 12, borderBottom: "1px solid #f3f3f3", fontWeight: 800 }, children: ["#", a.nr] }), _jsx("td", { style: { padding: 12, borderBottom: "1px solid #f3f3f3" }, children: a.date }), _jsx("td", { style: { padding: 12, borderBottom: "1px solid #f3f3f3" }, children: a.title || "" }), _jsx("td", { style: { padding: 12, borderBottom: "1px solid #f3f3f3", textAlign: "right", fontWeight: 800 }, children: Array.isArray(a.rows) ? a.rows.length : 0 }), _jsx("td", { style: { padding: 12, borderBottom: "1px solid #f3f3f3", textAlign: "right", fontWeight: 700 }, children: fmtEUR(a.netto) }), _jsx("td", { style: { padding: 12, borderBottom: "1px solid #f3f3f3", textAlign: "right", fontWeight: 700 }, children: fmtEUR(a.brutto) }), _jsx("td", { style: { padding: 12, borderBottom: "1px solid #f3f3f3" }, children: _jsxs("select", { value: a.status, onChange: (e) => void setStatus(a.id, e.target.value), style: { padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8 }, disabled: loading, children: [_jsx("option", { value: "Entwurf", children: "Entwurf" }), _jsx("option", { value: "Freigegeben", children: "Freigegeben" }), _jsx("option", { value: "Gebucht", children: "Gebucht" })] }) }), _jsxs("td", { style: { padding: 12, borderBottom: "1px solid #f3f3f3", textAlign: "right", whiteSpace: "nowrap" }, children: [_jsx("button", { onClick: () => navigate(`/buchhaltung/abschlagsrechnungen/${a.id}`), disabled: loading, children: "\u00D6ffnen" }), " ", _jsx("button", { onClick: () => void remove(a.id), disabled: loading, children: "L\u00F6schen" })] })] }, a.id))), items.length === 0 && (_jsx("tr", { children: _jsxs("td", { colSpan: 8, style: { padding: 14, color: "#777" }, children: ["Noch keine Abschlagsrechnungen. Klicke oben auf ", _jsx("b", { children: "\u201E+ Neue Abschlagsrechnung\u201C" }), "."] }) }))] })] }) }), _jsxs("div", { style: { marginTop: 10, color: "#777", fontSize: 12 }, children: ["Hinweis: Speichern/Laden erfolgt \u00FCber ", _jsx("b", { children: "data/projects/<projectCode>/abschlaege.json" }), "."] })] }));
}
