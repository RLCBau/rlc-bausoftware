import { API_BASE } from "./apiBase";
// apps/web/src/lib/recipesApi.ts
function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
}
function withQuery(path, params) {
    if (!params)
        return path;
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null)
            continue;
        qs.set(key, String(value));
    }
    const s = qs.toString();
    return s ? `${path}?${s}` : path;
}
async function http(path, init = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
        const res = await fetch(apiUrl(path), {
            credentials: "include",
            signal: controller.signal,
            ...init,
            headers: {
                ...(isFormData ? {} : { "Content-Type": "application/json" }),
                ...(init.headers || {}),
            },
        });
        const text = await res.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        }
        catch {
            data = text;
        }
        if (!res.ok) {
            const obj = typeof data === "object" && data !== null
                ? data
                : null;
            const msg = obj?.error ||
                obj?.message ||
                text ||
                `HTTP ${res.status} ${res.statusText}`;
            throw new Error(msg);
        }
        const obj = typeof data === "object" && data !== null
            ? data
            : null;
        if (obj?.ok === false) {
            throw new Error(obj?.error ||
                obj?.message ||
                "Backend Fehler");
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
   API
   ========================================================= */
export function fetchTemplates(take = 50) {
    return http(withQuery("/api/kalkulation/recipes/templates", { take }));
}
export function fetchTemplate(templateKey) {
    return http(`/api/kalkulation/recipes/templates/${encodeURIComponent(templateKey)}`);
}
export function fetchVariants(templateKey) {
    return http(`/api/kalkulation/recipes/templates/${encodeURIComponent(templateKey)}/variants`);
}
export function suggestTemplate(templateKey, req) {
    return http(`/api/kalkulation/recipes/templates/${encodeURIComponent(templateKey)}/suggest`, {
        method: "POST",
        body: JSON.stringify(req),
    });
}
export function calcTemplate(req) {
    return http("/api/kalkulation/recipes/calc", {
        method: "POST",
        body: JSON.stringify(req),
    });
}
export function calcSuggestTemplate(req) {
    return http("/api/kalkulation/recipes/calc-suggest", {
        method: "POST",
        body: JSON.stringify(req),
    });
}
