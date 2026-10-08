export type RlcSmartRow = {
  pos: string;
  text: string;
  unit: string;
  qty: string;
  ep: string;
  gp?: string;
};

export type RlcSmartDoc = {
  title?: string;
  customerName?: string;
  address?: string;
  email?: string;
  phone?: string;
  baustelle?: string;
  datum?: string;
  leistungszeitraum?: string;
  rechnungNr?: string;
  angebotNr?: string;
  note?: string;
  rows: RlcSmartRow[];
  warnings?: string[];
};

function clean(v: any) {
  return String(v || "").trim();
}

function normNum(v: any) {
  let s = clean(v);
  if (!s) return "";

  s = s
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/[^\d,.\-]/g, "");

  if (!s) return "";

  // Deutsch: 1.212,50 -> 1212.50
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 100) / 100);
}

function numVal(v: any) {
  const n = Number(normNum(v));
  return Number.isFinite(n) ? n : 0;
}

function pickField(input: string, keys: string[]) {
  for (const k of keys) {
    const rx = new RegExp(`(?:^|\\n)\\s*${k}\\s*[:=\\-]\\s*([^\\n;]+)`, "i");
    const m = input.match(rx);
    if (m?.[1]) return clean(m[1]);
  }
  return "";
}

function parseDate(input: string) {
  const explicit = pickField(input, ["datum", "rechnungsdatum", "angebotsdatum"]);
  if (explicit) return explicit;

  const m = input.match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/);
  return m?.[1] ? clean(m[1]) : "";
}

function parsePeriod(input: string) {
  return (
    pickField(input, [
      "leistungszeitraum",
      "zeitraum",
      "ausführungszeitraum",
      "ausfuehrungszeitraum",
    ]) || ""
  );
}

function isUnit(v: string) {
  return /^(m|m2|m²|m3|m³|stk|st|stück|stueck|psch|h|std|to|t|kg|lfm)$/i.test(clean(v));
}

function normalizeUnit(v: string) {
  const x = clean(v);
  if (/^m2$/i.test(x)) return "m²";
  if (/^m3$/i.test(x)) return "m³";
  if (/^(stk|st|stück|stueck)$/i.test(x)) return "Stk";
  if (/^std$/i.test(x)) return "h";
  return x;
}

function makeRow(pos: any, text: any, qty: any, unit: any, ep: any, gp?: any): RlcSmartRow | null {
  const q = normNum(qty);
  let e = normNum(ep);
  const g = normNum(gp);
  const qn = numVal(q);
  const gn = numVal(g);

  if (!e && qn > 0 && gn > 0) {
    e = String(Math.round((gn / qn) * 100) / 100);
  }

  const row = {
    pos: clean(pos),
    text: clean(text),
    qty: q,
    unit: normalizeUnit(clean(unit)),
    ep: e,
    gp: g,
  };

  if (!row.text && !row.qty && !row.unit && !row.ep) return null;
  return row;
}

function parseCsvLike(line: string): RlcSmartRow | null {
  const parts = line.split(/[;|]/).map((x) => x.trim()).filter(Boolean);
  if (parts.length < 4) return null;

  const first = parts[0].replace(/^pos\.?\s*/i, "");
  const unitIdx = parts.findIndex((x) => isUnit(x));

  if (unitIdx >= 0) {
    const pos = /^\d+[\w.]*$/.test(first) ? first : "";
    const textStart = pos ? 1 : 0;
    const text = parts.slice(textStart, unitIdx).join(" ");
    const qty = parts[unitIdx + 1] || parts[unitIdx - 1] || "";
    const ep = parts[unitIdx + 2] || "";
    const gp = parts[unitIdx + 3] || "";
    return makeRow(pos, text, qty, parts[unitIdx], ep, gp);
  }

  // Schema: Pos; Text; Menge; Einheit; EP; GP
  if (parts.length >= 5 && isUnit(parts[3])) {
    return makeRow(first, parts[1], parts[2], parts[3], parts[4], parts[5]);
  }

  return null;
}

