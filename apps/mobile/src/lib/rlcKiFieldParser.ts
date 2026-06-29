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

export function parseRlcRegie(inputRaw: any): RlcRegieParsed {
  const input = clean(inputRaw);

  const doc: RlcRegieParsed = {
    datum: parseDate(input),
    baustelle: pick(input, ["baustelle", "projekt", "bauvorhaben"]),
    wetter: pick(input, ["wetter"]),
    taetigkeit: pick(input, ["tätigkeit", "taetigkeit", "leistung", "arbeit", "beschreibung"]),
    mitarbeiter: parsePeopleHours(input, ["mitarbeiter", "personal", "arbeiter"]),
    geraete: parsePeopleHours(input, ["gerät", "geraet", "geräte", "geraete", "maschine", "bagger"]),
    material: parseMaterials(input),
    bemerkung: pick(input, ["bemerkung", "notiz", "hinweis"]) || input,
  };

  const warnings: string[] = [];
  if (!doc.datum) warnings.push("Datum fehlt.");
  if (!doc.taetigkeit && !doc.bemerkung) warnings.push("Tätigkeit/Beschreibung fehlt.");
  if (!doc.mitarbeiter?.length && !doc.geraete?.length && !doc.material?.length) {
    warnings.push("Keine Mitarbeiter/Geräte/Material erkannt.");
  }

  doc.warnings = warnings;
  return doc;
}

export function parseRlcLieferschein(inputRaw: any): RlcLieferscheinParsed {
  const input = clean(inputRaw);

  const doc: RlcLieferscheinParsed = {
    datum: parseDate(input),
    lieferscheinNr: pick(input, ["lieferschein", "lieferscheinnummer", "lieferschein-nr", "ls-nr", "nummer"]),
    lieferant: pick(input, ["lieferant", "firma"]),
    baustelle: pick(input, ["baustelle", "projekt", "bauvorhaben"]),
    fahrer: pick(input, ["fahrer"]),
    kennzeichen: pick(input, ["kennzeichen", "kfz", "lkw"]),
    material: parseMaterials(input),
    bemerkung: pick(input, ["bemerkung", "notiz", "hinweis"]) || input,
  };

  const warnings: string[] = [];
  if (!doc.lieferant) warnings.push("Lieferant fehlt.");
  if (!doc.datum) warnings.push("Datum fehlt.");
  if (!doc.material?.length) warnings.push("Kein Material erkannt.");

  doc.warnings = warnings;
  return doc;
}

export function parseRlcFotos(inputRaw: any): RlcFotosParsed {
  const input = clean(inputRaw);

  const doc: RlcFotosParsed = {
    datum: parseDate(input),
    baustelle: pick(input, ["baustelle", "projekt", "bauvorhaben"]),
    ort: pick(input, ["ort", "station", "bereich"]),
    kategorie: pick(input, ["kategorie", "typ"]),
    beschreibung: pick(input, ["beschreibung", "foto", "text"]),
    mangel: pick(input, ["mangel", "schaden", "problem"]),
    lvPos: pick(input, ["lv", "position", "pos"]),
    bemerkung: pick(input, ["bemerkung", "notiz", "hinweis"]) || input,
  };

  const warnings: string[] = [];
  if (!doc.beschreibung && !doc.bemerkung) warnings.push("Beschreibung fehlt.");
  if (!doc.ort && !doc.baustelle) warnings.push("Ort/Baustelle fehlt.");

  doc.warnings = warnings;
  return doc;
}
