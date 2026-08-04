import { API_BASE } from "./apiBase";
// apps/web/src/lib/api.ts
/* =========================================================
   BASE URL (DEV + PROD)
   ========================================================= */
function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
}
/* =========================================================
   INTERNAL FETCH (con timeout + error handling serio)
   ========================================================= */
async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const res = await fetch(apiUrl(path), {
            credentials: "include",
            signal: controller.signal,
            ...options,
        });
        const text = await res.text();
        let data = {};
        try {
            data = text ? JSON.parse(text) : {};
        }
        catch {
            data = { raw: text };
        }
        if (!res.ok) {
            throw new Error(data?.error || data?.message || text || `Request failed (${res.status})`);
        }
        if (data?.ok === false) {
            throw new Error(data?.error || data?.message || "Backend Fehler");
        }
        return data;
    }
    catch (err) {
        if (err?.name === "AbortError") {
            throw new Error("Timeout API");
        }
        throw err;
    }
    finally {
        clearTimeout(timeout);
    }
}
/* =========================================================
   METHODS
   ========================================================= */
export function apiGet(path) {
    return request(path, {
        method: "GET",
    });
}
export function apiPost(path, body) {
    return request(path, {
        method: "POST",
        headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
        body: body instanceof FormData ? body : JSON.stringify(body || {}),
    });
}
export function apiPut(path, body) {
    return request(path, {
        method: "PUT",
        headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
        body: body instanceof FormData ? body : JSON.stringify(body || {}),
    });
}
export function apiDelete(path) {
    return request(path, {
        method: "DELETE",
    });
}
