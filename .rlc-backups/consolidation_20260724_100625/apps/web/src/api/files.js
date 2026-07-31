const API_BASE = import.meta.env?.VITE_API_URL?.replace(/\/$/, "") ||
    "https://api.rlcbausoftware.com";
/* ---------------- helpers ---------------- */
async function j(res) {
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText} – ${text}`);
    }
    return (await res.json());
}
/* ---------------- DETECT KIND ---------------- */
export function detectKind(file) {
    const name = file.name.toLowerCase();
    const mime = file.type || "";
    if (name.endsWith(".pdf") || mime.includes("pdf"))
        return "PDF";
    if (name.endsWith(".dxf") || name.endsWith(".dwg"))
        return "CAD";
    if (mime.startsWith("image/") || /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(name))
        return "IMAGE";
    return "OTHER";
}
/* ---------------- LIST ---------------- */
export async function listDocuments(projectId) {
    const url = `${API_BASE}/api/files/project/${encodeURIComponent(projectId)}/list`;
    return j(await fetch(url));
}
/* ---------------- INIT (create doc record) ---------------- */
export async function initDocument(projectId, kind, name) {
    const url = `${API_BASE}/api/files/project/${encodeURIComponent(projectId)}/init`;
    return j(await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name }),
    }));
}
/* ---------------- PRESIGN (get upload URL) ---------------- */
export async function getUploadUrl(documentId, fileName, mime) {
    const url = `${API_BASE}/api/files/document/${encodeURIComponent(documentId)}/presign`;
    return j(await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, mime }),
    }));
}
/* ---------------- PUT to storage (S3/MinIO presigned) ---------------- */
export async function putToStorage(uploadUrl, file, contentType) {
    const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
    });
    if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Upload failed: ${res.status} ${res.statusText} – ${t}`);
    }
    return true;
}
/* ---------------- SOFT DELETE ---------------- */
export async function softDeleteDocument(documentId) {
    const url = `${API_BASE}/api/files/document/${encodeURIComponent(documentId)}/soft`;
    await j(await fetch(url, { method: "DELETE" }));
    return true;
}
/* ---------------- RESTORE (⚠️ mancava) ---------------- */
export async function restoreDocument(documentId) {
    const url = `${API_BASE}/api/files/document/${encodeURIComponent(documentId)}/restore`;
    await j(await fetch(url, { method: "POST" }));
    return true;
}
/* ---------------- UPDATE META (name/tags) ---------------- */
export async function updateDocument(documentId, patch) {
    const url = `${API_BASE}/api/files/document/${encodeURIComponent(documentId)}`;
    return j(await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
    }));
}
/* ---------------- (opzionale) Get presigned view URL ---------------- */
export async function getDocumentViewUrl(projectId, docId) {
    const url = `${API_BASE}/api/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(docId)}/url`;
    return j(await fetch(url));
}
