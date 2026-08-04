import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/kalkulation/preise.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { Catalog, type CatalogPos } from "./catalogStore";
import { LV, type LVPos } from "./store.lv";
import { useProject } from "../../store/useProject";
import { KalkulationsDatenbank } from "./kalkulationsDatenbank";

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorker;

type Gruppe = "Alle" | "Material" | "Arbeiter" | "Maschinen";
type PriceGroup = Exclude<Gruppe, "Alle">;
type SourceMode = "catalog" | "lv" | "handoff" | "pdf";
type ViewMode = "alle" | "pruefen" | "fehler" | "doppelte" | "epFehlt" | "einheitFehlt";

type IssueSeverity = "error" | "warning" | "info";

type PriceIssue = {
  rowId: string;
  severity: IssueSeverity;
  field: "einheit" | "gruppe" | "preis" | "text" | "duplikat";
  title: string;
  message: string;
  suggestion?: {
    einheit?: string;
    gruppe?: PriceGroup;
    ep?: number;
  };
};

type RowMeta = {
  status: "ok" | "warning" | "error" | "duplicate";
  issues: PriceIssue[];
  score: number;
  isDuplicate: boolean;
  keepBestDuplicate: boolean;
};

type ProjectLike = {
  id?: string;
  code?: string;
  number?: string;
  name?: string;
  companyId?: string;
};

type ManualPriceForm = {
  posNr: string;
  kurztext: string;
  langtext: string;
  einheit: string;
  ep: string;
  gruppe: PriceGroup;
};

type DuplicateMap = Map<string, CatalogPos[]>;

type QualityGateStatus =
"KI-Vorschlag" |
"Geprüft" |
"Freigegeben" |
"Gesperrt" |
"Nicht verwenden";

type KiLearningEntry = {
  id: string;
  source?: string;
  posNr?: string;
  kurztext?: string;
  langtext?: string;
  einheit?: string;
  menge?: number;
  kosten?: {
    epNetto?: number;
    gpNetto?: number;
  };
  confidence?: number;
  risiko?: string;
  kiHinweis?: string;
  kalkulatorNotiz?: string;
  parameter?: {
    qualityGateStatus?: QualityGateStatus;
    warning?: string;
    aiReason?: string;
    priceBreakdown?: any[];
    [key: string]: any;
  };
  updatedAt?: string;
};

const QUALITY_GATE_STATUSES: QualityGateStatus[] = [
"KI-Vorschlag",
"Geprüft",
"Freigegeben",
"Gesperrt",
"Nicht verwenden"];


const API =
(import.meta as any)?.env?.VITE_API_URL ||
(import.meta as any)?.env?.VITE_BACKEND_URL ||
"";

const MANUELL_HANDOFF_KEY = "rlc_kalkulation_manuell_handoff_v1";
const KI_HANDOFF_KEY = "rlc_kalkulation_ki_handoff_v1";
const ANGEBOT_HANDOFF_KEY = "rlc_kalkulation_angebot_handoff_v1";

const gruppen: Gruppe[] = ["Alle", "Material", "Arbeiter", "Maschinen"];

function isPriceGroup(value: unknown): value is PriceGroup {
  return value === "Material" || value === "Arbeiter" || value === "Maschinen";
}

function safeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function apiUrl(path: string): string {
  const cleanApi = String(API || "").replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  if (!cleanApi) return cleanPath;

  if (cleanApi.endsWith("/api") && cleanPath.startsWith("/api/")) {
    return `${cleanApi}${cleanPath.slice(4)}`;
  }

  return `${cleanApi}${cleanPath}`;
}

