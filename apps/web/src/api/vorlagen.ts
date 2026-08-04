import { apiUrl } from "../lib/apiBase";

export type VorlageCategory = {
  key: string;
  label: string;
  description: string;
  count: number;
};

export type VorlageTemplate = {
  id: string;
  slug: string;
  companyId?: string | null;
  sourceTemplateId?: string | null;
  title: string;
  description: string;
  categoryKey: string;
  categoryLabel: string;
  language: string;
  outputType: string;
  content: string;
  variables: string[];
  tags: string[];
  isStandard: boolean;
  isProtected: boolean;
  version: number;
  usageCount: number;
  favorite: boolean;
  updatedAt: string;
};

type CategoriesResponse = {
  ok: true;
  totalStandard: number;
  categories: VorlageCategory[];
};

type ListResponse = {
  ok: true;
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  templates: VorlageTemplate[];
};

type TemplateResponse = {
  ok: true;
  template: VorlageTemplate;
};

type CompileResponse = {
  ok: true;
  title: string;
  compiledContent: string;
  values: Record<string, string>;
};

function getAuthToken(): string | null {
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
    if (value?.trim()) return value.trim();
  }
  try {
    const auth = JSON.parse(localStorage.getItem("rlc_auth") || "null") as {
      token?: string;
      accessToken?: string;
    } | null;
    return auth?.token || auth?.accessToken || null;
  } catch {
    return null;
  }
}

function authHeaders(json = false): Record<string, string> {
  const token = getAuthToken();
  return {
    Accept: "application/json",
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      ...authHeaders(Boolean(init.body)),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error || `Vorlagen-API Fehler (${response.status})`);
  }
  return payload;
}

export function fetchVorlageCategories(): Promise<CategoriesResponse> {
  return request<CategoriesResponse>("/api/vorlagen/categories");
}

export function fetchVorlagen(filters: {
  search?: string;
  category?: string;
  favorites?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<ListResponse> {
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  if (filters.category) query.set("category", filters.category);
  if (filters.favorites) query.set("favorites", "true");
  query.set("page", String(filters.page || 1));
  query.set("pageSize", String(filters.pageSize || 48));
  return request<ListResponse>(`/api/vorlagen?${query.toString()}`);
}

export function toggleVorlageFavorite(id: string): Promise<{ ok: true; favorite: boolean }> {
  return request(`/api/vorlagen/${encodeURIComponent(id)}/favorite`, {
    method: "POST",
    body: "{}",
  });
}

export function copyVorlage(id: string): Promise<TemplateResponse> {
  return request(`/api/vorlagen/${encodeURIComponent(id)}/copy`, {
    method: "POST",
    body: "{}",
  });
}

export function updateVorlage(
  id: string,
  patch: Partial<Pick<VorlageTemplate, "title" | "description" | "content" | "variables" | "tags">>
): Promise<TemplateResponse> {
  return request(`/api/vorlagen/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export function compileVorlage(
  id: string,
  projectId?: string | null,
  values?: Record<string, string>
): Promise<CompileResponse> {
  return request(`/api/vorlagen/${encodeURIComponent(id)}/compile`, {
    method: "POST",
    body: JSON.stringify({ projectId, values }),
  });
}

export function saveVorlageDocument(input: {
  templateId: string;
  projectId?: string | null;
  title: string;
  content: string;
  values?: Record<string, string>;
}): Promise<{ ok: true; document: { id: string } }> {
  return request("/api/vorlagen/documents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

function downloadName(response: Response, fallback: string): string {
  const disposition = response.headers.get("content-disposition") || "";
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8);
    } catch {
      return fallback;
    }
  }
  return disposition.match(/filename="([^"]+)"/i)?.[1] || fallback;
}

export async function exportVorlage(
  id: string,
  input: {
    format: "pdf" | "docx" | "xlsx";
    projectId?: string | null;
    title: string;
    content: string;
    values?: Record<string, string>;
  }
): Promise<void> {
  const response = await fetch(apiUrl(`/api/vorlagen/${encodeURIComponent(id)}/export`), {
    method: "POST",
    credentials: "include",
    headers: authHeaders(true),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
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
