import { apiUrl } from "../lib/apiBase";
function getAuthToken() {
    const keys = [
        "rlc_token",
        "token",
        "authToken",
        "accessToken",
        "rlc.auth.token",
        "rlc_mobile_token",
    ];
    for (const key of keys) {
        const value = localStorage.getItem(key);
        if (value?.trim())
            return value.trim();
    }
    try {
        const auth = JSON.parse(localStorage.getItem("rlc_auth") || "null");
        return auth?.token || auth?.accessToken || null;
    }
    catch {
        return null;
    }
}
function authHeaders(json = false) {
    const token = getAuthToken();
    return {
        Accept: "application/json",
        ...(json ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}
async function request(path, init = {}) {
    const response = await fetch(apiUrl(path), {
        credentials: "include",
        ...init,
        headers: {
            ...authHeaders(Boolean(init.body)),
            ...init.headers,
        },
    });
    const payload = (await response.json().catch(() => null));
    if (!response.ok || !payload) {
        throw new Error(payload?.error || `Vorlagen-API Fehler (${response.status})`);
    }
    return payload;
}
export function fetchVorlageCategories() {
    return request("/api/vorlagen/categories");
}
export function fetchVorlagen(filters) {
    const query = new URLSearchParams();
    if (filters.search)
        query.set("search", filters.search);
    if (filters.category)
        query.set("category", filters.category);
    if (filters.favorites)
        query.set("favorites", "true");
    query.set("page", String(filters.page || 1));
    query.set("pageSize", String(filters.pageSize || 48));
    return request(`/api/vorlagen?${query.toString()}`);
}
export function toggleVorlageFavorite(id) {
    return request(`/api/vorlagen/${encodeURIComponent(id)}/favorite`, {
        method: "POST",
        body: "{}",
    });
}
export function copyVorlage(id) {
    return request(`/api/vorlagen/${encodeURIComponent(id)}/copy`, {
        method: "POST",
        body: "{}",
    });
}
export function updateVorlage(id, patch) {
    return request(`/api/vorlagen/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(patch),
    });
}
export function compileVorlage(id, projectId, values) {
    return request(`/api/vorlagen/${encodeURIComponent(id)}/compile`, {
        method: "POST",
        body: JSON.stringify({ projectId, values }),
    });
}
export function saveVorlageDocument(input) {
    return request("/api/vorlagen/documents", {
        method: "POST",
        body: JSON.stringify(input),
    });
}
function downloadName(response, fallback) {
    const disposition = response.headers.get("content-disposition") || "";
    const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    if (utf8) {
        try {
            return decodeURIComponent(utf8);
        }
        catch {
            return fallback;
        }
    }
    return disposition.match(/filename="([^"]+)"/i)?.[1] || fallback;
}
export async function exportVorlage(id, input) {
    const response = await fetch(apiUrl(`/api/vorlagen/${encodeURIComponent(id)}/export`), {
        method: "POST",
        credentials: "include",
        headers: authHeaders(true),
        body: JSON.stringify(input),
    });
    if (!response.ok) {
        const payload = (await response.json().catch(() => null));
        throw new Error(payload?.error || `Export fehlgeschlagen (${response.status})`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = downloadName(response, `RLC_Vorlage.${input.format}`);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
