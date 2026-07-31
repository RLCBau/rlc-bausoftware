import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { listDocuments, initDocument, getUploadUrl, putToStorage, detectKind, } from "../../api/files";
import "./documents.css";
const prettyDate = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
export default function DocumentManager({ projectId }) {
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState("");
    const [uploads, setUploads] = useState([]);
    const [preview, setPreview] = useState(null);
    const inputRef = useRef(null);
    async function refresh() {
        setLoading(true);
        try {
            const data = await listDocuments(projectId);
            // neueste zuerst
            data.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
            setDocs(data);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        refresh();
    }, [projectId]);
    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s)
            return docs;
        return docs.filter(d => d.name.toLowerCase().includes(s) || String(d.kind).toLowerCase().includes(s));
    }, [docs, q]);
    function onChooseFiles(e) {
        if (!e.target.files)
            return;
        queueFiles(Array.from(e.target.files));
        e.target.value = "";
    }
    function onDrop(e) {
        e.preventDefault();
        if (e.dataTransfer.files?.length) {
            queueFiles(Array.from(e.dataTransfer.files));
        }
    }
    function queueFiles(files) {
        const list = files.map(f => ({ file: f, progress: 0, status: "wartend" }));
        setUploads(prev => [...list, ...prev]);
        // sofort starten
        list.forEach(startUpload);
    }
    async function startUpload(item) {
        const file = item.file;
        const contentType = file.type || "application/octet-stream";
        const kind = detectKind(file);
        setUploads(prev => prev.map(u => (u === item ? { ...u, status: "lade", progress: 5 } : u)));
        try {
            // 1) DB-Dokument anlegen
            const { documentId } = await initDocument(projectId, kind, file.name);
            // 2) Presigned-URL holen (legt Version an)
            const { uploadUrl } = await getUploadUrl(documentId, file.name, contentType);
            // 3) PUT nach MinIO (progress simuliert, da fetch kein progress-Event hat)
            // Workaround: wir "ticken" progress, bis der Request resolved.
            const tick = setInterval(() => {
                setUploads(prev => prev.map(u => u === item ? { ...u, progress: Math.min(u.progress + 5, 90) } : u));
            }, 200);
            await putToStorage(uploadUrl, file, contentType);
            clearInterval(tick);
            setUploads(prev => prev.map(u => (u === item ? { ...u, progress: 100, status: "fertig" } : u)));
            // 4) Liste neu laden
            refresh();
        }
        catch (e) {
            setUploads(prev => prev.map(u => u === item ? { ...u, status: "fehler", error: e?.message || String(e) } : u));
        }
    }
    async function openPreview(doc) {
        // Für PDFs/Images können wir direkt /files/{storageId} zeigen (Server stellt /files/ bereit)
        const last = doc.versions?.[doc.versions.length - 1] ?? null;
        if (!last)
            return;
        // Backend speichert Dateien unter /files/{projectId}/storage/{storageId}
        const url = `${import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "https://api.rlcbausoftware.com"}/files/${projectId}/storage/${last.storageId}`;
        setPreview({ url, name: doc.name });
    }
    return (_jsxs("div", { className: "docmgr", children: [_jsxs("div", { className: "docmgr-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Dokumentenverwaltung" }), _jsxs("p", { className: "muted", children: ["Projekt: ", _jsx("code", { children: projectId })] })] }), _jsxs("div", { className: "docmgr-actions", children: [_jsx("input", { ref: inputRef, type: "file", multiple: true, onChange: onChooseFiles, style: { display: "none" } }), _jsx("input", { className: "search", placeholder: "Suche (Name/Typ)\u2026", value: q, onChange: e => setQ(e.target.value) }), _jsx("button", { className: "btn", onClick: () => inputRef.current?.click(), children: "Dateien w\u00E4hlen" }), _jsx("button", { className: "btn ghost", onClick: refresh, children: "Aktualisieren" })] })] }), _jsx("div", { className: "dropzone", onDragOver: e => e.preventDefault(), onDrop: onDrop, children: _jsx("span", { children: "Dateien hierher ziehen oder oben ausw\u00E4hlen" }) }), uploads.length > 0 && (_jsx("div", { className: "uploadlist", children: uploads.map((u, i) => (_jsxs("div", { className: `upload ${u.status}`, children: [_jsx("div", { className: "name", children: u.file.name }), _jsx("div", { className: "bar", children: _jsx("div", { className: "fill", style: { width: `${u.progress}%` } }) }), _jsxs("div", { className: "status", children: [u.status, u.error ? `: ${u.error}` : ""] })] }, i))) })), _jsxs("div", { className: "table", children: [_jsxs("div", { className: "thead", children: [_jsx("div", { children: "Datei" }), _jsx("div", { children: "Typ" }), _jsx("div", { children: "Versionen" }), _jsx("div", { children: "Aktualisiert" }), _jsx("div", { children: "Aktion" })] }), loading ? (_jsx("div", { className: "row muted", children: "Lade\u2026" })) : filtered.length === 0 ? (_jsx("div", { className: "row muted", children: "Keine Dokumente gefunden." })) : (filtered.map(d => (_jsxs("div", { className: "row", children: [_jsx("div", { className: "cell name", children: d.name }), _jsx("div", { className: "cell", children: String(d.kind) }), _jsx("div", { className: "cell", children: d.versions?.length ?? 0 }), _jsx("div", { className: "cell", children: prettyDate(d.updatedAt) }), _jsx("div", { className: "cell", children: _jsx("button", { className: "btn small", onClick: () => openPreview(d), children: "Ansehen" }) })] }, d.id))))] }), preview && (_jsx("div", { className: "modal", onClick: () => setPreview(null), children: _jsxs("div", { className: "modal-body", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "modal-head", children: [_jsx("div", { className: "title", children: preview.name }), _jsx("button", { className: "btn small ghost", onClick: () => setPreview(null), children: "Schlie\u00DFen" })] }), _jsx("iframe", { title: "preview", src: preview.url, className: "frame" })] }) }))] }));
}
