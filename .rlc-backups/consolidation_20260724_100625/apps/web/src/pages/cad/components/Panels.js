import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
export function Panel(props) {
    return (_jsxs("div", { style: { border: "1px solid #e6e6e6", borderRadius: 8, background: "#ffffff" }, children: [_jsx("div", { style: { padding: "6px 8px", borderBottom: "1px solid #eee", fontWeight: 600, fontSize: 12 }, children: props.title }), _jsx("div", { style: { padding: 8, display: "flex", flexDirection: "column", gap: 6 }, children: props.children })] }));
}
export default function LeftPanels({ doc, setDoc, selected, apply, undo, redo, cmdHistory, snapsUi, filesUi, settingsUi }) {
    return (_jsxs("div", { style: { width: 310, borderRight: "1px solid #eee", padding: "8px", display: "flex", flexDirection: "column", gap: 8, background: "#fafafa" }, children: [_jsxs(Panel, { title: "Layers", children: [_jsxs("div", { style: { display: "flex", gap: 6, marginBottom: 6 }, children: [_jsx("input", { placeholder: "New layer name", id: "newLayerName", style: { flex: 1, padding: "4px 6px", border: "1px solid #ddd", borderRadius: 4 } }), _jsx("button", { onClick: () => {
                                    const el = document.getElementById("newLayerName");
                                    const name = (el.value || "").trim() || `L${doc.layers.length + 1}`;
                                    const id = Math.random().toString(36).slice(2);
                                    const nl = { id, name, color: "#333333", visible: true, locked: false, lineWidth: 1 };
                                    setDoc(d => ({ ...d, layers: [...d.layers, nl], currentLayerId: id }));
                                    el.value = "";
                                }, children: "\uFF0B" })] }), _jsx("div", { style: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflow: "auto" }, children: doc.layers.map(l => (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "18px 18px 1fr 60px 18px 22px", alignItems: "center", gap: 6, padding: "4px 6px", border: "1px solid #eaeaea", borderRadius: 6, background: doc.currentLayerId === l.id ? "#fff" : "#f7f7f7" }, children: [_jsx("input", { type: "color", value: l.color, onChange: (e) => setDoc(d => ({ ...d, layers: d.layers.map(x => x.id === l.id ? { ...x, color: e.target.value } : x) })) }), _jsx("input", { type: "checkbox", title: "Visible", checked: l.visible, onChange: (e) => setDoc(d => ({ ...d, layers: d.layers.map(x => x.id === l.id ? { ...x, visible: e.target.checked } : x) })) }), _jsx("input", { value: l.name, onChange: (e) => setDoc(d => ({ ...d, layers: d.layers.map(x => x.id === l.id ? { ...x, name: e.target.value } : x) })), style: { width: "100%", border: "none", background: "transparent" } }), _jsx("select", { value: l.lineWidth, onChange: (e) => setDoc(d => ({ ...d, layers: d.layers.map(x => x.id === l.id ? { ...x, lineWidth: Number(e.target.value) } : x) })), children: [0.5, 1, 1.5, 2, 3].map(w => _jsxs("option", { value: w, children: [w, "px"] }, w)) }), _jsx("input", { type: "checkbox", title: "Lock", checked: l.locked, onChange: (e) => setDoc(d => ({ ...d, layers: d.layers.map(x => x.id === l.id ? { ...x, locked: e.target.checked } : x) })) }), _jsx("button", { title: "Set current", onClick: () => setDoc(d => ({ ...d, currentLayerId: l.id })), style: { fontSize: 11, padding: "2px 4px" }, children: "\u25CF" })] }, l.id))) })] }), _jsx(Panel, { title: "Properties", children: selected.length === 0 ? (_jsx("div", { style: { color: "#777" }, children: "Nessuna selezione" })) : (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [_jsxs("div", { style: { fontSize: 12, color: "#555" }, children: [selected.length, " entit\u00E0"] }), _jsxs("label", { style: { fontSize: 12 }, children: ["Layer:", _jsx("select", { value: selected[0].layerId, onChange: (e) => {
                                        const layId = e.target.value;
                                        for (const ent of selected) {
                                            const before = JSON.parse(JSON.stringify(ent));
                                            const after = { ...before, layerId: layId };
                                            apply({ kind: "update", before, after });
                                        }
                                    }, children: doc.layers.map(l => _jsx("option", { value: l.id, children: l.name }, l.id)) })] }), _jsxs("label", { style: { fontSize: 12 }, children: ["Color:", _jsx("input", { type: "color", value: selected[0].style.color, onChange: (e) => {
                                        for (const ent of selected) {
                                            const before = JSON.parse(JSON.stringify(ent));
                                            const after = { ...before, style: { ...ent.style, color: e.target.value } };
                                            apply({ kind: "update", before, after });
                                        }
                                    } })] }), _jsxs("label", { style: { fontSize: 12 }, children: ["Line width:", _jsx("select", { value: selected[0].style.lineWidth, onChange: (e) => {
                                        const lw = Number(e.target.value);
                                        for (const ent of selected) {
                                            const before = JSON.parse(JSON.stringify(ent));
                                            const after = { ...before, style: { ...ent.style, lineWidth: lw } };
                                            apply({ kind: "update", before, after });
                                        }
                                    }, children: [0.5, 1, 1.5, 2, 3].map(w => _jsxs("option", { value: w, children: [w, "px"] }, w)) })] }), selected[0].kind === "TEXT" && (() => {
                            const t = selected[0];
                            return (_jsxs(_Fragment, { children: [_jsxs("label", { style: { fontSize: 12 }, children: ["Text:", _jsx("input", { value: t.text, onChange: (e) => {
                                                    const val = e.target.value;
                                                    for (const ent of selected)
                                                        if (ent.kind === "TEXT") {
                                                            const before = JSON.parse(JSON.stringify(ent));
                                                            const after = { ...before, text: val };
                                                            apply({ kind: "update", before, after });
                                                        }
                                                } })] }), _jsxs("label", { style: { fontSize: 12 }, children: ["Height:", _jsx("input", { type: "number", step: 0.1, value: t.height, onChange: (e) => {
                                                    const h = Number(e.target.value) || t.height;
                                                    for (const ent of selected)
                                                        if (ent.kind === "TEXT") {
                                                            const before = JSON.parse(JSON.stringify(ent));
                                                            const after = { ...before, height: h };
                                                            apply({ kind: "update", before, after });
                                                        }
                                                } })] }), _jsxs("label", { style: { fontSize: 12 }, children: ["Rotation:", _jsx("input", { type: "number", step: 1, value: t.rotation || 0, onChange: (e) => {
                                                    const r = Number(e.target.value) || 0;
                                                    for (const ent of selected)
                                                        if (ent.kind === "TEXT") {
                                                            const before = JSON.parse(JSON.stringify(ent));
                                                            const after = { ...before, rotation: r };
                                                            apply({ kind: "update", before, after });
                                                        }
                                                } })] })] }));
                        })(), selected[0].kind === "CIRCLE" && (() => {
                            const c = selected[0];
                            return (_jsxs("label", { style: { fontSize: 12 }, children: ["Radius:", _jsx("input", { type: "number", step: 0.01, value: c.r, onChange: (e) => {
                                            const r = Math.max(0.0001, Number(e.target.value) || c.r);
                                            for (const ent of selected)
                                                if (ent.kind === "CIRCLE") {
                                                    const before = JSON.parse(JSON.stringify(ent));
                                                    const after = { ...before, r };
                                                    apply({ kind: "update", before, after });
                                                }
                                        } })] }));
                        })()] })) }), _jsxs(Panel, { title: "Snaps & Settings", children: [settingsUi, snapsUi] }), _jsxs(Panel, { title: "Blocks", children: [_jsxs("div", { style: { display: "flex", gap: 6, alignItems: "center" }, children: [_jsx("input", { id: "blkName", placeholder: "Nome blocco", style: { flex: 1, padding: "4px 6px", border: "1px solid #ddd", borderRadius: 4 } }), _jsx("button", { onClick: () => {
                                    const inp = document.getElementById("blkName");
                                    const name = (inp.value || "").trim();
                                    if (!name) {
                                        alert("Nome blocco vuoto");
                                        return;
                                    }
                                    if (!doc.blocks)
                                        doc.blocks = {};
                                    const sel = selected;
                                    if (sel.length === 0) {
                                        alert("Nessuna selezione");
                                        return;
                                    }
                                    const pts = [];
                                    sel.forEach(e => {
                                        if (e.kind === "LINE") {
                                            pts.push(e.a, e.b);
                                        }
                                        else if (e.kind === "RECT") {
                                            pts.push(e.a, e.b);
                                        }
                                        else if (e.kind === "CIRCLE") {
                                            pts.push(e.c);
                                        }
                                        else if (e.kind === "POLYLINE") {
                                            pts.push(...e.pts);
                                        }
                                    });
                                    const base = pts.length ? {
                                        x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
                                        y: pts.reduce((a, p) => a + p.y, 0) / pts.length
                                    } : { x: 0, y: 0 };
                                    const lib = { ...(doc.blocks || {}), [name]: { base, ents: sel.map(e => JSON.parse(JSON.stringify(e))) } };
                                    setDoc({ ...doc, blocks: lib });
                                    inp.value = "";
                                    alert("Blocco salvato");
                                }, children: "Crea" })] }), _jsxs("div", { style: { display: "flex", gap: 6, alignItems: "center", marginTop: 6 }, children: [_jsx("select", { id: "blkPick", style: { flex: 1 }, children: Object.keys(doc.blocks || {}).map(k => _jsx("option", { value: k, children: k }, k)) }), _jsx("button", { onClick: () => {
                                    const sel = document.getElementById("blkPick")?.value;
                                    if (!sel) {
                                        alert("Nessun blocco");
                                        return;
                                    }
                                    const ev = new CustomEvent("rlc-insert-block", { detail: { name: sel } });
                                    window.dispatchEvent(ev);
                                }, children: "Inserisci" })] })] }), _jsxs(Panel, { title: "History", children: [_jsx("div", { style: { maxHeight: 120, overflow: "auto", fontFamily: "monospace", fontSize: 12 }, children: cmdHistory.map((h, i) => _jsx("div", { children: "> " + h }, i)) }), _jsxs("div", { style: { display: "flex", gap: 6, marginTop: 6 }, children: [_jsx("button", { onClick: undo, children: "Undo" }), _jsx("button", { onClick: redo, children: "Redo" })] })] }), _jsx(Panel, { title: "Files", children: filesUi })] }));
}
