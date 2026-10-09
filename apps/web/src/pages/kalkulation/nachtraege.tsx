import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/kalkulation/nachtraege.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

import { runRlcAction } from "../../lib/rlcProgress";
import { useLocation, useNavigate } from "react-router-dom";
import { Changes, type ChangeRow, type ChangeStatus } from "./changeStore";
import { useProject } from "../../store/useProject";
import {
  openPdfBlobPreview,
  reservePdfPreview,
  type PdfPreviewWindow } from
"../../lib/pdf/companyPdfHeader";

const API =
(import.meta as any)?.env?.VITE_API_URL ||
(import.meta as any)?.env?.VITE_BACKEND_URL ||
"";

const MWST_KEY = "rlc_changes_mwst_v1";
const NACHTRAG_BUFFER_KEY = "rlc:nachtrag-buffer";
const ANGEBOT_NACHTRAG_ONLY_KEY = "rlc_angebot_nachtrag_only_v1";
const COMPANY_RECIPE_KEY = "rlc_company_resource_recipes_v1";
const KI_HANDOFF_KEY = "rlc_kalkulation_ki_handoff_v1";
const MANUELL_HANDOFF_KEY = "rlc_kalkulation_manuell_handoff_v1";
const RECIPE_CONTEXT_KEY = "rlc_recipes_new_position_context_v1";
const EXT_STORE_KEY = "rlc_changes_ext_v2";

const STATI: ChangeStatus[] = [
"Entwurf",
"Abgegeben",
"Beauftragt",
"Abgelehnt"];


type NachtragRow = ChangeRow & {
  langtext?: string;

  materialCost?: number;
  laborCost?: number;
  machineCost?: number;
  subcontractorCost?: number;
  disposalCost?: number;
  transportCost?: number;
  overheadCost?: number;
  riskCost?: number;
  profitCost?: number;

  baseUnitPrice?: number;
  suggestedUnitPrice?: number;
  finalUnitPrice?: number;

  riskLevel?: "low" | "medium" | "high";
  calculationStatus?: "ok" | "warning" | "critical" | "manual";

  gewerk?: string;
  leistungsart?: string;
  bauverfahren?: string;

  warning?: string;
  aiReason?: string;
  priceBreakdown?: any[];

  contractBasis?: "BGB" | "VOBB" | "OTHER";
  changeRequestDate?: string;
  changeRequestReceivedAt?: string;
  bgbAgreementDeadline?: string;
  agreementStatus?: "PENDING" | "AGREED" | "ORDERED" | "DISPUTED";
  orderDate?: string;
  orderTextFormConfirmed?: boolean;
  orderReference?: string;
  priceBasis?: "ACTUAL_COSTS_650C" | "URKALKULATION" | "VOBB" | "OTHER";
  planningProvided?: boolean;
  legalNote?: string;
};

type ProjectLike = {
  id?: string;
  code?: string;
  number?: string;
  projektnummer?: string;
  name?: string;
  projectName?: string;
  place?: string;
  ort?: string;
  location?: string;
};

type NachtragQualityFilter =
"alle" |
"Entwurf" |
"Abgegeben" |
"Beauftragt" |
"Abgelehnt" |
"begruendungFehlt" |
"epFehlt" |
"mengeFehlt" |
"einheitFehlt" |
"doppelte";

type NachtragDraftRow = {
  pos?: string;
  posNr?: string;
  kurztext?: string;
  title?: string;
  langtext?: string;
  einheit?: string;
  unit?: string;
  qty?: number;
  mengeDelta?: number;
  preis?: number;
  begruendung?: string;
  note?: string;
  hint?: string;
  regieRowId?: string;
  date?: string;
};

type NachtragDraft = {
  projectId?: string;
  projectKey?: string;
  createdAt?: number;
  source?: "REGIE" | string;
  rows?: NachtragDraftRow[];
};

type KalkulationHandoffRow = {
  id?: string;
  auftragId?: string;
  auftragName?: string;
  auftragType?: "haupt" | "unter" | string;

  posNr?: string;
  pos?: string;
  kurztext?: string;
  title?: string;
  langtext?: string;
  einheit?: string;
  unit?: string;

  menge?: number;
  qty?: number;
  mengeDelta?: number;

  preis?: number;
  ep?: number;
  finalUnitPrice?: number;
  suggestedUnitPrice?: number;
  baseUnitPrice?: number;

  gesamt?: number;
  aiReason?: string;
  warning?: string;
  source?: string;
  meta?: any;
};

type KalkulationHandoff = {
  ts?: number;
  source?: string;
  projectKey?: string;
  projectTitle?: string;
  auftragId?: string;
  auftragName?: string;
  auftragType?: "haupt" | "unter" | string;
  rows?: KalkulationHandoffRow[];
};

type ServerNachtragStatus =
"offen" |
"inBearbeitung" |
"freigegeben" |
"abgelehnt";

type ServerNachtrag = {
  id: string;
  projectKey: string;
  lvPos: string;
  number: string;
  title: string;
  langtext?: string;
  qty: number;
  unit: string;
  ep: number;
  total: number;
  status: ServerNachtragStatus;
  note?: string;
  contractBasis?: "BGB" | "VOBB" | "OTHER";
  changeRequestDate?: string;
  changeRequestReceivedAt?: string;
  bgbAgreementDeadline?: string;
  agreementStatus?: "PENDING" | "AGREED" | "ORDERED" | "DISPUTED";
  orderDate?: string;
  orderTextFormConfirmed?: boolean;
  orderReference?: string;
  priceBasis?: "ACTUAL_COSTS_650C" | "URKALKULATION" | "VOBB" | "OTHER";
  planningProvided?: boolean;
  legalNote?: string;
  createdAt: string;
  updatedAt: string;
};

type AngebotNachtragOnlyBuffer = {
  version: "nachtrag-only-v1";
  ts: number;
  source: "nachtraege";
  projectKey: string;
  projectTitle: string;
  mwst: number;
  rows: NachtragRow[];
};

type ExtDB = Record<string, NachtragRow[]>;

/* ================= API / STORAGE HELPERS ================= */

function apiUrl(path: string): string {
  const cleanApi = String(API || "").replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return cleanApi ? `${cleanApi}${cleanPath}` : cleanPath;
}

function getAuthToken(): string {
  try {
    const directKeys = [
    "token",
    "authToken",
    "accessToken",
    "rlc_token",
    "rlc_auth_token",
    "rlc_access_token",
    "rlc.auth.token"];


    for (const key of directKeys) {
      const value = localStorage.getItem(key);
      if (value && value.trim()) return value.trim();
    }

    const jsonKeys = [
    "auth",
    "user",
    "session",
    "rlc_auth",
    "rlc_session",
    "rlc.auth",
    "rlc.session"];


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
        parsed?.data?.accessToken ??
        parsed?.user?.token ??
        parsed?.user?.accessToken;

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

async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);

  try {
    const hasBody = typeof init.body !== "undefined";

    const res = await fetch(apiUrl(path), {
      ...init,
      credentials: "include",
      signal: controller.signal,
      headers: withAuthHeaders({
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(init.headers as Record<string, string> || {})
      })
    });

    const text = await res.text().catch(() => "");
    let data: any = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      const msg =
      data?.error ||
      data?.message ||
      text ||
      `Server-Fehler (${res.status})`;

      throw new Error(msg);
    }

    return data as T;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error(
        "Gateway Timeout. Der Server hat nicht rechtzeitig geantwortet."
      );
    }

    throw e;
  } finally {
    window.clearTimeout(timeout);
  }
}

type KalkulationBasisRow = {
  id?: string;
  posNr?: string;
  pos?: string;
  kurztext?: string;
  title?: string;
  langtext?: string;
  einheit?: string;
  unit?: string;
  menge?: number;
  quantity?: number;
  preis?: number;
  finalUnitPrice?: number;
  rlcKiUnitPrice?: number;
  rlcKiTotal?: number;
  totalNet?: number;
  gesamt?: number;
  calculationStatus?: string;
  riskLevel?: string;
  confidence?: number;
};

function loadKalkulationBasis(projectKey: string): KalkulationBasisRow[] {
  if (!projectKey || typeof localStorage === "undefined") return [];

  const keys = [
  `rlc_kalkulation_mit_ki_elite_v1:${projectKey}`,
  `rlc_lv_data_v1:${projectKey}`,
  `rlc_gaeb_import_v1:${projectKey}`];


  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      const rawRows = Array.isArray(parsed) ?
      parsed :
      Array.isArray(parsed?.rows) ?
      parsed.rows :
      Array.isArray(parsed?.items) ?
      parsed.items :
      [];

      const rows = rawRows.
      map((r: any) => ({
        ...r,
        posNr: String(r?.posNr || r?.pos || r?.positionNumber || "").trim(),
        kurztext: String(r?.kurztext || r?.shortText || r?.title || "").trim(),
        langtext: String(r?.langtext || r?.longText || "").trim(),
        einheit: String(r?.einheit || r?.unit || "").trim(),
        menge: n(r?.menge ?? r?.quantity),
        preis: n(r?.rlcKiUnitPrice ?? r?.finalUnitPrice ?? r?.preis ?? r?.unitPrice),
        rlcKiTotal: n(r?.rlcKiTotal ?? r?.totalNet ?? r?.gesamt),
        calculationStatus: String(r?.calculationStatus || ""),
        riskLevel: String(r?.riskLevel || ""),
        confidence: n(r?.confidence)
      })).
      filter((r: any) => r.posNr || r.kurztext);

      if (rows.length) return rows;
    } catch {


      //
    }}
  return [];
}

function normalizePosText(value: unknown): string {
  return String(value ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function posLeafDigits(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw || /[A-Za-z]/.test(raw)) return "";
  const parts = raw.split(/[.\-_/]/).filter(Boolean);
  const leaf = String(parts[parts.length - 1] || raw).replace(/\D/g, "");
  if (!leaf) return "";
  return String(Number(leaf));
}

function canonicalNachtragPosNr(row: NachtragRow, basis: KalkulationBasisRow[]): string {
  const current = String(row.posNr || "").trim();
  if (!current || !basis.length) return current;

  const exact = basis.find((b) => String(b.posNr || "").trim() === current);
  if (exact?.posNr) return String(exact.posNr).trim();

  // Alphanumerische neue Nachtragspositionen dürfen nicht auf eine LV-Position umgebogen werden.
  if (/[A-Za-z]/.test(current)) return current;

  const leaf = posLeafDigits(current);
  if (!leaf) return current;

  const textKey = normalizePosText(row.kurztext || row.langtext);
  const unitKey = String(row.einheit || "").trim().toLowerCase().replace(/\s+/g, "");
  const leafCandidates = basis.filter((b) => posLeafDigits(b.posNr) === leaf);
  if (!leafCandidates.length) return current;

  const strong = leafCandidates.filter((b) => {
    const bText = normalizePosText(b.kurztext || b.langtext);
    const bUnit = String(b.einheit || "").trim().toLowerCase().replace(/\s+/g, "");
    return Boolean(textKey && bText && textKey === bText && (!unitKey || !bUnit || unitKey === bUnit));
  });
  if (strong.length === 1) return String(strong[0].posNr || current).trim();

  const textOnly = leafCandidates.filter((b) => normalizePosText(b.kurztext || b.langtext) === textKey && Boolean(textKey));
  if (textOnly.length === 1) return String(textOnly[0].posNr || current).trim();

  if (leafCandidates.length === 1) return String(leafCandidates[0].posNr || current).trim();
  return current;
}

function kalkulationBasisNet(rows: KalkulationBasisRow[]): number {
  return round2(
    rows.reduce((sum, r: any) => {
      const total = n(r.rlcKiTotal ?? r.totalNet ?? r.gesamt);
      if (total > 0) return sum + total;
      return sum + n(r.menge ?? r.quantity) * n(r.preis ?? r.finalUnitPrice);
    }, 0)
  );
}
function loadExtDb(): ExtDB {
  try {
    return JSON.parse(localStorage.getItem(EXT_STORE_KEY) || "{}") as ExtDB;
  } catch {
    return {};
  }
}

function saveExtDb(db: ExtDB) {
  localStorage.setItem(EXT_STORE_KEY, JSON.stringify(db));
}

function loadExtRows(pid: string): NachtragRow[] {
  const db = loadExtDb();
  const extRows = Array.isArray(db[pid]) ? db[pid] : [];

  if (extRows.length) return extRows.map(normalizeRow);

  return Changes.list(pid).map((row) =>
  normalizeRow({
    ...row,
    langtext: ""
  })
  );
}

function saveExtRows(pid: string, rows: NachtragRow[]) {
  const clean = rows.map(normalizeRow);
  const db = loadExtDb();

  db[pid] = clean;
  saveExtDb(db);

  Changes.clear(pid);

  clean.forEach((row) => {
    Changes.upsert(pid, {
      id: row.id,
      posNr: row.posNr,
      kurztext: row.kurztext,
      einheit: row.einheit,
      mengeDelta: row.mengeDelta,
      preis: row.preis,
      status: row.status,
      begruendung: row.begruendung
    });
  });
}

function clearExtRows(pid: string) {
  const db = loadExtDb();
  db[pid] = [];
  saveExtDb(db);
  Changes.clear(pid);
}

/* ================= VALUE HELPERS ================= */

function safeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function n(value: unknown, fallback = 0): number {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;

  const normalized = raw.includes(",") ?
  raw.replace(/\./g, "").replace(",", ".") :
  raw;

  const x = typeof value === "number" ? value : Number(normalized);
  return Number.isFinite(x) ? x : fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function money(value: unknown): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(n(value));
}

function fmtNum(value: unknown, digits = 2): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(n(value));
}

