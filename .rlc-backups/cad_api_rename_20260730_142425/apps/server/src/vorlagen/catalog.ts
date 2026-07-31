import {
  VORLAGEN_BLUEPRINTS,
  VORLAGEN_BLUEPRINTS_BY_KEY,
  VORLAGE_LAYOUT_LABELS,
  type VorlageBlueprint,
} from "./catalogBlueprints";

export type VorlageCatalogEntry = {
  slug: string;
  title: string;
  description: string;
  categoryKey: string;
  categoryLabel: string;
  language: "de";
  outputType: "DOCUMENT";
  content: string;
  variables: string[];
  tags: string[];
};

export type VorlageCategory = {
  key: string;
  label: string;
  description: string;
  topics: string[];
  checks: [string, string, string, string];
  actions: [string, string, string];
};

export const VORLAGEN_CATEGORIES: VorlageCategory[] = [
  {
    key: "baustelle-bauleitung",
    label: "Baustelle & Bauleitung",
    description: "Organisation, Koordination und rechtssichere Dokumentation der Baustellenleitung",
    topics: [
      "Baustelleneinrichtungsprotokoll", "Baustellenordnung", "Bauleiter-Tagescheck",
      "Baubesprechungsprotokoll", "Baustellenbegehung", "Anlaufbesprechung",
      "Behinderungsanzeige", "Bedenkenanmeldung", "Arbeitsunterbrechung",
      "Bauablaufänderung", "Terminabstimmung", "Leistungsstand-Meldung",
      "Baustellenübergabe", "Schnittstellenprotokoll", "Nachweis Baustellenbesetzung",
      "Wochenvorschau Bauleitung", "Entscheidungsvorlage Bauleitung", "Baustellenabschlussbericht",
    ],
    checks: [
      "Zuständigkeiten, Fristen und Ansprechpartner sind eindeutig benannt.",
      "Planstand, Vertragsgrundlage und betroffene Leistungen sind angegeben.",
      "Abweichungen und Auswirkungen auf Kosten, Termine und Qualität sind bewertet.",
      "Anlagen, Fotos und erforderliche Nachweise sind vollständig zugeordnet.",
    ],
    actions: [
      "Verantwortliche Person und verbindlichen Erledigungstermin festlegen.",
      "Betroffene Projektbeteiligte nachweisbar informieren.",
      "Erledigung kontrollieren und im Projektverlauf dokumentieren.",
    ],
  },
  {
    key: "regie-tagesberichte",
    label: "Regie, Tagesberichte & Bautagebuch",
    description: "Tägliche Leistungserfassung, Regienachweise und lückenlose Baustellendokumentation",
    topics: [
      "Regiebericht Arbeitskräfte", "Regiebericht Geräte", "Regiebericht Material",
      "Regiebericht Nachunternehmer", "Tagesbericht Tiefbau", "Tagesbericht Hochbau",
      "Tagesbericht Straßenbau", "Tagesbericht Kanalbau", "Bautagebuch-Wochenblatt",
      "Witterungsdokumentation", "Stillstandsprotokoll", "Mehrarbeitsnachweis",
      "Nachtarbeitsnachweis", "Wochenendarbeitsnachweis", "Kolonnenbericht",
      "Schichtübergabeprotokoll", "Leistungsfortschrittsbericht", "Tagesabschluss Baustelle",
    ],
    checks: [
      "Personalstunden, Gerätezeiten und Materialmengen sind plausibel und vollständig.",
      "Ausgeführte Leistungen sind mit Ort, LV-Position und Zeitraum beschrieben.",
      "Witterung, Behinderungen und besondere Vorkommnisse sind nachvollziehbar erfasst.",
      "Freigabe, Unterschriften und zugehörige Fotos sind vorhanden.",
    ],
    actions: [
      "Leistungsnachweis am selben Arbeitstag vervollständigen.",
      "Auftraggeber zur Prüfung und Gegenzeichnung vorlegen.",
      "Freigegebenen Nachweis der Projektakte und Abrechnung zuordnen.",
    ],
  },
  {
    key: "angebote-rechnungen",
    label: "Angebote, Rechnungen & Mahnungen",
    description: "Kaufmännische Schreiben von der Angebotsabgabe bis zum Zahlungseingang",
    topics: [
      "Angebotsanschreiben", "Angebotsnachtrag", "Pauschalangebot",
      "Einheitspreisangebot", "Alternativangebot", "Angebotsklarstellung",
      "Auftragsbestätigung", "Abschlagsrechnung", "Schlussrechnung",
      "Teilrechnung", "Gutschrift", "Rechnungskorrektur",
      "Zahlungserinnerung", "Erste Mahnung", "Zweite Mahnung",
      "Letzte Mahnung", "Ratenzahlungsvereinbarung", "Forderungsübersicht",
    ],
    checks: [
      "Leistungsumfang, Preise, Umsatzsteuer und Zahlungsbedingungen sind eindeutig.",
      "Projekt-, Auftrags-, Rechnungs- und Kundendaten stimmen überein.",
      "Nachweise, Aufmaße und vereinbarte Abzüge sind berücksichtigt.",
      "Fälligkeit, Skonto, Bankverbindung und Ansprechpartner sind korrekt.",
    ],
    actions: [
      "Kaufmännische und technische Prüfung dokumentieren.",
      "Dokument mit eindeutigem Versand- und Fälligkeitsdatum versenden.",
      "Zahlungseingang beziehungsweise weitere Eskalation nachverfolgen.",
    ],
  },
  {
    key: "aufmass-mengen",
    label: "Aufmaß & Mengenermittlung",
    description: "Prüfbare Mengen, Aufmaßblätter und Abrechnungsgrundlagen nach REB",
    topics: [
      "Aufmaßblatt REB 23.003", "Gemeinsames Aufmaß", "Mengenberechnung Erdarbeiten",
      "Mengenberechnung Leitungsbau", "Mengenberechnung Oberflächen", "Mengenberechnung Beton",
      "Mengenberechnung Mauerwerk", "Mengenberechnung Asphalt", "Mengenberechnung Pflaster",
      "Mengenberechnung Kanalbau", "Massenermittlung Aushub", "Flächenermittlung",
      "Längenermittlung", "Stückzahlnachweis", "Aufmaßkorrektur",
      "Aufmaßfreigabe", "Mengen-Soll-Ist-Vergleich", "Abrechnungsübersicht",
    ],
    checks: [
      "Orte, Achsen, Stationen und LV-Positionen sind eindeutig zugeordnet.",
      "Rechenansätze, Einheiten, Faktoren und Rundungen sind prüfbar.",
      "Planstand, Messquelle und Aufmaßdatum sind dokumentiert.",
      "Doppelerfassungen, Überschreitungen und fehlende Gegenmaße sind geprüft.",
    ],
    actions: [
      "Mengen mit Plan, Feldmessung und Lieferscheinen abgleichen.",
      "Abweichungen begründen und zur gemeinsamen Prüfung vorlegen.",
      "Freigegebene Mengen in Abrechnung und Projektdokumentation übernehmen.",
    ],
  },
  {
    key: "arbeitssicherheit",
    label: "Arbeitssicherheit & Unterweisungen",
    description: "Gefährdungsbeurteilungen, Unterweisungen und sichere Baustellenorganisation",
    topics: [
      "Allgemeine Sicherheitsunterweisung", "Baustellenspezifische Unterweisung", "Gefährdungsbeurteilung",
      "Toolbox-Meeting", "Unterweisung Erdarbeiten", "Unterweisung Arbeiten im Graben",
      "Unterweisung Maschinenbedienung", "Unterweisung Anschlagmittel", "Unterweisung Absturzsicherung",
      "Unterweisung Gefahrstoffe", "Unterweisung Verkehrssicherung", "Unterweisung Persönliche Schutzausrüstung",
      "Erste-Hilfe-Organisation", "Unfallmeldung", "Beinaheunfall-Meldung",
      "Sicherheitsbegehung", "SiGeKo-Maßnahmenliste", "Notfall- und Rettungsplan",
    ],
    checks: [
      "Gefährdungen, Schutzmaßnahmen und verbleibende Restrisiken sind konkret beschrieben.",
      "Unterwiesene Personen, Qualifikationen und Verantwortlichkeiten sind erfasst.",
      "PSA, Prüfmittel, Rettungswege und Notfallkontakte sind verfügbar.",
      "Wirksamkeitskontrolle und Wiederholungsfrist sind festgelegt.",
    ],
    actions: [
      "Schutzmaßnahmen vor Arbeitsbeginn umsetzen und kontrollieren.",
      "Unterweisung verständlich durchführen und unterschreiben lassen.",
      "Mängel sofort abstellen oder gefährdete Arbeiten stoppen.",
    ],
  },
  {
    key: "personal-nachunternehmer",
    label: "Personal & Nachunternehmer",
    description: "Personalorganisation, Nachunternehmerprüfung und operative Einsatzsteuerung",
    topics: [
      "Mitarbeiter-Stammdatenblatt", "Arbeitszeitnachweis", "Urlaubsantrag",
      "Krankmeldung", "Einsatzplanung Personal", "Qualifikationsmatrix",
      "Schulungsnachweis", "Mitarbeitergespräch", "Abmahnung",
      "Nachunternehmer-Anfrage", "Nachunternehmer-Präqualifikation", "Nachunternehmer-Beauftragung",
      "Nachunternehmer-Einweisung", "Nachunternehmer-Leistungsbewertung", "Nachunternehmer-Abrechnung",
      "Bescheinigungsprüfung Nachunternehmer", "Personalüberlassungsprüfung", "Kolonnen-Einsatzbericht",
    ],
    checks: [
      "Stammdaten, Qualifikation, Einsatzzeit und arbeitsrechtliche Grundlage sind geprüft.",
      "Erforderliche Bescheinigungen, Versicherungen und Freistellungen sind gültig.",
      "Leistungsumfang, Weisungswege und Verantwortlichkeiten sind abgegrenzt.",
      "Arbeitszeiten, Leistungen und Freigaben sind nachvollziehbar dokumentiert.",
    ],
    actions: [
      "Fehlende Nachweise vor dem Einsatz anfordern.",
      "Einsatz, Zugangsrechte und Unterweisung verbindlich koordinieren.",
      "Leistung und Vertragserfüllung regelmäßig bewerten.",
    ],
  },
  {
    key: "geraete-fahrzeuge",
    label: "Geräte, Fahrzeuge & Maschinen",
    description: "Einsatz, Prüfung, Wartung und wirtschaftliche Verwaltung des Maschinenparks",
    topics: [
      "Maschinen-Stammdatenblatt", "Fahrzeug-Stammdatenblatt", "Geräteübergabe",
      "Fahrzeugübergabe", "Tägliche Maschinenkontrolle", "Fahrzeugkontrolle",
      "Wartungsplan", "Wartungsnachweis", "Reparaturauftrag",
      "Schadensmeldung Maschine", "Schadensmeldung Fahrzeug", "UVV-Prüfnachweis",
      "Betriebsstunden-Nachweis", "Tanknachweis", "Maschinen-Einsatzbericht",
      "Mietgeräte-Rückgabe", "Geräteinventur", "Maschinenkosten-Auswertung",
    ],
    checks: [
      "Inventarnummer, Standort, Bediener und technischer Zustand sind erfasst.",
      "Prüf-, Wartungs- und Versicherungsfristen sind gültig.",
      "Betriebsstunden, Verbrauch, Schäden und Stillstände sind dokumentiert.",
      "Zubehör, Schlüssel und Sicherheitsausstattung sind vollständig.",
    ],
    actions: [
      "Mängel priorisieren und erforderliche Reparatur veranlassen.",
      "Prüf- und Wartungstermine im System aktualisieren.",
      "Kosten und Ausfallzeiten dem Projekt beziehungsweise Gerät zuordnen.",
    ],
  },
  {
    key: "material-einkauf-lager",
    label: "Material, Einkauf & Lager",
    description: "Bedarf, Bestellung, Wareneingang und nachvollziehbare Lagerbewegungen",
    topics: [
      "Materialbedarfsmeldung", "Preisanfrage Lieferant", "Angebotsvergleich Einkauf",
      "Bestellung", "Bestelländerung", "Lieferabruf",
      "Wareneingangskontrolle", "Lieferscheinprüfung", "Materialreklamation",
      "Materialausgabe", "Materialrückgabe", "Lagerzugang",
      "Lagerabgang", "Bestandskorrektur", "Inventurliste",
      "Mindestbestandsprüfung", "Lieferantenbewertung", "Einkaufsübersicht Projekt",
    ],
    checks: [
      "Artikel, Spezifikation, Menge, Liefertermin und Einsatzort sind eindeutig.",
      "Preis, Fracht, Zahlungsbedingungen und Freigabegrenzen sind geprüft.",
      "Wareneingang, Qualität, Lieferschein und Bestellung stimmen überein.",
      "Lagerort, Charge und projektbezogene Verwendung sind dokumentiert.",
    ],
    actions: [
      "Bedarf fachlich und kaufmännisch freigeben.",
      "Abweichungen sperren, reklamieren und nachverfolgen.",
      "Bestand und Projektkosten unmittelbar aktualisieren.",
    ],
  },
  {
    key: "qualitaet-abnahme",
    label: "Qualität, Mängel & Abnahmen",
    description: "Qualitätssicherung, Mängelverfolgung und dokumentierte Abnahmen",
    topics: [
      "Qualitätsprüfplan", "Prüf- und Kontrollplan", "Eigenüberwachungsprotokoll",
      "Materialfreigabe", "Musterfreigabe", "Bauteilprüfung",
      "Mängelanzeige", "Mängelliste", "Mängelbeseitigungsnachweis",
      "Nachkontrolle Mangel", "Teilabnahme", "Förmliche Abnahme",
      "Zustandsfeststellung", "Leistungsfeststellung", "Inbetriebnahmeprotokoll",
      "Gewährleistungsbegehung", "Dokumentationsfreigabe", "Qualitätsabschlussbericht",
    ],
    checks: [
      "Prüfkriterium, Sollwert, Istwert und angewendete Regelwerke sind benannt.",
      "Ort, Bauteil, Verantwortlicher und Prüftermin sind eindeutig.",
      "Abweichungen sind bewertet, fotografiert und mit Frist versehen.",
      "Freigaben und Vorbehalte sind vollständig dokumentiert.",
    ],
    actions: [
      "Prüfung nach festgelegtem Prüfplan durchführen.",
      "Abweichung sichern, Ursache klären und Korrekturmaßnahme festlegen.",
      "Wirksamkeit nachkontrollieren und Abschluss freigeben.",
    ],
  },
  {
    key: "datenschutz",
    label: "Datenschutz & DSGVO",
    description: "Datenschutzkonforme Verarbeitung, Dokumentation und Betroffenenkommunikation",
    topics: [
      "Datenschutzinformation Beschäftigte", "Datenschutzinformation Kunden", "Datenschutzinformation Lieferanten",
      "Einwilligung Fotoaufnahmen", "Einwilligung GPS-Daten", "Einwilligung Videoüberwachung",
      "Verzeichnis Verarbeitungstätigkeit", "Auftragsverarbeitungsvertrag", "Vertraulichkeitsverpflichtung",
      "Auskunftsersuchen", "Löschersuchen", "Berichtigungsersuchen",
      "Meldung Datenschutzverletzung", "Datenschutz-Folgenabschätzung", "Berechtigungskonzept",
      "Lösch- und Aufbewahrungskonzept", "Datenübermittlungsprüfung", "Datenschutz-Jahreskontrolle",
    ],
    checks: [
      "Zweck, Rechtsgrundlage, Datenkategorien und Betroffene sind dokumentiert.",
      "Zugriff, Empfänger, Speicherdauer und Löschfrist sind festgelegt.",
      "Technische und organisatorische Maßnahmen sind angemessen.",
      "Informations-, Melde- und Betroffenenfristen werden eingehalten.",
    ],
    actions: [
      "Datenschutzrelevanten Vorgang im Verzeichnis dokumentieren.",
      "Zugriff auf erforderliche Personen und Systeme begrenzen.",
      "Fristgerechte Bearbeitung und abschließende Löschung nachweisen.",
    ],
  },
  {
    key: "vertraege-recht",
    label: "Verträge & rechtliche Schreiben",
    description: "Vertragliche Vereinbarungen, Fristwahrung und belastbare Projektkorrespondenz",
    topics: [
      "Bauvertrag Kurzfassung", "Nachunternehmervertrag", "Liefervertrag",
      "Mietvertrag Gerät", "Rahmenvertrag", "Vertragsnachtrag",
      "Leistungsänderungsanzeige", "Mehrkostenanmeldung", "Fristsetzung",
      "Verzugsschreiben", "Kündigungsandrohung", "Vertragskündigung",
      "Bauzeitverlängerungsantrag", "Vorbehaltserklärung", "Zurückweisung unberechtigter Forderung",
      "Vergleichsvereinbarung", "Verjährungshemmungsvereinbarung", "Vertragsabschluss-Checkliste",
    ],
    checks: [
      "Vertragsparteien, Leistungsgegenstand und Vertragsgrundlagen sind vollständig.",
      "Fristen, Vergütung, Haftung und Abnahmebedingungen sind eindeutig.",
      "Bezugsschreiben, Nachweise und Rechtsfolgen sind nachvollziehbar.",
      "Zeichnungsberechtigung und erforderliche Freigaben sind geprüft.",
    ],
    actions: [
      "Vertragliche Frist im Termin- und Dokumentensystem sichern.",
      "Sachverhalt mit Projektleitung und kaufmännischer Stelle abstimmen.",
      "Schreiben nachweisbar zustellen und Reaktion überwachen.",
    ],
  },
  {
    key: "kundenkommunikation",
    label: "Kundenkommunikation",
    description: "Professionelle Kundeninformation, Abstimmung und nachvollziehbare Kommunikation",
    topics: [
      "Projektbegrüßung", "Ansprechpartner-Mitteilung", "Terminbestätigung",
      "Terminverschiebung", "Baubeginn-Ankündigung", "Anwohnerinformation",
      "Statusbericht Kunde", "Wochenbericht Kunde", "Freigabeanfrage",
      "Entscheidungsanfrage", "Rückfrage zum Leistungsumfang", "Hinweis auf Mitwirkungspflicht",
      "Beschwerdebestätigung", "Beschwerdeantwort", "Kulanzangebot",
      "Fertigstellungsanzeige", "Abnahmeeinladung", "Projektabschluss-Dankschreiben",
    ],
    checks: [
      "Anlass, Projektbezug und gewünschte Reaktion sind sofort verständlich.",
      "Termine, Ansprechpartner und nächste Schritte sind konkret benannt.",
      "Aussagen stimmen mit Vertrag, Projektstand und interner Freigabe überein.",
      "Ton, Verteiler und Anlagen entsprechen dem Empfängerkreis.",
    ],
    actions: [
      "Kommunikation vor Versand fachlich prüfen.",
      "Versand und Kundenreaktion in der Projektakte dokumentieren.",
      "Zusage oder offenen Punkt einer verantwortlichen Person zuweisen.",
    ],
  },
  {
    key: "projektmanagement",
    label: "Projektmanagement",
    description: "Planung, Steuerung, Entscheidungen und transparente Projektberichte",
    topics: [
      "Projektauftrag", "Projektsteckbrief", "Kick-off-Protokoll",
      "Projektorganigramm", "Meilensteinplan", "Terminplan-Statusbericht",
      "Kostenstatusbericht", "Risikoregister", "Chancenregister",
      "Entscheidungsprotokoll", "Änderungsantrag", "Maßnahmenliste",
      "Jour-fixe-Protokoll", "Monatsbericht", "Projektampel-Bericht",
      "Lessons-Learned-Protokoll", "Projektübergabe", "Projektabschlussbericht",
    ],
    checks: [
      "Ziele, Leistungsumfang, Verantwortlichkeiten und Entscheidungswege sind klar.",
      "Termine, Kosten, Risiken und offene Punkte besitzen aktuellen Status.",
      "Abweichungen sind mit Ursache, Auswirkung und Maßnahme bewertet.",
      "Entscheidungen und Änderungen sind versioniert und freigegeben.",
    ],
    actions: [
      "Maßnahmen mit Verantwortlichem und Termin im Projektplan führen.",
      "Kritische Abweichungen zeitnah eskalieren.",
      "Status regelmäßig aktualisieren und an den definierten Verteiler berichten.",
    ],
  },
  {
    key: "vermessung-dokumentation",
    label: "Vermessung & Dokumentation",
    description: "Messaufträge, Kontrollmessungen, Bestandsdaten und revisionssichere Übergabe",
    topics: [
      "Vermessungsauftrag", "Absteckprotokoll", "Absteckkontrolle",
      "Höhenkontrolle", "Lagekontrolle", "Achskontrolle",
      "Kontrollmessung Kanal", "Kontrollmessung Leitung", "Setzungsmessung",
      "Beweissicherung", "Bestandsaufnahme", "As-Built-Dokumentation",
      "Koordinatenverzeichnis", "Höhenverzeichnis", "Messpunktbeschreibung",
      "Geräteprüfnachweis Vermessung", "Datenübergabe Vermessung", "Vermessungsabschlussbericht",
    ],
    checks: [
      "Koordinatensystem, Höhenbezug, Genauigkeit und Messverfahren sind angegeben.",
      "Messpunkte, Festpunkte, Instrument und Bearbeiter sind nachvollziehbar.",
      "Soll-Ist-Abweichungen und Toleranzbewertung sind dokumentiert.",
      "Dateiformate, Planstand und Übergabeumfang sind eindeutig.",
    ],
    actions: [
      "Messauftrag und erforderliche Genauigkeit vorab bestätigen.",
      "Messdaten sichern, plausibilisieren und gegen Referenzen kontrollieren.",
      "Freigegebene Bestandsdaten dem CAD und der Projektakte übergeben.",
    ],
  },
  {
    key: "hochbau",
    label: "Hochbau",
    description: "Ausführungskontrollen und Fachprotokolle für Rohbau und Ausbau",
    topics: [
      "Rohbaukontrolle", "Fundamentfreigabe", "Bewehrungsabnahme",
      "Betonierprotokoll", "Schalungskontrolle", "Mauerwerkskontrolle",
      "Deckenkontrolle", "Dachabdichtungsprotokoll", "Fenster- und Türenkontrolle",
      "Trockenbaukontrolle", "Estrichprotokoll", "Putzkontrolle",
      "Fassadenkontrolle", "Brandschutzabschottung", "Haustechnik-Schnittstellenkontrolle",
      "Raumbuch", "Ausbau-Mängelliste", "Hochbau-Abschlusskontrolle",
    ],
    checks: [
      "Bauteil, Planstand, Material und Ausführungsanforderung sind eindeutig.",
      "Maße, Toleranzen, Einbauteile und Anschlüsse wurden kontrolliert.",
      "Prüfungen, Freigaben und verdeckte Leistungen sind nachgewiesen.",
      "Mängel und Restleistungen sind räumlich zugeordnet.",
    ],
    actions: [
      "Bauteil vor dem nächsten Arbeitsschritt prüfen und freigeben.",
      "Abweichung markieren, fotografieren und Verantwortlichen informieren.",
      "Nachbesserung kontrollieren und dokumentiert abschließen.",
    ],
  },
  {
    key: "tiefbau",
    label: "Tiefbau",
    description: "Fachgerechte Dokumentation für Erd-, Straßen-, Leitungs- und Kanalbau",
    topics: [
      "Baugrubenabnahme", "Grabensohle-Freigabe", "Bodenklassifizierung",
      "Verdichtungsnachweis", "Planumskontrolle", "Frostschutzkontrolle",
      "Leitungszone-Kontrolle", "Rohrverlegeprotokoll", "Druckprüfprotokoll",
      "Dichtheitsprüfung Kanal", "Schachtkontrolle", "Kanal-TV-Abnahme",
      "Asphalteinbauprotokoll", "Pflasterabnahme", "Bordstein-Kontrolle",
      "Verkehrssicherungs-Kontrolle", "Tiefbau-Mängelliste", "Tiefbau-Abschlussbericht",
    ],
    checks: [
      "Station, Tiefe, Boden, Bauteil und zugehörige LV-Position sind dokumentiert.",
      "Material, Schichtdicke, Gefälle und Verdichtung erfüllen die Vorgaben.",
      "Prüfnachweise und verdeckte Leistungen wurden vor Überdeckung gesichert.",
      "Bestandsmaße und Abweichungen sind vermessungstechnisch erfasst.",
    ],
    actions: [
      "Freigabe vor Überdeckung oder nachfolgendem Schichtaufbau einholen.",
      "Prüfergebnis mit Plan und technischen Regeln abgleichen.",
      "Bestands- und Abrechnungsdaten in CAD und Aufmaß übernehmen.",
    ],
  },
  {
    key: "galabau",
    label: "GaLaBau",
    description: "Vorlagen für Außenanlagen, Vegetation, Pflege und landschaftsgärtnerische Arbeiten",
    topics: [
      "Baumkontrolle vor Baubeginn", "Vegetationsschutz-Kontrolle", "Bodenverbesserungsprotokoll",
      "Pflanzflächen-Freigabe", "Pflanzprotokoll Bäume", "Pflanzprotokoll Sträucher",
      "Rasenansaat-Protokoll", "Rollrasen-Abnahme", "Bewässerungsprotokoll",
      "Wegebau-Kontrolle", "Einfassungs-Kontrolle", "Spielplatzkontrolle",
      "Pflegegang-Nachweis", "Fertigstellungspflege", "Entwicklungspflege",
      "Pflanzenausfall-Meldung", "GaLaBau-Mängelliste", "Außenanlagen-Abnahme",
    ],
    checks: [
      "Fläche, Pflanzenqualität, Substrat und Standortbedingungen sind erfasst.",
      "Einbau, Pflanztiefe, Bewässerung und Schutzmaßnahmen entsprechen der Planung.",
      "Pflegeleistung, Witterung und Entwicklungszustand sind dokumentiert.",
      "Ausfälle, Schäden und Nachpflanzfristen sind eindeutig zugeordnet.",
    ],
    actions: [
      "Lieferqualität und Standort vor Einbau freigeben.",
      "Pflege- und Bewässerungsmaßnahmen terminieren.",
      "Entwicklung kontrollieren und erforderliche Nachbesserung veranlassen.",
    ],
  },
  {
    key: "holzbau",
    label: "Holzbau",
    description: "Material-, Montage- und Qualitätsnachweise für konstruktiven Holzbau",
    topics: [
      "Holzlieferung-Eingangskontrolle", "Holzfeuchte-Messprotokoll", "Sortierklassen-Nachweis",
      "Abbundkontrolle", "Verbindungsmittel-Kontrolle", "Montagefreigabe Holzbau",
      "Wandtafel-Kontrolle", "Deckenelement-Kontrolle", "Dachelement-Kontrolle",
      "Luftdichtheits-Kontrolle", "Feuchteschutz-Kontrolle", "Holzschutz-Dokumentation",
      "Brandschutzbekleidung Holzbau", "Montageprotokoll Brettsperrholz", "Montageprotokoll Brettschichtholz",
      "Transport- und Lagerschaden", "Holzbau-Mängelliste", "Holzbau-Abnahme",
    ],
    checks: [
      "Holzart, Festigkeitsklasse, Feuchte und Herkunftsnachweis sind geprüft.",
      "Bauteilabmessungen, Anschlüsse und Verbindungsmittel entsprechen der Planung.",
      "Witterungs-, Feuchte-, Brand- und Holzschutz sind sichergestellt.",
      "Montagereihenfolge, Toleranzen und verdeckte Anschlüsse sind dokumentiert.",
    ],
    actions: [
      "Material und Auflager vor Montage prüfen und freigeben.",
      "Kritische Anschlüsse vor dem Schließen fotografisch sichern.",
      "Feuchte- und Mängelentwicklung bis zur Abnahme überwachen.",
    ],
  },
  {
    key: "umwelt-entsorgung",
    label: "Umwelt & Entsorgung",
    description: "Abfall, Boden, Gewässerschutz und umweltrelevante Baustellennachweise",
    topics: [
      "Abfallkonzept Baustelle", "Entsorgungsnachweis", "Abfallbegleitschein-Kontrolle",
      "Bodenmanagementplan", "Bodenproben-Protokoll", "Deklarationsanalyse-Übersicht",
      "Aushubfreigabe", "Zwischenlager-Kontrolle", "Wiedereinbau-Freigabe",
      "Kontaminationsmeldung", "Gewässerschutz-Kontrolle", "Betankungsplatz-Kontrolle",
      "Staub- und Lärmschutzplan", "Umweltvorfall-Meldung", "Artenschutz-Kontrolle",
      "Baumschutz-Protokoll", "Entsorgungskosten-Übersicht", "Umweltabschlussbericht",
    ],
    checks: [
      "Materialart, Herkunft, Menge, Einstufung und Entsorgungsweg sind belegt.",
      "Genehmigungen, Analysen und Nachweisnummern sind gültig.",
      "Lagerung, Transport und Schutzmaßnahmen verhindern Umweltgefährdungen.",
      "Mengen und Kosten stimmen mit Wiegescheinen und Rechnungen überein.",
    ],
    actions: [
      "Material vor Bewegung untersuchen und einstufen.",
      "Zulässigen Entsorgungs- oder Verwertungsweg bestätigen.",
      "Nachweise vollständig der Projekt- und Abrechnungsakte zuordnen.",
    ],
  },
];

