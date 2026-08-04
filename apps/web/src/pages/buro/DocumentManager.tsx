import { API_BASE } from "../../lib/apiBase";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

type DocumentVersion = {
  id?: string;
  versionId?: string;
  createdAt?: string;
};

type ProjectDocument = {
  id: string;
  name: string;
  kind?: string;
  createdAt?: string;
  versions?: DocumentVersion[];
};

type InitFileResponse = {
  id: string;
};

type UploadUrlResponse = {
  uploadUrl: string;
  versionId?: string;
};

export default function DocumentManager() {
  const [projectId, setProjectId] = useState<string>("");
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
      const res = await axios.get<ProjectDocument[]>(
        apiUrl(`/api/files/project/${encodeURIComponent(trimmedProjectId)}/list`),
        { withCredentials: true }
      );
      setDocuments(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Errore caricando lista documenti:", err);
      setDocuments([]);
      setMessage("❌ Fehler beim Laden der Dokumentenliste.");
    } finally {
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
      const initRes = await axios.post<InitFileResponse>(
        apiUrl(`/api/files/init`),
        {
          projectId: trimmedProjectId,
          kind: guessKind(selectedFile),
          name: selectedFile.name,
        },
        { withCredentials: true }
      );

      const docId = initRes.data?.id;
      if (!docId) {
        throw new Error("Dokument-ID fehlt.");
      }

      const upRes = await axios.post<UploadUrlResponse>(
        apiUrl(`/api/files/upload-url`),
        {
          documentId: docId,
          filename: selectedFile.name,
          contentType: selectedFile.type || "application/octet-stream",
        },
        { withCredentials: true }
      );

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

      const fileInput = document.getElementById(
        "document-upload-input"
      ) as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";

      await fetchDocuments();
    } catch (err) {
      console.error("Errore upload documento:", err);
      setMessage("❌ Fehler beim Hochladen der Datei.");
    } finally {
      setUploading(false);
    }
  }, [projectId, selectedFile, fetchDocuments]);

  return (
    <div className="p-6 max-w-5xl mx-auto text-gray-800">
      <h1 className="text-2xl font-semibold mb-4">📁 Dokumentenverwaltung</h1>

      <div className="bg-gray-50 border border-gray-300 rounded-md p-4 mb-4">
        <label className="block mb-2 font-medium">Projekt-ID</label>
        <input
          type="text"
          className="border p-2 w-full rounded-md"
          placeholder="z. B. BA-2026-001 oder UUID"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        />

        <label className="block mt-4 mb-2 font-medium">Datei auswählen</label>
        <input
          id="document-upload-input"
          type="file"
          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
          className="block w-full"
        />

        {selectedFile && (
          <div className="mt-2 text-sm text-gray-600">
            Ausgewählt: <strong>{selectedFile.name}</strong>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={handleUpload}
            disabled={!canUpload}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2 px-4 rounded-md"
          >
            {uploading ? "Lade hoch..." : "📤 Datei hochladen"}
          </button>

          <button
            onClick={() => void fetchDocuments()}
            disabled={!projectId.trim() || loadingList}
            className="bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 py-2 px-4 rounded-md"
          >
            {loadingList ? "Lade..." : "🔄 Aktualisieren"}
          </button>
        </div>

        {message && <p className="mt-3 text-sm">{message}</p>}
      </div>

      <div className="bg-white shadow rounded-md p-4">
        <h2 className="text-lg font-semibold mb-3">📑 Dokumente im Projekt</h2>

        {loadingList ? (
          <p>Dokumente werden geladen...</p>
        ) : documents.length === 0 ? (
          <p>Keine Dokumente vorhanden.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 text-left border-b">
                <th className="p-2">Name</th>
                <th className="p-2">Typ</th>
                <th className="p-2">Versionen</th>
                <th className="p-2">Erstellt am</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-b hover:bg-gray-50">
                  <td className="p-2">{doc.name}</td>
                  <td className="p-2">{doc.kind || "—"}</td>
                  <td className="p-2">{doc.versions?.length ?? 1}</td>
                  <td className="p-2">
                    {doc.createdAt
                      ? new Date(doc.createdAt).toLocaleString("de-DE")
                      : "—"}
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

function guessKind(file: File): string {
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();

  if (type.includes("pdf") || name.endsWith(".pdf")) return "PDF";
  if (
    type.includes("image/") ||
    [".jpg", ".jpeg", ".png", ".webp", ".heic"].some((ext) =>
      name.endsWith(ext)
    )
  ) {
    return "IMAGE";
  }
  if (
    type.includes("sheet") ||
    type.includes("excel") ||
    [".xlsx", ".xls", ".csv"].some((ext) => name.endsWith(ext))
  ) {
    return "XLSX";
  }
  if (name.endsWith(".doc") || name.endsWith(".docx")) return "DOC";
  return "FILE";
}










