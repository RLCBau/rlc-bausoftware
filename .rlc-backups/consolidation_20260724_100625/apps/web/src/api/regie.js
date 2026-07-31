// apps/web/src/api/regie.ts
const API_BASE = import.meta.env?.VITE_API_URL?.replace(/\/$/, "") || "https://api.rlcbausoftware.com";
export async function listRegie(projectId) {
    const url = projectId ? `${API_BASE}/api/regie?projectId=${encodeURIComponent(projectId)}`
        : `${API_BASE}/api/regie`;
    const r = await fetch(url);
    if (!r.ok)
        throw new Error(`LIST failed: ${r.status}`);
    return r.json();
}
export async function createRegie(input) {
    const r = await fetch(`${API_BASE}/api/regie`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    if (!r.ok)
        throw new Error(`CREATE failed: ${r.status}`);
    return r.json();
}
export async function deleteRegie(id) {
    const r = await fetch(`${API_BASE}/api/regie/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!r.ok)
        throw new Error(`DELETE failed: ${r.status}`);
}
