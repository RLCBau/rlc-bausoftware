import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// apps/web/src/pages/regie/Regie.tsx
import React from "react";
import { listRegie, createRegie, deleteRegie } from "../../api/regie";
export default function RegiePage() {
    const [rows, setRows] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    // form state
    const [projectId, setProjectId] = React.useState("demo-project");
    const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
    const [worker, setWorker] = React.useState("");
    const [hours, setHours] = React.useState("");
    const [machine, setMachine] = React.useState("");
    const [material, setMaterial] = React.useState("");
    const [quantity, setQuantity] = React.useState("");
    const [unit, setUnit] = React.useState("");
    const [comment, setComment] = React.useState("");
    const [lvItemId, setLvItemId] = React.useState("");
    const load = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await listRegie(projectId || undefined);
            setRows(data);
        }
        catch (e) {
            setError(e?.message || "Fehler beim Laden");
        }
        finally {
            setLoading(false);
        }
    }, [projectId]);
    React.useEffect(() => { load(); }, [load]);
    async function onSave(e) {
        e.preventDefault();
        setError(null);
        try {
            const item = await createRegie({
                projectId,
                date: new Date(date).toISOString(),
                worker: empty(worker),
                hours: toNum(hours),
                machine: empty(machine),
                material: empty(material),
                quantity: toNum(quantity),
                unit: empty(unit),
                comment: empty(comment),
                lvItemId: empty(lvItemId),
            });
            setRows(r => [item, ...r]);
            // reset “soft”
            setWorker("");
            setHours("");
            setMachine("");
            setMaterial("");
            setQuantity("");
            setUnit("");
            setComment("");
            setLvItemId("");
        }
        catch (e) {
            setError(e?.message || "Speichern fehlgeschlagen");
        }
    }
    async function onDelete(id) {
        if (!confirm("Eintrag löschen?"))
            return;
        try {
            await deleteRegie(id);
            setRows(r => r.filter(x => x.id !== id));
        }
        catch (e) {
            alert(e?.message || "Löschen fehlgeschlagen");
        }
    }
    const sumHours = rows.reduce((a, r) => a + (r.hours || 0), 0);
    const sumQty = rows.reduce((a, r) => a + (r.quantity || 0), 0);
    return (_jsxs("div", { style: { padding: 16 }, children: [_jsx("h2", { style: { margin: "0 0 12px" }, children: "Regieberichte" }), _jsx("div", { className: "card", style: card, children: _jsxs("div", { style: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }, children: [_jsxs("label", { children: [_jsx("span", { style: lbl, children: "Projekt-ID" }), _jsx("input", { value: projectId, onChange: e => setProjectId(e.target.value), style: inp })] }), _jsx("button", { className: "btn", onClick: load, children: "Aktualisieren" }), loading && _jsx("span", { children: "l\u00E4dt\u2026" }), error && _jsx("span", { style: { color: "crimson" }, children: error })] }) }), _jsxs("form", { className: "card", style: card, onSubmit: onSave, children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 12 }, children: [_jsxs("label", { children: [_jsx("span", { style: lbl, children: "Datum" }), _jsx("input", { type: "date", value: date, onChange: e => setDate(e.target.value), style: inp })] }), _jsxs("label", { children: [_jsx("span", { style: lbl, children: "Mitarbeiter" }), _jsx("input", { value: worker, onChange: e => setWorker(e.target.value), style: inp })] }), _jsxs("label", { children: [_jsx("span", { style: lbl, children: "Stunden" }), _jsx("input", { type: "number", step: "0.25", value: hours, onChange: e => setHours(e.target.value), style: inp })] }), _jsxs("label", { children: [_jsx("span", { style: lbl, children: "Maschine" }), _jsx("input", { value: machine, onChange: e => setMachine(e.target.value), style: inp })] }), _jsxs("label", { children: [_jsx("span", { style: lbl, children: "Material" }), _jsx("input", { value: material, onChange: e => setMaterial(e.target.value), style: inp })] }), _jsxs("label", { children: [_jsx("span", { style: lbl, children: "Menge" }), _jsx("input", { type: "number", step: "0.01", value: quantity, onChange: e => setQuantity(e.target.value), style: inp })] }), _jsxs("label", { children: [_jsx("span", { style: lbl, children: "Einheit" }), _jsx("input", { value: unit, onChange: e => setUnit(e.target.value), style: inp })] }), _jsxs("label", { children: [_jsx("span", { style: lbl, children: "LV-Position (optional)" }), _jsx("input", { value: lvItemId, onChange: e => setLvItemId(e.target.value), style: inp })] }), _jsxs("label", { style: { gridColumn: "1 / -1" }, children: [_jsx("span", { style: lbl, children: "Bemerkung" }), _jsx("input", { value: comment, onChange: e => setComment(e.target.value), style: inp })] })] }), _jsx("div", { style: { marginTop: 12 }, children: _jsx("button", { className: "btn", children: "Speichern" }) })] }), _jsx("div", { className: "card", style: card, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Datum" }), _jsx("th", { style: th, children: "Mitarbeiter" }), _jsx("th", { style: th, children: "Std." }), _jsx("th", { style: th, children: "Maschine" }), _jsx("th", { style: th, children: "Material" }), _jsx("th", { style: th, children: "Menge" }), _jsx("th", { style: th, children: "Einheit" }), _jsx("th", { style: th, children: "LV" }), _jsx("th", { style: th, children: "Bemerkung" }), _jsx("th", { style: th })] }) }), _jsx("tbody", { children: rows.length === 0 ? (_jsx("tr", { children: _jsx("td", { style: { ...td, textAlign: "center" }, colSpan: 10, children: "Noch keine Eintr\u00E4ge." }) })) : rows.map(r => (_jsxs("tr", { children: [_jsx("td", { style: td, children: (r.date || "").slice(0, 10) }), _jsx("td", { style: td, children: r.worker || "" }), _jsx("td", { style: { ...td, textAlign: "right", whiteSpace: "nowrap" }, children: (r.hours ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 }) }), _jsx("td", { style: td, children: r.machine || "" }), _jsx("td", { style: td, children: r.material || "" }), _jsx("td", { style: { ...td, textAlign: "right", whiteSpace: "nowrap" }, children: (r.quantity ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 }) }), _jsx("td", { style: td, children: r.unit || "" }), _jsx("td", { style: td, children: r.lvItemId || "" }), _jsx("td", { style: td, children: r.comment || "" }), _jsx("td", { style: { ...td, textAlign: "right" }, children: _jsx("button", { className: "btn", onClick: () => onDelete(r.id), children: "L\u00F6schen" }) })] }, r.id))) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { style: td, colSpan: 2, children: _jsx("b", { children: "Summen" }) }), _jsx("td", { style: { ...td, textAlign: "right", fontWeight: 700 }, children: sumHours.toLocaleString(undefined, { maximumFractionDigits: 2 }) }), _jsx("td", { style: td }), _jsx("td", { style: td }), _jsx("td", { style: { ...td, textAlign: "right", fontWeight: 700 }, children: sumQty.toLocaleString(undefined, { maximumFractionDigits: 3 }) }), _jsx("td", { style: td }), _jsx("td", { style: td }), _jsx("td", { style: td }), _jsx("td", { style: td })] }) })] }) })] }));
}
/* ===== UI helpers ===== */
const card = { padding: 12, border: "1px solid var(--line, #ddd)", marginBottom: 12, borderRadius: 6, background: "#fff" };
const lbl = { display: "block", fontSize: 12, color: "#666", marginBottom: 4 };
const inp = { width: "100%", padding: "6px 8px", border: "1px solid #ccc", borderRadius: 4 };
const th = { textAlign: "left", fontWeight: 700, padding: "8px 10px", borderBottom: "1px solid #ddd", whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid #eee", verticalAlign: "middle" };
function toNum(v) {
    if (!v?.trim())
        return null;
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
}
function empty(v) {
    return v?.trim() ? v.trim() : undefined;
}
