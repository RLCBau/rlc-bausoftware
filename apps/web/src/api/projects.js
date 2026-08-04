// apps/web/src/api/projects.ts
import { apiUrl } from "../lib/apiBase";
function safeTrim(v) {
    return String(v ?? "").trim();
}
function readJsonSafe(raw, fallback) {
    if (!raw)
        return fallback;
    try {
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
function getAuthToken() {
    const directKeys = [
        "rlc_token",
        "token",
        "authToken",
        "accessToken",
        "rlc.auth.token",
        "rlc_mobile_token",
    ];
    for (const key of directKeys) {
        const v = localStorage.getItem(key);
        if (v && String(v).trim())
            return String(v).trim();
    }
    const authObj = readJsonSafe(localStorage.getItem("rlc_auth"), null);
    if (authObj?.token)
        return String(authObj.token);
    if (authObj?.accessToken)
        return String(authObj.accessToken);
    return null;
}
async function readJson(res) {
    return res.json().catch(() => null);
}
function getErrorMessage(data, fallback, res) {
    if (data?.error)
        return String(data.error);
    if (data?.message)
        return String(data.message);
    if (res && !res.ok)
        return `${fallback} (${res.status})`;
    return fallback;
}
async function requestJson(path, init, fallbackError) {
    const token = getAuthToken();
    const headers = {
        Accept: "application/json",
        ...(init.headers || {}),
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(apiUrl(path), {
        ...init,
        headers,
    });
    const data = (await readJson(res));
    if (!res.ok || !data) {
        throw new Error(getErrorMessage(data, fallbackError, res));
    }
    if (data.ok === false) {
        throw new Error(getErrorMessage(data, fallbackError, res));
    }
    return data;
}
// ==================== Projekte laden ====================
export async function fetchProjects() {
    return requestJson("/api/projects", {
        method: "GET",
    }, "Fehler beim Laden der Projekte");
}
// ==================== project.json importieren ====================
// POST /api/import/project-json
export async function importProjectJson(formData) {
    return requestJson("/api/import/project-json", {
        method: "POST",
        body: formData,
    }, "Fehler beim Import (project.json)");
}
// ==================== ZIP-Projekt importieren ====================
export async function importProjectZip(formData) {
    return requestJson("/api/import/project-zip", {
        method: "POST",
        body: formData,
    }, "Fehler beim Import (ZIP)");
}
// ==================== Neues Projekt anlegen ====================
export async function createProject(payload) {
    return requestJson("/api/projects", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            code: safeTrim(payload.code),
            name: safeTrim(payload.name),
            client: safeTrim(payload.client),
            place: safeTrim(payload.place),
        }),
    }, "Fehler beim Erstellen des Projekts");
}
// ==================== Projekt löschen ====================
export async function deleteProject(projectId) {
    const id = safeTrim(projectId);
    if (!id) {
        throw new Error("Fehler beim Löschen des Projekts: ungültige Projekt-ID");
    }
    return requestJson(`/api/projects/${encodeURIComponent(id)}`, {
        method: "DELETE",
    }, "Fehler beim Löschen des Projekts");
}
// ==================== LV des Projekts laden ====================
// Wichtig: hier besser projectCode statt projectId verwenden,
// damit es zur Route /api/project-lv/:projectCode passt.
export async function fetchProjectLv(projectCode) {
    const code = safeTrim(projectCode);
    if (!code) {
        throw new Error("Fehler beim Laden des Projekt-LV: ungültiger Projektcode");
    }
    return requestJson(`/api/project-lv/${encodeURIComponent(code)}`, {
        method: "GET",
    }, "Fehler beim Laden des Projekt-LV");
}
