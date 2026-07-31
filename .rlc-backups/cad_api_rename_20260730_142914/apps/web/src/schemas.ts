import { Col } from "./ui/DataSheet";

export const SHEETS: Record<string, { title: string; columns: Col<any>[]; sum?: string[] }> = {
  // --- 1. Kalkulation (estratto) ---
  "kalkulation/projekte": {
    title: "Projekte",
    columns: [
      { key: "code", header: "Code", width: 120, editable: true, type: "text" },
      { key: "name", header: "Name", width: 300, editable: true, type: "text" },
      { key: "kunde", header: "Kunde", width: 240, editable: true, type: "text" },
      { key: "ansprechpartner", header: "Ansprechpartner", width: 220, editable: true, type: "text" },
      { key: "notiz", header: "Notiz", width: 320, editable: true, type: "text" },
    ],
  },
  "kalkulation/lv-upload": {
    title: "LV Upload / Erstellung",
    columns: [
      { key: "positionNumber", header: "Pos.", width: 100 },
      { key: "shortText", header: "Kurztext", width: 360 },
      { key: "unit", header: "ME", width: 70 },
      { key: "unitPrice", header: "EP", width: 120, align: "right", type: "number", editable: true },
      { key: "quantity", header: "Menge", width: 120, align: "right", type: "number", editable: true },
      { key: "total", header: "Betrag", width: 140, align: "right", type: "number" },
    ],
    sum: ["total"],
  },

  // --- 2. Mengenermittlung ---
  "mengenermittlung/per-position": {
    title: "Mengenermittlung je Position",
    columns: [
      { key: "pos", header: "Pos.", width: 100, editable: true, type: "text" },
      { key: "bezeichnung", header: "Bezeichnung", width: 420, editable: true, type: "text" },
      { key: "einheit", header: "ME", width: 80, editable: true, type: "text" },
      { key: "soll", header: "Soll", width: 120, align: "right", type: "number", editable: true },
      { key: "ist", header: "Ist", width: 120, align: "right", type: "number", editable: true },
      { key: "diff", header: "Diff", width: 120, align: "right", type: "number" },
    ],
    sum: ["soll", "ist", "diff"],
  },
  "mengenermittlung/manuell-foto-sprache": {
    title: "Manuell / Foto / Sprache",
    columns: [
      { key: "datum", header: "Datum", width: 140, editable: true, type: "text" },
      { key: "typ", header: "Typ", width: 160, editable: true, type: "text" },
      { key: "beschreibung", header: "Beschreibung", width: 420, editable: true, type: "text" },
      { key: "menge", header: "Menge", width: 120, align: "right", type: "number", editable: true },
    ],
    sum: ["menge"],
  },
  "mengenermittlung/import-pdf-cad-landxml": {
    title: "Import: PDF / CAD / LandXML / GSI / CSV",
    columns: [
      { key: "file", header: "Datei", width: 340, editable: true, type: "text" },
      { key: "format", header: "Format", width: 160, editable: true, type: "text" },
      { key: "zeilen", header: "Zeilen", width: 120, align: "right", type: "number" },
      { key: "ergebnis", header: "Ergebnis", width: 220, editable: true, type: "text" },
    ],
  },
  "mengenermittlung/soll-ist": {
    title: "Soll-Ist Vergleich",
    columns: [
      { key: "pos", header: "Pos.", width: 100 },
      { key: "beschreibung", header: "Beschreibung", width: 420 },
      { key: "soll", header: "Soll", width: 120, align: "right", type: "number" },
      { key: "ist", header: "Ist", width: 120, align: "right", type: "number" },
      { key: "diff", header: "Diff", width: 120, align: "right", type: "number" },
    ],
    sum: ["soll", "ist", "diff"],
  },
  "mengenermittlung/ki-aufmass": {
    title: "KI-Aufmaß",
    columns: [
      { key: "quelle", header: "Quelle", width: 200, editable: true, type: "text" },
      { key: "voce", header: "Leistung", width: 380, editable: true, type: "text" },
      { key: "menge", header: "Menge", width: 120, align: "right", type: "number", editable: true },
      { key: "conf", header: "Conf.", width: 120, align: "right", type: "number", editable: true },
    ],
    sum: ["menge"],
  },
  "mengenermittlung/regieberichte": {
    title: "Regieberichte",
    columns: [
      { key: "datum", header: "Datum", width: 140, editable: true, type: "text" },
      { key: "beschreibung", header: "Beschreibung", width: 480, editable: true, type: "text" },
      { key: "stunden", header: "Std.", width: 120, align: "right", type: "number", editable: true },
      { key: "kosten", header: "Kosten", width: 140, align: "right", type: "number", editable: true },
    ],
    sum: ["stunden", "kosten"],
  },
  "mengenermittlung/lieferscheine": {
    title: "Lieferscheine",
    columns: [
      { key: "datum", header: "Datum", width: 140, editable: true, type: "text" },
      { key: "lieferant", header: "Lieferant", width: 220, editable: true, type: "text" },
      { key: "ddt", header: "LS/Beleg", width: 160, editable: true, type: "text" },
      { key: "material", header: "Material", width: 300, editable: true, type: "text" },
      { key: "menge", header: "Menge", width: 120, align: "right", type: "number", editable: true },
      { key: "kosten", header: "Kosten", width: 140, align: "right", type: "number", editable: true },
    ],
    sum: ["menge", "kosten"],
  },
  "mengenermittlung/verknuepfung-nachtraege": {
    title: "Verknüpfung Nachträge & Abrechnung",
    columns: [
      { key: "nr", header: "Nr.", width: 100, editable: true, type: "text" },
      { key: "beschreibung", header: "Beschreibung", width: 480, editable: true, type: "text" },
      { key: "betrag", header: "Betrag", width: 140, align: "right", type: "number", editable: true },
      { key: "status", header: "Status", width: 140, editable: true, type: "text" },
    ],
    sum: ["betrag"],
  },
  "mengenermittlung/historie-versionen": {
    title: "Historie / Versionierung",
    columns: [
      { key: "version", header: "Version", width: 140, editable: true, type: "text" },
      { key: "datum", header: "Datum", width: 120, editable: true, type: "text" },
      { key: "autor", header: "Autor", width: 180, editable: true, type: "text" },
      { key: "summe", header: "Summe", width: 140, align: "right", type: "number", editable: true },
      { key: "status", header: "Status", width: 140, editable: true, type: "text" },
    ],
    sum: ["summe"],
  },
  "mengenermittlung/gps-zuweisung": {
    title: "GPS-gestützte Zuweisung",
    columns: [
      { key: "punkt", header: "Punkt", width: 180, editable: true, type: "text" },
      { key: "koord", header: "Koordinate", width: 240, editable: true, type: "text" },
      { key: "pos", header: "Pos.", width: 120, editable: true, type: "text" },
      { key: "notiz", header: "Notiz", width: 280, editable: true, type: "text" },
    ],
  },

  // 🚀 Nuove
  "mengenermittlung/vorlagen-formeln": {
    title: "Vorlagen & Formelkatalog",
    columns: [
      { key: "name", header: "Vorlage", width: 260, editable: true, type: "text" },
      { key: "beschreibung", header: "Beschreibung", width: 420, editable: true, type: "text" },
      { key: "formel", header: "Formel", width: 200, editable: true, type: "text" },
      { key: "einheit", header: "ME", width: 80, editable: true, type: "text" },
      { key: "beispiel", header: "Beispiel", width: 260, editable: true, type: "text" },
    ],
  },
  "mengenermittlung/positionsliste-export": {
    title: "Positionsliste / Export",
    columns: [
      { key: "pos", header: "Pos.", width: 100, editable: true, type: "text" },
      { key: "gruppe", header: "Gruppe", width: 180, editable: true, type: "text" },
      { key: "bezeichnung", header: "Bezeichnung", width: 420, editable: true, type: "text" },
      { key: "einheit", header: "ME", width: 80, editable: true, type: "text" },
      { key: "soll", header: "Soll", width: 120, align: "right", type: "number", editable: true },
      { key: "ist", header: "Ist", width: 120, align: "right", type: "number", editable: true },
      { key: "ep", header: "EP", width: 120, align: "right", type: "number", editable: true },
      { key: "betrag", header: "Betrag", width: 140, align: "right", type: "number" },
    ],
    sum: ["soll", "ist", "betrag"],
  },

  // --- (le altre macro rimangono come già definite – puoi estenderle allo stesso modo) ---
};
