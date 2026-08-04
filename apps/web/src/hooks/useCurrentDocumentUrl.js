import { API_BASE } from "../lib/apiBase";
import { useEffect, useState } from "react";
import { useProject } from "../store/useProject";
function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
}
export function useCurrentDocumentUrl({ documentId }) {
    const { currentProject } = useProject();
    const projectId = currentProject?.id ?? null;
    const [url, setUrl] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        let active = true;
        setUrl(null);
        setError(null);
        if (!projectId || !documentId)
            return;
        setLoading(true);
        fetch(apiUrl(`/api/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/url`))
            .then(async (r) => {
            if (!r.ok)
                throw new Error(`${r.status} ${r.statusText}`);
            return r.json();
        })
            .then((j) => {
            if (!active)
                return;
            setUrl(j?.url || null);
        })
            .catch((e) => {
            if (!active)
                return;
            setError(e?.message || "URL-Fehler");
        })
            .finally(() => {
            if (!active)
                return;
            setLoading(false);
        });
        return () => {
            active = false;
        };
    }, [projectId, documentId]);
    return {
        url,
        error,
        loading,
        projectId,
    };
}
