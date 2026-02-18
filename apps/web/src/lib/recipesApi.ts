// apps/web/src/lib/recipesApi.ts

const API_BASE =
  (import.meta as any)?.env?.VITE_API_URL ||
  (import.meta as any)?.env?.VITE_BACKEND_URL ||
  "http://localhost:4000";

function joinUrl(base: string, path: string) {
  return `${String(base).replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const url = joinUrl(API_BASE, path);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data as T;
}

/** ===== Types (minimal, tolerant) ===== */
export type RecipeTemplate = {
  id: string;
  key: string;
  title: string;
  category?: string | null;
  unit?: string | null;
  description?: string | null;
  defaultParams?: Record<string, any> | null;
  tags?: any[] | null;
};

export type RecipeVariant = {
  id?: string;
  key: string;
  unit?: string | null;
  enabled?: boolean;
  params?: Record<string, any>;
  label?: string;
  family?: string;
  scoreHint?: number;
  score?: number;
  details?: any[];
  changedKeys?: string[];
  isDefault?: boolean;
  virtual?: boolean;
};

export type TemplatesResp = { ok: true; templates: RecipeTemplate[] };
export type TemplateResp = { ok: true; template: RecipeTemplate };
export type VariantsResp = { ok: true; template: RecipeTemplate; variants: RecipeVariant[] };

export type SuggestReq = {
  context: Record<string, any>;
  take?: number;

  /**
   * Optional pricing controls (non-breaking):
   * - companyId: forza la company per lookup prezzi
   * - pricingDate / validFrom: data per determinare "validFrom<=date<validTo"
   */
  companyId?: string;
  pricingDate?: string; // ISO string
  validFrom?: string; // alias ISO string
};

export type SuggestResp = {
  ok?: boolean;
  best?: RecipeVariant & { score?: number };
  alternatives?: (RecipeVariant & { score?: number })[];
};

export type CalcReq = {
  templateKey: string;
  qty: number;
  params?: Record<string, any>;

  /**
   * Optional pricing controls (non-breaking):
   * - companyId: forza la company per lookup prezzi
   * - pricingDate / validFrom: data per determinare "validFrom<=date<validTo"
   */
  companyId?: string;
  pricingDate?: string; // ISO string
  validFrom?: string; // alias ISO string
};

export type CalcResp = any;

export type CalcSuggestReq = {
  templateKey: string;
  qty: number;
  context: Record<string, any>;
  take?: number;

  /**
   * Optional pricing controls (non-breaking):
   * - companyId: forza la company per lookup prezzi
   * - pricingDate / validFrom: data per determinare "validFrom<=date<validTo"
   */
  companyId?: string;
  pricingDate?: string; // ISO string
  validFrom?: string; // alias ISO string
};

export type CalcSuggestResp = any;

/** ===== API ===== */
export function fetchTemplates(take = 50) {
  return http<TemplatesResp>(`/api/kalkulation/recipes/templates?take=${take}`);
}

export function fetchTemplate(templateKey: string) {
  return http<TemplateResp>(`/api/kalkulation/recipes/templates/${encodeURIComponent(templateKey)}`);
}

export function fetchVariants(templateKey: string) {
  return http<VariantsResp>(`/api/kalkulation/recipes/templates/${encodeURIComponent(templateKey)}/variants`);
}

export function suggestTemplate(templateKey: string, req: SuggestReq) {
  return http<SuggestResp>(`/api/kalkulation/recipes/templates/${encodeURIComponent(templateKey)}/suggest`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function calcTemplate(req: CalcReq) {
  return http<CalcResp>(`/api/kalkulation/recipes/calc`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function calcSuggestTemplate(req: CalcSuggestReq) {
  return http<CalcSuggestResp>(`/api/kalkulation/recipes/calc-suggest`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}
