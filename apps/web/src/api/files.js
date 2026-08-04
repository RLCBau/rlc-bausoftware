import { API_BASE } from "../lib/apiBase";
/* ---------------- helpers ---------------- */
function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
}
async function readJsonSafe(res) {
    return res.json().catch(() => null);
}
async function j(res) {
    const data = await readJsonSafe(res);
    if (!res.ok) {
        const msg = data?.error || data?.message || `${res.status} ${res.statusText}`;
        throw new Error(msg);
    }
    if (data?.ok === false) {
        throw new Error(data?.error || "Backend Fehler");
    }
    return data;
}
/* ---------------- DETECT KIND ---------------- */
export function detectKind(file) {
    const name = file.name.toLowerCase();
    const mime = file.type || "";
    if (name.endsWith(".pdf") || mime.includes("pdf"))
        return "PDF";
    if (name.endsWith(".dxf") || name.endsWith(".dwg"))
        return "CAD";
    if (mime.startsWith("image/") ||
        /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(name)) {
        return "IMAGE";
    }
    return "OTHER";
}
/* ---------------- LIST ---------------- */
export async function listDocuments(projectId) {
    const url = apiUrl(`/api/files/project/${encodeURIComponent(projectId)}/list`);
    return j(await fetch(url, {
        method: "GET",
        credentials: "include",
    }));
}
/* ---------------- INIT (create doc record) ---------------- */
export async function initDocument(projectId, kind, name) {
    const url = apiUrl(`/api/files/project/${encodeURIComponent(projectId)}/init`);
    return j(await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name }),
    }));
}
/* ---------------- PRESIGN (get upload URL) ---------------- */
export async function getUploadUrl(documentId, fileName, mime) {
    const url = apiUrl(`/api/files/document/${encodeURIComponent(documentId)}/presign`);
    return j(await fetch(url, {
        method: "POST",
        credentials: "include",
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
    const url = apiUrl(`/api/files/document/${encodeURIComponent(documentId)}/soft`);
    await j(await fetch(url, {
        method: "DELETE",
        credentials: "include",
    }));
    return true;
}
/* ---------------- RESTORE ---------------- */
export async function restoreDocument(documentId) {
    const url = apiUrl(`/api/files/document/${encodeURIComponent(documentId)}/restore`);
    await j(await fetch(url, {
        method: "POST",
        credentials: "include",
    }));
    return true;
}
/* ---------------- UPDATE META (name/tags) ---------------- */
export async function updateDocument(documentId, patch) {
    const url = apiUrl(`/api/files/document/${encodeURIComponent(documentId)}`);
    return j(await fetch(url, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
    }));
}
/* ---------------- VIEW URL ---------------- */
export async function getDocumentViewUrl(documentId) {
    const url = apiUrl(`/api/files/document/${encodeURIComponent(documentId)}/url`);
    return j(await fetch(url, {
        method: "GET",
        credentials: "include",
    }));
}
