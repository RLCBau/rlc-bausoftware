import { API_BASE } from "./apiBase";
// apps/web/src/lib/apiKalk.ts

function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

type JsonMap = Record<string, unknown>;

export type KalkTemplate = {
  id: string;
  key: string;
  title: string;
  category?: string | null;
  unit?: string | null;
  description?: string | null;
  defaultParams?: JsonMap | null;
  tags?: string[] | null;
};

export type KalkVariant = {
  id?: string;
  key: string;
  unit?: string | null;
  enabled?: boolean;
  params?: JsonMap;
  label?: string;
  family?: string;
  scoreHint?: number;
  score?: number;
  details?: unknown[];
  changedKeys?: string[];
  isDefault?: boolean;
  virtual?: boolean;
};

export type FetchTemplatesResp = {
  ok?: boolean;
  templates: KalkTemplate[];
};

export type FetchVariantsResp = {
  ok?: boolean;
  template?: KalkTemplate;
  variants: KalkVariant[];
};

export type CalcResp = {
  ok?: boolean;
  result?: unknown;
  recipe?: KalkVariant;
  price?: number;
  total?: number;
  [key: string]: unknown;
};

export type CalcSuggestResp = {
  ok?: boolean;
  best?: KalkVariant & { score?: number };
  alternatives?: Array<KalkVariant & { score?: number }>;
  calculation?: CalcResp;
  [key: string]: unknown;
};

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await res.text();

  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const obj =
      typeof data === "object" && data !== null
        ? (data as Record<string, unknown>)
        : null;

    throw new Error(
      (obj?.error as string) ||
        (obj?.message as string) ||
        text ||
        `HTTP ${res.status} ${res.statusText}`
    );
  }

  const obj =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : null;

  if (obj?.ok === false) {
    throw new Error(
      (obj?.error as string) || (obj?.message as string) || "Backend Fehler"
    );
  }

  return data as T;
}

export async function fetchTemplates(
  take = 200,
  q = ""
): Promise<FetchTemplatesResp> {
  const url = new URL(apiUrl("/api/kalkulation/recipes/templates"), window.location.origin);
  url.searchParams.set("take", String(take));
  if (q.trim()) url.searchParams.set("q", q.trim());

  return http<FetchTemplatesResp>(`${url.pathname}${url.search}`);
}

export async function fetchVariants(
  templateKey: string
): Promise<FetchVariantsResp> {
  return http<FetchVariantsResp>(
    `/api/kalkulation/recipes/templates/${encodeURIComponent(templateKey)}/variants`
  );
}

export async function calc(
  templateKey: string,
  qty: number,
  params: JsonMap = {},
  variantId?: string,
  variantKey?: string
): Promise<CalcResp> {
  return http<CalcResp>(`/api/kalkulation/recipes/calc`, {
    method: "POST",
    body: JSON.stringify({
      templateKey,
      qty,
      params,
      variantId,
      variantKey,
    }),
  });
}

export async function calcSuggest(
  templateKey: string,
  qty: number,
  context: JsonMap,
  take = 5
): Promise<CalcSuggestResp> {
  return http<CalcSuggestResp>(`/api/kalkulation/recipes/calc-suggest`, {
    method: "POST",
    body: JSON.stringify({
      templateKey,
      qty,
      context,
      take,
    }),
  });
}











