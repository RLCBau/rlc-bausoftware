import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/kalkulation/gaeb.tsx
import React, { useEffect, useMemo, useState } from "react";

import { runRlcAction } from "../../lib/rlcProgress";
import { useNavigate, useSearchParams } from "react-router-dom";

import { API_BASE } from "../../lib/apiBase";

import { useProject } from "../../store/useProject";

import { LV, type LVPos } from "./store.lv";

import { KalkulationsDatenbank } from "./kalkulationsDatenbank";


type Fmt =
"GAEB90" |
"GAEB2000" |
"GAEBXML" |
"DA" |
"X80" |
"X81" |
"X82" |
"X83" |
"X84" |
"X85" |
"X86" |
"X89" |
"X94" |
"X31" |
"DA11" |
"D81" |
"D82" |
"D83" |
"D84" |
"D85" |
"D86" |
"P81" |
"P82" |
"P83" |
"P84" |
"P85" |
"P86" |
"P94" |
"XML";

type FilterMode =
"alle" |
"fehler" |
"neu" |
"vorhanden" |
"posNrFehlt" |
"einheitFehlt" |
"mengeFehlt" |
"doppelte";

type GaebMode =
"x80" |
"x81" |
"x82" |
"x83" |
"x84" |
"x85" |
"x86" |
"x89" |
"x94" |
"x31" |
"da11" |
"d81" |
"d82" |
"d83" |
"d84" |
"d85" |
"d86" |
"p81" |
"p82" |
"p83" |
"p84" |
"p85" |
"p86" |
"p94";

type IssueType = "error" | "warning";

type ImportedRow = {
  posNr?: string;
  parentPosNr?: string;
  kurztext?: string;
  langtext?: string;
  bemerkung?: string;
  einheit?: string;
  menge?: number;
  preis?: number;
  gesamt?: number;
  waehrung?: string;
  confidence?: number;
};

type Detect = {
  format: Fmt;
  name: string;
  count: number;
  rows: ImportedRow[];
};

type GaebIssue = {
  position?: string;
  posNr?: string;
  type?: IssueType | string;
  field?: string;
  message?: string;
  reason?: string;
  code?: string;
};

type GaebValidationResponse = {
  ok?: boolean;
  valid?: boolean;
  mode?: GaebMode;
  errorCount?: number;
  warningCount?: number;
  errors?: GaebIssue[];
  warnings?: GaebIssue[];
};

type ProjectLike = {
  id?: string;
  code?: string;
  number?: string;
  projektnummer?: string;
  name?: string;
  projectName?: string;
  projektname?: string;
  client?: string;
  auftraggeber?: string;
  kunde?: string;
  place?: string;
  city?: string;
  ort?: string;
  location?: string;
};

type ExportFamilyKey = "xml" | "gaeb2000" | "gaeb90" | "da";

type ExportFormatRow = {
  family: ExportFamilyKey;
  code: string;
  title: string;
  description: string;
  kind: "project" | "legacy";
  projectMode?: GaebMode;
  legacyFormat?: Fmt;
};

type ExportTarget = {
  mode: GaebMode;
  label: string;
  description: string;
  group: "GAEB XML" | "GAEB 2000" | "GAEB 90" | "Aufmaß / REB";
  fallbackFormat?: Fmt;
};

const EXPORT_FAMILY_TABS: {key: ExportFamilyKey;label: string;}[] = [
{ key: "xml", label: "GAEB XML" },
{ key: "gaeb2000", label: "GAEB 2000" },
{ key: "gaeb90", label: "GAEB 90" },
{ key: "da", label: "Aufmaß / REB" }];


const EXPORT_FORMAT_ROWS: ExportFormatRow[] = [
{
  family: "xml",
  code: "X83",
  title: "Angebotsaufforderung / Ausschreibung",
  description: "Projektbezogener Export für Ausschreibungsdaten.",
  kind: "project",
  projectMode: "x83"
},
{
  family: "xml",
  code: "X84",
  title: "Angebotsabgabe",
  description: "Projektbezogener Export für Angebotsabgabe mit Preisen.",
  kind: "project",
  projectMode: "x84"
},
{
  family: "xml",
  code: "X80–X86 / X89 / X94",
  title: "GAEB XML 3.x",
  description: "Weitere XML-Austauschphasen über Legacy-/Server-Export.",
  kind: "legacy",
  legacyFormat: "GAEBXML"
},
{
  family: "gaeb2000",
  code: "P81–P86 / P94",
  title: "GAEB 2000",
  description: "Klassische GAEB-2000-Formate für Import/Export.",
  kind: "legacy",
  legacyFormat: "GAEB2000"
},
{
  family: "gaeb90",
  code: "D81–D86",
  title: "GAEB 90",
  description: "Ältere GAEB-90-Formate für Bestandssysteme.",
  kind: "legacy",
  legacyFormat: "GAEB90"
},
{
  family: "da",
  code: "DA11 / X31",
  title: "Aufmaß / REB",
  description: "Aufmaß- und Abrechnungsdaten, soweit serverseitig unterstützt.",
  kind: "legacy",
  legacyFormat: "DA"
}];


const EXPORT_TARGETS: ExportTarget[] = [
{ mode: "x80", label: "X80", description: "Universelle LV-Daten", group: "GAEB XML", fallbackFormat: "GAEBXML" },
{ mode: "x81", label: "X81", description: "Leistungsbeschreibung", group: "GAEB XML", fallbackFormat: "GAEBXML" },
{ mode: "x82", label: "X82", description: "Kostenanschlag", group: "GAEB XML", fallbackFormat: "GAEBXML" },
{ mode: "x83", label: "X83", description: "Angebotsaufforderung / Ausschreibung", group: "GAEB XML", fallbackFormat: "GAEBXML" },
{ mode: "x84", label: "X84", description: "Angebotsabgabe", group: "GAEB XML", fallbackFormat: "GAEBXML" },
{ mode: "x85", label: "X85", description: "Nebenangebot", group: "GAEB XML", fallbackFormat: "GAEBXML" },
{ mode: "x86", label: "X86", description: "Auftragserteilung", group: "GAEB XML", fallbackFormat: "GAEBXML" },
{ mode: "x89", label: "X89", description: "Rechnung", group: "GAEB XML", fallbackFormat: "GAEBXML" },
{ mode: "x94", label: "X94", description: "Nachtrag / Austauschphase", group: "GAEB XML", fallbackFormat: "GAEBXML" },

{ mode: "p81", label: "P81", description: "GAEB 2000 Leistungsbeschreibung", group: "GAEB 2000", fallbackFormat: "GAEB2000" },
{ mode: "p82", label: "P82", description: "GAEB 2000 Kostenanschlag", group: "GAEB 2000", fallbackFormat: "GAEB2000" },
{ mode: "p83", label: "P83", description: "GAEB 2000 Angebotsaufforderung", group: "GAEB 2000", fallbackFormat: "GAEB2000" },
{ mode: "p84", label: "P84", description: "GAEB 2000 Angebotsabgabe", group: "GAEB 2000", fallbackFormat: "GAEB2000" },
{ mode: "p85", label: "P85", description: "GAEB 2000 Nebenangebot", group: "GAEB 2000", fallbackFormat: "GAEB2000" },
{ mode: "p86", label: "P86", description: "GAEB 2000 Auftragserteilung", group: "GAEB 2000", fallbackFormat: "GAEB2000" },
{ mode: "p94", label: "P94", description: "GAEB 2000 Nachtrag / Austausch", group: "GAEB 2000", fallbackFormat: "GAEB2000" },

{ mode: "d81", label: "D81", description: "GAEB 90 Leistungsbeschreibung", group: "GAEB 90", fallbackFormat: "GAEB90" },
{ mode: "d82", label: "D82", description: "GAEB 90 Kostenanschlag", group: "GAEB 90", fallbackFormat: "GAEB90" },
{ mode: "d83", label: "D83", description: "GAEB 90 Angebotsaufforderung", group: "GAEB 90", fallbackFormat: "GAEB90" },
{ mode: "d84", label: "D84", description: "GAEB 90 Angebotsabgabe", group: "GAEB 90", fallbackFormat: "GAEB90" },
{ mode: "d85", label: "D85", description: "GAEB 90 Nebenangebot", group: "GAEB 90", fallbackFormat: "GAEB90" },
{ mode: "d86", label: "D86", description: "GAEB 90 Auftragserteilung", group: "GAEB 90", fallbackFormat: "GAEB90" },

{ mode: "x31", label: "X31", description: "Aufmaß / Mengenermittlung GAEB XML", group: "Aufmaß / REB", fallbackFormat: "DA" },
{ mode: "da11", label: "DA11", description: "REB-Aufmaß / DA11", group: "Aufmaß / REB", fallbackFormat: "DA" }];


const ME_SUGGEST: Record<string, string> = {
  qm: "m²",
  m2: "m²",
  "m^2": "m²",
  qkm: "km²",
  qdm: "dm²",
  qcm: "cm²",
  qmm: "mm²",
  mtr: "m",
  meter: "m",
  stk: "St",
  st: "St",
  stck: "St",
  std: "h",
  stunden: "h",
  min: "min",
  t: "t",
  to: "t",
  tonnen: "t",
  kg: "kg",
  g: "g",
  l: "l",
  m3: "m³",
  "m^3": "m³",
  km: "km",
  pauschal: "PS",
  ps: "PS"
};

const ACCEPT_TYPES =
".D81,.D82,.D83,.D84,.D85,.D86," +
".P81,.P82,.P83,.P84,.P85,.P86,.P94," +
".X80,.X81,.X82,.X83,.X84,.X85,.X86,.X89,.X94,.XML," +
".DA11,.X31";

const GAEB_IMPORT_STORAGE_PREFIX = "rlc_gaeb_import_v1";

function apiUrl(path: string): string {
  const base = String(API_BASE || "").replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  if (!base) return cleanPath;

  if (base.endsWith("/api") && cleanPath.startsWith("/api/")) {
    return `${base}${cleanPath.slice(4)}`;
  }

  return `${base}${cleanPath}`;
}

function getAuthToken(): string {
  try {
    const directKeys = [
    "token",
    "authToken",
    "accessToken",
    "rlc_token",
    "rlc_auth_token",
    "rlc_access_token"];


    for (const key of directKeys) {
      const value = localStorage.getItem(key);
      if (value && value.trim()) return value.trim();
    }

    const jsonKeys = ["auth", "user", "session", "rlc_auth", "rlc_session"];

    for (const key of jsonKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        const token =
        parsed?.token ??
        parsed?.accessToken ??
        parsed?.authToken ??
        parsed?.jwt ??
        parsed?.data?.token ??
        parsed?.data?.accessToken;

        if (typeof token === "string" && token.trim()) return token.trim();
      } catch {


        //
      }}} catch {


    //
  }return "";
}

function withAuthHeaders(extra?: Record<string, string>): HeadersInit {
  const token = getAuthToken();

  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;

  const n =
  typeof value === "number" ?
  value :
  Number(String(value).replace(",", ".").trim());

  return Number.isFinite(n) ? n : fallback;
}

function norm(value: unknown): string {
  return String(value ?? "").
  toLowerCase().
  normalize("NFKD").
  replace(/[\u0300-\u036f]/g, "").
  replace(/[^\p{L}\p{N}]+/gu, " ").
  replace(/\s+/g, " ").
  trim();
}

function gaebImportStorageKey(projectCode: string): string {
  return `${GAEB_IMPORT_STORAGE_PREFIX}:${String(projectCode || "no-project").
  trim().
  toUpperCase()}`;
}

function firstArray(...values: unknown[]): any[] {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }

  return [];
}

function extractImportRows(json: any): any[] {
  return firstArray(
    json?.items,
    json?.rows,
    json?.positions,
    json?.data?.items,
    json?.data?.rows,
    json?.data?.positions,
    json?.lv?.items,
    json?.lv?.rows,
    json?.lv?.positions,
    json?.projectLv?.items,
    json?.projectLv?.rows,
    json?.projectLv?.positions,
    json?.result?.items,
    json?.result?.rows,
    json?.result?.positions,
    json?.imported?.items,
    json?.imported?.rows,
    json?.imported?.positions
  );
}

