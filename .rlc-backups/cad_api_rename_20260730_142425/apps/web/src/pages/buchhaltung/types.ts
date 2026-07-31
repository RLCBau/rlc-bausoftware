export type Position = { posNr: string; text: string; menge: number; ep: number; gesamt?: number };

export type Rechnung = {
  id: string;
  typ: "Abschlag" | "Schluss";
  nummer: string;
  datum: string;
  projekt?: string;
  positionen: Position[];
  betragNetto: number;
  mwst: number;            // in %
  betragBrutto: number;
};

export type Zahlung = { id: string; datum: string; betrag: number; referenz?: string; methode?: string };

export type Lieferschein = {
  id: string; nummer: string; datum: string; kostenstelle: string; kosten: number; lieferant?: string;
};

export type Doc = { id:string; name:string; size:number; typ:string; note?:string; added:string };

export type KassenbuchEintrag = { id:string; datum:string; text:string; einnahme:number; ausgabe:number; konto?:string };

export type KostenstellenNode = { id:string; name:string; parent?:string|null };
