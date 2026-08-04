import { API_BASE } from "../lib/apiBase";
function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
}
async function readJsonSafe(res) {
    return res.json().catch(() => null);
}
async function ensureOk(res, fallback) {
    const data = await readJsonSafe(res);
    if (!res.ok) {
        const msg = data?.error || data?.message || `${fallback} (${res.status})`;
        throw new Error(msg);
    }
    if (data?.ok === false) {
        throw new Error(data?.error || fallback);
    }
    return data;
}
export async function listRegie(projectId) {
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
    return ensureOk(res, "Fehler beim Laden der Regieberichte");
}
export async function createRegie(input) {
    const res = await fetch(apiUrl(`/api/regie`), {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify(input),
    });
    return ensureOk(res, "Fehler beim Erstellen des Regieberichts");
}
export async function deleteRegie(id) {
    const res = await fetch(apiUrl(`/api/regie/${encodeURIComponent(id)}`), {
        method: "DELETE",
        credentials: "include",
        headers: {
            Accept: "application/json",
        },
    });
    await ensureOk(res, "Fehler beim Löschen des Regieberichts");
}
