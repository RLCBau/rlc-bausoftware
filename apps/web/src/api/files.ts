import { API_BASE } from "../lib/apiBase";
// src/api/files.ts
type Kind = "PDF" | "CAD" | "IMAGE" | "OTHER";

export type DocumentVersionDto = {
  id: string;
  storageId?: string | null;
  fileName?: string | null;
  mime?: string | null;
  size?: number | null;
  uploadedAt?: string | null;
};

export type DocumentDto = {
  id: string;
  projectId?: string;
  kind: Kind | string;
  name: string;
  meta?: {
    tags?: string[];
    [key: string]: any;
  } | null;
  versions?: DocumentVersionDto[];
  updatedAt?: string;
  deletedAt?: string | null;
};

/* ---------------- helpers ---------------- */
function apiUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

async function readJsonSafe<T>(res: Response): Promise<T | null> {
  return res.json().catch(() => null);
}

async function j<T>(res: Response): Promise<T> {
  const data = await readJsonSafe<any>(res);

  if (!res.ok) {
    const msg = data?.error || data?.message || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  if (data?.ok === false) {
    throw new Error(data?.error || "Backend Fehler");
  }

  return data as T;
}

/* ---------------- DETECT KIND ---------------- */
export function detectKind(file: File): Kind {
  const name = file.name.toLowerCase();
  const mime = file.type || "";

  if (name.endsWith(".pdf") || mime.includes("pdf")) return "PDF";
  if (name.endsWith(".dxf") || name.endsWith(".dwg")) return "CAD";
  if (
    mime.startsWith("image/") ||
    /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(name)
  ) {
    return "IMAGE";
  }

  return "OTHER";
}

/* ---------------- LIST ---------------- */
export async function listDocuments(projectId: string) {
  const url = apiUrl(`/api/files/project/${encodeURIComponent(projectId)}/list`);

  return j<DocumentDto[]>(
    await fetch(url, {
      method: "GET",
      credentials: "include",
    })
  );
}

/* ---------------- INIT (create doc record) ---------------- */
export async function initDocument(
  projectId: string,
  kind: Kind,
  name: string
) {
  const url = apiUrl(`/api/files/project/${encodeURIComponent(projectId)}/init`);

  return j<{ documentId: string }>(
    await fetch(url, {
      method: "POST",
      credentials: "include",
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
  const url = apiUrl(
    `/api/files/document/${encodeURIComponent(documentId)}/presign`
  );

  return j<{ uploadUrl: string; storageId: string }>(
    await fetch(url, {
      method: "POST",
      credentials: "include",
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
  const url = apiUrl(`/api/files/document/${encodeURIComponent(documentId)}/soft`);

  await j(
    await fetch(url, {
      method: "DELETE",
      credentials: "include",
    })
  );

  return true;
}

/* ---------------- RESTORE ---------------- */
export async function restoreDocument(documentId: string) {
  const url = apiUrl(
    `/api/files/document/${encodeURIComponent(documentId)}/restore`
  );

  await j(
    await fetch(url, {
      method: "POST",
      credentials: "include",
    })
  );

  return true;
}

/* ---------------- UPDATE META (name/tags) ---------------- */
export async function updateDocument(
  documentId: string,
  patch: { name?: string; tags?: string[] }
) {
  const url = apiUrl(`/api/files/document/${encodeURIComponent(documentId)}`);

  return j<any>(
    await fetch(url, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
  );
}

/* ---------------- VIEW URL ---------------- */
export async function getDocumentViewUrl(documentId: string) {
  const url = apiUrl(`/api/files/document/${encodeURIComponent(documentId)}/url`);

  return j<{ ok: boolean; url: string }>(
    await fetch(url, {
      method: "GET",
      credentials: "include",
    })
  );
}