function getAuthToken(): string {
  try {
    const keys = [
    "token",
    "authToken",
    "accessToken",
    "rlc_token",
    "rlc_auth_token",
    "rlc_access_token"];


    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value?.trim()) return value.trim();
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

function norm(value: unknown): string {
  return String(value || "").
  toLowerCase().
  normalize("NFKD").
  replace(/[\u0300-\u036f]/g, "").
  replace(/ß/g, "ss").
  trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function money(value: unknown): string {
  const n = Number(value || 0);

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(Number.isFinite(n) ? n : 0);
}

function numberSafe(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const raw = String(value).trim();

  const normalized = raw.includes(",") ?
  raw.replace(/\./g, "").replace(",", ".") :
  raw.replace(/\s/g, "");

  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getProjectFromState(projectState: any): ProjectLike | null {
  const project =
  projectState?.project ||
  projectState?.currentProject ||
  projectState?.selectedProject ||
  projectState?.current ||
  projectState;

  if (!project || typeof project !== "object") return null;
  return project as ProjectLike;
}

function projectCode(project: ProjectLike | null): string {
  return String(project?.code || project?.number || project?.id || "").trim();
}

function projectName(project: ProjectLike | null): string {
  return String(project?.name || "").trim();
}

function projectLabel(project: ProjectLike | null): string {
  if (!project) return "Kein Projekt ausgewählt";

  const code = project.code || project.number || project.id || "Projekt";
  const name = project.name || "Projekt";

  return `${code} — ${name}`;
}

function normalizeUnit(value: unknown): string {
  const raw = String(value || "").trim();
  const v = norm(raw).replace(/\s/g, "");

  if (!v) return "";

  if (["m2", "qm", "m²", "m^2"].includes(v)) return "m²";
  if (["m3", "cbm", "m³", "m^3"].includes(v)) return "m³";
  if (["stk", "stuck", "stück", "st"].includes(v)) return "St";
  if (["std", "stunden", "hour", "hours", "h"].includes(v)) return "h";
  if (["to", "tonne", "tonnen", "t"].includes(v)) return "t";
  if (["meter", "lfm", "m"].includes(v)) return "m";
  if (["pausch", "pauschal", "psch"].includes(v)) return "pauschal";

  return raw;
}

function inferGroupFromText(row: CatalogPos): PriceGroup {
  const text = norm(
    `${row.posNr || ""} ${row.kurztext || ""} ${(row as any).langtext || ""} ${
    row.einheit || ""}`

  );

  if (
  text.includes("facharbeiter") ||
  text.includes("bauhelfer") ||
  text.includes("polier") ||
  text.includes("vorarbeiter") ||
  text.includes("bauleiter") ||
  text.includes("vermessungstechniker") ||
  text.includes("lohn") ||
  text.includes("arbeitszeit") ||
  text.includes("kolonne"))
  {
    return "Arbeiter";
  }

  if (
  text.includes("bagger") ||
  text.includes("radlader") ||
  text.includes("walze") ||
  text.includes("ruttelplatte") ||
  text.includes("ruettelplatte") ||
  text.includes("maschine") ||
  text.includes("geraet") ||
  text.includes("gerät") ||
  text.includes("fraese") ||
  text.includes("frase") ||
  text.includes("fräs") ||
  text.includes("schneiden") ||
  text.includes("auskofferung") ||
  text.includes("aushub") ||
  text.includes("baugrube") ||
  text.includes("graben") ||
  text.includes("verdichtung"))
  {
    return "Maschinen";
  }

  return "Material";
}

function inferUnitFromText(row: CatalogPos): string {
  const text = norm(`${row.kurztext || ""} ${(row as any).langtext || ""}`);

  if (
  text.includes("aushub") ||
  text.includes("baugrube") ||
  text.includes("auskofferung") ||
  text.includes("boden") ||
  text.includes("kies") ||
  text.includes("splitt") ||
  text.includes("schotter") ||
  text.includes("frostschutz") ||
  text.includes("verfuellen") ||
  text.includes("verfüllen"))
  {
    return "m³";
  }

  if (
  text.includes("asphalt") ||
  text.includes("pflaster") ||
  text.includes("rasengitter") ||
  text.includes("anstrich") ||
  text.includes("grundierung") ||
  text.includes("flache") ||
  text.includes("fläche"))
  {
    return "m²";
  }

  if (
  text.includes("rohr") ||
  text.includes("leitung") ||
  text.includes("kabel") ||
  text.includes("bord") ||
  text.includes("randstein") ||
  text.includes("nym") ||
  text.includes("brandmeldekabel"))
  {
    return "m";
  }

  if (
  text.includes("steckdose") ||
  text.includes("datendose") ||
  text.includes("leitungsschutzschalter") ||
  text.includes("zählerschrank") ||
  text.includes("zaehlerschrank"))
  {
    return "St";
  }

  if (text.includes("arbeiter") || text.includes("helfer") || text.includes("bagger")) {
    return "h";
  }

  return normalizeUnit(row.einheit || "") || "m";
}

function extractDepthMeters(text: string): number {
  const clean = norm(text).replace(",", ".");

  const m1 = clean.match(/tiefe\s*(?:bis)?\s*(\d+(?:\.\d+)?)\s*m/);
  if (m1) return numberSafe(m1[1]);

  const m2 = clean.match(/(\d+(?:\.\d+)?)\s*m\s*tief/);
  if (m2) return numberSafe(m2[1]);

  return 1;
}

function extractBodenklasse(text: string): number {
  const clean = norm(text);
  const m = clean.match(/bodenklasse\s*(\d)/);

  return m ? numberSafe(m[1], 2) : 2;
}

function expectedRange(row: CatalogPos): {min: number;max: number;label: string;} | null {
  const text = norm(`${row.kurztext || ""} ${(row as any).langtext || ""}`);
  const unit = normalizeUnit(row.einheit);

  if (text.includes("frostschutzschicht") || text.includes("frostschutz")) {
    return unit === "m³" ?
    { min: 28, max: 75, label: "Frostschutz €/m³" } :
    { min: 6, max: 45, label: "Frostschutz je Einheit" };
  }

  if (text.includes("aushub") || text.includes("auskofferung") || text.includes("baugrube")) {
    return unit === "m³" ?
    { min: 8, max: 110, label: "Aushub/Baugrube €/m³" } :
    { min: 5, max: 140, label: "Aushub/Baugrube je Einheit" };
  }

  if (text.includes("pflaster")) {
    return unit === "m²" ?
    { min: 35, max: 160, label: "Pflasterarbeiten €/m²" } :
    { min: 16, max: 100, label: "Pflaster je Einheit" };
  }

  if (text.includes("asphalt")) {
    return unit === "m²" ?
    { min: 25, max: 140, label: "Asphaltarbeiten €/m²" } :
    { min: 18, max: 100, label: "Asphalt je Einheit" };
  }

  if (text.includes("steckdose schuko") || text.includes("schuko")) {
    return { min: 8, max: 55, label: "Steckdose Schuko €/St" };
  }

  if (text.includes("datendose") || text.includes("rj45")) {
    return { min: 8, max: 60, label: "RJ45 Datendose €/St" };
  }

  if (text.includes("facharbeiter")) return { min: 38, max: 85, label: "Facharbeiter €/h" };
  if (text.includes("bauhelfer")) return { min: 30, max: 65, label: "Bauhelfer €/h" };
  if (text.includes("bagger")) return { min: 45, max: 180, label: "Bagger €/h" };
  if (text.includes("lkw")) return { min: 75, max: 170, label: "LKW €/h" };

  return null;
}

function suggestedPriceForRow(row: CatalogPos): number | null {
  const text = norm(`${row.kurztext || ""} ${(row as any).langtext || ""}`);
  const unit = normalizeUnit(row.einheit);

  if (text.includes("frostschutzschicht") || text.includes("frostschutz")) {
    return unit === "m³" ? 48 : 18;
  }

  if (text.includes("aushub") || text.includes("auskofferung") || text.includes("baugrube")) {
    if (unit !== "m³") return 35;

    const bk = extractBodenklasse(text);
    const depth = extractDepthMeters(text);

    const byBk: Record<number, number> = {
      1: 38,
      2: 48,
      3: 58,
      4: 70,
      5: 82,
      6: 95,
      7: 110
    };

    let base = byBk[bk] || 48;

    if (depth > 2) base += 10;
    if (depth > 3) base += 15;

    return round2(base);
  }

  if (text.includes("pflaster")) return 85;
  if (text.includes("asphalt")) return unit === "m²" ? 42.5 : 55;
  if (text.includes("steckdose schuko") || text.includes("schuko")) return 35;
  if (text.includes("datendose") || text.includes("rj45")) return 26;
  if (text.includes("leitungsschutzschalter")) return 32;
  if (text.includes("zaehlerschrank") || text.includes("zählerschrank")) return 650;
  if (text.includes("brandmeldekabel")) return 4.5;
  if (text.includes("nym") || text.includes("kabel verlegen")) return 8;

  const range = expectedRange(row);
  if (range) return round2((range.min + range.max) / 2);

  return null;
}

function normalizeDuplicateText(value: unknown): string {
  return norm(String(value || "")).
  replace(/\b(liefern|einbauen|herstellen|ausfuehren|ausführen|montieren|verlegen)\b/g, "").
  replace(/\b(einschl|einschliesslich|einschließlich|inkl|inklusive)\b/g, "").
  replace(/\b(position|pos|lv)\b/g, "").
  replace(/\b[a-z]\b$/g, "").
  replace(/\s+/g, " ").
  trim();
}

function normalizeRow(row: CatalogPos): CatalogPos {
  const normalizedUnit = normalizeUnit(row.einheit) || inferUnitFromText(row);
  const rawGroup = (row as any).gruppe;

  const gruppe: PriceGroup = isPriceGroup(rawGroup) ?
  rawGroup :
  inferGroupFromText({
    ...(row as any),
    einheit: normalizedUnit
  } as CatalogPos);

  return {
    ...(row as any),
    id: String((row as any).id || safeId()),
    posNr: String(row.posNr || "").trim(),
    kurztext: String(row.kurztext || "").trim(),
    langtext: String((row as any).langtext || "").trim(),
    einheit: normalizedUnit,
    gruppe,
    ep: round2(numberSafe((row as any).ep))
  } as CatalogPos;
}

function duplicateKey(row: CatalogPos): string {
  const normalized = normalizeRow(row);
  const unit = normalizeUnit(normalized.einheit || "");
  const text = normalizeDuplicateText(
    `${normalized.kurztext || ""} ${(normalized as any).langtext || ""}`
  );

  return `${unit}|${text}`;
}

function buildDuplicateMap(rows: CatalogPos[]): DuplicateMap {
  const map = new Map<string, CatalogPos[]>();

  for (const raw of rows) {
    const row = normalizeRow(raw);
    const key = duplicateKey(row);

    if (!key.trim()) continue;

    const arr = map.get(key) || [];
    arr.push(row);
    map.set(key, arr);
  }

  for (const [key, arr] of Array.from(map.entries())) {
    if (arr.length < 2) map.delete(key);
  }

  return map;
}

function rowProbabilityScore(row: CatalogPos): number {
  const normalized = normalizeRow(row);
  const ep = numberSafe((normalized as any).ep);
  const range = expectedRange(normalized);
  const suggested = suggestedPriceForRow(normalized);

  let score = 0;

  if (String(normalized.posNr || "").trim()) score += 10;
  if (String(normalized.kurztext || "").trim()) score += 18;
  if (String(normalized.einheit || "").trim()) score += 12;
  if (ep > 0) score += 22;

  if (range && ep >= range.min && ep <= range.max) score += 35;
  if (range && (ep < range.min || ep > range.max)) score -= 30;

  if (suggested && ep > 0) {
    const deviation = Math.abs(ep - suggested) / Math.max(suggested, 1);
    score += Math.max(0, 25 - deviation * 50);
  }

  return round2(score);
}

function bestDuplicateRow(rows: CatalogPos[]): CatalogPos {
  return [...rows].sort((a, b) => rowProbabilityScore(b) - rowProbabilityScore(a))[0];
}

function autoCorrectRow(row: CatalogPos): CatalogPos {
  const normalizedUnit = normalizeUnit(row.einheit) || inferUnitFromText(row);
  const baseRow = { ...(row as any), einheit: normalizedUnit } as CatalogPos;
  const inferredGroup = inferGroupFromText(baseRow);
  const ep = numberSafe((row as any).ep);

  const checkRow = { ...(baseRow as any), gruppe: inferredGroup } as CatalogPos;
  const suggestion = suggestedPriceForRow(checkRow);
  const range = expectedRange(checkRow);

  let nextEp = ep;

  if (suggestion !== null && suggestion !== undefined) {
    if (ep <= 0) nextEp = suggestion;else
    if (range && (ep < range.min || ep > range.max)) nextEp = suggestion;
  }

  return normalizeRow({
    ...(row as any),
    einheit: normalizedUnit,
    gruppe: inferredGroup,
    ep: round2(nextEp)
  } as CatalogPos);
}

function getVisibleRowId(row: CatalogPos): string {
  return String((row as any).id || `${row.posNr}-${row.kurztext}-${row.einheit}`);
}

function validatePriceRow(row: CatalogPos, duplicates?: DuplicateMap): PriceIssue[] {
  const normalized = normalizeRow(row);
  const rowId = getVisibleRowId(row);
  const issues: PriceIssue[] = [];

  const ep = numberSafe((normalized as any).ep);
  const unit = normalizeUnit(normalized.einheit);
  const currentUnit = String(row.einheit || "").trim();
  const currentGroupRaw = (row as any).gruppe;
  const currentGroup = isPriceGroup(currentGroupRaw) ?
  currentGroupRaw :
  "Material" as PriceGroup;

  const inferredGroup = inferGroupFromText(normalized);
  const inferredUnit = inferUnitFromText(normalized);
  const suggestedEp = suggestedPriceForRow(normalized);

  if (!String(row.posNr || row.kurztext || "").trim()) {
    issues.push({
      rowId,
      severity: "error",
      field: "text",
      title: "Text fehlt",
      message: "Position hat weder Positionsnummer noch Kurztext."
    });
  }

  if (!currentUnit) {
    issues.push({
      rowId,
      severity: "error",
      field: "einheit",
      title: "Einheit fehlt",
      message: "Ohne Einheit darf die Position nicht gespeichert werden.",
      suggestion: { einheit: inferredUnit }
    });
  } else if (unit !== currentUnit) {
    issues.push({
      rowId,
      severity: "warning",
      field: "einheit",
      title: "Einheit wird normalisiert",
      message: `${currentUnit} sollte als ${unit} gespeichert werden.`,
      suggestion: { einheit: unit }
    });
  }

  if (!isPriceGroup(currentGroupRaw)) {
    issues.push({
      rowId,
      severity: "warning",
      field: "gruppe",
      title: "Gruppe ungültig",
      message: `Aktuelle Gruppe: ${String(currentGroupRaw || "—")}. Fachlich gesetzt wird: ${inferredGroup}.`,
      suggestion: { gruppe: inferredGroup }
    });
  } else if (currentGroup !== inferredGroup) {
    issues.push({
      rowId,
      severity: "warning",
      field: "gruppe",
      title: "Gruppe wahrscheinlich falsch",
      message: `Aktuelle Gruppe: ${currentGroup}. Fachlich wahrscheinlicher: ${inferredGroup}.`,
      suggestion: { gruppe: inferredGroup }
    });
  }

  if (!Number.isFinite(ep) || ep < 0) {
    issues.push({
      rowId,
      severity: "error",
      field: "preis",
      title: "Preis ungültig",
      message: "EP netto ist ungültig oder negativ."
    });
  }

  if (ep === 0) {
    issues.push({
      rowId,
      severity: "warning",
      field: "preis",
      title: "Preis ist 0",
      message: "Preis 0 darf nur für bewusst kostenlose Positionen übernommen werden.",
      suggestion: suggestedEp ? { ep: suggestedEp } : undefined
    });
  }

  const range = expectedRange(normalized);

  if (range && ep > 0) {
    if (ep < range.min) {
      issues.push({
        rowId,
        severity: "warning",
        field: "preis",
        title: "Preis auffällig niedrig",
        message: `${money(ep)} liegt unter ${money(range.min)}–${money(range.max)} (${range.label}).`,
        suggestion: suggestedEp ? { ep: suggestedEp } : undefined
      });
    }

    if (ep > range.max) {
      issues.push({
        rowId,
        severity: "warning",
        field: "preis",
        title: "Preis auffällig hoch",
        message: `${money(ep)} liegt über ${money(range.min)}–${money(range.max)} (${range.label}).`,
        suggestion: suggestedEp ? { ep: suggestedEp } : undefined
      });
    }
  }

  if (duplicates) {
    const arr = duplicates.get(duplicateKey(row));

    if (arr && arr.length > 1) {
      const best = bestDuplicateRow(arr);
      const isBest = getVisibleRowId(best) === rowId;

      issues.push({
        rowId,
        severity: isBest ? "info" : "warning",
        field: "duplikat",
        title: isBest ?
        "Doppelter Eintrag - bester Eintrag" :
        "Doppelter Eintrag - löschen möglich",
        message: isBest ?
        `Es gibt ${arr.length} fachlich gleiche Einträge. Dieser Eintrag bleibt bevorzugt.` :
        `Es gibt ${arr.length} fachlich gleiche Einträge. Dieser Eintrag ist weniger plausibel.`
      });
    }
  }

  return issues;
}

function keepRowsAndEnsureIds(rows: CatalogPos[]): CatalogPos[] {
  const used = new Set<string>();

  return rows.map((row) => {
    const normalized = normalizeRow(row);
    let id = getVisibleRowId(normalized);

    if (used.has(id)) id = `${id}-${safeId()}`;
    used.add(id);

    return {
      ...(normalized as any),
      id
    } as CatalogPos;
  });
}

function rowToEditor(row: CatalogPos): ManualPriceForm {
  const corrected = normalizeRow(row);

  return {
    posNr: String(corrected.posNr || ""),
    kurztext: String(corrected.kurztext || ""),
    langtext: String((corrected as any).langtext || ""),
    einheit: normalizeUnit(corrected.einheit || "m"),
    ep: String(numberSafe((corrected as any).ep)),
    gruppe: ((corrected as any).gruppe || "Material") as PriceGroup
  };
}

function editorToCatalogRow(form: ManualPriceForm, previous?: CatalogPos): CatalogPos {
  return normalizeRow({
    ...(previous || {}),
    id: previous ? getVisibleRowId(previous) : `manual-${form.posNr}-${safeId()}`,
    posNr: form.posNr.trim(),
    kurztext: form.kurztext.trim(),
    langtext: form.langtext.trim(),
    einheit: normalizeUnit(form.einheit.trim() || "m"),
    ep: numberSafe(form.ep),
    gruppe: form.gruppe
  } as CatalogPos);
}

function catalogToLvPos(row: CatalogPos, existing?: LVPos): LVPos {
  const corrected = normalizeRow(row);
  const ep = numberSafe((corrected as any).ep);
  const menge = numberSafe(existing?.menge);

  return {
    id: existing?.id || safeId(),
    posNr: String(corrected.posNr || ""),
    parentPosNr: existing?.parentPosNr || "",
    sortIndex: existing?.sortIndex,
    kurztext: String(corrected.kurztext || ""),
    langtext: String(existing?.langtext || (corrected as any).langtext || ""),
    bemerkung: existing?.bemerkung || "",
    einheit: normalizeUnit(corrected.einheit || ""),
    menge,
    preis: ep,
    gesamt: menge ? round2(menge * ep) : 0,
    waehrung: existing?.waehrung || "EUR",
    confidence: existing?.confidence,
    source: existing?.source || "manual",
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function lvToCatalog(row: LVPos): CatalogPos {
  return normalizeRow({
    id: `lv-${row.id || safeId()}`,
    posNr: String(row.posNr || ""),
    kurztext: String(row.kurztext || ""),
    langtext: String(row.langtext || ""),
    einheit: normalizeUnit(row.einheit || ""),
    ep: numberSafe(row.preis),
    gruppe: "Material"
  } as CatalogPos);
}

function payloadRowToCatalog(row: any, index: number): CatalogPos {
  const posNr = String(row.posNr || row.pos || row.lvPos || "").trim();
  const kurztext = String(row.kurztext || row.text || row.title || "").trim();
  const langtext = String(row.langtext || "").trim();
  const einheit = normalizeUnit(row.einheit || row.unit || "m");
  const ep = numberSafe(
    row.preis ?? row.ep ?? row.finalUnitPrice ?? row.suggestedUnitPrice
  );

  return normalizeRow({
    id: `handoff-${posNr || index}-${safeId()}`,
    posNr,
    kurztext,
    langtext,
    einheit,
    ep,
    gruppe: "Material"
  } as CatalogPos);
}

function toRefKey(row: CatalogPos): string {
  const normalized = normalizeRow(row);
  const pos = String(normalized.posNr || "").trim();

  if (/^(LABOR|MACHINE|MATERIAL|OTHER):/i.test(pos)) return pos.toUpperCase();

  const gruppe = String((normalized as any).gruppe || "").trim();

  if (gruppe === "Arbeiter") return `LABOR:${pos}`;
  if (gruppe === "Maschinen") return `MACHINE:${pos}`;
  if (gruppe === "Material") return `MATERIAL:${pos}`;

  return `OTHER:${pos}`;
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function catalogCsvFromRows(rows: CatalogPos[]): string {
  const header = "PosNr;Kurztext;Einheit;EP;Gruppe";

  const lines = rows.map((rawRow) => {
    const row = normalizeRow(rawRow);

    return [
    csvCell(row.posNr),
    csvCell(row.kurztext),
    csvCell(normalizeUnit(row.einheit)),
    String(numberSafe((row as any).ep)).replace(".", ","),
    csvCell((row as any).gruppe || "Material")].
    join(";");
  });

  return [header, ...lines].join("\n");
}

function datenbankCsvFromRows(rows: CatalogPos[]): string {
  const header =
  "posNr;kurztext;langtext;einheit;preis;gewerk;leistungsart;region";

  const body = rows.map((rawRow) => {
    const row = normalizeRow(rawRow);
    const gruppe = String((row as any).gruppe || "Material");
    const text = norm(`${row.kurztext || ""} ${(row as any).langtext || ""}`);

    const gewerk =
    text.includes("asphalt") || text.includes("pflaster") ?
    "Straßenbau" :
    text.includes("aushub") || text.includes("baugrube") || text.includes("graben") ?
    "Tiefbau / Erdarbeiten" :
    text.includes("steckdose") ||
    text.includes("datendose") ||
    text.includes("kabel") ||
    text.includes("leitungsschutzschalter") ?
    "Elektro" :
    gruppe === "Material" ?
    "Material" :
    "Bauleistung";

    return [
    csvCell(row.posNr),
    csvCell(row.kurztext),
    csvCell((row as any).langtext || ""),
    csvCell(normalizeUnit(row.einheit)),
    String(numberSafe((row as any).ep)).replace(".", ","),
    csvCell(gewerk),
    csvCell(gruppe),
    csvCell("DE")].
    join(";");
  });

  return [header, ...body].join("\n");
}

async function extractTextFromPdf(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await (pdfjsLib as any).getDocument({ data: buffer }).promise;

  const parts: string[] = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();

    const pageText = content.items.
    map((item: any) => String(item?.str || "")).
    join(" ").
    replace(/\s+/g, " ").
    trim();

    if (pageText) parts.push(pageText);
  }

  return parts.join("\n");
}

function rowsFromPdfText(text: string): CatalogPos[] {
  const clean = text.replace(/\r/g, "\n");

  const chunks = clean.
  split(/(?=(?:\d{2}\.\d{2}(?:\.\d{2,4})?(?:-[A-Z])?))/g).
  map((x) => x.replace(/\s+/g, " ").trim()).
  filter(Boolean);

  const rows: CatalogPos[] = [];

  for (const chunk of chunks) {
    const posMatch = chunk.match(/\b\d{2}\.\d{2}(?:\.\d{2,4})?(?:-[A-Z])?\b/);
    if (!posMatch) continue;

    const posNr = posMatch[0];

    const unitMatch = chunk.match(/\b(m²|m2|qm|m³|m3|cbm|St|Stk|t|h|m|pauschal)\b/i);

    const unit = normalizeUnit(
      unitMatch?.[1] || inferUnitFromText({ kurztext: chunk } as CatalogPos)
    );

    const priceMatches = Array.from(
      chunk.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:,\d{2})|\d+(?:\.\d{2}))\s*(?:€|EUR)?/gi)
    );

    const lastPrice = priceMatches.length ?
    numberSafe(priceMatches[priceMatches.length - 1][1]) :
    0;

    let kurztext = chunk.
    replace(posNr, "").
    replace(/\b(m²|m2|qm|m³|m3|cbm|St|Stk|t|h|m|pauschal)\b/gi, " ").
    replace(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:,\d{2})|\d+(?:\.\d{2}))\s*(?:€|EUR)?/gi, " ").
    replace(/\s+/g, " ").
    trim();

    if (kurztext.length > 140) kurztext = kurztext.slice(0, 140).trim();
    if (!kurztext) kurztext = "PDF-Position";

    rows.push(
      normalizeRow({
        id: `pdf-${posNr}-${safeId()}`,
        posNr,
        kurztext,
        langtext: chunk,
        einheit: unit,
        ep: lastPrice,
        gruppe: "Material",
        source: "pdf"
      } as CatalogPos)
    );
  }

  return keepRowsAndEnsureIds(rows);
}

