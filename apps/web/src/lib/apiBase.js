// apps/web/src/lib/apiBase.ts
const RAW_API_BASE = String(import.meta?.env?.VITE_API_URL ||
    import.meta?.env?.VITE_BACKEND_URL ||
    "https://api.rlcbausoftware.com")
    .trim()
    .replace(/\/+$/, "");
export const API_BASE = RAW_API_BASE;
console.log("API_BASE_RUNTIME =", API_BASE);
export function apiUrl(path) {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    if (!API_BASE)
        return cleanPath;
    if (API_BASE.endsWith("/api") && cleanPath.startsWith("/api/")) {
        return `${API_BASE}${cleanPath.slice(4)}`;
    }
    return `${API_BASE}${cleanPath}`;
}
