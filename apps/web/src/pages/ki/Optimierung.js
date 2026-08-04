import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/ki/Optimierung.tsx
import { apiUrl } from "../../lib/apiBase";
import { useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "../../store/useProject";
const shell = {
    display: "grid",
    gap: 16,
    padding: 24
};
const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 16,
    background: "#fff"
};
const input = {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14
};
const btn = {
    padding: "8px 12px",
    border: "1px solid #cbd5e1",
    background: "#fff",
    borderRadius: 8,
    fontSize: 13,
    cursor: "pointer"
};
const table = {
    width: "100%",
    borderCollapse: "collapse"
};
const th = {
    borderBottom: "1px solid #ccc",
    textAlign: "left",
    padding: 8,
    background: "#f8fafc",
    whiteSpace: "nowrap"
};
const td = {
    padding: 6,
    borderBottom: "1px solid #eee",
    verticalAlign: "top"
};
export default function Optimierung() {
    const fileRef = useRef(null);
    const projectCtx = useProject();
    const currentProject = projectCtx?.currentProject ?? null;
    const storeProjectId = currentProject?.id ?? "";
    const projectCode = currentProject?.code ?? "";
    const [projectInput, setProjectInput] = useState("");
    const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
    const [tasks, setTasks] = useState([
        {
            id: "A",
            name: "Baustelleneinrichtung",
            dauerTage: 1,
            deps: [],
            ressourcen: { Facharbeiter: 2 }
        },
        {
            id: "B",
            name: "Graben herstellen",
            dauerTage: 3,
            deps: ["A"],
            ressourcen: { Bagger20t: 1, Facharbeiter: 2 }
        },
        {
            id: "C",
            name: "Leitung verlegen",
            dauerTage: 2,
            deps: ["B"],
            ressourcen: { Facharbeiter: 2 }
        },
        {
            id: "D",
            name: "Wiederverfüllen",
            dauerTage: 2,
            deps: ["C"],
            ressourcen: { Radlader: 1, Facharbeiter: 1 }
        }
    ]);
    const [capacity, setCapacity] = useState({
        Facharbeiter: 4,
        Bagger20t: 1,
        Radlader: 1
    });
    const [capacityText, setCapacityText] = useState("Facharbeiter:4;Bagger20t:1;Radlader:1");
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const effectiveProjectId = useMemo(() => projectInput.trim() || storeProjectId || projectCode || "", [projectInput, storeProjectId, projectCode]);
    const canRun = useMemo(() => Boolean(effectiveProjectId && tasks.length > 0), [effectiveProjectId, tasks]);
    useEffect(() => {
        setCapacityText(capacityToString(capacity));
    }, [capacity]);
    function addTask() {
        const n = tasks.length + 1;
        setTasks((t) => [
            ...t,
            {
                id: `T${n}`,
                name: `Vorgang ${n}`,
                dauerTage: 1,
                deps: [],
                ressourcen: {}
            }
        ]);
    }
    function updateTask(i, patch) {
        setTasks((arr) => arr.map((t, idx) => idx === i ?
            normalizeTask({
                ...t,
                ...patch
            }) :
            t));
    }
    function removeTask(i) {
        setTasks((arr) => arr.filter((_, idx) => idx !== i));
    }
    async function runOptimization() {
        if (!canRun)
            return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(apiUrl("/api/ki/optimierung/run"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId: effectiveProjectId,
                    projectCode: projectCode || "",
                    start,
                    tasks,
                    capacity
                })
            });
            if (!res.ok)
                throw new Error(await res.text());
            const data = (await res.json());
            setResult(normalizePlanResult(data));
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : "Optimierung fehlgeschlagen";
            setError(msg);
            window.alert(`Optimierung fehlgeschlagen: ${msg}`);
        }
        finally {
            setBusy(false);
        }
    }
    async function exportPdf() {
        if (!result)
            return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(apiUrl("/api/ki/optimierung/pdf"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId: effectiveProjectId, plan: result })
            });
            if (!res.ok)
                throw new Error(await res.text());
            const data = (await res.json());
            if (data.url)
                window.open(data.url, "_blank");
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : "PDF-Export fehlgeschlagen";
            setError(msg);
            window.alert(`PDF-Export fehlgeschlagen: ${msg}`);
        }
        finally {
            setBusy(false);
        }
    }
    async function loadFromBuero() {
        if (!effectiveProjectId) {
            window.alert("Projekt-ID fehlt.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const r = await fetch(apiUrl("/api/buero/bauzeitenplan/load"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId: effectiveProjectId })
            });
            if (!r.ok)
                throw new Error(await r.text());
            const d = (await r.json());
            if (d.start)
                setStart(String(d.start).slice(0, 10));
            if (Array.isArray(d.tasks))
                setTasks(d.tasks.map(normalizeTask));
            if (d.capacity && typeof d.capacity === "object") {
                setCapacity(normalizeCapacity(d.capacity));
            }
            if (d.result)
                setResult(normalizePlanResult(d.result));
            window.alert("Daten aus Büro geladen.");
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : "Laden fehlgeschlagen";
            setError(msg);
            window.alert(`Laden fehlgeschlagen: ${msg}`);
        }
        finally {
            setBusy(false);
        }
    }
    async function saveToBuero() {
        if (!effectiveProjectId) {
            window.alert("Projekt-ID fehlt.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const r = await fetch(apiUrl("/api/buero/bauzeitenplan/save"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId: effectiveProjectId,
                    start,
                    tasks,
                    capacity,
                    result
                })
            });
            if (!r.ok)
                throw new Error(await r.text());
            window.alert("In Büro gespeichert.");
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : "Speichern fehlgeschlagen";
            setError(msg);
            window.alert(`Speichern fehlgeschlagen: ${msg}`);
        }
        finally {
            setBusy(false);
        }
    }
    function importFile(e) {
        const f = e.target.files?.[0];
        if (!f)
            return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result || "{}"));
                if (parsed.tasks && Array.isArray(parsed.tasks)) {
                    setTasks(parsed.tasks.map(normalizeTask));
                }
                if (parsed.capacity && typeof parsed.capacity === "object") {
                    setCapacity(normalizeCapacity(parsed.capacity));
                }
                if (parsed.start) {
                    setStart(String(parsed.start).slice(0, 10));
                }
                if (parsed.result) {
                    setResult(normalizePlanResult(parsed.result));
                }
                setError(null);
            }
            catch {
                window.alert("Ungültige Datei. Erwartet JSON mit {start, tasks, capacity}.");
            }
            if (fileRef.current)
                fileRef.current.value = "";
        };
        reader.readAsText(f);
    }
    const pxPerDay = 24;
    const minDate = result?.start ? new Date(result.start) : new Date(start);
    const daysBetween = (d1, d2) => Math.round((+new Date(d2) - +new Date(d1)) / 86400000);
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h1", { children: "Optimierung Bauzeiten & Ressourcen" }), _jsxs("div", { className: rlcClass(null, card), children: [_jsxs("div", { className: "rlc-migrated-pages-ki-optimierung-tsx-1012", children: [_jsxs("label", { children: ["Projekt-ID:\u00A0", _jsx("input", { className: rlcClass(null, input), value: projectInput, onChange: (e) => setProjectInput(e.target.value), placeholder: "P-2025-001" })] }), _jsxs("label", { children: ["Start:\u00A0", _jsx("input", { className: rlcClass(null, input), type: "date", value: start, onChange: (e) => setStart(e.target.value) })] }), _jsx("button", { className: rlcClass(null, btn), onClick: addTask, children: "Vorgang hinzuf\u00FCgen" }), _jsx("input", { ref: fileRef, type: "file", accept: ".json", onChange: importFile }), _jsx("button", { className: rlcClass(null, btn), onClick: runOptimization, disabled: !canRun || busy, children: busy ? "Rechne..." : "Optimieren" }), _jsx("button", { className: rlcClass(null, btn), onClick: exportPdf, disabled: !result || busy, children: "Gantt als PDF" }), _jsx("button", { className: rlcClass(null, btn), onClick: loadFromBuero, disabled: !effectiveProjectId || busy, children: "Aus B\u00FCro laden" }), _jsx("button", { className: rlcClass(null, btn), onClick: saveToBuero, disabled: !effectiveProjectId || busy, children: "In B\u00FCro speichern" })] }), _jsxs("div", { className: "rlc-migrated-pages-ki-optimierung-tsx-1013", children: [_jsx("label", { className: "rlc-migrated-pages-ki-optimierung-tsx-1014", children: "Kapazit\u00E4ten" }), _jsxs("div", { className: "rlc-migrated-pages-ki-optimierung-tsx-1015", children: [_jsx("input", { className: rlcClass(null, { ...input, flex: 1 }), value: capacityText, placeholder: "Facharbeiter:4;Bagger20t:1;Radlader:1", onChange: (e) => setCapacityText(e.target.value), onBlur: () => setCapacity(parseResourceString(capacityText)) }), _jsx("button", { className: rlcClass(null, btn), onClick: () => setCapacity(parseResourceString(capacityText)), children: "\u00DCbernehmen" })] })] }), _jsxs("div", { className: "rlc-migrated-pages-ki-optimierung-tsx-1016", children: ["Aktiv: ", effectiveProjectId || "kein Projekt gewählt"] }), error &&
                        _jsx("div", { className: "rlc-migrated-pages-ki-optimierung-tsx-1017", children: error })] }), _jsx("div", { className: rlcClass(null, { ...card, overflowX: "auto" }), children: _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsx("tr", { children: ["ID", "Vorgang", "Dauer", "Vorgänger", "Ressourcen (k:v;...)", ""].map((h) => _jsx("th", { className: rlcClass(null, th), children: h }, h)) }) }), _jsxs("tbody", { children: [tasks.map((t, i) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, { ...td, width: 120 }), children: _jsx("input", { className: rlcClass(null, input), value: t.id, onChange: (e) => updateTask(i, { id: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, input), value: t.name, onChange: (e) => updateTask(i, { name: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, { ...td, width: 120 }), children: _jsx("input", { className: rlcClass(null, input), type: "number", min: 1, value: t.dauerTage, onChange: (e) => updateTask(i, {
                                                    dauerTage: Math.max(1, Number(e.target.value) || 1)
                                                }) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, input), value: t.deps.join(","), onChange: (e) => updateTask(i, {
                                                    deps: e.target.value.
                                                        split(",").
                                                        map((s) => s.trim()).
                                                        filter(Boolean)
                                                }) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, input), placeholder: "Facharbeiter:2;Bagger20t:1", value: Object.entries(t.ressourcen).
                                                    map(([k, v]) => `${k}:${v}`).
                                                    join(";"), onChange: (e) => updateTask(i, {
                                                    ressourcen: parseResourceString(e.target.value)
                                                }) }) }), _jsx("td", { className: rlcClass(null, { ...td, width: 60 }), children: _jsx("button", { className: rlcClass(null, btn), onClick: () => removeTask(i), children: "Entf." }) })] }, t.id)), tasks.length === 0 &&
                                    _jsx("tr", { children: _jsx("td", { colSpan: 6, className: "rlc-migrated-pages-ki-optimierung-tsx-1018", children: "Keine Vorg\u00E4nge." }) })] })] }) }), result &&
                _jsxs("div", { className: rlcClass(null, card), children: [_jsxs("div", { children: ["Start: ", _jsx("b", { children: result.start }), " \u2013 Ende: ", _jsx("b", { children: result.ende })] }), _jsx("div", { className: "rlc-migrated-pages-ki-optimierung-tsx-1019", children: result.tasks.map((t) => {
                                const offset = daysBetween(minDate.toISOString().slice(0, 10), t.startDate) * pxPerDay;
                                const width = Math.max(1, t.dauerTage) * pxPerDay;
                                return (_jsxs("div", { className: "rlc-migrated-pages-ki-optimierung-tsx-1020", children: [_jsxs("div", { className: "rlc-migrated-pages-ki-optimierung-tsx-1021", children: [t.id, " \u2013 ", t.name, " ", t.krit ? "★" : ""] }), _jsx("div", { className: "rlc-migrated-pages-ki-optimierung-tsx-1022", children: _jsx("div", { className: rlcClass(null, {
                                                    position: "absolute",
                                                    left: offset,
                                                    width,
                                                    height: 18,
                                                    background: t.krit ? "#c33" : "#3a6",
                                                    opacity: 0.9
                                                }) }) }), _jsxs("div", { className: "rlc-migrated-pages-ki-optimierung-tsx-1023", children: [t.startDate, " \u2192 ", t.endDate] })] }, t.id));
                            }) }), !!result.usage.length &&
                            _jsxs("div", { className: "rlc-migrated-pages-ki-optimierung-tsx-1024", children: [_jsx("div", { className: "rlc-migrated-pages-ki-optimierung-tsx-1025", children: "Ressourcenauslastung" }), _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Tag" }), _jsx("th", { className: rlcClass(null, th), children: "Ressourcen" })] }) }), _jsx("tbody", { children: result.usage.map((u) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: u.tag }), _jsx("td", { className: rlcClass(null, td), children: Object.entries(u.ressourcen).
                                                                map(([k, v]) => `${k}: ${v}`).
                                                                join(" · ") || "—" })] }, u.tag)) })] })] })] })] }));
}
function normalizeTask(t) {
    const x = (t ?? {});
    return {
        id: String(x.id || crypto.randomUUID()),
        name: String(x.name || "Vorgang"),
        dauerTage: Math.max(1, Number(x.dauerTage) || 1),
        deps: Array.isArray(x.deps) ?
            x.deps.map((item) => String(item).trim()).filter(Boolean) :
            [],
        ressourcen: normalizeCapacity(x.ressourcen || {})
    };
}
function normalizeCapacity(cap) {
    const out = {};
    if (!cap || typeof cap !== "object")
        return out;
    for (const [k, v] of Object.entries(cap)) {
        const n = Number(v);
        if (String(k).trim() && Number.isFinite(n) && n > 0) {
            out[String(k).trim()] = n;
        }
    }
    return out;
}
function parseResourceString(value) {
    const obj = {};
    value.
        split(";").
        map((s) => s.trim()).
        filter(Boolean).
        forEach((kv) => {
        const [k, v] = kv.split(":");
        const key = String(k || "").trim();
        const num = Number(v);
        if (key && Number.isFinite(num) && num > 0) {
            obj[key] = num;
        }
    });
    return obj;
}
function capacityToString(cap) {
    return Object.entries(cap).
        map(([k, v]) => `${k}:${v}`).
        join(";");
}
function normalizePlanResult(r) {
    const x = (r ?? {});
    return {
        start: String(x.start || new Date().toISOString().slice(0, 10)),
        ende: String(x.ende || new Date().toISOString().slice(0, 10)),
        tasks: Array.isArray(x.tasks) ?
            x.tasks.map((t) => {
                const base = normalizeTask(t);
                const raw = (t ?? {});
                return {
                    ...base,
                    es: Number(raw.es) || 0,
                    ef: Number(raw.ef) || 0,
                    ls: Number(raw.ls) || 0,
                    lf: Number(raw.lf) || 0,
                    startDate: String(raw.startDate || ""),
                    endDate: String(raw.endDate || ""),
                    krit: Boolean(raw.krit)
                };
            }) :
            [],
        usage: Array.isArray(x.usage) ?
            x.usage.map((u) => ({
                tag: String(u?.tag || ""),
                ressourcen: normalizeCapacity(u?.ressourcen || {})
            })) :
            []
    };
}
