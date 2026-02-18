// src/api/files.ts
type Kind = "PDF" | "CAD" | "IMAGE" | "OTHER";

const API_BASE =
  ((import.meta as any).env?.VITE_API_URL as string)?.replace(/\/$/, "") ||
  "http://localhost:4000";

/* ---------------- helpers ---------------- */
async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} – ${text}`);
  }
  return (await res.json()) as T;
}

/* ---------------- DETECT KIND ---------------- */
export function detectKind(file: File): Kind {
  const name = file.name.toLowerCase();
  const mime = file.type || "";
  if (name.endsWith(".pdf") || mime.includes("pdf")) return "PDF";
  if (name.endsWith(".dxf") || name.endsWith(".dwg")) return "CAD";
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(name))
    return "IMAGE";
  return "OTHER";
}

/* ---------------- LIST ---------------- */
export async function listDocuments(projectId: string) {
  const url = `${API_BASE}/api/files/project/${encodeURIComponent(projectId)}/list`;
  return j<any[]>(await fetch(url));
}

/* ---------------- INIT (create doc record) ---------------- */
export async function initDocument(projectId: string, kind: Kind, name: string) {
  const url = `${API_BASE}/api/files/project/${encodeURIComponent(projectId)}/init`;
  return j<{ documentId: string }>(
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, name }),
    })
  );
}

/* ---------------- PRESIGN (get upload URL) ---------------- */
export async function getUploadUrl(
  documentId: string,
  fileName: string,
  mime: string
) {
  const url = `${API_BASE}/api/files/document/${encodeURIComponent(
    documentId
  )}/presign`;
  return j<{ uploadUrl: string; storageId: string }>(
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, mime }),
    })
  );
}

/* ---------------- PUT to storage (S3/MinIO presigned) ---------------- */
export async function putToStorage(
  uploadUrl: string,
  file: File | Blob,
  contentType: string
) {
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
export async function softDeleteDocument(documentId: string) {
  const url = `${API_BASE}/api/files/document/${encodeURIComponent(
    documentId
  )}/soft`;
  await j(await fetch(url, { method: "DELETE" }));
  return true;
}

/* ---------------- RESTORE (⚠️ mancava) ---------------- */
export async function restoreDocument(documentId: string) {
  const url = `${API_BASE}/api/files/document/${encodeURIComponent(
    documentId
  )}/restore`;
  await j(await fetch(url, { method: "POST" }));
  return true;
}

/* ---------------- UPDATE META (name/tags) ---------------- */
export async function updateDocument(
  documentId: string,
  patch: { name?: string; tags?: string[] }
) {
  const url = `${API_BASE}/api/files/document/${encodeURIComponent(
    documentId
  )}`;
  return j<any>(
    await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
  );
}

/* ---------------- (opzionale) Get presigned view URL ---------------- */
export async function getDocumentViewUrl(projectId: string, docId: string) {
  const url = `${API_BASE}/api/${encodeURIComponent(
    projectId
  )}/documents/${encodeURIComponent(docId)}/url`;
  return j<{ ok: boolean; url: string }>(await fetch(url));
}
