// apps/web/src/lib/types.ts

/* =========================================================
   MENGEN / AUFMASS BASIS-TYPEN
   ========================================================= */

export type MengeVariablen = {
  L?: number; // Länge
  B?: number; // Breite
  H?: number; // Höhe
  D?: number; // Durchmesser / Dicke
  T?: number; // Tiefe
  N?: number; // Anzahl
  [key: string]: number | undefined;
};

export type AufmassZeile = {
  id: string;

  // LV / Position
  posNr: string;
  kurztext: string;
  einheit: string; // ME / Einheit

  // Kalkulation
  ep: number; // Einheitspreis
  variablen: MengeVariablen;
  formel: string; // z. B. "=L*B" oder "3.2*L + 5"

  // Ergebnis
  menge: number;
  betrag: number; // menge * ep

  // Optional
  bemerkung?: string;
};

export type AufmassDokument = {
  // Projektbezug
  projektId: string;
  projektCode?: string;

  // Dokument
  titel: string;
  zeilen: AufmassZeile[];

  // Summen
  nettoSumme: number;

  // ISO-String, z. B. new Date().toISOString()
  stand: string;
};






