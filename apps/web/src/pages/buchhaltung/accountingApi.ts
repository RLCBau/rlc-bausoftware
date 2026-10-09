
const API_BASE = String(
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "https://api.rlcbausoftware.com"
).replace(/\/$/, "");

const PROJECT_STORAGE_KEY = "rlc_accounting_project";

export function getAccountingProject() {
  const explicit =
    sessionStorage.getItem(PROJECT_STORAGE_KEY) ||
    localStorage.getItem(PROJECT_STORAGE_KEY);

  if (explicit) return explicit;

  const candidates = [
    sessionStorage.getItem("rlc_project_key"),
    sessionStorage.getItem("projectKey"),
    sessionStorage.getItem("projectId"),
    localStorage.getItem("rlc_project_key"),
    localStorage.getItem("projectKey"),
    localStorage.getItem("projectId")
  ];

  return (
    candidates.find(v => v && v.startsWith("BA-")) ||
    "BA-2026-028"
  );
}

export function setAccountingProject(value: string) {
  sessionStorage.setItem(PROJECT_STORAGE_KEY, value);
  localStorage.setItem(PROJECT_STORAGE_KEY, value);
}

export function authToken() {
  const keys = [
    "rlc_token",
    "token",
    "authToken",
    "accessToken",
    "rlc_auth_token"
  ];

  for (const storage of [localStorage, sessionStorage]) {
    for (const key of keys) {
      const value = storage.getItem(key);

      if (value && value.trim()) {
        return value.trim();
      }
    }
  }

  return "";
}

export async function accountingApi(
  path: string,
  init: RequestInit = {}
) {
  const url = new URL(
    `${API_BASE}${path}`,
    window.location.origin
  );

  if (
    path !== "/api/accounting/projects" &&
    !url.searchParams.has("projectId")
  ) {
    url.searchParams.set(
      "projectId",
      getAccountingProject()
    );
  }

  const headers = new Headers(init.headers || {});
  const token = authToken();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url.toString(), {
    ...init,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.ok === false) {
    throw new Error(
      data?.error ||
      `${response.status} ${response.statusText}`
    );
  }

  return data;
}

export function euro(value: any) {
  return Number(value || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function dateDe(value: any) {
  if (!value) return "—";

  const d = new Date(value);

  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString("de-DE");
}
