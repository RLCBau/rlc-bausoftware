import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { useEffect, useMemo, useRef, useState } from "react";
import { listDocuments, initDocument, getUploadUrl, putToStorage, detectKind, getDocumentViewUrl } from "../../api/files";
import "./documents.css";
const prettyDate = (iso) => iso ?
    new Date(iso).toLocaleString(undefined, {
        dateStyle: "short",
        timeStyle: "short"
    }) :
    "—";
function makeUploadId(file) {
    return `${file.name}-${file.size}-${file.lastModified}-${Math.random().
        toString(36).
        slice(2, 8)}`;
}
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
            const sorted = [...data].sort((a, b) => {
                const aTs = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                const bTs = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                return bTs - aTs;
            });
            setDocs(sorted);
        }
        catch (e) {
            console.error("Document refresh failed:", e);
            setDocs([]);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void refresh();
    }, [projectId]);
    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s)
            return docs;
        return docs.filter((d) => d.name.toLowerCase().includes(s) ||
            String(d.kind).toLowerCase().includes(s));
    }, [docs, q]);
    function updateUpload(id, patch) {
        setUploads((prev) => prev.map((u) => u.id === id ? { ...u, ...patch } : u));
    }
    function onChooseFiles(e) {
        if (!e.target.files?.length)
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
        const list = files.map((file) => ({
            id: makeUploadId(file),
            file,
            progress: 0,
            status: "wartend"
        }));
        setUploads((prev) => [...list, ...prev]);
        list.forEach((item) => {
            void startUpload(item);
        });
    }
    async function startUpload(item) {
        const { id, file } = item;
        const contentType = file.type || "application/octet-stream";
        const kind = detectKind(file);
        updateUpload(id, { status: "lade", progress: 5, error: undefined });
        let tick = null;
        try {
            const { documentId } = await initDocument(projectId, kind, file.name);
            const { uploadUrl } = await getUploadUrl(documentId, file.name, contentType);
            tick = window.setInterval(() => {
                setUploads((prev) => prev.map((u) => u.id === id ?
                    { ...u, progress: Math.min(u.progress + 5, 90) } :
                    u));
            }, 200);
            await putToStorage(uploadUrl, file, contentType);
            if (tick) {
                window.clearInterval(tick);
            }
            updateUpload(id, {
                progress: 100,
                status: "fertig",
                error: undefined
            });
            await refresh();
        }
        catch (e) {
            if (tick) {
                window.clearInterval(tick);
            }
            updateUpload(id, {
                status: "fehler",
                error: e?.message || String(e)
            });
        }
    }
    async function openPreview(doc) {
        try {
            const { url } = await getDocumentViewUrl(doc.id);
            if (!url)
                return;
            setPreview({ url, name: doc.name });
        }
        catch (e) {
            console.error("Preview failed:", e);
        }
    }
    return (_jsxs("div", { className: "docmgr", children: [_jsxs("div", { className: "docmgr-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Dokumentenverwaltung" }), _jsxs("p", { className: "muted", children: ["Projekt: ", _jsx("code", { children: projectId })] })] }), _jsxs("div", { className: "docmgr-actions", children: [_jsx("input", { ref: inputRef, type: "file", multiple: true, onChange: onChooseFiles, className: "rlc-migrated-components-documents-documentmanager-tsx-56" }), _jsx("input", { className: "search", placeholder: "Suche (Name/Typ)\u2026", value: q, onChange: (e) => setQ(e.target.value) }), _jsx("button", { type: "button", className: "btn", onClick: () => inputRef.current?.click(), children: "Dateien w\u00E4hlen" }), _jsx("button", { type: "button", className: "btn ghost", onClick: () => void refresh(), children: "Aktualisieren" })] })] }), _jsx("div", { className: "dropzone", onDragOver: (e) => e.preventDefault(), onDrop: onDrop, children: _jsx("span", { children: "Dateien hierher ziehen oder oben ausw\u00E4hlen" }) }), uploads.length > 0 &&
                _jsx("div", { className: "uploadlist", children: uploads.map((u) => _jsxs("div", { className: `upload ${u.status}`, children: [_jsx("div", { className: "name", children: u.file.name }), _jsx("div", { className: "bar", children: _jsx("div", { className: rlcClass("fill", { width: `${u.progress}%` }) }) }), _jsxs("div", { className: "status", children: [u.status, u.error ? `: ${u.error}` : ""] })] }, u.id)) }), _jsxs("div", { className: "table", children: [_jsxs("div", { className: "thead", children: [_jsx("div", { children: "Datei" }), _jsx("div", { children: "Typ" }), _jsx("div", { children: "Versionen" }), _jsx("div", { children: "Aktualisiert" }), _jsx("div", { children: "Aktion" })] }), loading ?
                        _jsx("div", { className: "row muted", children: "Lade\u2026" }) :
                        filtered.length === 0 ?
                            _jsx("div", { className: "row muted", children: "Keine Dokumente gefunden." }) :
                            filtered.map((d) => _jsxs("div", { className: "row", children: [_jsx("div", { className: "cell name", children: d.name }), _jsx("div", { className: "cell", children: String(d.kind) }), _jsx("div", { className: "cell", children: d.versions?.length ?? 0 }), _jsx("div", { className: "cell", children: prettyDate(d.updatedAt) }), _jsx("div", { className: "cell", children: _jsx("button", { type: "button", className: "btn small", onClick: () => void openPreview(d), children: "Ansehen" }) })] }, d.id))] }), preview &&
                _jsx("div", { className: "modal", onClick: () => setPreview(null), role: "dialog", "aria-modal": "true", children: _jsxs("div", { className: "modal-body", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "modal-head", children: [_jsx("div", { className: "title", children: preview.name }), _jsx("button", { type: "button", className: "btn small ghost", onClick: () => setPreview(null), children: "Schlie\u00DFen" })] }), _jsx("iframe", { title: "preview", src: preview.url, className: "frame" })] }) })] }));
}
