import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { API_BASE } from "../../lib/apiBase";
// apps/web/src/pages/buchhaltung/Abschlagsrechnungen.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";
import "./styles.css";
function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
}
const fmtEUR = (v) => new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
}).format(safeNum(v));
function safeTrim(v) {
    return String(v ?? "").trim();
}
function safeNum(x, fallback = 0) {
    if (x === null || x === undefined || x === "")
        return fallback;
    const normalized = typeof x === "string" ? x.replace(/\s/g, "").replace(",", ".") : x;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : fallback;
}
function todayIso() {
    return new Date().toISOString().slice(0, 10);
}
function uuid() {
    try {
        if (globalThis?.crypto?.randomUUID) {
            return globalThis.crypto.randomUUID();
        }
    }
    catch { }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
async function apiJson(path, init) {
    const headers = {
        "Content-Type": "application/json",
        ...(init?.headers || {})
    };
    const res = await fetch(apiUrl(path), {
        ...init,
        headers,
        credentials: "include"
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Server-Fehler (${res.status})`);
    }
    return (await res.json());
}
function normalizeRow(row) {
    const qty = safeNum(row?.qty);
    const ep = safeNum(row?.ep);
    const total = row?.total !== undefined && row?.total !== null ?
        safeNum(row.total) :
        qty * ep;
    return {
        lvPos: safeTrim(row?.lvPos),
        kurztext: safeTrim(row?.kurztext),
        einheit: safeTrim(row?.einheit) || "m",
        qty,
        ep,
        total
    };
}
function normalizeStatus(v) {
    const s = safeTrim(v);
    if (s === "Freigegeben" || s === "Gebucht")
        return s;
    return "Entwurf";
}
function normalizeItem(item) {
    const rows = Array.isArray(item?.rows) ?
        item.rows.map(normalizeRow) :
        [];
    const mwst = safeNum(item?.mwst, 19);
    const netto = item?.netto !== undefined && item?.netto !== null ?
        safeNum(item.netto) :
        rows.reduce((sum, r) => sum + safeNum(r.total), 0);
    const brutto = item?.brutto !== undefined && item?.brutto !== null ?
        safeNum(item.brutto) :
        netto * (1 + mwst / 100);
    return {
        id: safeTrim(item?.id) || uuid(),
        projectId: safeTrim(item?.projectId),
        nr: safeNum(item?.nr),
        date: safeTrim(item?.date) || todayIso(),
        title: safeTrim(item?.title),
        netto,
        mwst,
        brutto,
        status: normalizeStatus(item?.status),
        rows
    };
}
export default function AbschlagsrechnungenPage() {
    const { currentProject, getSelectedProject } = useProject();
    const navigate = useNavigate();
    const p = currentProject || getSelectedProject?.() || null;
    const projectKey = safeTrim(p?.code);
    const projectId = safeTrim(p?.id) || projectKey || "_none_";
    const mwstDefault = 19;
    const [items, setItems] = useState([]);
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [filePath, setFilePath] = useState(null);
    const totals = useMemo(() => {
        const netto = items.reduce((s, a) => s + safeNum(a.netto), 0);
        const brutto = items.reduce((s, a) => s + safeNum(a.brutto), 0);
        return { netto, brutto };
    }, [items]);
    async function loadFromServer() {
        if (!projectKey) {
            setItems([]);
            setInfo("Kein Projekt ausgewählt.");
            setFilePath(null);
            return;
        }
        setLoading(true);
        setInfo(null);
        try {
            const data = await apiJson(`/api/abschlag/list/${encodeURIComponent(projectKey)}`);
            const nextItems = Array.isArray(data?.items) ?
                data.items.map(normalizeItem) :
                [];
            setItems(nextItems);
            setFilePath(data?.file || null);
        }
        catch (e) {
            setItems([]);
            setInfo((e?.message || "Fehler beim Laden") + `\n\nAPI: ${API_BASE || "(relative)"}`);
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
            const normalized = (nextItems ?? items).map(normalizeItem);
            const payload = { items: normalized };
            const data = await apiJson(`/api/abschlag/save/${encodeURIComponent(projectKey)}`, {
                method: "POST",
                body: JSON.stringify(payload)
            });
            setItems(normalized);
            setFilePath(data?.file || null);
            setInfo(`Gespeichert (${data?.saved ?? normalized.length} Abschlagsrechnung(en)).`);
        }
        catch (e) {
            setInfo((e?.message || "Fehler beim Speichern") + `\n\nAPI: ${API_BASE || "(relative)"}`);
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
        if (!projectKey || loading)
            return;
        const nextNr = (items.reduce((m, x) => Math.max(m, safeNum(x.nr)), 0) || 0) + 1;
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
            rows: []
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
    const updateStatus = async (id, status) => {
        const next = items.map((x) => x.id === id ? normalizeItem({ ...x, status }) : x);
        setItems(next);
        await saveToServer(next);
    };
    return (_jsxs("div", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-124", children: [_jsxs("div", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-125", children: [_jsxs("div", { children: [_jsx("nav", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-126", children: "RLC / 7. Buchhaltung / Abrechnung / Abschlagsrechnungen" }), _jsx("h2", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-127", children: "Abschlagsrechnungen" }), _jsx("div", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-128", children: p ?
                                    _jsxs(_Fragment, { children: [_jsx("b", { children: p.code }), " \u2014 ", p.name, p.place ? _jsxs(_Fragment, { children: [" \u2022 ", p.place] }) : null] }) :
                                    "Kein Projekt ausgewählt" }), filePath ?
                                _jsxs("div", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-129", children: ["Datei: ", _jsx("span", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-130", children: filePath })] }) :
                                null] }), _jsxs("div", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-131", children: [_jsx("button", { onClick: () => navigate(-1), children: "\u2190 Zur\u00FCck" }), _jsx("button", { onClick: () => void loadFromServer(), disabled: loading || !projectKey, children: "Laden" }), _jsx("button", { onClick: () => void saveToServer(), disabled: loading || !projectKey, children: "Speichern" }), _jsx("button", { onClick: () => void createNew(), disabled: !projectKey || loading, className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-132", children: "+ Neue Abschlagsrechnung" })] })] }), info &&
                _jsx("div", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-133", children: info }), _jsxs("div", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-134", children: [_jsxs("div", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-135", children: [_jsx("div", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-136", children: "Summe Netto" }), _jsx("div", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-137", children: fmtEUR(totals.netto) })] }), _jsxs("div", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-138", children: [_jsx("div", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-139", children: "Summe Brutto" }), _jsx("div", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-140", children: fmtEUR(totals.brutto) })] })] }), _jsx("div", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-141", children: _jsxs("table", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-142", children: [_jsx("thead", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-143", children: _jsxs("tr", { children: [_jsx("th", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-144", children: "Nr." }), _jsx("th", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-145", children: "Datum" }), _jsx("th", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-146", children: "Titel" }), _jsx("th", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-147", children: "Positionen" }), _jsx("th", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-148", children: "Netto" }), _jsx("th", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-149", children: "Brutto" }), _jsx("th", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-150", children: "Status" }), _jsx("th", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-151", children: "Aktion" })] }) }), _jsxs("tbody", { children: [items.map((a) => _jsxs("tr", { children: [_jsxs("td", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-152", children: ["#", a.nr] }), _jsx("td", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-153", children: a.date }), _jsx("td", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-154", children: a.title || "" }), _jsx("td", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-155", children: Array.isArray(a.rows) ? a.rows.length : 0 }), _jsx("td", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-156", children: fmtEUR(a.netto) }), _jsx("td", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-157", children: fmtEUR(a.brutto) }), _jsx("td", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-158", children: _jsxs("select", { value: a.status, onChange: (e) => void updateStatus(a.id, e.target.value), disabled: loading, className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-159", children: [_jsx("option", { value: "Entwurf", children: "Entwurf" }), _jsx("option", { value: "Freigegeben", children: "Freigegeben" }), _jsx("option", { value: "Gebucht", children: "Gebucht" })] }) }), _jsxs("td", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-160", children: [_jsx("button", { onClick: () => navigate(`/buchhaltung/abschlagsrechnungen/${a.id}`), disabled: loading, children: "\u00D6ffnen" }), " ", _jsx("button", { onClick: () => void remove(a.id), disabled: loading, children: "L\u00F6schen" })] })] }, a.id)), items.length === 0 &&
                                    _jsx("tr", { children: _jsxs("td", { colSpan: 8, className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-161", children: ["Noch keine Abschlagsrechnungen. Klicke oben auf", " ", _jsx("b", { children: "\u201E+ Neue Abschlagsrechnung\u201C" }), "."] }) })] })] }) }), _jsxs("div", { className: "rlc-migrated-pages-buchhaltung-abschlagsrechnungen-tsx-162", children: ["Hinweis: Speichern/Laden erfolgt \u00FCber", " ", _jsx("b", { children: "data/projects/<projectCode>/abschlaege.json" }), "."] })] }));
}
