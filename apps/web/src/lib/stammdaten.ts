// apps/web/src/lib/stammdaten.ts

/* =========================================================
   CONFIG
   ========================================================= */

const KEY = "rlc.mengenermittlung.stammdaten";

/* =========================================================
   TYPES
   ========================================================= */

type Regel = {
  einheit: string;
  standardFormel: string;
};

/* =========================================================
   NORMALIZE EINHEIT
   ========================================================= */

function normalizeEinheit(e: string): string {
  return e
    .toLowerCase()
    .replace(/\s/g, "")
    .replace("m²", "m2")
    .replace("m³", "m3");
}

/* =========================================================
   DEFAULT FORMELN (FONDAMENTALE)
   ========================================================= */

const DEFAULT_FORMELN: Record<string, string> = {
  m: "=L",
  m2: "=L*B",
  m3: "=L*B*H",
  st: "=N",
  stk: "=N",
  pauschal: "=1",
};

/* =========================================================
   LOAD REGOLE CUSTOM
   ========================================================= */

function loadRegeln(): Regel[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed;
  } catch {
    return [];
  }
}

/* =========================================================
   MAIN FUNCTION
   ========================================================= */

export function getStandardFormel(einheit: string): string {
  if (!einheit) return "=N";

  const norm = normalizeEinheit(einheit);

  // 1. custom rules (utente)
  const regeln = loadRegeln();
  const match = regeln.find(
    (r) => normalizeEinheit(r.einheit) === norm
  );

  if (match?.standardFormel) return match.standardFormel;

  // 2. default rules (sistema)
  if (DEFAULT_FORMELN[norm]) return DEFAULT_FORMELN[norm];

  // 3. fallback intelligente
  if (norm.includes("m3")) return "=L*B*H";
  if (norm.includes("m2")) return "=L*B";
  if (norm.includes("m")) return "=L";

  return "=N";
}






