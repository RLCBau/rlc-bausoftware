import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/kalkulation/gaeb.tsx
import React, { useEffect, useMemo, useState } from "react";
import { splitGaebArchiveForUpload } from "./gaebChunkUpload";

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
"X87" |
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
"x87" |
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
  gaebAlnGroupNo?: number | null;
  gaebAlnSerNo?: number | null;
  gaebProvis?: string | null;
  gaebProvisAccpt?: string | null;
  gaebAccepted?: string | null;
  gaebItemKind?: string | null;
  gaebMarkupType?: string | null;
  gaebTextComplements?: Array<{ markLbl?: string | null; kind?: string; caption?: string; body?: string; tail?: string }>;
  gaebSubDescriptions?: Array<{ subDNo?: string | null; quantity?: number | null; unit?: string; kurztext?: string; langtext?: string }>;
  gaebImages?: Array<{ name?: string | null; type?: string | null; width?: string | null; data?: string }>;
  gaebQTakeoffRows?: string[];
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
  code: "X85",
  title: "Nebenangebot",
  description: "GAEB DA XML 3.3 · Nebenangebot.",
  kind: "legacy",
  legacyFormat: "X85"
},
{
  family: "xml",
  code: "X86",
  title: "Auftragserteilung",
  description: "GAEB DA XML 3.3 · Auftragserteilung.",
  kind: "legacy",
  legacyFormat: "X86"
},
{
  family: "xml",
  code: "X87",
  title: "Auftragsbestätigung",
  description: "GAEB DA XML 3.3 · Auftragsbestätigung.",
  kind: "legacy",
  legacyFormat: "X87"
},
{ family: "gaeb2000", code: "P81", title: "Leistungsbeschreibung", description: "GAEB DA 2000 · Leistungsbeschreibung.", kind: "legacy", legacyFormat: "P81" },
{ family: "gaeb2000", code: "P82", title: "Kostenanschlag", description: "GAEB DA 2000 · Kostenanschlag.", kind: "legacy", legacyFormat: "P82" },
{ family: "gaeb2000", code: "P83", title: "Angebotsaufforderung", description: "GAEB DA 2000 · Angebotsaufforderung.", kind: "legacy", legacyFormat: "P83" },
{ family: "gaeb2000", code: "P84", title: "Angebotsabgabe", description: "GAEB DA 2000 · Angebotsabgabe.", kind: "legacy", legacyFormat: "P84" },
{ family: "gaeb2000", code: "P85", title: "Nebenangebot", description: "GAEB DA 2000 · Nebenangebot.", kind: "legacy", legacyFormat: "P85" },
{ family: "gaeb2000", code: "P86", title: "Auftragserteilung", description: "GAEB DA 2000 · Auftragserteilung.", kind: "legacy", legacyFormat: "P86" },
{ family: "gaeb90", code: "D81", title: "Leistungsbeschreibung", description: "GAEB 90 · Leistungsbeschreibung.", kind: "legacy", legacyFormat: "D81" },
{ family: "gaeb90", code: "D82", title: "Kostenanschlag", description: "GAEB 90 · Kostenanschlag.", kind: "legacy", legacyFormat: "D82" },
{ family: "gaeb90", code: "D83", title: "Angebotsaufforderung", description: "GAEB 90 · Angebotsaufforderung.", kind: "legacy", legacyFormat: "D83" },
{ family: "gaeb90", code: "D84", title: "Angebotsabgabe", description: "GAEB 90 · Angebotsabgabe.", kind: "legacy", legacyFormat: "D84" },
{ family: "gaeb90", code: "D85", title: "Nebenangebot", description: "GAEB 90 · Nebenangebot.", kind: "legacy", legacyFormat: "D85" },
{ family: "gaeb90", code: "D86", title: "Auftragserteilung", description: "GAEB 90 · Auftragserteilung.", kind: "legacy", legacyFormat: "D86" },
{ family: "da", code: "X31", title: "Mengenermittlung", description: "GAEB XML · Mengenermittlung aus dem RLC Aufmaß-Editor.", kind: "legacy", legacyFormat: "X31" },
{ family: "da", code: "DA11", title: "REB 23.003", description: "REB DA11 · Aufmaßdaten aus dem RLC Aufmaß-Editor.", kind: "legacy", legacyFormat: "DA11" }];


const EXPORT_TARGETS: ExportTarget[] = [
{ mode: "x83", label: "X83", description: "Angebotsaufforderung / Ausschreibung", group: "GAEB XML", fallbackFormat: "X83" },
{ mode: "x84", label: "X84", description: "Angebotsabgabe", group: "GAEB XML", fallbackFormat: "X84" },
{ mode: "x85", label: "X85", description: "Nebenangebot", group: "GAEB XML", fallbackFormat: "X85" },
{ mode: "x86", label: "X86", description: "Auftragserteilung", group: "GAEB XML", fallbackFormat: "X86" },
{ mode: "x87", label: "X87", description: "Auftragsbestätigung", group: "GAEB XML", fallbackFormat: "X87" },

{ mode: "p81", label: "P81", description: "GAEB 2000 Leistungsbeschreibung", group: "GAEB 2000", fallbackFormat: "P81" },
{ mode: "p82", label: "P82", description: "GAEB 2000 Kostenanschlag", group: "GAEB 2000", fallbackFormat: "P82" },
{ mode: "p83", label: "P83", description: "GAEB 2000 Angebotsaufforderung", group: "GAEB 2000", fallbackFormat: "P83" },
{ mode: "p84", label: "P84", description: "GAEB 2000 Angebotsabgabe", group: "GAEB 2000", fallbackFormat: "P84" },
{ mode: "p85", label: "P85", description: "GAEB 2000 Nebenangebot", group: "GAEB 2000", fallbackFormat: "P85" },
{ mode: "p86", label: "P86", description: "GAEB 2000 Auftragserteilung", group: "GAEB 2000", fallbackFormat: "P86" },

{ mode: "d81", label: "D81", description: "GAEB 90 Leistungsbeschreibung", group: "GAEB 90", fallbackFormat: "D81" },
{ mode: "d82", label: "D82", description: "GAEB 90 Kostenanschlag", group: "GAEB 90", fallbackFormat: "D82" },
{ mode: "d83", label: "D83", description: "GAEB 90 Angebotsaufforderung", group: "GAEB 90", fallbackFormat: "D83" },
{ mode: "d84", label: "D84", description: "GAEB 90 Angebotsabgabe", group: "GAEB 90", fallbackFormat: "D84" },
{ mode: "d85", label: "D85", description: "GAEB 90 Nebenangebot", group: "GAEB 90", fallbackFormat: "D85" },
{ mode: "d86", label: "D86", description: "GAEB 90 Auftragserteilung", group: "GAEB 90", fallbackFormat: "D86" },

{ mode: "x31", label: "X31", description: "Aufmaß / Mengenermittlung GAEB XML", group: "Aufmaß / REB", fallbackFormat: "X31" },
{ mode: "da11", label: "DA11", description: "REB-Aufmaß / DA11", group: "Aufmaß / REB", fallbackFormat: "DA11" }];


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
".DA11,.X31,.MSG";

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

    const alnGroupRaw = deepTextByLocalName(item, ["ALNGroupNo"]);
    const alnSerRaw = deepTextByLocalName(item, ["ALNSerNo"]);
    const gaebAlnGroupNo = alnGroupRaw !== "" && Number.isFinite(Number(alnGroupRaw)) ? Number(alnGroupRaw) : null;
    const gaebAlnSerNo = alnSerRaw !== "" && Number.isFinite(Number(alnSerRaw)) ? Number(alnSerRaw) : null;
    const gaebProvis = deepTextByLocalName(item, ["Provis"]) || null;
    const gaebProvisAccpt = deepTextByLocalName(item, ["ProvisAccpt"]) || null;
    const gaebAccepted = deepTextByLocalName(item, ["Accepted"]) || null;

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
      confidence: 0.95,
      gaebAlnGroupNo,
      gaebAlnSerNo,
      gaebProvis,
      gaebProvisAccpt,
      gaebAccepted
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