function parseLine(lineRaw: string, fallbackPos: number): RlcSmartRow | null {
  let line = lineRaw
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-•]\s*/, "")
    .trim();

  if (!line) return null;

  const csv = parseCsvLike(line);
  if (csv) return csv;

  line = line.replace(/^pos\.?\s*/i, "");

  // 1 Rohrgraben herstellen 25 m 48,50
  let m = line.match(
    /^(\d+[\w.]*)\s+(.+?)\s+([\d.,]+)\s*(m²|m2|m³|m3|m|stk|st|stück|stueck|psch|h|std|to|t|kg|lfm)\s*(?:x|à|a|@)?\s*([\d.,]+)\s*(?:€)?(?:\s*=\s*([\d.,]+)\s*€?)?$/i
  );
  if (m) return makeRow(m[1], m[2], m[3], m[4], m[5], m[6]);

  // 1 Rohrgraben herstellen 25m x 48,50
  m = line.match(
    /^(\d+[\w.]*)\s+(.+?)\s+([\d.,]+)(m²|m2|m³|m3|m|stk|st|stück|stueck|psch|h|std|to|t|kg|lfm)\s*(?:x|à|a|@)\s*([\d.,]+)\s*(?:€)?(?:\s*=\s*([\d.,]+)\s*€?)?$/i
  );
  if (m) return makeRow(m[1], m[2], m[3], m[4], m[5], m[6]);

  // 1 Rohrgraben herstellen m 25 48,50
  m = line.match(
    /^(\d+[\w.]*)\s+(.+?)\s+(m²|m2|m³|m3|m|stk|st|stück|stueck|psch|h|std|to|t|kg|lfm)\s+([\d.,]+)\s+([\d.,]+)\s*(?:€)?(?:\s+([\d.,]+)\s*€?)?$/i
  );
  if (m) return makeRow(m[1], m[2], m[4], m[3], m[5], m[6]);

  // Pos mit GP ohne EP: 7 Entsorgung Aushub 12 m³ = 780,00
  m = line.match(
    /^(\d+[\w.]*)\s+(.+?)\s+([\d.,]+)\s*(m²|m2|m³|m3|m|stk|st|stück|stueck|psch|h|std|to|t|kg|lfm)\s*=\s*([\d.,]+)\s*€?$/i
  );
  if (m) return makeRow(m[1], m[2], m[3], m[4], "", m[5]);

  // Ohne Pos mit GP ohne EP: Entsorgung Aushub 12 m³ = 780,00
  m = line.match(
    /^(.+?)\s+([\d.,]+)\s*(m²|m2|m³|m3|m|stk|st|stück|stueck|psch|h|std|to|t|kg|lfm)\s*=\s*([\d.,]+)\s*€?$/i
  );
  if (m) return makeRow(String(fallbackPos), m[1], m[2], m[3], "", m[4]);
  // Ohne Pos: Rohrgraben herstellen 25 m 48,50
  m = line.match(
    /^(.+?)\s+([\d.,]+)\s*(m²|m2|m³|m3|m|stk|st|stück|stueck|psch|h|std|to|t|kg|lfm)\s*(?:x|à|a|@)?\s*([\d.,]+)\s*(?:€)?(?:\s*=\s*([\d.,]+)\s*€?)?$/i
  );
  if (m) return makeRow(String(fallbackPos), m[1], m[2], m[3], m[4], m[5]);

  // Ohne Pos: 25 m Rohrgraben herstellen 48,50
  m = line.match(
    /^([\d.,]+)\s*(m²|m2|m³|m3|m|stk|st|stück|stueck|psch|h|std|to|t|kg|lfm)\s+(.+?)\s+([\d.,]+)\s*(?:€)?(?:\s*=\s*([\d.,]+)\s*€?)?$/i
  );
  if (m) return makeRow(String(fallbackPos), m[3], m[1], m[2], m[4], m[5]);

  return null;
}

function normalizeRowPositions(rows: RlcSmartRow[]) {
  const seen = new Set<string>();
  let hasDuplicate = false;

  for (const r of rows) {
    const p = clean(r.pos);
    if (p && seen.has(p)) {
      hasDuplicate = true;
      break;
    }
    if (p) seen.add(p);
  }

  if (!hasDuplicate) return rows;

  return rows.map((r, i) => ({
    ...r,
    pos: String(i + 1),
  }));
}