const VARIABLES = [
  "Firma.Name",
  "Firma.Adresse",
  "Firma.Telefon",
  "Firma.Email",
  "Projekt.Name",
  "Projekt.Nummer",
  "Projekt.Ort",
  "Kunde.Name",
  "Bearbeiter.Name",
  "Datum",
];

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function baseHeader(title: string, documentCode: string): string[] {
  return [
    "{{Firma.Name}}",
    "{{Firma.Adresse}} · {{Firma.Telefon}} · {{Firma.Email}}",
    "",
    `# ${title}`,
    "",
    `RLC-Vorlagencode: ${documentCode}`,
    "Projekt: {{Projekt.Nummer}} – {{Projekt.Name}}",
    "Baustelle / Ort: {{Projekt.Ort}}",
    "Auftraggeber / Kunde: {{Kunde.Name}}",
    "Bearbeiter: {{Bearbeiter.Name}}",
    "Dokumentdatum: {{Datum}}",
    "",
  ];
}

function fieldLines(fields: string[]): string[] {
  return fields.map((field) => `${field}: ________________________________________________`);
}

function tableLines(columns: string[], rowCount = 5): string[] {
  const blankRow = columns.map((column) => `${column}: ____________________`).join("  |  ");
  return [
    `Spalten: ${columns.join(" · ")}`,
    ...Array.from({ length: rowCount }, (_unused, index) => `${index + 1}. ${blankRow}`),
  ];
}

