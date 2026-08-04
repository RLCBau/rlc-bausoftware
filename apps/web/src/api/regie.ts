import { API_BASE } from "../lib/apiBase";
// apps/web/src/api/regie.ts

export type RegieItem = {
  id: string;
  projectId: string;
  date: string; // ISO
  worker?: string;
  hours?: number | null;
  machine?: string;
  material?: string;
  quantity?: number | null;
  unit?: string;
  comment?: string;
  lvItemId?: string | null;
  createdAt?: string;
};

function apiUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

async function readJsonSafe<T>(res: Response): Promise<T | null> {
  return res.json().catch(() => null);
}

async function ensureOk<T>(res: Response, fallback: string): Promise<T> {
  const data = await readJsonSafe<any>(res);

  if (!res.ok) {
    const msg = data?.error || data?.message || `${fallback} (${res.status})`;
    throw new Error(msg);
  }

  if (data?.ok === false) {
    throw new Error(data?.error || fallback);
  }

  return data as T;
}

export async function listRegie(projectId?: string): Promise<RegieItem[]> {
  const url = projectId
    ? apiUrl(`/api/regie?projectId=${encodeURIComponent(projectId)}`)
    : apiUrl(`/api/regie`);

  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  return ensureOk<RegieItem[]>(res, "Fehler beim Laden der Regieberichte");
}

export async function createRegie(
  input: Omit<RegieItem, "id" | "createdAt">
): Promise<RegieItem> {
  const res = await fetch(apiUrl(`/api/regie`), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  return ensureOk<RegieItem>(res, "Fehler beim Erstellen des Regieberichts");
}

export async function deleteRegie(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/regie/${encodeURIComponent(id)}`), {
    method: "DELETE",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  await ensureOk<any>(res, "Fehler beim Löschen des Regieberichts");
}











