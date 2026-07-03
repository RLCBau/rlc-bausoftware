export type RlcRegieParsed = {
  datum?: string;
  baustelle?: string;
  wetter?: string;
  taetigkeit?: string;
  mitarbeiter?: { name: string; hours: string }[];
  geraete?: { name: string; hours: string }[];
  material?: { name: string; quantity: string; unit: string }[];
  bemerkung?: string;
  warnings?: string[];
};

export type RlcLieferscheinParsed = {
  datum?: string;
  lieferscheinNr?: string;
  lieferant?: string;
  baustelle?: string;
  fahrer?: string;
  kennzeichen?: string;
  material?: { name: string; quantity: string; unit: string }[];
  bemerkung?: string;
  warnings?: string[];
};

export type RlcFotosParsed = {
  datum?: string;
  baustelle?: string;
  ort?: string;
  kategorie?: string;
  beschreibung?: string;
  mangel?: string;
  lvPos?: string;
  bemerkung?: string;
  warnings?: string[];
};

function clean(v: any) {
  return String(v || "").trim();
}

function escRx(v: string) {
  return clean(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normNum(v: any) {
  const s = clean(v).replace(/\s/g, "").replace(",", ".").replace(/[^\d.\-]/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 100) / 100);
}

function normalizeUnit(v: string) {
  const x = clean(v);
  if (/^m2$/i.test(x)) return "m²";
  if (/^m3$/i.test(x)) return "m³";
  if (/^(stk|st|stück|stueck)$/i.test(x)) return "Stk";
  if (/^std$/i.test(x)) return "h";
  if (/^to$/i.test(x)) return "t";
  return x;
}

function pick(input: string, keys: string[]) {
  for (const k of keys) {
    const rx = new RegExp("(?:^|\\n)\\s*" + escRx(k) + "\\s*[:=\\-]\\s*([^\\n;]+)", "i");
    const m = input.match(rx);
    if (m?.[1]) return clean(m[1]);
  }
  return "";
}

function parseDate(input: string) {
  return (
    pick(input, ["datum", "tag"]) ||
    clean(input.match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/)?.[1])
  );
}

function parseMaterials(input: string) {
  const out: { name: string; quantity: string; unit: string }[] = [];
  const units = "m²|m2|m³|m3|m|stk|st|stück|stueck|psch|h|std|to|t|kg|lfm";

  for (const raw of input.split(/\r?\n/)) {
    let line = clean(raw);
    if (!line) continue;

    if (
      /^(mitarbeiter|personal|arbeiter|gerät|geraet|geräte|geraete|maschine|bagger|fahrer|kennzeichen|wetter|tätigkeit|taetigkeit|datum|baustelle|lieferant|lieferschein)\s*[:=\-]/i.test(line)
    ) {
      continue;
    }

    const hasMaterialPrefix = /^material\s*[:=\-]/i.test(line);
    line = line.replace(/^material\s*[:=\-]\s*/i, "");

    const rx = new RegExp("^(.+?)\\s+([\\d.,]+)\\s*(" + units + ")$", "i");
    const m = line.match(rx);
    if (!m) continue;

    const unit = normalizeUnit(m[3]);

    if (!hasMaterialPrefix && /^h$/i.test(unit)) continue;

    out.push({
      name: clean(m[1]),
      quantity: normNum(m[2]),
      unit,
    });
  }

  return out;
}

function parsePeopleHours(input: string, keys: string[]) {
  const out: { name: string; hours: string }[] = [];
  const keyRx = keys.map(escRx).join("|");

  for (const raw of input.split(/\r?\n/)) {
    const line = clean(raw);
    if (!line) continue;

    const rx = new RegExp("^(?:" + keyRx + ")\\s*[:=\\-]\\s*(.+?)\\s+([\\d.,]+)\\s*(?:h|std|stunden)?$", "i");
    const m = line.match(rx);

    if (m) {
      out.push({ name: clean(m[1]), hours: normNum(m[2]) });
    }
  }

  return out;
}

function rlcS(v: any): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function rlcLower(v: any): string {
  return rlcS(v).toLowerCase();
}

function rlcDate(input: string): string {
  const s = rlcS(input);
  const m = s.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const iso = s.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return iso ? iso[1] : "";
}

