// Aufmaß-Vorlagen (pronte da inserire nell'Editor)
export type Vorlage = {
  name: string;
  beschreibung: string;
  formel: string;
  einheit: "m" | "m²" | "m³" | "Stk";
  beispiel?: string;
  defaults?: Record<string, number | string>;
};

export const AUFMASS_VORLAGEN: Vorlage[] = [
  {
    name: "Rechteckfläche",
    beschreibung: "Fläche = L * B * ANZAHL",
    formel: "L*B*ANZAHL",
    einheit: "m²",
    beispiel: "L=5, B=3, ANZAHL=2 → 30 m²",
    defaults: { L: 1, B: 1, ANZAHL: 1 }
  },
  {
    name: "Rechteckvolumen",
    beschreibung: "Volumen = L * B * H * ANZAHL",
    formel: "L*B*H*ANZAHL",
    einheit: "m³",
    beispiel: "L=2, B=1.5, H=0.2 → 0.6 m³",
    defaults: { L: 1, B: 1, H: 1, ANZAHL: 1 }
  },
  {
    name: "Kreisfläche (Radius)",
    beschreibung: "Fläche = PI * R^2 * ANZAHL",
    formel: "PI*R*R*ANZAHL",
    einheit: "m²",
    beispiel: "R=0.5 → 0.785 m²",
    defaults: { R: 0.5, ANZAHL: 1 }
  },
  {
    name: "Kreisfläche (Durchmesser)",
    beschreibung: "Fläche = PI * (DM/2)^2 * ANZAHL",
    formel: "PI*(DM/2)*(DM/2)*ANZAHL",
    einheit: "m²",
    beispiel: "DM=1 → 0.785 m²",
    defaults: { DM: 1, ANZAHL: 1 }
  },
  {
    name: "Zylinder-Volumen",
    beschreibung: "Volumen = PI * R^2 * H * ANZAHL",
    formel: "PI*R*R*H*ANZAHL",
    einheit: "m³",
    beispiel: "R=0.3, H=2 → 0.565 m³",
    defaults: { R: 0.3, H: 1, ANZAHL: 1 }
  },
  {
    name: "Stückzählung",
    beschreibung: "Menge = ANZAHL",
    formel: "ANZAHL",
    einheit: "Stk",
    beispiel: "ANZAHL=12 → 12 Stk",
    defaults: { ANZAHL: 1 }
  }
];
