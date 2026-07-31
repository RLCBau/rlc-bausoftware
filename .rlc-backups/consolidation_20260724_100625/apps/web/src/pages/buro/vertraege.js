import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { DocsDB } from "./store.docs";
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, verticalAlign: "middle" };
const lbl = { fontSize: 13, opacity: .8 };
const inp = { border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };
export default function Dokumente() {
    const [all, setAll] = React.useState(DocsDB.list());
    const [selId, setSelId] = React.useState(all[0]?.id ?? null);
    const [q, setQ] = React.useState("");
    const [tagFilter, setTagFilter] = React.useState("");
    const [zoom, setZoom] = React.useState(1);
    const [showSig, setShowSig] = React.useState(false);
    const sel = all.find(d => d.id === selId) ?? null;
    const cur = sel?.versions[0];
    const refresh = () => setAll(DocsDB.list());
    // helpers to read/patch optional new fields senza rompere tipi
    const getStatus = () => sel?.status || "Entwurf";
    const getSigs = () => sel?.signatures || [];
    const getHist = () => sel?.history || [];
    const patch = (p) => { if (!sel)
        return; DocsDB.upsert({ ...sel, ...p, updatedAt: Date.now() }); refresh(); };
    // actions
    const addDoc = () => { const d = DocsDB.create(); refresh(); setSelId(d.id); };
    const delDoc = () => { if (!sel)
        return; if (!confirm("Dokument löschen?"))
        return; DocsDB.remove(sel.id); refresh(); setSelId(DocsDB.list()[0]?.id ?? null); };
    const update = (patchObj) => { if (!sel)
        return; DocsDB.upsert({ ...sel, ...patchObj }); refresh(); };
    const uploadNewVersion = async () => pickFile(async (f) => { if (!sel)
        return; await DocsDB.addVersion(sel.id, f); addHist("version", `Neue Version: ${f.name}`); refresh(); });
    const onDrop = async (ev) => { ev.preventDefault(); if (!sel)
        return; const f = ev.dataTransfer.files?.[0]; if (!f)
        return; await DocsDB.addVersion(sel.id, f); addHist("version", `Neue Version (Drag&Drop): ${f.name}`); refresh(); };
    const download = (v) => { const a = document.createElement("a"); a.href = v.dataURL; a.download = v.fileName; a.click(); };
    const copyDataURL = async (v) => { await navigator.clipboard.writeText(v.dataURL); alert("DataURL copiato."); };
    // import/export
    const doExportCSV = () => downloadBlob(DocsDB.exportCSV(filtered()), "dokumente.csv", "text/csv;charset=utf-8");
    const doImportCSV = async () => pickFile(async (f) => { const n = DocsDB.importCSV(await f.text()); alert(`${n} Dokumente importiert.`); refresh(); });
    const doExportJSON = () => downloadBlob(DocsDB.exportJSON(), "dokumente_backup.json", "application/json");
    const doImportJSON = async () => pickFile(async (f) => { const n = DocsDB.importJSON(await f.text()); alert(`Backup importato: ${n} Elemente.`); refresh(); });
    // history
    const addHist = (type, message) => {
        if (!sel)
            return;
        const hist = getHist();
        const rec = { id: crypto.randomUUID(), when: Date.now(), type: type === "version" ? "status" : type, message };
        patch({ history: [rec, ...hist] });
    };
    // filters
    const filtered = () => all.filter(d => {
        const s = (d.title + " " + (d.tags ?? []).join(" ")).toLowerCase();
        const okQ = !q || s.includes(q.toLowerCase());
        const okT = !tagFilter || (d.tags ?? []).map(t => t.toLowerCase()).includes(tagFilter.toLowerCase());
        return okQ && okT;
    });
    const allTags = Array.from(new Set(all.flatMap(d => d.tags ?? []))).sort();
    // preview
    const renderPreview = (v) => {
        if (!v)
            return _jsx("div", { style: { opacity: .6 }, children: "Nessuna versione da mostrare." });
        const isPDF = (v.mime || "").includes("pdf") || /\.pdf$/i.test(v.fileName);
        const isImg = (v.mime || "").startsWith("image/") || /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(v.fileName);
        const openNew = () => { const w = window.open(v.dataURL, "_blank"); if (!w)
            alert("Popup bloccato."); };
        return (_jsxs("div", { style: { display: "grid", gridTemplateRows: "auto 1fr", gap: 8, height: "100%" }, children: [_jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("div", { style: { fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: v.fileName, children: v.fileName }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { className: "btn", onClick: () => setZoom(z => Math.max(0.5, z - 0.1)), children: "-" }), _jsxs("div", { style: { minWidth: 60, textAlign: "center" }, children: [Math.round(zoom * 100), "%"] }), _jsx("button", { className: "btn", onClick: () => setZoom(z => Math.min(2, z + 0.1)), children: "+" }), _jsx("button", { className: "btn", onClick: openNew, children: "Apri in nuova scheda" })] }), _jsx("div", { style: { border: "1px solid var(--line)", borderRadius: 8, overflow: "auto", background: "#fff" }, children: isPDF ? (_jsx("iframe", { title: "pdf", src: v.dataURL, style: { width: "100%", height: "100%", border: "0", transform: `scale(${zoom})`, transformOrigin: "0 0" } })) : isImg ? (_jsx("div", { style: { overflow: "auto" }, children: _jsx("img", { src: v.dataURL, alt: v.fileName, style: { width: `${zoom * 100}%`, height: "auto", display: "block" } }) })) : (_jsxs("div", { style: { padding: 12 }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 6 }, children: "Anteprima non supportata." }), _jsxs("div", { style: { opacity: .7, marginBottom: 8 }, children: ["Tipo: ", v.mime || "—"] }), _jsx("button", { className: "btn", onClick: openNew, children: "Apri / Scarica" })] })) })] }));
    };
    // status change
    const changeStatus = (s) => {
        if (!sel)
            return;
        patch({ status: s });
        addHist("status", `Status → ${s}`);
    };
    // signature capture
    const onSigned = (sig) => {
        if (!sel)
            return;
        const all = getSigs();
        const rec = { id: crypto.randomUUID(), when: Date.now(), imgDataURL: sig.imgDataURL, by: sig.by, role: sig.role };
        patch({ signatures: [rec, ...all] });
        addHist("signature", `Signatur von ${sig.by}${sig.role ? " (" + sig.role + ")" : ""}`);
        setShowSig(false);
    };
    return (_jsxs("div", { style: { display: "grid", gridTemplateRows: "auto 1fr", gap: 10, padding: 10 }, children: [_jsxs("div", { className: "card", style: { padding: "8px 10px", display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("button", { className: "btn", onClick: addDoc, children: "+ Dokument" }), _jsx("button", { className: "btn", onClick: delDoc, disabled: !sel, children: "L\u00F6schen" }), _jsx("div", { style: { flex: 1 } }), _jsx("input", { placeholder: "Suchen\u2026", value: q, onChange: e => setQ(e.target.value), style: { ...inp, width: 260 } }), _jsxs("select", { value: tagFilter, onChange: e => setTagFilter(e.target.value), style: { ...inp, width: 160 }, children: [_jsx("option", { value: "", children: "Alle Tags" }), allTags.map(t => _jsx("option", { value: t, children: t }, t))] }), _jsx("button", { className: "btn", onClick: uploadNewVersion, disabled: !sel, children: "Neue Version" }), _jsx("button", { className: "btn", onClick: doImportCSV, children: "Import CSV" }), _jsx("button", { className: "btn", onClick: doExportCSV, children: "Export CSV" }), _jsx("button", { className: "btn", onClick: doImportJSON, children: "Import JSON" }), _jsx("button", { className: "btn", onClick: doExportJSON, children: "Export JSON" })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr min(42vw, 640px)", gap: 10, minHeight: "60vh" }, children: [_jsxs("div", { style: { display: "grid", gridTemplateRows: "minmax(200px, 40vh) auto", gap: 10 }, children: [_jsx("div", { className: "card", style: { padding: 0, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Titel" }), _jsx("th", { style: th, children: "Tags" }), _jsx("th", { style: th, children: "Status" }), _jsx("th", { style: th, children: "Letzte Version" }), _jsx("th", { style: th, children: "Gr\u00F6\u00DFe" }), _jsx("th", { style: th, children: "Ge\u00E4ndert" })] }) }), _jsx("tbody", { children: filtered().map(d => {
                                                const v = d.versions[0];
                                                const st = d.status || "Entwurf";
                                                return (_jsxs("tr", { onClick: () => { setSelId(d.id); setZoom(1); }, style: { cursor: "pointer", background: d.id === selId ? "#f1f5ff" : undefined }, children: [_jsx("td", { style: td, children: d.title }), _jsx("td", { style: td, children: (d.tags ?? []).join(", ") }), _jsx("td", { style: td, children: _jsx("span", { className: "tag", children: st }) }), _jsx("td", { style: td, children: v ? v.fileName : _jsx("i", { children: "\u2014" }) }), _jsx("td", { style: td, children: v ? (v.size / 1024).toFixed(1) + " KB" : "—" }), _jsx("td", { style: td, children: new Date(d.updatedAt).toLocaleString() })] }, d.id));
                                            }) })] }) }), _jsx("div", { className: "card", onDragOver: e => e.preventDefault(), onDrop: onDrop, style: { padding: 12 }, children: !sel ? (_jsx("div", { style: { opacity: .7 }, children: "W\u00E4hle links ein Dokument aus oder erstelle ein neues." })) : (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "150px 1fr 150px 1fr", gap: 10 }, children: [_jsx("label", { style: lbl, children: "Titel" }), _jsx("input", { style: { ...inp, width: "100%" }, value: sel.title, onChange: e => update({ title: e.target.value }) }), _jsx("label", { style: lbl, children: "Tags" }), _jsx("input", { style: { ...inp, width: "100%" }, placeholder: "kommagetrennt", value: (sel.tags ?? []).join(", "), onChange: e => update({ tags: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }) }), _jsx("label", { style: lbl, children: "Projekt-ID" }), _jsx("input", { style: inp, value: sel.projektId ?? "", onChange: e => update({ projektId: e.target.value }) }), _jsx("label", { style: lbl, children: "Status" }), _jsxs("select", { style: inp, value: getStatus(), onChange: e => changeStatus(e.target.value), children: [_jsx("option", { children: "Entwurf" }), _jsx("option", { children: "Freigegeben" }), _jsx("option", { children: "Signiert" })] }), _jsx("label", { style: lbl, children: "Signaturen" }), _jsxs("div", { children: [_jsxs("div", { style: { display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }, children: [_jsx("button", { className: "btn", onClick: () => setShowSig(true), children: "Signatur erfassen" }), _jsxs("small", { style: { opacity: .7 }, children: [getSigs().length, " vorhanden"] })] }), getSigs().length > 0 && (_jsx("div", { style: { display: "grid", gap: 6 }, children: getSigs().map(s => (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("img", { src: s.imgDataURL, alt: "sig", style: { height: 36, border: "1px solid var(--line)", background: "#fff" } }), _jsxs("div", { style: { fontSize: 12 }, children: [s.by, s.role ? ` (${s.role})` : "", " \u00B7 ", new Date(s.when).toLocaleString()] })] }, s.id))) }))] }), _jsx("label", { style: { ...lbl, gridColumn: "1 / -1" }, children: "Versionen (Drag&Drop Datei hier)" }), _jsx("div", { style: { gridColumn: "1 / -1" }, children: !sel.versions.length ? (_jsx("div", { style: { opacity: .7 }, children: "Noch keine Version hochgeladen." })) : (_jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Datei" }), _jsx("th", { style: th, children: "Typ" }), _jsx("th", { style: th, children: "Gr\u00F6\u00DFe" }), _jsx("th", { style: th, children: "Hochgeladen" }), _jsx("th", { style: th })] }) }), _jsx("tbody", { children: sel.versions.map((v, i) => (_jsxs("tr", { style: { background: i === 0 ? "#eef8f0" : undefined }, children: [_jsx("td", { style: td, title: v.fileName, children: v.fileName }), _jsx("td", { style: td, children: v.mime || "—" }), _jsxs("td", { style: td, children: [(v.size / 1024).toFixed(1), " KB"] }), _jsx("td", { style: td, children: new Date(v.uploadedAt).toLocaleString() }), _jsxs("td", { style: { ...td, whiteSpace: "nowrap" }, children: [_jsx("button", { className: "btn", onClick: () => download(v), children: "Download" }), _jsx("button", { className: "btn", onClick: () => copyDataURL(v), children: "Kopiere DataURL" }), i > 0 && _jsx("button", { className: "btn", onClick: () => { DocsDB.restoreVersion(sel.id, v.id); addHist("status", "Version wiederhergestellt"); refresh(); }, children: "Wiederherstellen" })] })] }, v.id))) })] })) }), _jsx("label", { style: { ...lbl, gridColumn: "1 / -1" }, children: "Versionshistorie" }), _jsx("div", { style: { gridColumn: "1 / -1" }, children: getHist().length === 0 ? _jsx("div", { style: { opacity: .7 }, children: "Keine Eintr\u00E4ge." }) : (_jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Zeit" }), _jsx("th", { style: th, children: "Ereignis" })] }) }), _jsx("tbody", { children: getHist().map(h => (_jsxs("tr", { children: [_jsx("td", { style: td, children: new Date(h.when).toLocaleString() }), _jsx("td", { style: td, children: h.message })] }, h.id))) })] })) })] })) })] }), _jsx("div", { className: "card", style: { padding: 12, minHeight: 300 }, children: renderPreview(cur) })] }), showSig && _jsx(SignatureModal, { onClose: () => setShowSig(false), onSave: onSigned })] }));
}
/** ===== Signature Modal (canvas) ===== */
function SignatureModal({ onClose, onSave }) {
    const ref = React.useRef(null);
    const [name, setName] = React.useState("");
    const [role, setRole] = React.useState("Bauleiter");
    React.useEffect(() => {
        const c = ref.current;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        let drawing = false, last = null;
        const pos = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
        const down = (e) => { drawing = true; last = pos(e); };
        const move = (e) => { if (!drawing || !last)
            return; const p = pos(e); const ctx = c.getContext("2d"); ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#111"; ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; };
        const up = () => { drawing = false; last = null; };
        c.addEventListener("pointerdown", down);
        c.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    }, []);
    const clear = () => { const c = ref.current; const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); };
    const save = () => { if (!name.trim()) {
        alert("Name für die Signatur angeben.");
        return;
    } onSave({ imgDataURL: ref.current.toDataURL("image/png"), by: name.trim(), role }); };
    return (_jsx("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", zIndex: 9999 }, children: _jsxs("div", { className: "card", style: { padding: 16, width: 520, display: "grid", gap: 10 }, children: [_jsx("div", { style: { fontWeight: 700, fontSize: 16 }, children: "Digitale Signatur erfassen" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "110px 1fr 110px 1fr", gap: 10 }, children: [_jsx("label", { style: lbl, children: "Name" }), _jsx("input", { style: inp, value: name, onChange: e => setName(e.target.value), placeholder: "z. B. Max Mustermann" }), _jsx("label", { style: lbl, children: "Rolle" }), _jsx("input", { style: inp, value: role, onChange: e => setRole(e.target.value), placeholder: "Bauleiter / Auftraggeber" }), _jsx("div", { style: { gridColumn: "1 / -1" }, children: _jsx("canvas", { ref: ref, width: 480, height: 180, style: { border: "1px solid var(--line)", borderRadius: 6, background: "#fff", touchAction: "none" } }) }), _jsxs("div", { style: { gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }, children: [_jsx("button", { className: "btn", onClick: clear, children: "Leeren" }), _jsx("button", { className: "btn", onClick: onClose, children: "Abbrechen" }), _jsx("button", { className: "btn", onClick: save, children: "Speichern" })] })] })] }) }));
}
// ==== utils UI ====
function pickFile(onPick) {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.onchange = () => { const f = inp.files?.[0]; if (f)
        onPick(f); };
    inp.click();
}
function downloadBlob(text, name, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
}
