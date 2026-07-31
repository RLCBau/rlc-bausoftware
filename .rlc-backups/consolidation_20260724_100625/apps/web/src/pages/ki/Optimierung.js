import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useMemo, useRef, useState } from "react";
const API = import.meta.env.VITE_API_URL || "";
export default function Optimierung() {
    const fileRef = useRef(null);
    const [projectId, setProjectId] = useState("");
    const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
    const [tasks, setTasks] = useState([
        { id: "A", name: "Baustelleneinrichtung", dauerTage: 1, deps: [], ressourcen: { Facharbeiter: 2 } },
        { id: "B", name: "Graben herstellen", dauerTage: 3, deps: ["A"], ressourcen: { Bagger20t: 1, Facharbeiter: 2 } },
        { id: "C", name: "Leitung verlegen", dauerTage: 2, deps: ["B"], ressourcen: { Facharbeiter: 2 } },
        { id: "D", name: "Wiederverfüllen", dauerTage: 2, deps: ["C"], ressourcen: { Radlader: 1, Facharbeiter: 1 } },
    ]);
    const [capacity, setCapacity] = useState({ Facharbeiter: 4, Bagger20t: 1, Radlader: 1 });
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const canRun = useMemo(() => projectId && tasks.length > 0, [projectId, tasks]);
    function addTask() {
        const n = tasks.length + 1;
        setTasks((t) => [...t, { id: `T${n}`, name: `Vorgang ${n}`, dauerTage: 1, deps: [], ressourcen: {} }]);
    }
    function updateTask(i, patch) {
        setTasks((arr) => arr.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
    }
    function removeTask(i) {
        setTasks((arr) => arr.filter((_, idx) => idx !== i));
    }
    async function runOptimization() {
        if (!canRun)
            return;
        setBusy(true);
        try {
            const res = await fetch(`${API}/api/ki/optimierung/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, start, tasks, capacity }),
            });
            if (!res.ok)
                throw new Error(await res.text());
            const data = (await res.json());
            setResult(data);
        }
        catch (e) {
            alert("Optimierung fehlgeschlagen: " + e.message);
        }
        finally {
            setBusy(false);
        }
    }
    async function exportPdf() {
        if (!result)
            return;
        setBusy(true);
        try {
            const res = await fetch(`${API}/api/ki/optimierung/pdf`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, plan: result }),
            });
            if (!res.ok)
                throw new Error(await res.text());
            const { url } = await res.json();
            window.open(url, "_blank");
        }
        catch (e) {
            alert("PDF-Export fehlgeschlagen: " + e.message);
        }
        finally {
            setBusy(false);
        }
    }
    // Büro <-> KI
    async function loadFromBuero() {
        try {
            const r = await fetch(`${API}/api/buero/bauzeitenplan/load`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId })
            });
            if (!r.ok)
                throw new Error(await r.text());
            const d = await r.json();
            if (d.start)
                setStart(d.start);
            if (d.tasks?.length)
                setTasks(d.tasks);
            if (d.capacity)
                setCapacity(d.capacity);
            alert("Daten aus Büro geladen.");
        }
        catch (e) {
            alert("Laden fehlgeschlagen: " + e.message);
        }
    }
    async function saveToBuero() {
        try {
            const r = await fetch(`${API}/api/buero/bauzeitenplan/save`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, start, tasks, capacity, result })
            });
            if (!r.ok)
                throw new Error(await r.text());
            alert("In Büro gespeichert.");
        }
        catch (e) {
            alert("Speichern fehlgeschlagen: " + e.message);
        }
    }
    function importFile(e) {
        const f = e.target.files?.[0];
        if (!f)
            return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result));
                if (parsed.tasks)
                    setTasks(parsed.tasks);
                if (parsed.capacity)
                    setCapacity(parsed.capacity);
                if (parsed.start)
                    setStart(parsed.start);
            }
            catch {
                alert("Ungültige Datei. Erwartet JSON mit {start, tasks, capacity}.");
            }
            if (fileRef.current)
                fileRef.current.value = "";
        };
        reader.readAsText(f);
    }
    // UI helper
    const pxPerDay = 24;
    const minDate = result?.start ? new Date(result.start) : new Date(start);
    const daysBetween = (d1, d2) => Math.round((+new Date(d2) - +new Date(d1)) / 86400000);
    return (_jsxs("div", { style: { padding: 24 }, children: [_jsx("h1", { children: "Optimierung Bauzeiten & Ressourcen" }), _jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [_jsxs("label", { children: ["Projekt-ID:\u00A0", _jsx("input", { value: projectId, onChange: e => setProjectId(e.target.value), placeholder: "P-2025-001" })] }), _jsxs("label", { children: ["Start:\u00A0", _jsx("input", { type: "date", value: start, onChange: e => setStart(e.target.value) })] }), _jsx("button", { onClick: addTask, children: "Vorgang hinzuf\u00FCgen" }), _jsx("input", { ref: fileRef, type: "file", accept: ".json", onChange: importFile }), _jsx("button", { onClick: runOptimization, disabled: !canRun || busy, children: busy ? "Rechne..." : "Optimieren" }), _jsx("button", { onClick: exportPdf, disabled: !result || busy, children: "Gantt als PDF" }), _jsx("button", { onClick: loadFromBuero, disabled: !projectId, children: "Aus B\u00FCro laden" }), _jsx("button", { onClick: saveToBuero, disabled: !projectId, children: "In B\u00FCro speichern" })] }), _jsx("div", { style: { marginTop: 12, overflowX: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsx("tr", { children: ["ID", "Vorgang", "Dauer", "Vorgänger", "Ressourcen (k:v;...)", ""].map(h => _jsx("th", { style: { borderBottom: "1px solid #ccc", textAlign: "left", padding: 8 }, children: h }, h)) }) }), _jsxs("tbody", { children: [tasks.map((t, i) => (_jsxs("tr", { children: [_jsx("td", { style: { padding: 6, width: 120 }, children: _jsx("input", { value: t.id, onChange: e => updateTask(i, { id: e.target.value }) }) }), _jsx("td", { style: { padding: 6 }, children: _jsx("input", { value: t.name, onChange: e => updateTask(i, { name: e.target.value }) }) }), _jsx("td", { style: { padding: 6, width: 120 }, children: _jsx("input", { type: "number", min: 1, value: t.dauerTage, onChange: e => updateTask(i, { dauerTage: Number(e.target.value) }) }) }), _jsx("td", { style: { padding: 6 }, children: _jsx("input", { value: t.deps.join(","), onChange: e => updateTask(i, { deps: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }) }) }), _jsx("td", { style: { padding: 6 }, children: _jsx("input", { placeholder: "Facharbeiter:2;Bagger20t:1", value: Object.entries(t.ressourcen).map(([k, v]) => `${k}:${v}`).join(";"), onChange: e => {
                                                    const obj = {};
                                                    e.target.value.split(";").map(s => s.trim()).filter(Boolean).forEach(kv => {
                                                        const [k, v] = kv.split(":");
                                                        if (k && v)
                                                            obj[k.trim()] = Number(v);
                                                    });
                                                    updateTask(i, { ressourcen: obj });
                                                } }) }), _jsx("td", { style: { padding: 6, width: 60 }, children: _jsx("button", { onClick: () => removeTask(i), children: "Entf." }) })] }, t.id))), tasks.length === 0 && _jsx("tr", { children: _jsx("td", { colSpan: 6, style: { padding: 8, color: "#777" }, children: "Keine Vorg\u00E4nge." }) })] })] }) }), result && (_jsxs("div", { style: { marginTop: 18 }, children: [_jsxs("div", { children: ["Start: ", _jsx("b", { children: result.start }), " \u2013 Ende: ", _jsx("b", { children: result.ende })] }), _jsx("div", { style: { marginTop: 8, border: "1px solid #ddd", padding: 8 }, children: result.tasks.map((t) => {
                            const offset = daysBetween(minDate.toISOString().slice(0, 10), t.startDate) * pxPerDay;
                            const width = Math.max(1, t.dauerTage) * pxPerDay;
                            return (_jsxs("div", { style: { display: "flex", alignItems: "center", marginBottom: 6 }, children: [_jsxs("div", { style: { width: 220 }, children: [t.id, " \u2013 ", t.name, " ", t.krit ? "★" : ""] }), _jsx("div", { style: { position: "relative", height: 18, flex: 1, background: "#f7f7f7" }, children: _jsx("div", { style: { position: "absolute", left: offset, width, height: 18, background: t.krit ? "#c33" : "#3a6", opacity: 0.9 } }) }), _jsxs("div", { style: { width: 160, textAlign: "right" }, children: [t.startDate, " \u2192 ", t.endDate] })] }, t.id));
                        }) })] }))] }));
}
