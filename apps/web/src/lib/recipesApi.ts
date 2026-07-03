import { API_BASE } from "./apiBase";
// apps/web/src/lib/recipesApi.ts

function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

function withQuery(
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>
) {
  if (!params) return path;

  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    qs.set(key, String(value));
  }

  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const isFormData =
      typeof FormData !== "undefined" && init.body instanceof FormData;

    const res = await fetch(apiUrl(path), {
      credentials: "include",
      signal: controller.signal,
      ...init,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
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

      const msg =
        (obj?.error as string) ||
        (obj?.message as string) ||
        text ||
        `HTTP ${res.status} ${res.statusText}`;

      throw new Error(msg);
    }

    const obj =
      typeof data === "object" && data !== null
        ? (data as Record<string, unknown>)
        : null;

    if (obj?.ok === false) {
      throw new Error(
        (obj?.error as string) ||
          (obj?.message as string) ||
          "Backend Fehler"
      );
    }

    return data as T;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("Timeout API");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/* =========================================================
   TYPES
   ========================================================= */

export type JsonMap = Record<string, unknown>;

export type RecipeTemplate = {
  id: string;
  key: string;
  title: string;
  category?: string | null;
  unit?: string | null;
  description?: string | null;
  defaultParams?: JsonMap | null;
  tags?: string[] | null;
};

export type RecipeVariantDetail = {
  key?: string;
  label?: string;
  value?: unknown;
  unit?: string;
};

export type RecipeVariant = {
  id?: string;
  key: string;
  unit?: string | null;
  enabled?: boolean;
  params?: JsonMap;
  label?: string;
  family?: string;
  scoreHint?: number;
  score?: number;
  details?: RecipeVariantDetail[];
  changedKeys?: string[];
  isDefault?: boolean;
  virtual?: boolean;
};

export type TemplatesResp = {
  ok: true;
  templates: RecipeTemplate[];
};

export type TemplateResp = {
  ok: true;
  template: RecipeTemplate;
};

export type VariantsResp = {
  ok: true;
  template: RecipeTemplate;
  variants: RecipeVariant[];
};

export type PricingControls = {
  companyId?: string;
  pricingDate?: string;
  validFrom?: string;
};

export type SuggestReq = PricingControls & {
  context: JsonMap;
  take?: number;
};

export type SuggestResp = {
  ok?: boolean;
  best?: RecipeVariant & { score?: number };
  alternatives?: Array<RecipeVariant & { score?: number }>;
};

export type CalcReq = PricingControls & {
  templateKey: string;
  qty: number;
  params?: JsonMap;
};

export type CalcResp = {
  ok?: boolean;
  result?: unknown;
  recipe?: RecipeVariant;
  price?: number;
  total?: number;
  [key: string]: unknown;
};

export type CalcSuggestReq = PricingControls & {
  templateKey: string;
  qty: number;
  context: JsonMap;
  take?: number;
};

export type CalcSuggestResp = {
  ok?: boolean;
  best?: RecipeVariant & { score?: number };
  alternatives?: Array<RecipeVariant & { score?: number }>;
  calculation?: CalcResp;
  [key: string]: unknown;
};

/* =========================================================
   API
   ========================================================= */

export function fetchTemplates(take = 50) {
  return http<TemplatesResp>(
    withQuery("/api/kalkulation/recipes/templates", { take })
  );
}

export function fetchTemplate(templateKey: string) {
  return http<TemplateResp>(
    `/api/kalkulation/recipes/templates/${encodeURIComponent(templateKey)}`
  );
}

export function fetchVariants(templateKey: string) {
  return http<VariantsResp>(
    `/api/kalkulation/recipes/templates/${encodeURIComponent(templateKey)}/variants`
  );
}

export function suggestTemplate(templateKey: string, req: SuggestReq) {
  return http<SuggestResp>(
    `/api/kalkulation/recipes/templates/${encodeURIComponent(templateKey)}/suggest`,
    {
      method: "POST",
      body: JSON.stringify(req),
    }
  );
}

export function calcTemplate(req: CalcReq) {
  return http<CalcResp>("/api/kalkulation/recipes/calc", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function calcSuggestTemplate(req: CalcSuggestReq) {
  return http<CalcSuggestResp>("/api/kalkulation/recipes/calc-suggest", {
    method: "POST",
    body: JSON.stringify(req),
  });
}