function getCurrentProject(projectCtx: any): ProjectLike | null {
  const candidate =
  projectCtx?.currentProject ??
  projectCtx?.project ??
  projectCtx?.selectedProject ??
  projectCtx?.current ?? (
  typeof projectCtx?.getCurrentProject === "function" ?
  projectCtx.getCurrentProject() :
  null);

  if (candidate && typeof candidate === "object") {
    return candidate as ProjectLike;
  }

  try {
    const g = globalThis as any;
    return (g.__RLC_CURRENT_PROJECT ?? null) as ProjectLike | null;
  } catch {
    return null;
  }
}

function buildKeys(currentProject: ProjectLike | null) {
  const projectIdUuid = String(currentProject?.id || "").trim();

  const projectCodeFs = String(
    currentProject?.code ||
    currentProject?.number ||
    currentProject?.projektnummer ||
    ""
  ).
  trim().
  toUpperCase();

  const apiKey = projectCodeFs || projectIdUuid || "";
  const serverProjectKey = projectCodeFs || apiKey || "";
  const pid = projectIdUuid || projectCodeFs || "_none_";

  return { projectIdUuid, projectCodeFs, apiKey, serverProjectKey, pid };
}

function projectTitle(project: ProjectLike | null): string {
  if (!project) return "Kein Projekt gewählt";

  const code =
  project.code ||
  project.number ||
  project.projektnummer ||
  project.id ||
  "Projekt";

  const name = project.name || project.projectName || "Projekt";

  return `${code} — ${name}`;
}

function toUiStatus(status: ServerNachtragStatus): ChangeStatus {
  if (status === "freigegeben") return "Beauftragt";
  if (status === "abgelehnt") return "Abgelehnt";
  if (status === "inBearbeitung") return "Abgegeben";
  return "Entwurf";
}

function toServerStatus(status: ChangeStatus): ServerNachtragStatus {
  if (status === "Beauftragt") return "freigegeben";
  if (status === "Abgelehnt") return "abgelehnt";
  if (status === "Abgegeben") return "inBearbeitung";
  return "offen";
}

function normalizeRow(row: Partial<NachtragRow>): NachtragRow {
  return {
    id: String(row.id || safeId()),
    posNr: String(row.posNr || ""),
    kurztext: String(row.kurztext || ""),
    langtext: String(row.langtext || ""),
    einheit: String(row.einheit || "m"),
    mengeDelta: n(row.mengeDelta),
    preis: n(row.preis),
    status: (row.status || "Entwurf") as ChangeStatus,
    begruendung: String(row.begruendung || ""),

    materialCost: n(row.materialCost),
    laborCost: n(row.laborCost),
    machineCost: n(row.machineCost),
    subcontractorCost: n(row.subcontractorCost),
    disposalCost: n(row.disposalCost),
    transportCost: n(row.transportCost),
    overheadCost: n(row.overheadCost),
    riskCost: n(row.riskCost),
    profitCost: n(row.profitCost),

    baseUnitPrice: n(row.baseUnitPrice),
    suggestedUnitPrice: n(row.suggestedUnitPrice),
    finalUnitPrice: n(row.finalUnitPrice),

    riskLevel: row.riskLevel,
    calculationStatus: row.calculationStatus,

    gewerk: String(row.gewerk || ""),
    leistungsart: String(row.leistungsart || ""),
    bauverfahren: String(row.bauverfahren || ""),

    warning: String(row.warning || ""),
    aiReason: String(row.aiReason || ""),
    priceBreakdown: Array.isArray(row.priceBreakdown) ? row.priceBreakdown : [],

    contractBasis: row.contractBasis,
    changeRequestDate: String(row.changeRequestDate || ""),
    changeRequestReceivedAt: String(row.changeRequestReceivedAt || ""),
    bgbAgreementDeadline: String(row.bgbAgreementDeadline || ""),
    agreementStatus: row.agreementStatus || "PENDING",
    orderDate: String(row.orderDate || ""),
    orderTextFormConfirmed: Boolean(row.orderTextFormConfirmed),
    orderReference: String(row.orderReference || ""),
    priceBasis: row.priceBasis,
    planningProvided: Boolean(row.planningProvided),
    legalNote: String(row.legalNote || "")
  };
}

function fromServer(row: ServerNachtrag): NachtragRow {
  return normalizeRow({
    id: row.id,
    posNr: row.lvPos || "",
    kurztext: row.title || "",
    langtext: row.langtext || "",
    einheit: row.unit || "m",
    mengeDelta: n(row.qty),
    preis: n(row.ep),
    status: toUiStatus(row.status),
    begruendung: row.note || "",
    contractBasis: row.contractBasis,
    changeRequestDate: row.changeRequestDate || "",
    changeRequestReceivedAt: row.changeRequestReceivedAt || "",
    bgbAgreementDeadline: row.bgbAgreementDeadline || "",
    agreementStatus: row.agreementStatus || "PENDING",
    orderDate: row.orderDate || "",
    orderTextFormConfirmed: Boolean(row.orderTextFormConfirmed),
    orderReference: row.orderReference || "",
    priceBasis: row.priceBasis,
    planningProvided: Boolean(row.planningProvided),
    legalNote: row.legalNote || ""
  });
}

function toServer(
projectKey: string,
row: NachtragRow,
existingNumber?: string,
existingCreatedAt?: string)
: ServerNachtrag {
  const qty = n(row.mengeDelta);
  const ep = n(row.preis);
  const now = new Date().toISOString();

  return {
    id: String(row.id || safeId()),
    projectKey,
    lvPos: String(row.posNr || ""),
    number: existingNumber || "",
    title: String(row.kurztext || ""),
    langtext: String(row.langtext || ""),
    qty,
    unit: String(row.einheit || "m"),
    ep,
    total: round2(qty * ep),
    status: toServerStatus((row.status || "Entwurf") as ChangeStatus),
    note: String(row.begruendung || ""),
    contractBasis: row.contractBasis,
    changeRequestDate: row.changeRequestDate || "",
    changeRequestReceivedAt: row.changeRequestReceivedAt || "",
    bgbAgreementDeadline: row.bgbAgreementDeadline || "",
    agreementStatus: row.agreementStatus || "PENDING",
    orderDate: row.orderDate || "",
    orderTextFormConfirmed: Boolean(row.orderTextFormConfirmed),
    orderReference: row.orderReference || "",
    priceBasis: row.priceBasis,
    planningProvided: Boolean(row.planningProvided),
    legalNote: row.legalNote || "",
    createdAt: existingCreatedAt || now,
    updatedAt: now
  };
}

function mergeRowsKeepLocal(prev: NachtragRow[], incoming: NachtragRow[]) {
  const byId = new Map<string, NachtragRow>();

  for (const row of incoming) {
    byId.set(String(row.id), normalizeRow(row));
  }

  for (const row of prev) {
    const id = String(row.id);
    const serverRow = byId.get(id);

    byId.set(
      id,
      normalizeRow({
        ...(serverRow || {}),
        ...row,
        langtext: row.langtext || serverRow?.langtext || ""
      })
    );
  }

  return Array.from(byId.values()).map(normalizeRow);
}

function mergeByPosNrKeepExisting(prev: NachtragRow[], incoming: NachtragRow[]) {
  const key = (s: unknown) => String(s || "").trim();
  const byPos = new Map<string, NachtragRow>();

  for (const row of prev) {
    const k = key(row.posNr);
    if (k) byPos.set(k, row);
  }

  const added: NachtragRow[] = [];

  for (const row of incoming) {
    const k = key(row.posNr);
    if (!k) continue;

    if (!byPos.has(k)) {
      byPos.set(k, row);
      added.push(row);
    }
  }

  const addedIds = new Set(added.map((x) => String(x.id)));
  const rest = Array.from(byPos.values()).filter(
    (x) => !addedIds.has(String(x.id))
  );

  return [...added, ...rest].map(normalizeRow);
}

function nachtragDuplicateKey(row: NachtragRow): string {
  const text = `${row.posNr || ""} ${row.kurztext || ""} ${row.langtext || ""}`.
  toLowerCase().
  replace(/[^\p{L}\p{N}]+/gu, " ").
  replace(/\s+/g, " ").
  trim();

  if (text.length < 6) return "";

  return [
  text,
  String(row.einheit || "").trim().toLowerCase(),
  round2(n(row.mengeDelta)),
  round2(n(row.preis))].
  join("|");
}

function getNachtragDuplicateIds(rows: NachtragRow[]): Set<string> {
  const map = new Map<string, NachtragRow[]>();

  for (const row of rows) {
    const key = nachtragDuplicateKey(row);
    if (!key) continue;

    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }

  const ids = new Set<string>();

  for (const group of map.values()) {
    if (group.length > 1) {
      group.forEach((row) => ids.add(row.id));
    }
  }

  return ids;
}

function mergeByIdKeepExisting(prev: NachtragRow[], incoming: NachtragRow[]) {
  const byId = new Map<string, NachtragRow>();

  for (const row of prev) {
    byId.set(String(row.id), normalizeRow(row));
  }

  const added: NachtragRow[] = [];

  for (const row of incoming) {
    const clean = normalizeRow(row);
    const id = String(clean.id);

    if (!byId.has(id)) {
      byId.set(id, clean);
      added.push(clean);
    }
  }

  const addedIds = new Set(added.map((x) => String(x.id)));
  const rest = Array.from(byId.values()).filter(
    (x) => !addedIds.has(String(x.id))
  );

  return [...added, ...rest].map(normalizeRow);
}

/* CSV:
   PosNr;Kurztext;Langtext;Einheit;DeltaMenge;EP (netto);Status;Begründung
*/
function parseCsv(text: string): NachtragRow[] {
  const raw = String(text || "").
  replace(/\r\n/g, "\n").
  replace(/\r/g, "\n").
  trim();

  if (!raw) return [];

  const sep = raw.includes(";") ? ";" : ",";
  const lines = raw.
  split("\n").
  map((line) => line.trim()).
  filter(Boolean);

  if (!lines.length) return [];

  const header = lines[0].toLowerCase();
  const hasHeader =
  header.includes("pos") ||
  header.includes("kurz") ||
  header.includes("lang") ||
  header.includes("einheit") ||
  header.includes("status");

  const start = hasHeader ? 1 : 0;
  const out: NachtragRow[] = [];

  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    const cells: string[] = [];
    let cur = "";
    let inQ = false;

    for (let j = 0; j < line.length; j += 1) {
      const ch = line[j];

      if (ch === '"') {
        if (inQ && line[j + 1] === '"') {
          cur += '"';
          j += 1;
        } else {
          inQ = !inQ;
        }
      } else if (!inQ && ch === sep) {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }

    cells.push(cur);

    const hasLangtextColumn = hasHeader && header.includes("lang");

    const posNr = cells[0] || "";
    const kurztext = cells[1] || "";
    const langtext = hasLangtextColumn ? cells[2] || "" : "";
    const einheit = hasLangtextColumn ? cells[3] || "m" : cells[2] || "m";
    const mengeDelta = hasLangtextColumn ? cells[4] : cells[3];
    const preis = hasLangtextColumn ? cells[5] : cells[4];
    const statusRaw = String(
      hasLangtextColumn ? cells[6] || "Entwurf" : cells[5] || "Entwurf"
    ).trim() as ChangeStatus;
    const begruendung = hasLangtextColumn ? cells[7] || "" : cells[6] || "";

    const status = STATI.includes(statusRaw) ? statusRaw : "Entwurf";

    out.push(
      normalizeRow({
        id: safeId(),
        posNr,
        kurztext,
        langtext,
        einheit,
        mengeDelta: n(mengeDelta),
        preis: n(preis),
        status,
        begruendung
      })
    );
  }

  return out;
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function safeFileName(value: string): string {
  return String(value || "Nachtraege").
  replace(/[^\w.-]+/g, "_").
  replace(/_+/g, "_");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function readKalkulationHandoff(): KalkulationHandoff | null {
  const keys = [KI_HANDOFF_KEY, MANUELL_HANDOFF_KEY];

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as KalkulationHandoff;
      const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];

      if (rows.length) return parsed;
    } catch {


      //
    }}
  return null;
}

function handoffMatchesProject(
handoff: KalkulationHandoff | null,
currentProject: ProjectLike | null,
apiKey: string)
: boolean {
  if (!handoff) return false;

  const hk = String(handoff.projectKey || "").trim().toUpperCase();
  if (!hk) return true;

  const currentKey = String(
    currentProject?.code ||
    currentProject?.number ||
    currentProject?.projektnummer ||
    currentProject?.id ||
    apiKey ||
    ""
  ).
  trim().
  toUpperCase();

  return !currentKey || hk === currentKey;
}

