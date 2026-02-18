const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:4000";

export async function fetchTemplates(take = 200, q = "") {
  const url = new URL(`${API}/api/kalkulation/recipes/templates`);
  url.searchParams.set("take", String(take));
  if (q) url.searchParams.set("q", q);
  const r = await fetch(url.toString());
  return r.json();
}

export async function fetchVariants(templateKey: string) {
  const r = await fetch(`${API}/api/kalkulation/recipes/templates/${encodeURIComponent(templateKey)}/variants`);
  return r.json();
}

export async function calc(templateKey: string, qty: number, params?: any, variantId?: string, variantKey?: string) {
  const r = await fetch(`${API}/api/kalkulation/recipes/calc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateKey, qty, params: params || {}, variantId, variantKey }),
  });
  return r.json();
}

export async function calcSuggest(templateKey: string, qty: number, context: any, take = 5) {
  const r = await fetch(`${API}/api/kalkulation/recipes/calc-suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateKey, qty, context, take }),
  });
  return r.json();
}
