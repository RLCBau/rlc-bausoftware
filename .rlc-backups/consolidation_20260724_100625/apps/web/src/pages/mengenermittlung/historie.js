import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { useProject } from "../../store/useProject";
const API_BASE = import.meta?.env?.VITE_API_URL ||
    import.meta?.env?.VITE_BACKEND_URL ||
    "https://api.rlcbausoftware.com";
const rid = () => crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const fmt = (ts) => new Date(ts).toLocaleString();
/* ===== API ===== */
async function api(path, init) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...init,
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
/* ===== Normalizer (robust) ===== */
function normalizeRows(input) {
    const arr = Array.isArray(input) ? input : [];
    return arr.map((x, i) => {
        const id = String(x?.id || x?.rowId || x?.uuid || "") ||
            `${Date.now()}-${i}-${Math.random()}`;
        const pos = String(x?.pos || x?.position || x?.nr || x?.Positionsnummer || "").trim();
        const text = String(x?.text || x?.kurztext || x?.Kurztext || x?.langtext || x?.Text || "").trim();
        // qty: prova ist/soll/qty/menge/quantity
        const qtyRaw = x?.qty ?? x?.menge ?? x?.quantity ?? x?.ist ?? x?.Ist ?? x?.soll ?? x?.Soll ?? 0;
        const qty = Number(qtyRaw || 0);
        const unit = String(x?.unit || x?.einheit || x?.Einheit || x?.uom || "").trim();
        return { id, pos, text, qty: Number.isFinite(qty) ? qty : 0, unit };
    });
}
/* ===== Diff ===== */
function diff(a, b) {
    const A = new Map(a.map((x) => [x.id, x]));
    const B = new Map(b.map((x) => [x.id, x]));
    const added = [];
    const removed = [];
    const changed = [];
    for (const [id, v] of B)
        if (!A.has(id))
            added.push(v);
    for (const [id, v] of A)
        if (!B.has(id))
            removed.push(v);
    for (const [id, oldV] of A) {
        const nv = B.get(id);
        if (!nv)
            continue;
        if (oldV.qty !== nv.qty ||
            oldV.text !== nv.text ||
            oldV.unit !== nv.unit ||
            oldV.pos !== nv.pos) {
            changed.push({ before: oldV, after: nv });
        }
    }
    return { added, removed, changed };
}
/* ===== Page ===== */
export default function HistoriePage() {
    const store = useProject();
    // "id" può essere UUID, "name" è BA-2025-DEMO (come nel tuo header)
    const projectName = store?.project?.name || store?.project?.title || store?.activeProjectName || "BA-2025-DEMO";
    const projectIdFromStore = store?.projectId ||
        store?.activeProjectId ||
        store?.selectedProjectId ||
        store?.project?.id ||
        store?.project?.projectId ||
        "";
    // per chiamate API uso sempre quello che arriva dallo store (anche se UUID),
    // perché il backend ormai risolve e salva nella cartella canonica.
    const [projectId, setProjectId] = React.useState(projectIdFromStore || "BA-2025-DEMO");
    // label mostrata all’utente: BA-2025-DEMO
    const [projectLabel, setProjectLabel] = React.useState(projectName || "BA-2025-DEMO");
    const [versions, setVersions] = React.useState([]);
    const [current, setCurrent] = React.useState([]);
    const [sel, setSel] = React.useState([]);
    const [compare, setCompare] = React.useState(null);
    const [note, setNote] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    React.useEffect(() => {
        if (projectIdFromStore && projectIdFromStore !== projectId)
            setProjectId(projectIdFromStore);
        if (projectName && projectName !== projectLabel)
            setProjectLabel(projectName);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectIdFromStore, projectName]);
    async function loadAll() {
        const pid = String(projectId || "").trim();
        if (!pid) {
            setError("Projekt-ID fehlt");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const [hist, cur] = await Promise.all([
                api(`/api/historie?projectId=${encodeURIComponent(pid)}`),
                api(`/api/historie/current?projectId=${encodeURIComponent(pid)}`),
            ]);
            setVersions(hist.items || []);
            setCurrent(normalizeRows(cur.rows || []));
            // se il backend ci dice “BA-2025-DEMO” come resolved, mostralo come label
            if (hist.resolvedProjectId)
                setProjectLabel(hist.resolvedProjectId);
        }
        catch (e) {
            console.warn("Offline fallback", e);
            setError("Offline gespeichert (LS)");
            const lsHist = localStorage.getItem(`sollist-hist:${pid}`);
            const lsCur = localStorage.getItem(`sollist:${pid}`);
            setVersions(lsHist ? JSON.parse(lsHist) : []);
            setCurrent(lsCur ? JSON.parse(lsCur) : []);
        }
        finally {
            setLoading(false);
        }
    }
    React.useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);
    React.useEffect(() => {
        const pid = String(projectId || "").trim();
        if (!pid)
            return;
        localStorage.setItem(`sollist-hist:${pid}`, JSON.stringify(versions));
    }, [projectId, versions]);
    React.useEffect(() => {
        const pid = String(projectId || "").trim();
        if (!pid)
            return;
        localStorage.setItem(`sollist:${pid}`, JSON.stringify(current));
    }, [projectId, current]);
    async function saveSnapshot() {
        const pid = String(projectId || "").trim();
        if (!pid)
            return alert("Projekt-ID fehlt");
        const v = {
            id: rid(),
            projectId: pid,
            createdAt: Date.now(),
            user: "Bauleiter",
            note: note?.trim() || undefined,
            data: JSON.parse(JSON.stringify(current)),
        };
        setVersions((prev) => [v, ...prev]);
        setNote("");
        try {
            await api(`/api/historie`, { method: "POST", body: JSON.stringify(v) });
            setError(null);
        }
        catch {
            setError("Offline gespeichert (LS)");
        }
    }
    async function saveCurrent() {
        const pid = String(projectId || "").trim();
        if (!pid)
            return alert("Projekt-ID fehlt");
        try {
            await api(`/api/historie/current?projectId=${encodeURIComponent(pid)}`, {
                method: "POST",
                body: JSON.stringify({ rows: current }),
            });
            setError(null);
            alert("Soll-Ist gespeichert");
        }
        catch (e) {
            console.error(e);
            alert("Fehler beim Speichern");
        }
    }
    async function restoreVersion(v) {
        try {
            await api(`/api/historie/restore`, { method: "POST", body: JSON.stringify(v) });
            setCurrent(v.data || []);
            alert("Version erfolgreich wiederhergestellt.");
        }
        catch (e) {
            console.error(e);
            alert("Fehler beim Wiederherstellen");
        }
    }
    async function deleteVersion(v) {
        const pid = String(projectId || "").trim();
        if (!pid)
            return;
        if (!confirm("Version wirklich löschen?"))
            return;
        // optimistic
        setVersions((prev) => prev.filter((x) => x.id !== v.id));
        setSel((prev) => prev.filter((id) => id !== v.id));
        try {
            await api(`/api/historie/${encodeURIComponent(v.id)}?projectId=${encodeURIComponent(pid)}`, {
                method: "DELETE",
            });
        }
        catch (e) {
            console.warn("Delete failed (offline?)", e);
            setError("Offline: gelöscht nur lokal (LS)");
        }
    }
    function toggleSelect(id) {
        setSel((prev) => {
            if (prev.includes(id))
                return prev.filter((x) => x !== id);
            if (prev.length === 2)
                return [prev[1], id];
            return [...prev, id];
        });
    }
    function openCompare() {
        if (sel.length < 2)
            return alert("Bitte 2 Versionen auswählen");
        const [a, b] = sel;
        const left = versions.find((v) => v.id === a);
        const right = versions.find((v) => v.id === b);
        setCompare({ left, right });
    }
    return (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "360px 1fr", gap: 16 }, children: [_jsxs("div", { className: "card", style: { padding: 14 }, children: [_jsx("h3", { style: { margin: 0 }, children: "Historie / Soll-Ist-Versionierung" }), _jsxs("div", { style: { marginTop: 8 }, children: [_jsx("label", { style: { fontSize: 12, color: "var(--muted)" }, children: "Projekt" }), _jsx("input", { value: projectLabel, readOnly: true }), _jsx("input", { value: projectId, onChange: (e) => setProjectId(e.target.value), style: { display: "none" } })] }), _jsxs("div", { style: { marginTop: 10 }, children: [_jsx("label", { style: { fontSize: 12, color: "var(--muted)" }, children: "Notiz (optional)" }), _jsx("input", { value: note, onChange: (e) => setNote(e.target.value), placeholder: "z.B. Stand nach Ortsbesichtigung" })] }), _jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }, children: [_jsx("button", { className: "btn", onClick: saveSnapshot, disabled: loading, children: "Version speichern" }), _jsx("button", { className: "btn", onClick: saveCurrent, disabled: loading, children: "Speichern" }), _jsx("button", { className: "btn", onClick: openCompare, disabled: sel.length < 2, children: "Vergleichen" }), _jsx("button", { className: "btn", onClick: loadAll, disabled: loading, children: "Neu laden" })] }), loading && _jsx("div", { style: { color: "var(--muted)", marginTop: 8 }, children: "Laden\u2026" }), error && _jsx("div", { style: { color: "crimson", marginTop: 8 }, children: error }), _jsxs("div", { style: {
                            marginTop: 10,
                            maxHeight: 420,
                            overflow: "auto",
                            border: "1px solid var(--line)",
                            borderRadius: 8,
                        }, children: [versions.length === 0 && (_jsx("div", { style: { padding: 10, color: "var(--muted)" }, children: "Keine Versionen" })), versions.map((v) => (_jsxs("div", { style: {
                                    padding: 10,
                                    borderBottom: "1px solid var(--line)",
                                    background: sel.includes(v.id) ? "rgba(0,0,0,.05)" : undefined,
                                    display: "grid",
                                    gridTemplateColumns: "auto 1fr auto",
                                    alignItems: "center",
                                    gap: 8,
                                }, children: [_jsx("input", { type: "checkbox", checked: sel.includes(v.id), onChange: () => toggleSelect(v.id) }), _jsxs("div", { children: [_jsxs("div", { children: [_jsx("strong", { children: fmt(v.createdAt) }), " \u00B7 ", v.user] }), _jsx("div", { style: { fontSize: 12, color: "var(--muted)" }, children: v.note || "—" })] }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("button", { className: "btn", onClick: () => restoreVersion(v), children: "Wiederherstellen" }), _jsx("button", { className: "btn", onClick: () => deleteVersion(v), children: "L\u00F6schen" })] })] }, v.id)))] })] }), _jsxs("div", { className: "card", style: { padding: 14 }, children: [_jsx("h4", { style: { marginTop: 0 }, children: "Aktuelle Soll-Ist-Daten" }), _jsx(SimpleTable, { rows: current }), compare && (_jsxs("div", { style: { marginTop: 16 }, children: [_jsxs("h4", { style: { margin: 0 }, children: ["Vergleich \u2022 ", fmt(compare.left.createdAt), " \u2194 ", fmt(compare.right.createdAt)] }), _jsx(DiffView, { a: compare.left.data, b: compare.right.data }), _jsx("div", { style: { marginTop: 10 }, children: _jsx("button", { className: "btn", onClick: () => setCompare(null), children: "Schlie\u00DFen" }) })] }))] })] }));
}
/* ===== UI Components ===== */
function SimpleTable({ rows }) {
    return (_jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(Th, { children: "Pos" }), _jsx(Th, { children: "Text" }), _jsx(Th, { style: { textAlign: "right" }, children: "Menge" }), _jsx(Th, { children: "Einheit" })] }) }), _jsx("tbody", { children: rows.length === 0 ? (_jsx("tr", { children: _jsx(Td, { colSpan: 4, style: { color: "var(--muted)" }, children: "\u2014" }) })) : (rows.map((r) => (_jsxs("tr", { children: [_jsx(Td, { children: r.pos }), _jsx(Td, { children: r.text }), _jsx(Td, { style: { textAlign: "right" }, children: r.qty }), _jsx(Td, { children: r.unit })] }, r.id)))) })] }));
}
function DiffView({ a, b }) {
    const d = diff(a, b);
    return (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 8 }, children: [_jsx(Card, { title: `Neu (+${d.added.length})`, children: d.added.length ? d.added.map((x) => _jsx(Line, { text: `${x.pos} ${x.text}`, color: "#1a7f37" }, x.id)) : _jsx(Empty, {}) }), _jsx(Card, { title: `Entfernt (${d.removed.length})`, children: d.removed.length ? d.removed.map((x) => _jsx(Line, { text: `${x.pos} ${x.text}`, color: "#b42318" }, x.id)) : _jsx(Empty, {}) }), _jsx(Card, { title: `Geändert (${d.changed.length})`, children: d.changed.length ? d.changed.map((x) => (_jsx(Line, { text: `${x.after.pos} ${x.after.text}: ${x.before.qty} → ${x.after.qty}`, color: "#956400" }, x.after.id))) : _jsx(Empty, {}) })] }));
}
function Card({ title, children }) {
    return (_jsxs("div", { style: { border: "1px solid var(--line)", borderRadius: 8, padding: 10 }, children: [_jsx("div", { style: { fontWeight: 600, marginBottom: 6 }, children: title }), children] }));
}
function Line({ text, color }) {
    return (_jsx("div", { style: { fontSize: 13, padding: "4px 6px", borderRadius: 6, background: `${color}20`, color }, children: text }));
}
function Empty() { return _jsx("div", { style: { color: "var(--muted)" }, children: "\u2014" }); }
function Th(p) { return _jsx("th", { ...p, style: { padding: "6px 8px", borderBottom: "1px solid var(--line)", textAlign: "left" } }); }
function Td(p) { return _jsx("td", { ...p, style: { padding: "6px 8px", borderBottom: "1px solid var(--line)", verticalAlign: "top" } }); }