function mapHandoffRowsToNachtraege(handoff: KalkulationHandoff): NachtragRow[] {
  const rows = Array.isArray(handoff.rows) ? handoff.rows : [];

  return rows.
  map((row) => {
    const posNr = String(row.posNr || row.pos || "").trim();
    const kurztext = String(row.kurztext || row.title || "").trim();
    const langtext = String(row.langtext || "").trim();

    const einheit = String(row.einheit || row.unit || "m").trim() || "m";

    const mengeDelta = n(row.mengeDelta ?? row.menge ?? row.qty, 0);
    const preis = n(
      row.preis ??
      row.ep ??
      row.finalUnitPrice ??
      row.suggestedUnitPrice ??
      row.baseUnitPrice,
      0
    );

    const auftragName = String(row.auftragName || handoff.auftragName || "").trim();

    const begruendungParts = [
    "Aus Rezept / Urkalkulation übernommen.",
    auftragName ? `Auftrag: ${auftragName}` : "",
    row.warning ? `Hinweis: ${row.warning}` : "",
    row.aiReason ? `Kalkulationshinweis: ${row.aiReason}` : ""].
    filter(Boolean);

    if (!posNr && !kurztext) return null;

    return normalizeRow({
      id: `REZEPT-${String(row.id || `${posNr}-${Date.now()}`)}`,
      posNr,
      kurztext: kurztext || (posNr ? `Nachtrag zu ${posNr}` : "Nachtrag"),
      langtext,
      einheit,
      mengeDelta,
      preis,
      status: "Entwurf",
      begruendung: begruendungParts.join("\n"),

      materialCost: n((row as any).materialCost),
      laborCost: n((row as any).laborCost),
      machineCost: n((row as any).machineCost),
      subcontractorCost: n((row as any).subcontractorCost),
      disposalCost: n((row as any).disposalCost),
      transportCost: n((row as any).transportCost),
      overheadCost: n((row as any).overheadCost),
      riskCost: n((row as any).riskCost),
      profitCost: n((row as any).profitCost),

      baseUnitPrice: n((row as any).baseUnitPrice),
      suggestedUnitPrice: n((row as any).suggestedUnitPrice),
      finalUnitPrice: n((row as any).finalUnitPrice),

      riskLevel: (row as any).riskLevel,
      calculationStatus: (row as any).calculationStatus,

      gewerk: String((row as any).gewerk || ""),
      leistungsart: String((row as any).leistungsart || ""),
      bauverfahren: String((row as any).bauverfahren || ""),

      warning: String(row.warning || ""),
      aiReason: String(row.aiReason || ""),
      priceBreakdown: Array.isArray((row as any).priceBreakdown) ?
      (row as any).priceBreakdown :
      Array.isArray(row.meta?.priceBreakdown) ?
      row.meta.priceBreakdown :
      []
    });
  }).
  filter(Boolean) as NachtragRow[];
}

function StatusPill({ status }: {status: ChangeStatus;}) {
  return <span className={rlcClass(null, statusStyle(status))}>{status}</span>;
}

/* ================= COMPONENT ================= */


function showNachtragLangtextModal(text: string) {
  const old = document.getElementById("rlc-nachtrag-langtext-modal");
  if (old) old.remove();
  const overlay = document.createElement("div");
  overlay.id = "rlc-nachtrag-langtext-modal";
  Object.assign(overlay.style, { position:"fixed", inset:"0", zIndex:"999999", background:"rgba(15,23,42,.55)", display:"flex", alignItems:"center", justifyContent:"center", padding:"24px" });
  const box = document.createElement("div");
  Object.assign(box.style, { width:"min(820px,96vw)", maxHeight:"82vh", background:"#fff", borderRadius:"18px", boxShadow:"0 24px 80px rgba(15,23,42,.32)", border:"1px solid #dbe4f0", overflow:"hidden", fontFamily:"inherit" });
  const head = document.createElement("div");
  Object.assign(head.style, { padding:"18px 22px", background:"linear-gradient(135deg,#10204a,#2457d6)", color:"white", fontWeight:"900", fontSize:"18px" });
  head.textContent = "Langtext / Positionssumme";
  const body = document.createElement("pre");
  Object.assign(body.style, { margin:"0", padding:"22px", maxHeight:"56vh", overflow:"auto", whiteSpace:"pre-wrap", wordBreak:"break-word", fontFamily:"inherit", fontSize:"15px", lineHeight:"1.55", color:"#0f172a", background:"#f8fafc" });
  body.textContent = text;
  const footer = document.createElement("div");
  Object.assign(footer.style, { padding:"14px 22px", display:"flex", justifyContent:"flex-end", background:"#fff", borderTop:"1px solid #e5e7eb" });
  const close = document.createElement("button");
  close.type = "button"; close.textContent = "Schließen";
  Object.assign(close.style, { border:"1px solid #cbd5e1", borderRadius:"12px", background:"#fff", color:"#0f172a", fontWeight:"800", padding:"10px 18px", cursor:"pointer" });
  close.onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  footer.appendChild(close); box.appendChild(head); box.appendChild(body); box.appendChild(footer); overlay.appendChild(box); document.body.appendChild(overlay);
}