function textOf(el: Element | null | undefined): string {
  if (!el) return "";
  return String(el.textContent || "").
  replace(/\s+/g, " ").
  trim();
}

function firstElementByLocalName(root: Element | Document, names: string[]): Element | null {
  for (const name of names) {
    const all = Array.from(root.getElementsByTagName("*"));
    const found = all.find((el) => el.localName === name);
    if (found) return found;
  }
  return null;
}

function elementsByLocalName(root: Element | Document, name: string): Element[] {
  return Array.from(root.getElementsByTagName("*")).filter((el) => el.localName === name);
}

function childTextByLocalName(root: Element, names: string[]): string {
  for (const name of names) {
    const found = Array.from(root.children).find((el) => el.localName === name);
    const txt = textOf(found);
    if (txt) return txt;
  }
  return "";
}

function deepTextByLocalName(root: Element, names: string[]): string {
  for (const name of names) {
    const found = firstElementByLocalName(root, [name]);
    const txt = textOf(found);
    if (txt) return txt;
  }
  return "";
}

function parseGaebNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;

  let raw = String(value).trim().replace(/\s+/g, "");
  if (!raw) return 0;

  // Deutsch: 1.234,56 => 1234.56
  if (raw.includes(",") && raw.includes(".")) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (raw.includes(",")) {
    // Deutsch: 1,5 => 1.5
    raw = raw.replace(",", ".");
  }

  // Wichtig für GAEB XML:
  // 1.000 bleibt 1.000 = 1
  // 20.000 bleibt 20.000 = 20
  // 1600.000 bleibt 1600.000 = 1600

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function parseGaebXmlFallback(xmlText: string, fileName: string): Detect {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");

  const parseError = doc.getElementsByTagName("parsererror")?.[0];
  if (parseError) {
    throw new Error("GAEB XML konnte im Browser nicht gelesen werden.");
  }

  function cleanOzPart(value: unknown): string {
    return String(value ?? "").
    trim().
    replace(/\s+/g, "").
    replace(/_/g, ".").
    replace(/^\.+|\.+$/g, "");
  }

  function attrByLocalName(el: Element, names: string[]): string {
    for (const name of names) {
      const direct = el.getAttribute(name);
      if (direct && direct.trim()) return direct.trim();

      for (const attr of Array.from(el.attributes)) {
        if (attr.localName === name && attr.value.trim()) {
          return attr.value.trim();
        }
      }
    }

    return "";
  }

  function directChildText(root: Element, names: string[]): string {
    for (const child of Array.from(root.children)) {
      if (names.includes(child.localName)) {
        const value = textOf(child);
        if (value) return value;
      }
    }

    return "";
  }

  type GaebOzSpec = {type: string;length: number;numeric: boolean;};

  function readGaebOzBreakdown(): GaebOzSpec[] {
    /*
     * GAEB XML speichert jeden Aufbauabschnitt in einem eigenen
     * <BoQBkdn>-Element. Beispiel: zwei BoQLevel, Item und Index.
     */
    return elementsByLocalName(doc, "BoQBkdn").
    map((breakdown) => {
      const type = directChildText(breakdown, ["Type"]);
      const length = Number(directChildText(breakdown, ["Length"]) || 0);
      const num = directChildText(breakdown, ["Num"]);

      if (!type || !Number.isFinite(length) || length <= 0) return null;

      return {
        type,
        length,
        numeric: !/^(no|false|0|nein)$/i.test(num)
      } as GaebOzSpec;
    }).
    filter((spec): spec is GaebOzSpec => spec !== null);
  }

  const ozBreakdown = readGaebOzBreakdown();
  const categorySpecs = ozBreakdown.filter((spec) => spec.type === "BoQLevel");
  const itemSpec = ozBreakdown.find((spec) => spec.type === "Item");
  const indexSpec = ozBreakdown.find((spec) => spec.type === "Index");

  function formatOzPart(value: string, spec?: GaebOzSpec): string {
    const clean = cleanOzPart(value);
    if (!clean || !spec?.length) return clean;
    if (spec.numeric && /^\d+$/.test(clean)) return clean.padStart(spec.length, "0");
    return clean;
  }

  function buildGaebOz(item: Element, fallbackNo: number): {
    posNr: string;
    parentPosNr: string;
  } {
    const categoryParts: string[] = [];
    let current: Element | null = item.parentElement;

    while (current) {
      if (current.localName === "BoQCtgy") {
        const part = cleanOzPart(
          attrByLocalName(current, ["RNoPart", "RNo", "Nr", "No"]) ||
          directChildText(current, ["RNoPart", "RNo", "Nr", "No"])
        );

        if (part) categoryParts.unshift(part);
      }

      current = current.parentElement;
    }

    const itemPart = cleanOzPart(
      attrByLocalName(item, [
      "RNoPart",
      "RNo",
      "ItemNumber",
      "PositionNumber",
      "OZ",
      "Nr",
      "No"]
      ) ||
      directChildText(item, [
      "RNoPart",
      "RNo",
      "ItemNumber",
      "PositionNumber",
      "OZ",
      "Nr",
      "No"]
      )
    );

    const indexPart = cleanOzPart(
      attrByLocalName(item, ["RNoIndex"]) ||
      directChildText(item, ["RNoIndex"])
    );

    const formattedCategories = categoryParts.map((part, index) =>
    formatOzPart(part, categorySpecs[index])
    );

    const parentPosNr = formattedCategories.join(".");
    const parts = [...formattedCategories];

    if (itemPart) parts.push(formatOzPart(itemPart, itemSpec));
    if (indexPart) parts.push(formatOzPart(indexPart, indexSpec));

    return {
      posNr: parts.join(".") || String(fallbackNo).padStart(3, "0"),
      parentPosNr
    };
  }

  const itemNodes = elementsByLocalName(doc, "Item");

  const rows: ImportedRow[] = itemNodes.
  map((item, index) => {
    const { posNr, parentPosNr } = buildGaebOz(item, index + 1);

    const outlineText =
    deepTextByLocalName(item, ["OutlineText"]) ||
    deepTextByLocalName(item, ["ShortText"]) ||
    deepTextByLocalName(item, ["TextOutl"]);

    const detailTxt =
    deepTextByLocalName(item, ["DetailTxt"]) ||
    deepTextByLocalName(item, ["LongText"]) ||
    deepTextByLocalName(item, ["TextComplement"]) ||
    deepTextByLocalName(item, ["Text"]);

    const qtyRaw =
    deepTextByLocalName(item, ["Qty"]) ||
    deepTextByLocalName(item, ["Quantity"]) ||
    deepTextByLocalName(item, ["QtySplit"]);

    const unitRaw =
    deepTextByLocalName(item, ["QU"]) ||
    deepTextByLocalName(item, ["Unit"]) ||
    deepTextByLocalName(item, ["ME"]);

    const epRaw =
    deepTextByLocalName(item, ["UP"]) ||
    deepTextByLocalName(item, ["UnitPrice"]) ||
    deepTextByLocalName(item, ["EP"]);

    const totalRaw =
    deepTextByLocalName(item, ["IT"]) ||
    deepTextByLocalName(item, ["Total"]) ||
    deepTextByLocalName(item, ["GB"]);

    const menge = parseGaebNumber(qtyRaw);
    const preis = parseGaebNumber(epRaw);
    const gesamt = totalRaw ?
    parseGaebNumber(totalRaw) :
    Number((menge * preis).toFixed(2));

    return {
      posNr,
      parentPosNr,
      kurztext: outlineText || detailTxt.slice(0, 120) || `Position ${posNr}`,
      langtext: detailTxt || outlineText || `Position ${posNr}`,
      bemerkung: "",
      einheit: normalizeGaebUnit(unitRaw),
      menge,
      preis,
      gesamt,
      waehrung: "EUR",
      confidence: 0.95
    };
  }).
  filter((r) => r.posNr || r.kurztext || r.langtext);

  return {
    format: normalizeFormat(undefined, fileName),
    name: fileName,
    count: rows.length,
    rows
  };
}

function normalizeFormat(value: unknown, fileName?: string): Fmt {
  const raw = String(value || fileName?.split(".").pop() || "GAEBXML").
  replace(/^\./, "").
  toUpperCase();

  if (raw === "XML") return "XML";
  if (raw === "GAEB90") return "GAEB90";
  if (raw === "GAEB2000") return "GAEB2000";
  if (raw === "GAEBXML") return "GAEBXML";
  if (raw === "DA") return "DA";
  if (raw === "DA11") return "DA11";
  if (raw === "X31") return "X31";

  if (/^X(80|81|82|83|84|85|86|89|94)$/.test(raw)) return raw as Fmt;
  if (/^D(81|82|83|84|85|86)$/.test(raw)) return raw as Fmt;
  if (/^P(81|82|83|84|85|86|94)$/.test(raw)) return raw as Fmt;

  if (raw.startsWith("D8")) return "GAEB90";
  if (raw.startsWith("P8") || raw === "P94") return "GAEB2000";
  if (raw.startsWith("X")) return "GAEBXML";

  return "GAEBXML";
}

function normalizeGaebUnit(value: unknown): string {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase();

  return ME_SUGGEST[key] || raw;
}
function mapImportedRows(rawRows: any[]): ImportedRow[] {
  return rawRows.
  map((r: any) => {
    const menge = toFiniteNumber(
      r?.menge ?? r?.quantity ?? r?.qty ?? r?.amount,
      0
    );

    const preis = toFiniteNumber(
      r?.preis ?? r?.ep ?? r?.einzelpreis ?? r?.unitPrice,
      0
    );

    const hasGesamt =
    r?.gesamt !== undefined ||
    r?.total !== undefined ||
    r?.betrag !== undefined ||
    r?.sum !== undefined;

    const gesamt = hasGesamt ?
    toFiniteNumber(r?.gesamt ?? r?.total ?? r?.betrag ?? r?.sum, 0) :
    Number((menge * preis).toFixed(2));

    return {
      posNr: String(
        r?.posNr ??
        r?.pos ??
        r?.position ??
        r?.positionNo ??
        r?.positionsnummer ??
        ""
      ).trim(),
      parentPosNr: String(r?.parentPosNr ?? r?.parentPos ?? r?.parent ?? "").trim(),
      kurztext: String(r?.kurztext ?? r?.shortText ?? r?.text ?? r?.title ?? "").trim(),
      langtext: String(
        r?.langtext ?? r?.longText ?? r?.description ?? r?.beschreibung ?? ""
      ).trim(),
      bemerkung: String(r?.bemerkung ?? r?.note ?? r?.remark ?? "").trim(),
      einheit: normalizeGaebUnit(r?.einheit ?? r?.unit ?? r?.me ?? r?.ME ?? ""),
      menge,
      preis,
      gesamt,
      waehrung: String(r?.waehrung ?? r?.currency ?? "EUR").trim(),
      confidence: toFiniteNumber(r?.confidence, 0)
    };
  }).
  filter((r) => r.posNr || r.kurztext || r.langtext);
}

function saveGaebImportToLocal(projectCode: string, det: Detect | null) {
  try {
    if (!det) return;

    localStorage.setItem(
      gaebImportStorageKey(projectCode),
      JSON.stringify({
        ...det,
        savedAt: new Date().toISOString()
      })
    );
  } catch {


    //
  }}
function loadGaebImportFromLocal(projectCode: string): Detect | null {
  try {
    const raw = localStorage.getItem(gaebImportStorageKey(projectCode));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rows)) return null;

    const rows = mapImportedRows(parsed.rows);

    return {
      format: normalizeFormat(parsed.format),
      name: String(parsed.name || "Gespeicherter GAEB-Import"),
      count: Number(parsed.count || rows.length || 0),
      rows
    };
  } catch {
    return null;
  }
}