function isGaeb84Format(value: unknown): boolean {
  return /^[XPD]84$/i.test(String(value || "").trim());
}

function isGaebReferenceOnlyFormat(value: unknown): boolean {
  const fmt = String(value || "").trim().toUpperCase();
  return /^[XPD]84$/.test(fmt) || /^[XPD](85|86|94)$/.test(fmt) || fmt === "X89";
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
      confidence: toFiniteNumber(r?.confidence, 0),
      gaebAlnGroupNo: r?.gaebAlnGroupNo ?? null,
      gaebAlnSerNo: r?.gaebAlnSerNo ?? null,
      gaebProvis: r?.gaebProvis ?? null,
      gaebProvisAccpt: r?.gaebProvisAccpt ?? null,
      gaebAccepted: r?.gaebAccepted ?? null,
      gaebItemKind: r?.gaebItemKind ?? null,
      gaebMarkupType: r?.gaebMarkupType ?? null,
      gaebTextComplements: Array.isArray(r?.gaebTextComplements) ? r.gaebTextComplements : [],
      gaebSubDescriptions: Array.isArray(r?.gaebSubDescriptions) ? r.gaebSubDescriptions : [],
      gaebImages: Array.isArray(r?.gaebImages) ? r.gaebImages : [],
      gaebQTakeoffRows: Array.isArray(r?.gaebQTakeoffRows) ? r.gaebQTakeoffRows : []
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
    <div className={rlcClass("rlc-global-kpi-card", kpiCard)}>
      <div className={rlcClass("rlc-global-kpi-label", kpiLabel)}>{label}</div>
      <div className={rlcClass("rlc-global-kpi-value", kpiValue)}>{value}</div>
      {sub ? <div className={rlcClass("rlc-global-kpi-sub", kpiSub)}>{sub}</div> : null}
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

function handoffExportHistoryKey(handoff: any, format: string): string {
  const project = String(handoff?.projectCode || "RLC").trim().toUpperCase();
  const created = String(handoff?.createdAt || "").trim();
  const source = String(handoff?.source || "handoff").trim().toLowerCase();
  const rows = Array.isArray(handoff?.rows) ? handoff.rows : [];
  const signature = created || rows.map((r: any) => String(r?.id || r?.posNr || r?.pos || "")).join("|");
  return `rlc_gaeb_export_done_v1:${project}:${source}:${signature}:${String(format || "").toUpperCase()}`;
}

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
  const [gaebRemarks, setGaebRemarks] = useState<Array<{ text?: string; detail?: string; outline?: string }>>([]);
  const [gaebCategories, setGaebCategories] = useState<Array<{ path: string; level: number; label?: string }>>([]);
  const [info, setInfo] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [collectionPreview, setCollectionPreview] = useState<any | null>(null);
  const [collectionUploading, setCollectionUploading] = useState(false);
  const [collectionImporting, setCollectionImporting] = useState(false);
  const [openRows, setOpenRows] = useState<Record<number, boolean>>({});
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [filterMode, setFilterMode] = useState<FilterMode>("alle");
  const [gaebBusy, setGaebBusy] = useState<GaebMode | null>(null);
  const [gaebResult, setGaebResult] = useState<GaebValidationResponse | null>(null);
  const [selectedExportCode, setSelectedExportCode] = useState<string>("X84");
  const [activeExportFamily, setActiveExportFamily] = useState<ExportFamilyKey>("xml");
  const [exportHandoff, setExportHandoff] = useState<any | null>(null);
  const [handoffExportDone, setHandoffExportDone] = useState<{file:string;count:number;format:string;exportedAt:string;} | null>(null);
  const [gaebOwner, setGaebOwner] = useState({ name: "", street: "", pcode: "", city: "" });

  useEffect(() => {
    try {
      const key = `rlc_gaeb_owner_v1:${String(projectCode || currentProjectCode || "").toUpperCase()}`;
      const saved = sessionStorage.getItem(key);
      const parsed = saved ? JSON.parse(saved) : {};
      setGaebOwner({
        name: String(parsed?.name || (currentProject as any)?.client || ""),
        street: String(parsed?.street || ""),
        pcode: String(parsed?.pcode || ""),
        city: String(parsed?.city || (currentProject as any)?.place || ""),
      });
    } catch {}
  }, [projectCode, currentProjectCode]);

  useEffect(() => {
    const code = String(projectCode || currentProjectCode || "").toUpperCase();
    if (!code) return;
    try { sessionStorage.setItem(`rlc_gaeb_owner_v1:${code}`, JSON.stringify(gaebOwner)); } catch {}
  }, [gaebOwner, projectCode, currentProjectCode]);

  useEffect(() => {
    if (!projectCode && currentProjectCode) {
      setProjectCode(currentProjectCode);
    }
  }, [currentProjectCode, projectCode]);

  useEffect(() => {
    if (!exportHandoff?.rows?.length) {
      setHandoffExportDone(null);
      return;
    }
    try {
      const key = handoffExportHistoryKey(exportHandoff, selectedExportCode);
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.file && parsed?.format) {
        setHandoffExportDone({
          file: String(parsed.file),
          count: Number(parsed.count || exportHandoff.rows.length),
          format: String(parsed.format).toUpperCase(),
          exportedAt: String(parsed.exportedAt || "")
        });
      } else {
        setHandoffExportDone(null);
      }
    } catch {
      setHandoffExportDone(null);
    }
  }, [exportHandoff, selectedExportCode]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("rlc_gaeb_export_handoff_v1");
      if (!raw) return;
      const handoff = JSON.parse(raw);
      if (!handoff || !Array.isArray(handoff.rows) || !handoff.rows.length) return;
      setExportHandoff(handoff);
      setHandoffExportDone(null);
      if (handoff.projectCode) setProjectCode(String(handoff.projectCode).trim().toUpperCase());
      const mode = String(handoff.mode || "X84").toUpperCase();
      setSelectedExportCode(mode);
      setActiveExportFamily(mode.startsWith("P") ? "gaeb2000" : mode.startsWith("D") ? "gaeb90" : "xml");
      setInfo(`${handoff.sourceLabel || "RLC"}: ${handoff.rows.length.toLocaleString("de-DE")} Position(en) für ${mode}-Export übernommen.`);
    } catch {}
  }, []);

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

    if (isGaebReferenceOnlyFormat(det.format)) {
      setInfo(`${String(det.format).toUpperCase()} wurde bereits als GAEB-Referenz/Austauschphase verarbeitet und wird nicht als neues LV gespeichert.`);
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
      setInfo("Kein 84-Import vorhanden.");
      return;
    }

    const rowsWithPrice = det.rows.filter((row) => {
      const ep = toFiniteNumber((row as any).preis ?? (row as any).ep ?? (row as any).einzelpreis, 0);
      return ep > 0 && String(row.posNr || "").trim();
    });

    if (!rowsWithPrice.length) {
      setInfo("Keine Angebotspreise zum Übertragen gefunden.");
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
        `${String(det.format).toUpperCase()}-Preise in Firmen-Datenbank übertragen: ${items.length.toLocaleString("de-DE")} Position(en). Quelle: x84-company-baseline.`
      );
    } catch (e: any) {
      setInfo(`${String(det.format).toUpperCase()}-Datenbankübertragung fehlgeschlagen: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }
  function clearCurrentImport() {
    const code = projectCode.trim().toUpperCase();

    setDet(null);
    setGaebRemarks([]);
    setGaebCategories([]);
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

  async function onCollectionUpload(files: File[]) {
    if (!files.length) return;
    setCollectionUploading(true);
    setCollectionPreview(null);
    setInfo("GAEB-Sammlung wird hochgeladen …");

    try {
      const start = await fetch(apiUrl("/api/project-lv/collection/start"), {
        method: "POST",
        credentials: "include",
        headers: withAuthHeaders()
      });
      const started = await start.json().catch(() => null);
      if (!start.ok || !started?.collectionId) throw new Error(started?.error || "Sammlung konnte nicht gestartet werden.");

      const uploadParts = splitGaebArchiveForUpload(files);
      for (let index = 0; index < uploadParts.length; index++) {
        setInfo(`Archivteil ${index + 1}/${uploadParts.length} wird hochgeladen …`);
        const form = new FormData();
        form.append("file", uploadParts[index]);
        const part = await fetch(apiUrl(`/api/project-lv/collection/${started.collectionId}/part`), {
          method: "POST",
          credentials: "include",
          headers: withAuthHeaders(),
          body: form
        });
        const partJson = await part.json().catch(() => null);
        if (!part.ok || !partJson?.ok) throw new Error(partJson?.error || `ZIP-Teil ${index + 1} konnte nicht hochgeladen werden.`);
      }

      setInfo("ZIP wird geprüft und GAEB-Dateien werden zugeordnet …");
      const previewResponse = await fetch(apiUrl(`/api/project-lv/collection/${started.collectionId}/preview`), {
        method: "POST",
        credentials: "include",
        headers: withAuthHeaders()
      });
      const preview = await previewResponse.json().catch(() => null);
      if (!previewResponse.ok || !preview?.ok) throw new Error(preview?.error || "GAEB-Sammlung konnte nicht gelesen werden.");

      setCollectionPreview(preview);
      setInfo(`Sammlung geprüft: ${preview.files?.length || 0} GAEB-Dateien in ${preview.groups?.length || 0} Projektgruppen gefunden.`);
    } catch (e: any) {
      setInfo("Importfehler: " + (e?.message || "GAEB-Sammlung konnte nicht verarbeitet werden."));
    } finally {
      setCollectionUploading(false);
    }
  }

  async function importCollection() {
    const collectionId = String(collectionPreview?.collectionId || "");
    if (!collectionId) return;
    setCollectionImporting(true);
    setInfo("GAEB-Sammlung wird übernommen …");
    try {
      const response = await fetch(apiUrl(`/api/project-lv/collection/${collectionId}/import`), {
        method: "POST",
        credentials: "include",
        headers: withAuthHeaders()
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Sammelübernahme fehlgeschlagen.");
      setCollectionPreview((previous: any) => ({ ...previous, importResult: result }));
      setInfo(`Sammelübernahme abgeschlossen: ${result.imported || 0} Projekte importiert, ${result.skipped || 0} ohne technisches LV übersprungen.`);
    } catch (e: any) {
      setInfo("Importfehler: " + (e?.message || "Sammelübernahme fehlgeschlagen."));
    } finally {
      setCollectionImporting(false);
    }
  }

  async function openLatestCollection() {
    setCollectionUploading(true);
    setInfo("Letzte GAEB-Sammlung wird geöffnet …");
    try {
      const latestResponse = await fetch(apiUrl("/api/project-lv/collection/latest"), { credentials: "include", headers: withAuthHeaders() });
      const latest = await latestResponse.json().catch(() => null);
      if (!latestResponse.ok || !latest?.collectionId) throw new Error("Keine gespeicherte GAEB-Sammlung gefunden.");
      const previewResponse = await fetch(apiUrl(`/api/project-lv/collection/${latest.collectionId}/preview`), { method: "POST", credentials: "include", headers: withAuthHeaders() });
      const preview = await previewResponse.json().catch(() => null);
      if (!previewResponse.ok || !preview?.ok) throw new Error(preview?.error || "Sammlung konnte nicht geöffnet werden.");
      setCollectionPreview(preview);
      setInfo(`Gespeicherte Sammlung geöffnet: ${preview.files?.length || 0} GAEB-Dateien.`);
    } catch (e: any) {
      setInfo("Importfehler: " + (e?.message || "Gespeicherte Sammlung konnte nicht geöffnet werden."));
    } finally {
      setCollectionUploading(false);
    }
  }

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
      setGaebRemarks(Array.isArray(serverJson?.gaebRemarks) ? serverJson.gaebRemarks : []);
      setGaebCategories(Array.isArray(serverJson?.gaebCategories) ? serverJson.gaebCategories : []);

      let nextDet: Detect;

      const is84ImportDetected = isGaeb84Format(detectedFormat);

      function importQuality(rows: ImportedRow[]): number {
        const seen = new Set<string>();
        let score = 0;

        for (const r of rows) {
          if (is84ImportDetected) {
            const pos84 = String(r.posNr || "").trim();
            const ep84 = toFiniteNumber(r.preis, 0);
            if (pos84) score += 8; else score -= 20;
            if (ep84 > 0) score += 10; else score -= 8;
            if (seen.has(pos84) && pos84) score -= 8;
            if (pos84) seen.add(pos84);
            continue;
          }
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
        const pos = String(r.posNr || "").trim();

        if (is84ImportDetected) return !pos || ep <= 0;

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

        const sourcePath = String(serverJson?.sourcePath || "").trim();
        const msgSubject = String(serverJson?.msgMeta?.subject || "").trim();
        const serverWarning = String(serverJson?.warning || "").trim();
        setInfo(
          `Import erfolgreich: ${detectedFormat} • ${mappedRows.length.toLocaleString(
            "de-DE"
          )} Positionen.` +
          (sourcePath ? ` Quelle: ${sourcePath}.` : "") +
          (msgSubject ? ` Outlook: ${msgSubject}.` : "") +
          (serverWarning ? ` Hinweis: ${serverWarning}` : "")
        );
      } else {
        throw new Error(
          serverError ||
          `${detectedFormat} erkannt, aber weder Server noch Browser-Fallback konnten Positionsdaten lesen.`
        );
      }
      const fmtUpper = String(nextDet.format || "").toUpperCase();

      if (isGaeb84Format(fmtUpper)) {
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
            `Import erfolgreich: ${fmtUpper} • ${enrichedRows.length.toLocaleString(
              "de-DE"
            )} Preispositionen. Texte/Mengen aus vorhandenem LV ergänzt: ${enrichedCount.toLocaleString("de-DE")}.`
          );
        } else {
          setInfo(
            `${fmtUpper} enthält hauptsächlich Preise ohne LV-Texte. Bitte zuerst das zugehörige LV (81/83) importieren, danach ${fmtUpper} erneut importieren.`
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
          gaebAlnGroupNo: row.gaebAlnGroupNo ?? existing.gaebAlnGroupNo ?? null,
          gaebAlnSerNo: row.gaebAlnSerNo ?? existing.gaebAlnSerNo ?? null,
          gaebProvis: row.gaebProvis ?? existing.gaebProvis ?? null,
          gaebProvisAccpt: row.gaebProvisAccpt ?? existing.gaebProvisAccpt ?? null,
          gaebAccepted: row.gaebAccepted ?? existing.gaebAccepted ?? null,
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
          gaebAlnGroupNo: row.gaebAlnGroupNo ?? null,
          gaebAlnSerNo: row.gaebAlnSerNo ?? null,
          gaebProvis: row.gaebProvis ?? null,
          gaebProvisAccpt: row.gaebProvisAccpt ?? null,
          gaebAccepted: row.gaebAccepted ?? null,
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
      currency: r.waehrung || "EUR",
      gaebAlnGroupNo: r.gaebAlnGroupNo ?? null,
      gaebAlnSerNo: r.gaebAlnSerNo ?? null,
      gaebProvis: r.gaebProvis ?? null,
      gaebProvisAccpt: r.gaebProvisAccpt ?? null,
      gaebAccepted: r.gaebAccepted ?? null
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
        body: JSON.stringify({
          format, rows, owner: gaebOwner,
          project: { code: projectCode, name: String((currentProject as any)?.name || (currentProject as any)?.title || projectCode) }
        })
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

  function validateExportHandoff(code: string): GaebValidationResponse {
    const rows = Array.isArray(exportHandoff?.rows) ? exportHandoff.rows : [];
    const errors: any[] = [];
    rows.forEach((r: any, index: number) => {
      if (!String(r?.posNr || r?.pos || "").trim()) errors.push({ type: "error", field: `rows.${index}.posNr`, message: "Positionsnummer fehlt." });
      if (!String(r?.kurztext || r?.text || "").trim()) errors.push({ type: "error", field: `rows.${index}.kurztext`, message: "Kurztext fehlt." });
      if (!String(r?.einheit || r?.unit || "").trim()) errors.push({ type: "error", field: `rows.${index}.einheit`, message: "Einheit fehlt." });
      const qty = Number(r?.menge ?? r?.mengeDelta ?? r?.quantity ?? 0) || 0;
      if (String(exportHandoff?.source || "").toLowerCase().includes("nachtrag") && qty === 0) {
        errors.push({ type: "error", field: `rows.${index}.menge`, message: "Nachtragsmenge ist 0. Bitte Δ-Menge im Nachtrag korrigieren." });
      }
    });
    if (["X86", "X87"].includes(String(code).toUpperCase())) {
      if (!gaebOwner.name.trim()) errors.push({ type: "error", field: "owner.name", message: "Auftraggeber: Name fehlt." });
      if (!gaebOwner.street.trim()) errors.push({ type: "error", field: "owner.street", message: "Auftraggeber: Straße fehlt." });
      if (!gaebOwner.pcode.trim()) errors.push({ type: "error", field: "owner.pcode", message: "Auftraggeber: PLZ fehlt." });
      if (!gaebOwner.city.trim()) errors.push({ type: "error", field: "owner.city", message: "Auftraggeber: Ort fehlt." });
    }
    return { mode: String(code).toLowerCase() as GaebMode, valid: errors.length === 0, errorCount: errors.length, warningCount: 0, errors, warnings: [] };
  }

  async function exportHandoffGaeb(code: string) {
    const handoff = exportHandoff;
    if (!handoff?.rows?.length) return;
    setGaebBusy(String(code).toLowerCase() as GaebMode);
    try {
      const validation = validateExportHandoff(code);
      setGaebResult(validation);
      if (!validation.valid) {
        setInfo(`Export ${code} blockiert. Fehler: ${validation.errorCount}.`);
        return;
      }
      const response = await fetch(apiUrl("/api/gaeb/export"), {
        method: "POST", credentials: "include",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          format: code,
          project: { code: handoff.projectCode || projectCode, name: handoff.projectName || handoff.projectCode || projectCode },
          rows: handoff.rows,
          owner: gaebOwner
        })
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json?.error || `Export ${code} fehlgeschlagen`);
      }
      const exportFile = `${handoff.projectCode || projectCode || "RLC"}.${String(code).toLowerCase()}`;
      await downloadBlobFromResponse(response, exportFile);
      const exportedAt = new Date().toISOString();
      const done = { file: exportFile, count: handoff.rows.length, format: String(code).toUpperCase(), exportedAt };
      setHandoffExportDone(done);
      try {
        localStorage.setItem(handoffExportHistoryKey(handoff, code), JSON.stringify(done));
      } catch {}
      setInfo(`${handoff.sourceLabel || "RLC"}: ${code}-Export mit ${handoff.rows.length} Position(en) erstellt. Download gestartet.`);
    } catch (e: any) {
      setInfo(`Export-Fehler: ${e?.message || e}`);
    } finally { setGaebBusy(null); }
  }

  async function handleValidateRow(row: ExportFormatRow) {
    if (exportHandoff?.rows?.length) {
      const result = validateExportHandoff(row.code);
      setGaebResult(result);
      setInfo(result.valid ? `${row.code}: Übergabedaten sind vollständig.` : `${row.code}: ${result.errorCount} Fehler in den Übergabedaten.`);
      return;
    }
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
    if (row.family === "da" && (row.code === "X31" || row.code === "DA11")) {
      nav(`/mengenermittlung/aufmasseditor?gaebExport=${encodeURIComponent(row.code)}`);
      return;
    }
    if (exportHandoff?.rows?.length) {
      await exportHandoffGaeb(row.code);
      return;
    }
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
            Zentrale GAEB- und Aufmaß-Schnittstelle für X83–X87,
            P81–P86, D81–D86, X31 und DA11. Weitere X-Phasen werden nur nach vollständiger GAEB-Prüfung freigeschaltet.
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

          <label className={rlcClass(null, btnHeroPrimary)} title="ZIP, 7Z oder alle Teile eines geteilten Archivs auswählen. Die Teile werden nacheinander hochgeladen und erst geprüft, nicht sofort importiert.">
            GAEB-Sammlung (ZIP / 7Z) prüfen
            <input
              type="file"
              accept="*/*"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length) void onCollectionUpload(files);
                e.currentTarget.value = "";
              }}
              disabled={busy || collectionUploading}
              className="rlc-migrated-pages-kalkulation-gaeb-tsx-861" />
          </label>
          <button type="button" className={rlcClass(null, btnHeroSecondary)} onClick={() => void openLatestCollection()} disabled={collectionUploading || collectionImporting}>
            Letzte Sammlung öffnen
          </button>

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

      {collectionPreview ? <section className={rlcClass(null, card)}>
        <div className={rlcClass(null, sectionHead)}>
          <div>
            <h2 className={rlcClass(null, sectionTitle)}>GAEB-Sammlung – Zuordnungsvorschau</h2>
            <div className={rlcClass(null, sectionText)}>
              {collectionPreview.files?.length || 0} Dateien erkannt. X83 bleibt das technische LV; X84 wird später ausschließlich als Preisvergleich verknüpft.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div className={rlcClass(null, badgeStyle("neutral"))}>
              {collectionPreview.groups?.length || 0} Projektgruppen
            </div>
            <button type="button" className={rlcClass(null, btnHeroPrimary)} onClick={() => void importCollection()} disabled={collectionImporting || Boolean(collectionPreview.importResult)}>
              {collectionImporting ? "Sammelübernahme läuft …" : collectionPreview.importResult ? "Sammelübernahme abgeschlossen" : "Technische LVs übernehmen"}
            </button>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr><th style={{ textAlign: "left", padding: 8 }}>Zuordnung</th><th style={{ textAlign: "left", padding: 8 }}>X83 / P83 / D83</th><th style={{ textAlign: "left", padding: 8 }}>X84 / P84 / D84</th><th style={{ textAlign: "left", padding: 8 }}>Hinweis</th></tr></thead>
            <tbody>{(collectionPreview.groups || []).map((group: any, index: number) => <tr key={`${group.projectCode}-${index}`} style={{ borderTop: "1px solid #dbe5f4" }}>
              <td style={{ padding: 8, fontWeight: 700 }}>{group.projectCode}<div style={{ fontWeight: 400, color: "#64748b", marginTop: 3 }}>{group.grouping === "Dateiname" ? "Abgleich über Dateiname" : "Abgleich über Projektcode"}</div></td>
              <td style={{ padding: 8 }}>{group.x83?.length ? group.x83.join(", ") : "—"}</td>
              <td style={{ padding: 8 }}>{group.x84?.length ? group.x84.join(", ") : "—"}</td>
              <td style={{ padding: 8 }}>{group.x83?.length && group.x84?.length ? "Paar gefunden" : "Unvollständig – vor Import prüfen"}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className={rlcClass(null, sectionText)} style={{ marginTop: 10 }}>
          Diese Prüfung speichert noch nichts in Projekten. Der nächste Schritt ist die bestätigte Sammelübernahme der erkannten Paare.
        </div>
      </section> : null}

      <section className={rlcClass(null, grid4)}>
        <KpiCard label="LV Positionen" value={String(lvRows.length)} />
        <KpiCard label="Importierte Positionen" value={String(importedTotal)} />
        <KpiCard label="Lokale Fehler" value={String(counts.localErrors)} />
        <KpiCard label="Server-Fehler" value={String(validationErrors)} sub={gaebHasResult ? "aus letzter Validierung" : "noch nicht validiert"} />
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
            <div className={rlcClass(null, actionText)}>Unterstützt werden GAEB XML, GAEB 2000, GAEB 90, DA11, X31 und Outlook MSG mit LV-Anhang.</div>

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
              <button type="button" className={rlcClass(null, buttonPrimary)} disabled={!det || busy || isGaebReferenceOnlyFormat(det?.format)} onClick={() => void runRlcAction("gaeb-save-server", "GAEB am Server speichern", () => saveCurrentImportToServer())}>
                Speichern am Server
              </button>

              {det && isGaeb84Format(det.format) ? (
                <button
                  type="button" className={rlcClass(null, buttonPrimary)}
                  disabled={busy}
                  onClick={() => void transferX84PricesToDatabase()}>
                  {String(det.format).toUpperCase()}-Preise in Datenbank
                </button>
              ) : null}
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

              <button type="button" className={rlcClass(null, buttonPrimary)} disabled={!det || busy || isGaebReferenceOnlyFormat(det?.format)} onClick={() => void runRlcAction("gaeb-save-server", "GAEB am Server speichern", () => saveCurrentImportToServer())}>
                Speichern am Server
              </button>

              <button type="button" className={rlcClass(null, buttonBase)} disabled={!det} onClick={() => void runRlcAction("gaeb-clear-import", "GAEB Import entfernen", () => clearCurrentImport())}>
                Import aus Ansicht entfernen
              </button>
            </div>
          </section>

          {gaebCategories.length ? (
            <section className={rlcClass(null, card)}>
              <div className={rlcClass(null, sectionHead)}>
                <div>
                  <h2 className={rlcClass(null, sectionTitle)}>LV-Struktur / Titel</h2>
                  <div className={rlcClass(null, sectionText)}>Originale GAEB-Hierarchie. Für BVBS müssen unter anderem die Titel 002.000 und 999.999 erhalten bleiben.</div>
                </div>
                <div className={rlcClass(null, formatBadgeByFmt(det.format))}>{gaebCategories.length} Titel</div>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {gaebCategories.map((category) => (
                  <div key={category.path} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12, alignItems: "center", padding: "7px 10px", borderBottom: "1px solid #E2E8F0" }}>
                    <div style={{ fontWeight: 800, paddingLeft: Math.max(0, (Number(category.level || 1) - 1) * 14) }}>{category.path}</div>
                    <div style={{ color: "#475569" }}>{category.label || "—"}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {gaebRemarks.length ? (
            <section className={rlcClass(null, card)}>
              <div className={rlcClass(null, sectionHead)}>
                <div>
                  <h2 className={rlcClass(null, sectionTitle)}>Hinweistexte / Remarks</h2>
                  <div className={rlcClass(null, sectionText)}>GAEB-Hinweistexte in Originalreihenfolge. Für die BVBS-Prüfung muss insbesondere der Hinweistext am LV-Ende sichtbar bleiben.</div>
                </div>
                <div className={rlcClass(null, formatBadgeByFmt(det.format))}>{gaebRemarks.length} Hinweis(e)</div>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {gaebRemarks.map((remark, index) => (
                  <div key={`gaeb-remark-${index}`} style={{ border: "1px solid #E2E8F0", borderRadius: 8, padding: "10px 12px", background: "#F8FAFC", whiteSpace: "pre-wrap" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", marginBottom: 4 }}>Hinweis {index + 1}{index === gaebRemarks.length - 1 ? " · LV-Ende" : ""}</div>
                    <div style={{ fontSize: 12.5, color: "#0F172A", lineHeight: 1.45 }}>{String(remark.text || remark.outline || remark.detail || "")}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className={rlcClass(null, card)}>
            <div className={rlcClass(null, sectionHead)}>
              <div>
                <h2 className={rlcClass(null, sectionTitle)}>Vorschau importierte Positionen</h2>
                <div className={rlcClass(null, sectionText)}>Maximal 500 Zeilen. Jede Position kann einzeln ausgewählt und bearbeitet werden.</div>
              </div>
            </div>

            <div className={rlcClass(null, previewTableWrap)}>
              <table className={rlcClass("rlc-kalkulation-flat-table", previewTable)}>
                <colgroup>
                  <col style={{ width: "4%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "37%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "8%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className={rlcClass(null, previewTh)}>✓</th>
                    <th className={rlcClass(null, previewTh)}>Pos.</th>
                    <th className={rlcClass(null, previewTh)}>Kurztext / Langtext</th>
                    <th className={rlcClass(null, previewThRight)}>Menge</th>
                    <th className={rlcClass(null, previewTh)}>ME</th>
                    <th className={rlcClass(null, previewThRight)}>EP</th>
                    <th className={rlcClass(null, previewThRight)}>Gesamt</th>
                    <th className={rlcClass(null, previewTh)}>Status</th>
                    <th className={rlcClass(null, previewTh)}></th>
                  </tr>
                </thead>

                <tbody>
                  {filteredPreview.map(({ row, originalIndex }, i) => {
                    const issue = rowIssues[originalIndex] || {};
                    const open = !!openRows[originalIndex];
                    const selectKey = importedRowKey(row, originalIndex);
                    const selected = !!selectedRows[selectKey];
                    const hasError = rowHasLocalError(row, issue);
                    const bg = hasError ? "#FFF5F5" : issue.dupInFile ? "#FFF9E8" : issue.existsInLV ? "#F6FAFF" : "#FFFFFF";

                    return (
                      <tr key={`${row.posNr || "row"}-${originalIndex}-${i}`} style={{ ...previewRow, background: bg }}>
                        <td className={rlcClass(null, previewTd)}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => setSelectedRows((state) => ({ ...state, [selectKey]: e.target.checked }))}
                          />
                        </td>
                        <td className={rlcClass(null, previewTdStrong)}>{row.posNr ?? ""}</td>
                        <td className={rlcClass(null, previewTextTd)}>
                          <div style={{ fontWeight: 700 }}>{row.kurztext ?? ""}</div>
                          {(row.gaebProvis || row.gaebItemKind === "MarkupItem" || row.gaebAlnGroupNo != null || /\.[0-9A-Za-z]$/.test(String(row.posNr || ""))) ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
                              {row.gaebProvis ? <span className={rlcClass(null, previewBadgeWarn)}>Bedarfsposition mit GB</span> : null}
                              {row.gaebItemKind === "MarkupItem" ? <span className={rlcClass(null, previewBadgeWarn)}>Zuschlagsposition</span> : null}
                              {row.gaebAlnGroupNo != null && Number(row.gaebAlnSerNo || 0) === 0 ? <span className={rlcClass(null, previewBadgeNeutral)}>Grundposition</span> : null}
                              {row.gaebAlnGroupNo != null && Number(row.gaebAlnSerNo || 0) > 0 ? <span className={rlcClass(null, previewBadgeNeutral)}>Alternativposition</span> : null}
                              {/\.[0-9A-Za-z]$/.test(String(row.posNr || "")) ? <span className={rlcClass(null, previewBadgeNeutral)}>Indexposition</span> : null}
                            </div>
                          ) : null}
                          {row.langtext ? (
                            <div className={rlcClass(null, previewLangtext)}>
                              {open ? String(row.langtext) : `${String(row.langtext).slice(0, 150)}${String(row.langtext).length > 150 ? "…" : ""}`}
                              <button
                                type="button"
                                className={rlcClass(null, previewTextButton)}
                                onClick={() => setOpenRows((state) => ({ ...state, [originalIndex]: !open }))}>
                                {open ? "weniger" : "Langtext"}
                              </button>
                            </div>
                          ) : null}
                        </td>
                        <td className={rlcClass(null, previewTdRight)}>{row.menge != null ? fmtNumber(row.menge) : ""}</td>
                        <td className={rlcClass(null, previewTd)}>
                          {row.einheit ?? ""}
                          {issue.meSuggest ? <div style={{ fontSize: 9.5, color: "#64748B" }}>→ {issue.meSuggest}</div> : null}
                        </td>
                        <td className={rlcClass(null, previewTdRight)}>{row.preis != null ? fmtNumber(row.preis) : ""}</td>
                        <td className={rlcClass(null, previewTdRight)}>{row.gesamt != null ? fmtNumber(row.gesamt) : ""}</td>
                        <td className={rlcClass(null, previewTd)}>
                          {issue.empty ? <span className={rlcClass(null, previewBadgeError)}>Fehler</span> : null}
                          {!issue.empty && hasError ? <span className={rlcClass(null, previewBadgeError)}>Fehler</span> : null}
                          {!hasError && issue.dupInFile ? <span className={rlcClass(null, previewBadgeWarn)}>Duplikat</span> : null}
                          {!hasError && !issue.dupInFile && issue.existsInLV ? <span className={rlcClass(null, previewBadgeNeutral)}>vorhanden</span> : null}
                          {!hasError && !issue.dupInFile && !issue.existsInLV ? <span className={rlcClass(null, previewBadgeOk)}>Neu</span> : null}
                        </td>
                        <td className={rlcClass(null, previewTd)}>
                          <button type="button" className={rlcClass(null, previewEditButton)} onClick={() => editImportedRow(originalIndex)}>
                            Bearbeiten
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {!filteredPreview.length ? (
                    <tr>
                      <td colSpan={9} style={{ padding: 16, textAlign: "center", color: "#64748B" }}>
                        Keine Daten in der aktuellen Filteransicht.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </> :
      null}

      {exportHandoff?.rows?.length ? (
        <section className={rlcClass(null, handoffBanner)}>
          <div>
            <b>{exportHandoff.sourceLabel || "RLC Export"}</b> · {exportHandoff.rows.length} Position(en)
            {handoffExportDone ? (
              <div style={{ marginTop: 4, color: "#15803d", fontWeight: 800 }}>
                ✓ Export erstellt: {handoffExportDone.file} · {handoffExportDone.count} Position(en) · Download gestartet
              </div>
            ) : null}
          </div>
          <div>GAEB-Format vorbereitet: <b>{String(exportHandoff.mode || selectedExportCode).toUpperCase()}</b></div>
        </section>
      ) : null}

      {(["X86","X87"].includes(String(selectedExportCode).toUpperCase()) || String(selectedExportCode).toUpperCase().startsWith("P")) ? (
        <section className={rlcClass(null, card)}>
          <div className={rlcClass(null, sectionHead)}>
            <div>
              <h2 className={rlcClass(null, sectionTitle)}>Auftraggeber für {String(selectedExportCode).toUpperCase()}</h2>
              <div className={rlcClass(null, sectionText)}>Für diesen Export werden vollständige Auftraggeberdaten benötigt. Bei GAEB 2000 werden sie als AG, bei X86/X87 als OWN übertragen.</div>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 2fr 1fr 1.5fr", gap:8 }}>
            {[
              ["name","Name / Firma","z. B. Gemeinde Musterstadt"],
              ["street","Straße / Hausnummer","Musterstraße 1"],
              ["pcode","PLZ","12345"],
              ["city","Ort","Musterstadt"],
            ].map(([key,label,placeholder]) => (
              <label key={key} style={{ display:"grid", gap:4, fontSize:11, fontWeight:700, color:"#334155" }}>
                {label}
                <input
                  value={(gaebOwner as any)[key]}
                  placeholder={placeholder}
                  onChange={(e) => setGaebOwner((v) => ({ ...v, [key]: e.target.value }))}
                  style={{ height:34, border:"1px solid #cbd5e1", borderRadius:7, padding:"0 9px", fontSize:12, color:"#0f172a", background:"#fff" }}
                />
              </label>
            ))}
          </div>
        </section>
      ) : null}

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

              {handoffExportDone && String(handoffExportDone.format).toUpperCase() === String(selectedExportRow?.code || "").toUpperCase() ? "Erneut exportieren" : "Export"}
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

      {exportHandoff?.rows?.length ? (
        <section className={rlcClass(null, card)}>
          <div className={rlcClass(null, sectionHead)}>
            <div>
              <h2 className={rlcClass(null, sectionTitle)}>Exportpositionen prüfen</h2>
              <div className={rlcClass(null, sectionText)}>
                Diese Positionen wurden aus {exportHandoff.sourceLabel || "RLC"} an den GAEB-Export übergeben.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {handoffExportDone ? (
                <div className={rlcClass(null, badgeStyle("success"))}>
                  Bereits exportiert · {handoffExportDone.format}
                  {handoffExportDone.exportedAt ? " · " + new Date(handoffExportDone.exportedAt).toLocaleString("de-DE") : ""}
                </div>
              ) : null}
              <div className={rlcClass(null, badgeStyle("neutral"))}>{exportHandoff.rows.length} Position(en)</div>
            </div>
          </div>
          {exportHandoff.rows.some((row:any) => (Number(row?.menge ?? row?.mengeDelta ?? row?.quantity ?? 0) || 0) === 0) && String(exportHandoff?.source || "").toLowerCase().includes("nachtrag") ? (
            <div style={{ marginBottom: 8, padding: "8px 10px", border: "1px solid #fdba74", background: "#fff7ed", color: "#9a3412", borderRadius: 8, fontSize: 11.5, fontWeight: 700 }}>
              Export blockiert: Mindestens eine Nachtragsposition hat Δ-Menge 0. Bitte zuerst im Nachtrag die Menge korrigieren.
            </div>
          ) : null}

          <div className={rlcClass(null, handoffTableWrap)}>
            <style>{`.gaeb-handoff-preview th{padding:7px 9px;background:#f1f5f9;color:#334155;font-size:10.5px;text-align:left;border-bottom:1px solid #e2e8f0}.gaeb-handoff-preview td{padding:8px 9px;border-bottom:1px solid #e2e8f0;color:#0f172a;vertical-align:top}.gaeb-handoff-preview tr:last-child td{border-bottom:0}`}</style>
            <table className={`gaeb-handoff-preview ${rlcClass(null, handoffTable)}`}>
              <thead>
                <tr>
                  <th>Pos.</th><th>Kurztext</th><th className={rlcClass(null, handoffRight)}>Menge</th><th>ME</th><th className={rlcClass(null, handoffRight)}>EP</th><th className={rlcClass(null, handoffRight)}>Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {exportHandoff.rows.map((row:any, index:number) => {
                  const qty = Number(row?.menge ?? row?.mengeDelta ?? row?.quantity ?? 0) || 0;
                  const ep = Number(row?.preis ?? row?.ep ?? row?.finalUnitPrice ?? 0) || 0;
                  const total = Number(row?.gesamt ?? row?.total ?? qty * ep) || 0;
                  return (
                    <tr key={`${row?.posNr || row?.pos || index}-${index}`} style={qty === 0 ? { background: "#fff7ed" } : undefined}>
                      <td><b>{row?.posNr || row?.pos || index + 1}</b></td>
                      <td>
                        <b>{row?.kurztext || row?.text || "Position"}</b>
                        {row?.langtext ? <div className={rlcClass(null, handoffLongtext)}>{String(row.langtext).slice(0,180)}{String(row.langtext).length > 180 ? "…" : ""}</div> : null}
                      </td>
                      <td className={rlcClass(null, handoffRight)}>
                        <b style={qty === 0 ? { color: "#c2410c" } : undefined}>{qty.toLocaleString("de-DE", { maximumFractionDigits: 3 })}</b>
                        {qty === 0 && String(exportHandoff?.source || "").toLowerCase().includes("nachtrag") ? <div style={{ color: "#c2410c", fontSize: 10, marginTop: 2 }}>Δ-Menge fehlt</div> : null}
                      </td>
                      <td>{row?.einheit || row?.unit || row?.me || "—"}</td>
                      <td className={rlcClass(null, handoffRight)}>{ep.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                      <td className={rlcClass(null, handoffRight)}><b>{total.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

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

const previewTableWrap: React.CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  maxHeight: 560,
  overflowY: "auto",
  overflowX: "hidden",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  background: "#FFFFFF",
  boxSizing: "border-box"
};

const previewTable: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  tableLayout: "fixed",
  borderCollapse: "collapse"
};

const previewTh: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 3,
  textAlign: "left",
  padding: "5px 4px",
  fontSize: 9.5,
  color: "#475569",
  background: "#F8FAFC",
  borderBottom: "1px solid #DDE3EC",
  whiteSpace: "nowrap",
  fontWeight: 700
};
const previewThRight: React.CSSProperties = { ...previewTh, textAlign: "right" };
const previewRow: React.CSSProperties = { background: "#FFFFFF" };
const previewTd: React.CSSProperties = {
  padding: "5px 4px",
  fontSize: 11.5,
  lineHeight: 1.3,
  color: "#0F172A",
  borderBottom: "1px solid #EEF2F7",
  verticalAlign: "middle",
  minWidth: 0,
  overflowWrap: "anywhere"
};
const previewTdStrong: React.CSSProperties = { ...previewTd, fontWeight: 700, whiteSpace: "nowrap" };
const previewTdRight: React.CSSProperties = { ...previewTd, textAlign: "right", whiteSpace: "nowrap" };
const previewTextTd: React.CSSProperties = { ...previewTd, minWidth: 0 };
const previewLangtext: React.CSSProperties = { marginTop: 3, fontSize: 10.5, color: "#64748B", lineHeight: 1.3 };
const previewTextButton: React.CSSProperties = { border: 0, background: "transparent", color: "#0B5BD3", fontSize: 9.5, fontWeight: 700, padding: "0 0 0 6px", cursor: "pointer" };
const previewBadgeNeutral: React.CSSProperties = { display: "inline-flex", border: "1px solid #CBD5E1", background: "#F8FAFC", color: "#475569", borderRadius: 999, padding: "3px 6px", fontSize: 9.5, fontWeight: 700, whiteSpace: "nowrap" };
const previewBadgeOk: React.CSSProperties = { ...previewBadgeNeutral, border: "1px solid #BBF7D0", background: "#F0FDF4", color: "#15803D" };
const previewBadgeWarn: React.CSSProperties = { ...previewBadgeNeutral, border: "1px solid #FDE68A", background: "#FFFBEB", color: "#B45309" };
const previewBadgeError: React.CSSProperties = { ...previewBadgeNeutral, border: "1px solid #FECACA", background: "#FEF2F2", color: "#B91C1C" };
const previewEditButton: React.CSSProperties = { border: "1px solid #CBD5E1", background: "#FFFFFF", color: "#0F172A", borderRadius: 7, padding: "4px 8px", fontSize: 9.5, fontWeight: 700, cursor: "pointer", maxWidth: "100%", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", justifyContent: "center" };

const handoffTableWrap: React.CSSProperties = { overflowX: "auto", border: "1px solid #E2E8F0", borderRadius: 10 };
const handoffTable: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 11.5 };
const handoffRight: React.CSSProperties = { textAlign: "right", whiteSpace: "nowrap" };
const handoffLongtext: React.CSSProperties = { marginTop: 3, color: "#64748B", fontSize: 10.5, fontWeight: 400, lineHeight: 1.3 };

const handoffBanner: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "9px 12px", border: "1px solid #93C5FD", background: "#EFF6FF", color: "#1E3A8A", borderRadius: 10, fontSize: 12 };

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
