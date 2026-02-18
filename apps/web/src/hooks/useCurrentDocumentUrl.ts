// Deutsch: Liefert eine anzeigbare URL (presigned oder /files) für das aktuelle Dokument
import { useEffect, useState } from "react";
import { useProject } from "../store/project";

const API = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/$/, "");

export function useCurrentDocumentUrl() {
  const { projectId, currentDoc } = useProject();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setUrl(null); setError(null);
    if (!projectId || !currentDoc?.id) return;
    setLoading(true);
    fetch(`${API}/api/${projectId}/documents/${currentDoc.id}/url`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const j = await r.json();
        setUrl(j?.url || null);
      })
      .catch((e) => setError(e?.message || "URL-Fehler"))
      .finally(() => setLoading(false));
  }, [projectId, currentDoc?.id]);

  return { url, error, loading, projectId, currentDoc };
}
