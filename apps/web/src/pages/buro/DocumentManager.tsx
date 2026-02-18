import React, { useState, useEffect } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function DocumentManager() {
  const [projectId, setProjectId] = useState<string>("");
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // === Carica lista documenti ===
  const fetchDocuments = async () => {
    if (!projectId) return;
    try {
      const res = await axios.get(`${API_BASE}/api/files/project/${projectId}/list`);
      setDocuments(res.data || []);
    } catch (err) {
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
    } catch (err) {
      console.error("Errore upload:", err);
      setMessage("❌ Errore durante l'upload del file.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto text-gray-800">
      <h1 className="text-2xl font-semibold mb-4">📁 Dokumentenverwaltung</h1>

      <div className="bg-gray-50 border border-gray-300 rounded-md p-4 mb-4">
        <label className="block mb-2 font-medium">Projekt-ID:</label>
        <input
          type="text"
          className="border p-2 w-full rounded-md"
          placeholder="z. B. 9c223e31-e014-4ed8-926d-8c5ba06bf3ae"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        />

        <label className="block mt-4 mb-2 font-medium">Datei auswählen:</label>
        <input
          type="file"
          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
          className="block w-full"
        />

        <button
          onClick={handleUpload}
          disabled={loading}
          className="mt-4 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md"
        >
          {loading ? "Lade hoch..." : "📤 Datei hochladen"}
        </button>

        {message && <p className="mt-3 text-sm">{message}</p>}
      </div>

      <div className="bg-white shadow rounded-md p-4">
        <h2 className="text-lg font-semibold mb-3">📑 Dokumente im Projekt</h2>

        <button
          onClick={fetchDocuments}
          className="mb-3 bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded-md"
        >
          🔄 Aktualisieren
        </button>

        {documents.length === 0 ? (
          <p>Keine Dokumente vorhanden.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 text-left border-b">
                <th className="p-2">Name</th>
                <th className="p-2">Typ</th>
                <th className="p-2">Version</th>
                <th className="p-2">Erstellt am</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-b hover:bg-gray-50">
                  <td className="p-2">{doc.name}</td>
                  <td className="p-2">{doc.kind}</td>
                  <td className="p-2">{doc.versions?.length || 1}</td>
                  <td className="p-2">
                    {new Date(doc.createdAt).toLocaleString("de-DE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
