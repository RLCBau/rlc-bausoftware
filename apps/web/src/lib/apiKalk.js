import { API_BASE } from "./apiBase";
// apps/web/src/lib/apiKalk.ts
function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
}
async function http(path, init = {}) {
    const res = await fetch(apiUrl(path), {
        credentials: "include",
        ...init,
        headers: {
            "Content-Type": "application/json",
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
        throw new Error(obj?.error ||
            obj?.message ||
            text ||
            `HTTP ${res.status} ${res.statusText}`);
    }
    const obj = typeof data === "object" && data !== null
        ? data
        : null;
    if (obj?.ok === false) {
        throw new Error(obj?.error || obj?.message || "Backend Fehler");
    }
    return data;
}
export async function fetchTemplates(take = 200, q = "") {
    const url = new URL(apiUrl("/api/kalkulation/recipes/templates"), window.location.origin);
    url.searchParams.set("take", String(take));
    if (q.trim())
        url.searchParams.set("q", q.trim());
    return http(`${url.pathname}${url.search}`);
}
export async function fetchVariants(templateKey) {
    return http(`/api/kalkulation/recipes/templates/${encodeURIComponent(templateKey)}/variants`);
}
export async function calc(templateKey, qty, params = {}, variantId, variantKey) {
    return http(`/api/kalkulation/recipes/calc`, {
        method: "POST",
        body: JSON.stringify({
            templateKey,
            qty,
            params,
            variantId,
            variantKey,
        }),
    });
}
export async function calcSuggest(templateKey, qty, context, take = 5) {
    return http(`/api/kalkulation/recipes/calc-suggest`, {
        method: "POST",
        body: JSON.stringify({
            templateKey,
            qty,
            context,
            take,
        }),
    });
}
