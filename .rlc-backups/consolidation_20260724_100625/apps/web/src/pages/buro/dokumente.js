import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// apps/web/src/pages/buro/dokumente.tsx
import React from "react";
import { DocsDB } from "./store.docs";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";
// === API server ===
import { listDocuments as srvList, initDocument as srvInit, getUploadUrl as srvGetUrl, putToStorage as srvPut, detectKind as srvDetectKind, softDeleteDocument as srvSoftDelete, restoreDocument as srvRestore, updateDocument as srvUpdate, } from "../../api/files";
const th = {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
    whiteSpace: "nowrap",
};
const td = {
    padding: "6px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
    verticalAlign: "middle",
};
const lbl = { fontSize: 13, opacity: 0.8 };
const inp = {
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 13,
};
export default function Dokumente() {
    const [all, setAll] = React.useState(DocsDB.list());
    const [selId, setSelId] = React.useState(all[0]?.id ?? null);
    const [q, setQ] = React.useState("");
    const [tagFilter, setTagFilter] = React.useState("");
    const [zoom, setZoom] = React.useState(1);
    // Globaler Store (Projekt + aktuell geöffnetes Dokument)
    const navigate = useNavigate();
    const { projectId: projectIdGlobal, setProjectId: setProjectIdGlobal, setCurrentDoc } = useProject();
    // --- Server state
    const [projectId, setProjectId] = React.useState(localStorage.getItem("currentProjectId") || projectIdGlobal || "");
    const [serverDocs, setServerDocs] = React.useState([]);
    const [serverBusy, setServerBusy] = React.useState(false);
    const API_BASE = import.meta.env?.VITE_API_URL?.replace(/\/$/, "") || "https://api.rlcbausoftware.com";
    const sel = all.find((d) => d.id === selId) ?? null;
    const cur = sel?.versions[0];
    const refresh = () => setAll(DocsDB.list());
    React.useEffect(() => {
        if (!projectId && projectIdGlobal) {
            setProjectId(projectIdGlobal);
        }
    }, [projectIdGlobal]);
    // --- Local actions (immutati)
    const addDoc = () => {
        const d = DocsDB.create();
        refresh();
        setSelId(d.id);
    };
    const delDoc = () => {
        if (!sel)
            return;
        if (!confirm("Dokument wirklich löschen?"))
            return;
        DocsDB.remove(sel.id);
        refresh();
        setSelId(DocsDB.list()[0]?.id ?? null);
    };
    const update = (patch) => {
        if (!sel)
            return;
        DocsDB.upsert({ ...sel, ...patch });
        refresh();
    };
    const uploadNewVersion = async () => pickFile(async (f) => {
        if (!sel)
            return;
        await DocsDB.addVersion(sel.id, f);
        refresh();
    });
    const onDrop = async (ev) => {
        ev.preventDefault();
        if (!sel)
            return;
        const f = ev.dataTransfer.files?.[0];
        if (!f)
            return;
        await DocsDB.addVersion(sel.id, f);
        refresh();
    };
    const download = (v) => {
        const a = document.createElement("a");
        a.href = v.dataURL;
        a.download = v.fileName;
        a.click();
    };
    const copyDataURL = async (v) => {
        await navigator.clipboard.writeText(v.dataURL);
        alert("Data-URL kopiert.");
    };
    const doExportCSV = () => downloadBlob(DocsDB.exportCSV(filtered()), "dokumente.csv", "text/csv;charset=utf-8");
    const doImportCSV = async () => pickFile(async (f) => {
        const n = DocsDB.importCSV(await f.text());
        alert(`${n} Dokumente importiert.`);
        refresh();
    });
    const doExportJSON = () => downloadBlob(DocsDB.exportJSON(), "dokumente_backup.json", "application/json");
    const doImportJSON = async () => pickFile(async (f) => {
        const n = DocsDB.importJSON(await f.text());
        alert(`Backup importiert: ${n} Elemente.`);
        refresh();
    });
    // --- Filtri locali
    const filtered = () => all.filter((d) => {
        const s = (d.title + " " + (d.tags ?? []).join(" ")).toLowerCase();
        const okQ = !q || s.includes(q.toLowerCase());
        const okT = !tagFilter || (d.tags ?? []).map((t) => t.toLowerCase()).includes(tagFilter.toLowerCase());
        return okQ && okT;
    });
    const allTags = Array.from(new Set(all.flatMap((d) => d.tags ?? []))).sort();
    // --- Server: load list
    async function loadFromServer() {
        if (!projectId) {
            alert("Bitte Project-ID setzen.");
            return;
        }
        setServerBusy(true);
        try {
            const list = await srvList(projectId);
            setServerDocs(list);
            localStorage.setItem("currentProjectId", projectId);
            setProjectIdGlobal(projectId);
        }
        finally {
            setServerBusy(false);
        }
    }
    // --- Server: upload versione selezionata
    async function uploadSelectionToServer() {
        if (!sel || !cur) {
            alert("Wähle ein Dokument mit einer Version aus.");
            return;
        }
        if (!projectId) {
            alert("Bitte Project-ID setzen.");
            return;
        }
        setServerBusy(true);
        try {
            const blob = dataURLtoBlob(cur.dataURL);
            const file = new File([blob], cur.fileName, { type: cur.mime || "application/octet-stream" });
            const kind = srvDetectKind(file);
            const { documentId } = await srvInit(projectId, kind, file.name);
            const { uploadUrl } = await srvGetUrl(documentId, file.name, file.type || "application/octet-stream");
            await srvPut(uploadUrl, file, file.type || "application/octet-stream");
            await loadFromServer();
            setCurrentDoc({ id: documentId, name: file.name, kind });
            alert("Upload zum Server abgeschlossen.");
        }
        catch (e) {
            alert(e?.message || "Upload zum Server fehlgeschlagen.");
        }
        finally {
            setServerBusy(false);
        }
    }
    // --- Server: soft delete / restore
    async function softDelete(docId) {
        if (!confirm("Dieses Dokument serverseitig (soft) löschen?"))
            return;
        setServerBusy(true);
        try {
            await srvSoftDelete(docId);
            await loadFromServer();
        }
        finally {
            setServerBusy(false);
        }
    }
    async function restore(docId) {
        setServerBusy(true);
        try {
            await srvRestore(docId);
            await loadFromServer();
        }
        finally {
            setServerBusy(false);
        }
    }
    // --- Server: update meta (rename + tags)
    function EditableMeta({ row }) {
        const [name, setName] = React.useState(row.name || "");
        const [tags, setTags] = React.useState((row.meta?.tags ?? []).join(", "));
        const saving = React.useRef(false);
        const save = async () => {
            if (saving.current)
                return;
            saving.current = true;
            try {
                const parsedTags = tags
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                await srvUpdate(row.id, { name, tags: parsedTags });
                await loadFromServer();
            }
            finally {
                saving.current = false;
            }
        };
        return (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }, children: [_jsx("input", { style: inp, value: name, onChange: (e) => setName(e.target.value), placeholder: "Name" }), _jsx("input", { style: inp, value: tags, onChange: (e) => setTags(e.target.value), placeholder: "tags, komma, getrennt" }), _jsx("button", { className: "btn", onClick: save, children: "Speichern" })] }));
    }
    // --- Presigned URL holen und im passenden Viewer öffnen
    async function openInViewer(row) {
        if (!projectId) {
            alert("Bitte Project-ID setzen.");
            return;
        }
        try {
            setCurrentDoc({ id: row.id, name: row.name, kind: row.kind });
            const kind = String(row.kind || "").toUpperCase();
            if (kind === "PDF")
                navigate("/cad/pdf-viewer");
            else if (["DWG", "DXF"].includes(kind))
                navigate("/cad/viewer");
            else
                navigate("/buro/dokumente");
        }
        catch (e) {
            alert(e?.message || "Öffnen fehlgeschlagen.");
        }
    }
    // --- Schnellnavigation (Büro ↔ Lieferscheine ↔ Buchhaltung)
    function goToLieferscheine() {
        // offizielle Route laut App.tsx
        navigate("/mengenermittlung/lieferscheine");
    }
    function goToBuchhaltungBelege() {
        // Buchhaltung -> "Dokumente & Belege verwalten" = reports
        navigate("/buchhaltung/reports");
    }
    function quickFilterLieferschein() {
        // Helfer: setze Suchfeld/Tagfilter schnell auf "Lieferschein"
        // (funktioniert für lokale Dokumente über Titel/Tags)
        setQ("lieferschein");
        setTagFilter("");
    }
    // --- Anteprima locale
    const renderPreview = (v) => {
        if (!v)
            return _jsx("div", { style: { opacity: 0.6 }, children: "Keine Version vorhanden." });
        const isPDF = (v.mime || "").includes("pdf") || /\.pdf$/i.test(v.fileName);
        const isImg = (v.mime || "").startsWith("image/") || /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(v.fileName);
        const openNew = () => {
            const w = window.open(v.dataURL, "_blank");
            if (!w)
                alert("Popup blockiert.");
        };
        return (_jsxs("div", { style: { display: "grid", gridTemplateRows: "auto 1fr", gap: 8, height: "100%" }, children: [_jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("div", { style: { fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: v.fileName, children: v.fileName }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { className: "btn", onClick: () => setZoom((z) => Math.max(0.5, z - 0.1)), children: "-" }), _jsxs("div", { style: { minWidth: 60, textAlign: "center" }, children: [Math.round(zoom * 100), "%"] }), _jsx("button", { className: "btn", onClick: () => setZoom((z) => Math.min(2, z + 0.1)), children: "+" }), _jsx("button", { className: "btn", onClick: openNew, children: "In neuem Tab \u00F6ffnen" })] }), _jsx("div", { style: { border: "1px solid var(--line)", borderRadius: 8, overflow: "auto", background: "#fff" }, children: isPDF ? (_jsx("iframe", { title: "pdf", src: v.dataURL, style: {
                            width: "100%",
                            height: "100%",
                            border: "0",
                            transform: `scale(${zoom})`,
                            transformOrigin: "0 0",
                        } })) : isImg ? (_jsx("div", { style: { overflow: "auto" }, children: _jsx("img", { src: v.dataURL, alt: v.fileName, style: { width: `${zoom * 100}%`, height: "auto", display: "block" } }) })) : (_jsxs("div", { style: { padding: 12 }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 6 }, children: "Vorschau nicht unterst\u00FCtzt." }), _jsxs("div", { style: { opacity: 0.7, marginBottom: 8 }, children: ["Typ: ", v.mime || "—"] }), _jsx("button", { className: "btn", onClick: openNew, children: "\u00D6ffnen / Download" })] })) })] }));
    };
    return (_jsxs("div", { style: { display: "grid", gridTemplateRows: "auto 1fr", gap: 10, padding: 10 }, children: [_jsxs("div", { className: "card", style: { padding: "8px 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [_jsx("button", { className: "btn", onClick: goToLieferscheine, children: "\u2192 Lieferscheine" }), _jsx("button", { className: "btn", onClick: goToBuchhaltungBelege, children: "\u2192 Buchhaltung: Dokumente & Belege" }), _jsx("button", { className: "btn", onClick: quickFilterLieferschein, title: "Filter lokal nach 'Lieferschein'", children: "Filter: Lieferschein" }), _jsx("div", { style: { width: 1, height: 24, background: "var(--line)", margin: "0 6px" } }), _jsx("button", { className: "btn", onClick: addDoc, children: "+ Dokument" }), _jsx("button", { className: "btn", onClick: delDoc, disabled: !sel, children: "L\u00F6schen" }), _jsx("div", { style: { flex: 1 } }), _jsx("input", { placeholder: "Suchen\u2026", value: q, onChange: (e) => setQ(e.target.value), style: { ...inp, width: 200 } }), _jsxs("select", { value: tagFilter, onChange: (e) => setTagFilter(e.target.value), style: { ...inp, width: 160 }, children: [_jsx("option", { value: "", children: "Alle Tags" }), allTags.map((t) => (_jsx("option", { value: t, children: t }, t)))] }), _jsx("button", { className: "btn", onClick: uploadNewVersion, disabled: !sel, children: "Neue Version" }), _jsx("button", { className: "btn", onClick: doImportCSV, children: "Import CSV" }), _jsx("button", { className: "btn", onClick: doExportCSV, children: "Export CSV" }), _jsx("button", { className: "btn", onClick: doImportJSON, children: "Import JSON" }), _jsx("button", { className: "btn", onClick: doExportJSON, children: "Export JSON" }), _jsx("div", { style: { width: 1, height: 24, background: "var(--line)", margin: "0 6px" } }), _jsx("input", { placeholder: "Project-ID (Server)", value: projectId, onChange: (e) => {
                            setProjectId(e.target.value);
                            setProjectIdGlobal(e.target.value);
                        }, style: { ...inp, width: 280 } }), _jsx("button", { className: "btn", onClick: loadFromServer, disabled: !projectId || serverBusy, children: "Server: Laden" }), _jsx("button", { className: "btn", onClick: uploadSelectionToServer, disabled: !projectId || !sel || !cur || serverBusy, children: "Auswahl \u2192 Server" })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr min(42vw, 640px)", gap: 10, minHeight: "60vh" }, children: [_jsxs("div", { style: { display: "grid", gridTemplateRows: "minmax(200px, 40vh) auto", gap: 10 }, children: [_jsx("div", { className: "card", style: { padding: 0, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Titel" }), _jsx("th", { style: th, children: "Tags" }), _jsx("th", { style: th, children: "Letzte Version" }), _jsx("th", { style: th, children: "Gr\u00F6\u00DFe" }), _jsx("th", { style: th, children: "Ge\u00E4ndert" })] }) }), _jsx("tbody", { children: filtered().map((d) => {
                                                const v = d.versions[0];
                                                return (_jsxs("tr", { onClick: () => {
                                                        setSelId(d.id);
                                                        setZoom(1);
                                                    }, style: {
                                                        cursor: "pointer",
                                                        background: d.id === selId ? "#f1f5ff" : undefined,
                                                    }, children: [_jsx("td", { style: td, children: d.title }), _jsx("td", { style: td, children: (d.tags ?? []).join(", ") }), _jsx("td", { style: td, children: v ? v.fileName : _jsx("i", { children: "\u2014" }) }), _jsx("td", { style: td, children: v ? (v.size / 1024).toFixed(1) + " KB" : "—" }), _jsx("td", { style: td, children: new Date(d.updatedAt).toLocaleString() })] }, d.id));
                                            }) })] }) }), _jsx("div", { className: "card", onDragOver: (e) => e.preventDefault(), onDrop: onDrop, style: { padding: 12 }, children: !sel ? (_jsx("div", { style: { opacity: 0.7 }, children: "W\u00E4hle links ein Dokument aus oder erstelle ein neues." })) : (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "150px 1fr 150px 1fr", gap: 10 }, children: [_jsx("label", { style: lbl, children: "Titel" }), _jsx("input", { style: { ...inp, width: "100%" }, value: sel.title, onChange: (e) => update({ title: e.target.value }) }), _jsx("label", { style: lbl, children: "Tags" }), _jsx("input", { style: { ...inp, width: "100%" }, placeholder: "kommagetrennt", value: (sel.tags ?? []).join(", "), onChange: (e) => update({
                                                tags: e.target.value
                                                    .split(",")
                                                    .map((s) => s.trim())
                                                    .filter(Boolean),
                                            }) }), _jsx("label", { style: lbl, children: "Projekt-ID" }), _jsx("input", { style: inp, value: sel.projektId ?? "", onChange: (e) => update({ projektId: e.target.value }) }), _jsx("label", { style: { ...lbl, gridColumn: "1 / -1" }, children: "Versionen (Drag&Drop Datei hier)" }), _jsx("div", { style: { gridColumn: "1 / -1" }, children: !sel.versions.length ? (_jsx("div", { style: { opacity: 0.7 }, children: "Noch keine Version hochgeladen." })) : (_jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Datei" }), _jsx("th", { style: th, children: "Typ" }), _jsx("th", { style: th, children: "Gr\u00F6\u00DFe" }), _jsx("th", { style: th, children: "Hochgeladen" }), _jsx("th", { style: th })] }) }), _jsx("tbody", { children: sel.versions.map((v, i) => (_jsxs("tr", { style: { background: i === 0 ? "#eef8f0" : undefined }, children: [_jsx("td", { style: td, title: v.fileName, children: v.fileName }), _jsx("td", { style: td, children: v.mime || "—" }), _jsxs("td", { style: td, children: [(v.size / 1024).toFixed(1), " KB"] }), _jsx("td", { style: td, children: new Date(v.uploadedAt).toLocaleString() }), _jsxs("td", { style: { ...td, whiteSpace: "nowrap" }, children: [_jsx("button", { className: "btn", onClick: () => download(v), children: "Download" }), _jsx("button", { className: "btn", onClick: () => copyDataURL(v), children: "Data-URL kopieren" }), i > 0 && (_jsx("button", { className: "btn", onClick: () => {
                                                                                DocsDB.restoreVersion(sel.id, v.id);
                                                                                refresh();
                                                                            }, children: "Wiederherstellen" }))] })] }, v.id))) })] })) })] })) }), _jsxs("div", { className: "card", style: { padding: 12 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("div", { style: { fontWeight: 700 }, children: "Server-Dokumente" }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { className: "btn", onClick: loadFromServer, disabled: !projectId || serverBusy, children: "Aktualisieren" })] }), !projectId ? (_jsx("div", { style: { opacity: 0.7, marginTop: 8 }, children: "Bitte eine Project-ID eingeben, um Server-Dokumente zu sehen." })) : serverDocs.length === 0 ? (_jsx("div", { style: { opacity: 0.7, marginTop: 8 }, children: serverBusy ? "Lade…" : "Keine Dokumente auf dem Server gefunden." })) : (_jsxs("table", { style: { width: "100%", borderCollapse: "collapse", marginTop: 8 }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Name / Meta" }), _jsx("th", { style: th, children: "Typ" }), _jsx("th", { style: th, children: "Versionen" }), _jsx("th", { style: th, children: "Ge\u00E4ndert" }), _jsx("th", { style: th, children: "Aktionen" })] }) }), _jsx("tbody", { children: serverDocs.map((d) => {
                                                    const last = d.versions?.[d.versions.length - 1] || null;
                                                    const storageUrl = last ? `${API_BASE}/files/${projectId}/storage/${last.storageId}` : null;
                                                    const isCAD = d.name?.toLowerCase()?.endsWith(".dwg") || d.name?.toLowerCase()?.endsWith(".dxf");
                                                    const deleted = !!d.deletedAt;
                                                    return (_jsxs("tr", { style: { opacity: deleted ? 0.55 : 1 }, children: [_jsx("td", { style: td, children: _jsx(EditableMeta, { row: d }) }), _jsx("td", { style: td, children: String(d.kind) }), _jsx("td", { style: td, children: d.versions?.length ?? 0 }), _jsx("td", { style: td, children: new Date(d.updatedAt).toLocaleString() }), _jsxs("td", { style: { ...td, whiteSpace: "nowrap", display: "flex", gap: 6 }, children: [storageUrl ? (_jsx("a", { className: "btn", href: storageUrl, target: "_blank", rel: "noreferrer", children: "\u00D6ffnen (direkt)" })) : (_jsx("span", { style: { opacity: 0.6 }, children: "\u2014" })), _jsx("button", { className: "btn", onClick: () => openInViewer(d), children: "Im Viewer \u00F6ffnen" }), !deleted ? (_jsx("button", { className: "btn", onClick: () => softDelete(d.id), children: "L\u00F6schen" })) : (_jsx("button", { className: "btn", onClick: () => restore(d.id), children: "Wiederherstellen" }))] })] }, d.id));
                                                }) })] }))] })] }), _jsx("div", { className: "card", style: { padding: 12, minHeight: 300 }, children: renderPreview(cur) })] })] }));
}
function pickFile(onPick) {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.onchange = () => {
        const f = inp.files?.[0];
        if (f)
            onPick(f);
    };
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
function dataURLtoBlob(dataURL) {
    const [meta, b64] = dataURL.split(",");
    const mime = /data:([^;]+);base64/.exec(meta)?.[1] || "application/octet-stream";
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
}