export default function PreisePage() {
  const projectState: any = useProject();
  const project = getProjectFromState(projectState);

  const [cat, setCat] = useState<CatalogPos[]>([]);
  const [sourceMode, setSourceMode] = useState<SourceMode>("catalog");
  const [viewMode, setViewMode] = useState<ViewMode>("alle");
  const [query, setQuery] = useState("");
  const [gruppe, setGruppe] = useState<Gruppe>("Alle");
  const [allWords, setAllWords] = useState(false);
  const [wholeWords, setWholeWords] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [stat, setStat] = useState("");
  const [kiLearningRows, setKiLearningRows] = useState<KiLearningEntry[]>([]);
  const [qualityBusyId, setQualityBusyId] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState("");
  const [rowMeta, setRowMeta] = useState<Record<string, RowMeta>>({});
  const [pruefungDone, setPruefungDone] = useState(false);
  const [companyId, setCompanyId] = useState("");

  const [manual, setManual] = useState<ManualPriceForm>({
    posNr: "",
    kurztext: "",
    langtext: "",
    einheit: "m",
    ep: "0",
    gruppe: "Material"
  });

  const [editor, setEditor] = useState<ManualPriceForm | null>(null);
  const [editorRowId, setEditorRowId] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = "rlc-preise-spinner-style";
    if (document.getElementById(id)) return;

    const style = document.createElement("style");
    style.id = id;
    style.innerHTML = `
      @keyframes rlcSpin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;

    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    setCompanyId(String(project?.companyId || ""));

    async function loadCompanyId() {
      if (project?.companyId) return;
      if (!project?.id) return;

      try {
        const res = await fetch(
          apiUrl(`/api/projects/${encodeURIComponent(project.id)}`),
          {
            credentials: "include",
            headers: withAuthHeaders({
              "Content-Type": "application/json"
            })
          }
        );

        if (!res.ok) return;

        const json = await res.json().catch(() => null);

        const cid =
        json?.project?.companyId ||
        json?.companyId ||
        json?.data?.companyId ||
        "";

        if (alive && cid) setCompanyId(String(cid));
      } catch {


        //
      }}
    loadCompanyId();

    return () => {
      alive = false;
    };
  }, [project?.id, project?.companyId]);

  async function runBusy(label: string, job: () => void | Promise<void>) {
    if (busy) return;

    setBusy(true);
    setBusyText(label);
    setErr("");

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await job();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
      setBusyText("");
    }
  }

  function clearCheck() {
    setRowMeta({});
    setPruefungDone(false);
    setViewMode("alle");
  }

  function persistCatalog(rows: CatalogPos[]) {
    const clean = keepRowsAndEnsureIds(rows);
    Catalog.setAll(clean);
    setCat(clean);
    return clean;
  }

  async function saveRowsToDatenbank(rows: CatalogPos[]) {
    const validRows = rows.
    map(normalizeRow).
    filter(
      (r) =>
      String(r.posNr || r.kurztext || "").trim() &&
      String(r.einheit || "").trim() &&
      Number.isFinite(numberSafe((r as any).ep))
    );

    if (!validRows.length) return;

    const entries = validRows.map((r) =>
    KalkulationsDatenbank.fromCalculatedPosition({
      quelle: "import",
      projektCode: projectCode(project),
      projektName: projectName(project),
      posNr: String(r.posNr || ""),
      kurztext: String(r.kurztext || ""),
      langtext: String((r as any).langtext || ""),
      einheit: String(r.einheit || ""),
      menge: 1,
      finalUnitPrice: numberSafe((r as any).ep),
      totalNet: numberSafe((r as any).ep),
      confidence: 0.75
    })
    );

    KalkulationsDatenbank.bulkUpsert(entries);

    try {
      const csvText = datenbankCsvFromRows(validRows);

      await fetch(apiUrl("/api/kalkulation/datenbank/import-csv"), {
        method: "POST",
        credentials: "include",
        headers: withAuthHeaders({
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({
          source: "company",
          projectKey: projectCode(project),
          csvText
        })
      });
    } catch {


      //
    }}
  async function loadKiLearningRows() {
    try {
      const res = await fetch(apiUrl("/api/kalkulation/datenbank?source=ki-learning&limit=50"), {
        method: "GET",
        credentials: "include",
        headers: withAuthHeaders()
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "KI-Learning konnte nicht geladen werden.");
      }

      const rows = Array.isArray(json.rows) ? json.rows : [];
      setKiLearningRows(rows);
      setStat(`KI-Learning geladen: ${rows.length.toLocaleString("de-DE")} Vorschläge.`);
    } catch (e: any) {
      setErr(e?.message || "KI-Learning konnte nicht geladen werden.");
    }
  }

  async function setQualityGateStatus(
  entry: KiLearningEntry,
  status: QualityGateStatus)
  {
    if (!entry.id) return;

    setQualityBusyId(entry.id);

    try {
      const res = await fetch(
        apiUrl(`/api/kalkulation/datenbank/${entry.id}/quality-gate`),
        {
          method: "PATCH",
          credentials: "include",
          headers: withAuthHeaders({
            "Content-Type": "application/json"
          }),
          body: JSON.stringify({
            status,
            note: `Quality Gate über Preise-UI gesetzt: ${status}`
          })
        }
      );

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Quality Gate konnte nicht gespeichert werden.");
      }

      setKiLearningRows((prev) =>
      prev.map((row) =>
      row.id === entry.id ?
      {
        ...row,
        parameter: {
          ...(row.parameter || {}),
          qualityGateStatus: status
        }
      } :
      row
      )
      );

      setStat(`Quality Gate gesetzt: ${entry.posNr || entry.kurztext} → ${status}`);
    } catch (e: any) {
      setErr(e?.message || "Quality Gate konnte nicht gespeichert werden.");
    } finally {
      setQualityBusyId("");
    }
  }

  function kiLearningToCatalog(row: KiLearningEntry): CatalogPos {
    return normalizeRow({
      id: `ki-learning-${row.id}`,
      posNr: row.posNr || "",
      kurztext: row.kurztext || "",
      langtext: row.langtext || "",
      einheit: row.einheit || "",
      ep: numberSafe(row.kosten?.epNetto),
      gruppe: "Material",
      source: "ki-learning"
    } as CatalogPos);
  }

  function loadKiLearningIntoCatalog() {
    const rows = keepRowsAndEnsureIds(kiLearningRows.map(kiLearningToCatalog));
    setSourceMode("catalog");
    setCat(rows);
    setSelected({});
    setEditor(null);
    setEditorRowId("");
    clearCheck();
    setStat(`KI-Learning in Preisliste geladen: ${rows.length.toLocaleString("de-DE")} Positionen.`);
  }
  function loadCatalog() {
    const rows = keepRowsAndEnsureIds(Catalog.list());

    setSourceMode("catalog");
    setCat(rows);
    setSelected({});
    setEditor(null);
    setEditorRowId("");
    clearCheck();
    setErr("");
    setStat("Katalog geladen.");
  }

  function loadFromLV() {
    const rows = keepRowsAndEnsureIds(LV.list().map(lvToCatalog));

    setSourceMode("lv");
    setCat(rows);
    setSelected({});
    setEditor(null);
    setEditorRowId("");
    clearCheck();
    setErr("");
    setStat(`Aus LV geladen: ${rows.length.toLocaleString("de-DE")} Positionen.`);
  }

  function loadFromKiOrManuell() {
    const allRows: CatalogPos[] = [];

    for (const key of [KI_HANDOFF_KEY, MANUELL_HANDOFF_KEY, ANGEBOT_HANDOFF_KEY]) {
      try {
        const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (!raw) continue;

        const parsed = JSON.parse(raw);
        const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];

        rows.forEach((row: any, index: number) => {
          allRows.push(payloadRowToCatalog(row, index));
        });
      } catch {


        //
      }}
    const clean = keepRowsAndEnsureIds(
      allRows.filter((r) => String(r.posNr || r.kurztext || "").trim())
    );

    setSourceMode("handoff");
    setCat(clean);
    setSelected({});
    setEditor(null);
    setEditorRowId("");
    clearCheck();
    setErr("");
    setStat(
      clean.length ?
      `Aus KI/Manuell geladen: ${clean.length.toLocaleString("de-DE")} Positionen.` :
      "Keine KI/Manuell-Daten gefunden."
    );
  }

  async function importFile(file: File) {
    const name = file.name.toLowerCase();

    if (name.endsWith(".pdf")) {
      const text = await extractTextFromPdf(file);
      const rows = rowsFromPdfText(text);

      if (!rows.length) {
        setErr("PDF wurde gelesen, aber keine Preispositionen erkannt.");
        return;
      }

      setSourceMode("pdf");
      setCat(rows);
      setSelected({});
      setEditor(null);
      setEditorRowId("");
      clearCheck();
      setStat(`PDF gelesen: ${rows.length.toLocaleString("de-DE")} Positionen erkannt.`);
      return;
    }

    const text = await file.text();
    const count = Catalog.importCSV(text);
    const next = keepRowsAndEnsureIds(Catalog.list());

    setSourceMode("catalog");
    setCat(next);
    setSelected({});
    setEditor(null);
    setEditorRowId("");
    clearCheck();
    setStat(`CSV importiert: ${count.toLocaleString("de-DE")} Positionen.`);
  }

  function exportCSV() {
    const csv = catalogCsvFromRows(cat);

    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" })
    );

    const a = document.createElement("a");
    a.href = url;
    a.download = "preise.csv";
    a.click();

    URL.revokeObjectURL(url);
  }

  function startPruefung() {
    const rows = cat.map(normalizeRow);
    const duplicates = buildDuplicateMap(rows);
    const nextMeta: Record<string, RowMeta> = {};

    for (const row of rows) {
      const id = getVisibleRowId(row);
      const issues = validatePriceRow(row, duplicates);
      const hasError = issues.some((x) => x.severity === "error");
      const hasWarning = issues.some((x) => x.severity === "warning");
      const duplicateGroup = duplicates.get(duplicateKey(row));
      const isDuplicate = !!duplicateGroup;
      const best = duplicateGroup ? bestDuplicateRow(duplicateGroup) : null;
      const keepBestDuplicate = best ? getVisibleRowId(best) === id : false;

      nextMeta[id] = {
        status: hasError ?
        "error" :
        hasWarning ?
        "warning" :
        isDuplicate ?
        "duplicate" :
        "ok",
        issues,
        score: rowProbabilityScore(row),
        isDuplicate,
        keepBestDuplicate
      };
    }

    setRowMeta(nextMeta);
    setPruefungDone(true);

    const errors = Object.values(nextMeta).filter((x) => x.status === "error").length;
    const warnings = Object.values(nextMeta).filter(
      (x) => x.status === "warning" || x.status === "duplicate"
    ).length;
    const dups = Object.values(nextMeta).filter((x) => x.isDuplicate).length;

    setStat(
      `Prüfung abgeschlossen: ${errors} Fehler, ${warnings} Prüfen, ${dups} Doppelte.`
    );
  }

  function addManualPosition() {
    setErr("");
    setStat("");

    if (!manual.posNr.trim()) {
      setErr("Bitte Positionsnummer eintragen.");
      return;
    }

    if (!manual.kurztext.trim()) {
      setErr("Bitte Kurztext eintragen.");
      return;
    }

    const row = editorToCatalogRow(manual);
    const next = persistCatalog([row, ...cat]);

    setSelected({ [getVisibleRowId(row)]: true });
    setEditor(rowToEditor(row));
    setEditorRowId(getVisibleRowId(row));
    clearCheck();

    setManual({
      posNr: "",
      kurztext: "",
      langtext: "",
      einheit: "m",
      ep: "0",
      gruppe: manual.gruppe
    });

    saveRowsToDatenbank([row]);
    setStat(`Preisposition gespeichert. Gesamt: ${next.length.toLocaleString("de-DE")}.`);
  }

  function startEdit(row: CatalogPos) {
    const id = getVisibleRowId(row);
    const original = cat.find((x) => getVisibleRowId(x) === id) || row;

    setSelected((prev) => ({
      ...prev,
      [getVisibleRowId(original)]: true
    }));

    setEditor(rowToEditor(original));
    setEditorRowId(getVisibleRowId(original));
  }

  async function saveEditedPosition() {
    setErr("");

    if (!editor || !editorRowId) {
      setErr("Keine Preisposition ausgewählt.");
      return;
    }

    if (!editor.posNr.trim()) {
      setErr("Positionsnummer darf nicht leer sein.");
      return;
    }

    if (!editor.kurztext.trim()) {
      setErr("Kurztext darf nicht leer sein.");
      return;
    }

    const prevRow = cat.find((row) => getVisibleRowId(row) === editorRowId);
    const edited = editorToCatalogRow(editor, prevRow);

    const next = cat.map((row) =>
    getVisibleRowId(row) === editorRowId ? edited : row
    );

    const clean = persistCatalog(next);

    setSelected({ [getVisibleRowId(edited)]: true });
    setEditor(rowToEditor(edited));
    setEditorRowId(getVisibleRowId(edited));
    clearCheck();

    await saveRowsToDatenbank([edited]);

    const existingLv = LV.list().find(
      (x) => String(x.posNr || "") === String(edited.posNr || "")
    );

    if (existingLv) {
      LV.upsert(catalogToLvPos(edited, existingLv));
    }

    setStat(
      `Preisposition gespeichert und in Kalkulationsdatenbank übernommen. Gesamt: ${clean.length.toLocaleString(
        "de-DE"
      )}.`
    );
  }

  async function saveSingleRow(row: CatalogPos) {
    const normalized = normalizeRow(row);
    const next = cat.map((x) =>
    getVisibleRowId(x) === getVisibleRowId(row) ? normalized : x
    );

    persistCatalog(next);
    await saveRowsToDatenbank([normalized]);
    clearCheck();

    setStat("Preisposition gespeichert und in Kalkulationsdatenbank übernommen.");
  }

  function deleteSingleRow(row: CatalogPos) {
    const id = getVisibleRowId(row);

    const next = cat.filter((x) => getVisibleRowId(x) !== id);
    persistCatalog(next);

    setSelected((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    if (editorRowId === id) {
      setEditor(null);
      setEditorRowId("");
    }

    clearCheck();
    setStat("Preisposition gelöscht.");
  }

  function toggleRow(row: CatalogPos, checked: boolean) {
    const rowId = getVisibleRowId(row);

    setSelected((prev) => ({
      ...prev,
      [rowId]: checked
    }));

    if (checked) startEdit(row);else
    if (editorRowId === rowId) {
      setEditor(null);
      setEditorRowId("");
    }
  }

  function toggleAll(checked: boolean) {
    const next: Record<string, boolean> = {};

    if (checked) {
      view.forEach((row) => {
        next[getVisibleRowId(row)] = true;
      });
    }

    setSelected(next);
  }

  function selectDuplicatesForDelete() {
    if (!pruefungDone) {
      setStat("Bitte zuerst Prüfung starten.");
      return;
    }

    const next: Record<string, boolean> = {};

    for (const row of cat) {
      const id = getVisibleRowId(row);
      const meta = rowMeta[id];

      if (meta?.isDuplicate && !meta.keepBestDuplicate) {
        next[id] = true;
      }
    }

    setSelected(next);
    setViewMode("doppelte");

    const count = Object.keys(next).length;
    setStat(`${count} weniger plausible Doppelte ausgewählt.`);
  }

  function deleteSelectedRows() {
    const ids = new Set(
      Object.entries(selected).
      filter(([, checked]) => checked).
      map(([id]) => id)
    );

    if (!ids.size) {
      alert("Bitte zuerst Positionen auswählen.");
      return;
    }

    const next = cat.filter((row) => !ids.has(getVisibleRowId(row)));
    persistCatalog(next);

    setSelected({});
    setEditor(null);
    setEditorRowId("");
    clearCheck();

    setStat(`${ids.size} ausgewählte Position(en) gelöscht.`);
  }

  function autoCorrectSelected() {
    const ids = new Set(
      Object.entries(selected).
      filter(([, checked]) => checked).
      map(([id]) => id)
    );

    if (!ids.size) {
      alert("Bitte zuerst Positionen auswählen.");
      return;
    }

    const next = cat.map((row) =>
    ids.has(getVisibleRowId(row)) ? autoCorrectRow(row) : normalizeRow(row)
    );

    persistCatalog(next);
    setSelected({});
    setEditor(null);
    setEditorRowId("");
    clearCheck();

    setStat("Auswahl automatisch korrigiert und gespeichert. Prüfung bitte neu starten.");
  }

  function writeSelectedToLV() {
    if (!selectedRows.length) {
      alert("Bitte mindestens eine Position auswählen.");
      return;
    }

    const current = LV.list();
    const map = new Map(current.map((x) => [String(x.posNr || ""), x] as const));

    let inserted = 0;
    let updated = 0;

    for (const rawRow of selectedRows) {
      const row = normalizeRow(rawRow);
      const found = map.get(String(row.posNr || ""));

      LV.upsert(catalogToLvPos(row, found));

      if (found) updated += 1;else
      inserted += 1;
    }

    setStat(`Zum LV übernommen — neu: ${inserted}, aktualisiert: ${updated}.`);
  }

  async function saveSelectedToDatenbank() {
    if (!selectedRows.length) {
      alert("Bitte mindestens eine Position auswählen.");
      return;
    }

    await saveRowsToDatenbank(selectedRows);
    setStat(`${selectedRows.length} Position(en) in Kalkulationsdatenbank gespeichert.`);
  }

  const tokens = useMemo(() => {
    const t = norm(query).split(/[^a-z0-9.]+/g).filter(Boolean);
    return Array.from(new Set(t));
  }, [query]);

  const view = useMemo(() => {
    const matchRow = (row: CatalogPos) => {
      if (!tokens.length) return true;

      const hay = norm(
        `${row.posNr ?? ""} ${row.kurztext ?? ""} ${(row as any).langtext ?? ""}`
      );

      const check = (tok: string) => {
        if (!wholeWords) return hay.includes(tok);
        const re = new RegExp(`(^|\\W)${escapeRegex(tok)}(\\W|$)`, "i");
        return re.test(hay);
      };

      return allWords ? tokens.every(check) : tokens.some(check);
    };

    let rows = cat;

    if (gruppe !== "Alle") {
      rows = rows.filter((x) => ((normalizeRow(x) as any).gruppe || "") === gruppe);
    }

    rows = rows.filter(matchRow);

    if (viewMode !== "alle") {
      rows = rows.filter((row) => {
        const meta = rowMeta[getVisibleRowId(row)];
        const normalized = normalizeRow(row);

        if (viewMode === "epFehlt") {
          return numberSafe((normalized as any).ep) <= 0;
        }

        if (viewMode === "einheitFehlt") {
          return !String(normalizeUnit(normalized.einheit || "")).trim();
        }

        if (viewMode === "pruefen") {
          return meta?.status === "warning" || meta?.status === "duplicate";
        }

        if (viewMode === "fehler") return meta?.status === "error";
        if (viewMode === "doppelte") return !!meta?.isDuplicate;

        return true;
      });
    }

    return rows.slice(0, 700);
  }, [cat, gruppe, tokens, allWords, wholeWords, viewMode, rowMeta]);

  const counts = useMemo(() => {
    const result: Record<Gruppe, number> = {
      Alle: 0,
      Material: 0,
      Arbeiter: 0,
      Maschinen: 0
    };

    for (const rawRow of cat) {
      const row = normalizeRow(rawRow);

      result.Alle += 1;
      if ((row as any).gruppe === "Material") result.Material += 1;
      if ((row as any).gruppe === "Arbeiter") result.Arbeiter += 1;
      if ((row as any).gruppe === "Maschinen") result.Maschinen += 1;
    }

    return result;
  }, [cat]);

  const selectedRows = useMemo(
    () => view.filter((row) => selected[getVisibleRowId(row)]),
    [view, selected]
  );

  const selectedSum = useMemo(
    () => selectedRows.reduce((sum, row) => sum + numberSafe((row as any).ep), 0),
    [selectedRows]
  );

  const metaValues = useMemo(() => Object.values(rowMeta), [rowMeta]);

  const warningCount = metaValues.filter(
    (x) => x.status === "warning" || x.status === "duplicate"
  ).length;

  const errorCount = metaValues.filter((x) => x.status === "error").length;
  const duplicateCount = metaValues.filter((x) => x.isDuplicate).length;


  React.useEffect(() => {
    function handlePreiseCommand(event: Event) {
      const detail = (event as CustomEvent<{filter?: ViewMode;action?: string;}>).detail;
      if (!detail) return;

      const filter = String(detail.filter || "") as ViewMode;
      const action = String(detail.action || "");

      if (filter === "alle") setViewMode("alle");
      if (filter === "pruefen") setViewMode("pruefen");
      if (filter === "fehler") setViewMode("fehler");
      if (filter === "doppelte") setViewMode("doppelte");
      if (filter === "epFehlt") setViewMode("epFehlt");
      if (filter === "einheitFehlt") setViewMode("einheitFehlt");

      if (action === "loadCatalog") {
        void runBusy("Katalog wird geladen…", loadCatalog);
      }

      if (action === "loadFromLV") {
        void runBusy("LV wird geladen…", loadFromLV);
      }

      if (action === "loadFromKiOrManuell") {
        void runBusy("KI/Manuell wird geladen…", loadFromKiOrManuell);
      }

      if (action === "startPruefung") {
        void runBusy("Preisprüfung läuft…", startPruefung);
      }

      if (action === "selectDuplicates") {
        if (!pruefungDone) startPruefung();
        window.setTimeout(() => selectDuplicatesForDelete(), 80);
      }

      if (action === "autoCorrectSelected") {
        void runBusy("Auswahl wird korrigiert…", autoCorrectSelected);
      }

      if (action === "deleteSelected") {
        deleteSelectedRows();
      }

      if (action === "saveSelectedToDatenbank") {
        void runBusy("Auswahl wird gespeichert…", saveSelectedToDatenbank);
      }

      if (action === "writeSelectedToLV") {
        writeSelectedToLV();
      }

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }

    window.addEventListener("rlc:preise-command", handlePreiseCommand);

    return () => {
      window.removeEventListener("rlc:preise-command", handlePreiseCommand);
    };
  });

  return (
    <div className={rlcClass(null, page)}>
      {busy ?
      <div className={rlcClass(null, busyOverlay)}>
          <div className={rlcClass(null, busyBox)}>
            <div className={rlcClass(null, spinner)} />
            <div>
              <div className={rlcClass(null, busyTitle)}>Bitte warten</div>
              <div className={rlcClass(null, busySub)}>{busyText || "Vorgang läuft…"}</div>
            </div>
          </div>
        </div> :
      null}

      <section className={rlcClass("rlc-page-hero", heroCard)}>
        <div>
          <div className={rlcClass(null, eyebrow)}>RLC Kalkulationsdatenbank</div>
          <h1 className={rlcClass(null, title)}>Preise einfügen</h1>
          <p className={rlcClass(null, subtitle)}>
            Preispositionen importieren, bearbeiten, speichern, Doppelte bereinigen
            und direkt in die Kalkulationsdatenbank übernehmen.
          </p>
        </div>

        <div className={rlcClass(null, heroActions)}>
          <button className={rlcClass(null,
          btnSecondary)}
          disabled={busy}
          onClick={() => fileRef.current?.click()}>
            
            CSV / PDF importieren
          </button>

          <button className={rlcClass(null, btnSecondary)} disabled={busy} onClick={exportCSV}>
            CSV-Export
          </button>

          <button className={rlcClass(null,
          btnSecondary)}
          disabled={busy}
          onClick={() => runBusy("Katalog wird geladen…", loadCatalog)}>
            
            Katalog laden
          </button>

          <button className={rlcClass(null,
          btnSecondary)}
          disabled={busy}
          onClick={() => runBusy("LV wird geladen…", loadFromLV)}>
            
            Aus LV laden
          </button>

          <button className={rlcClass(null,
          btnSecondary)}
          disabled={busy}
          onClick={() => runBusy("KI/Manuell wird geladen…", loadFromKiOrManuell)}>
            
            Aus KI / Manuell laden
          </button>

          <button className={rlcClass(null,
          btnWarning)}
          disabled={busy || !cat.length}
          onClick={() => runBusy("Preisprüfung läuft…", startPruefung)}>
            
            Prüfung starten
          </button>

          <button className={rlcClass(null,
          btnWarning)}
          disabled={busy || !pruefungDone}
          onClick={selectDuplicatesForDelete}>
            
            Doppelte auswählen
          </button>

          <button className={rlcClass(null,
          btnDanger)}
          disabled={busy || !Object.values(selected).some(Boolean)}
          onClick={deleteSelectedRows}>
            
            Ausgewählte löschen
          </button>

          <button className={rlcClass(null,
          btnPrimary)}
          disabled={busy || !selectedRows.length}
          onClick={() => runBusy("Datenbank wird gespeichert…", saveSelectedToDatenbank)}>
            
            Auswahl in Datenbank speichern
          </button>

          <button className={rlcClass(null,
          btnPrimary)}
          disabled={busy || !selectedRows.length}
          onClick={writeSelectedToLV}>
            
            Auswahl ins LV
          </button>
        </div>

        <div className={rlcClass(null, heroMeta)}>
          Projekt: <b>{projectLabel(project)}</b>
          <span> · Quelle: </span>
          <b>
            {sourceMode === "catalog" ?
            "Katalog" :
            sourceMode === "lv" ?
            "LV" :
            sourceMode === "pdf" ?
            "PDF" :
            "KI / Manuell"}
          </b>
          <span> · Prüfung: </span>
          <b>{pruefungDone ? "durchgeführt" : "nicht gestartet"}</b>
          <span> · CompanyId: </span>
          <b>{companyId || "—"}</b>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.pdf"

          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            runBusy("Datei wird importiert…", () => importFile(file)).finally(() => {
              if (fileRef.current) fileRef.current.value = "";
            });
          }} className="rlc-migrated-pages-kalkulation-preise-tsx-920" />
        
      </section>

      <section className={rlcClass(null, grid4)}>
        <KpiCard
          label="Katalog"
          value={cat.length.toLocaleString("de-DE")}
          sub="geladene Positionen" />
        
        <KpiCard
          label="Ansicht"
          value={view.length.toLocaleString("de-DE")}
          sub={`Filter: ${viewMode}`} />
        
        <KpiCard
          label="Ausgewählt"
          value={selectedRows.length.toLocaleString("de-DE")}
          sub={money(selectedSum)} />
        
        <KpiCard
          label="Prüfung"
          value={
          pruefungDone ?
          `${errorCount} Fehler / ${warningCount} Prüfen` :
          "nicht gestartet"
          }
          sub={pruefungDone ? `${duplicateCount.toLocaleString("de-DE")} Doppelte` : "schneller Startmodus"} />
        
      </section>

      {editor ?
      <section className={rlcClass(null, editCard)}>
          <div className={rlcClass(null, sectionHead)}>
            <div>
              <h2 className={rlcClass(null, sectionTitle)}>Preisposition bearbeiten</h2>
              <div className={rlcClass(null, sectionText)}>
                Änderungen werden lokal und in der Kalkulationsdatenbank gespeichert.
              </div>
            </div>

            <div className={rlcClass(null, buttonRow)}>
              <button className={rlcClass(null,
            btnPrimary)}
            disabled={busy}
            onClick={() =>
            runBusy("Preisposition wird gespeichert…", saveEditedPosition)
            }>
              
                Speichern
              </button>

              <button className={rlcClass(null,
            btnSecondary)}
            disabled={busy}
            onClick={() => {
              if (editor && editorRowId) {
                const row = cat.find((x) => getVisibleRowId(x) === editorRowId);
                if (row) LV.upsert(catalogToLvPos(editorToCatalogRow(editor, row)));
                setStat("Preis ins LV geschrieben.");
              }
            }}>
              
                Ins LV schreiben
              </button>

              <button className={rlcClass(null,
            btnSecondary)}
            disabled={busy}
            onClick={() => {
              setEditor(null);
              setEditorRowId("");
            }}>
              
                Editor schließen
              </button>
            </div>
          </div>

          <div className={rlcClass(null, manualGrid)}>
            <Field label="PosNr / Ref">
              <input
              value={editor.posNr}
              onChange={(e) => setEditor({ ...editor, posNr: e.target.value })} className={rlcClass(null,
              input)} />
            
            </Field>

            <Field label="Kurztext">
              <input
              value={editor.kurztext}
              onChange={(e) =>
              setEditor({ ...editor, kurztext: e.target.value })
              } className={rlcClass(null,
              input)} />
            
            </Field>

            <Field label="Einheit">
              <input
              value={editor.einheit}
              onChange={(e) =>
              setEditor({ ...editor, einheit: e.target.value })
              } className={rlcClass(null,
              input)} />
            
            </Field>

            <Field label="EP netto">
              <input
              type="number"
              value={editor.ep}
              onChange={(e) => setEditor({ ...editor, ep: e.target.value })} className={rlcClass(null,
              inputStrong)} />
            
            </Field>

            <Field label="Gruppe">
              <select
              value={editor.gruppe}
              onChange={(e) =>
              setEditor({
                ...editor,
                gruppe: e.target.value as PriceGroup
              })
              } className={rlcClass(null,
              input)}>
              
                <option value="Material">Material</option>
                <option value="Arbeiter">Arbeiter</option>
                <option value="Maschinen">Maschinen</option>
              </select>
            </Field>
          </div>

          <div className="rlc-migrated-pages-kalkulation-preise-tsx-921">
            <Field label="Langtext / Beschreibung">
              <textarea
              value={editor.langtext}
              onChange={(e) =>
              setEditor({ ...editor, langtext: e.target.value })
              } className={rlcClass(null,
              { ...input, minHeight: 76 })} />
            
            </Field>
          </div>
        </section> :
      null}

      <section className={rlcClass(null, card)}>
        <div className={rlcClass(null, sectionHead)}>
          <div>
            <h2 className={rlcClass(null, sectionTitle)}>Neue Preisposition</h2>
            <div className={rlcClass(null, sectionText)}>
              Neue Position wird direkt lokal gespeichert und in die Datenbank übernommen.
            </div>
          </div>
        </div>

        <div className={rlcClass(null, manualGrid)}>
          <Field label="PosNr / Ref">
            <input
              value={manual.posNr}
              onChange={(e) => setManual({ ...manual, posNr: e.target.value })} className={rlcClass(null,
              input)}
              placeholder="z.B. MAT-001" />
            
          </Field>

          <Field label="Kurztext">
            <input
              value={manual.kurztext}
              onChange={(e) =>
              setManual({ ...manual, kurztext: e.target.value })
              } className={rlcClass(null,
              input)}
              placeholder="z.B. Facharbeiter / Bagger / Kies" />
            
          </Field>

          <Field label="Einheit">
            <input
              value={manual.einheit}
              onChange={(e) =>
              setManual({ ...manual, einheit: e.target.value })
              } className={rlcClass(null,
              input)}
              placeholder="m, m², m³, h, St" />
            
          </Field>

          <Field label="EP netto">
            <input
              type="number"
              value={manual.ep}
              onChange={(e) => setManual({ ...manual, ep: e.target.value })} className={rlcClass(null,
              input)} />
            
          </Field>

          <Field label="Gruppe">
            <select
              value={manual.gruppe}
              onChange={(e) =>
              setManual({
                ...manual,
                gruppe: e.target.value as PriceGroup
              })
              } className={rlcClass(null,
              input)}>
              
              <option value="Material">Material</option>
              <option value="Arbeiter">Arbeiter</option>
              <option value="Maschinen">Maschinen</option>
            </select>
          </Field>
        </div>

        <div className="rlc-migrated-pages-kalkulation-preise-tsx-922">
          <Field label="Langtext / Beschreibung">
            <textarea
              value={manual.langtext}
              onChange={(e) =>
              setManual({ ...manual, langtext: e.target.value })
              } className={rlcClass(null,
              { ...input, minHeight: 70 })} />
            
          </Field>
        </div>

        <div className={rlcClass(null, buttonRow)}>
          <button className={rlcClass(null,
          btnPrimary)}
          disabled={busy}
          onClick={() => runBusy("Preisposition wird gespeichert…", addManualPosition)}>
            
            Preisposition speichern
          </button>
        </div>
      </section>

      <section className={rlcClass(null, card)}>
        <div className={rlcClass(null, sectionHead)}>
          <div>
            <h2 className={rlcClass(null, sectionTitle)}>Suche & Filter</h2>
            <div className={rlcClass(null, sectionText)}>
              Prüfung und Doppelerkennung laufen nur nach Klick auf „Prüfung starten“.
            </div>
          </div>

          <div className={rlcClass(null, buttonRow)}>
            <button className={rlcClass(null,
            viewMode === "alle" ? btnPrimary : btnSecondary)}
            disabled={busy}
            onClick={() => setViewMode("alle")}>
              
              Alle
            </button>

            <button className={rlcClass(null,
            viewMode === "pruefen" ? btnWarning : btnSecondary)}
            disabled={busy || !pruefungDone}
            onClick={() => setViewMode("pruefen")}>
              
              Prüfen
            </button>

            <button className={rlcClass(null,
            viewMode === "fehler" ? btnDanger : btnSecondary)}
            disabled={busy || !pruefungDone}
            onClick={() => setViewMode("fehler")}>
              
              Fehler
            </button>

            <button className={rlcClass(null,
            viewMode === "doppelte" ? btnWarning : btnSecondary)}
            disabled={busy || !pruefungDone}
            onClick={() => setViewMode("doppelte")}>
              
              Doppelte
            </button>
          </div>
        </div>

        <div className={rlcClass(null, toolbarGrid)}>
          <input
            placeholder="Suche… PosNr, Kurztext, Langtext"
            value={query}
            onChange={(e) => setQuery(e.target.value)} className={rlcClass(null,
            input)} />
          

          <label className={rlcClass(null, checkLabel)}>
            <input
              type="checkbox"
              checked={allWords}
              onChange={(e) => setAllWords(e.target.checked)} />
            
            Alle Wörter
          </label>

          <label className={rlcClass(null, checkLabel)}>
            <input
              type="checkbox"
              checked={wholeWords}
              onChange={(e) => setWholeWords(e.target.checked)} />
            
            Ganze Wörter
          </label>
        </div>

        <div className={rlcClass(null, chipRow)}>
          {gruppen.map((g) =>
          <button
            key={g}
            type="button"
            disabled={busy}
            onClick={() => setGruppe(g)} className={rlcClass(null,
            gruppe === g ? chipActive : chip)}>
            
              {g}
              <span className="rlc-migrated-pages-kalkulation-preise-tsx-923">
                {counts[g].toLocaleString("de-DE")}
              </span>
            </button>
          )}
        </div>

        <div className={rlcClass(null, actionBox)}>
          <div className="rlc-migrated-pages-kalkulation-preise-tsx-924">
            <div>
              <h2 className={rlcClass(null, sectionTitle)}>KI-Learning / Quality Gate</h2>
              <div className={rlcClass(null, sectionText)}>
                KI-Vorschläge prüfen, freigeben, sperren oder in die Preisliste laden.
              </div>
            </div>

            <div className={rlcClass(null, buttonRow)}>
              <button className={rlcClass(null,
              btnPrimary)}
              disabled={busy}
              onClick={() => runBusy("KI-Learning wird geladen…", loadKiLearningRows)}>
                
                KI-Vorschläge laden
              </button>

              <button className={rlcClass(null,
              btnSecondary)}
              disabled={busy || !kiLearningRows.length}
              onClick={loadKiLearningIntoCatalog}>
                
                In Preisliste anzeigen
              </button>
            </div>

            {kiLearningRows.length ?
            <div className="rlc-migrated-pages-kalkulation-preise-tsx-925">
                {kiLearningRows.slice(0, 20).map((entry) => {
                const status =
                entry.parameter?.qualityGateStatus || "KI-Vorschlag";
                const ep = numberSafe(entry.kosten?.epNetto);

                return (
                  <div
                    key={entry.id} className="rlc-migrated-pages-kalkulation-preise-tsx-926">








                    
                      <div className="rlc-migrated-pages-kalkulation-preise-tsx-927">
                        {entry.posNr || "ohne Pos."} · {entry.kurztext || "Ohne Kurztext"}
                      </div>

                      <div className="rlc-migrated-pages-kalkulation-preise-tsx-928">
                        EP: <b>{money(ep)}</b> · ME: <b>{entry.einheit || "-"}</b> · Vertrauen:{" "}
                        <b>{Math.round(numberSafe(entry.confidence) * 100)}%</b> · Status:{" "}
                        <b>{status}</b>
                      </div>

                      {entry.parameter?.warning ?
                    <div className="rlc-migrated-pages-kalkulation-preise-tsx-929">
                          ⚠ {entry.parameter.warning}
                        </div> :
                    null}

                      <div className="rlc-migrated-pages-kalkulation-preise-tsx-930">
                        {QUALITY_GATE_STATUSES.map((s) =>
                      <button
                        key={s}
                        type="button" className={rlcClass(null,
                        s === status ? btnPrimary : btnSecondary)}
                        disabled={qualityBusyId === entry.id}
                        onClick={() => setQualityGateStatus(entry, s)}>
                        
                            {s}
                          </button>
                      )}
                      </div>
                    </div>);

              })}
              </div> :
            null}
          </div>
        </div>
        <div className={rlcClass(null, actionBox)}>
          <button className={rlcClass(null,
          btnWarning)}
          disabled={busy || !selectedRows.length}
          onClick={() => runBusy("Auswahl wird korrigiert…", autoCorrectSelected)}>
            
            Auswahl automatisch korrigieren
          </button>

          <button className={rlcClass(null,
          btnWarning)}
          disabled={busy || !pruefungDone}
          onClick={selectDuplicatesForDelete}>
            
            Doppelte auswählen
          </button>

          <button className={rlcClass(null,
          btnDanger)}
          disabled={busy || !Object.values(selected).some(Boolean)}
          onClick={deleteSelectedRows}>
            
            Ausgewählte löschen
          </button>

          <button className={rlcClass(null,
          btnPrimary)}
          disabled={busy || !selectedRows.length}
          onClick={() => runBusy("Auswahl wird gespeichert…", saveSelectedToDatenbank)}>
            
            Auswahl in Datenbank speichern
          </button>
        </div>

        {err ? <div className={rlcClass(null, alertError)}>{err}</div> : null}
        {stat ? <div className={rlcClass(null, alertSuccess)}>{stat}</div> : null}
      </section>

      <section className={rlcClass(null, card)}>
        <div className={rlcClass(null, sectionHead)}>
          <div>
            <h2 className={rlcClass(null, sectionTitle)}>Preispositionen</h2>
            <div className={rlcClass(null, sectionText)}>
              Maximal 700 Zeilen sichtbar. Für große Preislisten Suche/Filter verwenden.
            </div>
          </div>

          <label className={rlcClass(null, selectAllBox)}>
            <input
              type="checkbox"
              disabled={busy}
              onChange={(e) => toggleAll(e.target.checked)} />
            
            Sichtbare auswählen
          </label>
        </div>

        <div className={rlcClass(null, tableWrap)}>
          <table className={rlcClass(null, table)}>
            <thead>
              <tr>
                <th className={rlcClass(null, thSmall)}></th>
                <th className={rlcClass(null, th)}>Prüfung</th>
                <th className={rlcClass(null, th)}>PosNr</th>
                <th className={rlcClass(null, th)}>Kurztext</th>
                <th className={rlcClass(null, th)}>Langtext</th>
                <th className={rlcClass(null, th)}>ME</th>
                <th className={rlcClass(null, thRight)}>EP netto</th>
                <th className={rlcClass(null, th)}>Gruppe</th>
                <th className={rlcClass(null, th)}>Score</th>
                <th className={rlcClass(null, th)}>refKey</th>
                <th className={rlcClass(null, th)}>Aktion</th>
              </tr>
            </thead>

            <tbody>
              {view.map((row, i) => {
                const normalized = normalizeRow(row);
                const rowId = getVisibleRowId(row);
                const meta = rowMeta[rowId];
                const isSelected = !!selected[rowId];

                return (
                  <tr
                    key={rowId} className={rlcClass(null,
                    {
                      background: isSelected ?
                      "#EAF2FF" :
                      i % 2 ?
                      "#FCFCFC" :
                      "#FFFFFF"
                    })}
                    onDoubleClick={() => !busy && startEdit(row)}>
                    
                    <td className={rlcClass(null, tdCenter)}>
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={isSelected}
                        onChange={(e) => toggleRow(row, e.target.checked)} />
                      
                    </td>

                    <td className={rlcClass(null, td)}>
                      {!pruefungDone ?
                      <span className={rlcClass(null, pillNeutral)}>—</span> :
                      meta?.status === "error" ?
                      <span className={rlcClass(null, pillError)}>Fehler</span> :
                      meta?.status === "warning" ?
                      <span className={rlcClass(null, pillWarning)}>Prüfen</span> :
                      meta?.status === "duplicate" ?
                      <span className={rlcClass(null, pillWarning)}>
                          {meta.keepBestDuplicate ? "Duplikat behalten" : "Duplikat"}
                        </span> :

                      <span className={rlcClass(null, pillOk)}>OK</span>
                      }
                    </td>

                    <td className={rlcClass(null, tdMono)}>{normalized.posNr}</td>
                    <td className={rlcClass(null, td)}>{normalized.kurztext}</td>
                    <td className={rlcClass(null, tdMuted)}>
                      {String((normalized as any).langtext || "").trim() || "—"}
                    </td>
                    <td className={rlcClass(null, td)}>{normalizeUnit(normalized.einheit)}</td>
                    <td className={rlcClass(null, tdRight)}>{money((normalized as any).ep)}</td>
                    <td className={rlcClass(null, td)}>
                      <span className={rlcClass(null, groupBadge((normalized as any).gruppe))}>
                        {(normalized as any).gruppe || "—"}
                      </span>
                    </td>
                    <td className={rlcClass(null, tdMono)}>{pruefungDone ? meta?.score ?? "—" : "—"}</td>
                    <td className={rlcClass(null, tdMono)}>{toRefKey(normalized)}</td>
                    <td className={rlcClass(null, td)}>
                      <div className={rlcClass(null, rowActions)}>
                        <button className={rlcClass(null,
                        btnMini)}
                        disabled={busy}
                        onClick={() => startEdit(row)}>
                          
                          Bearbeiten
                        </button>

                        <button className={rlcClass(null,
                        btnMiniPrimary)}
                        disabled={busy}
                        onClick={() =>
                        runBusy("Preis wird gespeichert…", () => saveSingleRow(row))
                        }>
                          
                          Speichern
                        </button>

                        <button className={rlcClass(null,
                        btnMiniDanger)}
                        disabled={busy}
                        onClick={() => deleteSingleRow(row)}>
                          
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>);

              })}

              {!view.length ?
              <tr>
                  <td colSpan={11} className={rlcClass(null, emptyCell)}>
                    Kein Ergebnis. Bitte CSV/PDF importieren, Preisposition erfassen
                    oder Daten aus LV / KI / Manuell laden.
                  </td>
                </tr> :
              null}
            </tbody>
          </table>
        </div>
      </section>
    </div>);

}

function KpiCard({
  label,
  value,
  sub




}: {label: string;value: string;sub?: string;}) {
  return (
    <div className={rlcClass(null, kpiCard)}>
      <div className={rlcClass(null, kpiLabel)}>{label}</div>
      <div className={rlcClass(null, kpiValue)}>{value}</div>
      {sub ? <div className={rlcClass(null, kpiSub)}>{sub}</div> : null}
    </div>);

}

function Field({
  label,
  children



}: {label: string;children: React.ReactNode;}) {
  return (
    <label className="rlc-migrated-pages-kalkulation-preise-tsx-931">
      <span className={rlcClass(null, labelStyle)}>{label}</span>
      {children}
    </label>);

}

function groupBadge(gruppe?: string): React.CSSProperties {
  if (gruppe === "Material") return badgeGreen;
  if (gruppe === "Arbeiter") return badgeBlue;
  if (gruppe === "Maschinen") return badgeOrange;
  return badgeNeutral;
}

/* ================= STYLES ================= */

const page: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 16
};

const busyOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "rgba(15,23,42,0.28)",
  display: "grid",
  placeItems: "center",
  backdropFilter: "blur(2px)"
};

const busyBox: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: "18px 22px",
  boxShadow: "0 20px 60px rgba(15,23,42,0.25)",
  minWidth: 340
};

const busyTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "#0F172A"
};

const busySub: React.CSSProperties = {
  marginTop: 3,
  fontSize: 13,
  color: "#64748B",
  fontWeight: 600
};

const spinner: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "4px solid #DBEAFE",
  borderTopColor: "#146EF5",
  animation: "rlcSpin 0.8s linear infinite"
};

const heroCard: React.CSSProperties = {
  background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
  color: "#FFFFFF",
  borderRadius: 18,
  padding: 22,
  display: "grid",
  gap: 14,
  boxShadow: "0 16px 40px rgba(15,23,42,0.18)"
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.8,
  fontWeight: 700
};

const title: React.CSSProperties = {
  margin: "4px 0",
  fontSize: 30,
  fontWeight: 700
};

const subtitle: React.CSSProperties = {
  margin: 0,
  maxWidth: 1120,
  opacity: 0.88,
  lineHeight: 1.55
};

const heroActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap"
};

const heroMeta: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.9
};

const grid4: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
  gap: 12
};

const kpiCard: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
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
  fontWeight: 700
};

const kpiSub: React.CSSProperties = {
  marginTop: 3,
  fontSize: 12,
  color: "#64748B"
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};

const editCard: React.CSSProperties = {
  ...card,
  border: "1px solid #BED6FF",
  background: "#F8FBFF"
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
  lineHeight: 1.45
};

const manualGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1.7fr 110px 120px 150px",
  gap: 10,
  alignItems: "end"
};

const toolbarGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(260px,1fr) auto auto",
  gap: 10,
  alignItems: "center"
};

const input: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 11px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box"
};

const inputStrong: React.CSSProperties = {
  ...input,
  border: "1px solid #146EF5",
  background: "#EAF2FF",
  fontWeight: 700
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 700
};

const checkLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  color: "#334155",
  fontWeight: 600,
  whiteSpace: "nowrap"
};

const chipRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 12
};

const chip: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  background: "#FFFFFF",
  borderRadius: 999,
  padding: "7px 12px",
  cursor: "pointer",
  fontWeight: 700,
  color: "#334155"
};

const chipActive: React.CSSProperties = {
  ...chip,
  border: "1px solid #146EF5",
  background: "#EAF2FF",
  color: "#0B5BD3"
};

const actionBox: React.CSSProperties = {
  marginTop: 14,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  paddingTop: 14,
  borderTop: "1px solid #E5E7EB"
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center"
};

const selectAllBox: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 13,
  fontWeight: 700,
  color: "#334155",
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#FFFFFF"
};

const alertError: React.CSSProperties = {
  marginTop: 12,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 600
};

const alertSuccess: React.CSSProperties = {
  marginTop: 12,
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#15803D",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 600
};

const tableWrap: React.CSSProperties = {
  overflow: "auto",
  border: "1px solid #E5E7EB",
  borderRadius: 12
};

const table: React.CSSProperties = {
  width: "100%",
  minWidth: 1380,
  borderCollapse: "collapse"
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 9px",
  fontSize: 12,
  color: "#475569",
  background: "#F8FAFC",
  borderBottom: "1px solid #E5E7EB",
  whiteSpace: "nowrap",
  fontWeight: 700
};

const thRight: React.CSSProperties = {
  ...th,
  textAlign: "right"
};

const thSmall: React.CSSProperties = {
  ...th,
  width: 42,
  textAlign: "center"
};

const td: React.CSSProperties = {
  padding: "9px",
  fontSize: 13,
  borderBottom: "1px solid #F1F5F9",
  color: "#0F172A",
  verticalAlign: "middle"
};

const tdMuted: React.CSSProperties = {
  ...td,
  color: "#64748B",
  maxWidth: 320,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis"
};

const tdRight: React.CSSProperties = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
  fontWeight: 700
};

const tdCenter: React.CSSProperties = {
  ...td,
  textAlign: "center"
};

const tdMono: React.CSSProperties = {
  ...td,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12
};

const emptyCell: React.CSSProperties = {
  padding: 16,
  color: "#64748B",
  fontSize: 13
};

const rowActions: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap"
};

const btnBase: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 13px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap"
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #146EF5",
  background: "#146EF5",
  color: "#FFFFFF"
};

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: "#FFFFFF",
  color: "#0F172A"
};

const btnWarning: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #F59E0B",
  background: "#FFFBEB",
  color: "#92400E"
};

const btnDanger: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #EF4444",
  background: "#FEF2F2",
  color: "#B91C1C"
};

const btnMini: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: "6px 9px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  background: "#FFFFFF",
  color: "#0F172A"
};

const btnMiniPrimary: React.CSSProperties = {
  ...btnMini,
  border: "1px solid #146EF5",
  background: "#EAF2FF",
  color: "#0B5BD3"
};

const btnMiniDanger: React.CSSProperties = {
  ...btnMini,
  border: "1px solid #EF4444",
  background: "#FEF2F2",
  color: "#B91C1C"
};

const badgeNeutral: React.CSSProperties = {
  display: "inline-flex",
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  color: "#475569",
  borderRadius: 999,
  padding: "4px 9px",
  fontSize: 11,
  fontWeight: 700
};

const badgeGreen: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#15803D"
};

const badgeBlue: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #BED6FF",
  background: "#EAF2FF",
  color: "#0B5BD3"
};

const badgeOrange: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #FED7AA",
  background: "#FFF7ED",
  color: "#C2410C"
};

const pillOk: React.CSSProperties = {
  display: "inline-flex",
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#15803D",
  borderRadius: 999,
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 700
};

const pillNeutral: React.CSSProperties = {
  ...pillOk,
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  color: "#64748B"
};

const pillWarning: React.CSSProperties = {
  ...pillOk,
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
  color: "#92400E"
};

const pillError: React.CSSProperties = {
  ...pillOk,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C"
};
