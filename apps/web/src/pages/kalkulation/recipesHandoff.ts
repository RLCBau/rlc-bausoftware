// apps/web/src/pages/kalkulation/recipesHandoff.ts

export const KI_HANDOFF_KEY = "rlc_kalkulation_ki_handoff_v1";

export type KiHandoffRow = {
  posNr: string;
  kurztext: string;
  einheit: string;
  menge: number;
  preis: number;
  confidence?: number;
};

export type KiHandoffPayload = {
  source: "rezepte";
  ts: number;

  // progetto
  projectId?: string;   // UUID DB se presente
  projectCode?: string; // FS key BA-...

  // contesto
  mwst?: number;
  pricingDate?: string; // ISO o "dd.mm.yyyy"

  // righe pronte per KI page
  rows: KiHandoffRow[];
};

export function saveKiHandoff(p: KiHandoffPayload) {
  localStorage.setItem(KI_HANDOFF_KEY, JSON.stringify(p));
}

export function loadKiHandoff(): KiHandoffPayload | null {
  try {
    const raw = localStorage.getItem(KI_HANDOFF_KEY);
    return raw ? (JSON.parse(raw) as KiHandoffPayload) : null;
  } catch {
    return null;
  }
}

export function clearKiHandoff() {
  localStorage.removeItem(KI_HANDOFF_KEY);
}
