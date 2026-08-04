import { apiUrl } from "../lib/apiBase";
function getToken() {
    try {
        const directKeys = [
            "rlc_token",
            "token",
            "authToken",
            "accessToken",
            "rlc.auth.token",
            "rlc_mobile_token",
        ];
        for (const key of directKeys) {
            const value = localStorage.getItem(key);
            if (value?.trim())
                return value.trim();
        }
        const auth = JSON.parse(localStorage.getItem("rlc_auth") || "{}");
        return String(auth?.token || auth?.accessToken || "").trim();
    }
    catch {
        return "";
    }
}
function headers(json = false) {
    const token = getToken();
    return {
        Accept: "application/json",
        ...(json ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}
async function readResponse(response) {
    const text = await response.text();
    let payload = null;
    try {
        payload = text ? JSON.parse(text) : null;
    }
    catch {
        payload = null;
    }
    if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || payload?.message || text || `HTTP ${response.status}`));
    }
    return payload || { ok: true };
}
function positionOf(item) {
    return String(item.pos ?? item.position ?? item.posNr ?? "").trim();
}
function canonicalPayload(payload) {
    return {
        pos: positionOf(payload),
        text: String(payload.text ?? payload.kurztext ?? "").trim(),
        langtext: String(payload.langtext ?? ""),
        unit: String(payload.unit ?? payload.einheit ?? "").trim(),
        quantity: payload.quantity ?? payload.menge ?? null,
        ep: payload.ep ?? payload.einzelpreis ?? payload.preis ?? null,
    };
}
export async function loadProjectLv(projectId) {
    const key = String(projectId || "").trim();
    if (!key)
        throw new Error("Projekt-ID fehlt");
    const response = await fetch(apiUrl(`/api/project-lv/${encodeURIComponent(key)}`), {
        method: "GET",
        credentials: "include",
        headers: headers(),
    });
    const payload = await readResponse(response);
    const items = Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.rows)
            ? payload.rows
            : [];
    return { ok: true, projectId: key, items, rows: items, source: payload?.source };
}
/** Crea o aggiorna una posizione tramite le route effettivamente montate dal server. */
export async function saveProjectLvPosition(projectId, payload) {
    const key = String(projectId || "").trim();
    const wantedPosition = positionOf(payload);
    const body = canonicalPayload(payload);
    if (!key)
        throw new Error("Projekt-ID fehlt");
    if (!wantedPosition)
        throw new Error("Position fehlt");
    if (!String(body.text || "").trim())
        throw new Error("Kurztext fehlt");
    if (!String(body.unit || "").trim())
        throw new Error("Einheit fehlt");
    const current = await loadProjectLv(key);
    const existing = current.items.find((item) => positionOf(item).toLocaleLowerCase() === wantedPosition.toLocaleLowerCase());
    const canUpdate = Boolean(existing?.id);
    const path = canUpdate
        ? `/api/project-lv/${encodeURIComponent(key)}/position/${encodeURIComponent(String(existing?.id))}`
        : `/api/project-lv/${encodeURIComponent(key)}/position`;
    const response = await fetch(apiUrl(path), {
        method: canUpdate ? "PATCH" : "POST",
        credentials: "include",
        headers: headers(true),
        body: JSON.stringify(body),
    });
    const result = await readResponse(response);
    return { ok: true, updated: canUpdate, item: result?.item };
}
