// apps/web/src/lib/pricing.ts
export type PriceRow = {
  id: string;
  artikelNr: string;
  bezeichnung: string;
  einheit: string;
  ep: number;   // Einzelpreis
  gruppe?: string; // Material/Arbeit/Maschine
};

const KEY = "rlc.kalkulation.preise";

export function loadPreise(): PriceRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return demo();
    return JSON.parse(raw) as PriceRow[];
  } catch {
    return demo();
  }
}
export function savePreise(rows: PriceRow[]) {
  try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch {}
}

function demo(): PriceRow[] {
  return [
    { id: "mat-001", artikelNr: "M-1001", bezeichnung: "Speedpipe 12 mm", einheit: "m", ep: 2.10, gruppe: "Material" },
    { id: "arb-001", artikelNr: "A-2001", bezeichnung: "Kolonne Tiefbau (2 Pers.)", einheit: "h", ep: 78.00, gruppe: "Arbeit" },
    { id: "mas-001", artikelNr: "MS-3001", bezeichnung: "Minibagger 1.8 t", einheit: "h", ep: 42.50, gruppe: "Maschine" },
    { id: "asp-001", artikelNr: "M-9010", bezeichnung: "Asphalt AC 11 D", einheit: "t", ep: 99.00, gruppe: "Material" }
  ];
}
