import { apiUrl } from "../lib/apiBase";

export type ProjectLvItem = {
  id?: string;
  pos?: string;
  position?: string;
  posNr?: string;
  text?: string;
  kurztext?: string;
  langtext?: string;
  unit?: string;
  einheit?: string;
  quantity?: number | null;
  menge?: number | null;
  ep?: number | null;
  einzelpreis?: number | null;
  preis?: number | null;
  [key: string]: unknown;
};

export type ProjectLvPayload = {
  pos?: string;
  position?: string;
  posNr?: string;
  text?: string;
  kurztext?: string;
  langtext?: string;
  unit?: string;
  einheit?: string;
  quantity?: number | null;
  menge?: number | null;
  ep?: number | null;
  einzelpreis?: number | null;
  preis?: number | null;
  [key: string]: unknown;
};

function getToken(): string {
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
      if (value?.trim()) return value.trim();
    }

    const auth = JSON.parse(localStorage.getItem("rlc_auth") || "{}");
    return String(auth?.token || auth?.accessToken || "").trim();
  } catch {
    return "";
  }
}

function headers(json = false): Record<string, string> {
  const token = getToken();

  return {
    Accept: "application/json",
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function readResponse(response: Response): Promise<any> {
  const text = await response.text();
  let payload: any = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.ok === false) {
    throw new Error(
      String(payload?.error || payload?.message || text || `HTTP ${response.status}`),
    );
  }

  return payload || { ok: true };
}

function positionOf(item: ProjectLvItem | ProjectLvPayload): string {
  return String(item.pos ?? item.position ?? item.posNr ?? "").trim();
}

function canonicalPayload(payload: ProjectLvPayload): Record<string, unknown> {
  return {
    pos: positionOf(payload),
    text: String(payload.text ?? payload.kurztext ?? "").trim(),
    langtext: String(payload.langtext ?? ""),
    unit: String(payload.unit ?? payload.einheit ?? "").trim(),
    quantity: payload.quantity ?? payload.menge ?? null,
    ep: payload.ep ?? payload.einzelpreis ?? payload.preis ?? null,
  };
}

export async function loadProjectLv(projectId: string): Promise<{
  ok: boolean;
  projectId: string;
  items: ProjectLvItem[];
  rows: ProjectLvItem[];
  source?: string;
}> {
  const key = String(projectId || "").trim();
  if (!key) throw new Error("Projekt-ID fehlt");

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
export async function saveProjectLvPosition(
  projectId: string,
  payload: ProjectLvPayload,
): Promise<{ ok: true; updated: boolean; item?: ProjectLvItem }> {
  const key = String(projectId || "").trim();
  const wantedPosition = positionOf(payload);
  const body = canonicalPayload(payload);

  if (!key) throw new Error("Projekt-ID fehlt");
  if (!wantedPosition) throw new Error("Position fehlt");
  if (!String(body.text || "").trim()) throw new Error("Kurztext fehlt");
  if (!String(body.unit || "").trim()) throw new Error("Einheit fehlt");

  const current = await loadProjectLv(key);
  const existing = current.items.find(
    (item) => positionOf(item).toLocaleLowerCase() === wantedPosition.toLocaleLowerCase(),
  );
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