function clearGaebImportFromLocal(projectCode: string) {
  try {
    localStorage.removeItem(gaebImportStorageKey(projectCode));
  } catch {


    //
  }}
function normalizeIssues(items: unknown, fallbackType: IssueType): GaebIssue[] {
  if (!Array.isArray(items)) return [];

  return items.map((it: any) => ({
    position: String(it?.position ?? it?.posNr ?? it?.positionNo ?? ""),
    posNr: String(it?.posNr ?? it?.position ?? it?.positionNo ?? ""),
    type: it?.type ?? fallbackType,
    field: String(it?.field ?? it?.path ?? ""),
    message: String(it?.message ?? it?.reason ?? it?.error ?? ""),
    reason: String(it?.reason ?? it?.message ?? ""),
    code: String(it?.code ?? "")
  }));
}

function getCurrentProjectFromSources(projectCtx: any): ProjectLike | null {
  const ctxProject =
  projectCtx?.currentProject ??
  projectCtx?.current ??
  projectCtx?.selectedProject ??
  projectCtx?.project ?? (
  typeof projectCtx?.getCurrentProject === "function" ?
  projectCtx.getCurrentProject() :
  null);

  if (ctxProject) return ctxProject as ProjectLike;

  try {
    const g = globalThis as any;
    return (g.__RLC_CURRENT_PROJECT ?? null) as ProjectLike | null;
  } catch {
    return null;
  }
}

function getProjectCode(project: ProjectLike | null): string {
  return String(project?.code ?? project?.number ?? project?.projektnummer ?? "").
  trim().
  toUpperCase();
}

function exportPreviewCSV(rows: ImportedRow[]) {
  const head =
  "PosNr;ParentPosNr;Kurztext;Langtext;Bemerkung;ME;Menge;EP;Gesamt;Waehrung;Confidence";

  const body = rows.
  map((r) =>
  [
  r.posNr ?? "",
  r.parentPosNr ?? "",
  JSON.stringify(r.kurztext ?? ""),
  JSON.stringify(r.langtext ?? ""),
  JSON.stringify(r.bemerkung ?? ""),
  r.einheit ?? "",
  r.menge ?? "",
  r.preis ?? "",
  r.gesamt ?? "",
  r.waehrung ?? "EUR",
  r.confidence ?? ""].
  join(";")
  ).
  join("\n");

  const csv = `${head}\n${body}`;
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" })
  );

  const a = document.createElement("a");
  a.href = url;
  a.download = "gaeb-preview.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

