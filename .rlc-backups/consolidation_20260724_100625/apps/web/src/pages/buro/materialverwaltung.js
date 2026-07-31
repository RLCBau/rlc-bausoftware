import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { MaterialDB } from "./store.material";
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, verticalAlign: "middle" };
const inp = { border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };
const lbl = { fontSize: 12, opacity: .8 };
export default function Materialverwaltung() {
    const [all, setAll] = React.useState(MaterialDB.list());
    const [sel, setSel] = React.useState(all[0] ?? null);
    const [q, setQ] = React.useState("");
    const [proj, setProj] = React.useState("");
    const [onlyLow, setOnlyLow] = React.useState(false);
    const refresh = () => setAll(MaterialDB.list());
    const filtered = () => all.filter(m => {
        const s = (m.name + " " + (m.code ?? "") + " " + (m.projectId ?? "") + " " + (m.location ?? "")).toLowerCase();
        const okQ = !q || s.includes(q.toLowerCase());
        const okP = !proj || (m.projectId ?? "") === proj;
        const okL = !onlyLow || ((m.stock ?? 0) <= (m.minStock ?? 0));
        return okQ && okP && okL;
    });
    const projects = Array.from(new Set(all.map(m => m.projectId).filter(Boolean)));
    const add = () => { const it = MaterialDB.create(); refresh(); setSel(it); };
    const del = () => { if (!sel)
        return; if (!confirm("Artikel löschen?"))
        return; MaterialDB.remove(sel.id); refresh(); setSel(MaterialDB.list()[0] ?? null); };
    // ✅ FIX scrittura
    const up = (p) => {
        if (!sel)
            return;
        const next = { ...sel, ...p, updatedAt: Date.now() };
        setSel(next);
        MaterialDB.upsert(next);
        setAll(MaterialDB.list());
    };
    const move = (dir) => {
        if (!sel)
            return;
        const qty = Number(prompt(dir === "IN" ? "Eingang Menge:" : "Ausgang Menge:", "1"));
        if (!qty || qty <= 0)
            return;
        const m = { id: crypto.randomUUID(), when: new Date().toISOString(), dir, qty, projectId: sel.projectId || "", note: "" };
        MaterialDB.addMove(sel.id, m);
        refresh();
    };
    const onDrop = async (ev) => { ev.preventDefault(); if (!sel)
        return; const f = ev.dataTransfer.files?.[0]; if (!f)
        return; await MaterialDB.attach(sel.id, f); refresh(); };
    const open = (a) => { const w = window.open(a.dataURL, "_blank"); if (!w)
        alert("Popup blockiert."); };
    const importCSV = () => pickFile(async (f) => { const n = MaterialDB.importCSV(await f.text()); alert(`Import: ${n} Artikel.`); refresh(); });
    const exportCSV = () => download("text/csv;charset=utf-8", "material.csv", MaterialDB.exportCSV(filtered()));
    const exportJSON = () => download("application/json", "material_backup.json", MaterialDB.exportJSON());
    const importJSON = () => pickFile(async (f) => { const n = MaterialDB.importJSON(await f.text()); alert(`Backup importiert: ${n}.`); refresh(); });
    const printLabel = () => {
        if (!sel)
            return;
        const html = `
      <html><body style="font-family:Inter,Arial;padding:12px">
      <div style="border:1px solid #333;padding:10px;width:280px">
        <div style="font-weight:700">${escapeHtml(sel.name || "")}</div>
        <div>${escapeHtml(sel.code || "")}</div>
        <div style="font-size:12;opacity:.8">${escapeHtml(sel.location || "")}</div>
      </div>
      <script>window.print();</script></body></html>`;
        const w = window.open("", "_blank");
        if (!w)
            return alert("Popup blockiert.");
        w.document.write(html);
        w.document.close();
    };
    return (_jsxs("div", { style: { display: "grid", gridTemplateRows: "auto 1fr", gap: 10, padding: 10 }, children: [_jsxs("div", { className: "card", style: { padding: "8px 10px", display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("button", { className: "btn", onClick: add, children: "+ Artikel" }), _jsx("button", { className: "btn", onClick: del, disabled: !sel, children: "L\u00F6schen" }), _jsx("div", { style: { flex: 1 } }), _jsx("input", { placeholder: "Suche Name / Code / Projekt\u2026", value: q, onChange: e => setQ(e.target.value), style: { ...inp, width: 280 } }), _jsxs("select", { value: proj, onChange: e => setProj(e.target.value), style: { ...inp, width: 160 }, children: [_jsx("option", { value: "", children: "Alle Projekte" }), projects.map(p => _jsx("option", { value: p, children: p }, p))] }), _jsxs("label", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("input", { type: "checkbox", checked: onlyLow, onChange: e => setOnlyLow(e.target.checked) }), " ", _jsx("span", { style: { fontSize: 13 }, children: "nur Unterbestand" })] }), _jsx("button", { className: "btn", onClick: importCSV, children: "Import CSV" }), _jsx("button", { className: "btn", onClick: exportCSV, children: "Export CSV" }), _jsx("button", { className: "btn", onClick: importJSON, children: "Import JSON" }), _jsx("button", { className: "btn", onClick: exportJSON, children: "Export JSON" })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "minmax(520px,48vw) 1fr", gap: 10, minHeight: "60vh" }, children: [_jsx("div", { className: "card", style: { padding: 0, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Name" }), _jsx("th", { style: th, children: "Code" }), _jsx("th", { style: th, children: "Projekt" }), _jsx("th", { style: th, children: "Ort" }), _jsx("th", { style: th, children: "Einheit" }), _jsx("th", { style: th, children: "Bestand" }), _jsx("th", { style: th, children: "min" }), _jsx("th", { style: th, children: "Preis Netto" })] }) }), _jsxs("tbody", { children: [filtered().map(it => {
                                            const low = (it.stock ?? 0) <= (it.minStock ?? 0);
                                            return (_jsxs("tr", { onClick: () => setSel(it), style: { cursor: "pointer", background: sel?.id === it.id ? "#f1f5ff" : undefined }, children: [_jsx("td", { style: td, children: _jsx("b", { children: it.name }) }), _jsx("td", { style: td, children: it.code || "—" }), _jsx("td", { style: td, children: it.projectId || "—" }), _jsx("td", { style: td, children: it.location || "—" }), _jsx("td", { style: td, children: it.unit || "—" }), _jsx("td", { style: { ...td, color: low ? "#c03" : undefined }, children: it.stock ?? 0 }), _jsx("td", { style: td, children: it.minStock ?? 0 }), _jsx("td", { style: td, children: it.priceNet ? `${it.priceNet.toFixed(2)} €` : "—" })] }, it.id));
                                        }), filtered().length === 0 && _jsx("tr", { children: _jsx("td", { style: { ...td, opacity: .6 }, colSpan: 8, children: "Keine Artikel." }) })] })] }) }), _jsx("div", { className: "card", onDragOver: e => e.preventDefault(), onDrop: onDrop, style: { padding: 12 }, children: !sel ? _jsx("div", { style: { opacity: .7 }, children: "Links Artikel w\u00E4hlen oder neu anlegen." }) : (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "130px 1fr 130px 1fr", gap: 10 }, children: [_jsx("label", { style: lbl, children: "Name" }), _jsx("input", { style: inp, value: sel.name, onChange: e => up({ name: e.target.value }) }), _jsx("label", { style: lbl, children: "Code (Barcode/RFID)" }), _jsx("input", { style: inp, value: sel.code ?? "", onChange: e => up({ code: e.target.value }) }), _jsx("label", { style: lbl, children: "Projekt-ID" }), _jsx("input", { style: inp, value: sel.projectId ?? "", onChange: e => up({ projectId: e.target.value }) }), _jsx("label", { style: lbl, children: "Ort/Lager" }), _jsx("input", { style: inp, value: sel.location ?? "", onChange: e => up({ location: e.target.value }) }), _jsx("label", { style: lbl, children: "Einheit" }), _jsx("input", { style: inp, value: sel.unit ?? "", onChange: e => up({ unit: e.target.value }) }), _jsx("label", { style: lbl, children: "Bestand" }), _jsx("input", { type: "number", style: inp, value: sel.stock ?? 0, onChange: e => up({ stock: +e.target.value }) }), _jsx("label", { style: lbl, children: "Mindestbestand" }), _jsx("input", { type: "number", style: inp, value: sel.minStock ?? 0, onChange: e => up({ minStock: +e.target.value }) }), _jsx("label", { style: lbl, children: "Preis Netto (\u20AC)" }), _jsx("input", { type: "number", step: "0.01", style: inp, value: sel.priceNet ?? 0, onChange: e => up({ priceNet: +e.target.value }) }), _jsx("label", { style: lbl, children: "Lieferant" }), _jsx("input", { style: inp, value: sel.supplier ?? "", onChange: e => up({ supplier: e.target.value }) }), _jsxs("div", { style: { gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }, children: [_jsx("button", { className: "btn", onClick: () => move("IN"), children: "+ Eingang" }), _jsx("button", { className: "btn", onClick: () => move("OUT"), children: "\u2212 Ausgang" }), _jsx("button", { className: "btn", onClick: printLabel, children: "Etikett drucken" })] }), _jsx("label", { style: { ...lbl, gridColumn: "1 / -1" }, children: "Bewegungen" }), _jsx("div", { style: { gridColumn: "1 / -1" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Datum" }), _jsx("th", { style: th, children: "Typ" }), _jsx("th", { style: th, children: "Menge" }), _jsx("th", { style: th, children: "Projekt" }), _jsx("th", { style: th, children: "Notiz" })] }) }), _jsxs("tbody", { children: [(sel.moves || []).slice().sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()).map(m => (_jsxs("tr", { children: [_jsx("td", { style: td, children: new Date(m.when).toLocaleString() }), _jsx("td", { style: td, children: m.dir }), _jsx("td", { style: td, children: m.qty }), _jsx("td", { style: td, children: m.projectId || "—" }), _jsx("td", { style: td, children: m.note || "—" })] }, m.id))), (sel.moves || []).length === 0 && _jsx("tr", { children: _jsx("td", { style: { ...td, opacity: .6 }, colSpan: 5, children: "Keine Bewegungen." }) })] })] }) }), _jsx("label", { style: { ...lbl, gridColumn: "1 / -1" }, children: "Dokumente / Bilder (Drag&Drop)" }), _jsxs("div", { style: { gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8 }, children: [(sel.attachments || []).map(a => (_jsxs("div", { style: { border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", background: "#fff" }, children: [_jsxs("div", { style: { padding: "6px 8px", fontSize: 12, display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("b", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: a.name }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { className: "btn", onClick: () => open(a), children: "\u00D6ffnen" })] }), ((a.mime || "").startsWith("image/")) && _jsx("img", { src: a.dataURL, alt: a.name, style: { width: "100%", height: "auto" } })] }, a.id))), (sel.attachments || []).length === 0 && _jsx("div", { style: { opacity: .6 }, children: "Keine Anh\u00E4nge." })] })] })) })] })] }));
}
function escapeHtml(s) { return s.replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
function pickFile(onPick) { const i = document.createElement("input"); i.type = "file"; i.onchange = () => { const f = i.files?.[0]; if (f)
    onPick(f); }; i.click(); }
function download(type, name, data) { const b = new Blob([data], { type }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
