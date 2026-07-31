import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from "react";
import axios from "axios";
const API_BASE = import.meta.env.VITE_API_URL || "https://api.rlcbausoftware.com";
export default function DocumentManager() {
    const [projectId, setProjectId] = useState("");
    const [documents, setDocuments] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    // === Carica lista documenti ===
    const fetchDocuments = async () => {
        if (!projectId)
            return;
        try {
            const res = await axios.get(`${API_BASE}/api/files/project/${projectId}/list`);
            setDocuments(res.data || []);
        }
        catch (err) {
            console.error("Errore caricando lista:", err);
            setMessage("❌ Errore durante il caricamento dei documenti");
        }
    };
    // === Upload ===
    const handleUpload = async () => {
        if (!selectedFile || !projectId) {
            setMessage("⚠️ Seleziona un file e un Project-ID prima di continuare.");
            return;
        }
        setLoading(true);
        setMessage("⏳ Upload in corso...");
        try {
            // 1. Crea record nel DB
            const initRes = await axios.post(`${API_BASE}/api/files/init`, {
                projectId,
                kind: "PDF",
                name: selectedFile.name,
            });
            const docId = initRes.data.id;
            // 2. Ottieni URL firmata da MinIO
            const upRes = await axios.post(`${API_BASE}/api/files/upload-url`, {
                documentId: docId,
                filename: selectedFile.name,
                contentType: selectedFile.type || "application/octet-stream",
            });
            const { uploadUrl, versionId } = upRes.data;
            // 3. Carica il file fisico
            await axios.put(uploadUrl, selectedFile, {
                headers: { "Content-Type": selectedFile.type },
            });
            setMessage("✅ Upload completato con successo!");
            setSelectedFile(null);
            // 4. Ricarica lista documenti
            fetchDocuments();
        }
        catch (err) {
            console.error("Errore upload:", err);
            setMessage("❌ Errore durante l'upload del file.");
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: "p-6 max-w-5xl mx-auto text-gray-800", children: [_jsx("h1", { className: "text-2xl font-semibold mb-4", children: "\uD83D\uDCC1 Dokumentenverwaltung" }), _jsxs("div", { className: "bg-gray-50 border border-gray-300 rounded-md p-4 mb-4", children: [_jsx("label", { className: "block mb-2 font-medium", children: "Projekt-ID:" }), _jsx("input", { type: "text", className: "border p-2 w-full rounded-md", placeholder: "z. B. 9c223e31-e014-4ed8-926d-8c5ba06bf3ae", value: projectId, onChange: (e) => setProjectId(e.target.value) }), _jsx("label", { className: "block mt-4 mb-2 font-medium", children: "Datei ausw\u00E4hlen:" }), _jsx("input", { type: "file", onChange: (e) => setSelectedFile(e.target.files?.[0] || null), className: "block w-full" }), _jsx("button", { onClick: handleUpload, disabled: loading, className: "mt-4 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md", children: loading ? "Lade hoch..." : "📤 Datei hochladen" }), message && _jsx("p", { className: "mt-3 text-sm", children: message })] }), _jsxs("div", { className: "bg-white shadow rounded-md p-4", children: [_jsx("h2", { className: "text-lg font-semibold mb-3", children: "\uD83D\uDCD1 Dokumente im Projekt" }), _jsx("button", { onClick: fetchDocuments, className: "mb-3 bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded-md", children: "\uD83D\uDD04 Aktualisieren" }), documents.length === 0 ? (_jsx("p", { children: "Keine Dokumente vorhanden." })) : (_jsxs("table", { className: "w-full border-collapse", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-100 text-left border-b", children: [_jsx("th", { className: "p-2", children: "Name" }), _jsx("th", { className: "p-2", children: "Typ" }), _jsx("th", { className: "p-2", children: "Version" }), _jsx("th", { className: "p-2", children: "Erstellt am" })] }) }), _jsx("tbody", { children: documents.map((doc) => (_jsxs("tr", { className: "border-b hover:bg-gray-50", children: [_jsx("td", { className: "p-2", children: doc.name }), _jsx("td", { className: "p-2", children: doc.kind }), _jsx("td", { className: "p-2", children: doc.versions?.length || 1 }), _jsx("td", { className: "p-2", children: new Date(doc.createdAt).toLocaleString("de-DE") })] }, doc.id))) })] }))] })] }));
}
