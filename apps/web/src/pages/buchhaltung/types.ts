export type Position = {
  id?: string;
  posNr: string;
  text: string;
  menge: number;
  ep: number;
  gesamt?: number;
  einheit?: string;
  note?: string;
};

export type RechnungTyp = "Rechnung" | "Abschlag" | "Schluss";
export type RechnungStatus = "Entwurf" | "Freigegeben" | "Gebucht" | "Bezahlt" | "Teilbezahlt";

export type Rechnung = {
  id: string;
  typ: RechnungTyp;
  nummer: string;
  datum: string;
  faellig?: string;
  kunde?: string;
  projekt?: string;
  projectId?: string;
  projectCode?: string;
  positionen: Position[];
  betragNetto: number;
  mwst: number; // in %
  betragBrutto: number;
  gezahlt?: number;
  status?: RechnungStatus;
  note?: string;
};

export type ZahlungsMethode =
  | "Überweisung"
  | "Bar"
  | "Karte"
  | "Scheck"
  | "Online"
  | "Sonstiges";

export type Zahlung = {
  id: string;
  datum: string;
  betrag: number;
  kunde?: string;
  referenz?: string;
  verwendungszweck?: string;
  methode?: ZahlungsMethode;
  rechnungId?: string;
  projekt?: string;
  projectId?: string;
  projectCode?: string;
  note?: string;
};

export type Lieferschein = {
  id: string;
  nummer: string;
  datum: string;
  kostenstelle: string;
  kosten: number;
  lieferant?: string;
  projekt?: string;
  projectId?: string;
  projectCode?: string;
  note?: string;
};

export type DocTyp =
  | "Rechnung"
  | "Regiebericht"
  | "Nachtrag"
  | "Abrechnung"
  | "Prüfbericht"
  | "Sonstiges";

export type DocStatus = "offen" | "in Prüfung" | "abgeschlossen";

export type Doc = {
  id: string;
  nummer?: string;
  name: string;
  title?: string;
  size: number;
  typ: DocTyp | string;
  status?: DocStatus;
  projekt?: string;
  projectId?: string;
  projectCode?: string;
  kostenstelle?: string;
  bearbeiter?: string;
  version?: number;
  note?: string;
  added: string;
  url?: string;
};

export type KassenbuchMethode = "Kasse" | "Bank" | "Karte" | "Online";

export type KassenbuchEintrag = {
  id: string;
  datum: string;
  beleg?: string;
  text: string;
  kategorie?: string;
  kostenstelle?: string;
  methode?: KassenbuchMethode;
  einnahme: number;
  ausgabe: number;
  mwstPct?: number;
  konto?: string;
  gegenkonto?: string;
  projectId?: string;
  projectCode?: string;
  note?: string;
};

export type KostenstellenNode = {
  id: string;
  name: string;
  code?: string;
  parent?: string | null;
  budget?: number;
  istKosten?: number;
  einheit?: string;
  bemerkung?: string;
  projekt?: string;
  projectId?: string;
  projectCode?: string;
};