export default function NachtraegePage() {
  const projectCtx: any = useProject();
  const currentProject = getCurrentProject(projectCtx);

  const navigate = useNavigate();
  const location = useLocation();

  const { apiKey, serverProjectKey, pid } = useMemo(
    () => buildKeys(currentProject),
    [currentProject]
  );

  const kalkulationBasis = useMemo(
    () => loadKalkulationBasis(apiKey || serverProjectKey),
    [apiKey, serverProjectKey]
  );

  const kalkulationBasisNetto = useMemo(
    () => kalkulationBasisNet(kalkulationBasis),
    [kalkulationBasis]
  );
  const [rows, setRows] = useState<NachtragRow[]>([]);
  const [mwst, setMwst] = useState<number>(() =>
  Number(localStorage.getItem(MWST_KEY) ?? 19)
  );
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState<ChangeStatus | "Alle">(
    "Alle"
  );
  const [sortKey, setSortKey] = useState<"pos" | "status" | "value">("pos");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<NachtragRow | null>(null);
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [qualityFilter, setQualityFilter] = useState<NachtragQualityFilter>("alle");

  const [draft, setDraft] = useState<NachtragDraft | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftSel, setDraftSel] = useState<Record<number, boolean>>({});

  const [recipeDraft, setRecipeDraft] = useState<KalkulationHandoff | null>(null);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [recipeSel, setRecipeSel] = useState<Record<number, boolean>>({});

  const importedDraftRef = useRef(false);
  const importedRecipeRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function saveLocal(nextRows: NachtragRow[]) {
    const cleanRows = nextRows.map(normalizeRow);
    saveExtRows(pid, cleanRows);
    setRows(cleanRows);
  }

  async function load() {
    setInfo("");

    const localRows = loadExtRows(pid);

    if (!apiKey) {
      setRows(localRows);
      setSelected({});
      return;
    }

    setLoading(true);

    try {
      const data = await apiJson<{ok: boolean;items: ServerNachtrag[];}>(
        `/api/verknuepfung/nachtraege/${encodeURIComponent(apiKey)}`
      );

      const incoming = Array.isArray(data?.items) ?
      data.items.map(fromServer) :
      [];

      const merged = mergeRowsKeepLocal(localRows, incoming);
      const canonicalMerged = merged.map((row) => normalizeRow({
        ...row,
        posNr: canonicalNachtragPosNr(row, kalkulationBasis) || row.posNr || ""
      }));

      saveLocal(canonicalMerged);
      setSelected({});
      setInfo("");
    } catch (e: any) {
      const msg = String(e?.message || e || "");

      if (msg.includes("Kein Token") || msg.includes("401")) {
        setInfo("Server nicht geladen: Kein gültiger Login-Token vorhanden.");
      } else if (msg.includes("504") || msg.toLowerCase().includes("gateway")) {
        setInfo(
          "Server nicht geladen: Gateway Timeout. Lokale Daten bleiben aktiv."
        );
      } else {
        setInfo(`Server nicht geladen: ${msg}`);
      }

      setRows(localRows);
      setSelected({});
    } finally {
      setLoading(false);
    }
  }

  async function saveServerNow(customRows?: NachtragRow[]) {
    const sourceRows = (customRows ?? rows).map((row) => normalizeRow({
      ...row,
      posNr: canonicalNachtragPosNr(row, kalkulationBasis) || row.posNr || ""
    }));

    saveLocal(sourceRows);

    if (!apiKey) {
      setInfo("Kein Server-Key vorhanden. Nachträge wurden nur lokal gespeichert.");
      return;
    }

    setLoading(true);
    setInfo("");

    try {
      let existing: ServerNachtrag[] = [];

      try {
        const data = await apiJson<{ok: boolean;items: ServerNachtrag[];}>(
          `/api/verknuepfung/nachtraege/${encodeURIComponent(apiKey)}`
        );

        existing = Array.isArray(data?.items) ? data.items : [];
      } catch {
        existing = [];
      }

      const metaById = new Map<string, {number: string;createdAt: string;}>();

      for (const item of existing) {
        metaById.set(String(item.id), {
          number: String(item.number || ""),
          createdAt: String(item.createdAt || "")
        });
      }

      const payloadItems = sourceRows.map((row) => {
        const meta = metaById.get(String(row.id));
        return toServer(serverProjectKey, row, meta?.number, meta?.createdAt);
      });

      await apiJson(`/api/verknuepfung/nachtraege/${encodeURIComponent(apiKey)}`, {
        method: "PUT",
        body: JSON.stringify({ items: payloadItems })
      });

      setRows(sourceRows);
      setInfo("Nachträge erfolgreich am Server gespeichert.");
    } catch (e: any) {
      const msg = String(e?.message || e || "");

      if (msg.includes("Kein Token") || msg.includes("401")) {
        setInfo(
          "Server-Speicherung nicht möglich: Kein gültiger Login-Token vorhanden."
        );
      } else if (msg.includes("504") || msg.toLowerCase().includes("gateway")) {
        setInfo(
          "Server-Timeout beim Speichern. Die Nachträge bleiben lokal gespeichert."
        );
      } else {
        setInfo(`Server-Speicherung fehlgeschlagen: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, pid]);

  useEffect(() => {
    localStorage.setItem(MWST_KEY, String(mwst || 0));
  }, [mwst]);

  useEffect(() => {
    if (importedDraftRef.current) return;

    const qs = new URLSearchParams(location.search);
    const from = String(qs.get("from") || "").trim().toLowerCase();

    if (
    from !== "regie" &&
    from !== "rezepte" &&
    from !== "auto-ki" &&
    from !== "autoki")
    {
      return;
    }
    if (!currentProject) return;

    try {
      const raw = localStorage.getItem(NACHTRAG_BUFFER_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as NachtragDraft;
      const draftRows = Array.isArray(parsed?.rows) ? parsed.rows : [];

      if (!draftRows.length) return;

      const qsProjectId = String(qs.get("projectId") || "").trim();


      const currentProjectKeys = new Set(
        [
        currentProject.code,
        currentProject.number,
        currentProject.projektnummer,
        currentProject.id,
        apiKey,
        pid].

        map((value) => String(value || "").trim().toUpperCase()).
        filter(Boolean)
      );

      const draftProjectKeys = [
      parsed.projectId,
      parsed.projectKey,
      qsProjectId].

      map((value) => String(value || "").trim().toUpperCase()).
      filter(Boolean);

      const matches =
      !draftProjectKeys.length ||
      draftProjectKeys.some((value) => currentProjectKeys.has(value));

      if (!matches) return;

      importedDraftRef.current = true;
      setDraft(parsed);
      setDraftOpen(true);

      const sel: Record<number, boolean> = {};
      draftRows.forEach((_, i) => {
        sel[i] = true;
      });
      setDraftSel(sel);
    } catch {


      //
    }}, [location.search, currentProject]);
  useEffect(() => {
    if (importedRecipeRef.current) return;

    const qs = new URLSearchParams(location.search);
    const from = String(qs.get("from") || "").trim().toLowerCase();

    if (from !== "rezepte" && from !== "recipe" && from !== "urkalkulation") {
      return;
    }

    const handoff = readKalkulationHandoff();
    if (!handoff) return;
    if (!handoffMatchesProject(handoff, currentProject, apiKey)) return;

    const handoffRows = Array.isArray(handoff.rows) ? handoff.rows : [];
    if (!handoffRows.length) return;

    importedRecipeRef.current = true;
    setRecipeDraft(handoff);
    setRecipeOpen(true);

    const sel: Record<number, boolean> = {};
    handoffRows.forEach((_, i) => {
      sel[i] = true;
    });
    setRecipeSel(sel);

    setInfo("Rezept-/Urkalkulationspositionen erkannt. Bitte prüfen und übernehmen.");
  }, [location.search, currentProject, apiKey]);

  const duplicateIds = useMemo(() => getNachtragDuplicateIds(rows), [rows]);

  const viewRows = useMemo(() => {
    let result = [...rows];

    if (filterStatus !== "Alle") {
      result = result.filter((x) => (x.status || "Entwurf") === filterStatus);
    }

    if (qualityFilter !== "alle") {
      result = result.filter((row) => {
        if (qualityFilter === "Entwurf") return row.status === "Entwurf";
        if (qualityFilter === "Abgegeben") return row.status === "Abgegeben";
        if (qualityFilter === "Beauftragt") return row.status === "Beauftragt";
        if (qualityFilter === "Abgelehnt") return row.status === "Abgelehnt";
        if (qualityFilter === "begruendungFehlt") return !String(row.begruendung || "").trim();
        if (qualityFilter === "epFehlt") return n(row.preis) <= 0;
        if (qualityFilter === "mengeFehlt") return n(row.mengeDelta) === 0;
        if (qualityFilter === "einheitFehlt") return !String(row.einheit || "").trim();
        if (qualityFilter === "doppelte") return duplicateIds.has(row.id);
        return true;
      });
    }

    if (q.trim()) {
      const s = q.toLowerCase();

      result = result.filter(
        (x) =>
        String(x.posNr || "").toLowerCase().includes(s) ||
        String(x.kurztext || "").toLowerCase().includes(s) ||
        String(x.langtext || "").toLowerCase().includes(s) ||
        String(x.begruendung || "").toLowerCase().includes(s)
      );
    }

    if (sortKey === "pos") {
      result.sort((a, b) =>
      String(a.posNr || "").localeCompare(String(b.posNr || ""), "de", {
        numeric: true,
        sensitivity: "base"
      })
      );
    }

    if (sortKey === "status") {
      result.sort(
        (a, b) =>
        STATI.indexOf((a.status || "Entwurf") as ChangeStatus) -
        STATI.indexOf((b.status || "Entwurf") as ChangeStatus)
      );
    }

    if (sortKey === "value") {
      result.sort(
        (a, b) => n(b.mengeDelta) * n(b.preis) - n(a.mengeDelta) * n(a.preis)
      );
    }

    return result;
  }, [rows, q, filterStatus, sortKey, qualityFilter, duplicateIds]);

  const selectedRows = useMemo(() => {
    const ids = new Set(Object.keys(selected).filter((id) => selected[id]));
    return rows.filter((row) => ids.has(row.id)).map(normalizeRow);
  }, [rows, selected]);

  async function openGaebExport() {
    const sourceRows = (selectedRows.length ? selectedRows : rows).map(normalizeRow);
    if (!sourceRows.length) { setInfo("Keine Nachtragspositionen für GAEB-Export vorhanden."); return; }

    let canonicalBasis = kalkulationBasis;
    const projectKey = serverProjectKey || apiKey || "";
    if (projectKey) {
      try {
        const serverSnapshot: any = await apiJson(`/api/kalkulation/storage/ki/${encodeURIComponent(projectKey)}`);
        const rawRows =
          (Array.isArray(serverSnapshot?.data?.rows) && serverSnapshot.data.rows) ||
          (Array.isArray(serverSnapshot?.rows) && serverSnapshot.rows) ||
          (Array.isArray(serverSnapshot?.data?.data?.rows) && serverSnapshot.data.data.rows) ||
          [];
        const mapped = rawRows.map((r: any) => ({
          ...r,
          posNr: String(r?.posNr || r?.pos || r?.positionNumber || "").trim(),
          kurztext: String(r?.kurztext || r?.shortText || r?.title || "").trim(),
          langtext: String(r?.langtext || r?.longText || "").trim(),
          einheit: String(r?.einheit || r?.unit || "").trim(),
          menge: n(r?.menge ?? r?.quantity),
          preis: n(r?.rlcKiUnitPrice ?? r?.finalUnitPrice ?? r?.preis ?? r?.unitPrice)
        })).filter((r: any) => r.posNr || r.kurztext);
        if (mapped.length) canonicalBasis = mapped;
      } catch {
        // Fallback auf lokale Kalkulationsbasis.
      }
    }

    const exportRows = sourceRows.map((row) => ({
      posNr: canonicalNachtragPosNr(row, canonicalBasis) || row.posNr || "",
      kurztext: row.kurztext || "",
      langtext: row.langtext || "",
      einheit: row.einheit || "",
      menge: n(row.mengeDelta),
      preis: n(row.preis),
      gesamt: n(row.mengeDelta) * n(row.preis)
    }));
    sessionStorage.setItem("rlc_gaeb_export_handoff_v1", JSON.stringify({
      source: "nachtraege", sourceLabel: selectedRows.length ? "Ausgewählte Nachträge" : "Alle Nachträge",
      projectCode: serverProjectKey || apiKey || "", projectName: String((currentProject as any)?.name || (currentProject as any)?.title || ""),
      mode: "X84", rows: exportRows, createdAt: new Date().toISOString()
    }));
    navigate(`/kalkulation/gaeb?projectCode=${encodeURIComponent(serverProjectKey || apiKey || "")}&source=nachtraege&mode=X84`);
  }

  const totals = useMemo(() => {
    const netto = viewRows.reduce(
      (sum, row) => sum + n(row.mengeDelta) * n(row.preis),
      0
    );

    const brutto = netto * (1 + n(mwst) / 100);

    return {
      netto: round2(netto),
      brutto: round2(brutto),
      count: viewRows.length,
      selected: Object.values(selected).filter(Boolean).length,
      beauftragt: viewRows.filter((r) => r.status === "Beauftragt").length,
      offen: viewRows.filter((r) => r.status === "Entwurf").length
    };
  }, [viewRows, mwst, selected]);

  const draftRows = useMemo(
    () => Array.isArray(draft?.rows) ? draft.rows : [],
    [draft]
  );

  const recipeRows = useMemo(
    () => Array.isArray(recipeDraft?.rows) ? recipeDraft.rows : [],
    [recipeDraft]
  );

  function addFromKalkulationBasis() {
    if (!kalkulationBasis.length) {
      setInfo("Keine Kalkulationsbasis vorhanden. Bitte zuerst die Kalkulation berechnen.");
      return;
    }

    if (typeof document === "undefined") return;

    const existing = document.getElementById("rlc-nachtrag-position-picker");
    if (existing) existing.remove();

    const esc = (value: unknown) =>
    String(value ?? "").
    replace(/&/g, "&amp;").
    replace(/</g, "&lt;").
    replace(/>/g, "&gt;").
    replace(/"/g, "&quot;");

    const overlay = document.createElement("div");
    overlay.id = "rlc-nachtrag-position-picker";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "99999";
    overlay.style.background = "rgba(15,23,42,0.45)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.padding = "24px";

    const modal = document.createElement("div");
    modal.style.width = "min(1180px, 96vw)";
    modal.style.maxHeight = "88vh";
    modal.style.background = "#fff";
    modal.style.borderRadius = "22px";
    modal.style.boxShadow = "0 24px 80px rgba(15,23,42,0.35)";
    modal.style.overflow = "hidden";
    modal.style.display = "flex";
    modal.style.flexDirection = "column";

    let currentMatches: KalkulationBasisRow[] = [];

    const renderRows = (query: string) => {
      const q = String(query || "").trim().toLowerCase();

      currentMatches = kalkulationBasis.
      filter((r) => {
        if (!q) return true;
        return (
          String(r.posNr || "").toLowerCase().includes(q) ||
          String(r.kurztext || "").toLowerCase().includes(q) ||
          String(r.langtext || "").toLowerCase().includes(q));

      }).
      slice(0, 80);

      const rowsHtml = currentMatches.length ?
      currentMatches.
      map((r, i) => {
        return `
                <tr>
                  <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:800;color:#0f172a;">${esc(r.posNr || "—")}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">
                    <div style="font-weight:800;color:#0f172a;">${esc(r.kurztext || "Ohne Kurztext")}</div>
                    <div style="font-size:12px;color:#64748b;max-width:620px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(r.langtext || "")}</div>
                  </td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#0f172a;">${esc(r.einheit || "—")}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#0f172a;">${esc(String(r.menge || ""))}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:900;color:#0f172a;">${esc(money(n(r.preis)))}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">
                    <button data-pick-index="${i}" style="padding:9px 13px;border-radius:10px;border:0;background:#146ef5;color:white;font-weight:900;cursor:pointer;">
                      Übernehmen
                    </button>
                  </td>
                </tr>
              `;
      }).
      join("") :
      `<tr><td colspan="6" style="padding:24px;text-align:center;color:#64748b;">Keine passende Position gefunden.</td></tr>`;

      const tbody = modal.querySelector("[data-role='rows']");
      const count = modal.querySelector("[data-role='count']");
      if (tbody) tbody.innerHTML = rowsHtml;
      if (count) count.textContent = `${currentMatches.length} Treffer`;
    };

    modal.innerHTML = `
      <div style="padding:22px 26px;border-bottom:1px solid #e5e7eb;background:#f8fafc;display:flex;justify-content:space-between;gap:16px;align-items:flex-start;">
        <div>
          <div style="font-size:22px;font-weight:950;color:#0f172a;">Position aus Kalkulation wählen</div>
          <div style="font-size:13px;color:#475569;margin-top:6px;">
            Basis: ${esc(String(kalkulationBasis.length))} Positionen / ${esc(money(kalkulationBasisNetto))} RLC-KI
          </div>
        </div>
        <button data-action="close" style="width:42px;height:42px;border-radius:14px;border:1px solid #cbd5e1;background:#fff;font-size:24px;font-weight:900;cursor:pointer;">×</button>
      </div>

      <div style="padding:18px 26px;border-bottom:1px solid #e5e7eb;display:flex;gap:12px;align-items:center;">
        <input data-role="search" placeholder="Suchen nach PosNr, Kurztext oder Langtext..." style="flex:1;padding:13px 15px;border-radius:12px;border:1px solid #cbd5e1;font-size:15px;outline:none;" autofocus />
        <div data-role="count" style="font-size:13px;font-weight:800;color:#475569;min-width:90px;text-align:right;"></div>
      </div>

      <div style="overflow:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead style="position:sticky;top:0;background:#f1f5f9;z-index:1;">
            <tr>
              <th style="padding:11px 12px;text-align:left;color:#334155;">Pos.</th>
              <th style="padding:11px 12px;text-align:left;color:#334155;">Kurztext / Langtext</th>
              <th style="padding:11px 12px;text-align:left;color:#334155;">ME</th>
              <th style="padding:11px 12px;text-align:right;color:#334155;">Menge</th>
              <th style="padding:11px 12px;text-align:right;color:#334155;">EP netto</th>
              <th style="padding:11px 12px;text-align:right;color:#334155;">Aktion</th>
            </tr>
          </thead>
          <tbody data-role="rows"></tbody>
        </table>
      </div>

      <div style="padding:16px 26px;border-top:1px solid #e5e7eb;background:#f8fafc;display:flex;justify-content:flex-end;">
        <button data-action="close" style="padding:11px 18px;border-radius:12px;border:1px solid #cbd5e1;background:#fff;font-weight:900;cursor:pointer;">
          Schließen
        </button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    overlay.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target === overlay || target.dataset.action === "close") {
        close();
        return;
      }
      const pickIndexRaw = target.dataset.pickIndex;
      if (pickIndexRaw !== undefined) {
        const selected = currentMatches[Number(pickIndexRaw)];
        if (!selected) return;

        modal.innerHTML = `
          <div style="padding:22px 26px;border-bottom:1px solid #e5e7eb;background:#f8fafc;display:flex;justify-content:space-between;gap:16px;align-items:flex-start;">
            <div>
              <div style="font-size:22px;font-weight:950;color:#0f172a;">Nachtrag aus Position erstellen</div>
              <div style="font-size:13px;color:#475569;margin-top:6px;">
                ${esc(selected.posNr || "—")} · ${esc(selected.kurztext || "Ohne Kurztext")} · EP ${esc(money(n(selected.preis)))}
              </div>
            </div>
            <button data-action="close" style="width:42px;height:42px;border-radius:14px;border:1px solid #cbd5e1;background:#fff;font-size:24px;font-weight:900;cursor:pointer;">×</button>
          </div>

          <div style="padding:24px 26px;display:grid;gap:18px;">
            <div style="border:1px solid #e5e7eb;border-radius:16px;padding:16px;background:#f8fafc;">
              <div style="font-weight:900;color:#0f172a;margin-bottom:6px;">Ausgewählte LV-Position</div>
              <div style="font-size:14px;color:#0f172a;font-weight:800;">${esc(selected.posNr || "—")} · ${esc(selected.kurztext || "")}</div>
              <div style="font-size:13px;color:#64748b;margin-top:6px;line-height:1.45;max-height:90px;overflow:auto;">${esc(selected.langtext || "")}</div>
            </div>

            <div style="display:grid;grid-template-columns:180px 1fr 180px;gap:14px;">
              <div>
                <label style="font-size:12px;font-weight:900;color:#475569;">ME</label>
                <input value="${esc(selected.einheit || "")}" disabled style="width:100%;margin-top:6px;padding:12px;border-radius:12px;border:1px solid #cbd5e1;background:#f8fafc;font-weight:800;" />
              </div>
              <div>
                <label style="font-size:12px;font-weight:900;color:#475569;">Δ-Menge Nachtrag</label>
                <input data-role="delta" type="number" step="0.01" placeholder="z.B. 10" style="width:100%;margin-top:6px;padding:12px;border-radius:12px;border:1px solid #cbd5e1;font-weight:800;" />
              </div>
              <div>
                <label style="font-size:12px;font-weight:900;color:#475569;">EP netto</label>
                <input value="${esc(money(n(selected.preis)))}" disabled style="width:100%;margin-top:6px;padding:12px;border-radius:12px;border:1px solid #cbd5e1;background:#f8fafc;font-weight:800;text-align:right;" />
              </div>
            </div>

            <div>
              <label style="font-size:12px;font-weight:900;color:#475569;">Begründung</label>
              <textarea data-role="reason" placeholder="Warum ist dieser Nachtrag notwendig?" style="width:100%;min-height:110px;margin-top:6px;padding:12px;border-radius:12px;border:1px solid #cbd5e1;font-size:14px;line-height:1.45;"></textarea>
            </div>

            <div data-role="error" style="display:none;color:#b91c1c;font-weight:800;font-size:13px;"></div>
          </div>

          <div style="padding:16px 26px;border-top:1px solid #e5e7eb;background:#f8fafc;display:flex;justify-content:space-between;gap:10px;">
            <button data-action="back" style="padding:11px 18px;border-radius:12px;border:1px solid #cbd5e1;background:#fff;font-weight:900;cursor:pointer;">
              Zurück
            </button>
            <button data-action="create-nachtrag" style="padding:11px 18px;border-radius:12px;border:0;background:#146ef5;color:white;font-weight:950;cursor:pointer;">
              Nachtrag erstellen
            </button>
          </div>
        `;

        const deltaInput = modal.querySelector("[data-role='delta']") as HTMLInputElement | null;
        setTimeout(() => deltaInput?.focus(), 50);

        modal.querySelector("[data-action='back']")?.addEventListener("click", () => {
          addFromKalkulationBasis();
        });

        modal.querySelector("[data-action='create-nachtrag']")?.addEventListener("click", () => {
          const delta = n((modal.querySelector("[data-role='delta']") as HTMLInputElement | null)?.value);
          const reason = String((modal.querySelector("[data-role='reason']") as HTMLTextAreaElement | null)?.value || "").trim();
          const errorBox = modal.querySelector("[data-role='error']") as HTMLElement | null;

          if (delta === 0) {
            if (errorBox) {
              errorBox.style.display = "block";
              errorBox.textContent = "Bitte eine Δ-Menge ungleich 0 eingeben.";
            }
            return;
          }

          if (!reason) {
            if (errorBox) {
              errorBox.style.display = "block";
              errorBox.textContent = "Bitte eine Begründung eingeben.";
            }
            return;
          }

          add({
            posNr: selected.posNr || "",
            kurztext: selected.kurztext || "",
            langtext: selected.langtext || "",
            einheit: selected.einheit || "",
            mengeDelta: delta,
            preis: n(selected.preis),
            status: "Entwurf",
            begruendung: reason
          });

          setInfo(
            `Nachtrag erstellt: ${selected.posNr || ""} ${selected.kurztext || ""}`.trim()
          );

          close();
        });
      }
    });

    const search = modal.querySelector("[data-role='search']") as HTMLInputElement | null;
    search?.addEventListener("input", () => renderRows(search.value));
    renderRows("");
    setTimeout(() => search?.focus(), 50);
  }

  function add(tpl?: Partial<NachtragRow>) {
    const row = normalizeRow({
      id: safeId(),
      posNr: tpl?.posNr || "",
      kurztext: tpl?.kurztext || "",
      langtext: tpl?.langtext || "",
      einheit: tpl?.einheit || "m",
      mengeDelta: tpl?.mengeDelta ?? 0,
      preis: tpl?.preis ?? 0,
      status: tpl?.status || "Entwurf",
      begruendung: tpl?.begruendung || ""
    });

    const next = [row, ...rows];

    saveLocal(next);
    setSelected({});
    setInfo("");
  }

  function createManualNachtrag() {
    const row = normalizeRow({
      id: safeId(),
      posNr: "",
      kurztext: "",
      langtext: "",
      einheit: "m",
      mengeDelta: 0,
      preis: 0,
      status: "Entwurf",
      begruendung: ""
    });
    setEditingId(row.id);
    setEditDraft(row);
    setInfo("");
  }

  function save(patch: Partial<NachtragRow> & {id: string;}) {
    const next = rows.map((row) =>
    row.id === patch.id ? normalizeRow({ ...row, ...patch }) : row
    );

    saveLocal(next);
    setInfo("");
  }

  function startEdit(row: NachtragRow) {
    setEditingId(row.id);
    setEditDraft({ ...row });
  }

  function updateEdit(patch: Partial<NachtragRow>) {
    setEditDraft((current) => current ? normalizeRow({ ...current, ...patch }) : current);
  }

  function commitEdit() {
    if (!editDraft) return;
    const exists = rows.some((row) => row.id === editDraft.id);
    if (exists) {
      save(editDraft);
    } else {
      saveLocal([normalizeRow(editDraft), ...rows]);
      setInfo("Nachtrag erstellt.");
    }
    setEditingId(null);
    setEditDraft(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  function openEditInUrkalkulation() {
    if (!editDraft) return;
    // Den aktuellen Nachtrag lokal sichern und exakt diese Position an die
    // Urkalkulation übergeben. Keine generische/erste LV-Position laden.
    save(editDraft);
    try {
      sessionStorage.setItem(RECIPE_CONTEXT_KEY, JSON.stringify({
        source: "nachtraege",
        returnTo: "/kalkulation/nachtraege",
        ts: new Date().toISOString(),
        nachtragId: editDraft.id,
        initialDraft: {
          id: "",
          posNr: String(editDraft.posNr || ""),
          kurztext: String(editDraft.kurztext || ""),
          langtext: String(editDraft.langtext || ""),
          einheit: String(editDraft.einheit || "m"),
          menge: Math.max(Math.abs(n(editDraft.mengeDelta)), 1),
          preis: n(editDraft.preis),
        },
      }));
    } catch {}
    navigate("/kalkulation/rezepte");
  }

  function del(id: string) {
    const next = rows.filter((row) => row.id !== id);
    saveLocal(next);

    setSelected((s) => {
      const copy = { ...s };
      delete copy[id];
      return copy;
    });

    setInfo("");
  }

  function duplicate(row: NachtragRow) {
    add({
      ...row,
      id: undefined,
      status: "Entwurf",
      begruendung: `${row.begruendung || ""}`.trim()
    });
  }

  function delSelected() {
    const ids = Object.keys(selected).filter((k) => selected[k]);
    if (!ids.length) return;
    if (!confirm(`${ids.length} Nachtrag/Nachträge löschen?`)) return;

    const next = rows.filter((row) => !ids.includes(row.id));

    saveLocal(next);
    setSelected({});
    setInfo("");
  }

  function clearAll() {
    if (!confirm("Alle Nachträge löschen?")) return;

    clearExtRows(pid);
    setRows([]);
    setSelected({});
    setInfo("");
  }

  function updateDraftRow(index: number, patch: Partial<NachtragDraftRow>) {
    if (!draft) return;

    const nextRows = Array.isArray(draft.rows) ? [...draft.rows] : [];
    if (!nextRows[index]) return;

    nextRows[index] = { ...nextRows[index], ...patch };
    setDraft({ ...draft, rows: nextRows });
  }

  function updateRecipeRow(index: number, patch: Partial<KalkulationHandoffRow>) {
    if (!recipeDraft) return;

    const nextRows = Array.isArray(recipeDraft.rows) ? [...recipeDraft.rows] : [];
    if (!nextRows[index]) return;

    nextRows[index] = { ...nextRows[index], ...patch };
    setRecipeDraft({ ...recipeDraft, rows: nextRows });
  }

  async function applyDraft() {
    if (!draftRows.length) {
      setDraftOpen(false);
      setDraft(null);
      return;
    }

    const selectedIndexes = Object.keys(draftSel).
    map((key) => Number(key)).
    filter((i) => draftSel[i]);

    if (!selectedIndexes.length) {
      setDraftOpen(false);
      return;
    }

    const imported = selectedIndexes.
    map((i) => draftRows[i]).
    map((row) => {
      const posNr = String(row.posNr || row.pos || "").trim();

      const kurztext =
      String(row.kurztext || row.title || "").trim() || (
      posNr ? `Nachtrag zu ${posNr}` : "");

      const langtext = String(row.langtext || "").trim();
      const einheit = String(row.einheit || row.unit || "m").trim() || "m";
      const mengeDelta = n(row.mengeDelta ?? row.qty);
      const preis = n(row.preis);

      const begruendung = String(
        row.begruendung || row.note || row.hint || "aus Regiebericht"
      ).trim();

      if (!posNr && !kurztext) return null;

      return normalizeRow({
        id: `REGIE-${String(row.regieRowId || safeId())}`,
        posNr,
        kurztext,
        langtext,
        einheit,
        mengeDelta,
        preis,
        status: "Entwurf",
        begruendung
      });
    }).
    filter(Boolean) as NachtragRow[];

    if (!imported.length) {
      setDraftOpen(false);
      return;
    }

    const merged = mergeByPosNrKeepExisting(rows, imported);

    saveLocal(merged);
    setSelected({});

    try {
      localStorage.removeItem(NACHTRAG_BUFFER_KEY);
      setDraftOpen(false);
      setDraft(null);
      setInfo(draft?.source === "AUTO_KI" ? "AutoKI-Entwurf wurde in Nachträge übernommen." : "Regie-Entwurf wurde in Nachträge übernommen.");

      const url = new URL(window.location.href);
      url.searchParams.delete("from");
      url.searchParams.delete("projectId");
      window.history.replaceState({}, "", url.toString());
    } catch {


      //
    }}
  function applyRecipeDraft() {
    if (!recipeDraft || !recipeRows.length) {
      setRecipeOpen(false);
      setRecipeDraft(null);
      return;
    }

    const selectedIndexes = Object.keys(recipeSel).
    map((key) => Number(key)).
    filter((i) => recipeSel[i]);

    if (!selectedIndexes.length) {
      setRecipeOpen(false);
      return;
    }

    const selectedHandoff: KalkulationHandoff = {
      ...recipeDraft,
      rows: selectedIndexes.map((i) => recipeRows[i]).filter(Boolean)
    };

    const imported = mapHandoffRowsToNachtraege(selectedHandoff);

    if (!imported.length) {
      setRecipeOpen(false);
      return;
    }

    const merged = mergeByIdKeepExisting(rows, imported);

    saveLocal(merged);
    setSelected({});
    setRecipeOpen(false);
    setRecipeDraft(null);
    setInfo(`${imported.length} Position(en) aus Rezept / Urkalkulation übernommen.`);

    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("from");
      window.history.replaceState({}, "", url.toString());
    } catch {


      //
    }}
  function discardDraft() {
    if (!confirm("Regie-Entwurf verwerfen?")) return;

    try {
      localStorage.removeItem(NACHTRAG_BUFFER_KEY);
    } catch {


      //
    }setDraftOpen(false);
    setDraft(null);
  }

  function discardRecipeDraft() {
    if (!confirm("Rezept-/Urkalkulations-Entwurf verwerfen?")) return;

    setRecipeOpen(false);
    setRecipeDraft(null);
  }

  function importCSV(text: string) {
    const parsed = parseCsv(text);

    if (!parsed.length) {
      setInfo("CSV Import: keine gültigen Zeilen gefunden.");
      return;
    }

    const next = [...parsed, ...rows];

    saveLocal(next);
    setInfo(`${parsed.length} Nachtragsposition(en) aus CSV importiert.`);
  }

  function pasteRows() {
    const example = `PosNr;Kurztext;Langtext;Einheit;DeltaMenge;EP (netto);Status;Begründung
03.0005;"Mehrlänge Speedpipe";"Zusätzliche Trassenlänge inkl. Nebenarbeiten";m;85;36.5;Entwurf;"Auftraggeber wünscht zusätzliche Trasse"`;

    const text = prompt(
      "Zeilen einfügen (CSV mit ; – Kopfzeile erlaubt):",
      example
    );

    if (!text) return;

    importCSV(text);
  }

  function exportCSV() {
    const lines = [
    "PosNr;Kurztext;Langtext;Einheit;DeltaMenge;EP (netto);Status;Begründung",
    ...viewRows.map((row) =>
    [
    row.posNr || "",
    csvCell(row.kurztext || ""),
    csvCell(row.langtext || ""),
    row.einheit || "",
    String(n(row.mengeDelta)),
    String(n(row.preis)),
    String(row.status || "Entwurf"),
    csvCell(row.begruendung || "")].
    join(";")
    )].
    join("\n");

    const blob = new Blob([lines], { type: "text/csv;charset=utf-8" });
    const fileName = "nachtraege.csv";
    downloadBlob(blob, fileName);

    const dmsProjectId = String(currentProject?.id || "").trim();
    if (dmsProjectId) {
      void import("../../lib/dmsArchive")
        .then(({ archiveWebFile }) => archiveWebFile(dmsProjectId, fileName, blob))
        .catch((error) => console.warn("[nachtraege:csv:dms]", error));
    }
  }

  function openAngebotWithRows(sourceRows: NachtragRow[], modeLabel: string) {
    const cleanRows = sourceRows.map(normalizeRow);

    if (!cleanRows.length) {
      alert("Bitte zuerst mindestens einen Nachtrag auswählen oder erfassen.");
      return;
    }

    const buffer: AngebotNachtragOnlyBuffer = {
      version: "nachtrag-only-v1",
      ts: Date.now(),
      source: "nachtraege",
      projectKey: apiKey,
      projectTitle: projectTitle(currentProject),
      mwst: n(mwst, 19),
      rows: cleanRows
    };

    localStorage.setItem(ANGEBOT_NACHTRAG_ONLY_KEY, JSON.stringify(buffer));
    setInfo(`${cleanRows.length} Nachtrag/Nachträge für Angebot vorbereitet (${modeLabel}).`);
    navigate("/kalkulation/angebot?mode=nachtrag-only&from=nachtraege");
  }

  function openAngebotFromSelection() {
    openAngebotWithRows(selectedRows, "Auswahl");
  }

  function openAngebotFromAllNachtraege() {
    openAngebotWithRows(rows, "alle Nachträge");
  }

  async function exportPDF() {
    let preview: PdfPreviewWindow = null;

    try {
      const projectCode = String(
        currentProject?.code ||
        currentProject?.number ||
        currentProject?.projektnummer ||
        apiKey ||
        "Projekt"
      ).trim();

      const projectName = String(
        currentProject?.name || currentProject?.projectName || ""
      ).trim();

      const pdfFileName = `Nachtraege_${safeFileName(projectCode)}.pdf`;
      preview = reservePdfPreview(pdfFileName);

      const projectPlace = String(
        currentProject?.place ||
        currentProject?.ort ||
        currentProject?.location ||
        ""
      ).trim();

      const payload = {
        title: "Nachträge",
        project: {
          id: currentProject?.id || "",
          code: projectCode,
          number: projectCode,
          name: projectName,
          location: projectPlace
        },
        options: {
          mwst,
          dateISO: new Date().toISOString().slice(0, 10),
          payment:
          "Zahlungsbedingungen: 30 Tage netto. Nachträge vorbehaltlich Prüfung und Beauftragung."
        },
        rows: viewRows.map((row) => ({
          id: row.id,
          posNr: row.posNr,
          kurztext: row.kurztext,
          text: row.kurztext,
          langtext: row.langtext,
          einheit: row.einheit,
          unit: row.einheit,
          menge: n(row.mengeDelta),
          qty: n(row.mengeDelta),
          preis: n(row.preis),
          ep: n(row.preis),
          status: row.status || "Entwurf",
          begruendung: row.begruendung || "",
          note: row.begruendung || "",
          zeilen: round2(n(row.mengeDelta) * n(row.preis)),
          total: round2(n(row.mengeDelta) * n(row.preis)),

          materialCost: n(row.materialCost),
          laborCost: n(row.laborCost),
          machineCost: n(row.machineCost),
          subcontractorCost: n(row.subcontractorCost),
          disposalCost: n(row.disposalCost),
          transportCost: n(row.transportCost),
          overheadCost: n(row.overheadCost),
          riskCost: n(row.riskCost),
          profitCost: n(row.profitCost),

          baseUnitPrice: n(row.baseUnitPrice),
          suggestedUnitPrice: n(row.suggestedUnitPrice),
          finalUnitPrice: n(row.finalUnitPrice),

          riskLevel: row.riskLevel || "",
          calculationStatus: row.calculationStatus || "",

          gewerk: row.gewerk || "",
          leistungsart: row.leistungsart || "",
          bauverfahren: row.bauverfahren || "",

          warning: row.warning || "",
          aiReason: row.aiReason || "",
          priceBreakdown: Array.isArray(row.priceBreakdown) ? row.priceBreakdown : []
        })),
        totals: {
          netto: totals.netto,
          mwst,
          steuer: round2(totals.netto * (n(mwst) / 100)),
          brutto: totals.brutto
        }
      };

      const res = await fetch(apiUrl("/api/pdf/nachtraege"), {
        method: "POST",
        credentials: "include",
        headers: withAuthHeaders({
          "Content-Type": "application/json"
        }),
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `PDF Fehler (${res.status})`);
      }

      const blob = await res.blob();
      openPdfBlobPreview(blob, pdfFileName, preview);
    } catch (e: any) {
      if (preview && !preview.closed) preview.close();
      alert(`PDF Export fehlgeschlagen: ${e?.message || e}`);
    }
  }

  function applyNachtragKiFilter(filter: NachtragQualityFilter) {
    setQualityFilter(filter);

    if (
    filter === "Entwurf" ||
    filter === "Abgegeben" ||
    filter === "Beauftragt" ||
    filter === "Abgelehnt")
    {
      setFilterStatus(filter);
    } else {
      setFilterStatus("Alle");
    }

    setInfo(`KI-Filter aktiviert: ${filter}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function completeMissingNachtragData() {
    const next = rows.map((row) => {
      const patch: Partial<NachtragRow> = {};

      if (!String(row.einheit || "").trim()) patch.einheit = "m";

      if (!String(row.begruendung || "").trim()) {
        patch.begruendung =
        "Automatisch ergänzt: Begründung muss fachlich geprüft werden.";
      }

      if (!String(row.kurztext || "").trim()) {
        patch.kurztext = row.posNr ? `Nachtrag zu ${row.posNr}` : "Nachtrag";
      }

      return normalizeRow({ ...row, ...patch });
    });

    saveLocal(next);
    setRows(next);
    setInfo("Fehlende Nachtragsdaten automatisch ergänzt. Bitte fachlich prüfen.");
  }

  useEffect(() => {
    function handleNachtraegeCommand(event: Event) {
      const detail = (event as CustomEvent<{filter?: string;action?: string;}>).detail;
      if (!detail) return;

      const filter = String(detail.filter || "") as NachtragQualityFilter;
      const action = String(detail.action || "");

      if (filter) applyNachtragKiFilter(filter);

      if (action === "completeMissing") completeMissingNachtragData();
      if (action === "angebotAuswahl") openAngebotFromSelection();
      if (action === "angebotAlle") openAngebotFromAllNachtraege();
      if (action === "pdfExport") void exportPDF();
      if (action === "serverSpeichern") void saveServerNow();
    }

    window.addEventListener("rlc:nachtraege-command", handleNachtraegeCommand);

    return () => {
      window.removeEventListener("rlc:nachtraege-command", handleNachtraegeCommand);
    };
  });

  return (
    <div className={rlcClass(null, page)}>
      <section className={rlcClass("rlc-page-hero", heroCard)}>
        <div>
          <div className={rlcClass(null, eyebrow)}>RLC Elite Nachtragsmanagement</div>
          <h1 className={rlcClass(null, title)}>Nachträge erstellen</h1>
          <p className={rlcClass(null, subtitle)}>
            Nachträge professionell erfassen, aus Regie oder Urkalkulation übernehmen,
            dokumentieren, lokal bearbeiten, als PDF ausgeben und bei Bedarf serverseitig speichern.
          </p>
        </div>

        <div className={rlcClass(null, heroActions)}>
          <button className={rlcClass(null, btnPrimary)} onClick={createManualNachtrag}>
            Nachtrag erstellen
          </button>

          <button className={rlcClass(null, btnSecondary)} onClick={addFromKalkulationBasis}>
            Aus LV übernehmen
          </button>

          {recipeDraft ? (
            <button className={rlcClass(null, btnSecondary)} onClick={() => setRecipeOpen(!recipeOpen)}>
              Rezept prüfen / übernehmen
            </button>
          ) : null}
        </div>

        <div className={rlcClass(null, heroMeta)}>
          Projekt: <b>{projectTitle(currentProject)}</b>
          <span> · Server-Key: </span>
          <b>{apiKey || "—"}</b>
          <span> · Modus: lokal zuerst, Server manuell</span>
          {kalkulationBasis.length ?
          <span>
              {" "}· Kalkulationsbasis: <b>{kalkulationBasis.length}</b> Pos. /{" "}
              <b>{money(kalkulationBasisNetto)}</b>
            </span> :

          <span> · Keine RLC-KI Kalkulationsbasis geladen</span>
          }
        </div>
      </section>

      {info ? <div className={rlcClass(null, alertBox(info))}>{info}</div> : null}

      {recipeDraft ?
      <section className={rlcClass(null, recipeCard)}>
          <div>
            <b>Rezept-/Urkalkulations-Entwurf vorhanden</b>
            <div className={rlcClass(null, muted)}>
              Quelle: {recipeDraft.source || "rezepte"} · Zeilen: {recipeRows.length}
              {recipeDraft.auftragName ? ` · Auftrag: ${recipeDraft.auftragName}` : ""}
            </div>
          </div>

          <div className={rlcClass(null, buttonRow)}>
            <button className={rlcClass(null, btnSecondary)} onClick={() => setRecipeOpen(!recipeOpen)}>
              Prüfen / bearbeiten
            </button>

            <button className={rlcClass(null, btnPrimary)} onClick={applyRecipeDraft}>
              In Nachträge übernehmen
            </button>

            <button className={rlcClass(null, btnDanger)} onClick={discardRecipeDraft}>
              Verwerfen
            </button>
          </div>
        </section> :
      null}

      {recipeDraft && recipeOpen ?
      <section className={rlcClass(null, card)}>
          <div className={rlcClass(null, sectionHead)}>
            <div>
              <h2 className={rlcClass(null, sectionTitle)}>Rezept / Urkalkulation übernehmen</h2>
              <div className={rlcClass(null, sectionText)}>
                Diese Positionen kommen aus der Rezeptkalkulation und werden erst nach
                „Übernehmen“ als Nachträge gespeichert.
              </div>
            </div>

            <div className={rlcClass(null, buttonRow)}>
              <button className={rlcClass(null,
            btnSecondary)}
            onClick={() => {
              const s: Record<number, boolean> = {};
              recipeRows.forEach((_, i) => {
                s[i] = true;
              });
              setRecipeSel(s);
            }}>
              
                Alles auswählen
              </button>

              <button className={rlcClass(null, btnSecondary)} onClick={() => setRecipeSel({})}>
                Alles abwählen
              </button>

              <button className={rlcClass(null, btnPrimary)} onClick={applyRecipeDraft}>
                Übernehmen
              </button>
            </div>
          </div>

          <div className={rlcClass(null, tableWrap)}>
            <table className={rlcClass(null, { ...table, minWidth: 1320 })}>
              <thead>
                <tr>
                  <th className={rlcClass("rlc-row-th", thSmall)}></th>
                  <th className={rlcClass("rlc-row-th", th)}>PosNr</th>
                  <th className={rlcClass("rlc-row-th", th)}>Kurztext</th>
                  <th className={rlcClass("rlc-row-th", th)}>Langtext</th>
                  <th className={rlcClass("rlc-row-th", th)}>ME</th>
                  <th className={rlcClass("rlc-row-th rlc-row-th--right", thRight)}>Menge</th>
                  <th className={rlcClass("rlc-row-th rlc-row-th--right", thRight)}>EP netto</th>
                  <th className={rlcClass("rlc-row-th", th)}>Begründung</th>
                </tr>
              </thead>

              <tbody>
                {recipeRows.map((row, index) => {
                const posNr = String(row.posNr || row.pos || "");
                const kurztext = String(row.kurztext || row.title || "");
                const langtext = String(row.langtext || "");
                const einheit = String(row.einheit || row.unit || "m");
                const menge = n(row.mengeDelta ?? row.menge ?? row.qty);
                const preis = n(
                  row.preis ??
                  row.ep ??
                  row.finalUnitPrice ??
                  row.suggestedUnitPrice ??
                  row.baseUnitPrice
                );

                const begruendung = String(
                  row.warning ||
                  row.aiReason ||
                  "Aus Rezept / Urkalkulation übernommen."
                );

                return (
                  <tr key={index}>
                      <td className={rlcClass("rlc-row-td", tdCenter)}>
                        <input
                        type="checkbox"
                        checked={!!recipeSel[index]}
                        onChange={(e) =>
                        setRecipeSel((s) => ({
                          ...s,
                          [index]: e.target.checked
                        }))
                        } />
                      
                      </td>

                      <td className={rlcClass("rlc-row-td", td)}>
                        <input className={rlcClass(null,
                      cellInput)}
                      value={posNr}
                      onChange={(e) =>
                      updateRecipeRow(index, { posNr: e.target.value })
                      } />
                      
                      </td>

                      <td className={rlcClass("rlc-row-td", td)}>
                        <input className={rlcClass(null,
                      cellInput)}
                      value={kurztext}
                      onChange={(e) =>
                      updateRecipeRow(index, { kurztext: e.target.value })
                      } />
                      
                      </td>

                      <td className={rlcClass("rlc-row-td", td)}>
                        <textarea className={rlcClass(null,
                      cellTextarea)}
                      value={langtext}
                      onChange={(e) =>
                      updateRecipeRow(index, { langtext: e.target.value })
                      } />
                      
                      </td>

                      <td className={rlcClass("rlc-row-td", td)}>
                        <input className={rlcClass(null,
                      { ...cellInput, width: 70 })}
                      value={einheit}
                      onChange={(e) =>
                      updateRecipeRow(index, { einheit: e.target.value })
                      } />
                      
                      </td>

                      <td className={rlcClass("rlc-row-td rlc-row-td--right", tdRight)}>
                        <input
                        type="number" className={rlcClass(null,
                        { ...cellInput, width: 100, textAlign: "right" })}
                        value={menge}
                        onChange={(e) =>
                        updateRecipeRow(index, {
                          menge: n(e.target.value)
                        })
                        } />
                      
                      </td>

                      <td className={rlcClass("rlc-row-td rlc-row-td--right", tdRight)}>
                        <input
                        type="number" className={rlcClass(null,
                        { ...cellInput, width: 100, textAlign: "right" })}
                        value={preis}
                        onChange={(e) =>
                        updateRecipeRow(index, {
                          preis: n(e.target.value)
                        })
                        } />
                      
                      </td>

                      <td className={rlcClass("rlc-row-td", td)}>
                        <textarea className={rlcClass(null,
                      cellTextarea)}
                      value={begruendung}
                      onChange={(e) =>
                      updateRecipeRow(index, {
                        warning: e.target.value
                      })
                      } />
                      
                      </td>
                    </tr>);

              })}

                {!recipeRows.length ?
              <tr>
                    <td colSpan={8} className={rlcClass(null, emptyCell)}>
                      Keine Rezept-Zeilen vorhanden.
                    </td>
                  </tr> :
              null}
              </tbody>
            </table>
          </div>
        </section> :
      null}

      {draft ?
      <section className={rlcClass(null, draftCard)}>
          <div>
            <b>Regie-Entwurf vorhanden</b>
            <div className={rlcClass(null, muted)}>
              Quelle: {draft.source || "REGIE"} · Zeilen: {draftRows.length}
            </div>
          </div>

          <div className={rlcClass(null, buttonRow)}>
            <button className={rlcClass(null, btnSecondary)} onClick={() => setDraftOpen(!draftOpen)}>
              Prüfen / bearbeiten
            </button>

            <button className={rlcClass(null, btnPrimary)} onClick={() => void applyDraft()}>
              In Nachträge übernehmen
            </button>

            <button className={rlcClass(null, btnDanger)} onClick={discardDraft}>
              Verwerfen
            </button>
          </div>
        </section> :
      null}

      {draft && draftOpen ?
      <section className={rlcClass(null, card)}>
          <div className={rlcClass(null, sectionHead)}>
            <div>
              <h2 className={rlcClass(null, sectionTitle)}>Regie-Entwurf bearbeiten</h2>
              <div className={rlcClass(null, sectionText)}>
                Erst nach „Übernehmen“ werden diese Zeilen als Nachträge gespeichert.
              </div>
            </div>

            <div className={rlcClass(null, buttonRow)}>
              <button className={rlcClass(null,
            btnSecondary)}
            onClick={() => {
              const s: Record<number, boolean> = {};
              draftRows.forEach((_, i) => {
                s[i] = true;
              });
              setDraftSel(s);
            }}>
              
                Alles auswählen
              </button>

              <button className={rlcClass(null, btnSecondary)} onClick={() => setDraftSel({})}>
                Alles abwählen
              </button>

              <button className={rlcClass(null, btnPrimary)} onClick={() => void applyDraft()}>
                Übernehmen
              </button>
            </div>
          </div>

          <div className={rlcClass(null, tableWrap)}>
            <table className={rlcClass(null, { ...table, minWidth: 1250 })}>
              <thead>
                <tr>
                  <th className={rlcClass("rlc-row-th", thSmall)}></th>
                  <th className={rlcClass("rlc-row-th", th)}>PosNr</th>
                  <th className={rlcClass("rlc-row-th", th)}>Kurztext</th>
                  <th className={rlcClass("rlc-row-th", th)}>Langtext</th>
                  <th className={rlcClass("rlc-row-th", th)}>ME</th>
                  <th className={rlcClass("rlc-row-th rlc-row-th--right", thRight)}>Δ-Menge</th>
                  <th className={rlcClass("rlc-row-th", th)}>Begründung</th>
                </tr>
              </thead>

              <tbody>
                {draftRows.map((row, index) => {
                const posNr = String(row.posNr || row.pos || "");
                const kurztext = String(row.kurztext || row.title || "");
                const langtext = String(row.langtext || "");
                const einheit = String(row.einheit || row.unit || "m");
                const mengeDelta = n(row.mengeDelta ?? row.qty);
                const begruendung = String(row.begruendung || row.note || row.hint || "");

                return (
                  <tr key={index}>
                      <td className={rlcClass(null, tdCenter)}>
                        <input
                        type="checkbox"
                        checked={!!draftSel[index]}
                        onChange={(e) =>
                        setDraftSel((s) => ({
                          ...s,
                          [index]: e.target.checked
                        }))
                        } />
                      
                      </td>

                      <td className={rlcClass(null, td)}>
                        <input className={rlcClass(null,
                      cellInput)}
                      value={posNr}
                      onChange={(e) =>
                      updateDraftRow(index, { posNr: e.target.value })
                      } />
                      
                      </td>

                      <td className={rlcClass(null, td)}>
                        <input className={rlcClass(null,
                      cellInput)}
                      value={kurztext}
                      onChange={(e) =>
                      updateDraftRow(index, { kurztext: e.target.value })
                      } />
                      
                      </td>

                      <td className={rlcClass(null, td)}>
                        <textarea className={rlcClass(null,
                      cellTextarea)}
                      value={langtext}
                      onChange={(e) =>
                      updateDraftRow(index, { langtext: e.target.value })
                      } />
                      
                      </td>

                      <td className={rlcClass(null, td)}>
                        <input className={rlcClass(null,
                      { ...cellInput, width: 70 })}
                      value={einheit}
                      onChange={(e) =>
                      updateDraftRow(index, { einheit: e.target.value })
                      } />
                      
                      </td>

                      <td className={rlcClass("rlc-row-td rlc-row-td--right", tdRight)}>
                        <input
                        type="number" className={rlcClass(null,
                        { ...cellInput, width: 100, textAlign: "right" })}
                        value={mengeDelta}
                        onChange={(e) =>
                        updateDraftRow(index, {
                          mengeDelta: n(e.target.value)
                        })
                        } />
                      
                      </td>

                      <td className={rlcClass(null, td)}>
                        <input className={rlcClass(null,
                      cellInput)}
                      value={begruendung}
                      onChange={(e) =>
                      updateDraftRow(index, {
                        begruendung: e.target.value
                      })
                      } />
                      
                      </td>
                    </tr>);

              })}

                {!draftRows.length ?
              <tr>
                    <td colSpan={7} className={rlcClass(null, emptyCell)}>
                      Keine Draft-Zeilen vorhanden.
                    </td>
                  </tr> :
              null}
              </tbody>
            </table>
          </div>
        </section> :
      null}

      <section className={rlcClass(null, grid4)}>
        <KpiCard label="Netto gesamt" value={money(totals.netto)} />
        <KpiCard label="Brutto gesamt" value={money(totals.brutto)} />
        <KpiCard
          label="Nachträge"
          value={String(totals.count)}
          sub={`${totals.offen} Entwurf`} />
        
        <KpiCard
          label="Kalkulationsbasis"
          value={String(kalkulationBasis.length)}
          sub={`${money(kalkulationBasisNetto)} RLC-KI`} />
        
      </section>

      <section className={rlcClass(null, card)}>
        <div className={rlcClass(null, sectionHead)}>
          <div>
            <h2 className={rlcClass(null, sectionTitle)}>Steuerung & Export</h2>
            <div className={rlcClass(null, sectionText)}>
              Suche, Statusfilter, CSV/PDF-Export, Angebot-Übergabe und Server-Synchronisierung.
            </div>
          </div>
        </div>

        <div className={rlcClass(null, toolbarGrid)}>
          <input
            placeholder="Suchen… PosNr / Kurztext / Langtext / Begründung"
            value={q}
            onChange={(e) => setQ(e.target.value)} className={rlcClass(null,
            input)} />
          

          <select
            value={filterStatus}
            onChange={(e) =>
            setFilterStatus(e.target.value as ChangeStatus | "Alle")
            } className={rlcClass(null,
            input)}>
            
            <option>Alle</option>
            {STATI.map((s) =>
            <option key={s}>{s}</option>
            )}
          </select>

          <select
            value={sortKey}
            onChange={(e) =>
            setSortKey(e.target.value as "pos" | "status" | "value")
            } className={rlcClass(null,
            input)}>
            
            <option value="pos">Sortierung: Position</option>
            <option value="status">Sortierung: Status</option>
            <option value="value">Sortierung: Wert</option>
          </select>

          <input
            type="number"
            value={mwst}
            onChange={(e) => setMwst(n(e.target.value))} className={rlcClass(null,
            input)}
            placeholder="MwSt %" />
          
        </div>

        <div className={rlcClass(null, buttonRow)}>
          <button className={rlcClass(null, btnSecondary)} onClick={() => fileRef.current?.click()}>
            CSV Import
          </button>

          <button className={rlcClass(null, btnSecondary)} onClick={pasteRows}>
            Zeilen einfügen
          </button>

          <button className={rlcClass(null, btnSecondary)} onClick={exportCSV}>
            CSV Export
          </button>

          <button className={rlcClass(null, btnSecondary)} onClick={() => void exportPDF()}>
            PDF Export
          </button>

          <button className={rlcClass(null, btnSecondary)} onClick={openGaebExport} disabled={!rows.length}>
            GAEB Export
          </button>

          <button className={rlcClass(null,
          btnPrimary)}
          onClick={openAngebotFromSelection}
          disabled={!selectedRows.length}>
            
            Angebot aus Auswahl
          </button>

          <button className={rlcClass(null,
          btnSecondary)}
          onClick={openAngebotFromAllNachtraege}
          disabled={!rows.length}>
            
            Angebot alle Nachträge
          </button>

          <button className={rlcClass(null, btnSecondary)} onClick={() => navigate("/kalkulation/angebot")}>
            Angebot öffnen
          </button>

          <button className={rlcClass(null, btnSecondary)} onClick={() => void load()} disabled={loading}>
            {loading ? "Lädt…" : "Server laden"}
          </button>

          <button className={rlcClass(null,
          btnSecondary)}
          onClick={() => void saveServerNow()}
          disabled={loading || rows.length === 0}>
            
            Server speichern
          </button>

          <button className={rlcClass(null,
          btnDanger)}
          onClick={delSelected}
          disabled={!Object.values(selected).some(Boolean)}>
            
            Auswahl löschen
          </button>

          <button className={rlcClass(null, btnDanger)} onClick={clearAll}>
            Alles löschen
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv"

          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
              importCSV(String(reader.result || ""));
              if (fileRef.current) fileRef.current.value = "";
            };
            reader.readAsText(file, "utf-8");
          }} className="rlc-migrated-pages-kalkulation-nachtraege-tsx-918" />
        
      </section>

      <section className={rlcClass(null, card)}>
        <div className={rlcClass(null, sectionHead)}>
          <div>
            <h2 className={rlcClass(null, sectionTitle)}>Nachtragspositionen</h2>
            <div className={rlcClass(null, sectionText)}>
              Änderungen werden sofort lokal gespeichert. Der Server wird erst mit
              „Server speichern“ aktualisiert.
            </div>
          </div>
        </div>

        <div className={rlcClass(null, tableWrap)}>
          <table className={rlcClass("rlc-row-table", table)}>
            <colgroup>
              <col style={{ width: "3%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "34%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "7%" }} />
            </colgroup>
            <thead>
              <tr>
                <th className={rlcClass("rlc-row-th", thSmall)}></th>
                <th className={rlcClass("rlc-row-th", th)}>Pos.</th>
                <th className={rlcClass("rlc-row-th", th)}>Kurztext</th>
                <th className={rlcClass("rlc-row-th", th)}>ME</th>
                <th className={rlcClass("rlc-row-th rlc-row-th--right", thRight)}>Δ-Menge</th>
                <th className={rlcClass("rlc-row-th rlc-row-th--right", thRight)}>EP netto</th>
                <th className={rlcClass("rlc-row-th", th)}>Status</th>
                <th className={rlcClass("rlc-row-th", th)}>Begründung</th>
                <th className={rlcClass("rlc-row-th rlc-row-th--right", thRight)}>Zeilen-Netto</th>
                <th className={rlcClass("rlc-row-th", th)}>Aktion</th>
              </tr>
            </thead>

            <tbody>
              {viewRows.map((row, index) => {
                const isSelected = !!selected[row.id];
                const total = n(row.mengeDelta) * n(row.preis);

                return (
                  <tr key={row.id}
                    className={rlcClass(isSelected ? "rlc-row rlc-row--selected" : "rlc-row", {
                      background: isSelected ? "#EAF2FF" : index % 2 ? "#FCFCFC" : "#FFFFFF"
                    })}>
                    <td className={rlcClass("rlc-row-td", tdCenter)}>
                      <input type="checkbox" checked={isSelected}
                        onChange={(e) => setSelected((state) => ({ ...state, [row.id]: e.target.checked }))} />
                    </td>
                    <td className={rlcClass("rlc-row-td", td)}>{row.posNr || "—"}</td>
                    <td className={rlcClass("rlc-row-td", td)}>
                      <div className={rlcClass(null, textCell)}>
                        <strong>{row.kurztext || "—"}</strong>
                        {row.langtext?.trim() ? <div className={rlcClass("rlc-row-lang-preview", langPreview)}>
                          {row.langtext.slice(0, 135)}{row.langtext.length > 135 ? "…" : ""}
                        </div> : null}
                        <button type="button" className={rlcClass("rlc-row-action", btnTextMini)}
                          onClick={() => showNachtragLangtextModal([
                            `Position: ${row.posNr || "—"}`,
                            `Kurztext: ${row.kurztext || "—"}`, "", "Langtext:", row.langtext || "—", "",
                            `Menge: ${n(row.mengeDelta)} ${row.einheit || "EH"}`,
                            `EP netto: ${money(row.preis)}`,
                            `Zeilen-Netto: ${money(total)}`
                          ].join("\\n"))}>Langtext / Summe</button>
                      </div>
                    </td>
                    <td className={rlcClass("rlc-row-td", td)}>{row.einheit || "—"}</td>
                    <td className={rlcClass("rlc-row-td rlc-row-td--right", tdRight)}><strong>{n(row.mengeDelta).toLocaleString("de-DE")}</strong></td>
                    <td className={rlcClass("rlc-row-td rlc-row-td--right", tdRight)}><strong>{n(row.preis).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td className={rlcClass("rlc-row-td", td)}><StatusPill status={(row.status || "Entwurf") as ChangeStatus} /></td>
                    <td className={rlcClass("rlc-row-td", td)}><span title={row.begruendung || ""}>{row.begruendung || "—"}</span></td>
                    <td className={rlcClass("rlc-row-td rlc-row-td--right", tdRight)}><strong>{money(total)}</strong></td>
                    <td className={rlcClass("rlc-row-td", td)}>
                      <div className={rlcClass(null, buttonRowCompact)}>
                        {row.status === "Beauftragt" ? <span className={rlcClass(null, muted)}>gesperrt</span> : <button className={rlcClass("rlc-row-action", btnEditMini)} onClick={() => startEdit(row)}>Bearbeiten</button>}
                        <button className={rlcClass(null, btnDuplicateMini)} onClick={() => duplicate(row)} title="Position duplizieren">⧉</button>
                        {row.status === "Beauftragt" ? null : <button className={rlcClass("rlc-row-delete", btnDeleteLink)} onClick={() => del(row.id)}>Löschen</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!viewRows.length ?
              <tr>
                  <td colSpan={10} className={rlcClass(null, emptyCell)}>
                    Noch keine Nachträge vorhanden.
                  </td>
                </tr> :
              null}
            </tbody>
          </table>
        </div>
      </section>

      {editingId && editDraft ? (
        <div className={rlcClass(null, editOverlay)} onMouseDown={(e) => { if (e.target === e.currentTarget) cancelEdit(); }}>
          <section className={rlcClass(null, editModal)}>
            <div className={rlcClass(null, editModalHead)}>
              <div>
                <div className={rlcClass(null, editEyebrow)}>NACHTRAGSPOSITION</div>
                <h2 className={rlcClass(null, editTitle)}>Position bearbeiten</h2>
                <div className={rlcClass(null, editSub)}>{editDraft.posNr || "—"} · {editDraft.kurztext || "Ohne Kurztext"}</div>
              </div>
              <button className={rlcClass(null, btnSecondary)} onClick={cancelEdit}>Schließen</button>
            </div>

            <div className={rlcClass(null, editGrid)}>
              <label className={rlcClass(null, editField)}><span>Pos.</span><input className={rlcClass(null, input)} value={editDraft.posNr || ""} onChange={(e) => updateEdit({ posNr: e.target.value })} /></label>
              <label className={rlcClass(null, editField)}><span>ME</span><input className={rlcClass(null, input)} value={editDraft.einheit || "m"} onChange={(e) => updateEdit({ einheit: e.target.value })} /></label>
              <label className={rlcClass(null, editField)}><span>Δ-Menge</span><input type="number" className={rlcClass(null, input)} value={editDraft.mengeDelta ?? 0} onChange={(e) => updateEdit({ mengeDelta: n(e.target.value) })} /></label>
              <label className={rlcClass(null, editField)}><span>EP netto</span><input type="number" className={rlcClass(null, input)} value={editDraft.preis ?? 0} onChange={(e) => updateEdit({ preis: n(e.target.value) })} /></label>
              <label className={rlcClass(null, editField)}><span>Status</span><select className={rlcClass(null, input)} value={editDraft.status || "Entwurf"} onChange={(e) => updateEdit({ status: e.target.value as ChangeStatus })}>{STATI.map((status) => <option key={status}>{status}</option>)}</select></label>
              <div className={rlcClass(null, editSummary)}><span>Zeilen-Netto</span><strong>{money(n(editDraft.mengeDelta) * n(editDraft.preis))}</strong></div>
            </div>

            <div className={rlcClass(null, editGrid)}>
              <label className={rlcClass(null, editField)}><span>Vertragsgrundlage</span><select className={rlcClass(null, input)} value={editDraft.contractBasis || ""} onChange={(e) => updateEdit({ contractBasis: (e.target.value || undefined) as NachtragRow["contractBasis"] })}><option value="">Bitte wählen</option><option value="BGB">BGB Bauvertrag (§§ 650a ff.)</option><option value="VOBB">VOB/B (vertraglich vereinbart)</option><option value="OTHER">Sonstige Grundlage</option></select></label>
              <label className={rlcClass(null, editField)}><span>Vergütungs-/Preisbasis</span><select className={rlcClass(null, input)} value={editDraft.priceBasis || ""} onChange={(e) => updateEdit({ priceBasis: (e.target.value || undefined) as NachtragRow["priceBasis"] })}><option value="">Bitte wählen</option><option value="ACTUAL_COSTS_650C">§ 650c BGB – tatsächlich erforderliche Kosten</option><option value="URKALKULATION">Urkalkulation / hinterlegte Preisansätze</option><option value="VOBB">VOB/B-Vertragsgrundlage</option><option value="OTHER">Sonstige Grundlage</option></select></label>
              <label className={rlcClass(null, editField)}><span>Status Einigung/Anordnung</span><select className={rlcClass(null, input)} value={editDraft.agreementStatus || "PENDING"} onChange={(e) => updateEdit({ agreementStatus: e.target.value as NachtragRow["agreementStatus"] })}><option value="PENDING">Einigung offen</option><option value="AGREED">Einvernehmlich vereinbart</option><option value="ORDERED">Angeordnet</option><option value="DISPUTED">Streitig</option></select></label>
              <label className={rlcClass(null, editField)}><span>Änderungsbegehren vom</span><input type="date" className={rlcClass(null, input)} value={(editDraft.changeRequestDate || "").slice(0,10)} onChange={(e) => updateEdit({ changeRequestDate: e.target.value })} /></label>
              <label className={rlcClass(null, editField)}><span>Eingang Änderungsbegehren</span><input type="date" className={rlcClass(null, input)} value={(editDraft.changeRequestReceivedAt || "").slice(0,10)} onChange={(e) => updateEdit({ changeRequestReceivedAt: e.target.value })} /></label>
              <label className={rlcClass(null, editField)}><span>BGB 30-Tage-Frist</span><input className={rlcClass(null, input)} readOnly value={editDraft.bgbAgreementDeadline ? new Date(editDraft.bgbAgreementDeadline).toLocaleDateString("de-DE") : "wird serverseitig berechnet"} /></label>
              <label className={rlcClass(null, editField)}><span>Anordnung vom</span><input type="date" className={rlcClass(null, input)} value={(editDraft.orderDate || "").slice(0,10)} onChange={(e) => updateEdit({ orderDate: e.target.value })} /></label>
              <label className={rlcClass(null, editField)}><span>Anordnungs-/Freigabereferenz</span><input className={rlcClass(null, input)} value={editDraft.orderReference || ""} onChange={(e) => updateEdit({ orderReference: e.target.value })} /></label>
              <label className={rlcClass(null, editField)} style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={Boolean(editDraft.orderTextFormConfirmed)} onChange={(e) => updateEdit({ orderTextFormConfirmed: e.target.checked })} /> Anordnung in Textform dokumentiert</label>
              <label className={rlcClass(null, editField)} style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={Boolean(editDraft.planningProvided)} onChange={(e) => updateEdit({ planningProvided: e.target.checked })} /> Erforderliche Planung liegt vor / wurde bereitgestellt</label>
            </div>

            <label className={rlcClass(null, editField)}><span>Kurztext</span><input className={rlcClass(null, input)} value={editDraft.kurztext || ""} onChange={(e) => updateEdit({ kurztext: e.target.value })} /></label>
            <label className={rlcClass(null, editField)}><span>Langtext / Leistungsbeschreibung</span><textarea className={rlcClass(null, editTextarea)} value={editDraft.langtext || ""} onChange={(e) => updateEdit({ langtext: e.target.value })} /></label>
            <label className={rlcClass(null, editField)}><span>Begründung</span><textarea className={rlcClass(null, editReason)} value={editDraft.begruendung || ""} onChange={(e) => updateEdit({ begruendung: e.target.value })} /></label>
            <label className={rlcClass(null, editField)}><span>Rechtliche / vertragliche Dokumentation</span><textarea className={rlcClass(null, editReason)} value={editDraft.legalNote || ""} onChange={(e) => updateEdit({ legalNote: e.target.value })} placeholder="z. B. Änderungsbegehren, Einigung, Anordnung, VOB/B-Vertragsbezug, Schriftverkehr" /></label>

            <div className={rlcClass(null, editFooter)}>
              <button className={rlcClass(null, btnSecondary)} onClick={cancelEdit}>Abbrechen</button>
              <button className={rlcClass(null, btnSecondary)} onClick={openEditInUrkalkulation}>Urkalkulation öffnen</button>
              <button className={rlcClass(null, btnPrimary)} onClick={commitEdit}>Speichern</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>);

}

/* ================= UI ================= */

function KpiCard({
  label,
  value,
  sub




}: {label: string;value: string;sub?: string;}) {
  return (
    <div className={rlcClass("rlc-global-kpi-card", kpiCard)}>
      <div className={rlcClass("rlc-global-kpi-label", kpiLabel)}>{label}</div>
      <div className={rlcClass("rlc-global-kpi-value", kpiValue)}>{value}</div>
      {sub ? <div className={rlcClass("rlc-global-kpi-sub", kpiSub)}>{sub}</div> : null}
    </div>);

}

function statusStyle(status: ChangeStatus): React.CSSProperties {
  if (status === "Beauftragt") return badgeOk;
  if (status === "Abgegeben") return badgeWarn;
  if (status === "Abgelehnt") return badgeCritical;
  return badgeNeutral;
}

function alertBox(text: string): React.CSSProperties {
  const lower = text.toLowerCase();

  const isOk =
  lower.includes("erfolgreich") ||
  lower.includes("gespeichert") ||
  lower.includes("lokal") ||
  lower.includes("übernommen") ||
  lower.includes("erkannt") ||
  lower.includes("angebot vorbereitet");

  if (isOk && !lower.includes("fehlgeschlagen") && !lower.includes("timeout")) {
    return alertSuccess;
  }

  return alertError;
}

/* ================= STYLES ================= */

const page: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 16
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
  maxWidth: 980,
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

const draftCard: React.CSSProperties = {
  ...card,
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#14532D",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap"
};

const recipeCard: React.CSSProperties = {
  ...card,
  border: "1px solid #BED6FF",
  background: "#EAF2FF",
  color: "#1E3A8A",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap"
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
  color: "#64748B"
};

const muted: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.8,
  marginTop: 3
};

const toolbarGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(260px,1fr) 180px 200px 120px",
  gap: 10
};

const input: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 11px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
  background: "#FFFFFF"
};

const tableWrap: React.CSSProperties = {
  overflowX: "hidden",
  border: "1px solid #E5E7EB",
  borderRadius: 12
};

const table: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  tableLayout: "fixed",
  borderCollapse: "collapse"
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "4px 3px",
  fontSize: 9.2,
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
  padding: "3px 2px",
  fontSize: 11.5,
  borderBottom: "1px solid #F1F5F9",
  verticalAlign: "middle"
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

const emptyCell: React.CSSProperties = {
  padding: 16,
  color: "#64748B",
  fontSize: 13
};

const cellInput: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
  background: "#FFFFFF",
  boxSizing: "border-box",
  width: "100%"
};

const cellTextarea: React.CSSProperties = {
  ...cellInput,
  minWidth: 260,
  minHeight: 58,
  resize: "vertical",
  fontFamily: "inherit",
  lineHeight: 1.35
};

const textCell: React.CSSProperties = { display: "grid", gap: 4, minWidth: 0 };

const langPreview: React.CSSProperties = {
  marginTop: 4,
  fontSize: 11.5,
  color: "#0F172A",
  lineHeight: 1.35,
  whiteSpace: "normal",
  overflow: "hidden",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical"
};

const btnTextMini: React.CSSProperties = {
  justifySelf: "start",
  minHeight: 26,
  border: "1px solid #93C5FD",
  background: "#EFF6FF",
  color: "#0B5BD3",
  borderRadius: 7,
  padding: "3px 8px",
  fontSize: 9.5,
  lineHeight: 1.05,
  fontWeight: 700,
  cursor: "pointer"
};


const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 5,
  flexWrap: "nowrap",
  alignItems: "center",
  marginTop: 8,
  width: "100%",
  minWidth: 0,
  overflow: "visible"
};

const buttonRowCompact: React.CSSProperties = {
  display: "flex",
  gap: 4,
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "flex-start",
  maxWidth: "100%",
  overflow: "visible"
};

const btnBase: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: "6px 8px",
  minHeight: 34,
  fontSize: 11,
  lineHeight: 1.05,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flex: "0 0 auto"
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

const btnDanger: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C"
};

const editOverlay: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 99999, background: "rgba(15,23,42,.55)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 24
};
const editModal: React.CSSProperties = {
  width: "min(980px,96vw)", maxHeight: "90vh", overflowY: "auto", background: "#FFFFFF",
  border: "1px solid #DCE4EF", borderRadius: 16, boxShadow: "0 24px 80px rgba(15,23,42,.32)", padding: 16
};
const editModalHead: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
  paddingBottom: 10, marginBottom: 12, borderBottom: "1px solid #E2E8F0"
};
const editEyebrow: React.CSSProperties = { fontSize: 9.5, fontWeight: 800, letterSpacing: ".06em", color: "#146EF5" };
const editTitle: React.CSSProperties = { margin: "2px 0", fontSize: 21, lineHeight: 1.1, color: "#0F172A" };
const editSub: React.CSSProperties = { fontSize: 11.5, color: "#64748B" };
const editGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 8, marginBottom: 8 };
const editField: React.CSSProperties = { display: "grid", gap: 4, marginBottom: 8, fontSize: 10.5, fontWeight: 700, color: "#475569" };
const editTextarea: React.CSSProperties = { ...input, minHeight: 150, resize: "vertical", lineHeight: 1.45, fontFamily: "inherit" };
const editReason: React.CSSProperties = { ...input, minHeight: 72, resize: "vertical", lineHeight: 1.4, fontFamily: "inherit" };
const editSummary: React.CSSProperties = { display: "grid", gap: 3, alignContent: "center", padding: "6px 10px", border: "1px solid #DBEAFE", background: "#EFF6FF", borderRadius: 8, fontSize: 10.5, color: "#475569" };
const editFooter: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 10, borderTop: "1px solid #E2E8F0" };

const editLangtext: React.CSSProperties = {
  width: "100%", minHeight: 68, padding: "7px 8px", border: "1px solid #CBD5E1",
  borderRadius: 8, background: "#FFFFFF", color: "#0F172A", fontSize: 11.5,
  lineHeight: 1.4, resize: "vertical", boxSizing: "border-box"
};
const btnEditMini: React.CSSProperties = { minWidth: 72 };
const btnSaveMini: React.CSSProperties = { minWidth: 68 };
const btnCancelMini: React.CSSProperties = {
  border: "1px solid #CBD5E1", background: "#FFFFFF", color: "#334155", borderRadius: 7,
  padding: "3px 7px", minHeight: 26, fontSize: 9.5, fontWeight: 700, cursor: "pointer"
};

const btnDuplicateMini: React.CSSProperties = {
  border: 0, background: "transparent", color: "#0B5BD3", cursor: "pointer",
  fontSize: 14, padding: "2px 4px", lineHeight: 1
};
const btnDeleteLink: React.CSSProperties = {
  border: 0, background: "transparent", color: "#B91C1C", cursor: "pointer",
  fontSize: 11.5, padding: "2px 0", textDecoration: "underline"
};

const btnMini: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  background: "#FFFFFF",
  color: "#0F172A",
  borderRadius: 8,
  padding: "6px 9px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer"
};

const btnDangerMini: React.CSSProperties = {
  ...btnMini,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C"
};

const alertError: React.CSSProperties = {
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: "pre-wrap"
};

const alertSuccess: React.CSSProperties = {
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#14532D",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: "pre-wrap"
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

const badgeCritical: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C"
};