function checkLines(checks: string[]): string[] {
  return checks.map((check) => `☐ ${check}`);
}

function actionLines(): string[] {
  return [
    "1. Maßnahme: _________________________________________________________",
    "   Verantwortlich: ____________________   Termin: ____________________",
    "2. Maßnahme: _________________________________________________________",
    "   Verantwortlich: ____________________   Termin: ____________________",
    "3. Maßnahme: _________________________________________________________",
    "   Verantwortlich: ____________________   Termin: ____________________",
  ];
}

function signatureLines(signers: string[]): string[] {
  return signers.flatMap((signer) => [
    `${signer}: ___________________________________________________________`,
    "Name / Datum / Unterschrift: ________________________________________",
  ]);
}

function renderProfessionalContent(
  blueprint: VorlageBlueprint,
  documentCode: string
): string {
  const header = baseHeader(blueprint.title, documentCode);
  const fields = fieldLines(blueprint.fields);
  const rows = tableLines(blueprint.columns);
  const checks = checkLines(blueprint.checks);
  const signatures = signatureLines(blueprint.signers);
  const result = [
    `${blueprint.resultLabel}:`,
    "___________________________________________________________________",
    "___________________________________________________________________",
  ];

  switch (blueprint.layout) {
    case "BRIEF":
      return [
        ...header,
        "An: {{Kunde.Name}}",
        "Betreff: " + blueprint.title + " – Projekt {{Projekt.Nummer}}",
        "",
        "Sehr geehrte Damen und Herren,",
        "",
        "## Bezug und verbindliche Kerndaten",
        ...fields,
        "",
        "## Sachverhalt / Erklärung",
        "___________________________________________________________________",
        "___________________________________________________________________",
        "___________________________________________________________________",
        "",
        "## Nachweisbare Einzelpunkte",
        ...rows,
        "",
        "## Fachliche und formale Endkontrolle",
        ...checks,
        "",
        "## Forderung, Entscheidung oder nächster Schritt",
        ...result,
        "Verbindliche Rückmeldung / Frist: _________________________________",
        "",
        "## Anlagen und Versandnachweis",
        "Anlagen: __________________________________________________________",
        "Versandart / Versanddatum: ________________________________________",
        "",
        "Mit freundlichen Grüßen",
        "{{Firma.Name}}",
        ...signatures,
      ].join("\n");

    case "VERTRAG":
      return [
        ...header,
        "## Vertragsparteien und Eckdaten",
        "Partei 1: {{Firma.Name}}, {{Firma.Adresse}}",
        "Partei 2: {{Kunde.Name}}, ________________________________________",
        ...fields,
        "",
        "## Vertragsgegenstand und Leistungsabgrenzung",
        "Geschuldete Leistung / Vereinbarung:",
        "___________________________________________________________________",
        "Nicht geschuldete beziehungsweise ausdrücklich ausgeschlossene Leistung:",
        "___________________________________________________________________",
        "",
        "## Einzelregelungen",
        ...rows,
        "",
        "## Vergütung, Termine und Nachweise",
        "Vergütung / Zahlungsplan: _________________________________________",
        "Beginn / Fälligkeit / Laufzeit: ___________________________________",
        "Geschuldete Nachweise und Anlagen: _________________________________",
        "",
        "## Vertragsprüfung",
        ...checks,
        "",
        "## Schlussregelung",
        ...result,
        "Änderungen und Ergänzungen: _______________________________________",
        "",
        "## Unterschriften",
        ...signatures,
      ].join("\n");

    case "PROTOKOLL":
      return [
        ...header,
        "## Protokollkopf",
        ...fields,
        "Teilnehmer / Verteiler: ___________________________________________",
        "",
        "## Feststellungen und Mess- / Besprechungsergebnisse",
        ...rows,
        "",
        "## Fachliche Prüfpunkte",
        ...checks,
        "",
        "## Abweichungen, Vorbehalte und Maßnahmen",
        "Festgestellte Abweichung / Vorbehalt:",
        "___________________________________________________________________",
        ...actionLines(),
        "",
        "## Protokollergebnis",
        ...result,
        "☐ ohne Vorbehalt  ☐ mit Auflagen  ☐ nicht freigegeben",
        "",
        "## Anlagen",
        "☐ Fotos  ☐ Plan / Skizze  ☐ Messdaten  ☐ Prüfzeugnis  ☐ Schriftverkehr",
        "",
        "## Bestätigung",
        ...signatures,
      ].join("\n");

    case "CHECKLISTE":
      return [
        ...header,
        "## Prüfobjekt und Prüfvoraussetzungen",
        ...fields,
        "",
        "## Fachcheck",
        ...checks,
        "",
        "## Detaillierte Kontrollpositionen",
        ...rows,
        "",
        "## Festgestellte Mängel / Abweichungen",
        "Mangel / Ort / Auswirkung: ________________________________________",
        "Sofortmaßnahme: ____________________________________________________",
        "Verantwortlich / Frist: ___________________________________________",
        "",
        "## Prüfentscheidung",
        ...result,
        "☐ freigegeben  ☐ mit Auflagen freigegeben  ☐ gesperrt / Nachprüfung",
        "Nachprüfung am: ____________________  durch: ________________________",
        "",
        "## Prüferbestätigung",
        ...signatures,
      ].join("\n");

    case "REGISTER":
      return [
        ...header,
        "## Registersteuerung",
        ...fields,
        "Fortschreibungsstand / Revision: _________________________________",
        "",
        "## Registereinträge",
        ...tableLines(blueprint.columns, 8),
        "",
        "## Konsistenz- und Vollständigkeitsprüfung",
        ...checks,
        "",
        "## Auswertung / überfällige oder kritische Einträge",
        ...result,
        "Nächste Fortschreibung: ___________________________________________",
        "",
        "## Registerfreigabe",
        ...signatures,
      ].join("\n");

    case "PLAN":
      return [
        ...header,
        "## Planungsgrundlagen",
        ...fields,
        "",
        "## Ziel, Geltungsbereich und Randbedingungen",
        "Planungsziel: ______________________________________________________",
        "Geltungsbereich / Ausschlüsse: ____________________________________",
        "Verbindliche Grundlagen: __________________________________________",
        "",
        "## Geplante Abläufe, Verantwortungen und Termine",
        ...rows,
        "",
        "## Ressourcen und Schnittstellen",
        "Personal / Qualifikation: _________________________________________",
        "Geräte / Material / Unterlagen: ___________________________________",
        "Schnittstellen / Vorleistungen: ___________________________________",
        "",
        "## Freigabekriterien und Überwachung",
        ...checks,
        "Kontrollrhythmus / Bericht: _______________________________________",
        "",
        "## Planfreigabe",
        ...result,
        ...signatures,
      ].join("\n");

    case "BERICHT":
      return [
        ...header,
        "## Berichtsrahmen",
        ...fields,
        "",
        "## Kurzfassung und Managementbewertung",
        "Ausgangslage: ______________________________________________________",
        "Wichtigstes Ergebnis: _____________________________________________",
        "Gesamttrend: ☐ positiv  ☐ stabil  ☐ kritisch",
        "",
        "## Daten, Leistung und Feststellungen",
        ...rows,
        "",
        "## Analyse von Abweichungen und Auswirkungen",
        "Ursache: ___________________________________________________________",
        "Auswirkung auf Leistung / Qualität: _______________________________",
        "Auswirkung auf Termin / Kosten: ___________________________________",
        "",
        "## Plausibilitätsprüfung",
        ...checks,
        "",
        "## Prognose, Entscheidung und Maßnahmen",
        ...result,
        ...actionLines(),
        "",
        "## Berichtsfreigabe",
        ...signatures,
      ].join("\n");

    case "NACHWEIS":
      return [
        ...header,
        "## Nachweisbezug",
        ...fields,
        "",
        "## Erfasste Leistung, Menge, Zeit oder Prüfung",
        ...tableLines(blueprint.columns, 7),
        "",
        "## Prüfbarkeit und Belege",
        ...checks,
        "Beleg- / Foto- / Lieferschein-Nummern: ____________________________",
        "Zugehörige LV-Position / Kostenstelle: ____________________________",
        "",
        "## Summen und anerkanntes Ergebnis",
        ...result,
        "Kontrollsumme / Gesamtmenge: ______________________________________",
        "Vorbehalt / nicht anerkannter Anteil: _____________________________",
        "",
        "## Bestätigung",
        ...signatures,
      ].join("\n");

    case "UNTERWEISUNG":
      return [
        ...header,
        "## Unterweisungsrahmen",
        ...fields,
        "",
        "## Gefährdungen, Regeln und Schutzmaßnahmen",
        ...rows,
        "",
        "## Praktisch vermittelte Kernpunkte",
        ...checks,
        "",
        "## Verständnis- und Wirksamkeitskontrolle",
        "Rückfrage / Praxisübung: __________________________________________",
        "Ergebnis der Verständniskontrolle: ________________________________",
        "Erforderliche Nachunterweisung: ☐ nein  ☐ ja, bis _________________",
        "",
        "## Teilnehmernachweis",
        "Name  |  Firma / Funktion  |  Unterweisungssprache  |  Unterschrift",
        "1. _________________________________________________________________",
        "2. _________________________________________________________________",
        "3. _________________________________________________________________",
        "4. _________________________________________________________________",
        "5. _________________________________________________________________",
        "",
        "## Freigabe",
        ...result,
        ...signatures,
      ].join("\n");

    case "FORMULAR":
    default:
      return [
        ...header,
        "## Vorgangs- und Fachdaten",
        ...fields,
        "",
        "## Erfassungspositionen",
        ...tableLines(blueprint.columns, 6),
        "",
        "## Fachliche Pflichtprüfung",
        ...checks,
        "",
        "## Ergänzende Angaben / Begründung",
        "___________________________________________________________________",
        "___________________________________________________________________",
        "",
        "## Bearbeitungsergebnis",
        ...result,
        "Status: ☐ Entwurf  ☐ geprüft  ☐ freigegeben  ☐ zurückgewiesen",
        "",
        "## Bearbeitung und Freigabe",
        ...signatures,
      ].join("\n");
  }
}

