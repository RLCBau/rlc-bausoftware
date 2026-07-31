// apps/web/src/lib/recipesApi.ts
const API_BASE = import.meta?.env?.VITE_API_URL ||
    import.meta?.env?.VITE_BACKEND_URL ||
    "https://api.rlcbausoftware.com";
function joinUrl(base, path) {
    return `${String(base).replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
}
async function http(path, init) {
    const url = joinUrl(API_BASE, path);
    const res = await fetch(url, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers || {}),
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
        const msg = (data && (data.error || data.message)) ||
            `HTTP ${res.status} ${res.statusText}`;
        throw new Error(msg);
    }
    return data;
}
/** ===== API ===== */
export function fetchTemplates(take = 50) {
    return http(`/api/kalkulation/recipes/templates?take=${take}`);
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
    return http(`/api/kalkulation/recipes/calc`, {
        method: "POST",
        body: JSON.stringify(req),
    });
}
export function calcSuggestTemplate(req) {
    return http(`/api/kalkulation/recipes/calc-suggest`, {
        method: "POST",
        body: JSON.stringify(req),
    });
}
