// src/lib/slugifyLocal.ts
export function slugifyLocal(code: string, name?: string): string {
  const base = (code || name || "").toString().trim();

  if (!base) return "projekt";

  return base
    .toLowerCase()
    .normalize("NFD") // rimuove accenti
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