const usedBlueprintKeys = new Set<string>();
const missingBlueprints: string[] = [];

export const VORLAGEN_CATALOG: VorlageCatalogEntry[] = VORLAGEN_CATEGORIES.flatMap(
  (category) =>
    category.topics.map((topic) => {
      const blueprintKey = `${category.key}\u0000${topic}`;
      const blueprint = VORLAGEN_BLUEPRINTS_BY_KEY.get(blueprintKey);
      if (!blueprint) {
        missingBlueprints.push(`${category.label}: ${topic}`);
        throw new Error(`Professionelle Vorlage fehlt: ${category.label} / ${topic}`);
      }

      usedBlueprintKeys.add(blueprintKey);
      const slug = `rlc-${category.key}-${slugify(topic)}`;
      const layoutLabel = VORLAGE_LAYOUT_LABELS[blueprint.layout];
      return {
        slug,
        title: topic,
        description:
          `${layoutLabel} für ${topic}. Fachfelder: ` +
          `${blueprint.fields.slice(0, 4).join(", ")}.`,
        categoryKey: category.key,
        categoryLabel: category.label,
        language: "de" as const,
        outputType: "DOCUMENT" as const,
        content: renderProfessionalContent(blueprint, slug),
        variables: VARIABLES,
        tags: [
          category.label,
          topic,
          layoutLabel,
          ...topic
            .toLowerCase()
            .split(/[\s/–-]+/)
            .filter((value) => value.length >= 4)
            .slice(0, 5),
        ],
      };
    })
);

