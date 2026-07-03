// apps/web/src/api/api.ts
import { apiUrl } from "../lib/apiBase";

async function readJsonSafe(res: Response) {
  return res.json().catch(() => null);
}

export async function api<T = any>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const isFormData = init.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(init.headers as any),
  };

  // NON mettere Content-Type se FormData
  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(apiUrl(url), {
    credentials: "include",
    ...init,
    headers,
  });

  const data = await readJsonSafe(res);

  if (!res.ok) {
    const msg =
      data?.error ||
      data?.message ||
      (typeof data === "string" ? data : null) ||
      `API Fehler (${res.status})`;

    throw new Error(msg);
  }

  if (data && data.ok === false) {
    throw new Error(data.error || "Backend Fehler");
  }

  return data as T;
}
