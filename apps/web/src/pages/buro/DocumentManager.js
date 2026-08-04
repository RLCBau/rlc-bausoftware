import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { API_BASE } from "../../lib/apiBase";
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
}
export default function DocumentManager() {
    const [projectId, setProjectId] = useState("");
    const [documents, setDocuments] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [loadingList, setLoadingList] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState("");
    const canUpload = useMemo(() => {
        return !!projectId.trim() && !!selectedFile && !uploading;
    }, [projectId, selectedFile, uploading]);
    const fetchDocuments = useCallback(async () => {
        const trimmedProjectId = projectId.trim();
        if (!trimmedProjectId) {
            setDocuments([]);
            return;
        }
        setLoadingList(true);
        setMessage("");
        try {
            const res = await axios.get(apiUrl(`/api/files/project/${encodeURIComponent(trimmedProjectId)}/list`), { withCredentials: true });
            setDocuments(Array.isArray(res.data) ? res.data : []);
        }
        catch (err) {
            console.error("Errore caricando lista documenti:", err);
            setDocuments([]);
            setMessage("❌ Fehler beim Laden der Dokumentenliste.");
        }
        finally {
            setLoadingList(false);
        }
    }, [projectId]);
    useEffect(() => {
        if (!projectId.trim()) {
            setDocuments([]);
            return;
        }
        void fetchDocuments();
    }, [projectId, fetchDocuments]);
    const handleUpload = useCallback(async () => {
        const trimmedProjectId = projectId.trim();
        if (!selectedFile || !trimmedProjectId) {
            setMessage("⚠️ Bitte zuerst Projekt-ID und Datei auswählen.");
            return;
        }
        setUploading(true);
        setMessage("⏳ Upload läuft...");
        try {
            const initRes = await axios.post(apiUrl(`/api/files/init`), {
                projectId: trimmedProjectId,
                kind: guessKind(selectedFile),
                name: selectedFile.name,
            }, { withCredentials: true });
            const docId = initRes.data?.id;
            if (!docId) {
                throw new Error("Dokument-ID fehlt.");
            }
            const upRes = await axios.post(apiUrl(`/api/files/upload-url`), {
                documentId: docId,
                filename: selectedFile.name,
                contentType: selectedFile.type || "application/octet-stream",
            }, { withCredentials: true });
            const uploadUrl = upRes.data?.uploadUrl;
            if (!uploadUrl) {
                throw new Error("Upload-URL fehlt.");
            }
            await axios.put(uploadUrl, selectedFile, {
                headers: {
                    "Content-Type": selectedFile.type || "application/octet-stream",
                },
            });
            setMessage("✅ Datei erfolgreich hochgeladen.");
            setSelectedFile(null);
            const fileInput = document.getElementById("document-upload-input");
            if (fileInput)
                fileInput.value = "";
            await fetchDocuments();
        }
        catch (err) {
            console.error("Errore upload documento:", err);
            setMessage("❌ Fehler beim Hochladen der Datei.");
        }
        finally {
            setUploading(false);
        }
    }, [projectId, selectedFile, fetchDocuments]);
    return (_jsxs("div", { className: "p-6 max-w-5xl mx-auto text-gray-800", children: [_jsx("h1", { className: "text-2xl font-semibold mb-4", children: "\uD83D\uDCC1 Dokumentenverwaltung" }), _jsxs("div", { className: "bg-gray-50 border border-gray-300 rounded-md p-4 mb-4", children: [_jsx("label", { className: "block mb-2 font-medium", children: "Projekt-ID" }), _jsx("input", { type: "text", className: "border p-2 w-full rounded-md", placeholder: "z. B. BA-2026-001 oder UUID", value: projectId, onChange: (e) => setProjectId(e.target.value) }), _jsx("label", { className: "block mt-4 mb-2 font-medium", children: "Datei ausw\u00E4hlen" }), _jsx("input", { id: "document-upload-input", type: "file", onChange: (e) => setSelectedFile(e.target.files?.[0] || null), className: "block w-full" }), selectedFile && (_jsxs("div", { className: "mt-2 text-sm text-gray-600", children: ["Ausgew\u00E4hlt: ", _jsx("strong", { children: selectedFile.name })] })), _jsxs("div", { className: "mt-4 flex gap-2", children: [_jsx("button", { onClick: handleUpload, disabled: !canUpload, className: "bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2 px-4 rounded-md", children: uploading ? "Lade hoch..." : "📤 Datei hochladen" }), _jsx("button", { onClick: () => void fetchDocuments(), disabled: !projectId.trim() || loadingList, className: "bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 py-2 px-4 rounded-md", children: loadingList ? "Lade..." : "🔄 Aktualisieren" })] }), message && _jsx("p", { className: "mt-3 text-sm", children: message })] }), _jsxs("div", { className: "bg-white shadow rounded-md p-4", children: [_jsx("h2", { className: "text-lg font-semibold mb-3", children: "\uD83D\uDCD1 Dokumente im Projekt" }), loadingList ? (_jsx("p", { children: "Dokumente werden geladen..." })) : documents.length === 0 ? (_jsx("p", { children: "Keine Dokumente vorhanden." })) : (_jsxs("table", { className: "w-full border-collapse", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-100 text-left border-b", children: [_jsx("th", { className: "p-2", children: "Name" }), _jsx("th", { className: "p-2", children: "Typ" }), _jsx("th", { className: "p-2", children: "Versionen" }), _jsx("th", { className: "p-2", children: "Erstellt am" })] }) }), _jsx("tbody", { children: documents.map((doc) => (_jsxs("tr", { className: "border-b hover:bg-gray-50", children: [_jsx("td", { className: "p-2", children: doc.name }), _jsx("td", { className: "p-2", children: doc.kind || "—" }), _jsx("td", { className: "p-2", children: doc.versions?.length ?? 1 }), _jsx("td", { className: "p-2", children: doc.createdAt
                                                ? new Date(doc.createdAt).toLocaleString("de-DE")
                                                : "—" })] }, doc.id))) })] }))] })] }));
}
function guessKind(file) {
    const type = (file.type || "").toLowerCase();
    const name = file.name.toLowerCase();
    if (type.includes("pdf") || name.endsWith(".pdf"))
        return "PDF";
    if (type.includes("image/") ||
        [".jpg", ".jpeg", ".png", ".webp", ".heic"].some((ext) => name.endsWith(ext))) {
        return "IMAGE";
    }
    if (type.includes("sheet") ||
        type.includes("excel") ||
        [".xlsx", ".xls", ".csv"].some((ext) => name.endsWith(ext))) {
        return "XLSX";
    }
    if (name.endsWith(".doc") || name.endsWith(".docx"))
        return "DOC";
    return "FILE";
}
