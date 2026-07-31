// apps/web/src/lib/types.ts
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
  posNr: string;
  kurztext: string;
  einheit: string;      // ME
  ep: number;           // Einheitspreis
  variablen: MengeVariablen;
  formel: string;       // z.B. "=L*B" oder "3.2*L + 5"
  menge: number;        // berechnet
  betrag: number;       // menge * ep
  bemerkung?: string;
};

export type AufmassDokument = {
  projektId: string;
  titel: string;
  zeilen: AufmassZeile[];
  nettoSumme: number;
  stand: string; // ISO Datum/Uhrzeit
};