export const VORLAGEN_CATALOG_COUNT = VORLAGEN_CATALOG.length;

if (VORLAGEN_CATALOG_COUNT < 300) {
  throw new Error(`Vorlagen-Katalog unvollständig: ${VORLAGEN_CATALOG_COUNT}`);
}

const unusedBlueprints = VORLAGEN_BLUEPRINTS.filter(
  (blueprint) => !usedBlueprintKeys.has(`${blueprint.categoryKey}\u0000${blueprint.title}`)
);

if (missingBlueprints.length || unusedBlueprints.length) {
  throw new Error(
    `Vorlagen-Zuordnung fehlerhaft. Fehlend: ${missingBlueprints.join(", ") || "keine"}; ` +
      `unbenutzt: ${unusedBlueprints
        .map((blueprint) => `${blueprint.categoryKey}/${blueprint.title}`)
        .join(", ") || "keine"}`
  );
}

const professionalSignatures = new Set(
  VORLAGEN_BLUEPRINTS.map((blueprint) =>
    JSON.stringify([
      blueprint.layout,
      blueprint.fields,
      blueprint.columns,
      blueprint.checks,
      blueprint.resultLabel,
      blueprint.signers,
    ])
  )
);

if (professionalSignatures.size !== VORLAGEN_BLUEPRINTS.length) {
  throw new Error(
    `Vorlagen-Katalog enthält wiederholte Fachstrukturen: ` +
      `${VORLAGEN_BLUEPRINTS.length - professionalSignatures.size}`
  );
}
