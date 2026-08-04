// apps/web/src/copilot/RlcSoftwareKnowledge.ts

export type RlcKnowledgeEntry = {
  id: string;
  module: string;
  title: string;
  route?: string;
  purpose: string;
  workflows: string[];
  actions: string[];
  related: string[];
  keywords: string[];
};

export const RLC_SOFTWARE_KNOWLEDGE: RlcKnowledgeEntry[] = [
  {
    id: "projects",
    module: "Projekt",
    title: "Projektverwaltung und Projektübersicht",
    route: "/start",
    purpose: "Projekte anlegen, öffnen, auswählen und als zentralen Kontext für alle Module verwenden.",
    workflows: [
      "Projekt auswählen oder neu anlegen",
      "Projektübersicht öffnen",
      "Von dort Kalkulation, Mengen, Verwaltung, CAD, Buchhaltung oder Mobile öffnen"
    ],
    actions: ["Projekt laden", "Projekt suchen", "Projekt anlegen", "Projektübersicht öffnen"],
    related: ["/projekt/uebersicht"],
    keywords: ["projekt", "ba-code", "projektcode", "projektübersicht", "baustelle"]
  },
  {
    id: "kalkulation-lv",
    module: "Kalkulation",
    title: "LV / Positionen",
    route: "/kalkulation/lv-import",
    purpose: "Leistungsverzeichnisse und Positionen importieren, prüfen und für Kalkulation, GAEB und Angebote vorbereiten.",
    workflows: ["LV importieren", "Positionen prüfen", "Fehlende Daten ergänzen", "An KI-Kalkulation oder GAEB übergeben"],
    actions: ["LV importieren", "Position bearbeiten", "Dubletten prüfen", "GAEB öffnen"],
    related: ["/kalkulation/mit-ki", "/kalkulation/gaeb", "/kalkulation/angebot"],
    keywords: ["lv", "leistungsverzeichnis", "position", "kurztext", "langtext", "menge", "einheit"]
  },
  {
    id: "kalkulation-ki",
    module: "Kalkulation",
    title: "KI-Kalkulation",
    route: "/kalkulation/mit-ki",
    purpose: "Positionen technisch und wirtschaftlich kalkulieren, EP/GP, Urkalkulation, Risiken und Preisaufbau erzeugen.",
    workflows: ["LV auswählen", "KI-Kalkulation starten", "Risiken und Ausreißer prüfen", "Ergebnis in Angebot oder Datenbank übernehmen"],
    actions: ["KI kalkulieren", "Top-Risiken anzeigen", "Outlier prüfen", "Preisaufbau öffnen", "Ergebnis speichern"],
    related: ["/kalkulation/rezepte", "/kalkulation/angebot", "/kalkulation/datenbank"],
    keywords: ["kalkulation", "ki", "ep", "gp", "urkalkulation", "preis", "risiko", "outlier"]
  },
  {
    id: "kalkulation-db",
    module: "Kalkulation",
    title: "Kalkulationsdatenbank",
    route: "/kalkulation/datenbank",
    purpose: "Erfahrungswerte, Preise, Ressourcen, Rezepte und wiederverwendbare Kalkulationspositionen verwalten.",
    workflows: ["Datenbank durchsuchen", "Eintrag öffnen", "Preis und Ressourcen prüfen", "Eintrag in neue Kalkulation übernehmen"],
    actions: ["Eintrag suchen", "Position bearbeiten", "Dubletten bereinigen", "Preise öffnen"],
    related: ["/kalkulation/datenbank/preise", "/kalkulation/rezepte"],
    keywords: ["datenbank", "erfahrungswert", "ressourcen", "preislisten", "recipe", "rezept"]
  },
  {
    id: "kalkulation-gaeb",
    module: "Kalkulation",
    title: "GAEB",
    route: "/kalkulation/gaeb",
    purpose: "GAEB-Dateien importieren, validieren und exportieren, insbesondere X83/X84 sowie D83/P83.",
    workflows: ["GAEB-Datei auswählen", "Struktur validieren", "Fehler korrigieren", "X83/X84 exportieren"],
    actions: ["GAEB importieren", "X83 prüfen", "X84 prüfen", "Export erstellen"],
    related: ["/kalkulation/lv-import", "/kalkulation/angebot"],
    keywords: ["gaeb", "x83", "x84", "d83", "p83", "export", "import"]
  },
  {
    id: "kalkulation-offer",
    module: "Kalkulation",
    title: "Angebot",
    route: "/kalkulation/angebot",
    purpose: "Aus kalkulierten Positionen ein Angebot erstellen und als PDF, Tabellen- oder GAEB-Datei ausgeben.",
    workflows: ["Kalkulation prüfen", "Angebotsdaten ergänzen", "Summen und Zuschläge kontrollieren", "Angebot exportieren"],
    actions: ["Angebot erstellen", "PDF exportieren", "GAEB exportieren"],
    related: ["/kalkulation/mit-ki", "/kalkulation/crm"],
    keywords: ["angebot", "submission", "pdf", "export", "kunde"]
  },
  {
    id: "kalkulation-nachtraege",
    module: "Kalkulation",
    title: "Nachträge",
    route: "/kalkulation/nachtraege",
    purpose: "Nachtragspositionen, Begründungen, Mengen, Preise und Freigaben verwalten.",
    workflows: ["Nachtrag anlegen", "Begründung und Positionen ergänzen", "Preis prüfen", "Angebot/PDF erzeugen"],
    actions: ["Nachtrag anlegen", "Position hinzufügen", "PDF exportieren"],
    related: ["/kalkulation/angebot", "/buchhaltung/rechnungen"],
    keywords: ["nachtrag", "nachträge", "begründung", "zusatzleistung"]
  },
  {
    id: "kalkulation-versions",
    module: "Kalkulation",
    title: "Versionsvergleich / Angebotsanalyse",
    route: "/kalkulation/versionsvergleich",
    purpose: "LV- oder Angebotsversionen vergleichen und Preis-, Mengen- und Einheitsabweichungen analysieren.",
    workflows: ["Versionen speichern/importieren", "Zwei Versionen auswählen", "Vergleich starten", "Risikoanalyse und PDF erzeugen"],
    actions: ["Version speichern", "CSV importieren", "Vergleichen", "Risikoanalyse", "PDF exportieren"],
    related: ["/kalkulation/mit-ki"],
    keywords: ["versionsvergleich", "abweichung", "vergleich", "risikoanalyse", "outlier"]
  },
  {
    id: "kalkulation-crm",
    module: "Kalkulation",
    title: "CRM / Angebotsverfolgung",
    route: "/kalkulation/crm",
    purpose: "Angebote, Kundenkontakte, Follow-ups, Status und nächste Aktionen verfolgen.",
    workflows: ["Angebot erfassen", "Status pflegen", "Follow-up terminieren", "Kundenkontakt dokumentieren"],
    actions: ["Angebot öffnen", "Status ändern", "Follow-up setzen"],
    related: ["/kalkulation/angebot", "/buro/kommunikation"],
    keywords: ["crm", "angebot verfolgen", "follow-up", "kunde", "status"]
  },
  {
    id: "aufmass",
    module: "Mengenermittlung",
    title: "Aufmaß-Editor",
    route: "/mengenermittlung/aufmasseditor",
    purpose: "LV-bezogenes Aufmaß mit Orten/Unterorten, Aufmaßzeilen, Formeln, Soll/Ist, Teilaufmaßen und Summen erfassen.",
    workflows: ["Ort oder Unterort anlegen", "LV-Position einem Ort zuordnen", "Aufmaßzeilen erfassen", "Speichern", "PDF/REB/GAEB/CSV exportieren"],
    actions: ["Ort anlegen", "Unterort anlegen", "Position zuordnen", "Aufmaß speichern", "PDF exportieren", "REB exportieren"],
    related: ["/mengenermittlung/historie", "/mengenermittlung/soll-ist", "/buchhaltung/abschlagsrechnungen"],
    keywords: ["aufmaß", "aufmass", "ort", "unterort", "aufmaßzeile", "reb", "d11", "x31", "menge"]
  },
  {
    id: "mengen-auto",
    module: "Mengenermittlung",
    title: "KI-Mengenermittlung aus Plan / Foto / Sprache",
    route: "/mengenermittlung/auto",
    purpose: "Mengen aus Plänen, Fotos, Sprache und Importdateien erfassen oder automatisch ableiten.",
    workflows: ["Quelle wählen", "Datei/Foto importieren", "Erkennung prüfen", "Mengen Positionen zuweisen"],
    actions: ["Foto importieren", "Plan importieren", "Spracheingabe", "Mengen übernehmen"],
    related: ["/mengenermittlung/aufmasseditor", "/cad/pdf-viewer"],
    keywords: ["foto", "plan", "sprache", "automatische mengen", "ocr"]
  },
  {
    id: "mengen-soll-ist",
    module: "Mengenermittlung",
    title: "Soll-Ist-Vergleich",
    route: "/mengenermittlung/soll-ist",
    purpose: "LV-Sollmengen und erfasste Istmengen vergleichen und Abweichungen erkennen.",
    workflows: ["Projekt auswählen", "Soll/Ist laden", "Abweichungen filtern", "Ergebnis prüfen"],
    actions: ["Vergleich starten", "Abweichungen filtern"],
    related: ["/mengenermittlung/aufmasseditor"],
    keywords: ["soll ist", "abweichung", "mengenvergleich"]
  },
  {
    id: "mengen-history",
    module: "Mengenermittlung",
    title: "Aufmaß-Historie",
    route: "/mengenermittlung/historie",
    purpose: "Gespeicherte Aufmaßstände, Änderungen und Versionen nachvollziehen.",
    workflows: ["Historie öffnen", "Stand auswählen", "Änderungen prüfen", "Bei Bedarf wiederherstellen"],
    actions: ["Version öffnen", "Vergleichen"],
    related: ["/mengenermittlung/aufmasseditor"],
    keywords: ["historie", "version", "änderung", "aufmaßstand"]
  },
  {
    id: "mengen-gps",
    module: "Mengenermittlung",
    title: "GPS-basierte Positionszuweisung",
    route: "/mengenermittlung/gps",
    purpose: "Messpunkte und Geodaten importieren, visualisieren und LV-Positionen zuweisen.",
    workflows: ["Messdatei importieren", "Punkte prüfen", "Layer/Code auswerten", "Position zuweisen"],
    actions: ["CSV/GPX/KML/DXF importieren", "Punkte anzeigen", "Position zuweisen"],
    related: ["/cad/map", "/mengenermittlung/aufmasseditor"],
    keywords: ["gps", "gnss", "csv", "gpx", "kml", "dxf", "code", "punkt"]
  },
  {
    id: "cad",
    module: "CAD / PDF",
    title: "CAD Viewer",
    route: "/cad/viewer",
    purpose: "CAD-Dateien, Layer und technische Geometrien anzeigen und prüfen.",
    workflows: ["Datei laden", "Layer wählen", "Geometrie prüfen", "Mit Karte oder As-Built verbinden"],
    actions: ["DWG/DXF laden", "Layer schalten", "Zoomen"],
    related: ["/cad/pdf-viewer", "/cad/asbuild", "/cad/map"],
    keywords: ["cad", "dwg", "dxf", "layer", "geometrie"]
  },
  {
    id: "pdf-viewer",
    module: "CAD / PDF",
    title: "PDF Viewer",
    route: "/cad/pdf-viewer",
    purpose: "Baupläne und PDF-Unterlagen anzeigen, prüfen und als Grundlage für Mengen verwenden.",
    workflows: ["PDF laden", "Seite wählen", "Plan prüfen", "Mengen- oder CAD-Funktion öffnen"],
    actions: ["PDF laden", "Zoomen", "Seite wechseln"],
    related: ["/mengenermittlung/auto"],
    keywords: ["pdf viewer", "plan", "bauplan"]
  },
  {
    id: "asbuilt",
    module: "CAD / PDF",
    title: "As-Built",
    route: "/cad/asbuild",
    purpose: "Bestandsdokumentation mit GNSS/TS-Messungen und Soll-Ist-Geometrien verwalten.",
    workflows: ["Messdaten importieren", "Bestand prüfen", "Planbezug herstellen", "Dokumentation exportieren"],
    actions: ["Messdaten laden", "As-Built prüfen", "Export"],
    related: ["/cad/map", "/mengenermittlung/gps"],
    keywords: ["as-built", "bestand", "gnss", "totalstation"]
  },
  {
    id: "verwaltung",
    module: "Büro / Verwaltung",
    title: "Projektverwaltung und Dokumente",
    route: "/buro",
    purpose: "Projekte, Dokumente, Verträge, Aufgaben, Kommunikation, Personal, Maschinen, Material und Ressourcen verwalten.",
    workflows: ["Modul auswählen", "Datensatz anlegen", "Status und Verantwortliche pflegen", "Dokumentation speichern"],
    actions: ["Projekt öffnen", "Dokument anlegen", "Aufgabe erstellen", "Nutzer verwalten"],
    related: ["/buro/projekte", "/buro/dokumente", "/buro/tasks", "/buro/kommunikation"],
    keywords: ["verwaltung", "büro", "dokumente", "aufgaben", "verträge", "kommunikation"]
  },
  {
    id: "mobile-workflow",
    module: "Mobile",
    title: "Mobile Eingang und Freigabe",
    route: "/mobile",
    purpose: "Mobile Baustellendokumente erfassen, in den Eingang übertragen, freigeben und in das jeweilige Fachmodul überführen.",
    workflows: ["Dokument mobil erfassen", "In Eingang synchronisieren", "Durch Bauleiter freigeben", "Im Zielmodul archivieren"],
    actions: ["Regiebericht erfassen", "Lieferschein erfassen", "Foto senden", "Tagesbericht senden", "Freigeben"],
    related: ["/buro/regieberichte", "/buro/lieferscheine", "/buro/fotos", "/mengenermittlung/aufmasseditor"],
    keywords: ["mobile", "eingang", "freigabe", "regiebericht", "lieferschein", "tagesbericht", "bautagebuch"]
  },
  {
    id: "buchhaltung",
    module: "Buchhaltung",
    title: "Rechnungen, Abschläge und Zahlungen",
    route: "/buchhaltung",
    purpose: "Kosten, Rechnungen, Abschlagsrechnungen, Zahlungen, Eingangsrechnungen, Mahnwesen und Exporte verwalten.",
    workflows: ["Projektkosten prüfen", "Abschlagsrechnung erstellen", "Zahlung erfassen", "Offene Posten und Mahnungen verfolgen"],
    actions: ["Kostenübersicht öffnen", "Rechnung erstellen", "Abschlag erstellen", "Zahlung buchen", "DATEV exportieren"],
    related: ["/buchhaltung/kostenuebersicht", "/buchhaltung/abschlagsrechnungen", "/buchhaltung/rechnungen", "/buchhaltung/zahlungen"],
    keywords: ["buchhaltung", "rechnung", "abschlag", "zahlung", "mahnung", "datev", "kostenstelle"]
  },
  {
    id: "ki-modules",
    module: "KI",
    title: "KI-Funktionen",
    route: "/ki",
    purpose: "Automatische LV-Erstellung, Vorschläge, Fotoerkennung, Sprache, Widerspruchsprüfung, Abrechnung, Optimierung und Mängelmanagement.",
    workflows: ["KI-Modul auswählen", "Quelldaten bereitstellen", "Ergebnis prüfen", "Freigeben und übernehmen"],
    actions: ["Auto-LV", "Vorschläge", "Fotoerkennung", "Sprachsteuerung", "Widersprüche prüfen", "Auto-Abrechnung"],
    related: ["/ki/auto-lv", "/ki/vorschlaege", "/ki/fotoerkennung", "/ki/sprachsteuerung"],
    keywords: ["ki", "auto lv", "fotoerkennung", "sprachsteuerung", "widersprüche", "optimierung", "mängel"]
  },
  {
    id: "help",
    module: "Info / Hilfe",
    title: "Hilfe, FAQ und Systemstatus",
    route: "/info",
    purpose: "Anleitungen, FAQ, Shortcuts, Changelog, Updates, Datenschutz, Support und Systemstatus bereitstellen.",
    workflows: ["Hilfethema suchen", "Anleitung öffnen", "Systemstatus prüfen", "Support kontaktieren"],
    actions: ["Hilfe öffnen", "FAQ öffnen", "Support öffnen", "Systemstatus prüfen"],
    related: ["/info/hilfe", "/info/faq", "/info/support", "/info/system"],
    keywords: ["hilfe", "faq", "support", "systemstatus", "updates"]
  }
];

function normalizeKnowledgeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchRlcSoftwareKnowledge(
  query: string,
  pathname = "",
  limit = 8,
): RlcKnowledgeEntry[] {
  const q = normalizeKnowledgeText(`${query} ${pathname}`);
  const words = new Set(q.split(" ").filter((x) => x.length > 2));

  return RLC_SOFTWARE_KNOWLEDGE
    .map((entry) => {
      const haystack = normalizeKnowledgeText(
        [
          entry.module,
          entry.title,
          entry.route,
          entry.purpose,
          ...entry.workflows,
          ...entry.actions,
          ...entry.related,
          ...entry.keywords,
        ].join(" "),
      );

      let score = pathname && entry.route && pathname.startsWith(entry.route) ? 12 : 0;
      for (const word of words) {
        if (haystack.includes(word)) score += 2;
      }
      if (entry.route && q.includes(normalizeKnowledgeText(entry.route))) score += 8;

      return { entry, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit))
    .map((x) => x.entry);
}

export function buildRlcKnowledgeContext(query: string, pathname = "") {
  const matches = searchRlcSoftwareKnowledge(query, pathname, 8);

  return {
    version: "2026-07-16",
    totalEntries: RLC_SOFTWARE_KNOWLEDGE.length,
    matches,
    softwareMap: RLC_SOFTWARE_KNOWLEDGE.map((entry) => ({
      module: entry.module,
      title: entry.title,
      route: entry.route,
      purpose: entry.purpose,
    })),
  };
}