function rlcTime(v: any): string {
  const s = rlcS(v);
  const m = s.match(/\b(\d{1,2})(?::|\.| Uhr)?(\d{2})?\b/);
  if (!m) return "";
  const h = Math.max(0, Math.min(23, Number(m[1] || 0)));
  const min = Math.max(0, Math.min(59, Number(m[2] || 0)));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function rlcNum(v: any): string {
  const s = rlcS(v).replace(",", ".");
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? m[0] : "";
}

function rlcPick(text: string, re: RegExp): string {
  const m = text.match(re);
  return rlcS(m?.[1] || "");
}

export function parseRlcRegie(inputRaw: any): RlcRegieParsed {
  const text = rlcS(inputRaw);
  const low = rlcLower(text);

  const vonBis =
    text.match(/\b(?:heute\s*)?(?:von\s*)?(\d{1,2})(?::(\d{2}))?\s*(?:uhr)?\s*(?:bis|-)\s*(\d{1,2})(?::(\d{2}))?\s*(?:uhr)?/i) ||
    text.match(/\barbeitsbeginn\s*[:=]?\s*(\d{1,2})(?::(\d{2}))?.*?\barbeitsende\s*[:=]?\s*(\d{1,2})(?::(\d{2}))?/i);

  const pauseRaw = rlcPick(
    text,
    /\bpause\s*(?:1)?\s*(?:\:|=)?\s*(eine|einer|\d+(?:[,.]\d+)?|\d{1,2}:\d{2})\s*(?:stunde|stunden|std|h|minuten|min)?/i
  );

  const pause1 =
    pauseRaw.includes(":")
      ? pauseRaw
      : `${String(Math.round(Number(String(pauseRaw || "1").replace(",", ".").replace(/eine|einer/i, "1")) || 1)).padStart(2, "0")}:00`;

  const baustelle = rlcPick(
    text,
    /\b(?:baustelle|kostenstelle|projekt)\s*[:=]?\s*(BA[- ]?\d{4}[- ]?\d{3}|BA\s*Test|[A-ZÄÖÜ]{1,5}[- ]?\d{2,6}(?:[- ]?\d{1,6})?)\b/i
  );
  const taetigkeit = rlcPick(text, /\b(?:tätigkeit|taetigkeit|leistung|arbeit)\s*[:=]?\s*(.+?)(?=\b(?:mitarbeiter|arbeiter|bagger|maschine|gerät|geraet|material|$))/i);

  const mitarbeiterCount = rlcPick(text, /\b(\d+)\s*(?:mitarbeiter|arbeiter|personen|mann)\b/i);
  const mitarbeiterName = rlcPick(text, /\bmitarbeiter\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\- ]+?)\s+\d+(?:[,.]\d+)?\s*(?:stunden|std|h)\b/i);
  const mitarbeiterStd =
    rlcPick(text, /\bmitarbeiter\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\- ]+?\s+(\d+(?:[,.]\d+)?)\s*(?:stunden|std|h)\b/i) ||
    rlcPick(text, /\b(\d+(?:[,.]\d+)?)\s*(?:stunden|std|h)\b/i);

  const machineName =
    rlcPick(text, /\b((?:bagger|radlader|lkw|walze|rüttelplatte|ruettelplatte|kompressor|dumper)(?:\s+\d+(?:[,.]\d+)?\s*(?:t|tonnen))?)\s+\d+(?:[,.]\d+)?\s*(?:stunden|std|h)\b/i) ||
    rlcPick(text, /\b(?:maschine|gerät|geraet)\s*[:=]?\s*([A-Za-zÄÖÜäöüß0-9 ,.\-\/]+?)(?=\s+\d+(?:[,.]\d+)?\s*(?:stunden|std|h)|$)/i);

  const machineStd = rlcPick(text, /\b(?:bagger|radlader|lkw|walze|rüttelplatte|ruettelplatte|kompressor|dumper|maschine|gerät|geraet)[A-Za-zÄÖÜäöüß0-9 ,.\-\/]*?\s+(\d+(?:[,.]\d+)?)\s*(?:stunden|std|h)\b/i);

  const doc: any = {
    datum: rlcDate(text),
    arbeitsbeginn: vonBis ? `${String(vonBis[1]).padStart(2, "0")}:${String(vonBis[2] || "00").padStart(2, "0")}` : "",
    arbeitsende: vonBis ? `${String(vonBis[3]).padStart(2, "0")}:${String(vonBis[4] || "00").padStart(2, "0")}` : "",
    pause1: pauseRaw ? pause1 : "",
    pause2: "",
    wetter: rlcPick(text, /\bwetter\s*[:=]?\s*([A-Za-zÄÖÜäöüß ]+?)(?=\.|,|;|$)/i),
    kostenstelle: baustelle,
    ort: baustelle,
    taetigkeit: taetigkeit || text,
    bemerkung: taetigkeit || text,
    mitarbeiter: mitarbeiterName
      ? [{ name: mitarbeiterName, stunden: mitarbeiterStd || "", hours: mitarbeiterStd || "" }]
      : mitarbeiterCount
      ? [{ name: `${mitarbeiterCount} Mitarbeiter`, anzahl: mitarbeiterCount, stunden: mitarbeiterStd || "", hours: mitarbeiterStd || "" }]
      : [],
    geraete: machineName
      ? [{ name: machineName, stunden: machineStd || mitarbeiterStd || "", hours: machineStd || mitarbeiterStd || "" }]
      : /\bbagger\b/i.test(text)
      ? [{ name: "Bagger", stunden: machineStd || mitarbeiterStd || "", hours: machineStd || mitarbeiterStd || "" }]
      : [],
    material: [],
    warnings: [],
  };

  if (!doc.datum) doc.warnings.push("Datum fehlt.");
  if (!doc.arbeitsbeginn) doc.warnings.push("Arbeitsbeginn fehlt.");
  if (!doc.arbeitsende) doc.warnings.push("Arbeitsende fehlt.");
  if (!doc.mitarbeiter?.length && !doc.geraete?.length) doc.warnings.push("Keine Mitarbeiter/Geräte/Material erkannt.");

  return doc;
}

