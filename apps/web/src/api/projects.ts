// apps/web/src/api/projects.ts
import { apiUrl } from "../lib/apiBase";

export type ProjectPayload = {
  code: string;
  name: string;
  client?: string;
  place?: string;
};

export type ProjectSummary = {
  id: string;
  code: string;
  name: string;
  client?: string;
  place?: string;
};

type ApiOk<T = unknown> = {
  ok: true;
  project?: T;
  projects?: T[];
  items?: unknown[];
  message?: string;
  [key: string]: unknown;
};

type ApiErr = {
  ok: false;
  error?: string;
  message?: string;
  [key: string]: unknown;
};

type ApiResponse<T = unknown> = ApiOk<T> | ApiErr | null;

function safeTrim(v: unknown) {
  return String(v ?? "").trim();
}

function readJsonSafe<T = unknown>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getAuthToken(): string | null {
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
    if (v && String(v).trim()) return String(v).trim();
  }

  const authObj = readJsonSafe<any>(localStorage.getItem("rlc_auth"), null);
  if (authObj?.token) return String(authObj.token);
  if (authObj?.accessToken) return String(authObj.accessToken);

  return null;
}

async function readJson(res: Response) {
  return res.json().catch(() => null);
}

function getErrorMessage(
  data: ApiErr | null,
  fallback: string,
  res?: Response
): string {
  if (data?.error) return String(data.error);
  if (data?.message) return String(data.message);
  if (res && !res.ok) return `${fallback} (${res.status})`;
  return fallback;
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  fallbackError: string
): Promise<ApiOk<T>> {
  const token = getAuthToken();

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...((init.headers as Record<string, string> | undefined) || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(apiUrl(path), {
    ...init,
    headers,
  });

  const data = (await readJson(res)) as ApiResponse<T>;

  if (!res.ok || !data) {
    throw new Error(getErrorMessage(data as ApiErr | null, fallbackError, res));
  }

  if (data.ok === false) {
    throw new Error(getErrorMessage(data, fallbackError, res));
  }

  return data;
}

// ==================== Projekte laden ====================
export async function fetchProjects(): Promise<ApiOk<ProjectSummary>> {
  return requestJson<ProjectSummary>(
    "/api/projects",
    {
      method: "GET",
    },
    "Fehler beim Laden der Projekte"
  );
}

// ==================== project.json importieren ====================
// POST /api/import/project-json
export async function importProjectJson(
  formData: FormData
): Promise<ApiOk<ProjectSummary>> {
  return requestJson<ProjectSummary>(
    "/api/import/project-json",
    {
      method: "POST",
      body: formData,
    },
    "Fehler beim Import (project.json)"
  );
}

// ==================== ZIP-Projekt importieren ====================
export async function importProjectZip(
  formData: FormData
): Promise<ApiOk<ProjectSummary>> {
  return requestJson<ProjectSummary>(
    "/api/import/project-zip",
    {
      method: "POST",
      body: formData,
    },
    "Fehler beim Import (ZIP)"
  );
}

// ==================== Neues Projekt anlegen ====================
export async function createProject(
  payload: ProjectPayload
): Promise<ApiOk<ProjectSummary>> {
  return requestJson<ProjectSummary>(
    "/api/projects",
    {
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
    },
    "Fehler beim Erstellen des Projekts"
  );
}

// ==================== Projekt löschen ====================
export async function deleteProject(projectId: string): Promise<ApiOk> {
  const id = safeTrim(projectId);
  if (!id) {
    throw new Error("Fehler beim Löschen des Projekts: ungültige Projekt-ID");
  }

  return requestJson(
    `/api/projects/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
    "Fehler beim Löschen des Projekts"
  );
}

// ==================== LV des Projekts laden ====================
// Wichtig: hier besser projectCode statt projectId verwenden,
// damit es zur Route /api/project-lv/:projectCode passt.
export async function fetchProjectLv(projectCode: string): Promise<ApiOk> {
  const code = safeTrim(projectCode);
  if (!code) {
    throw new Error("Fehler beim Laden des Projekt-LV: ungültiger Projektcode");
  }

  return requestJson(
    `/api/project-lv/${encodeURIComponent(code)}`,
    {
      method: "GET",
    },
    "Fehler beim Laden des Projekt-LV"
  );
}