import { API_BASE } from "../lib/apiBase";
// src/api/files.ts
type Kind = "PDF" | "CAD" | "IMAGE" | "OTHER";

function getToken(): string {
  try {
    const directKeys = [
      "rlc_token",
      "token",
      "authToken",
      "accessToken",
      "rlc_auth_token",
      "rlc_access_token",
      "rlc.auth.token",
      "rlc_mobile_token"
    ];

    for (const key of directKeys) {
      for (const storage of [localStorage, sessionStorage]) {
        const value = storage.getItem(key);
        if (value && value.trim()) return value.trim();
      }
    }

    const jsonKeys = [
      "rlc_auth",
      "auth",
      "user",
      "session",
      "rlc_session"
    ];

    for (const key of jsonKeys) {
      for (const storage of [localStorage, sessionStorage]) {
        const raw = storage.getItem(key);
        if (!raw) continue;

        try {
          const parsed = JSON.parse(raw);
          const token =
            parsed?.token ??
            parsed?.accessToken ??
            parsed?.authToken ??
            parsed?.jwt ??
            parsed?.data?.token ??
            parsed?.data?.accessToken;

          if (typeof token === "string" && token.trim()) {
            return token.trim();
          }
        } catch {}
      }
    }
  } catch {}

  return "";
}


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

function authHeaders(extra?: Record<string, string>): HeadersInit {
  const token = getToken();

  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
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
      headers: authHeaders(),
    })
  );
}

/* ---------------- INIT (create doc record) ---------------- */
export async function initDocument(
  projectId: string,
  kind: Kind,
  name: string
) {
  const url = apiUrl("/api/files/init");

  return j<{ ok: true; documentId: string }>(
    await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: authHeaders({
        Accept: "application/json",
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({
        projectId,
        kind,
        name
      }),
    })
  );
}

/* ---------------- PRESIGN (get upload URL) ---------------- */
export async function getUploadUrl(
  documentId: string,
  fileName: string,
  mime: string
) {
  const url = apiUrl("/api/files/upload-url");

  return j<{
    ok: true;
    uploadUrl: string;
    key: string;
    documentId: string;
    version: number;
    contentType: string;
  }>(
    await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: authHeaders({
        Accept: "application/json",
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({
        documentId,
        filename: fileName,
        contentType: mime
      }),
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
      headers: authHeaders(),
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
      headers: authHeaders(),
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
      headers: authHeaders({ "Content-Type": "application/json" }),
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
      headers: authHeaders(),
    })
  );
}













export async function completeUpload(args: {
  documentId: string;
  key: string;
  version: number;
  contentType: string;
  size?: number;
}) {
  const res = await fetch(apiUrl("/api/files/upload-complete"), {
    method: "POST",
    credentials: "include",
    headers: authHeaders({
      Accept: "application/json",
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(args),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      data?.error || `Upload-Abschluss fehlgeschlagen (${res.status})`
    );
  }

  return data;
}


/* ---------------- DIRECT SERVER UPLOAD ---------------- */
export async function uploadFileDirect(
  documentId: string,
  file: File
) {
  const form = new FormData();

  form.append("documentId", documentId);
  form.append("file", file, file.name);

  const res = await fetch(apiUrl("/api/files/upload-direct"), {
    method: "POST",
    credentials: "include",
    headers: authHeaders(),
    body: form
  });

  return j<{
    ok: true;
    documentId: string;
    versionId: string;
    version: number;
    key: string;
    size: number;
  }>(res);
}


export type DocumentVersionHistoryDto = {
  id: string;
  version: number;
  current: boolean;
  storageId?: string | null;
  key?: string;
  mime?: string;
  size?: number;
  exists?: boolean;
  createdAt?: string | null;
};

export async function getDocumentVersions(documentId: string) {
  const url = apiUrl(
    `/api/files/document/${encodeURIComponent(documentId)}/versions`
  );

  return j<{
    ok: true;
    documentId: string;
    currentVid?: string | null;
    versions: DocumentVersionHistoryDto[];
  }>(
    await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: authHeaders()
    })
  );
}


export async function restoreDocumentVersion(
  documentId: string,
  versionId: string
) {
  const url = apiUrl(
    `/api/files/document/${encodeURIComponent(documentId)}/version/${encodeURIComponent(versionId)}/restore`
  );

  return j<{
    ok: true;
    documentId: string;
    versionId: string;
    version: number;
  }>(
    await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: authHeaders({
        Accept: "application/json",
        "Content-Type": "application/json"
      })
    })
  );
}