async function downloadBlobFromResponse(response: Response, fallbackName: string) {
  const blob = await response.blob();
  const disposition =
  response.headers.get("content-disposition") ||
  response.headers.get("Content-Disposition") ||
  "";

  let filename = fallbackName;

  const match =
  disposition.match(/filename\*=UTF-8''([^;]+)/i) ||
  disposition.match(/filename="?([^"]+)"?/i);

  if (match?.[1]) {
    try {
      filename = decodeURIComponent(match[1]);
    } catch {
      filename = match[1];
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function fmtNumber(v: unknown): string {
  const num = toFiniteNumber(v, 0);
  return num.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function importedRowKey(row: ImportedRow, originalIndex: number): string {
  const pos = String(row.posNr || "").trim();
  return `${originalIndex}:${pos || "row"}`;
}

function isPlaceholderText(value: unknown): boolean {
  const text = String(value || "").trim();
  return !text || /^position\s+\d+$/i.test(text) || /^[\d.,]+$/.test(text);
}

function enrichPriceRowsWithLvBase(priceRows: ImportedRow[], baseRows: LVPos[]): ImportedRow[] {
  const baseByPos = new Map<string, LVPos>();

  for (const b of baseRows || []) {
    const pos = String((b as any).posNr || "").trim();
    if (pos) baseByPos.set(pos, b);
  }

  return priceRows.map((r) => {
    const pos = String(r.posNr || "").trim();
    const base: any = baseByPos.get(pos);

    if (!base) return r;

    const ep = toFiniteNumber(r.preis, 0);
    const mengeBase = toFiniteNumber(base.menge, 0);
    const gesamt = ep > 0 && mengeBase > 0 ? Number((ep * mengeBase).toFixed(2)) : r.gesamt;

    return {
      ...r,
      kurztext: isPlaceholderText(r.kurztext) ? String(base.kurztext || "") : r.kurztext,
      langtext: isPlaceholderText(r.langtext) ? String(base.langtext || base.kurztext || "") : r.langtext,
      einheit: normalizeGaebUnit(
        String(r.einheit || "").trim() ? r.einheit : String(base.einheit || "")
      ),
      menge: toFiniteNumber(r.menge, 0) > 0 ? r.menge : mengeBase,
      preis: ep,
      gesamt,
      waehrung: r.waehrung || base.waehrung || "EUR"
    };
  });
}
function rowHasLocalError(row: ImportedRow, issue?: RowIssue): boolean {
  const hasPos = String(row.posNr || "").trim();
  const hasText =
  String(row.kurztext || "").trim() || String(row.langtext || "").trim();
  const hasUnit = String(row.einheit || "").trim();
  const menge = toFiniteNumber(row.menge, 0);

  return (
    !!issue?.empty ||
    !hasPos ||
    !hasText ||
    !hasUnit ||
    menge <= 0);

}

function fixImportedRow(row: ImportedRow): {row: ImportedRow;changed: boolean;changes: string[];} {
  const next: ImportedRow = { ...row };
  const changes: string[] = [];
  const pos = String(next.posNr || "").trim();

  if (!String(next.kurztext || "").trim()) {
    next.kurztext = pos ? `Titel ${pos}` : "Position ohne Positionsnummer";
    changes.push("Kurztext ergänzt");
  }

  if (!String(next.langtext || "").trim()) {
    next.langtext = String(next.kurztext || "").trim();
    changes.push("Langtext ergänzt");
  }

  const unitKey = String(next.einheit || "").trim().toLowerCase();
  const fixedUnit = ME_SUGGEST[unitKey];

  if (fixedUnit && fixedUnit !== next.einheit) {
    next.einheit = fixedUnit;
    changes.push(`Einheit normalisiert zu ${fixedUnit}`);
  }

  if (!String(next.einheit || "").trim()) {
    next.einheit = "PS";
    changes.push("Einheit auf PS gesetzt");
  }

  if (toFiniteNumber(next.menge, 0) <= 0) {
    next.menge = 1;
    changes.push("Menge auf 1 gesetzt");
  }

  const menge = toFiniteNumber(next.menge, 0);
  const preis = toFiniteNumber(next.preis, 0);
  next.gesamt = Number((menge * preis).toFixed(2));

  if (!next.waehrung) next.waehrung = "EUR";

  return { row: next, changed: changes.length > 0, changes };
}

function formatBadgeByFmt(fmt: Fmt | string): React.CSSProperties {
  const raw = String(fmt).toUpperCase();

  let color = "#475569";
  let bg = "#F8FAFC";
  let border = "#CBD5E1";

  if (raw === "GAEB90" || raw.startsWith("D")) {
    color = "#15803D";
    bg = "#F0FDF4";
    border = "#BBF7D0";
  } else if (raw === "GAEB2000" || raw.startsWith("P")) {
    color = "#0B5BD3";
    bg = "#EAF2FF";
    border = "#BED6FF";
  } else if (raw === "GAEBXML" || raw === "XML" || raw.startsWith("X")) {
    color = "#7C3AED";
    bg = "#F5F3FF";
    border = "#DDD6FE";
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 700,
    color,
    background: bg,
    border: `1px solid ${border}`,
    whiteSpace: "nowrap"
  };
}

function badgeStyle(kind: "neutral" | "success" | "error" | "warn"): React.CSSProperties {
  if (kind === "success") return badgeOk;
  if (kind === "error") return badgeError;
  if (kind === "warn") return badgeWarn;
  return badgeNeutral;
}

function gaebFilterLabel(filter: FilterMode): string {
  if (filter === "alle") return "Alle";
  if (filter === "fehler") return "Fehler";
  if (filter === "neu") return "Nur neue";
  if (filter === "vorhanden") return "Bereits im LV";
  if (filter === "posNrFehlt") return "PosNr fehlt";
  if (filter === "einheitFehlt") return "Einheit fehlt / falsch";
  if (filter === "mengeFehlt") return "Menge fehlt";
  if (filter === "doppelte") return "Doppelte / Konflikte";
  return "Filter";
}

function statusBox(info: string): React.CSSProperties {
  const isError =
  info.startsWith("Fehler") ||
  info.startsWith("Export-Fehler") ||
  info.startsWith("Validierungs-Fehler") ||
  info.includes("Server-Fehler") ||
  info.includes("blockiert");

  const isSuccess =
  info.includes("erfolgreich") ||
  info.includes("valide") ||
  info.includes("gespeichert") ||
  info.includes("übernommen") ||
  info.includes("erstellt") ||
  info.includes("wiederhergestellt") ||
  info.includes("korrigiert");

  return {
    padding: "11px 13px",
    borderRadius: 12,
    border: `1px solid ${isError ? "#FECACA" : isSuccess ? "#BBF7D0" : "#D1D5DB"}`,
    background: isError ? "#FEF2F2" : isSuccess ? "#F0FDF4" : "#F8FAFC",
    color: isError ? "#B91C1C" : isSuccess ? "#15803D" : "#475569",
    fontSize: 13,
    fontWeight: 600
  };
}

function IssueTable({ rows }: {rows: GaebIssue[];}) {
  return (
    <div className={rlcClass(null, tableWrap)}>
      <table className={rlcClass(null, { ...table, minWidth: 860 })}>
        <thead>
          <tr>
            <th className={rlcClass(null, th)}>Pos.</th>
            <th className={rlcClass(null, th)}>Typ</th>
            <th className={rlcClass(null, th)}>Feld</th>
            <th className={rlcClass(null, th)}>Meldung</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row, i) =>
          <tr key={`${row.posNr || row.position || "issue"}-${i}`}>
              <td className={rlcClass(null, td)}>{row.position || row.posNr || "—"}</td>
              <td className={rlcClass(null, td)}>
                <span className={rlcClass(null, badgeStyle(String(row.type) === "warning" ? "warn" : "error"))}>
                  {String(row.type || "error")}
                </span>
              </td>
              <td className={rlcClass(null, td)}>{row.field || "—"}</td>
              <td className={rlcClass(null, td)}>{row.message || row.reason || row.code || "—"}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>);

}

function KpiCard({ label, value, sub }: {label: string;value: string;sub?: string;}) {
  return (
    <div className={rlcClass(null, kpiCard)}>
      <div className={rlcClass(null, kpiLabel)}>{label}</div>
      <div className={rlcClass(null, kpiValue)}>{value}</div>
      {sub ? <div className={rlcClass(null, kpiSub)}>{sub}</div> : null}
    </div>);

}

type DisplayRow = {
  row: ImportedRow;
  originalIndex: number;
};

type RowIssue = {
  empty?: boolean;
  dupInFile?: boolean;
  existsInLV?: boolean;
  meSuggest?: string;
};

export default function GaebPage() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const projectCtx: any = useProject();

  const currentProject = getCurrentProjectFromSources(projectCtx);
  const currentProjectCode = getProjectCode(currentProject);

  const [projectCode, setProjectCode] = useState<string>(
    (searchParams.get("projectCode") || currentProjectCode || "").trim().toUpperCase()
  );

  const [lvRows, setLvRows] = useState<LVPos[]>(() => LV.list());
  const [det, setDet] = useState<Detect | null>(null);
  const [info, setInfo] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [openRows, setOpenRows] = useState<Record<number, boolean>>({});
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [filterMode, setFilterMode] = useState<FilterMode>("alle");
  const [gaebBusy, setGaebBusy] = useState<GaebMode | null>(null);
  const [gaebResult, setGaebResult] = useState<GaebValidationResponse | null>(null);
  const [selectedExportCode, setSelectedExportCode] = useState<string>("X84");
  const [activeExportFamily, setActiveExportFamily] = useState<ExportFamilyKey>("xml");

  useEffect(() => {
    if (!projectCode && currentProjectCode) {
      setProjectCode(currentProjectCode);
    }
  }, [currentProjectCode, projectCode]);

  useEffect(() => {
    const code = projectCode.trim().toUpperCase();
    if (!code || det) return;

    const saved = loadGaebImportFromLocal(code);
    if (saved?.rows?.length) {
      setDet(saved);
      setInfo(
        `Gespeicherter GAEB-Import wiederhergestellt: ${saved.name} · ${saved.rows.length.toLocaleString(
          "de-DE"
        )} Positionen.`
      );
    }
  }, [projectCode, det]);

  useEffect(() => {
    const onFocus = () => setLvRows(LV.list());
    const onStorage = () => setLvRows(LV.list());

    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const refreshLv = () => setLvRows(LV.list());

  const preview = useMemo<DisplayRow[]>(
    () => (det?.rows ?? []).slice(0, 500).map((row, originalIndex) => ({ row, originalIndex })),
    [det]
  );

  const existingSet = useMemo(
    () => new Set(lvRows.map((r: any) => String(r.posNr || "").trim())),
    [lvRows]
  );

  const rowIssues = useMemo(() => {
    const result: Record<number, RowIssue> = {};
    if (!det?.rows) return result;

    const seen = new Set<string>();

    det.rows.forEach((row, idx) => {
      const pos = String(row.posNr ?? "").trim();
      const me = String(row.einheit ?? "").trim().toLowerCase();
      const suggested = ME_SUGGEST[me];

      if (!pos) result[idx] = { ...(result[idx] || {}), empty: true };

      if (pos) {
        if (seen.has(pos)) result[idx] = { ...(result[idx] || {}), dupInFile: true };
        seen.add(pos);
        if (existingSet.has(pos)) result[idx] = { ...(result[idx] || {}), existsInLV: true };
      }

      if (suggested && suggested !== row.einheit) {
        result[idx] = { ...(result[idx] || {}), meSuggest: suggested };
      }
    });

    return result;
  }, [det, existingSet]);

  const counts = useMemo(() => {
    let leer = 0;
    let dupl = 0;
    let inLV = 0;
    let suggest = 0;
    let localErrors = 0;

    if (det?.rows) {
      det.rows.forEach((row, i) => {
        if (rowIssues[i]?.empty) leer++;
        if (rowIssues[i]?.dupInFile) dupl++;
        if (rowIssues[i]?.existsInLV) inLV++;
        if (rowIssues[i]?.meSuggest) suggest++;
        if (rowHasLocalError(row, rowIssues[i])) localErrors++;
      });
    }

    return { leer, dupl, inLV, suggest, localErrors };
  }, [det, rowIssues]);

  const filteredPreview = useMemo(() => {
    return preview.filter(({ row, originalIndex }) => {
      const issue = rowIssues[originalIndex] || {};

      if (filterMode === "fehler") return rowHasLocalError(row, issue);
      if (filterMode === "neu") return !issue.existsInLV;
      if (filterMode === "vorhanden") return !!issue.existsInLV;
      if (filterMode === "posNrFehlt") return !String(row.posNr || "").trim();
      if (filterMode === "einheitFehlt") return !String(row.einheit || "").trim() || !!issue.meSuggest;
      if (filterMode === "mengeFehlt") return toFiniteNumber(row.menge, 0) <= 0;
      if (filterMode === "doppelte") return !!issue.dupInFile || !!issue.existsInLV;

      return true;
    });
  }, [preview, filterMode, rowIssues]);

  const selectedImportedRows = useMemo(() => {
    return filteredPreview.filter(({ row, originalIndex }) => {
      return !!selectedRows[importedRowKey(row, originalIndex)];
    });
  }, [filteredPreview, selectedRows]);

  const selectedCount = selectedImportedRows.length;

  const importedTotal = det?.rows?.length ?? 0;
  const validationErrors = gaebResult?.errorCount ?? 0;
  const validationWarnings = gaebResult?.warningCount ?? 0;
  const gaebErrors = gaebResult?.errors ?? [];
  const gaebWarnings = gaebResult?.warnings ?? [];
  const gaebHasResult = !!gaebResult;
  const gaebIsValid = !!gaebResult?.valid;

  const visibleExportRows = useMemo<ExportFormatRow[]>(
    () => EXPORT_FORMAT_ROWS.filter((row) => row.family === activeExportFamily),
    [activeExportFamily]
  );

  const selectedExportRow = useMemo(() => {
    return (
      visibleExportRows.find((row) => String(row.code) === String(selectedExportCode)) ||
      visibleExportRows[0] ||
      null);

  }, [visibleExportRows, selectedExportCode]);

  useEffect(() => {
    if (!visibleExportRows.length) return;

    const exists = visibleExportRows.some((row) => String(row.code) === String(selectedExportCode));
    if (!exists) setSelectedExportCode(String(visibleExportRows[0].code));
  }, [visibleExportRows, selectedExportCode]);

  function persistCurrentImport(nextRows: ImportedRow[], customInfo?: string) {
    const nextDet: Detect | null = det ?
    {
      ...det,
      rows: nextRows,
      count: nextRows.length
    } :
    null;

    setDet(nextDet);
    setSelectedRows({});
    setOpenRows({});

    const code = projectCode.trim().toUpperCase();
    if (code && nextDet) saveGaebImportToLocal(code, nextDet);

    if (customInfo) setInfo(customInfo);
  }

  function toggleVisibleSelection() {
    const next: Record<string, boolean> = { ...selectedRows };
    const allSelected =
    filteredPreview.length > 0 &&
    filteredPreview.every(({ row, originalIndex }) => {
      return !!next[importedRowKey(row, originalIndex)];
    });

    filteredPreview.forEach(({ row, originalIndex }) => {
      const key = importedRowKey(row, originalIndex);

      if (allSelected) delete next[key];else
      next[key] = true;
    });

    setSelectedRows(next);
  }

  function deleteRowsByOriginalIndexes(indexes: number[], label: string) {
    if (!det?.rows?.length) {
      setInfo("Kein GAEB-Import vorhanden.");
      return;
    }

    const removeIndexSet = new Set(indexes);
    if (!removeIndexSet.size) {
      setInfo("Keine Positionen zum Löschen ausgewählt.");
      return;
    }

    const removedRows = det.rows.filter((_, idx) => removeIndexSet.has(idx));
    const nextImportRows = det.rows.filter((_, idx) => !removeIndexSet.has(idx));

    const posSet = new Set(
      removedRows.map((r) => String(r.posNr || "").trim()).filter(Boolean)
    );

    let removedFromLv = 0;

    if (posSet.size) {
      const beforeLv = LV.list();
      const nextLv = beforeLv.filter((r: any) => !posSet.has(String(r.posNr || "").trim()));
      removedFromLv = beforeLv.length - nextLv.length;

      if (removedFromLv > 0) {
        LV.setAll(nextLv);
        refreshLv();
        window.dispatchEvent(new StorageEvent("storage", { key: LV.key }));
      }
    }

    persistCurrentImport(
      nextImportRows,
      `${label}: ${removedRows.length} Position(en) aus der Importansicht entfernt. ${removedFromLv} passende LV-Position(en) entfernt.`
    );
  }

  function deleteSelectedImportedRowsFromLv() {
    const indexes = selectedImportedRows.map((x) => x.originalIndex);
    deleteRowsByOriginalIndexes(indexes, "Auswahl gelöscht");
  }

  function deleteImportedRowsFromLv(visibleOnly = false) {
    const indexes = visibleOnly ?
    filteredPreview.map((x) => x.originalIndex) :
    (det?.rows ?? []).map((_, idx) => idx);

    deleteRowsByOriginalIndexes(
      indexes,
      visibleOnly ? "Sichtbare importierte Positionen gelöscht" : "Alle importierten Positionen gelöscht"
    );
  }

  function editImportedRow(originalIndex: number) {
    if (!det?.rows?.[originalIndex]) {
      setInfo("Position nicht gefunden.");
      return;
    }

    const current = det.rows[originalIndex];

    const posNr = window.prompt("Positionsnummer", String(current.posNr || ""));
    if (posNr === null) return;

    const kurztext = window.prompt("Kurztext", String(current.kurztext || ""));
    if (kurztext === null) return;

    const langtext = window.prompt("Langtext", String(current.langtext || kurztext || ""));
    if (langtext === null) return;

    const einheit = window.prompt("Einheit / ME", String(current.einheit || ""));
    if (einheit === null) return;

    const mengeRaw = window.prompt("Menge", String(current.menge ?? ""));
    if (mengeRaw === null) return;

    const preisRaw = window.prompt("EP", String(current.preis ?? ""));
    if (preisRaw === null) return;

    const menge = toFiniteNumber(mengeRaw, 0);
    const preis = toFiniteNumber(preisRaw, 0);

    const nextRows = det.rows.map((row, idx) =>
    idx === originalIndex ?
    {
      ...row,
      posNr: posNr.trim(),
      kurztext: kurztext.trim(),
      langtext: langtext.trim(),
      einheit: einheit.trim(),
      menge,
      preis,
      gesamt: Number((menge * preis).toFixed(2)),
      waehrung: row.waehrung || "EUR"
    } :
    row
    );

    persistCurrentImport(nextRows, `Position ${posNr.trim() || originalIndex + 1} bearbeitet.`);
  }

  function autoFixGaebErrors() {
    if (!det?.rows?.length) {
      setInfo("Kein GAEB-Import zum Korrigieren vorhanden.");
      return;
    }

    let changedCount = 0;
    const log: string[] = [];

    const nextRows = det.rows.map((row, idx) => {
      const issue = rowIssues[idx];
      if (!rowHasLocalError(row, issue)) return row;

      const fixed = fixImportedRow(row);
      if (fixed.changed) {
        changedCount++;
        log.push(`${row.posNr || idx + 1}: ${fixed.changes.join(", ")}`);
        return fixed.row;
      }

      return row;
    });

    persistCurrentImport(
      nextRows,
      changedCount > 0 ?
      `${changedCount} GAEB-Position(en) automatisch korrigiert. Danach bitte erneut am Server speichern und X83/X84 prüfen.` :
      "Keine automatisch korrigierbaren GAEB-Fehler gefunden."
    );

    window.dispatchEvent(
      new CustomEvent("rlc:ki-action-result", {
        detail: {
          title: "GAEB-Fehler automatisch korrigiert",
          changes: log.slice(0, 50),
          warnings: log.length > 50 ? [`${log.length - 50} weitere Korrekturen nicht angezeigt.`] : []
        }
      })
    );
  }

  async function saveCurrentImportToServer() {
    if (!det?.rows?.length) {
      setInfo("Kein GAEB-Import zum Speichern vorhanden.");
      return;
    }

    const code = String(projectCode || "").trim().toUpperCase();

    if (code) {
      localStorage.setItem("rlc_current_project_key_v1", code);
      window.dispatchEvent(
        new CustomEvent("rlc:lv-updated", { detail: { projectCode: code } })
      );
    }

    await upsertToLV(det.rows);
  }

  async function transferX84PricesToDatabase() {
    if (!det?.rows?.length) {
      setInfo("Kein X84-Import vorhanden.");
      return;
    }

    const rowsWithPrice = det.rows.filter((row) => {
      const ep = toFiniteNumber((row as any).preis ?? (row as any).ep ?? (row as any).einzelpreis, 0);
      return ep > 0 && String(row.posNr || "").trim();
    });

    if (!rowsWithPrice.length) {
      setInfo("Keine X84-Preise zum Übertragen gefunden.");
      return;
    }

    setBusy(true);

    try {
      const now = new Date().toISOString();

      const items = rowsWithPrice.map((row) => {
        const posNr = String(row.posNr || "").trim();
        const menge = toFiniteNumber(row.menge, 1) || 1;
        const ep = toFiniteNumber((row as any).preis ?? (row as any).ep ?? (row as any).einzelpreis, 0);
        const gp = toFiniteNumber((row as any).gesamt, menge * ep);

        return {
          id: `x84-${projectCode}-${posNr}`,
          positionsnummer: posNr,
          positionNumber: posNr,
          posNr,
          kurztext: String(row.kurztext || "").trim(),
          langtext: String(row.langtext || "").trim(),
          einheit: String(row.einheit || "").trim(),
          menge,
          quelle: "x84-company-baseline",
          source: "x84-company-baseline",
          createdAt: now,
          updatedAt: now,
          risiko: "niedrig",
          confidence: 0.98,
          kiHinweis: "Aus GAEB X84 als Firmen-Baseline übernommen.",
          parameter: {
            einheit: String(row.einheit || "").trim()
          },
          kosten: {
            material: 0,
            lohn: 0,
            maschinen: 0,
            fremdleistung: 0,
            entsorgung: 0,
            transport: 0,
            gemeinkosten: 0,
            risiko: 0,
            gewinn: 0,
            epNetto: ep,
            gpNetto: gp
          },
          ressourcen: [
          {
            id: `x84-${projectCode}-${posNr}-ep`,
            typ: "sonstiges",
            bezeichnung: "X84 Firmenpreis",
            kurztext: String(row.kurztext || "").trim(),
            beschreibung: String(row.langtext || "").trim(),
            einheit: String(row.einheit || "").trim(),
            menge: 1,
            einzelpreis: ep,
            gesamtpreis: ep
          }]

        };
      });

      await KalkulationsDatenbank.bulkUpsertServer(items as any);

      setInfo(
        `X84-Preise in Firmen-Datenbank übertragen: ${items.length.toLocaleString("de-DE")} Position(en). Quelle: x84-company-baseline.`
      );
    } catch (e: any) {
      setInfo(`X84-Datenbankübertragung fehlgeschlagen: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }
  function clearCurrentImport() {
    const code = projectCode.trim().toUpperCase();

    setDet(null);
    setGaebResult(null);
    setSelectedRows({});
    setOpenRows({});
    setFilterMode("alle");

    if (code) clearGaebImportFromLocal(code);

    setInfo("GAEB-Import aus der aktuellen Ansicht entfernt.");
  }

  useEffect(() => {
    function onLvCommand(event: Event) {
      const detail = (event as CustomEvent<any>).detail || {};
      const filter = String(detail.filter || "");
      const action = String(detail.action || "");

      if (filter) {
        const map: Record<string, FilterMode> = {
          alle: "alle",
          fehler: "fehler",
          neu: "neu",
          vorhanden: "vorhanden",
          posNrFehlt: "posNrFehlt",
          einheitFehlt: "einheitFehlt",
          mengeFehlt: "mengeFehlt",
          doppelte: "doppelte"
        };

        const nextFilter = map[filter];

        if (nextFilter) {
          setFilterMode(nextFilter);
          setOpenRows({});
          setInfo(`KI-Filter aktiviert: ${gaebFilterLabel(nextFilter)}.`);
        }
      }

      if (action === "goKi") nav("/kalkulation/mit-ki");
      if (action === "goGaeb") setInfo("GAEB-Seite ist bereits geöffnet.");
      if (action === "syncServer") void saveCurrentImportToServer();
    }

    function onGaebCommand(event: Event) {
      const detail = (event as CustomEvent<any>).detail || {};
      const filter = String(detail.filter || "");
      const action = String(detail.action || "");
      const mode = String(detail.mode || "").toLowerCase() as GaebMode;

      if (filter) {
        const map: Record<string, FilterMode> = {
          errors: "fehler",
          fehler: "fehler",
          posNrFehlt: "posNrFehlt",
          einheitFehlt: "einheitFehlt",
          mengeFehlt: "mengeFehlt",
          doppelte: "doppelte",
          vorhanden: "vorhanden",
          neu: "neu"
        };

        const nextFilter = map[filter];
        if (nextFilter) {
          setFilterMode(nextFilter);
          setInfo(`KI-Filter aktiviert: ${gaebFilterLabel(nextFilter)}.`);
        }
      }

      if (action === "validate" && (mode === "x83" || mode === "x84")) void handleValidate(mode);

      if (action === "export" && (mode === "x83" || mode === "x84")) {
        const target = EXPORT_TARGETS.find((x) => x.mode === mode);
        if (target) void handleProjectExport(target);
      }

      if (action === "showErrors") {
        setFilterMode("fehler");

        const el = document.getElementById("rlc-gaeb-pruefergebnis");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          setInfo("KI: GAEB-Fehleransicht geöffnet.");
        } else {
          setInfo("KI: Lokale Fehleransicht aktiviert. Für Serverfehler zuerst GAEB prüfen.");
        }
      }

      if (action === "autoFixErrors") autoFixGaebErrors();
      if (action === "saveImportToServer") void saveCurrentImportToServer();
      if (action === "deleteImportedFromLv") deleteImportedRowsFromLv(false);
      if (action === "deleteVisibleImportedFromLv") deleteImportedRowsFromLv(true);
      if (action === "deleteSelectedImportedFromLv") deleteSelectedImportedRowsFromLv();
      if (action === "clearImport") clearCurrentImport();
    }

    window.addEventListener("rlc:lv-command", onLvCommand);
    window.addEventListener("rlc:gaeb-command", onGaebCommand);

    return () => {
      window.removeEventListener("rlc:lv-command", onLvCommand);
      window.removeEventListener("rlc:gaeb-command", onGaebCommand);
    };
  }, [nav, projectCode, det, filteredPreview, selectedImportedRows, rowIssues]);

  async function onUpload(file: File) {
    setBusy(true);
    setInfo("Datei wird verarbeitet …");
    setGaebResult(null);
    setDet(null);
    setOpenRows({});
    setSelectedRows({});

    try {
      const code = projectCode.trim().toUpperCase();
      if (!code) throw new Error("Projektcode fehlt.");

      let browserFallback: Detect | null = null;

      try {
        const txt = await file.text();
        if (
        txt.includes("<GAEB") ||
        txt.includes("<BoQ") ||
        txt.includes("<Item") ||
        txt.includes("RNoPart"))
        {
          browserFallback = parseGaebXmlFallback(txt, file.name);
        }
      } catch {
        browserFallback = null;
      }

      const form = new FormData();
      form.append("file", file);

      let serverJson: any = null;
      let serverOk = false;
      let serverError = "";

      try {
        const response = await fetch(
          apiUrl(`/api/project-lv/${encodeURIComponent(code)}/import-file`),
          {
            method: "POST",
            body: form,
            credentials: "include",
            headers: withAuthHeaders()
          }
        );

        serverJson = await response.json().catch(() => null);
        serverOk = response.ok && !!serverJson;

        if (!serverOk) {
          serverError = serverJson?.error || "GAEB-Import am Server fehlgeschlagen.";
        }
      } catch (e: any) {
        serverError = e?.message || "GAEB-Import am Server fehlgeschlagen.";
      }

      const detectedFormat = normalizeFormat(
        serverJson?.format ?? serverJson?.detectedType ?? serverJson?.type,
        file.name
      );

      const rawRows = serverJson ? extractImportRows(serverJson) : [];
      const mappedRows = mapImportedRows(rawRows);

      let nextDet: Detect;

      function importQuality(rows: ImportedRow[]): number {
        const seen = new Set<string>();
        let score = 0;

        for (const r of rows) {
          const pos = String(r.posNr || "").trim();
          const text = String(r.kurztext || r.langtext || "").trim();
          const unit = String(r.einheit || "").trim();
          const qty = toFiniteNumber(r.menge, 0);

          if (pos) score += 3;
          if (/^\d+(?:\.\d+)*$/.test(pos)) score += 3;
          if (text.length >= 3) score += 5;
          if (unit) score += 2;
          if (qty > 0) score += 2;

          if (!pos) score -= 10;
          if (!text) score -= 10;
          if (!unit) score -= 4;
          if (qty <= 0) score -= 4;

          if (seen.has(pos) && pos) score -= 8;
          if (pos) seen.add(pos);

          // GAEB-Fehlerbild: Preis/Zahl als Kurztext oder Position
          if (/^[\d.,]+$/.test(text)) score -= 12;
          if (/^[\d.,]+$/.test(pos) && !/^\d{3,}$/.test(pos)) score -= 8;

          // GAEB-X84 Fehlerbild vom Server:
          // "Position 001" ist nur Platzhalter, kein echter Kurztext.
          if (/^position\s+\d+$/i.test(text)) score -= 25;

          // Preis vorhanden, aber Menge 0 und kein echter Text = sehr wahrscheinlich falsch gelesen.
          const ep = toFiniteNumber(r.preis, 0);
          if (ep > 0 && qty <= 0 && /^position\s+\d+$/i.test(text)) score -= 25;
        }

        return score;
      }

      const serverQuality = importQuality(mappedRows);
      const fallbackQuality = browserFallback ? importQuality(browserFallback.rows) : -999999;

      const serverLooksBroken =
      mappedRows.some((r) => {
        const text = String(r.kurztext || r.langtext || "").trim();
        const unit = String(r.einheit || "").trim();
        const qty = toFiniteNumber(r.menge, 0);
        const ep = toFiniteNumber(r.preis, 0);

        return (
          /^[\d.,]+$/.test(text) ||
          !text && !unit && qty <= 0 ||
          ep > 0 && qty <= 0 && !unit);

      });

      const fallbackIsBetter =
      !!browserFallback &&
      browserFallback.rows.length > 0 && (

      !serverOk ||
      mappedRows.length === 0 ||
      serverLooksBroken ||
      fallbackQuality > serverQuality ||
      browserFallback.rows.length > mappedRows.length * 1.4);


      if (fallbackIsBetter && browserFallback) {
        nextDet = browserFallback;

        setInfo(
          serverOk ?
          `Import erfolgreich: ${browserFallback.format} • ${browserFallback.rows.length.toLocaleString(
            "de-DE"
          )} Positionen. Browser-Parser gewählt, weil Server nur ${mappedRows.length.toLocaleString(
            "de-DE"
          )} Positionen sauber gelesen hat.` :
          `Import über Browser-Fallback erfolgreich: ${browserFallback.format} • ${browserFallback.rows.length.toLocaleString(
            "de-DE"
          )} Positionen. Servermeldung: ${serverError || "keine Positionsdaten vom Server"}`
        );
      } else if (serverOk && mappedRows.length > 0) {
        nextDet = {
          format: detectedFormat,
          name: file.name,
          count: mappedRows.length,
          rows: mappedRows
        };

        setInfo(
          `Import erfolgreich: ${detectedFormat} • ${mappedRows.length.toLocaleString(
            "de-DE"
          )} Positionen.`
        );
      } else {
        throw new Error(
          serverError ||
          `${detectedFormat} erkannt, aber weder Server noch Browser-Fallback konnten Positionsdaten lesen.`
        );
      }
      const fmtUpper = String(nextDet.format || "").toUpperCase();

      if (fmtUpper === "X84") {
        const baseRows = LV.list();
        const enrichedRows = enrichPriceRowsWithLvBase(nextDet.rows, baseRows);

        const enrichedCount = enrichedRows.filter((r) => !isPlaceholderText(r.kurztext)).length;

        nextDet = {
          ...nextDet,
          rows: enrichedRows,
          count: enrichedRows.length
        };

        if (enrichedCount > 0) {
          setInfo(
            `Import erfolgreich: X84 • ${enrichedRows.length.toLocaleString(
              "de-DE"
            )} Preispositionen. Texte/Mengen aus vorhandenem LV ergänzt: ${enrichedCount.toLocaleString("de-DE")}.`
          );
        } else {
          setInfo(
            `X84 enthält hauptsächlich Preise ohne LV-Texte. Bitte zuerst X81/X83 importieren und speichern, danach X84 erneut importieren.`
          );
        }
      }

      setDet(nextDet);
      saveGaebImportToLocal(code, nextDet);
    } catch (e: any) {
      setDet(null);
      setInfo(`Fehler: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function upsertToLV(rows: ImportedRow[]) {
    setBusy(true);

    let inserted = 0;
    let updated = 0;

    const current = LV.list();
    const map = new Map(current.map((x: any) => [String(x.posNr || "").trim(), x] as const));

    for (const row of rows) {
      const posNr = String(row.posNr ?? "").trim();
      if (!posNr) continue;

      const existing = map.get(posNr);
      const menge = Number(row.menge || 0);
      const preis = row.preis != null ? Number(row.preis) : undefined;
      const gesamt =
      row.gesamt != null ?
      Number(row.gesamt) :
      Number((toFiniteNumber(menge, 0) * toFiniteNumber(preis, 0)).toFixed(2));

      if (existing) {
        LV.upsert({
          ...existing,
          posNr,
          parentPosNr: row.parentPosNr ?? existing.parentPosNr ?? "",
          kurztext: row.kurztext || existing.kurztext || "",
          langtext: row.langtext || existing.langtext || "",
          bemerkung: row.bemerkung || existing.bemerkung || "",
          einheit: row.einheit || existing.einheit || "",
          menge,
          preis,
          gesamt,
          waehrung: row.waehrung || existing.waehrung || "EUR",
          confidence: row.confidence != null ? Number(row.confidence) : existing.confidence,
          source: existing.source || "gaeb"
        } as LVPos);

        updated++;
      } else {
        LV.upsert({
          id:
          typeof crypto !== "undefined" && "randomUUID" in crypto ?
          crypto.randomUUID() :
          `gaeb-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          posNr,
          parentPosNr: row.parentPosNr || "",
          kurztext: row.kurztext || "",
          langtext: row.langtext || "",
          bemerkung: row.bemerkung || "",
          einheit: row.einheit || "",
          menge,
          preis,
          gesamt,
          waehrung: row.waehrung || "EUR",
          confidence: row.confidence != null ? Number(row.confidence) : undefined,
          source: "gaeb"
        } as LVPos);

        inserted++;
      }
    }

    refreshLv();

    const code = projectCode.trim().toUpperCase();

    if (!code) {
      setInfo(`Lokal übernommen — neu: ${inserted}, aktualisiert: ${updated}. Projektcode fehlt für Server-Speicherung.`);
      setBusy(false);
      return;
    }

    const payloadItems = rows.
    filter((r) => String(r.posNr ?? "").trim()).
    map((r) => ({
      pos: String(r.posNr ?? "").trim(),
      parentPos: String(r.parentPosNr ?? "").trim(),
      text: String(r.kurztext ?? "").trim(),
      langtext: String(r.langtext ?? "").trim(),
      bemerkung: String(r.bemerkung ?? "").trim(),
      unit: String(r.einheit ?? "").trim(),
      quantity: Number(r.menge ?? 0),
      ep: r.preis == null || !Number.isFinite(Number(r.preis)) ? null : Number(r.preis),
      total: r.gesamt == null || !Number.isFinite(Number(r.gesamt)) ? null : Number(r.gesamt),
      currency: r.waehrung || "EUR"
    }));

    if (!payloadItems.length) {
      setInfo("Keine importierbaren Positionen gefunden. Server-Speicherung wurde nicht ausgeführt.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch(apiUrl(`/api/project-lv/${encodeURIComponent(code)}/import`), {
        method: "POST",
        credentials: "include",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          title: `LV ${code}`,
          currency: "EUR",
          items: payloadItems
        })
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(json?.error || "Server-Speicherung fehlgeschlagen");

      setInfo(
        `GAEB-Import am Server gespeichert — lokal neu: ${inserted}, aktualisiert: ${updated}, Server-Zeilen: ${Number(
          json?.count || payloadItems.length
        )}.`
      );
    } catch (e: any) {
      setInfo(`Lokal übernommen — neu: ${inserted}, aktualisiert: ${updated}. Server-Fehler: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function exportLegacyGAEB(format: Fmt, fallbackName?: string) {
    setBusy(true);
    setInfo("");

    try {
      const rows = LV.list();

      const response = await fetch(apiUrl("/api/gaeb/export"), {
        method: "POST",
        credentials: "include",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ format, rows })
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json?.error || "Export fehlgeschlagen");
      }

      await downloadBlobFromResponse(response, fallbackName || `lv.${String(format).toLowerCase()}`);
      setInfo(`Export erstellt (${format}).`);
    } catch (e: any) {
      setInfo(`Export-Fehler: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function validateProjectGaeb(mode: GaebMode): Promise<GaebValidationResponse> {
    const code = projectCode.trim().toUpperCase();
    if (!code) throw new Error("Projektcode fehlt.");

    const response = await fetch(
      apiUrl(`/api/project-lv/${encodeURIComponent(code)}/export/gaeb/validate?mode=${mode}`),
      {
        method: "POST",
        credentials: "include",
        headers: withAuthHeaders()
      }
    );

    const json = await response.json().catch(() => ({}) as any);

    if (!response.ok) throw new Error(json?.error || `Validierung ${mode.toUpperCase()} fehlgeschlagen`);

    const errors = normalizeIssues(json?.errors, "error");
    const warnings = normalizeIssues(json?.warnings, "warning");

    return {
      ...json,
      mode,
      errors,
      warnings,
      errorCount: Number(json?.errorCount ?? errors.length ?? 0),
      warningCount: Number(json?.warningCount ?? warnings.length ?? 0),
      valid: Boolean(json?.valid ?? json?.ok)
    };
  }

  async function handleValidate(mode: GaebMode) {
    setGaebBusy(mode);
    setInfo("");

    try {
      const result = await validateProjectGaeb(mode);
      setGaebResult(result);

      setInfo(
        result.valid ?
        `GAEB ${mode.toUpperCase()} ist valide.` :
        `GAEB ${mode.toUpperCase()} ist nicht valide. Fehler: ${result.errorCount || 0}, Warnungen: ${result.warningCount || 0}.`
      );
    } catch (e: any) {
      setGaebResult({
        mode,
        valid: false,
        errorCount: 1,
        warningCount: 0,
        errors: [{ type: "error", field: "system", message: e?.message || "Unbekannter Validierungsfehler" }],
        warnings: []
      });

      setInfo(`Validierungs-Fehler: ${e?.message || e}`);
    } finally {
      setGaebBusy(null);
    }
  }

  async function handleProjectExport(target: ExportTarget) {
    const mode = target.mode;
    setGaebBusy(mode);
    setInfo("");

    try {
      const validation = await validateProjectGaeb(mode);
      setGaebResult(validation);

      if (!validation.valid) {
        setInfo(`Export ${mode.toUpperCase()} blockiert. Fehler: ${validation.errorCount || 0}, Warnungen: ${validation.warningCount || 0}.`);
        return;
      }

      const code = projectCode.trim().toUpperCase();

      const response = await fetch(apiUrl(`/api/project-lv/${encodeURIComponent(code)}/export/gaeb/${mode}`), {
        method: "GET",
        credentials: "include",
        headers: withAuthHeaders()
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json?.error || `Export ${mode.toUpperCase()} fehlgeschlagen`);
      }

      await downloadBlobFromResponse(response, `${code}.${mode}`);
      setInfo(`Export ${mode.toUpperCase()} erfolgreich erstellt.`);
    } catch (e: any) {
      if (target.fallbackFormat) {
        setInfo(`Projekt-Export ${mode.toUpperCase()} nicht verfügbar. Versuche Legacy-Export ${target.fallbackFormat} …`);
        await exportLegacyGAEB(target.fallbackFormat, `lv.${mode}`);
        return;
      }

      setInfo(`Export-Fehler: ${e?.message || e}`);
    } finally {
      setGaebBusy(null);
    }
  }

  async function handleValidateRow(row: ExportFormatRow) {
    if (row.projectMode) {
      await handleValidate(row.projectMode);
      return;
    }

    setGaebResult({
      valid: true,
      errorCount: 0,
      warningCount: 1,
      errors: [],
      warnings: [
      {
        type: "warning",
        field: "export",
        message: `${row.code}: Für dieses Format ist aktuell keine separate Projektvalidierung aktiv. Export läuft über Legacy-/Server-Export.`
      }]

    });

    setInfo(`${row.code}: Keine separate Projektprüfung notwendig. Export kann gestartet werden.`);
  }

  async function handleExportRow(row: ExportFormatRow) {
    if (row.projectMode) {
      const target =
      EXPORT_TARGETS.find((x) => x.mode === row.projectMode) || {
        mode: row.projectMode,
        label: row.code,
        description: row.description,
        group: "GAEB XML" as const,
        fallbackFormat: "GAEBXML" as Fmt
      };

      await handleProjectExport(target);
      return;
    }

    if (row.legacyFormat) {
      await exportLegacyGAEB(row.legacyFormat);
      return;
    }

    setInfo(`Export-Fehler: ${row.code} ist noch nicht implementiert.`);
  }

  return (
    <div className={rlcClass(null, page)}>
      <section className={rlcClass("rlc-page-hero", heroCard)}>
        <div>
          <div className={rlcClass(null, eyebrow)}>RLC GAEB-Schnittstelle</div>
          <h1 className={rlcClass(null, title)}>GAEB Import / Export</h1>
          <p className={rlcClass(null, subtitle)}>
            Zentrale GAEB- und Aufmaß-Schnittstelle für X80–X86, X89, X94,
            P81–P86, D81–D86, X31 und DA11.
          </p>
        </div>

        <div className={rlcClass(null, heroActions)}>
          <label className={rlcClass(null, btnHeroSecondary)}>
            GAEB-Datei auswählen
            <input
              type="file"
              accept={ACCEPT_TYPES}

              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onUpload(file);
                e.currentTarget.value = "";
              }}
              disabled={busy} className="rlc-migrated-pages-kalkulation-gaeb-tsx-861" />
            
          </label>

          <button
            type="button" className={rlcClass(null,
            btnHeroPrimary)}
            disabled={!det || busy}
            onClick={() => void runRlcAction("gaeb-save-server", "GAEB am Server speichern", () => saveCurrentImportToServer())}>
            
            Speichern am Server
          </button>

          <button type="button" className={rlcClass(null, btnHeroSecondary)} onClick={() => void runRlcAction("gaeb-autofix", "GAEB Fehler korrigieren", () => autoFixGaebErrors())} disabled={!det}>
            Fehler korrigieren
          </button>

          <button type="button" className={rlcClass(null, btnHeroSecondary)} onClick={() => nav("/kalkulation/lv-import")}>
            LV öffnen
          </button>

          <button type="button" className={rlcClass(null, btnHeroSecondary)} onClick={() => nav("/kalkulation/mit-ki")}>
            KI öffnen
          </button>
        </div>

        <div className={rlcClass(null, heroMeta)}>
          Projekt: <b>{projectCode || "—"}</b>
          {det ?
          <span>
              {" "}
              · Datei: <b>{det.name}</b>
            </span> :
          null}
          {gaebHasResult ?
          <span>
              {" "}
              · Status: <b>{gaebIsValid ? "valide" : "nicht valide"}</b>
            </span> :
          null}
        </div>
      </section>

      <section className={rlcClass(null, grid4)}>
        <KpiCard label="LV Positionen" value={String(lvRows.length)} />
        <KpiCard label="Importierte Positionen" value={String(importedTotal)} />
        <KpiCard label="Lokale Fehler" value={String(counts.localErrors)} />
        <KpiCard label="Server-Fehler" value={String(validationErrors)} sub={gaebHasResult ? "aus letzter Validierung" : "noch nicht validiert"} />
      </section>

      <section className={rlcClass(null, card)}>
        <div className={rlcClass(null, sectionHead)}>
          <div>
            <h2 className={rlcClass(null, sectionTitle)}>Projektbezogener Export</h2>
            <div className={rlcClass(null, sectionText)}>
              GAEB-/REB-Export kompakt über Auswahlmenü. X83 und X84 werden projektbezogen geprüft,
              ältere Formate laufen über die passende Legacy-/Fallback-Route.
            </div>
          </div>

          <div className={rlcClass(null, badgeStyle(gaebIsValid ? "success" : gaebHasResult ? "error" : "neutral"))}>
            {gaebHasResult ? gaebIsValid ? "Export freigegeben" : "Prüfung offen / Fehler" : "Nicht geprüft"}
          </div>
        </div>

        <div className={rlcClass(null, gaebDropdownShell)}>
          <div className={rlcClass(null, gaebSelectorGrid)}>
            <label className={rlcClass(null, gaebSelectLabel)}>
              Formatfamilie
              <select className={rlcClass(null,
              gaebSelect)}
              value={activeExportFamily}
              onChange={(e) => setActiveExportFamily(e.target.value as ExportFamilyKey)}>
                
                {EXPORT_FAMILY_TABS.map((tab) =>
                <option key={tab.key} value={tab.key}>
                    {tab.label}
                  </option>
                )}
              </select>
            </label>

            <label className={rlcClass(null, gaebSelectLabel)}>
              Ausgabeformat
              <select className={rlcClass(null,
              gaebSelect)}
              value={selectedExportRow?.code || ""}
              onChange={(e) => setSelectedExportCode(e.target.value)}>
                
                {visibleExportRows.map((row) =>
                <option key={row.code} value={row.code}>
                    {row.code.toUpperCase()} · {row.description}
                  </option>
                )}
              </select>
            </label>

            <div className={rlcClass(null, selectedFormatBox)}>
              <div className={rlcClass(null, selectedFormatCode)}>{selectedExportRow?.code?.toUpperCase() || "—"}</div>
              <div className={rlcClass(null, selectedFormatText)}>{selectedExportRow?.description || "Kein Format gewählt"}</div>
            </div>
          </div>

          <div className={rlcClass(null, gaebMainActions)}>
            <button
              type="button" className={rlcClass(null,
              buttonBase)}
              disabled={!selectedExportRow || !!gaebBusy}
              onClick={() => selectedExportRow && void handleValidateRow(selectedExportRow)}>
              
              Prüfen
            </button>

            <button
              type="button" className={rlcClass(null,
              buttonPrimary)}
              disabled={!selectedExportRow || !!gaebBusy}
              onClick={() => selectedExportRow && void handleExportRow(selectedExportRow)}>
              
              Export
            </button>
          </div>

          <details className={rlcClass(null, formatDetailsBox)}>
            <summary className={rlcClass(null, formatDetailsSummary)}>Weitere Formate dieser Familie anzeigen</summary>

            <div className={rlcClass(null, formatCompactList)}>
              {visibleExportRows.map((row) =>
              <button
                key={row.code}
                type="button" className={rlcClass(null,
                String(row.code) === String(selectedExportRow?.code) ? formatCompactItemActive : formatCompactItem)}
                onClick={() => setSelectedExportCode(String(row.code))}>
                
                  <b>{row.code.toUpperCase()}</b>
                  <span>{row.description}</span>
                </button>
              )}
            </div>
          </details>
        </div>
      </section>

      <section className={rlcClass(null, card)}>
        <div className={rlcClass(null, sectionHead)}>
          <div>
            <h2 className={rlcClass(null, sectionTitle)}>Import & Weiterverarbeitung</h2>
            <div className={rlcClass(null, sectionText)}>
              GAEB-Datei einlesen, Vorschau prüfen, Positionen bearbeiten, Fehler korrigieren und am Server speichern.
            </div>
          </div>
        </div>

        <div className={rlcClass(null, actionGrid)}>
          <div className={rlcClass(null, actionCard)}>
            <div className={rlcClass(null, actionTitle)}>1. Datei importieren</div>
            <div className={rlcClass(null, actionText)}>Unterstützt werden GAEB XML, GAEB 2000, GAEB 90, DA11 und X31.</div>

            <div className={rlcClass(null, buttonRow)}>
              <label className={rlcClass(null, buttonPrimary)}>
                Datei auswählen
                <input
                  type="file"
                  accept={ACCEPT_TYPES}

                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onUpload(file);
                    e.currentTarget.value = "";
                  }}
                  disabled={busy} className="rlc-migrated-pages-kalkulation-gaeb-tsx-862" />
                
              </label>
            </div>
          </div>

          <div className={rlcClass(null, actionCard)}>
            <div className={rlcClass(null, actionTitle)}>2. Prüfen / Korrigieren</div>
            <div className={rlcClass(null, actionText)}>
              Fehlende Kurztexte, Langtexte, Einheiten und Mengen werden direkt bearbeitet oder automatisch ergänzt.
            </div>

            <div className={rlcClass(null, buttonRow)}>
              <button type="button" className={rlcClass(null, buttonPrimary)} disabled={!det} onClick={() => void runRlcAction("gaeb-autofix", "GAEB Fehler korrigieren", () => autoFixGaebErrors())}>
                GAEB-Fehler automatisch korrigieren
              </button>

              <button type="button" className={rlcClass(null, buttonBase)} disabled={!det} onClick={() => setFilterMode("fehler")}>
                Fehler anzeigen
              </button>

              <button type="button" className={rlcClass(null, buttonBase)} disabled={selectedCount <= 0} onClick={deleteSelectedImportedRowsFromLv}>
                Auswahl löschen ({selectedCount})
              </button>
            </div>
          </div>

          <div className={rlcClass(null, actionCard)}>
            <div className={rlcClass(null, actionTitle)}>3. Speichern / Weiterarbeiten</div>
            <div className={rlcClass(null, actionText)}>Import bleibt lokal erhalten und kann gezielt gespeichert oder entfernt werden.</div>

            <div className={rlcClass(null, buttonRow)}>
              <button type="button" className={rlcClass(null, buttonPrimary)} disabled={!det || busy} onClick={() => void runRlcAction("gaeb-save-server", "GAEB am Server speichern", () => saveCurrentImportToServer())}>
                Speichern am Server
              </button>

              <button
                type="button" className={rlcClass(null,
                buttonPrimary)}
                disabled={!det || busy}
                onClick={() => void transferX84PricesToDatabase()}>
                
                X84 in Datenbank
              </button>
              <button type="button" className={rlcClass(null, buttonBase)} disabled={!det} onClick={() => det && exportPreviewCSV(det.rows)}>
                Vorschau CSV
              </button>

              <button type="button" className={rlcClass(null, buttonBase)} onClick={() => nav("/kalkulation/lv-import")}>
                LV bearbeiten
              </button>

              <button type="button" className={rlcClass(null, buttonBase)} onClick={() => nav("/kalkulation/mit-ki")}>
                KI-Kalkulation
              </button>
            </div>
          </div>
        </div>

        <div className="rlc-migrated-pages-kalkulation-gaeb-tsx-863">
          <div className={rlcClass(null, statusBox(info))}>
            {busy || gaebBusy ? "Bitte warten …" : info || "Noch keine Datei importiert."}
          </div>
        </div>
      </section>

      {det ?
      <>
          <section className={rlcClass(null, card)}>
            <div className={rlcClass(null, sectionHead)}>
              <div>
                <h2 className={rlcClass(null, sectionTitle)}>Importübersicht</h2>
                <div className={rlcClass(null, sectionText)}>Datei, erkanntes Format, Anzahl Positionen und automatische Prüfhilfen.</div>
              </div>

              <div className={rlcClass(null, formatBadgeByFmt(det.format))}>
                {det.format} · {det.count.toLocaleString("de-DE")} Positionen
              </div>
            </div>

            <div className={rlcClass(null, grid5)}>
              <KpiCard label="Datei" value={det.name} />
              <KpiCard label="Fehler lokal" value={String(counts.localErrors)} />
              <KpiCard label="Leer PosNr" value={String(counts.leer)} />
              <KpiCard label="Duplikate Datei" value={String(counts.dupl)} />
              <KpiCard label="Bereits im LV" value={String(counts.inLV)} />
              <KpiCard label="ME-Vorschläge" value={String(counts.suggest)} />
            </div>

            <div className={rlcClass(null, filterRow)}>
              <button type="button" className={rlcClass(null, filterMode === "alle" ? buttonPrimary : buttonBase)} onClick={() => setFilterMode("alle")}>
                Alle
              </button>

              <button type="button" className={rlcClass(null, filterMode === "fehler" ? buttonPrimary : buttonBase)} onClick={() => setFilterMode("fehler")}>
                Fehler
              </button>

              <button type="button" className={rlcClass(null, filterMode === "neu" ? buttonPrimary : buttonBase)} onClick={() => setFilterMode("neu")}>
                Nur neue
              </button>

              <button type="button" className={rlcClass(null, filterMode === "vorhanden" ? buttonPrimary : buttonBase)} onClick={() => setFilterMode("vorhanden")}>
                Bereits im LV
              </button>

              <button type="button" className={rlcClass(null, filterMode === "posNrFehlt" ? buttonPrimary : buttonBase)} onClick={() => setFilterMode("posNrFehlt")}>
                PosNr fehlt
              </button>

              <button type="button" className={rlcClass(null, filterMode === "einheitFehlt" ? buttonPrimary : buttonBase)} onClick={() => setFilterMode("einheitFehlt")}>
                Einheit fehlt / falsch
              </button>

              <button type="button" className={rlcClass(null, filterMode === "mengeFehlt" ? buttonPrimary : buttonBase)} onClick={() => setFilterMode("mengeFehlt")}>
                Menge fehlt
              </button>

              <button type="button" className={rlcClass(null, filterMode === "doppelte" ? buttonPrimary : buttonBase)} onClick={() => setFilterMode("doppelte")}>
                Doppelte / Konflikte
              </button>

              <button type="button" className={rlcClass(null, buttonBase)} disabled={!filteredPreview.length} onClick={toggleVisibleSelection}>
                Sichtbare auswählen / abwählen
              </button>

              <button
              type="button" className={rlcClass(null,
              selectedCount > 0 ? dangerButton : buttonBase)}
              disabled={selectedCount <= 0}
              onClick={deleteSelectedImportedRowsFromLv}>
              
                Auswahl löschen ({selectedCount})
              </button>

              <button type="button" className={rlcClass(null, buttonPrimary)} disabled={!det || busy} onClick={() => void runRlcAction("gaeb-autofix", "GAEB Fehler korrigieren", () => autoFixGaebErrors())}>
                Fehler korrigieren
              </button>

              <button type="button" className={rlcClass(null, buttonPrimary)} disabled={!det || busy} onClick={() => void runRlcAction("gaeb-save-server", "GAEB am Server speichern", () => saveCurrentImportToServer())}>
                Speichern am Server
              </button>

              <button type="button" className={rlcClass(null, buttonBase)} disabled={!det} onClick={() => void runRlcAction("gaeb-clear-import", "GAEB Import entfernen", () => clearCurrentImport())}>
                Import aus Ansicht entfernen
              </button>
            </div>
          </section>

          <section className={rlcClass(null, card)}>
            <div className={rlcClass(null, sectionHead)}>
              <div>
                <h2 className={rlcClass(null, sectionTitle)}>Vorschau importierte Positionen</h2>
                <div className={rlcClass(null, sectionText)}>Maximal 500 Zeilen. Jede Position kann einzeln ausgewählt und bearbeitet werden.</div>
              </div>
            </div>

            <div className={rlcClass(null, tableWrap)}>
              <table className={rlcClass(null, { ...table, minWidth: 1580 })}>
                <thead>
                  <tr>
                    <th className={rlcClass(null, th)}>Auswahl</th>
                    <th className={rlcClass(null, th)}>PosNr</th>
                    <th className={rlcClass(null, th)}>Kurztext</th>
                    <th className={rlcClass(null, th)}>Langtext</th>
                    <th className={rlcClass(null, th)}>ME</th>
                    <th className={rlcClass(null, thRight)}>Menge</th>
                    <th className={rlcClass(null, thRight)}>EP</th>
                    <th className={rlcClass(null, thRight)}>Gesamt</th>
                    <th className={rlcClass(null, th)}>Hinweise</th>
                    <th className={rlcClass(null, th)}>Aktion</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredPreview.map(({ row, originalIndex }, i) => {
                  const issue = rowIssues[originalIndex] || {};
                  const open = !!openRows[originalIndex];
                  const selectKey = importedRowKey(row, originalIndex);
                  const selected = !!selectedRows[selectKey];
                  const hasError = rowHasLocalError(row, issue);

                  const bg = hasError ?
                  "#FFF5F5" :
                  issue.dupInFile ?
                  "#FFF9E8" :
                  issue.existsInLV ?
                  "#F6FAFF" :
                  i % 2 ?
                  "#FCFCFC" :
                  "#FFFFFF";

                  return (
                    <tr key={`${row.posNr || "row"}-${originalIndex}-${i}`} className={rlcClass(null, { background: bg })}>
                        <td className={rlcClass(null, td)}>
                          <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) =>
                          setSelectedRows((s) => ({
                            ...s,
                            [selectKey]: e.target.checked
                          }))
                          } />
                        
                        </td>

                        <td className={rlcClass(null, tdStrong)}>{row.posNr ?? ""}</td>
                        <td className={rlcClass(null, td)}>{row.kurztext ?? ""}</td>

                        <td className={rlcClass(null, td)}>
                          {row.langtext ?
                        <>
                              <button type="button" className={rlcClass(null, textButton)} onClick={() => setOpenRows((s) => ({ ...s, [originalIndex]: !open }))}>
                                {open ? "Langtext ausblenden" : "Langtext anzeigen"}
                              </button>

                              {open ? <div className={rlcClass(null, longTextBox)}>{String(row.langtext)}</div> : null}
                            </> :

                        <span className="rlc-migrated-pages-kalkulation-gaeb-tsx-864">—</span>
                        }
                        </td>

                        <td className={rlcClass(null, td)}>
                          {row.einheit ?? ""}
                          {issue.meSuggest ?
                        <span className={rlcClass(null, { ...miniBadge, marginLeft: 6 })}>ME → {issue.meSuggest}</span> :
                        null}
                        </td>

                        <td className={rlcClass(null, tdRight)}>{row.menge != null ? fmtNumber(row.menge) : ""}</td>
                        <td className={rlcClass(null, tdRight)}>{row.preis != null ? fmtNumber(row.preis) : ""}</td>
                        <td className={rlcClass(null, tdRight)}>{row.gesamt != null ? fmtNumber(row.gesamt) : ""}</td>

                        <td className={rlcClass(null, td)}>
                          {issue.empty ? <span className={rlcClass(null, badgeError)}>PosNr leer</span> : null}
                          {hasError ? <span className={rlcClass(null, { ...badgeError, marginLeft: 6 })}>Fehler</span> : null}
                          {issue.dupInFile ? <span className={rlcClass(null, { ...badgeWarn, marginLeft: 6 })}>Duplikat Datei</span> : null}
                          {issue.existsInLV ? <span className={rlcClass(null, { ...badgeNeutral, marginLeft: 6 })}>im LV vorhanden</span> : null}
                          {!hasError && !issue.dupInFile && !issue.existsInLV ? <span className={rlcClass(null, badgeOk)}>Neu</span> : null}
                        </td>

                        <td className={rlcClass(null, td)}>
                          <button type="button" className={rlcClass(null, smallButton)} onClick={() => editImportedRow(originalIndex)}>
                            Bearbeiten
                          </button>
                        </td>
                      </tr>);

                })}

                  {!filteredPreview.length ?
                <tr>
                      <td colSpan={10} className="rlc-migrated-pages-kalkulation-gaeb-tsx-865">
                        Keine Daten in der aktuellen Filteransicht.
                      </td>
                    </tr> :
                null}
                </tbody>
              </table>
            </div>
          </section>
        </> :
      null}

      {gaebHasResult ?
      <section id="rlc-gaeb-pruefergebnis" className={rlcClass(null, card)}>
          <div className={rlcClass(null, sectionHead)}>
            <div>
              <h2 className={rlcClass(null, sectionTitle)}>Prüfergebnis {gaebResult?.mode ? `(${gaebResult.mode.toUpperCase()})` : ""}</h2>
              <div className={rlcClass(null, sectionText)}>Fehler und Warnungen aus der projektbezogenen GAEB-Prüfung.</div>
            </div>

            <div className={rlcClass(null, badgeStyle(gaebIsValid ? "success" : "error"))}>
              {gaebIsValid ? "Export freigegeben" : "Export blockiert"}
            </div>
          </div>

          {!gaebErrors.length && !gaebWarnings.length ?
        <div className={rlcClass(null, { color: gaebIsValid ? "#15803D" : "#64748B", fontWeight: 600 })}>
              {gaebIsValid ? "Keine Fehler gefunden. Export ist freigegeben." : "Keine Detaildaten vorhanden."}
            </div> :

        <>
              {gaebErrors.length ?
          <div className="rlc-migrated-pages-kalkulation-gaeb-tsx-866">
                  <div className="rlc-migrated-pages-kalkulation-gaeb-tsx-867">Fehler ({gaebErrors.length})</div>
                  <IssueTable rows={gaebErrors} />
                </div> :
          null}

              {gaebWarnings.length ?
          <div>
                  <div className="rlc-migrated-pages-kalkulation-gaeb-tsx-868">Warnungen ({gaebWarnings.length})</div>
                  <IssueTable rows={gaebWarnings} />
                </div> :
          null}
            </>
        }
        </section> :
      null}
    </div>);

}

/* ===================== STYLES ===================== */

const page: React.CSSProperties = { display: "grid", gap: 16, padding: 16 };

const heroCard: React.CSSProperties = {
  background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
  color: "#FFFFFF",
  borderRadius: 18,
  padding: 22,
  display: "grid",
  gap: 14,
  boxShadow: "0 16px 40px rgba(15,23,42,0.18)",
  overflow: "hidden"
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.82,
  fontWeight: 700
};

const title: React.CSSProperties = {
  margin: "4px 0",
  fontSize: 30,
  fontWeight: 700,
  lineHeight: 1.1
};

const subtitle: React.CSSProperties = {
  margin: 0,
  maxWidth: 980,
  opacity: 0.9,
  lineHeight: 1.55
};

const heroActions: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap" };
const heroMeta: React.CSSProperties = { fontSize: 13, opacity: 0.92 };

const grid4: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
  gap: 12
};

const grid5: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
  gap: 12
};

const kpiCard: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  minWidth: 0
};

const kpiLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em"
};

const kpiValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 22,
  color: "#0F172A",
  fontWeight: 700,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};

const kpiSub: React.CSSProperties = { marginTop: 3, fontSize: 12, color: "#64748B" };

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};

const sectionHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 12
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 17,
  color: "#0F172A",
  fontWeight: 700
};

const sectionText: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#64748B",
  lineHeight: 1.5
};

const actionGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
  gap: 14
};

const actionCard: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  padding: 14,
  background: "#F8FAFC"
};

const actionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#0F172A",
  marginBottom: 6
};

const actionText: React.CSSProperties = { fontSize: 13, color: "#64748B", lineHeight: 1.5 };

const buttonRow: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 };

const buttonBase: React.CSSProperties = {
  fontSize: 13,
  borderRadius: 10,
  padding: "10px 14px",
  border: "1px solid #D1D5DB",
  background: "#FFFFFF",
  color: "#0F172A",
  cursor: "pointer",
  fontWeight: 700,
  whiteSpace: "nowrap"
};

const buttonPrimary: React.CSSProperties = {
  ...buttonBase,
  background: "#146EF5",
  border: "1px solid #0B5BD3",
  color: "#FFFFFF"
};

const dangerButton: React.CSSProperties = {
  ...buttonBase,
  background: "#DC2626",
  border: "1px solid #DC2626",
  color: "#FFFFFF"
};

const smallButton: React.CSSProperties = {
  ...buttonBase,
  padding: "7px 10px",
  fontSize: 12
};

const btnHeroPrimary: React.CSSProperties = {
  ...buttonPrimary,
  padding: "11px 16px",
  boxShadow: "0 10px 20px rgba(37,99,235,0.22)"
};

const btnHeroSecondary: React.CSSProperties = {
  ...buttonBase,
  padding: "11px 16px",
  background: "#FFFFFF",
  color: "#0F172A"
};

const filterRow: React.CSSProperties = { marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" };

const tableWrap: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  overflow: "auto",
  background: "#FFFFFF"
};

const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid #E5E7EB",
  background: "#F8FAFC",
  fontWeight: 700,
  whiteSpace: "nowrap",
  fontSize: 12,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.02em"
};

const thRight: React.CSSProperties = { ...th, textAlign: "right" };

const td: React.CSSProperties = {
  padding: "9px 10px",
  borderBottom: "1px solid #F1F5F9",
  verticalAlign: "top",
  fontSize: 13,
  color: "#0F172A"
};

const tdStrong: React.CSSProperties = { ...td, fontWeight: 700, whiteSpace: "nowrap" };
const tdRight: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap" };

const miniBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid #CBD5E1",
  borderRadius: 999,
  padding: "3px 8px",
  fontSize: 11,
  fontWeight: 700,
  background: "#FFFFFF",
  whiteSpace: "nowrap"
};

const badgeNeutral: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  color: "#475569",
  borderRadius: 999,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: "nowrap"
};

const badgeOk: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#15803D"
};

const badgeWarn: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
  color: "#B45309"
};

const badgeError: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C"
};

const textButton: React.CSSProperties = {
  border: "none",
  background: "transparent",
  padding: 0,
  color: "#146EF5",
  cursor: "pointer",
  fontWeight: 700
};

const longTextBox: React.CSSProperties = {
  marginTop: 8,
  whiteSpace: "pre-wrap",
  color: "#475569",
  lineHeight: 1.45,
  border: "1px solid #E5E7EB",
  borderRadius: 10,
  padding: 10,
  background: "#F8FAFC"
};

const gaebDropdownShell: React.CSSProperties = {
  border: "1px solid #D7E3F5",
  background: "#F8FAFC",
  borderRadius: 16,
  padding: 14,
  display: "grid",
  gap: 14
};

const gaebSelectorGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "220px minmax(280px,1fr) minmax(220px,320px)",
  gap: 12,
  alignItems: "end"
};

const gaebSelectLabel: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  fontWeight: 700,
  color: "#64748B"
};

const gaebSelect: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 700,
  width: "100%",
  boxSizing: "border-box"
};

const selectedFormatBox: React.CSSProperties = {
  border: "1px solid #BED6FF",
  background: "#EAF2FF",
  borderRadius: 14,
  padding: "10px 12px",
  minHeight: 46
};

const selectedFormatCode: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "#0B5BD3"
};

const selectedFormatText: React.CSSProperties = {
  marginTop: 3,
  fontSize: 12,
  fontWeight: 700,
  color: "#475569"
};

const gaebMainActions: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap" };

const formatDetailsBox: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  borderRadius: 14,
  overflow: "hidden"
};

const formatDetailsSummary: React.CSSProperties = {
  cursor: "pointer",
  padding: "11px 13px",
  fontSize: 13,
  fontWeight: 700,
  color: "#0F172A",
  background: "#FFFFFF"
};

const formatCompactList: React.CSSProperties = {
  borderTop: "1px solid #E5E7EB",
  padding: 10,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
  gap: 8
};

const formatCompactItem: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  borderRadius: 12,
  padding: 10,
  textAlign: "left",
  display: "grid",
  gap: 3,
  cursor: "pointer",
  color: "#0F172A"
};

const formatCompactItemActive: React.CSSProperties = {
  ...formatCompactItem,
  border: "1px solid #146EF5",
  background: "#EAF2FF",
  color: "#0B5BD3"
};
