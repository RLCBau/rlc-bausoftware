import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// apps/web/src/pages/mengenermittlung/VerknuepfungNachtraege.tsx
import React from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { exportNachtragPdf } from "../../../api/pdf";
import * as XLSX from "xlsx";
/* ===== Utils ===== */
const rid = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
async function api(url, init) {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
const num = (v, d = 2) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "";
};
const isImg = (t) => !!t && t.startsWith("image/");
const isPdf = (t) => t === "application/pdf";
const guessType = (name) => {
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif"].includes(ext))
        return `image/${ext === "jpg" ? "jpeg" : ext}`;
    if (ext === "pdf")
        return "application/pdf";
    return "application/octet-stream";
};
async function urlToDataURL(url, prefer = "image/jpeg") {
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        try {
            const bmp = await createImageBitmap(blob);
            const c = document.createElement("canvas");
            c.width = bmp.width;
            c.height = bmp.height;
            c.getContext("2d").drawImage(bmp, 0, 0);
            return c.toDataURL(prefer);
        }
        catch {
            if (blob.type.startsWith("image/")) {
                const r = new FileReader();
                return await new Promise(resolve => { r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
            }
            return null;
        }
    }
    catch {
        return null;
    }
}
/* ===== Component ===== */
export default function VerknuepfungNachtraege() {
    const [projectId, setProjectId] = React.useState("");
    const [lvSearch, setLvSearch] = React.useState("");
    const [lvList, setLvList] = React.useState([]);
    const [selectedLV, setSelectedLV] = React.useState(null);
    const [rows, setRows] = React.useState([]);
    const [selIdx, setSelIdx] = React.useState(null);
    const [form, setForm] = React.useState({
        projectId: "", status: "offen", qty: 0, ep: 0, total: 0, attachments: []
    });
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [previewUrl, setPreviewUrl] = React.useState(null);
    /* Load LV */
    async function loadLV() {
        setError(null);
        if (!projectId) {
            setLvList([]);
            setSelectedLV(null);
            return;
        }
        setLoading(true);
        try {
            const res = await api(`/api/lv/positions?projectId=${encodeURIComponent(projectId)}`);
            setLvList(res.items || []);
        }
        catch (e) {
            console.warn("LV load fallback:", e);
            setLvList([]); // puoi inserire lvPos manualmente
        }
        finally {
            setLoading(false);
        }
    }
    /* Load Nachträge */
    const loadNachtraege = React.useCallback(async () => {
        setError(null);
        if (!projectId) {
            setRows([]);
            return;
        }
        setLoading(true);
        try {
            const url = selectedLV?.id
                ? `/api/nachtraege?projectId=${encodeURIComponent(projectId)}&lvPosId=${encodeURIComponent(selectedLV.id)}`
                : `/api/nachtraege?projectId=${encodeURIComponent(projectId)}`;
            const res = await api(url);
            const list = (res.items || []).map(n => ({ ...n, total: (n.qty || 0) * (n.ep || 0) }));
            setRows(list);
        }
        catch (e) {
            // fallback localStorage
            const key = `nt:${projectId}`;
            const list = JSON.parse(localStorage.getItem(key) || "[]");
            setRows(selectedLV ? list.filter(n => n.lvPosId === selectedLV.id || n.lvPos === selectedLV.pos) : list);
            setError("Offline gespeichert (LS). Serverfehler.");
        }
        finally {
            setLoading(false);
        }
    }, [projectId, selectedLV]);
    React.useEffect(() => { if (projectId)
        loadNachtraege(); }, [projectId, selectedLV, loadNachtraege]);
    /* Helpers */
    function setF(k, v) {
        setForm(prev => {
            const next = { ...prev, [k]: v };
            if (k === "qty" || k === "ep")
                next.total = (Number(next.qty) || 0) * (Number(next.ep) || 0);
            return next;
        });
    }
    function clearForm() {
        setSelIdx(null);
        setForm({
            projectId,
            lvPosId: selectedLV?.id ?? null,
            lvPos: selectedLV?.pos ?? null,
            number: "",
            title: "",
            qty: 0,
            unit: selectedLV?.unit ?? "",
            ep: selectedLV?.ep ?? 0,
            total: 0,
            status: "offen",
            note: "",
            attachments: [],
        });
    }
    function selectRow(i) {
        setSelIdx(i);
        setForm({ ...rows[i], attachments: rows[i].attachments || [] });
    }
    function persistLocal(next) {
        if (!projectId)
            return;
        localStorage.setItem(`nt:${projectId}`, JSON.stringify(next ?? rows));
    }
    /* Save / Delete */
    async function save() {
        if (!projectId)
            return alert("Projekt-ID fehlt.");
        const base = {
            ...form,
            projectId,
            lvPosId: selectedLV?.id ?? form.lvPosId ?? null,
            lvPos: selectedLV?.pos ?? form.lvPos ?? null,
            total: (Number(form.qty) || 0) * (Number(form.ep) || 0)
        };
        try {
            setError(null);
            if (base.id) {
                setRows(prev => prev.map(r => (r.id === base.id ? base : r)));
                await api(`/api/nachtraege/${base.id}`, { method: "PUT", body: JSON.stringify(base) });
            }
            else {
                const optimisticId = rid();
                setRows(prev => [{ ...base, id: optimisticId }, ...prev]);
                const res = await api(`/api/nachtraege`, { method: "POST", body: JSON.stringify(base) });
                const saved = { ...res.item, total: (res.item.qty || 0) * (res.item.ep || 0) };
                setRows(prev => prev.map(r => (r.id === optimisticId ? saved : r)));
            }
            persistLocal();
            clearForm();
        }
        catch (e) {
            console.warn("Save fallback:", e);
            const withId = base.id ? base : { ...base, id: rid() };
            const next = [withId, ...rows];
            setRows(next);
            persistLocal(next);
            clearForm();
            setError("Offline gespeichert (LS). Serverfehler.");
        }
    }
    async function removeRow(r, i) {
        const next = rows.filter((_, idx) => idx !== i);
        setRows(next);
        persistLocal(next);
        try {
            if (r.id)
                await api(`/api/nachtraege/${r.id}`, { method: "DELETE" });
        }
        catch { /* ignore */ }
        if (selIdx === i)
            clearForm();
    }
    /* Attachments */
    function addFiles(list) {
        if (!list)
            return;
        const arr = Array.from(list).map(f => ({
            id: rid(), name: f.name, url: URL.createObjectURL(f), type: f.type || guessType(f.name)
        }));
        setForm(p => ({ ...p, attachments: [...(p.attachments || []), ...arr] }));
    }
    function removeAttachment(id) {
        setForm(p => ({ ...p, attachments: (p.attachments || []).filter(a => a.id !== id) }));
    }
    /* Export */
    function exportXlsx() {
        if (!rows.length)
            return alert("Keine Daten.");
        const data = rows.map(r => ({
            "NT-Nr.": r.number ?? "",
            Titel: r.title ?? "",
            "LV-Pos": r.lvPos ?? "",
            Menge: r.qty ?? 0,
            Einheit: r.unit ?? "",
            "EP (€)": r.ep ?? 0,
            "Gesamt (€)": r.total ?? 0,
            Status: r.status ?? "",
            Notiz: r.note ?? "",
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Nachtraege");
        XLSX.writeFile(wb, `Nachtraege_${projectId || "ohneProjekt"}_${selectedLV?.pos || "alle"}.xlsx`);
    }
    async function exportPdf(preview = false) {
        if (!rows.length)
            return alert("Keine Daten.");
        const doc = new jsPDF({ orientation: "landscape", unit: "mm" });
        doc.setFontSize(14);
        doc.text(`Nachträge – Projekt: ${projectId || "-"}${selectedLV ? ` – LV-Pos ${selectedLV.pos}` : ""}`, 14, 16);
        const body = rows.map(r => [
            r.number ?? "", r.title ?? "", r.lvPos ?? "",
            num(r.qty), r.unit ?? "", num(r.ep), num(r.total), (r.status ?? ""), (r.note ?? "").slice(0, 120)
        ]);
        autoTable(doc, {
            startY: 22,
            head: [["NT-Nr.", "Titel", "LV-Pos", "Menge", "Einheit", "EP (€)", "Gesamt (€)", "Status", "Notiz"]],
            body,
            styles: { fontSize: 9, cellPadding: 2 },
            headStyles: { fillColor: [20, 20, 20] }
        });
        // thumbnails immagini + elenco PDF
        const pageH = doc.internal.pageSize.getHeight();
        let y = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 8 : 30;
        const left = 14, gap = 4, thumbW = 50, thumbH = 38, perRow = 5;
        for (const r of rows) {
            const imgs = (r.attachments || []).filter(a => isImg(a.type));
            const pdfs = (r.attachments || []).filter(a => isPdf(a.type));
            if (!imgs.length && !pdfs.length)
                continue;
            if (y + 10 > pageH) {
                doc.addPage();
                y = 14;
            }
            doc.setFontSize(12);
            doc.text(`Anhänge zu ${r.number ?? "-"} – ${r.title ?? "-"}`, left, y);
            y += 5;
            if (imgs.length) {
                let col = 0;
                for (const a of imgs) {
                    const dataUrl = await urlToDataURL(a.url, "image/jpeg");
                    if (!dataUrl)
                        continue;
                    if (col >= perRow) {
                        col = 0;
                        y += thumbH + gap;
                    }
                    if (y + thumbH + 10 > pageH) {
                        doc.addPage();
                        y = 14;
                    }
                    const x = left + col * (thumbW + gap);
                    doc.addImage(dataUrl, "JPEG", x, y, thumbW, thumbH);
                    col++;
                }
                y += thumbH + 4;
            }
            if (pdfs.length) {
                if (y + 10 > pageH) {
                    doc.addPage();
                    y = 14;
                }
                doc.setFontSize(11);
                doc.text("Anhänge – PDF:", left, y);
                y += 5;
                doc.setFontSize(9);
                for (const p of pdfs) {
                    if (y + 5 > pageH) {
                        doc.addPage();
                        y = 14;
                    }
                    doc.text(`• ${p.name}`, left + 2, y);
                    y += 4;
                }
                y += 2;
            }
        }
        if (preview) {
            const blob = doc.output("blob");
            const url = URL.createObjectURL(blob);
            window.open(url, "_blank");
            return;
        }
        doc.save(`Nachtraege_${projectId || "ohneProjekt"}_${selectedLV?.pos || "alle"}.pdf`);
    }
    /* Render */
    return (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "480px 1fr", gap: 16 }, children: [_jsxs("div", { className: "card", style: { padding: 16 }, children: [_jsx("h3", { style: { marginTop: 0 }, children: "Verkn\u00FCpfung mit Nachtr\u00E4gen" }), _jsxs("div", { style: { display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }, children: [_jsx(Field, { label: "Projekt-ID", children: _jsx("input", { value: projectId, onChange: e => setProjectId(e.target.value), placeholder: "z. B. PRJ-2025-001" }) }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }, children: [_jsx(Field, { label: "LV-Position suchen", children: _jsx("input", { value: lvSearch, onChange: e => setLvSearch(e.target.value), placeholder: "Pos. oder Text\u2026" }) }), _jsx("button", { className: "btn", style: { alignSelf: "end", height: 36 }, onClick: loadLV, disabled: !projectId || loading, children: "LV laden" })] })] }), _jsxs("div", { style: { maxHeight: 180, overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, marginTop: 8 }, children: [lvList
                                .filter(l => !lvSearch ||
                                l.pos?.toLowerCase().includes(lvSearch.toLowerCase()) ||
                                (l.shortText || "").toLowerCase().includes(lvSearch.toLowerCase()))
                                .map(l => (_jsxs("div", { onClick: () => { setSelectedLV(l); clearForm(); }, style: {
                                    padding: "8px 10px",
                                    cursor: "pointer",
                                    background: selectedLV?.id === l.id ? "rgba(0,0,0,0.05)" : undefined,
                                    borderBottom: "1px solid var(--line)"
                                }, children: [_jsx("strong", { style: { width: 90, display: "inline-block" }, children: l.pos }), _jsx("span", { children: l.shortText }), _jsxs("span", { style: { float: "right", opacity: .7 }, children: [l.unit, " \u00B7 EP ", num(l.ep)] })] }, l.id))), lvList.length === 0 && (_jsx("div", { style: { padding: 10, color: "var(--muted)" }, children: "Keine LV-Positionen (oder nicht geladen)." }))] }), _jsxs("div", { style: { marginTop: 12 }, children: [_jsx("input", { id: "ntImport", type: "file", multiple: true, accept: "image/*,.pdf,.heic,.heif", onChange: e => addFiles(e.target.files), style: { display: "none" } }), _jsx("label", { htmlFor: "ntImport", className: "btn", children: "\uD83D\uDCE5 PDF / Fotos importieren" })] }), _jsx("h4", { style: { marginTop: 16 }, children: "Nachtrag erfassen" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }, children: [_jsx(Field, { label: "NT-Nr.", children: _jsx("input", { value: form.number ?? "", onChange: e => setF("number", e.target.value), placeholder: "z. B. N01" }) }), _jsx(Field, { label: "Status", children: _jsxs("select", { value: form.status ?? "offen", onChange: e => setF("status", e.target.value), children: [_jsx("option", { value: "offen", children: "offen" }), _jsx("option", { value: "inBearbeitung", children: "in Bearbeitung" }), _jsx("option", { value: "freigegeben", children: "freigegeben" }), _jsx("option", { value: "abgelehnt", children: "abgelehnt" })] }) })] }), _jsx(Field, { label: "Titel/Kurztext", children: _jsx("input", { value: form.title ?? "", onChange: e => setF("title", e.target.value) }) }), _jsx(Field, { label: "LV-Pos", children: _jsx("input", { value: form.lvPos ?? selectedLV?.pos ?? "", onChange: e => setF("lvPos", e.target.value) }) }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, minmax(130px,1fr))", gap: 12 }, children: [_jsx(Field, { label: "Menge", children: _jsx("input", { type: "number", step: "0.01", value: form.qty ?? 0, onChange: e => setF("qty", Number(e.target.value)) }) }), _jsx(Field, { label: "Einheit", children: _jsx("input", { value: form.unit ?? "", onChange: e => setF("unit", e.target.value) }) }), _jsx(Field, { label: "EP (\u20AC)", children: _jsx("input", { type: "number", step: "0.01", value: form.ep ?? 0, onChange: e => setF("ep", Number(e.target.value)) }) }), _jsx(Field, { label: "Gesamt (\u20AC)", children: _jsx("input", { value: num((form.qty || 0) * (form.ep || 0)), disabled: true }) })] }), _jsx(Field, { label: "Notiz", children: _jsx("textarea", { value: form.note ?? "", onChange: e => setF("note", e.target.value), style: { height: 120, resize: "vertical" } }) }), _jsx(Field, { label: "Anh\u00E4nge (Bilder & PDF)", children: _jsx("div", { style: { display: "flex", gap: 12, flexWrap: "wrap" }, children: (form.attachments || []).map(a => (_jsxs("div", { style: { position: "relative", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", width: 160, height: 160, background: "#fafafa" }, children: [isImg(a.type) ? (_jsx("img", { src: a.url, onClick: () => setPreviewUrl(a.url), style: { width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" } })) : isPdf(a.type) ? (_jsx("a", { href: a.url, target: "_blank", rel: "noreferrer", style: { display: "grid", placeItems: "center", width: "100%", height: "100%", textDecoration: "underline" }, children: a.name })) : (_jsx("a", { href: a.url, target: "_blank", rel: "noreferrer", style: { display: "grid", placeItems: "center", width: "100%", height: "100%" }, children: "FILE" })), _jsx("button", { onClick: () => removeAttachment(a.id), className: "btn", style: { position: "absolute", top: 6, right: 6, padding: "0 8px" }, children: "\u2715" })] }, a.id))) }) }), _jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 }, children: [_jsx("button", { className: "btn", onClick: save, children: form.id ? "Änderungen speichern" : "Nachtrag anlegen" }), _jsx("button", { className: "btn", onClick: clearForm, children: "Formular leeren" }), _jsx("button", { className: "btn", onClick: loadNachtraege, disabled: !projectId || loading, children: "Neu laden" }), _jsx("button", { className: "btn", disabled: !selectedLV, onClick: () => alert(`Nachtrag wird mit LV-Position ${selectedLV?.pos || "-"} verknüpft`), children: "\uD83D\uDD17 Mit Aufma\u00DF verkn\u00FCpfen" })] }), _jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }, children: [_jsx("button", { className: "btn", onClick: exportXlsx, disabled: !rows.length, children: "Export XLSX" }), _jsx("button", { className: "btn", onClick: () => exportPdf(false), disabled: !rows.length, children: "Export PDF" }), _jsx("button", { className: "btn", onClick: () => exportPdf(true), disabled: !rows.length, children: "PDF Vorschau" })] }), _jsx("button", { className: "btn", style: { marginTop: 6 }, onClick: () => exportNachtragPdf({
                            projekt: { projektId: projectId },
                            nachtrag: {
                                ntNr: form.number,
                                positionen: rows.map(r => ({
                                    ntNr: r.number, titel: r.title, lvPos: r.lvPos,
                                    menge: r.qty, einheit: r.unit, ep: r.ep, gesamt: r.total,
                                    status: r.status, notiz: r.note,
                                })),
                            },
                        }), disabled: !rows.length || !projectId, children: "Export PDF (Server)" }), error && _jsx("div", { style: { color: "crimson", marginTop: 8 }, children: error })] }), _jsx("div", { className: "card", style: { padding: 0, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(Th, { children: "NT-Nr." }), _jsx(Th, { children: "Titel" }), _jsx(Th, { children: "LV-Pos" }), _jsx(Th, { children: "Menge" }), _jsx(Th, { children: "Einheit" }), _jsx(Th, { children: "EP (\u20AC)" }), _jsx(Th, { children: "Gesamt (\u20AC)" }), _jsx(Th, { children: "Status" }), _jsx(Th, { children: "Notiz" }), _jsx(Th, { children: "Anh\u00E4nge" }), _jsx(Th, {})] }) }), _jsx("tbody", { children: rows.length === 0 ? (_jsx("tr", { children: _jsx(Td, { colSpan: 11, style: { textAlign: "center" }, children: projectId ? "Keine Nachträge" : "Projekt-ID eingeben" }) })) : rows.map((r, i) => (_jsxs("tr", { style: { background: selIdx === i ? "rgba(0,0,0,.04)" : undefined }, children: [_jsx(Td, { children: r.number }), _jsx(Td, { style: { maxWidth: 260, whiteSpace: "pre-wrap" }, children: r.title }), _jsx(Td, { children: r.lvPos }), _jsx(Td, { style: { textAlign: "right" }, children: num(r.qty) }), _jsx(Td, { children: r.unit }), _jsx(Td, { style: { textAlign: "right" }, children: num(r.ep) }), _jsx(Td, { style: { textAlign: "right", fontWeight: 600 }, children: num(r.total) }), _jsx(Td, { children: displayStatus(r.status) }), _jsx(Td, { style: { maxWidth: 320, whiteSpace: "pre-wrap" }, children: r.note }), _jsx(Td, { children: _jsxs("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", maxWidth: 220 }, children: [(r.attachments || []).slice(0, 4).map(a => (_jsx("a", { href: a.url, onClick: (e) => { if (isImg(a.type)) {
                                                        e.preventDefault();
                                                        setPreviewUrl(a.url);
                                                    } }, rel: "noreferrer", style: { display: "block", width: 60, height: 60, border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }, children: isImg(a.type) ? _jsx("img", { src: a.url, style: { width: "100%", height: "100%", objectFit: "cover" } }) :
                                                        _jsx("div", { style: { fontSize: 10, display: "grid", placeItems: "center", height: "100%" }, children: isPdf(a.type) ? "PDF" : "FILE" }) }, a.id))), (r.attachments?.length || 0) > 4 && _jsxs("span", { style: { fontSize: 12, opacity: .7 }, children: ["+", (r.attachments.length - 4)] })] }) }), _jsx(Td, { children: _jsxs("div", { style: { display: "flex", gap: 6 }, children: [_jsx("button", { className: "btn", onClick: () => selectRow(i), children: "Bearbeiten" }), _jsx("button", { className: "btn", onClick: () => removeRow(r, i), children: "L\u00F6schen" })] }) })] }, r.id ?? `nt-${i}`))) })] }) }), previewUrl && (_jsx("div", { onClick: () => setPreviewUrl(null), style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "grid", placeItems: "center", zIndex: 9999 }, children: _jsx("img", { src: previewUrl, style: { maxWidth: "98vw", maxHeight: "98vh", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.5)" } }) }))] }));
}
/* ===== UI helpers ===== */
function Field(props) {
    return (_jsxs("label", { style: { display: "block" }, children: [_jsx("div", { style: { fontSize: 13, color: "var(--muted)", marginBottom: 6 }, children: props.label }), _jsx("div", { children: props.children })] }));
}
function Th({ children }) {
    return _jsx("th", { style: { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, whiteSpace: "nowrap" }, children: children });
}
function Td(props) {
    const { children, style, ...rest } = props;
    return _jsx("td", { ...rest, style: { padding: "6px 10px", borderBottom: "1px solid var(--line)", verticalAlign: "top", fontSize: 13, ...style }, children: children });
}
function displayStatus(s) {
    switch (s) {
        case "inBearbeitung": return "in Bearbeitung";
        case "freigegeben": return "freigegeben";
        case "abgelehnt": return "abgelehnt";
        default: return "offen";
    }
}