function parseQtyUnit(v: string) {
  const s = clean(v);
  const m = s.match(/([\d.,]+)\s*(m²|m2|m³|m3|m|stk|st|stück|stueck|psch|h|std|to|t|kg|lfm)?/i);
  return {
    qty: m?.[1] ? normNum(m[1]) : "",
    unit: m?.[2] ? normalizeUnit(m[2]) : "",
  };
}

function parseMoneyLabel(line: string) {
  const m = line.match(/(?:ep|einzelpreis|e-preis|preis|gp|gesamtpreis|gesamt|betrag)\s*[:=\-]?\s*([\d.,]+)\s*€?/i);
  return m?.[1] ? normNum(m[1]) : "";
}

function looksLikeOnlyPos(line: string) {
  return /^(?:pos\.?\s*)?\d+[\w.]*$/i.test(clean(line));
}

function parseOnlyPos(line: string) {
  return clean(line).replace(/^pos\.?\s*/i, "");
}

function isFieldLineForOcr(line: string) {
  return /^(menge|einheit|ep|einzelpreis|e-preis|gp|gesamtpreis|gesamt|betrag|text|kurztext|leistung|beschreibung)\s*[:=\-]?/i.test(clean(line));
}

function parseOcrBlockRows(input: string): RlcSmartRow[] {
  const rawLines = input
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const rows: RlcSmartRow[] = [];

  let cur: any = null;

  function ensure() {
    if (!cur) cur = { pos: "", textParts: [], qty: "", unit: "", ep: "", gp: "" };
    return cur;
  }

  function flush() {
    if (!cur) return;

    const text = clean((cur.textParts || []).join(" "));
    const row = makeRow(
      cur.pos || String(rows.length + 1),
      text,
      cur.qty,
      cur.unit,
      cur.ep,
      cur.gp
    );

    if (row && (row.text || row.qty || row.ep || row.gp)) {
      rows.push(row);
    }

    cur = null;
  }

  for (const lineRaw of rawLines) {
    const line = clean(lineRaw.replace(/\s+/g, " "));
    if (!line) continue;

    // normale Formularfelder überspringen
    if (/^\s*(kunde|auftraggeber|firma|adresse|anschrift|email|e-mail|mail|telefon|tel|baustelle|projekt|bauvorhaben|titel|angebot|rechnung|betreff|datum|leistungszeitraum)\s*[:=]/i.test(line)) {
      continue;
    }

    // nuova posizione: "001" oppure "Pos 001"
    if (looksLikeOnlyPos(line)) {
      if (cur && (cur.textParts?.length || cur.qty || cur.ep || cur.gp)) flush();
      cur = { pos: parseOnlyPos(line), textParts: [], qty: "", unit: "", ep: "", gp: "" };
      continue;
    }

    // Text / Kurztext / Leistung
    let m = line.match(/^(?:text|kurztext|leistung|beschreibung)\s*[:=\-]\s*(.+)$/i);
    if (m) {
      ensure().textParts.push(clean(m[1]));
      continue;
    }

    // Menge: 25 m oppure Menge 25,00
    m = line.match(/^menge\s*[:=\-]?\s*(.+)$/i);
    if (m) {
      const q = parseQtyUnit(m[1]);
      ensure().qty = q.qty || ensure().qty;
      ensure().unit = q.unit || ensure().unit;
      continue;
    }

    // Einheit: m
    m = line.match(/^einheit\s*[:=\-]?\s*(.+)$/i);
    if (m) {
      const u = clean(m[1]).split(/\s+/)[0];
      if (isUnit(u)) ensure().unit = normalizeUnit(u);
      continue;
    }

    // EP / Einzelpreis
    m = line.match(/^(?:ep|einzelpreis|e-preis|preis)\s*[:=\-]?\s*(.+)$/i);
    if (m) {
      ensure().ep = normNum(m[1]);
      continue;
    }

    // GP / Gesamtpreis / Betrag
    m = line.match(/^(?:gp|gesamtpreis|gesamt|betrag)\s*[:=\-]?\s*(.+)$/i);
    if (m) {
      ensure().gp = normNum(m[1]);
      continue;
    }

    // fallback: se siamo dentro una posizione OCR, riga libera = testo
    if (cur && !isFieldLineForOcr(line)) {
      cur.textParts.push(line);
      continue;
    }
  }

  flush();

  return rows;
}