export function parseRlcLieferschein(inputRaw: any): RlcLieferscheinParsed {
  const text = rlcS(inputRaw);

  const lieferant = rlcPick(text, /\blieferant\s*[:=]?\s*([A-Za-zÄÖÜäöüß0-9 .&\-]+?)(?=,|\.|;|\s+material\b|\s+menge\b|\s+fahrer\b|\s+kennzeichen\b|$)/i);
  const material = rlcPick(text, /\bmaterial\s*[:=]?\s*([A-Za-zÄÖÜäöüß0-9\/ .\-]+?)(?=,|\.|;|\s+menge\b|\s+fahrer\b|\s+kennzeichen\b|$)/i);
  const menge = rlcPick(text, /\bmenge\s*[:=]?\s*(\d+(?:[,.]\d+)?)\s*(tonnen|t|kg|m3|m³|m2|m²|m|stk|st)?/i);
  const einheit = rlcPick(text, /\bmenge\s*[:=]?\s*\d+(?:[,.]\d+)?\s*(tonnen|t|kg|m3|m³|m2|m²|m|stk|st)\b/i);
  const fahrer = rlcPick(text, /\bfahrer\s*[:=]?\s*([A-Za-zÄÖÜäöüß\- ]+?)(?=,|\.|;|\s+kennzeichen\b|$)/i);
  const kennzeichen = rlcPick(text, /\bkennzeichen\s*[:=]?\s*([A-ZÄÖÜ]{1,3}[- ]?[A-ZÄÖÜ]{1,3}[- ]?\d{1,5})\b/i);
  const baustelle = rlcPick(text, /\b(?:baustelle|kostenstelle|projekt)\s*[:=]?\s*([A-ZÄÖÜ]{1,5}[- ]?\d{2,6}(?:[- ]?\d{1,6})?|BA\s*Test)\b/i);

  const doc: any = {
    datum: rlcDate(text),
    lieferscheinNr: rlcPick(text, /\b(?:lieferschein(?:nummer)?|ls)\s*(?:nr\.?|nummer)?\s*[:=]?\s*([A-Za-z0-9\-\/]+)/i),
    lieferant,
    baustelle,
    fahrer,
    kennzeichen,
    bemerkung: text,
    material: material ? [{ name: material, quantity: menge, unit: einheit === "tonnen" ? "t" : einheit }] : [],
    warnings: [],
  };

  if (!doc.lieferant) doc.warnings.push("Lieferant fehlt.");
  if (!doc.datum) doc.warnings.push("Datum fehlt.");
  if (!doc.material?.length) doc.warnings.push("Kein Material erkannt.");

  return doc;
}

export function parseRlcFotos(inputRaw: any): RlcFotosParsed {
  const text = rlcS(inputRaw);

  const kostenstelle = rlcPick(text, /\b(?:kostenstelle|baustelle|projekt)\s*[:=]?\s*([A-ZÄÖÜ]{1,5}[- ]?\d{2,6}(?:[- ]?\d{1,6})?|BA\s*Test)\b/i);
  const gewerk =
    rlcPick(text, /\b(kanalbau|kabelbau|tiefbau|pflaster|asphalt|rohrgraben|wasserleitung|glasfaser|strom|gas)\b/i) ||
    (/(rohrgraben|leitung|verfüll|verfuell)/i.test(text) ? "Tiefbau" : "");

  const kategorie =
    /(mangel|schaden|defekt)/i.test(text) ? "Mangel" :
    /(beweissicherung|dokumentiert|dokumentation|foto)/i.test(text) ? "Beweissicherung" :
    /(fortschritt|baufortschritt)/i.test(text) ? "Fortschritt" : "Notiz";

  const status =
    /(offen|nicht verfüllt|nicht verfuellt|prüfen|pruefen)/i.test(text) ? "prüfen" :
    /(erledigt|fertig|abgeschlossen)/i.test(text) ? "erledigt" : "offen";

  const tags: string[] = [];
  if (/rohrgraben/i.test(text)) tags.push("Rohrgraben");
  if (/leitung/i.test(text)) tags.push("Leitung");
  if (/verfüll|verfuell/i.test(text)) tags.push("Verfüllung");
  if (/beweissicherung|dokumentiert/i.test(text)) tags.push("Beweissicherung");

  const doc: any = {
    datum: rlcDate(text),
    kostenstelle,
    ortAbschnitt: kostenstelle,
    kategorie,
    gewerk,
    status,
    tags,
    beschreibung: text,
    bemerkung: text,
    warnings: [],
  };

  if (!doc.kostenstelle) doc.warnings.push("Kostenstelle fehlt.");
  if (!doc.gewerk) doc.warnings.push("Gewerk nicht erkannt.");

  return doc;
}



