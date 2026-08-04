import { API_BASE } from "./apiBase";
// apps/web/src/lib/api.ts

/* =========================================================
   BASE URL (DEV + PROD)
   ========================================================= */

function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

/* =========================================================
   TYPES
   ========================================================= */

export type ApiResult<T> = {
  ok?: boolean;
  error?: string;
} & T;

/* =========================================================
   INTERNAL FETCH (con timeout + error handling serio)
   ========================================================= */

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(apiUrl(path), {
      credentials: "include",
      signal: controller.signal,
      ...options,
    });

    const text = await res.text();

    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      throw new Error(
        data?.error || data?.message || text || `Request failed (${res.status})`
      );
    }

    if (data?.ok === false) {
      throw new Error(data?.error || data?.message || "Backend Fehler");
    }

    return data as T;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("Timeout API");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/* =========================================================
   METHODS
   ========================================================= */

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, {
    method: "GET",
  });
}

export function apiPost<T>(path: string, body?: any): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers:
      body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body || {}),
  });
}

export function apiPut<T>(path: string, body?: any): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    headers:
      body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body || {}),
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, {
    method: "DELETE",
  });
}