function mergeRows(primary: RlcSmartRow[], secondary: RlcSmartRow[]) {
  const out: RlcSmartRow[] = [];

  function key(r: RlcSmartRow) {
    return [
      clean(r.pos),
      clean(r.text).toLowerCase(),
      clean(r.qty),
      clean(r.unit).toLowerCase(),
      clean(r.ep),
      clean(r.gp || ""),
    ].join("|");
  }

  const seen = new Set<string>();

  for (const r of [...primary, ...secondary]) {
    const k = key(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }

  return out;
}

function sortRowsByPos(rows: RlcSmartRow[]) {
  const allHaveNumericPos = rows.every((r) => /^\d+([.,]\d+)?$/i.test(clean(r.pos)));
  if (!allHaveNumericPos) return rows;

  return [...rows].sort((a, b) => {
    const na = Number(String(a.pos).replace(",", "."));
    const nb = Number(String(b.pos).replace(",", "."));
    if (!Number.isFinite(na) || !Number.isFinite(nb)) return 0;
    return na - nb;
  });
}

function parseRows(input: string): RlcSmartRow[] {
  const lines = input
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const rows: RlcSmartRow[] = [];

  for (const line of lines) {
    // Skip field lines
    if (/^\s*(kunde|auftraggeber|firma|adresse|anschrift|email|e-mail|mail|telefon|tel|baustelle|projekt|bauvorhaben|titel|angebot|rechnung|betreff|datum|leistungszeitraum)\s*[:=]/i.test(line)) {
      continue;
    }

    const row = parseLine(line, rows.length + 1);
    if (row) rows.push(row);
  }

  const ocrRows = parseOcrBlockRows(input);
  return normalizeRowPositions(sortRowsByPos(mergeRows(rows, ocrRows)));
}

function validateSmartDoc(doc: RlcSmartDoc) {
  const warnings: string[] = [];

  if (!doc.customerName) warnings.push("Kunde/Auftraggeber fehlt.");
  if (!doc.baustelle && !doc.title) warnings.push("Baustelle/Titel fehlt.");
  if (!doc.rows.length) warnings.push("Keine Positionen erkannt.");

  doc.rows.forEach((r, i) => {
    const label = r.pos || String(i + 1);
    if (!r.text) warnings.push(`Position ${label}: Text fehlt.`);
    if (!r.qty) warnings.push(`Position ${label}: Menge fehlt.`);
    if (!r.unit) warnings.push(`Position ${label}: Einheit fehlt.`);
    if (!r.ep) warnings.push(`Position ${label}: EP fehlt.`);
  });

  return warnings;
}

export function parseRlcKiSmartDoc(inputRaw: any): RlcSmartDoc {
  const input = clean(inputRaw);

  const doc: RlcSmartDoc = {
    title: pickField(input, ["titel", "angebot", "rechnung", "betreff"]),
    customerName: pickField(input, ["kunde", "auftraggeber", "firma", "name"]),
    address: pickField(input, ["adresse", "anschrift"]),
    email: pickField(input, ["email", "e-mail", "mail"]),
    phone: pickField(input, ["telefon", "tel", "phone"]),
    baustelle: pickField(input, ["baustelle", "projekt", "bauvorhaben"]),
    datum: parseDate(input),
    leistungszeitraum: parsePeriod(input),
    rechnungNr: pickField(input, ["rechnungsnummer", "rechnungnr", "rechnung-nr", "rechnung nr"]),
    angebotNr: pickField(input, ["angebotsnummer", "angebotnr", "angebot-nr", "angebot nr"]),
    note: input,
    rows: parseRows(input),
  };

  doc.warnings = validateSmartDoc(doc);
  return doc;
}





