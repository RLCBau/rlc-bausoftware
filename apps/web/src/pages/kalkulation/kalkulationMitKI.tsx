// apps/web/src/pages/kalkulation/kalkulationMitKI.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useProject } from "../../store/useProject";
import { API_BASE } from "../../lib/apiBase";
import { LV, AuftragStore, type Auftrag, type LVPos } from "./store.lv";
import { Catalog, type CatalogPos } from "./catalogStore";
import {
  useKiSuggest,
  type CalcStatus,
  type EliteKalkulationResultRow,
  type RiskLevel,
} from "./useKiSuggest";
import {
  KalkulationsDatenbank,
  type KalkulationsErfahrung,
  type KalkulationsSuchTreffer,
} from "./kalkulationsDatenbank";

type PriceBreakdownGroup =
  | "Personal"
  | "Maschinen"
  | "LKW / Transport"
  | "Material"
  | "Entsorgung"
  | "Fremdleistung"
  | "Gemeinkosten"
  | "Risiko"
  | "Gewinn";

type PriceBreakdownLine = {
  id: string;
  group: PriceBreakdownGroup;
  name: string;
  unit: string;
  qty: number;
  price: number;
  total: number;
  note?: string;
};

type EliteRow = LVPos & {
  rabatt?: number;
  auftragId?: string;
  auftragName?: string;
  auftragType?: "haupt" | "unter" | string;
  originalPreKiPrice?: number;

  angebotUnitPrice?: number;
  angebotTotal?: number;

  rlcKiUnitPrice?: number;
  rlcKiTotal?: number;

  priceDifference?: number;
  priceDifferencePct?: number;

  materialCost?: number;
  laborCost?: number;
  machineCost?: number;
  subcontractorCost?: number;
  disposalCost?: number;
  overheadCost?: number;
  riskCost?: number;
  profitCost?: number;

  baseUnitPrice?: number;
  suggestedUnitPrice?: number;
  finalUnitPrice?: number;
  priceDecision?: "x84" | "rlcKi" | "manual";

  riskLevel?: RiskLevel;
  calculationStatus?: CalcStatus;

  gewerk?: string;
  leistungsart?: string;
  bauverfahren?: string;

  warning?: string;
  aiReason?: string;

  priceBreakdown?: PriceBreakdownLine[];
};

type CompanyData = {
  name: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string;
};

type ClientData = {
  name: string;
  address: string;
};

type OfferData = {
  number: string;
  place: string;
  notes: string;
};

type ViewFilter =
  | "alle"
  | "kritisch"
  | "warnungen"
  | "hochrisiko"
  | "ohneDb"
  | "sicher"
  | "mengeFehlt"
  | "preisFehlt"
  | "einheitFehlt"
  | "urkalkulationFehlt"
  | "doppelte";

type KiRowClass = "structure" | "real-position" | "incomplete" | "review";

const KI_HANDOFF_KEY = "rlc_kalkulation_ki_handoff_v1";
const HANDOFF_CONSUMED_TS_KEY = "kalkulation:kiHandoffConsumedTs";
const KALKULATION_API_BASE = "/api/kalkulation";

/* ================= HELPERS ================= */

function apiUrl(path: string): string {
  const base = String(API_BASE || "").replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  if (!base) return cleanPath;

  if (base.endsWith("/api") && cleanPath.startsWith("/api/")) {
    return `${base}${cleanPath.slice(4)}`;
  }

  return `${base}${cleanPath}`;
}

function safeFileName(value: string): string {
  return String(value || "Datei")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function localBackupKey(projectKey: string) {
  return `rlc_kalkulation_mit_ki_elite_v1:${projectKey || "NO_PROJECT"}`;
}

function getAuthToken(): string {
  try {
    const keys = [
      "token",
      "authToken",
      "accessToken",
      "rlc_token",
      "rlc_auth_token",
      "rlc_access_token",
    ];

    for (const key of keys) {
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
      }
    }
  } catch {
//
  }

  return "";
}

function authJsonHeaders(): HeadersInit {
  const token = getAuthToken();

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function n(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;

  const raw = String(value).trim();

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/\s/g, "");

  const parsed = typeof value === "number" ? value : Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function money(value: unknown): string {
  return `${n(value).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

function qty(value: unknown): string {
  return n(value).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
}

function percent(value: unknown): string {
  return `${Math.round(n(value) * 100)} %`;
}

function safeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function normText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getProjectObject(projectCtx: any): any {
  return (
    projectCtx?.project ||
    projectCtx?.currentProject ||
    projectCtx?.selectedProject ||
    projectCtx?.current ||
    projectCtx ||
    {}
  );
}

function getProjectKey(projectCtx: any): string {
  const projectObj = getProjectObject(projectCtx);

  return String(
    projectObj?.code ||
      projectObj?.projectCode ||
      projectObj?.number ||
      projectCtx?.projectCode ||
      projectObj?.id ||
      projectCtx?.projectId ||
      projectCtx?.id ||
      ""
  ).trim();
}

function getProjectTitle(projectCtx: any): string {
  const projectObj = getProjectObject(projectCtx);
  const code =
    projectObj?.code ||
    projectObj?.projectCode ||
    projectObj?.number ||
    projectObj?.id ||
    "";
  const name = projectObj?.name || projectObj?.projectName || "Projekt";

  if (!code) return "Kein Projekt gewählt";
  return `${code} — ${name}`;
}

function getChapter(posNr?: string): string {
  if (!posNr) return "—";
  const m = String(posNr).match(/^(\d{2})/);
  return m ? m[1] : "—";
}


// RLC_STRUCTURAL_TOP_LEVEL_FIX
function kiIsStructuralRow(row: Partial<EliteRow>): boolean {
  const pos = String(row.posNr || "").trim();
  const kurzRaw = String(row.kurztext || "").trim();
  const langRaw = String(row.langtext || "").trim();

  const kurz = kurzRaw.toLowerCase();
  const lang = langRaw.toLowerCase();
  const text = `${kurz} ${lang}`.replace(/\s+/g, " ").trim();

  const unit = String(row.einheit || "").trim().toLowerCase();
const gewerk = String(row.gewerk || "").trim().toLowerCase();
  const leistungsart = String(row.leistungsart || "").trim().toLowerCase();

  const hasRealText =
    kurzRaw.length >= 8 ||
    langRaw.length >= 18 ||
    /(aushub|abfuhr|verfüll|verfull|pflaster|asphalt|rohr|leitung|speedpipe|kabel|schacht|beton|schalung|bewehrung)/i.test(
      `${kurzRaw} ${langRaw}`
    );

  const pureChapter =
    /^\d{1,2}$/.test(pos) ||
    /^\d{1,2}\.0{1,3}$/.test(pos);

  const placeholder =
    /^leistung\s+zu\s+position\s+\d+/i.test(kurzRaw) ||
    /^leistung\s+zu\s+pos\.?\s*\d+/i.test(kurzRaw) ||
    /^position\s+\d+$/i.test(kurzRaw) ||
    /^leistung prüfen$/i.test(kurzRaw);

  const structuralText =
    /^titel\s*\d*$/i.test(kurzRaw) ||
    /^abschnitt\s*\d*$/i.test(kurzRaw) ||
    /^kapitel\s*\d*$/i.test(kurzRaw) ||
    /^los\s*\d*$/i.test(kurzRaw) ||
    /^bereich\s*\d*$/i.test(kurzRaw) ||
    text.includes("summe titel") ||
    text.includes("zwischensumme") ||
    text.includes("gesamtsumme") ||
    text.includes("keine kalkulatorische leistungsposition") ||
    gewerk.includes("gliederung") ||
    leistungsart.includes("struktur");

  if (structuralText) return true;
  if (pureChapter && !hasRealText) return true;
  if (placeholder && !hasRealText && n(row.menge) <= 0) return true;

  if ((unit === "ps" || unit === "pauschal") && pureChapter && !hasRealText) {
    return true;
  }

  return false;
}

function kiPrepareStructuralRow(row: Partial<EliteRow>): Partial<EliteRow> {
  return {
    ...row,
    menge: 0,
    preis: 0,
    gesamt: 0,

    materialCost: 0,
    laborCost: 0,
    machineCost: 0,
    subcontractorCost: 0,
    disposalCost: 0,
    overheadCost: 0,
    riskCost: 0,
    profitCost: 0,

    baseUnitPrice: 0,
    suggestedUnitPrice: 0,
    finalUnitPrice: 0,

    priceBreakdown: [],
    confidence: 1,
    riskLevel: "low",
    calculationStatus: "ok",
    warning: "",
    aiReason: "Titel-/Gliederungsposition: Keine kalkulatorische Leistungsposition.",
  };
}

/* ================= PRICE BREAKDOWN ================= */

function normalizeBreakdownLine(line: Partial<PriceBreakdownLine>): PriceBreakdownLine {
  const qtyValue = n(line.qty, 1);
  const priceValue = n(line.price);
  const totalValue =
    line.total !== undefined && line.total !== null
      ? n(line.total)
      : round2(qtyValue * priceValue);

  return {
    id: String(line.id || safeId()),
    group: (line.group || "Material") as PriceBreakdownGroup,
    name: String(line.name || "Kostenansatz"),
    unit: String(line.unit || "EH"),
    qty: qtyValue,
    price: priceValue,
    total: round2(totalValue),
    note: String(line.note || ""),
  };
}

function normalizeBreakdown(lines: unknown): PriceBreakdownLine[] {
  if (!Array.isArray(lines)) return [];
  return lines.map((x) => normalizeBreakdownLine(x));
}

function sumBreakdown(lines: PriceBreakdownLine[] | undefined): number {
  if (!Array.isArray(lines)) return 0;
  return round2(lines.reduce((sum, line) => sum + n(line.total), 0));
}

function getUnitPrice(row: EliteRow): number {
  const decision = String((row as any).priceDecision || "").trim();

  const angebot = getOfferUnitPrice(row);
  const rlcKi = getRlcKiUnitPrice(row);

  if (decision === "rlcKi" && rlcKi > 0) return rlcKi;

  // Standard: X84/Angebot bleibt finaler Preis.
  if (angebot > 0) return angebot;

  const breakdown = sumBreakdown(row.priceBreakdown);
  return n(row.finalUnitPrice ?? row.preis ?? row.suggestedUnitPrice, breakdown);
}

function lineNet(row: EliteRow): number {
  const raw = n(row.menge) * getUnitPrice(row);
  const rab = n(row.rabatt);
  return round2(raw * (1 - rab / 100));
}
function getOfferUnitPrice(row: EliteRow): number {
  // Wichtig:
  // Angebot X84 darf NICHT auf den aktuellen KI-Preis zurückfallen.
  // Sonst werden Angebot und RLC-KI identisch.
  return (
    n((row as any).angebotUnitPrice) ||
    n((row as any).originalPreKiPrice) ||
    0
  );
}

function offerLineNet(row: EliteRow): number {
  const raw = n(row.menge) * getOfferUnitPrice(row);
  const rab = n(row.rabatt);
  return round2(raw * (1 - rab / 100));
}

function getLightWorkRlcUnitPrice(row: EliteRow): number {
  const text = normText(`${row.kurztext || ""} ${row.langtext || ""}`);

  /*
   * Leichte Nebenleistungen:
   * RLC-KI bekommt hier einen eigenen technischen Prüfwert.
   * X84 bleibt nur Angebotspreis und darf diesen Wert nicht bestimmen.
   */
  if (text.includes("schichtenverbund")) {
    return 0.85;
  }

  if (
    text.includes("unterlage reinigen") ||
    text.includes("untergrund reinigen") ||
    text.includes("flache reinigen") ||
    text.includes("fläche reinigen") ||
    text.includes("flaeche reinigen")
  ) {
    return 0.45;
  }

  if (
    text.includes("asphalt trennen") ||
    text.includes("asphalt schneiden") ||
    text.includes("asphalt einschneiden")
  ) {
    return 12;
  }

  return 0;
}
function sanitizeRlcKiPruefwert(row: EliteRow, rawKiEp: number): {
  value: number;
  rejected: boolean;
  reason: string;
} {
  const kiEp = n(rawKiEp);
  const unit = String(row.einheit || "").trim().toLowerCase();
  const text = normText(`${row.kurztext || ""} ${row.langtext || ""}`);

  if (kiEp <= 0) {
    return { value: 0, rejected: false, reason: "" };
  }

  /*
   * RLC-KI darf NICHT gegen X84 blockiert werden.
   * X84 ist nur Angebots-/Vergleichspreis.
   * Diese Funktion prüft nur harte technische Ausreißer.
   */

  const light = getLightWorkRlcUnitPrice({
    ...row,
    rlcKiUnitPrice: kiEp,
  } as EliteRow);

  if (light > 0) {
    return {
      value: round2(light),
      rejected: false,
      reason: "RLC-Plausibilität: leichte Nebenleistung erkannt.",
    };
  }

  const range = getRlcRangeForRow(row);

  /*
   * Range nur als sehr grober technischer Ausreißerschutz.
   * Nicht mehr eng deckeln, sonst zerstören wir Server/Recipe/OpenAI-Ergebnisse.
   */
  if (range.max > 0 && kiEp > range.max * 4.0) {
    return {
      value: 0,
      rejected: true,
      reason: `RLC-Plausibilität: KI-Prüfwert als extremer Ausreißer verworfen (${money(kiEp)} RLC-KI ↔ RLC max ${money(range.max)}).`,
    };
  }

  const isPauschal =
    unit === "psch" ||
    unit === "ps" ||
    unit === "pauschal" ||
    text.includes("baustelleneinricht") ||
    text.includes("baustelle einricht") ||
    text.includes("baustelle räumen") ||
    text.includes("baustelle raumen");

  /*
   * Pauschalpositionen dürfen stark abweichen.
   * Nur komplett absurde Werte werden verworfen.
   */
  if (isPauschal && (kiEp < 1 || kiEp > 250000)) {
    return {
      value: 0,
      rejected: true,
      reason: `RLC-Plausibilität: Pauschalposition als extremer Ausreißer verworfen (${money(kiEp)} RLC-KI).`,
    };
  }

  return { value: round2(kiEp), rejected: false, reason: "" };
}
function getRlcRangeForRow(row: EliteRow | null | undefined): {
  min: number;
  avg: number;
  max: number;
  source: string;
  group: string;
} {
  if (!row) return { min: 0, avg: 0, max: 0, source: "", group: "" };

  const text = normText(`${row.kurztext || ""} ${row.langtext || ""}`);
  const unit = String(row.einheit || "").trim().toLowerCase();
const direct = {
    min: n((row as any).rlcPreisMin),
    avg: n((row as any).rlcPreisAvg),
    max: n((row as any).rlcPreisMax),
    source: String((row as any).rlcPreisSource || ""),
    group: String((row as any).rlcPreisGroup || ""),
  };

  if (unit === "m²" || unit === "m2" || unit === "qm" || unit === "m^2") {
    if (
      text.includes("unterlage reinigen") ||
      text.includes("untergrund reinigen") ||
      text.includes("fläche reinigen") ||
      text.includes("flaeche reinigen")
    ) {
      return {
        min: 0.15,
        avg: 0.45,
        max: 2.5,
        source: "RLC Plausibilitätsbibliothek",
        group: "Oberfläche / Reinigung",
      };
    }

    if (
      text.includes("asphalt einfräsen") ||
      text.includes("asphalt einfraesen") ||
      text.includes("fräsen") ||
      text.includes("fraesen") ||
      text.includes("abfräsen") ||
      text.includes("abfraesen")
    ) {
      return {
        min: 2,
        avg: 4.5,
        max: 9,
        source: "RLC Plausibilitätsbibliothek",
        group: "Oberfläche / Asphalt fräsen",
      };
    }

    if (
      text.includes("ac 11 ds") ||
      text.includes("ads aus ac 11") ||
      text.includes("asphaltdeckschicht") ||
      text.includes("deckschicht") ||
      text.includes("4 cm")
    ) {
      return {
        min: 10,
        avg: 18,
        max: 32,
        source: "RLC Plausibilitätsbibliothek",
        group: "Oberfläche / Asphaltdeckschicht",
      };
    }

    if (
      text.includes("zulage") &&
      (text.includes("mehr") || text.includes("minder")) &&
      (text.includes("stärke") || text.includes("staerke"))
    ) {
      return {
        min: 1,
        avg: 4.5,
        max: 12,
        source: "RLC Plausibilitätsbibliothek",
        group: "Oberfläche / Asphalt Zulage",
      };
    }

    if (text.includes("planie")) {
      return {
        min: 2,
        avg: 5,
        max: 10,
        source: "RLC Plausibilitätsbibliothek",
        group: "Oberfläche / Planie",
      };
    }
  }

  if (
    text.includes("abfuhr erdreich") &&
    text.includes("bis 5 km") &&
    (text.includes("lkw") || text.includes("kippvorgang"))
  ) {
    return {
      min: 18,
      avg: 28,
      max: 42,
      source: "RLC Preisbibliothek",
      group: "LKW / Transport",
    };
  }

  if (direct.avg > 0 && direct.max > 0) return direct;

  return { min: 0, avg: 0, max: 0, source: "", group: "" };
}

function getTrustedRlcDatabasePrice(row: EliteRow): number {
  // X84 darf RLC-KI nicht mehr bestimmen.
  const range = getRlcRangeForRow(row);
  const rowUnit = String(row.einheit || "").trim().toLowerCase();

  const matches = KalkulationsDatenbank.search(
    {
      posNr: row.posNr || "",
      kurztext: row.kurztext || "",
      langtext: row.langtext || "",
      einheit: row.einheit || "",
      menge: n(row.menge),
      parameter: {
        gewerk: row.gewerk || "",
        leistungsart: row.leistungsart || "",
        bauverfahren: row.bauverfahren || "",
        menge: n(row.menge),
        einheit: row.einheit || "",
      },
    },
    8
  );

  const candidates = matches
    .map((m) => {
      const ep = n(m.eintrag?.kosten?.epNetto);
      return { match: m, ep };
    })
    .filter((x) => x.ep > 0 && x.ep < 1000000)
    .sort((a, b) => b.match.score - a.match.score);

  for (const item of candidates) {
    const score = n(item.match.score);
    const ep = round2(item.ep);
    const entry = item.match.eintrag;
    const entryUnit = String(entry.einheit || "").trim().toLowerCase();

    if (rowUnit && entryUnit && rowUnit !== entryUnit) continue;

    /*
     * Datenbank nur verwenden, wenn der Treffer wirklich stark ist.
     * Damit wird verhindert, dass ähnliche, aber falsche Positionen übernommen werden.
     */
    if (score < 68) continue;

    /*
     * RLC-Preisbibliothek ist Kontrollrahmen:
     * Wenn ein Datenbankwert klar über dem realistischen Max liegt,
     * wird er nicht als RLC-KI-Preis akzeptiert.
     */
    if (range.max > 0 && ep > range.max * 1.35) continue;

    /*
     * X84 ist NICHT Wahrheit, aber Plausibilitätsanker.
     * Bei mittelstarkem Treffer darf der Datenbankpreis nicht extrem weit weg sein.
     * Sehr starke Treffer dürfen mehr abweichen.
     */
    const x84 = getOfferUnitPrice(row);

    if (x84 > 0) {
      const ratio = ep / x84;

      if (ratio > 3.0 || ratio < 0.25) continue;

      if (score < 82 && (ratio > 2.2 || ratio < 0.45)) continue;
    }

    return ep;
  }

  return 0;
}

type RlcKiPriceDecision = {
  angebotEp: number;
  dbEp: number;
  serverEp: number;
  openAiEp: number;
  libraryAvgEp: number;
  finalRlcKiEp: number;
  source: "x84" | "datenbank" | "server" | "openai" | "bibliothek" | "none";
  confidence: number;
  warning: string;
  reason: string;
};

function resolveBestRlcKiPrice(row: EliteRow, allowDatabaseSearch = false): RlcKiPriceDecision {
  const angebotEp = getOfferUnitPrice(row);
  const range = getRlcRangeForRow(row);

  const dbEp = allowDatabaseSearch ? getTrustedRlcDatabasePrice(row) : 0;

  const serverRaw =
    n((row as any).rlcKiUnitPrice) ||
    n((row as any).suggestedUnitPrice) ||
    n((row as any).baseUnitPrice);

  const openAiRaw = n((row as any).openAiSuggestedUnitPrice);

  const checkedServer = sanitizeRlcKiPruefwert(row, serverRaw);
  const checkedOpenAi = sanitizeRlcKiPruefwert(row, openAiRaw);

  const serverEp = checkedServer.value > 0 ? checkedServer.value : 0;
  const openAiEp = checkedOpenAi.value > 0 ? checkedOpenAi.value : 0;

  const libraryAvgEp =
    range.avg > 0 && range.max > 0
      ? round2(range.avg)
      : 0;

  function isPlausibleAgainstX84(ep: number, source: string): boolean {
    if (ep <= 0) return false;

    /*
     * RLC-KI darf NICHT durch X84 blockiert werden.
     * X84 ist nur Vergleichs-/Angebotspreis.
     * Server, Recipe und OpenAI liefern eigenständige Prüfwerte.
     */
    if (source === "server" || source === "openai" || source === "bibliothek") {
      return true;
    }

    if (angebotEp <= 0) return true;

    const ratio = ep / angebotEp;

    // Firmen-Datenbank darf stärker abweichen, aber nicht komplett absurd.
    if (source === "datenbank") {
      return ratio >= 0.25 && ratio <= 3.0;
    }

    return true;
  }

  function isPlausibleAgainstLibrary(ep: number, source: string): boolean {
    if (ep <= 0) return false;

    /*
     * RLC-Bibliothek ist ab jetzt nur Kontroll-/Anzeigeinformation.
     * Sie darf Server, Recipe, Datenbank oder OpenAI nicht blockieren.
     * Fachliche Warnungen werden separat angezeigt.
     */
    return true;
  }

  const candidates: Array<{
    source: RlcKiPriceDecision["source"];
    ep: number;
    weight: number;
    reason: string;
  }> = [];

  if (
    dbEp > 0 &&
    isPlausibleAgainstX84(dbEp, "datenbank") &&
    isPlausibleAgainstLibrary(dbEp, "datenbank")
  ) {
    candidates.push({
      source: "datenbank",
      ep: dbEp,
      weight: 100,
      reason: "Firmen-Datenbank: stärkste Quelle, Treffer wurde plausibilisiert.",
    });
  }

  if (
    serverEp > 0 &&
    isPlausibleAgainstX84(serverEp, "server") &&
    isPlausibleAgainstLibrary(serverEp, "server")
  ) {
    candidates.push({
      source: "server",
      ep: serverEp,
      weight: 70,
      reason: "Server-/Recipe-Kalkulation wurde als plausibler RLC-KI-Prüfwert akzeptiert.",
    });
  }

  /*
   * WICHTIG:
   * OpenAI und RLC Bibliothek werden hier bewusst NICHT automatisch als RLC-KI-Preis übernommen.
   * OpenAI bleibt Vergleich.
   * Bibliothek bleibt Plausibilitätsrahmen.
   */

  const best = candidates.sort((a, b) => b.weight - a.weight)[0];

  if (!best) {
    return {
      angebotEp,
      dbEp,
      serverEp,
      openAiEp,
      libraryAvgEp,
      finalRlcKiEp: 0,
      source: angebotEp > 0 ? "x84" : "none",
      confidence: 0,
      warning: "",
      reason: [
        "Kein belastbarer RLC-KI-Preis gefunden.",
        `Server/RLC ${money(serverEp)}, DB ${money(dbEp)}, OpenAI ${money(openAiEp)}, Bibliothek Ø ${money(libraryAvgEp)}, X84 ${money(angebotEp)}.`,
        "OpenAI und Bibliothek wurden nicht automatisch als Preis übernommen.",
      ].join(" "),
    };
  }

  const diffPct =
    angebotEp > 0 ? round2(((best.ep - angebotEp) / angebotEp) * 100) : 0;

  const warning =
    angebotEp > 0 && Math.abs(diffPct) >= 35
      ? `RLC-KI weicht deutlich vom X84-Angebotspreis ab (${money(angebotEp)} X84 ↔ ${money(best.ep)} RLC-KI, ${diffPct}%). Fachlich prüfen.`
      : "";

  return {
    angebotEp,
    dbEp,
    serverEp,
    openAiEp,
    libraryAvgEp,
    finalRlcKiEp: round2(best.ep),
    source: best.source,
    confidence: best.source === "datenbank" ? 0.92 : 0.78,
    warning,
    reason: [
      best.reason,
      `Quellen geprüft: DB ${money(dbEp)}, Server/RLC ${money(serverEp)}, OpenAI ${money(openAiEp)}, Bibliothek Ø ${money(libraryAvgEp)}, X84 ${money(angebotEp)}.`,
      "X84 bleibt Referenz/Angebot. RLC-KI ist ein geprüfter Vergleichswert.",
    ].join(" "),
  };
}
function getRawRlcKiUnitPrice(row: EliteRow): number {
  /*
   * Nur gespeicherte KI/OpenAI-Prüfwerte lesen.
   * Keine Datenbank-Suche hier, weil diese Funktion beim Rendern sehr oft läuft.
   */
  const explicitRlc = n((row as any).rlcKiUnitPrice);
  if (explicitRlc > 0) return round2(explicitRlc);

  const explicitOpenAi = n((row as any).openAiSuggestedUnitPrice);
  if (explicitOpenAi > 0) return round2(explicitOpenAi);

  return 0;
}

function scrollToLvPosition(rowId: string | undefined) {
  const id = String(rowId || "").trim();
  if (!id) return;

  try {
    const escaped =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(id)
        : id.replace(/["\\]/g, "\\$&");

    const el =
      document.querySelector(`[data-row-id="${escaped}"]`) ||
      document.querySelector(`[data-lv-row-id="${escaped}"]`) ||
      document.getElementById(`rlc-row-${id}`) ||
      document.getElementById(id);

    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });

      if (el instanceof HTMLElement) {
        el.focus?.();
      }
    }
  } catch {
    // Scroll ist nur Komfortfunktion. Keine Kalkulation blockieren.
  }
}

function getRlcKiDisplay(row: EliteRow): {
  valid: number;
  raw: number;
  label: string;
  rejected: boolean;
} {
  const raw = getRawRlcKiUnitPrice(row);

  if (raw <= 0) {
    return { valid: 0, raw: 0, label: "—", rejected: false };
  }

  const checked = sanitizeRlcKiPruefwert(row, raw);

  return {
    valid: checked.value,
    raw,
    label: checked.value > 0 ? money(checked.value) : "—",
    rejected: checked.rejected,
  };
}

function showLangtextModal(text: string) {
  const old = document.getElementById("rlc-langtext-modal");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "rlc-langtext-modal";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "999999";
  overlay.style.background = "rgba(15, 23, 42, 0.55)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.padding = "24px";

  const box = document.createElement("div");
  box.style.width = "min(820px, 96vw)";
  box.style.maxHeight = "82vh";
  box.style.background = "#ffffff";
  box.style.borderRadius = "18px";
  box.style.boxShadow = "0 24px 80px rgba(15, 23, 42, 0.32)";
  box.style.border = "1px solid #dbe4f0";
  box.style.overflow = "hidden";
  box.style.fontFamily = "inherit";

  const head = document.createElement("div");
  head.style.padding = "18px 22px";
  head.style.background = "linear-gradient(135deg, #10204a, #2457d6)";
  head.style.color = "white";
  head.style.fontWeight = "900";
  head.style.fontSize = "18px";
  head.textContent = "Langtext / Positionssumme";

  const body = document.createElement("pre");
  body.style.margin = "0";
  body.style.padding = "22px";
  body.style.maxHeight = "56vh";
  body.style.overflow = "auto";
  body.style.whiteSpace = "pre-wrap";
  body.style.wordBreak = "break-word";
  body.style.fontFamily = "inherit";
  body.style.fontSize = "15px";
  body.style.lineHeight = "1.55";
  body.style.color = "#0f172a";
  body.style.background = "#f8fafc";
  body.textContent = text;

  const footer = document.createElement("div");
  footer.style.padding = "14px 22px";
  footer.style.display = "flex";
  footer.style.justifyContent = "flex-end";
  footer.style.gap = "10px";
  footer.style.background = "#ffffff";
  footer.style.borderTop = "1px solid #e5e7eb";

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Schließen";
  close.style.border = "1px solid #cbd5e1";
  close.style.borderRadius = "12px";
  close.style.background = "#ffffff";
  close.style.color = "#0f172a";
  close.style.fontWeight = "800";
  close.style.padding = "10px 18px";
  close.style.cursor = "pointer";

  close.onclick = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };

  document.addEventListener(
    "keydown",
    function esc(ev) {
      if (ev.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", esc);
      }
    },
    { once: false }
  );

  footer.appendChild(close);
  box.appendChild(head);
  box.appendChild(body);
  box.appendChild(footer);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function getX84CompanyFrontendOverride(row: EliteRow): number {
  /*
   * Firmen-Datenbank-Override:
   * Keine hardcoded Frontend-Preise.
   * Wahrheit ist die synchronisierte Kalkulationsdatenbank.
   */
  const pos = String((row as any).posNr || (row as any).pos || "").trim();
  if (!pos) return 0;

  try {
    const hit = KalkulationsDatenbank.list().find((entry: any) => {
      const entryPos = String(entry.posNr || entry.positionNumber || "").trim();
      const source = String(entry.quelle || entry.source || "").trim();
      return entryPos === pos && source === "x84-company-baseline";
    });

    if (!hit) return 0;

    return (
      n((hit as any).kosten?.epNetto) ||
      n((hit as any).preis) ||
      n((hit as any).unitPriceNet) ||
      n((hit as any).finalUnitPrice)
    );
  } catch {
    return 0;
  }
}

function getRlcKiUnitPrice(row: EliteRow): number {
  const companyOverride = getX84CompanyFrontendOverride(row);
  if (companyOverride > 0) return companyOverride;

  const decision = resolveBestRlcKiPrice(row);
  return decision.finalRlcKiEp > 0 ? decision.finalRlcKiEp : 0;
}
function clearOldKiProposalFields(row: EliteRow): EliteRow {
  // X84 darf RLC-KI nicht mehr bestimmen.
  const x84 =
    getOfferUnitPrice(row) ||
    n((row as any).originalPreKiPrice) ||
    n(row.preis) ||
    n(row.finalUnitPrice);

  return normalizeEliteRow({
    ...row,

    // X84 bleibt der finale Preis
    preis: x84,
    finalUnitPrice: x84,
    suggestedUnitPrice: x84,
    gesamt: round2(n(row.menge) * x84),

    // Alte KI/OpenAI-Prüfwerte löschen
    rlcKiUnitPrice: 0,
    rlcKiTotal: 0,
    priceDifference: 0,
    priceDifferencePct: 0,

    openAiSuggestedUnitPrice: undefined,
    openAiSuggestedTotal: undefined,
    openAiSuggestedAt: undefined,
    openAiSuggestedReason: undefined,
    openAiSuggestedWarning: undefined,
    openAiSuggestedPriceBreakdown: undefined,

    openAiRejected: true,

    // Alte künstliche Warnungen entfernen
    warning: "",
    calculationStatus: "ok",
    riskLevel: "medium",
  } as unknown as EliteRow);
}

function rlcKiLineNet(row: EliteRow): number {
  const raw = n(row.menge) * getRlcKiUnitPrice(row);
  const rab = n(row.rabatt);
  return round2(raw * (1 - rab / 100));
}

function getPriceDifference(row: EliteRow): number {
  return round2(getRlcKiUnitPrice(row) - getOfferUnitPrice(row));
}

function getPriceDifferencePct(row: EliteRow): number {
  const angebot = getOfferUnitPrice(row);
  if (angebot <= 0) return 0;
  return round2((getPriceDifference(row) / angebot) * 100);
}

function isRlcKiWithinFivePercent(row: EliteRow): boolean {
  const x84 = getOfferUnitPrice(row);
  const rlc = getRlcKiUnitPrice(row);

  if (x84 <= 0 || rlc <= 0) return false;

  const pct = Math.abs(((rlc - x84) / x84) * 100);
  return pct <= 5;
}

function cleanRlcKiWarningState(row: EliteRow): EliteRow {
  if (!isRlcKiWithinFivePercent(row)) return row;

  return {
    ...row,
    warning: "",
    calculationStatus: "ok",
    riskLevel: "low",
    confidence: Math.max(n(row.confidence), 0.96),
  };
}

function getRlcKiDifference(row: EliteRow): number {
  return round2(getRlcKiUnitPrice(row) - getOfferUnitPrice(row));
}

function getRlcKiDifferencePct(row: EliteRow): number {
  const angebot = getOfferUnitPrice(row);
  if (angebot <= 0) return 0;
  return round2((getRlcKiDifference(row) / angebot) * 100);
}

function shouldKeepOfferPrice(angebotEp: number, kiEp: number): boolean {
  if (angebotEp <= 0 || kiEp <= 0) return false;

  const diffPct = Math.abs(((kiEp - angebotEp) / angebotEp) * 100);

  // Sicherheitsregel:
  // Bei großer Abweichung bleibt der X84-Angebotspreis final.
  return diffPct >= 35;
}

function costBuildUp(row: EliteRow): number {
  const breakdown = sumBreakdown(row.priceBreakdown);
  if (breakdown > 0) return breakdown;

  return round2(
    n(row.materialCost) +
      n(row.laborCost) +
      n(row.machineCost) +
      n(row.subcontractorCost) +
      n(row.disposalCost) +
      n(row.overheadCost) +
      n(row.riskCost) +
      n(row.profitCost)
  );
}

function makeBreakdownLine(
  group: PriceBreakdownGroup,
  name: string,
  unit: string,
  total: number,
  note = ""
): PriceBreakdownLine {
  return normalizeBreakdownLine({
    group,
    name,
    unit,
    qty: 1,
    price: round2(total),
    total: round2(total),
    note,
  });
}

function buildAutomaticPriceBreakdown(row: Partial<EliteRow>): PriceBreakdownLine[] {
  const unit = String(row.einheit || "EH");
  const text = normText(`${row.kurztext || ""} ${row.langtext || ""}`);
  const ep =
    n(row.finalUnitPrice) ||
    n(row.preis) ||
    n(row.suggestedUnitPrice) ||
    n(row.baseUnitPrice) ||
    0;

  let material = n(row.materialCost);
  let labor = n(row.laborCost);
  let machine = n(row.machineCost);
  let subcontractor = n(row.subcontractorCost);
  let disposal = n(row.disposalCost);
  let overhead = n(row.overheadCost);
  let risk = n(row.riskCost);
  let profit = n(row.profitCost);

  const existingSum =
    material + labor + machine + subcontractor + disposal + overhead + risk + profit;

  if (existingSum <= 0 && ep > 0) {
    if (
      text.includes("aushub") ||
      text.includes("graben") ||
      text.includes("verfull") ||
      text.includes("verfüll")
    ) {
      material = round2(ep * 0.14);
      labor = round2(ep * 0.28);
      machine = round2(ep * 0.27);
      subcontractor = 0;
      disposal = round2(ep * 0.1);
      overhead = round2(ep * 0.09);
      risk = round2(ep * 0.04);
      profit = round2(ep * 0.08);
    } else if (
      text.includes("rohr") ||
      text.includes("speedpipe") ||
      text.includes("kabel")
    ) {
      material = round2(ep * 0.42);
      labor = round2(ep * 0.24);
      machine = round2(ep * 0.11);
      subcontractor = 0;
      disposal = round2(ep * 0.02);
      overhead = round2(ep * 0.09);
      risk = round2(ep * 0.04);
      profit = round2(ep * 0.08);
    } else if (text.includes("asphalt") || text.includes("pflaster")) {
      material = round2(ep * 0.45);
      labor = round2(ep * 0.18);
      machine = round2(ep * 0.14);
      subcontractor = 0;
      disposal = round2(ep * 0.04);
      overhead = round2(ep * 0.08);
      risk = round2(ep * 0.03);
      profit = round2(ep * 0.08);
    } else {
      material = round2(ep * 0.28);
      labor = round2(ep * 0.34);
      machine = round2(ep * 0.18);
      subcontractor = 0;
      disposal = round2(ep * 0.02);
      overhead = round2(ep * 0.08);
      risk = round2(ep * 0.03);
      profit = round2(ep * 0.07);
    }
  }

  const lines: PriceBreakdownLine[] = [];

  if (material > 0) {
    lines.push(makeBreakdownLine("Material", "Materialansatz", unit, material));
  }

  if (labor > 0) {
    lines.push(makeBreakdownLine("Personal", "Lohn / Kolonne", unit, labor));
  }

  if (machine > 0) {
    lines.push(makeBreakdownLine("Maschinen", "Maschinenansatz", unit, machine));
  }

  if (subcontractor > 0) {
    lines.push(
      makeBreakdownLine("Fremdleistung", "Fremdleistung", unit, subcontractor)
    );
  }

  if (disposal > 0) {
    lines.push(makeBreakdownLine("Entsorgung", "Entsorgung / Deponie", unit, disposal));
  }

  if (overhead > 0) {
    lines.push(makeBreakdownLine("Gemeinkosten", "Baustellengemeinkosten", unit, overhead));
  }

  if (risk > 0) {
    lines.push(makeBreakdownLine("Risiko", "Risikopuffer", unit, risk));
  }

  if (profit > 0) {
    lines.push(makeBreakdownLine("Gewinn", "Gewinnanteil", unit, profit));
  }

  return lines;
}

function breakdownText(row: EliteRow): string {
  const lines = row.priceBreakdown?.length
    ? row.priceBreakdown
    : buildAutomaticPriceBreakdown(row);

  if (!lines.length) return "";

  return lines
    .map(
      (line) =>
        `${line.group}: ${line.name} · ${qty(line.qty)} ${line.unit} × ${money(
          line.price
        )} = ${money(line.total)}`
    )
    .join("\n");
}

function groupSum(row: EliteRow, group: PriceBreakdownGroup): number {
  return round2(
    (row.priceBreakdown || [])
      .filter((x) => x.group === group)
      .reduce((sum, x) => sum + n(x.total), 0)
  );
}

/* ================= KI AUTO INSERTIONS ================= */

function suggestUnitFromText(row: Partial<EliteRow>): string {
  const current = String(row.einheit || "").trim();
  if (current) return current;

  const text = normText(`${row.kurztext || ""} ${row.langtext || ""}`);

  if (
    text.includes("aushub") ||
    text.includes("boden") ||
    text.includes("verfull") ||
    text.includes("verfüll") ||
    text.includes("kies") ||
    text.includes("schotter") ||
    text.includes("beton")
  ) {
    return "m³";
  }

  if (
    text.includes("asphalt") ||
    text.includes("pflaster") ||
    text.includes("flache") ||
    text.includes("fläche") ||
    text.includes("schalung") ||
    text.includes("deckschicht") ||
    text.includes("tragschicht")
  ) {
    return "m²";
  }

  if (
    text.includes("rohr") ||
    text.includes("leitung") ||
    text.includes("kabel") ||
    text.includes("speedpipe") ||
    text.includes("markierung") ||
    text.includes("trasse")
  ) {
    return "m";
  }

  if (
    text.includes("schacht") ||
    text.includes("hausanschluss") ||
    text.includes("anschluss") ||
    text.includes("muffe") ||
    text.includes("abzweig") ||
    text.includes("bogen")
  ) {
    return "Stk";
  }

  if (text.includes("abfuhr") || text.includes("entsorgung")) return "t";

  return current;
}

function suggestKurztext(row: Partial<EliteRow>): string {
  const kurz = String(row.kurztext || "").trim();
  if (kurz.length >= 8) return kurz;

  const lang = String(row.langtext || "").replace(/\s+/g, " ").trim();
  if (lang.length >= 8) return lang.slice(0, 90);

  const pos = String(row.posNr || "").trim();
  return pos ? `Leistung zu Position ${pos}` : "Leistung prüfen";
}

function suggestGewerk(row: Partial<EliteRow>): string {
  if (String(row.gewerk || "").trim()) return String(row.gewerk || "").trim();

  const text = normText(`${row.kurztext || ""} ${row.langtext || ""}`);

  if (
    text.includes("aushub") ||
    text.includes("graben") ||
    text.includes("verfull") ||
    text.includes("verfüll") ||
    text.includes("boden")
  ) {
    return "Tiefbau / Erdarbeiten";
  }

  if (
    text.includes("rohr") ||
    text.includes("leitung") ||
    text.includes("speedpipe") ||
    text.includes("kabel")
  ) {
    return "Tiefbau / Leitungsbau";
  }

  if (
    text.includes("asphalt") ||
    text.includes("pflaster") ||
    text.includes("markierung")
  ) {
    return "Straßenbau / Oberfläche";
  }

  if (
    text.includes("beton") ||
    text.includes("schalung") ||
    text.includes("bewehrung") ||
    text.includes("fundament")
  ) {
    return "Rohbau / Betonbau";
  }

  return "Allgemein";
}

function suggestLeistungsart(row: Partial<EliteRow>): string {
  if (String(row.leistungsart || "").trim()) {
    return String(row.leistungsart || "").trim();
  }

  const text = normText(`${row.kurztext || ""} ${row.langtext || ""}`);

  if (text.includes("liefern") && text.includes("verlegen")) {
    return "Liefern und Einbauen";
  }

  if (text.includes("liefern")) return "Lieferleistung";
  if (text.includes("verlegen") || text.includes("einbauen")) {
    return "Einbauleistung";
  }

  if (text.includes("aushub") || text.includes("abtrag")) return "Erdbewegung";
  if (text.includes("abfuhr") || text.includes("entsorgung")) {
    return "Transport / Entsorgung";
  }

  if (text.includes("schalung")) return "Schalarbeiten";
  if (text.includes("bewehrung")) return "Bewehrungsarbeiten";
  if (text.includes("beton")) return "Betonarbeiten";

  return "Sonstige Leistung";
}

function suggestBauverfahren(row: Partial<EliteRow>, unit: string): string {
  if (String(row.bauverfahren || "").trim()) {
    return String(row.bauverfahren || "").trim();
  }

  const text = normText(`${row.kurztext || ""} ${row.langtext || ""}`);

  if (text.includes("aushub") || text.includes("graben")) {
    return "Baggeraushub mit Laden / ggf. Abtransport";
  }

  if (text.includes("abfuhr")) {
    return "LKW-Transport inklusive Lade- und Kippvorgang";
  }

  if (text.includes("verfull") || text.includes("verfüll")) {
    return "Einbau lagenweise mit Verdichtung";
  }

  if (text.includes("speedpipe")) {
    return "Speedpipe-Verlegung im Leitungsgraben";
  }

  if (text.includes("kabelschutz")) {
    return "Kabelschutzrohr liefern und verlegen";
  }

  if (text.includes("asphalt")) {
    return "Asphalteinbau mit Verdichtung und höhengerechter Wiederherstellung";
  }

  if (text.includes("schacht") || text.includes("anschluss")) {
    return "Einbau, Anschluss und fachgerechte Herstellung";
  }

  if (unit === "m") return "Längenbezogene Ausführung";
  if (unit === "m²") return "Flächenbezogene Ausführung";
  if (unit === "m³") return "Volumenbezogene Ausführung";

  return "Standard-Ausführung";
}

function suggestLangtext(row: Partial<EliteRow>): string {
  const existing = String(row.langtext || "").trim();
  if (existing.length >= 25) return existing;

  const kurztext = suggestKurztext(row);
  const unit = suggestUnitFromText(row);
  const gewerk = suggestGewerk(row);
  const leistungsart = suggestLeistungsart(row);
  const bauverfahren = suggestBauverfahren(row, unit);
  const text = normText(`${kurztext} ${existing}`);

  const parts: string[] = [];

  parts.push(`${kurztext}.`);
  parts.push(`Ausführung als ${leistungsart.toLowerCase()} im Bereich ${gewerk}.`);
  parts.push(`Bauverfahren: ${bauverfahren}.`);

  if (n(row.menge) > 0 && unit) {
    parts.push(`Abrechnung nach tatsächlich ausgeführter Menge in ${unit}.`);
  }

  if (text.includes("aushub") || text.includes("graben")) {
    parts.push(
      "Einschließlich Lösen, Laden, profilgerechtem Herstellen, seitlichem Lagern beziehungsweise Abfahren nach Erfordernis."
    );
  }

  if (text.includes("verfull") || text.includes("verfüll") || text.includes("kies")) {
    parts.push(
      "Einschließlich lagenweisem Einbau, Verdichtung und Herstellung der geforderten Tragfähigkeit."
    );
  }

  if (
    text.includes("rohr") ||
    text.includes("speedpipe") ||
    text.includes("kabel") ||
    text.includes("leitung")
  ) {
    parts.push(
      "Einschließlich Lieferung beziehungsweise Verlegung, Ausrichtung, Bettung und fachgerechtem Anschluss gemäß Ausführungsplanung."
    );
  }

  if (text.includes("asphalt")) {
    parts.push(
      "Einschließlich Vorbereiten des Untergrundes, Einbau, Verdichtung und höhengerechter Wiederherstellung der Oberfläche."
    );
  }

  if (text.includes("schacht") || text.includes("anschluss")) {
    parts.push(
      "Einschließlich Einbau, Ausrichten, Anschließen, Abdichten und funktionsgerechter Herstellung."
    );
  }

  parts.push(
    "Nebenleistungen, Geräte, Personal, Material, Baustellenorganisation und erforderliche Hilfsleistungen sind in der Kalkulation berücksichtigt."
  );

  return parts.join(" ");
}

function appendInfoText(oldValue: string | undefined, text: string): string {
  const old = String(oldValue || "").trim();
  if (!old) return text;
  if (old.includes(text)) return old;
  return `${old}\n${text}`;
}

function normalizeEliteRow(row: Partial<EliteRow>): EliteRow {
  const rawBreakdown = normalizeBreakdown(row.priceBreakdown);
  const breakdownSum = sumBreakdown(rawBreakdown);
  const unitPrice = n(row.finalUnitPrice ?? row.preis ?? row.suggestedUnitPrice, breakdownSum);

  return {
    id: String(row.id || safeId()),
    auftragId: row.auftragId || "",
auftragName: row.auftragName || "",
auftragType: row.auftragType,
    posNr: String(row.posNr ?? ""),
    parentPosNr: row.parentPosNr,
    sortIndex: row.sortIndex,

    kurztext: String(row.kurztext ?? ""),
    langtext: String(row.langtext ?? ""),
    bemerkung: row.bemerkung,

    einheit: String(row.einheit ?? ""),
    menge: n(row.menge),

    preis: unitPrice || n(row.preis),
    gesamt: round2(n(row.menge) * unitPrice),
    waehrung: row.waehrung || "EUR",

    confidence: row.confidence,
    source: row.source || "manual",
    createdAt: row.createdAt,
    updatedAt: new Date().toISOString(),

    rabatt: n(row.rabatt),
    originalPreKiPrice: n((row as any).originalPreKiPrice),

    angebotUnitPrice: n((row as any).angebotUnitPrice),
    angebotTotal: n((row as any).angebotTotal),

    rlcKiUnitPrice: n((row as any).rlcKiUnitPrice),
    rlcKiTotal: n((row as any).rlcKiTotal),

    priceDifference: n((row as any).priceDifference),
    priceDifferencePct: n((row as any).priceDifferencePct),

    materialCost: n(row.materialCost),
    laborCost: n(row.laborCost),
    machineCost: n(row.machineCost),
    subcontractorCost: n(row.subcontractorCost),
    disposalCost: n(row.disposalCost),
    overheadCost: n(row.overheadCost),
    riskCost: n(row.riskCost),
    profitCost: n(row.profitCost),

    baseUnitPrice: n(row.baseUnitPrice),
    suggestedUnitPrice: n(row.suggestedUnitPrice, unitPrice),
    finalUnitPrice: unitPrice,
    priceDecision: ((row as any).priceDecision || "x84") as any,

    riskLevel: row.riskLevel || "medium",
    calculationStatus: row.calculationStatus || "manual",

    gewerk: row.gewerk || "",
    leistungsart: row.leistungsart || "",
    bauverfahren: row.bauverfahren || "",

    warning: row.warning || "",
    aiReason: row.aiReason || "",

    priceBreakdown: rawBreakdown,

    openAiSuggestedUnitPrice: (row as any).openAiSuggestedUnitPrice,
    openAiSuggestedTotal: (row as any).openAiSuggestedTotal,
    openAiSuggestedAt: (row as any).openAiSuggestedAt,
    openAiSuggestedReason: (row as any).openAiSuggestedReason,
    openAiSuggestedWarning: (row as any).openAiSuggestedWarning,
    openAiSuggestedPriceBreakdown: (row as any).openAiSuggestedPriceBreakdown,

    preisManuellGeprueft: (row as any).preisManuellGeprueft,
    preisManuellGeprueftAt: (row as any).preisManuellGeprueftAt,
    openAiRejected: (row as any).openAiRejected,

    rlcPreisMin: (row as any).rlcPreisMin,
    rlcPreisAvg: (row as any).rlcPreisAvg,
    rlcPreisMax: (row as any).rlcPreisMax,
    rlcPreisSource: (row as any).rlcPreisSource,
    rlcPreisGroup: (row as any).rlcPreisGroup,
  } as unknown as EliteRow;
}

function enhanceKalkulatorInsertions(row: EliteRow): EliteRow {
  if (kiIsStructuralRow(row)) {
    return normalizeEliteRow(kiPrepareStructuralRow(row));
  }
  const hadMissingKurz = !String(row.kurztext || "").trim();
  const hadMissingLang = !String(row.langtext || "").trim();
  const hadMissingUnit = !String(row.einheit || "").trim();
  const hadMissingBreakdown = !row.priceBreakdown?.length;

  const einheit = suggestUnitFromText(row);
  const kurztext = suggestKurztext({ ...row, einheit });
  const gewerk = suggestGewerk({ ...row, kurztext, einheit });
  const leistungsart = suggestLeistungsart({
    ...row,
    kurztext,
    einheit,
    gewerk,
  });

  const bauverfahren = suggestBauverfahren(
    { ...row, kurztext, einheit, gewerk, leistungsart },
    einheit
  );

  const langtext = suggestLangtext({
    ...row,
    kurztext,
    einheit,
    gewerk,
    leistungsart,
    bauverfahren,
  });

  let warning = String(row.warning || "");
  let aiReason = String(row.aiReason || "");

  const prepared = normalizeEliteRow({
    ...row,
    kurztext,
    langtext,
    einheit,
    gewerk,
    leistungsart,
    bauverfahren,
  });

  const priceBreakdown = prepared.priceBreakdown?.length
    ? normalizeBreakdown(prepared.priceBreakdown)
    : buildAutomaticPriceBreakdown(prepared);

  const breakdownSum = sumBreakdown(priceBreakdown);

/*
 * Wichtig:
 * finalUnitPrice vom Server ist die verbindliche Wahrheit.
 * priceBreakdown kann bewusst eine KI-Prognose enthalten, z.B. wenn die
 * Stabilitätsbremse aktiv ist. Dann darf die Urkalkulationssumme den finalen EP
 * NICHT automatisch überschreiben.
 */
const stableServerEp = n(prepared.finalUnitPrice ?? prepared.preis);
const finalUnitPrice =
  stableServerEp > 0 ? stableServerEp : breakdownSum > 0 ? breakdownSum : getUnitPrice(prepared);

  const fixed: string[] = [];

  if (hadMissingKurz) fixed.push("Kurztext");
  if (hadMissingLang) fixed.push("Langtext");
  if (hadMissingUnit) fixed.push("Einheit");
  if (hadMissingBreakdown && priceBreakdown.length) fixed.push("Preisaufbau");

  if (fixed.length) {
    warning = appendInfoText(
      warning,
      `KI hat fehlende Felder automatisch ergänzt: ${fixed.join(", ")}.`
    );

    aiReason = appendInfoText(
      aiReason,
      "Kalkulator-KI: Fehlende Eingaben wurden automatisch ergänzt. Kurztext, Langtext, Einheit, Gewerk, Leistungsart, Bauverfahren und Kostenstruktur wurden aus Positionsnummer, Textmerkmalen und Einheit abgeleitet."
    );
  }

  return normalizeEliteRow({
    ...prepared,
    priceBreakdown,    finalUnitPrice,
    preis: finalUnitPrice,
    suggestedUnitPrice: prepared.suggestedUnitPrice || finalUnitPrice,
    gesamt: round2(n(prepared.menge) * finalUnitPrice),
    warning,
    aiReason,
  });
}

function fromLvRows(rows: LVPos[]): EliteRow[] {
  return rows.map((r) => {
    const importedEp = n((r as any).angebotUnitPrice) || n((r as any).originalPreKiPrice) || n(r.preis);

    const base = normalizeEliteRow({
      ...r,
      angebotUnitPrice: importedEp,
      angebotTotal: round2(n(r.menge) * importedEp),
      originalPreKiPrice: importedEp,

      finalUnitPrice: n(r.finalUnitPrice) || importedEp,
      suggestedUnitPrice: n(r.suggestedUnitPrice) || importedEp,
      confidence: r.confidence,
      calculationStatus: r.preis != null ? "manual" : "critical",
      riskLevel: "medium",
      rabatt: 0,
    });

    if (kiIsStructuralRow(base)) {
      return normalizeEliteRow(kiPrepareStructuralRow(base));
    }

    return base.priceBreakdown?.length ? base : enhanceKalkulatorInsertions(base);
  });
}

function mergeEliteResult(
  oldRow: EliteRow,
  result: EliteKalkulationResultRow
): EliteRow {
  const resultBreakdown = normalizeBreakdown(result.priceBreakdown);
  const oldBreakdown = normalizeBreakdown(oldRow.priceBreakdown);

  const angebotEp =
    n((oldRow as any).angebotUnitPrice) ||
    n((oldRow as any).originalPreKiPrice) ||
    n(oldRow.preis) ||
    n(oldRow.finalUnitPrice);

  const menge = n(result.menge ?? oldRow.menge);

  const temp = normalizeEliteRow({
    ...oldRow,
    ...result,

    angebotUnitPrice: angebotEp,
    angebotTotal: round2(menge * angebotEp),
    originalPreKiPrice: angebotEp,

    rlcKiUnitPrice:
      n((result as any).rlcKiUnitPrice) ||
      n(result.finalUnitPrice) ||
      n(result.suggestedUnitPrice) ||
      n(result.baseUnitPrice),

    openAiSuggestedUnitPrice: n((result as any).openAiSuggestedUnitPrice),

    rlcPreisMin: (result as any).rlcPreisMin ?? (oldRow as any).rlcPreisMin,
    rlcPreisAvg: (result as any).rlcPreisAvg ?? (oldRow as any).rlcPreisAvg,
    rlcPreisMax: (result as any).rlcPreisMax ?? (oldRow as any).rlcPreisMax,
    rlcPreisSource:
      (result as any).rlcPreisSource ?? (oldRow as any).rlcPreisSource,
    rlcPreisGroup:
      (result as any).rlcPreisGroup ?? (oldRow as any).rlcPreisGroup,
  } as any);

  const decision = resolveBestRlcKiPrice(temp, true);
  const companyOverrideEp = getX84CompanyFrontendOverride(temp);
  const rlcKiEp = companyOverrideEp > 0 ? companyOverrideEp : decision.finalRlcKiEp;
  const finalUnitPrice = angebotEp;

  const diff = rlcKiEp > 0 ? round2(rlcKiEp - angebotEp) : 0;
  const diffPct =
    rlcKiEp > 0 && angebotEp > 0 ? round2((diff / angebotEp) * 100) : 0;

  const merged = normalizeEliteRow({
    ...oldRow,

    posNr: result.posNr || oldRow.posNr,
    kurztext: result.kurztext || oldRow.kurztext,
    langtext: result.langtext ?? oldRow.langtext,
    einheit: result.einheit || oldRow.einheit,
    menge,

    materialCost: result.materialCost ?? oldRow.materialCost,
    laborCost: result.laborCost ?? oldRow.laborCost,
    machineCost: result.machineCost ?? oldRow.machineCost,
    subcontractorCost: result.subcontractorCost ?? oldRow.subcontractorCost,
    disposalCost: result.disposalCost ?? oldRow.disposalCost,
    overheadCost: result.overheadCost ?? oldRow.overheadCost,
    riskCost: result.riskCost ?? oldRow.riskCost,
    profitCost: result.profitCost ?? oldRow.profitCost,

    angebotUnitPrice: angebotEp,
    angebotTotal: round2(menge * angebotEp),
    originalPreKiPrice: angebotEp,

    rlcKiUnitPrice: rlcKiEp,
    rlcKiTotal: rlcKiEp > 0 ? round2(menge * rlcKiEp) : 0,

    priceDifference: diff,
    priceDifferencePct: diffPct,

    baseUnitPrice: result.baseUnitPrice ?? oldRow.baseUnitPrice,
    suggestedUnitPrice: rlcKiEp || result.suggestedUnitPrice || oldRow.suggestedUnitPrice,
    finalUnitPrice,
    preis: finalUnitPrice,
    gesamt: round2(menge * finalUnitPrice),

    priceDecision: "x84",

    confidence: Math.max(
      n(result.confidence),
      n(oldRow.confidence),
      decision.confidence
    ),

    riskLevel:
      Math.abs(diffPct) >= 35
        ? "high"
        : result.riskLevel ?? oldRow.riskLevel ?? "medium",

    calculationStatus:
      Math.abs(diffPct) >= 35
        ? "warning"
        : result.calculationStatus ?? oldRow.calculationStatus ?? "manual",

    gewerk: result.gewerk ?? oldRow.gewerk,
    leistungsart: result.leistungsart ?? oldRow.leistungsart,
    bauverfahren: result.bauverfahren ?? oldRow.bauverfahren,

    rlcPreisMin: (result as any).rlcPreisMin ?? (oldRow as any).rlcPreisMin,
    rlcPreisAvg: (result as any).rlcPreisAvg ?? (oldRow as any).rlcPreisAvg,
    rlcPreisMax: (result as any).rlcPreisMax ?? (oldRow as any).rlcPreisMax,
    rlcPreisSource:
      (result as any).rlcPreisSource ?? (oldRow as any).rlcPreisSource,
    rlcPreisGroup:
      (result as any).rlcPreisGroup ?? (oldRow as any).rlcPreisGroup,

    warning: [decision.warning, result.warning ?? oldRow.warning]
      .filter(Boolean)
      .join(" · "),

    aiReason: [
      result.aiReason ?? oldRow.aiReason,
      `RLC-KI Preisentscheidung: ${decision.source}. ${decision.reason}`,
    ]
      .filter(Boolean)
      .join("\n\n"),

    source: (result as any).source || oldRow.source || "ki",

    priceBreakdown: resultBreakdown.length ? resultBreakdown : oldBreakdown,
  } as any);

  return enhanceKalkulatorInsertions(merged);
}
function keepX84AsFinalPrice(row: EliteRow): EliteRow {
  const angebotEp =
    n((row as any).angebotUnitPrice) ||
    n((row as any).originalPreKiPrice) ||
    n(row.preis) ||
    n(row.finalUnitPrice);

  /*
   * RLC-KI bleibt nur Vergleich.
   * Kein Fallback auf finalUnitPrice/preis, sonst wird X84 erneut als KI-Wert erzeugt.
   */
  const rlcKiEp =
    n((row as any).rlcKiUnitPrice) ||
    n((row as any).openAiSuggestedUnitPrice);

  const diff = rlcKiEp > 0 ? round2(rlcKiEp - angebotEp) : 0;
  const diffPct =
    rlcKiEp > 0 && angebotEp > 0 ? round2((diff / angebotEp) * 100) : 0;

  return normalizeEliteRow({
    ...row,

    // X84 bleibt finaler Angebots-/LV-Preis
    angebotUnitPrice: angebotEp,
    angebotTotal: round2(n(row.menge) * angebotEp),
    originalPreKiPrice: angebotEp,

    preis: angebotEp,
    finalUnitPrice: angebotEp,
    gesamt: round2(n(row.menge) * angebotEp),

    // RLC-KI bleibt separat
    rlcKiUnitPrice: rlcKiEp,
    rlcKiTotal: rlcKiEp > 0 ? round2(n(row.menge) * rlcKiEp) : 0,

    priceDifference: diff,
    priceDifferencePct: diffPct,
  } as unknown as EliteRow);
}
function normalizeKiWarningStatus(row: EliteRow): EliteRow {
  const warning = String(row.warning || "").trim();
  const lower = warning.toLowerCase();

  const hasRealProblem =
    lower.includes("plausibilitäts") ||
    lower.includes("openai-vorschlag") ||
    lower.includes("gezielte openai") ||
    lower.includes("kritisch") ||
    lower.includes("bestandsanschluss") ||
    lower.includes("technisch prüfen") ||
    lower.includes("erhöhtes kalkulationsrisiko") ||
    lower.includes("menge fehlt") ||
    lower.includes("einheit fehlt") ||
    lower.includes("kein ausreichend") ||
    lower.includes("außerhalb");

  const onlyRecipeHint =
    lower.includes("rezeptkalkulation verwendet") && !hasRealProblem;

  const onlyFallbackHint =
    lower.includes("nur regel-engine-fallback verwendet") && !hasRealProblem;

  if (onlyRecipeHint || onlyFallbackHint) {
    return {
      ...row,
      calculationStatus: "ok",
      riskLevel: row.riskLevel === "high" ? "medium" : row.riskLevel,
      warning: "",
    };
  }

  return row;
}
function normalizeKiWarningRows(input: EliteRow[]): EliteRow[] {
  return input.map((r) => normalizeKiWarningStatus(r));
}

function statusLabel(status?: CalcStatus): string {
  if (status === "ok") return "OK";
  if (status === "warning") return "Warnung";
  if (status === "critical") return "Kritisch";
  return "Manuell";
}

function riskLabel(risk?: RiskLevel): string {
  if (risk === "low") return "Niedrig";
  if (risk === "medium") return "Mittel";
  if (risk === "high") return "Hoch";
  return "—";
}

function riskStyle(risk?: RiskLevel): React.CSSProperties {
  if (risk === "low") return badgeOk;
  if (risk === "medium") return badgeWarn;
  if (risk === "high") return badgeCritical;
  return badgeNeutral;
}

function statusStyle(status?: CalcStatus): React.CSSProperties {
  if (status === "ok") return badgeOk;
  if (status === "warning") return badgeWarn;
  if (status === "critical") return badgeCritical;
  return badgeNeutral;
}

function rowHasNoDb(row: EliteRow): boolean {
  const warning = String(row.warning || "").toLowerCase();
  const reason = String(row.aiReason || "").toLowerCase();

  return (
    warning.includes("keine passende erfahrung") ||
    warning.includes("keine passende") ||
    reason.includes("kein ausreichend ähnlicher datenbanktreffer") ||
    reason.includes("kein direkter datenbanktreffer")
  );
}

function rowProblem(row: EliteRow): string {
  if (kiIsStructuralRow(row)) {
    return "Strukturzeile / Titel – keine Kalkulation nötig";
  }
  if (!String(row.posNr || "").trim()) return "Positionsnummer fehlt";
  if (!String(row.kurztext || "").trim()) return "Kurztext fehlt";
  if (!String(row.langtext || "").trim()) return "Langtext fehlt";
  if (!String(row.einheit || "").trim()) return "Einheit fehlt";
  if (!row.priceBreakdown?.length) return "Preisaufbau fehlt";
  if (n(row.menge) <= 0) return "Menge fehlt oder ist 0";
  if (getUnitPrice(row) <= 0) return "Einheitspreis fehlt";
  if (row.calculationStatus === "critical") {
    return row.warning || "Kritisch prüfen";
  }
  if (row.riskLevel === "high") return "Hohes Risiko";
  if (rowHasNoDb(row) && row.calculationStatus !== "manual") {
    return "Ohne DB-Treffer";
  }
  if (n(row.confidence) < 0.7) return "Sicherheit niedrig";
  if (row.calculationStatus === "warning") {
    return row.warning || "Warnung prüfen";
  }

  return "OK";
}

function isSafeRow(row: EliteRow): boolean {
  if (kiIsStructuralRow(row)) return false;

  return (
    getUnitPrice(row) > 0 &&
    n(row.menge) > 0 &&
    String(row.posNr || "").trim().length > 0 &&
    String(row.kurztext || "").trim().length >= 8 &&
    String(row.langtext || "").trim().length >= 25 &&
    String(row.einheit || "").trim().length > 0 &&
    Array.isArray(row.priceBreakdown) &&
    row.priceBreakdown.length > 0 &&
    n(row.confidence) >= 0.75 &&
    row.calculationStatus !== "critical" &&
    row.riskLevel !== "high"
  );
}

function riskFromDb(risk?: string): RiskLevel {
  if (risk === "niedrig") return "low";
  if (risk === "hoch" || risk === "kritisch") return "high";
  return "medium";
}

function getCurrentBreakdown(row: EliteRow): PriceBreakdownLine[] {
  const existing = normalizeBreakdown(row.priceBreakdown);
  if (existing.length) return existing;

  return buildAutomaticPriceBreakdown(row);
}

function breakdownGroupTotal(
  row: EliteRow,
  groups: PriceBreakdownGroup[]
): number {
  return round2(
    getCurrentBreakdown(row)
      .filter((line) => groups.includes(line.group))
      .reduce((sum, line) => sum + n(line.total), 0)
  );
}

function databaseCostsFromCurrentRow(row: EliteRow) {
  return {
    materialCost: breakdownGroupTotal(row, ["Material"]),
    laborCost: breakdownGroupTotal(row, ["Personal"]),
    machineCost: breakdownGroupTotal(row, ["Maschinen"]),
    transportCost: breakdownGroupTotal(row, ["LKW / Transport"]),
    subcontractorCost: breakdownGroupTotal(row, ["Fremdleistung"]),
    disposalCost: breakdownGroupTotal(row, ["Entsorgung"]),
    overheadCost: breakdownGroupTotal(row, ["Gemeinkosten"]),
    riskCost: breakdownGroupTotal(row, ["Risiko"]),
    profitCost: breakdownGroupTotal(row, ["Gewinn"]),
  };
}

function saveRowsToDatenbank(
  rows: EliteRow[],
  projectKey: string,
  projectTitle = ""
): number {
  const valid = rows.filter((r) => {
    if (kiIsStructuralRow(r)) return false;

    const textOk = String(r.kurztext || r.posNr || "").trim().length > 0;
    const priceOk = getUnitPrice(r) > 0 || sumBreakdown(getCurrentBreakdown(r)) > 0;
    return textOk && priceOk;
  });

  if (!valid.length) return 0;

  KalkulationsDatenbank.bulkUpsert(
    valid.map((r) => {
      const currentBreakdown = getCurrentBreakdown(r);
      const costs = databaseCostsFromCurrentRow({
        ...r,
        priceBreakdown: currentBreakdown,
      });

      const ep =
        sumBreakdown(currentBreakdown) > 0
          ? sumBreakdown(currentBreakdown)
          : getUnitPrice(r);

      const gp = round2(n(r.menge) * ep * (1 - n(r.rabatt) / 100));

      return KalkulationsDatenbank.fromCalculatedPosition({
        quelle: "ki",
        projektCode: projectKey,
        projektName: projectTitle,

        posNr: r.posNr || "",
        kurztext: r.kurztext || "",
        langtext: r.langtext || "",
        einheit: r.einheit || "",
        menge: n(r.menge),

        materialCost: costs.materialCost,
        laborCost: costs.laborCost,
        machineCost: costs.machineCost,
        transportCost: costs.transportCost,
        subcontractorCost: costs.subcontractorCost,
        disposalCost: costs.disposalCost,
        overheadCost: costs.overheadCost,
        riskCost: costs.riskCost,
        profitCost: costs.profitCost,

        finalUnitPrice: ep,
        totalNet: gp,

        gewerk: r.gewerk || "",
        leistungsart: r.leistungsart || "",
        bauverfahren: r.bauverfahren || "",
        riskLevel: r.riskLevel || "medium",
        confidence: n(r.confidence, 0.75),

        aiReason: `${r.aiReason || ""}\n\nPreisaufbau:\n${breakdownText({
          ...r,
          priceBreakdown: currentBreakdown,
        })}`,

        warning: r.warning || "",
      });
    })
  );

  return valid.length;
}

function findDatenbankMatches(row: EliteRow | null): KalkulationsSuchTreffer[] {
  if (!row) return [];

  return KalkulationsDatenbank.search(
    {
      posNr: row.posNr || "",
      kurztext: row.kurztext || "",
      langtext: row.langtext || "",
      einheit: row.einheit || "",
      menge: n(row.menge),
      parameter: {
        gewerk: row.gewerk || "",
        leistungsart: row.leistungsart || "",
        bauverfahren: row.bauverfahren || "",
        menge: n(row.menge),
        einheit: row.einheit || "",
      },
    },
    5
  );
}

function datenbankEntryToRowPatch(entry: KalkulationsErfahrung): Partial<EliteRow> {
  const divisor = Math.max(1, n(entry.menge));

  const patch = normalizeEliteRow({
    materialCost: round2(n(entry.kosten.material) / divisor),
    laborCost: round2(n(entry.kosten.lohn) / divisor),
    machineCost: round2(n(entry.kosten.maschinen) / divisor),
    subcontractorCost: round2(n(entry.kosten.fremdleistung) / divisor),
    disposalCost: round2(n(entry.kosten.entsorgung) / divisor),
    overheadCost: round2(n(entry.kosten.gemeinkosten) / divisor),
    riskCost: round2(n(entry.kosten.risiko) / divisor),
    profitCost: round2(n(entry.kosten.gewinn) / divisor),

    baseUnitPrice: n(entry.kosten.epNetto),
    suggestedUnitPrice: n(entry.kosten.epNetto),
    finalUnitPrice: n(entry.kosten.epNetto),
    preis: n(entry.kosten.epNetto),

    riskLevel: riskFromDb(entry.risiko),
    calculationStatus: "ok",
    confidence: n(entry.confidence, 0.75),

    gewerk: entry.parameter?.gewerk || "",
    leistungsart: entry.parameter?.leistungsart || "",
    bauverfahren: entry.parameter?.bauverfahren || "",

    warning: "",
    aiReason: entry.kiHinweis
      ? `${entry.kiHinweis}\n\nAus Kalkulationsdatenbank übernommen.`
      : "Aus Kalkulationsdatenbank übernommen.",
  });

  return {
    ...patch,
    priceBreakdown: buildAutomaticPriceBreakdown(patch),
  };
}

/* ================= CSV / GAEB HELPERS ================= */

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inside = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"' && inside && next === '"') {
      cur += '"';
      i += 1;
      continue;
    }

    if (ch === '"') {
      inside = !inside;
      continue;
    }

    if ((ch === ";" || ch === ",") && !inside) {
      out.push(cur.trim());
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur.trim());
  return out;
}

function parseImportedCsv(text: string): Partial<EliteRow>[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) =>
    normText(h).replace(/[^a-z0-9]+/g, "")
  );

  function get(row: string[], names: string[]) {
    for (const name of names) {
      const idx = headers.indexOf(name);
      if (idx >= 0) return row[idx] ?? "";
    }
    return "";
  }

  return lines.slice(1).map((line) => {
    const row = splitCsvLine(line);
    const ep = n(get(row, ["epfinal", "preis", "ep", "unitprice", "einheitspreis"]));

    const parsed = normalizeEliteRow({
      id: safeId(),
      posNr: get(row, ["posnr", "position", "lvpos", "positionsnummer"]),
      kurztext: get(row, ["kurztext", "text", "leistung"]),
      langtext: get(row, ["langtext", "beschreibung"]),
      einheit: get(row, ["einheit", "me", "unit"]),
      menge: n(get(row, ["menge", "qty", "quantity"])),
      preis: ep,
      finalUnitPrice: ep,
      materialCost: n(get(row, ["material"])),
      laborCost: n(get(row, ["lohn", "labor"])),
      machineCost: n(get(row, ["maschine", "machine"])),
      subcontractorCost: n(get(row, ["fremdleistung", "subcontractor"])),
      disposalCost: n(get(row, ["entsorgung", "disposal"])),
      overheadCost: n(get(row, ["gemeinkosten", "overhead"])),
      riskCost: n(get(row, ["risiko", "risk"])),
      profitCost: n(get(row, ["gewinn", "profit"])),
      warning: get(row, ["warnung", "warning"]),
      aiReason: get(row, ["kibegruendung", "aireason"]),
      riskLevel: "medium",
      calculationStatus: ep > 0 ? "manual" : "critical",
    });

    return {
      ...parsed,
      priceBreakdown: buildAutomaticPriceBreakdown(parsed),
    };
  });
}

function xmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildLocalGaebFallback(rows: EliteRow[], mode: "x83" | "x84"): string {
  const now = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<RLC-GAEB-EXPORT mode="${mode.toUpperCase()}" createdAt="${now}">
  <Info>Lokaler Fallback-Export. Für echten GAEB-Standard Serverroute verwenden.</Info>
  <Positions>
${rows
  .map(
    (r) => `    <Position>
      <PosNr>${xmlEscape(r.posNr)}</PosNr>
      <Kurztext>${xmlEscape(r.kurztext)}</Kurztext>
      <Langtext>${xmlEscape(r.langtext)}</Langtext>
      <Einheit>${xmlEscape(r.einheit)}</Einheit>
      <Menge>${n(r.menge)}</Menge>
      <EP>${getUnitPrice(r)}</EP>
      <Gesamt>${lineNet(r)}</Gesamt>
      <Preisaufbau>${xmlEscape(breakdownText(r))}</Preisaufbau>
      <KI>${xmlEscape(r.aiReason)}</KI>
    </Position>`
  )
  .join("\n")}
  </Positions>
</RLC-GAEB-EXPORT>`;
}

/* ================= COMPONENT ================= */

export default function KalkulationMitKI() {
  const projectCtx: any = useProject() as any;
  const projectKey = getProjectKey(projectCtx);
  const projectTitle = getProjectTitle(projectCtx);
  const { eliteCalculateRows, loading } = useKiSuggest();
  const navigate = useNavigate();

  const csvInputRef = React.useRef<HTMLInputElement | null>(null);
const importHandoffDoneRef = React.useRef(false);

  const [rows, setRows] = React.useState<EliteRow[]>([]);

  React.useEffect(() => {
    if (!projectKey) return;

    let alive = true;

    KalkulationsDatenbank.listServer()
      .then(() => {
        if (!alive) return;

        /*
         * Nach Firmen-Datenbank-Sync UI neu berechnen,
         * damit getX84CompanyFrontendOverride() die x84-company-baseline nutzt.
         */
        setRows((prev) =>
          prev.map((r) => cleanRlcKiWarningState(normalizeEliteRow({ ...r })))
        );
      })
      .catch(() => {
        // Offline / nicht angemeldet: bestehender lokaler Stand bleibt aktiv.
      });

    return () => {
      alive = false;
    };
  }, [projectKey]);
  const [selectedId, setSelectedId] = React.useState<string>("");
  const [auftraege, setAuftraege] = React.useState<Auftrag[]>(() => {
  AuftragStore.ensureDefault(projectKey);
  return AuftragStore.list();
});

const [selectedAuftragId, setSelectedAuftragId] = React.useState<string>(() => {
  const haupt = AuftragStore.ensureDefault(projectKey);
  return haupt.id;
});

const selectedAuftrag = React.useMemo(
  () => auftraege.find((a) => a.id === selectedAuftragId) || null,
  [auftraege, selectedAuftragId]
);
    const [serverBusy, setServerBusy] = React.useState(false);
  const [serverStatus, setServerStatus] = React.useState("");
  const [lastKiSource, setLastKiSource] = React.useState("");
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [activeHint, setActiveHint] = React.useState("");

  /**
   * UI-Logik:
   * - KI-Assistent öffnet automatisch beim Seitenstart.
   * - Der Nutzer kann ihn schließen und später wieder öffnen.
   * - LV-Aktionen werden kompakt in ein Menü gelegt.
   * - Optionale Tabellen-Spalten können ausgeblendet bleiben.
   */
  const [showQuickActions, setShowQuickActions] = React.useState(false);
  const [showLvActions, setShowLvActions] = React.useState(false);
  const [showAdvancedLvColumns, setShowAdvancedLvColumns] =
    React.useState(false);

  const [viewFilter, setViewFilter] = React.useState<ViewFilter>("alle");
  const [selectedDuplicateIds, setSelectedDuplicateIds] = React.useState<string[]>([]);
  const [selectedOpenAiIds, setSelectedOpenAiIds] = React.useState<string[]>([]);
  const [lvPage, setLvPage] = React.useState(1);
  const [lvPageSize, setLvPageSize] = React.useState(5);
  const [showCommercialSettings, setShowCommercialSettings] =
    React.useState(false);
  const [showChapterSettings, setShowChapterSettings] = React.useState(false);

  const [mwst, setMwst] = React.useState(19);
  const [globalMarkup, setGlobalMarkup] = React.useState<number>(() => {
    const saved = localStorage.getItem("rlc_kalkulation_global_markup_v1");
    return saved == null ? 10 : Number(saved);
  });

  React.useEffect(() => {
    localStorage.setItem(
      "rlc_kalkulation_global_markup_v1",
      String(globalMarkup)
    );
  }, [globalMarkup]);

  const [kapRabatt, setKapRabatt] = React.useState<Record<string, number>>({});
  const [kapMarkup, setKapMarkup] = React.useState<Record<string, number>>({});

  const [catalogRows, setCatalogRows] = React.useState<CatalogPos[]>(() =>
  Catalog.list()
);
const [catalogQuery, setCatalogQuery] = React.useState("");
const [catalogGroup, setCatalogGroup] = React.useState<
  "Alle" | "Material" | "Arbeiter" | "Maschinen" | "Sonstiges"
>("Alle");

const visibleCatalogRows = React.useMemo(() => {
  const q = catalogQuery.trim().toLowerCase();

  return catalogRows
    .filter((r) => {
      if (catalogGroup !== "Alle" && r.gruppe !== catalogGroup) return false;

      if (!q) return true;

      return `${r.posNr} ${r.kurztext} ${r.einheit}`
        .toLowerCase()
        .includes(q);
    })
    .slice(0, 300);
}, [catalogRows, catalogQuery, catalogGroup]);

  const [company] = React.useState<CompanyData>({
    name: "RLC Bausoftware GmbH",
    address: "Musterstraße 12, 80333 München",
    phone: "+49 89 123456",
    email: "info@rlc-bau.de",
    logoUrl: "/rlc-logo.png",
  });

  const [client, setClient] = React.useState<ClientData>({
    name: "Muster Bau GmbH",
    address: "Hauptstraße 5, 50667 Köln",
  });

  const [offer, setOffer] = React.useState<OfferData>({
    number: `ANG-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
    place: "München",
    notes:
      "Zahlungsbedingungen: 30 Tage netto. Angebot gültig 30 Tage. Preise basieren auf KI-gestützter Kalkulation und technischer Plausibilitätsprüfung.",
  });

const chapters = React.useMemo(() => {
  const map = new Map<string, EliteRow[]>();

  for (const r of rows) {
    const ch = getChapter(r.posNr);
    if (!map.has(ch)) map.set(ch, []);
    map.get(ch)!.push(r);
  }

  return map;
}, [rows]);

const filteredRows = React.useMemo(() => {
  const duplicateMap = new Map<string, EliteRow[]>();

  for (const row of rows) {
    if (kiIsStructuralRow(row)) continue;

    const text = normText(`${row.kurztext || ""} ${row.langtext || ""}`)
      .replace(/[^a-z0-9äöüß]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length < 8) continue;

    const key = [
      text.slice(0, 140),
      String(row.einheit || "").trim().toLowerCase(),
      round2(n(row.menge)),
      round2(getUnitPrice(row)),
    ].join("|");

    if (!duplicateMap.has(key)) duplicateMap.set(key, []);
    duplicateMap.get(key)!.push(row);
  }

  const duplicateIds = new Set(
    Array.from(duplicateMap.values())
      .filter((group) => group.length > 1)
      .flatMap((group) => group.map((row) => row.id))
  );

  return rows.filter((r) => {
    if (selectedAuftragId) {
      const rowAuftragId = String(r.auftragId || "").trim();
      const rowAuftragIsKnown = rowAuftragId
        ? auftraege.some((a) => a.id === rowAuftragId)
        : false;

      if (rowAuftragIsKnown && rowAuftragId !== selectedAuftragId) return false;
    }

    if (viewFilter === "alle") return true;
    if (viewFilter === "kritisch") return !kiIsStructuralRow(r) && r.calculationStatus === "critical";
    if (viewFilter === "warnungen") return !kiIsStructuralRow(r) && r.calculationStatus === "warning";
    if (viewFilter === "hochrisiko") return !kiIsStructuralRow(r) && r.riskLevel === "high";
    if (viewFilter === "sicher") return !kiIsStructuralRow(r) && isSafeRow(r);

    if (viewFilter === "ohneDb") {
      return !kiIsStructuralRow(r) && rowHasNoDb(r) && r.calculationStatus !== "manual";
    }

    if (viewFilter === "mengeFehlt") return !kiIsStructuralRow(r) && n(r.menge) <= 0;
    if (viewFilter === "preisFehlt") return !kiIsStructuralRow(r) && getUnitPrice(r) <= 0;
    if (viewFilter === "einheitFehlt") return !kiIsStructuralRow(r) && !String(r.einheit || "").trim();
    if (viewFilter === "urkalkulationFehlt") return !kiIsStructuralRow(r) && (!Array.isArray(r.priceBreakdown) || r.priceBreakdown.length === 0);
    if (viewFilter === "doppelte") return duplicateIds.has(r.id);

    return true;
  });
}, [rows, viewFilter, selectedAuftragId, auftraege]);

const selectedRow = React.useMemo(
  () => filteredRows.find((r) => r.id === selectedId) || filteredRows[0] || null,
  [filteredRows, selectedId]
);

const datenbankMatches = React.useMemo(
  () => findDatenbankMatches(selectedRow),
  [selectedRow]
);

React.useLayoutEffect(() => {
  if (!projectKey) return;
  importHandoff();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [projectKey]);

React.useEffect(() => {
  if (!filteredRows.length) {
    setSelectedId("");
    return;
  }

  const exists = filteredRows.some((r) => r.id === selectedId);
  if (!exists) setSelectedId(filteredRows[0].id);
}, [filteredRows, selectedId]);

React.useEffect(() => {
  if (!selectedRow) {
    setActiveHint("Keine Position gewählt.");
    return;
  }

  const hints: string[] = [];

  if (!selectedRow.kurztext.trim()) hints.push("Kurztext fehlt.");
  if (!selectedRow.langtext.trim()) hints.push("Langtext fehlt.");
  if (!selectedRow.einheit.trim()) hints.push("Einheit fehlt.");
  if (!selectedRow.priceBreakdown?.length) hints.push("Preisaufbau fehlt.");
  if (n(selectedRow.menge) <= 0) hints.push("Menge fehlt oder ist 0.");
  if (getUnitPrice(selectedRow) <= 0) hints.push("Einheitspreis fehlt.");
  if (selectedRow.riskLevel === "high") hints.push("Hohes Risiko prüfen.");

  if (selectedRow.calculationStatus === "critical") {
    hints.push("Kalkulation kritisch: Kostenansätze prüfen.");
  }

  if (datenbankMatches.length) {
    hints.push(
      `Kalkulationsdatenbank kennt ${datenbankMatches.length} ähnliche Position(en).`
    );
  }

  setActiveHint(hints.length ? hints.join(" ") : "Position wirkt plausibel.");
}, [selectedRow, datenbankMatches.length]);

function importHandoff() {
  if (importHandoffDoneRef.current && rows.length > 0) {
    return;
  }

  importHandoffDoneRef.current = true;
  function extractRowsFromParsed(parsed: any): any[] {
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.rows)) return parsed.rows;
    if (Array.isArray(parsed?.items)) return parsed.items;
    if (Array.isArray(parsed?.data)) return parsed.data;
    if (Array.isArray(parsed?.data?.rows)) return parsed.data.rows;
    if (Array.isArray(parsed?.positions)) return parsed.positions;
    if (Array.isArray(parsed?.lvPositions)) return parsed.lvPositions;
    return [];
  }

  function normalizeImportedStorageRows(rawRows: any[]): EliteRow[] {
    return rawRows
      .map((x: any) => {
        const ep =
          n(x.angebotUnitPrice) ||
          n(x.originalPreKiPrice) ||
          n(x.preis) ||
          n(x.ep) ||
          n(x.unitPrice) ||
          n(x.finalUnitPrice);

        return normalizeEliteRow({
          ...x,
          id: String(x.id || safeId()),
          posNr: x.posNr || x.pos || x.position || x.lvPos || "",
          kurztext: x.kurztext || x.text || x.title || x.shortText || "",
          langtext: x.langtext || x.description || x.longText || "",
          einheit: x.einheit || x.unit || x.me || "",
          menge: n(x.menge ?? x.qty ?? x.quantity),

          angebotUnitPrice: n(x.angebotUnitPrice) || ep,
          angebotTotal: round2(n(x.menge ?? x.qty ?? x.quantity) * ep),
          originalPreKiPrice: n(x.originalPreKiPrice) || ep,

          preis: n(x.preis) || ep,
          finalUnitPrice: n(x.finalUnitPrice) || ep,
          suggestedUnitPrice: n(x.suggestedUnitPrice) || ep,

          auftragId: x.auftragId || selectedAuftragId || "",
          auftragName: x.auftragName || selectedAuftrag?.name || "",
          auftragType: x.auftragType || selectedAuftrag?.type,

          confidence: typeof x.confidence === "number" ? x.confidence : 0.75,
          calculationStatus: x.calculationStatus || "manual",
          riskLevel: x.riskLevel || "medium",
        });
      })
      .filter((r: EliteRow) => {
        return (
          String(r.posNr || "").trim() ||
          String(r.kurztext || "").trim() ||
          String(r.langtext || "").trim()
        );
      });
  }

  function tryLoadRowsFromKey(key: string): EliteRow[] {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];

      const parsed = JSON.parse(raw);
      const rawRows = extractRowsFromParsed(parsed);
      if (!rawRows.length) return [];

      return normalizeImportedStorageRows(rawRows).map((r) =>
        kiIsStructuralRow(r)
          ? normalizeEliteRow(kiPrepareStructuralRow(r))
          : enhanceKalkulatorInsertions(r)
      );
    } catch {
      return [];
    }
  }

  const keys = [
    localBackupKey(projectKey),
    `rlc_kalkulation_mit_ki_elite_v1:${projectKey}`,
    `rlc_gaeb_import_v1:${projectKey}`,
    `RLC_POSITIONLV_${projectKey}`,
  ];

  for (const key of keys) {
    const loaded = tryLoadRowsFromKey(key);

    if (loaded.length) {
      const safeLoaded = sanitizeRowsForStorage(loaded);
      setRows(safeLoaded);
      LV.setAll(safeLoaded as LVPos[]);

      try {
        localStorage.setItem(
          localBackupKey(projectKey),
          JSON.stringify({
            meta: {
              projectKey,
              projectTitle,
              restoredFrom: key,
              restoredAt: new Date().toISOString(),
            },
            rows: safeLoaded,
          })
        );
      } catch {
        //
      }

      setServerStatus(`${safeLoaded.length} LV-Positionen geladen`);
      setTimeout(() => setServerStatus(""), 2500);
      return;
    }
  }

  // Kein globaler LV-Fallback:
  // Neues Projekt bleibt leer, bis explizit GAEB/X83/X84 importiert wird.
  setRows([]);
}

const lvTotalPages = React.useMemo(() => {
  return Math.max(1, Math.ceil(filteredRows.length / lvPageSize));
}, [filteredRows.length, lvPageSize]);

React.useEffect(() => {
  if (lvPage > lvTotalPages) setLvPage(lvTotalPages);
}, [lvPage, lvTotalPages]);

const visibleLvRows = React.useMemo(() => {
  return filteredRows;
}, [filteredRows]);

const filteredChapters = React.useMemo(() => {
  const map = new Map<string, EliteRow[]>();

  for (const r of visibleLvRows) {
    const ch = getChapter(r.posNr);
    if (!map.has(ch)) map.set(ch, []);
    map.get(ch)!.push(r);
  }

  return map;
}, [visibleLvRows]);

const problemCounts = React.useMemo(() => {
  const relevantRows = rows.filter((r) => !kiIsStructuralRow(r));

  return {
    kritisch: relevantRows.filter((r) => r.calculationStatus === "critical").length,
    warnungen: relevantRows.filter(
      (r) => r.calculationStatus === "warning" || r.riskLevel === "high"
    ).length,
    hochrisiko: relevantRows.filter((r) => r.riskLevel === "high").length,
    ohneDb: relevantRows.filter(
      (r) => rowHasNoDb(r) && r.calculationStatus !== "manual"
    ).length,
    sicher: relevantRows.filter(isSafeRow).length,

    einheitFehlt: relevantRows.filter((r) => !String(r.einheit || "").trim()).length,
    kurztextFehlt: relevantRows.filter((r) => !String(r.kurztext || "").trim()).length,
    langtextFehlt: relevantRows.filter((r) => !String(r.langtext || "").trim()).length,
    preisFehlt: relevantRows.filter((r) => round2(getUnitPrice(r)) <= 0).length,
    preisaufbauFehlt: relevantRows.filter(
      (r) => !Array.isArray(r.priceBreakdown) || r.priceBreakdown.length === 0
    ).length,
    mengeFehlt: relevantRows.filter((r) => n(r.menge) <= 0).length,
  };
}, [rows]);
const duplicateGroups = React.useMemo(() => {
  const map = new Map<string, EliteRow[]>();

  for (const row of rows) {
    if (kiIsStructuralRow(row)) continue;

    const text = normText(`${row.kurztext || ""} ${row.langtext || ""}`)
      .replace(/[^a-z0-9äöüß]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length < 8) continue;

    const key = [
      text.slice(0, 140),
      String(row.einheit || "").trim().toLowerCase(),
      round2(n(row.menge)),
      round2(getUnitPrice(row)),
    ].join("|");

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }

  return Array.from(map.values())
    .filter((group) => group.length > 1)
    .map((group) =>
      [...group].sort((a, b) => {
        const pa = String(a.posNr || "").localeCompare(String(b.posNr || ""), "de", {
          numeric: true,
        });
        if (pa !== 0) return pa;

        return String(a.id).localeCompare(String(b.id));
      })
    );
}, [rows]);

const duplicateCountToDelete = React.useMemo(() => {
  return duplicateGroups.reduce((sum, group) => sum + Math.max(0, group.length - 1), 0);
}, [duplicateGroups]);

React.useEffect(() => {
  function handleGlobalKiCommand(event: Event) {
    const detail = (event as CustomEvent<{ filter?: string; action?: string }>).detail;
    if (!detail) return;

    const filter = String(detail.filter || "");
    const action = String(detail.action || "");

    // Wenn die globale KI einen Prüf-Filter setzt, muss die Liste alle Aufträge zeigen,
    // sonst kann z.B. "Menge fehlt" 1 melden, aber in "Hauptauftrag" 0 anzeigen.
    if (filter) {
      setSelectedAuftragId("");
    }

    if (filter === "alle") setViewFilter("alle");
    if (filter === "kritisch") setViewFilter("kritisch");
    if (filter === "warnungen") setViewFilter("warnungen");
    if (filter === "hochrisiko") setViewFilter("hochrisiko");
    if (filter === "ohneDb") setViewFilter("ohneDb");
    if (filter === "sicher") setViewFilter("sicher");
    if (filter === "mengeFehlt") setViewFilter("mengeFehlt");
    if (filter === "preisFehlt") setViewFilter("preisFehlt");
    if (filter === "einheitFehlt") setViewFilter("einheitFehlt");
    if (filter === "urkalkulationFehlt") setViewFilter("urkalkulationFehlt");
    if (filter === "doppelte") setViewFilter("doppelte");

    if (action === "runKi") void runEliteCalculation(false);
    if (action === "completeMissing") autoCompleteMissingFields();
    if (action === "selectDuplicates") selectDuplicateRowsToDelete();

    setLvPage(1);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  window.addEventListener("rlc:kalkulation-filter", handleGlobalKiCommand);

  return () => {
    window.removeEventListener("rlc:kalkulation-filter", handleGlobalKiCommand);
  };
});


React.useEffect(() => {
  const nextR = { ...kapRabatt };
  const nextM = { ...kapMarkup };

  for (const ch of chapters.keys()) {
    if (nextR[ch] == null) nextR[ch] = 0;
    if (nextM[ch] == null) nextM[ch] = 0;
  }

  for (const k of Object.keys(nextR)) if (!chapters.has(k)) delete nextR[k];
  for (const k of Object.keys(nextM)) if (!chapters.has(k)) delete nextM[k];

  setKapRabatt(nextR);
  setKapMarkup(nextM);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [chapters.size]);

const chapterTotals = React.useMemo(() => {
  const out: Record<
    string,
    {
      netRaw: number;
      afterChapterDiscount: number;
      afterChapterMarkup: number;
      risk: number;
      profit: number;
    }
  > = {};

  chapters.forEach((list, ch) => {
    const netRaw = list.reduce((sum, r) => sum + lineNet(r), 0);
    const risk = list.reduce((sum, r) => sum + n(r.riskCost) * n(r.menge), 0);
    const profit = list.reduce(
      (sum, r) => sum + n(r.profitCost) * n(r.menge),
      0
    );

    const afterChapterDiscount = netRaw * (1 - n(kapRabatt[ch]) / 100);
    const afterChapterMarkup =
      afterChapterDiscount * (1 + n(kapMarkup[ch]) / 100);

    out[ch] = {
      netRaw: round2(netRaw),
      afterChapterDiscount: round2(afterChapterDiscount),
      afterChapterMarkup: round2(afterChapterMarkup),
      risk: round2(risk),
      profit: round2(profit),
    };
  });

  return out;
}, [chapters, kapRabatt, kapMarkup]);

const summary = React.useMemo(() => {
  const netBeforeGlobal = Object.values(chapterTotals).reduce(
    (sum, total) => sum + total.afterChapterMarkup,
    0
  );

  const globalMarkupValue = netBeforeGlobal * (globalMarkup / 100);
  const net = netBeforeGlobal + globalMarkupValue;
  const tax = net * (mwst / 100);
  const gross = net + tax;

    const angebotNet = round2(rows.reduce((sum, r) => sum + offerLineNet(r), 0));
  const angebotTax = round2(angebotNet * (mwst / 100));
  const angebotGross = round2(angebotNet + angebotTax);

  const rlcKiNet = round2(rows.reduce((sum, r) => sum + rlcKiLineNet(r), 0));
  const rlcKiTax = round2(rlcKiNet * (mwst / 100));
  const rlcKiGross = round2(rlcKiNet + rlcKiTax);

  const diffNet = round2(rlcKiNet - angebotNet);
  const diffPct = angebotNet > 0 ? round2((diffNet / angebotNet) * 100) : 0;

  const directCost = rows.reduce(
    (sum, r) =>
      sum +
      n(r.menge) *
        (n(r.materialCost) +
          n(r.laborCost) +
          n(r.machineCost) +
          n(r.subcontractorCost) +
          n(r.disposalCost)),
    0
  );

  const riskSum = rows.reduce(
    (sum, r) => sum + n(r.riskCost) * n(r.menge),
    0
  );

  const profitSum = rows.reduce(
    (sum, r) => sum + n(r.profitCost) * n(r.menge),
    0
  );

  const priced = rows.filter((r) => getUnitPrice(r) > 0).length;

  const avgConfidence = rows.length
    ? rows.reduce((sum, r) => sum + n(r.confidence), 0) / rows.length
    : 0;

  return {
    net: round2(net),
    gross: round2(gross),
    tax: round2(tax),

    angebotNet,
    angebotTax,
    angebotGross,

    rlcKiNet,
    rlcKiTax,
    rlcKiGross,
    diffNet,
    diffPct,
    directCost: round2(directCost),
    riskSum: round2(riskSum),
    profitSum: round2(profitSum),
    globalMarkupValue: round2(globalMarkupValue),
    marginPct: net > 0 ? round2((profitSum / net) * 100) : 0,
    priced,
    total: rows.length,
    coveragePct: rows.length ? Math.round((priced / rows.length) * 100) : 0,
    avgConfidence: round2(avgConfidence),
    highRisk: rows.filter((r) => r.riskLevel === "high").length,
    warnings: rows.filter((r) => r.calculationStatus === "warning").length,
    critical: rows.filter((r) => r.calculationStatus === "critical").length,
    knowledgeCount: KalkulationsDatenbank.count(),
  };
}, [rows, chapterTotals, globalMarkup, mwst]);

const selectedAuftragSummary = React.useMemo(() => {
  const list = selectedAuftragId
    ? rows.filter((r) => r.auftragId === selectedAuftragId)
    : rows;

  const net = round2(list.reduce((sum, r) => sum + lineNet(r), 0));
  const count = list.length;
  const priced = list.filter((r) => getUnitPrice(r) > 0).length;

  return { net, count, priced };
}, [rows, selectedAuftragId]);

const topPriceDiffRows = React.useMemo(() => {
  return rows.filter((r) => !kiIsStructuralRow(r) && getRlcKiUnitPrice(r) > 0)
    .map((r) => {
      const angebotEp = getOfferUnitPrice(r);
      const kiEp = getRlcKiUnitPrice(r);

      const menge = n(r.menge);
      const angebotGp = round2(menge * angebotEp);
      const kiGp = round2(menge * kiEp);
      const diffEp = round2(kiEp - angebotEp);
      const diffGp = round2(kiGp - angebotGp);
      const diffPct = angebotEp > 0 ? round2((diffEp / angebotEp) * 100) : 0;

      const absDiffPct = Math.abs(diffPct);

      let empfehlung = "OK";
      if (absDiffPct > 30) empfehlung = "Kritisch";
      else if (absDiffPct > 15) empfehlung = "Prüfen";
      else if (absDiffPct > 5) empfehlung = "Leicht abweichend";

      return {
        id: r.id,
        posNr: r.posNr,
        kurztext: r.kurztext,
        einheit: r.einheit,
        menge,
        angebotEp,
        angebotGp,
        kiEp,
        kiGp,
        diffEp,
        diffGp,
        diffPct,
        empfehlung,
      };
    })
    .filter((r) => r.angebotEp > 0 && r.kiEp > 0 && Math.abs(r.diffPct) > 5)
    .sort((a, b) => Math.abs(b.diffGp) - Math.abs(a.diffGp))
    .slice(0, 20);
}, [rows]);
const activeKiDecision = React.useMemo(() => {
  if (!rows.length) {
    return {
      level: "info",
      title: "Keine LV-Positionen vorhanden",
      text: "Lade zuerst ein Leistungsverzeichnis oder füge Positionen hinzu. Danach kann die KI aktiv prüfen.",
      nextLabel: "LV importieren",
      filter: "alle",
      action: "",
      readyForExport: false,
      shouldRecalculate: false,
    };
  }

  if (problemCounts.mengeFehlt > 0) {
    return {
      level: "critical",
      title: "Mengen fehlen",
      text: `${problemCounts.mengeFehlt} Position(en) haben keine gültige Menge. Ohne Menge ist Angebot, Urkalkulation und Abrechnung nicht belastbar.`,
      nextLabel: "Mengen prüfen",
      filter: "mengeFehlt",
      action: "",
      readyForExport: false,
      shouldRecalculate: false,
    };
  }

  if (problemCounts.einheitFehlt > 0) {
    return {
      level: "critical",
      title: "Einheiten fehlen",
      text: `${problemCounts.einheitFehlt} Position(en) haben keine Einheit. Die KI kann diese Positionen nicht sauber kalkulieren.`,
      nextLabel: "Einheiten prüfen",
      filter: "einheitFehlt",
      action: "",
      readyForExport: false,
      shouldRecalculate: false,
    };
  }

  if (problemCounts.preisFehlt > 0 || problemCounts.preisaufbauFehlt > 0) {
    return {
      level: "warning",
      title: "Kalkulation unvollständig",
      text: `${problemCounts.preisFehlt} EP fehlen, ${problemCounts.preisaufbauFehlt} Urkalkulation(en) fehlen. Starte zuerst die KI-Kalkulation für offene Positionen.`,
      nextLabel: "KI starten",
      filter: "preisFehlt",
      action: "runKi",
      readyForExport: false,
      shouldRecalculate: false,
    };
  }

  if (duplicateGroups.length > 0) {
    return {
      level: "warning",
      title: "Doppelte LV-Positionen erkannt",
      text: `${duplicateGroups.length} Duplikatgruppe(n) gefunden. Vor Angebot/GAEB sollten doppelte Positionen geprüft oder gelöscht werden.`,
      nextLabel: "Doppelte prüfen",
      filter: "doppelte",
      action: "selectDuplicates",
      readyForExport: false,
      shouldRecalculate: false,
    };
  }

  if (summary.critical > 0 || summary.highRisk > 0) {
    return {
      level: "warning",
      title: "Prüfung erforderlich",
      text: `${summary.critical} kritische Position(en), ${summary.highRisk} Hochrisiko-Position(en). Vor Export bitte fachlich prüfen.`,
      nextLabel: "Warnungen prüfen",
      filter: "warnungen",
      action: "",
      readyForExport: false,
      shouldRecalculate: false,
    };
  }

  if (summary.warnings > 0) {
    return {
      level: "warning",
      title: "Kalkulation plausibel, aber mit Hinweisen",
      text: `${summary.warnings} Position(en) haben Warnhinweise. Export ist möglich, aber vorher fachlich prüfen.`,
      nextLabel: "Warnungen prüfen",
      filter: "warnungen",
      action: "",
      readyForExport: true,
      shouldRecalculate: false,
    };
  }

  return {
    level: "ok",
    title: "Kalkulation exportbereit",
    text: "Alle relevanten Positionen sind kalkuliert. KI neu berechnen ist aktuell nicht nötig. Nächster sinnvoller Schritt: Urkalkulation PDF, Angebot oder GAEB Export.",
    nextLabel: "Export vorbereiten",
    filter: "alle",
    action: "",
    readyForExport: true,
    shouldRecalculate: false,
  };
}, [rows.length, problemCounts, duplicateGroups, summary]);

React.useEffect(() => {
  const duplicateCount = duplicateGroups.reduce(
    (sum, group) => sum + Math.max(0, group.length - 1),
    0
  );

  const payload = {
    count: rows.length,
    net: summary.net,
    gross: summary.gross,
    duplicateCount,
    missingUnits: problemCounts.einheitFehlt,
    missingQty: problemCounts.mengeFehlt,
    missingPrice: problemCounts.preisFehlt,
    missingBreakdown: problemCounts.preisaufbauFehlt,
    activeKi: activeKiDecision,
  };

  (window as any).__RLC_KALKULATION_RUNTIME_SUMMARY__ = payload;

  window.dispatchEvent(
    new CustomEvent("rlc:kalkulation-runtime-summary", {
      detail: payload,
    })
  );
}, [
  rows.length,
  summary.net,
  summary.gross,
  duplicateGroups,
  problemCounts.einheitFehlt,
  problemCounts.mengeFehlt,
  problemCounts.preisFehlt,
  problemCounts.preisaufbauFehlt,
  activeKiDecision,
]);



React.useEffect(() => {
  if (!activeKiDecision) return;

  const shouldPulse =
    activeKiDecision.level === "critical" ||
    activeKiDecision.level === "warning" ||
    Boolean(activeKiDecision.action);

  if (!shouldPulse) return;

  window.dispatchEvent(
    new CustomEvent("rlc:active-ki-suggestion", {
      detail: {
        id: "rlc:kalkulation-active-ki-bridge",
        module: "kalkulation",
        level: activeKiDecision.level,
        title: activeKiDecision.title,
        text: activeKiDecision.text,
        nextLabel: activeKiDecision.nextLabel,
        action: activeKiDecision.action,
        filter: activeKiDecision.filter,
        eventName: "rlc:kalkulation-filter",
        autoOpen: false,
        pulse: true,
      },
    })
  );
}, [activeKiDecision]);

function sanitizeRowsForStorage(input: EliteRow[]): EliteRow[] {
  return input.map((r) => {
    const kiEp = getRlcKiUnitPrice(r);
    const x84 = getOfferUnitPrice(r);

    const decision = ((r as any).priceDecision || "x84") as
      | "x84"
      | "rlcKi"
      | "manual";

    let finalEp = x84;

    if (decision === "rlcKi" && kiEp > 0) finalEp = kiEp;
    if (decision === "manual" && n(r.finalUnitPrice) > 0) {
      finalEp = n(r.finalUnitPrice);
    }

    return cleanRlcKiWarningState(normalizeEliteRow({
      ...r,
      angebotUnitPrice: x84,
      angebotTotal: round2(n(r.menge) * x84),
      originalPreKiPrice: x84,

      rlcKiUnitPrice: kiEp,
      rlcKiTotal: kiEp > 0 ? round2(n(r.menge) * kiEp) : 0,

      priceDifference: kiEp > 0 ? round2(kiEp - x84) : 0,
      priceDifferencePct:
        kiEp > 0 && x84 > 0 ? round2(((kiEp - x84) / x84) * 100) : 0,

      priceDecision: decision,
      finalUnitPrice: finalEp,
      preis: finalEp,
      gesamt: round2(n(r.menge) * finalEp),
    }));
  });
}
function persistRows(next: EliteRow[]) {
  const safeInput = sanitizeRowsForStorage(next);

  const normalized = safeInput.map((r: EliteRow) => {
    const angebotEp =
      n((r as any).angebotUnitPrice) ||
      n((r as any).originalPreKiPrice) ||
      n(r.preis) ||
      n(r.finalUnitPrice) ||
      0;

    const decision = ((r as any).priceDecision || "x84") as
      | "x84"
      | "rlcKi"
      | "manual";

    const rlcKiEp = getRlcKiUnitPrice(r);

    let finalEp = angebotEp;

    if (decision === "rlcKi" && rlcKiEp > 0) finalEp = rlcKiEp;
    if (decision === "manual" && n(r.finalUnitPrice) > 0) {
      finalEp = n(r.finalUnitPrice);
    }

    return cleanRlcKiWarningState(normalizeEliteRow({
      ...r,

      angebotUnitPrice: angebotEp,
      angebotTotal: round2(n(r.menge) * angebotEp),
      originalPreKiPrice: angebotEp,

      rlcKiUnitPrice: rlcKiEp,
      rlcKiTotal: rlcKiEp > 0 ? round2(n(r.menge) * rlcKiEp) : 0,

      priceDifference: rlcKiEp > 0 ? round2(rlcKiEp - angebotEp) : 0,
      priceDifferencePct:
        rlcKiEp > 0 && angebotEp > 0
          ? round2(((rlcKiEp - angebotEp) / angebotEp) * 100)
          : 0,

      priceDecision: decision,
      finalUnitPrice: finalEp,
      preis: finalEp,
      gesamt: round2(n(r.menge) * finalEp),

      confidence: r.confidence,
    }));
  });

  setRows(normalized);
  LV.setAll(normalized as LVPos[]);

  try {
    const payload = {
      meta: {
        projectKey,
        projectTitle,
        offer,
        client,
        company,
        mwst,
        globalMarkup,
        aufschlag: globalMarkup,
        kapRabatt,
        kapMarkup,
        offerNumber: offer.number,
        savedAt: new Date().toISOString(),
      },
      rows: normalized,
      summary,
      chapterTotals,
      totals: {
        netto: summary.net,
        aufschlagWert: summary.globalMarkupValue,
        brutto: summary.gross,
      },
    };

    localStorage.setItem(localBackupKey(projectKey), JSON.stringify(payload));
  } catch {
    // Lokale Sicherung darf UI nicht blockieren.
  }
}
function updateRow(id: string, patch: Partial<EliteRow>) {
  const next = rows.map((r) =>
    r.id === id ? normalizeEliteRow({ ...r, ...patch }) : r
  );

  persistRows(next);
}

function refreshAuftraege() {
  setAuftraege(AuftragStore.list());
}

function createUnterauftrag() {
  const name = window.prompt(
    "Name des Unterauftrags, z.B. Wasserleitung, Kanalbau, Straßenbau"
  );

  if (!name?.trim()) return;

  const haupt = AuftragStore.ensureDefault(projectKey);
  const created = AuftragStore.createUnterauftrag(name.trim(), haupt.id, projectKey);

  refreshAuftraege();
  setSelectedAuftragId(created.id);
}

function addRow() {
  const haupt = AuftragStore.ensureDefault(projectKey);

  const auftrag =
    selectedAuftragId && selectedAuftrag
      ? selectedAuftrag
      : haupt;

  sessionStorage.setItem(
    "rlc_recipes_new_position_context_v1",
    JSON.stringify({
      source: "kalkulationMitKI",
      projectKey,
      projectTitle,
      auftragId: auftrag.id,
      auftragName: auftrag.name,
      auftragType: auftrag.type,
      returnTo: "/kalkulation/mit-ki",
      ts: new Date().toISOString(),
    })
  );

  window.location.href = "/kalkulation/rezepte";
}

function deleteRow(id: string) {
  if (!window.confirm("Position wirklich löschen?")) return;

  const next = rows.filter((r) => r.id !== id);

  try {
    localStorage.removeItem(KI_HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_CONSUMED_TS_KEY);
  } catch {
//
  }

  try {
    const store: any = LV as any;

    if (typeof store.remove === "function") store.remove(id);
    if (typeof store.delete === "function") store.delete(id);
    if (typeof store.deleteById === "function") store.deleteById(id);
  } catch {
//
  }

  persistRows(next);

  if (selectedId === id) {
    setSelectedId(next[0]?.id || "");
  }

  setServerStatus("Position gelöscht und gespeichert");
  setTimeout(() => setServerStatus(""), 1800);
}

function updateBreakdownLine(
  lineId: string,
  patch: Partial<PriceBreakdownLine>
) {
  if (!selectedRow) return;

  const nextLines = (selectedRow.priceBreakdown || []).map((line) => {
    if (line.id !== lineId) return line;

    const next = normalizeBreakdownLine({ ...line, ...patch });

    return {
      ...next,
      total: round2(n(next.qty) * n(next.price)),
    };
  });

  const ep = sumBreakdown(nextLines);

  updateRow(selectedRow.id, {
    priceBreakdown: nextLines,
    finalUnitPrice: ep,
    preis: ep,
    suggestedUnitPrice: ep,
  });
}

function catalogGroupToBreakdownGroup(group?: string): PriceBreakdownGroup {
  if (group === "Arbeiter") return "Personal";
  if (group === "Maschinen") return "Maschinen";
  if (group === "Material") return "Material";
  return "Fremdleistung";
}

function addCatalogRowToSelected(row: CatalogPos) {
  if (!selectedRow) {
    alert("Bitte zuerst eine LV-Position auswählen.");
    return;
  }

  const nextLine = normalizeBreakdownLine({
    group: catalogGroupToBreakdownGroup(row.gruppe),
    name: row.kurztext || row.posNr || "Artikel",
    unit: row.einheit || selectedRow.einheit || "EH",
    qty: 1,
    price: n(row.ep),
    total: n(row.ep),
    note: row.posNr ? `Artikel-Nr.: ${row.posNr}` : "",
  });

  const nextLines = [...(selectedRow.priceBreakdown || []), nextLine];
  const ep = sumBreakdown(nextLines);

  updateRow(selectedRow.id, {
    priceBreakdown: nextLines,
    finalUnitPrice: ep,
    preis: ep,
    suggestedUnitPrice: ep,
    calculationStatus: "manual",
    aiReason: appendInfoText(
      selectedRow.aiReason,
      `Artikel "${row.kurztext}" wurde aus der Ressourcenliste in die Urkalkulation übernommen.`
    ),
  });
}

function addBreakdownLine() {
  if (!selectedRow) return;

  const nextLines = [
    ...(selectedRow.priceBreakdown || []),
    normalizeBreakdownLine({
      group: "Material",
      name: "Neue Preiszeile",
      unit: selectedRow.einheit || "EH",
      qty: 1,
      price: 0,
    }),
  ];

  updateRow(selectedRow.id, {
    priceBreakdown: nextLines,
    finalUnitPrice: sumBreakdown(nextLines),
    preis: sumBreakdown(nextLines),
  });
}

function deleteBreakdownLine(lineId: string) {
  if (!selectedRow) return;

  const nextLines = (selectedRow.priceBreakdown || []).filter(
    (line) => line.id !== lineId
  );

  updateRow(selectedRow.id, {
    priceBreakdown: nextLines,
    finalUnitPrice: sumBreakdown(nextLines),
    preis: sumBreakdown(nextLines),
  });
}

function regenerateSelectedBreakdown() {
  if (!selectedRow) return;

  const next = buildAutomaticPriceBreakdown(selectedRow);
  const ep = sumBreakdown(next);

  updateRow(selectedRow.id, {
    priceBreakdown: next,
    finalUnitPrice: ep,
    preis: ep,
    suggestedUnitPrice: ep,
    aiReason: appendInfoText(
      selectedRow.aiReason,
      "KI hat den Preisaufbau dieser Position neu erzeugt."
    ),
  });
}

function saveAllToKnowledge() {
  const count = saveRowsToDatenbank(rows, projectKey, projectTitle);
  setServerStatus(`✅ ${count} Position(en) in Kalkulationsdatenbank übertragen`);
  setTimeout(() => setServerStatus(""), 3500);
}

function saveSelectedToKnowledge() {
  if (!selectedRow) return;

  const count = saveRowsToDatenbank([selectedRow], projectKey, projectTitle);
  setServerStatus(`${count} Position in Kalkulationsdatenbank gespeichert`);
  setTimeout(() => setServerStatus(""), 2500);
}

function applyKnowledge(match: KalkulationsSuchTreffer) {
  if (!selectedRow) return;

  updateRow(selectedRow.id, datenbankEntryToRowPatch(match.eintrag));
  KalkulationsDatenbank.markUsed(match.eintrag.id);
  setServerStatus("Kalkulationsdatenbankwert übernommen");
  setTimeout(() => setServerStatus(""), 2000);
}
function applyKiSuggestedPrice(rowId: string) {
  const row = rows.find((r) => r.id === rowId);
  if (!row) return;

  const kiEp = getRlcKiUnitPrice(row);
  const current = getUnitPrice(row);

  if (kiEp <= 0) {
    alert("Kein gültiger RLC-KI-Vorschlag vorhanden.");
    return;
  }

  updateRow(rowId, {
    preis: kiEp,
    finalUnitPrice: kiEp,
    suggestedUnitPrice: kiEp,
    priceDecision: "rlcKi" as any,
    calculationStatus: "ok",
    riskLevel: row.riskLevel === "high" ? "medium" : row.riskLevel,
    warning: "",
    aiReason: appendInfoText(
      row.aiReason,
      `RLC-KI-Vorschlag manuell als finaler EP übernommen: ${money(current)} → ${money(kiEp)}.`
    ),
  });

  setServerStatus("RLC-KI-Preis übernommen");
  setTimeout(() => setServerStatus(""), 2200);
}
function kiCloneRows(input: EliteRow[]): EliteRow[] {
  try {
    return JSON.parse(JSON.stringify(input)) as EliteRow[];
  } catch {
return input.map((r) => ({ ...r }));
  }
}

function kiRowLabel(row: Partial<EliteRow>): string {
  const pos = String(row.posNr || "").trim();
  const text = String(row.kurztext || "").trim();

  if (pos && text) return `Pos. ${pos} – ${text.slice(0, 80)}`;
  if (pos) return `Pos. ${pos}`;
  if (text) return text.slice(0, 90);

  return String(row.id || "Position");
}

function kiEmitStart(title: string) {
  window.dispatchEvent(
    new CustomEvent("rlc:ki-action-start", {
      detail: {
        title,
        text: title,
      },
    })
  );
}

let kiSmoothProgressTimer: number | null = null;

function kiEmitProgress(progress: number, text: string) {
  window.dispatchEvent(
    new CustomEvent("rlc:ki-action-progress", {
      detail: {
        progress,
        text,
      },
    })
  );
}

function kiStopSmoothProgress() {
  if (kiSmoothProgressTimer !== null) {
    window.clearInterval(kiSmoothProgressTimer);
    kiSmoothProgressTimer = null;
  }
}

function kiStartSmoothProgress(args: {
  from: number;
  to: number;
  text: string;
  estimatedMs: number;
}) {
const startedAt = Date.now();
  const from = Math.max(0, Math.min(100, args.from));
  const to = Math.max(from, Math.min(96, args.to));
  const duration = Math.max(args.estimatedMs, 8000);

  kiEmitProgress(from, args.text);

  kiSmoothProgressTimer = window.setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const ratio = Math.min(elapsed / duration, 0.97);
    const eased = 1 - Math.pow(1 - ratio, 2);
    const progress = Math.min(to, Math.round(from + (to - from) * eased));

    kiEmitProgress(progress, args.text);
  }, 650);
}

function kiClassifyRow(row: Partial<EliteRow>): KiRowClass {
  const pos = String(row.posNr || "").trim();
  const kurzRaw = String(row.kurztext || "").trim();
  const langRaw = String(row.langtext || "").trim();
  const text = `${kurzRaw} ${langRaw}`.toLowerCase().replace(/\s+/g, " ").trim();
  const unit = String(row.einheit || "").trim();

  const menge = n(row.menge);
  const lightEp =
    n((row as any).angebotUnitPrice) ||
    n((row as any).originalPreKiPrice) ||
    n((row as any).finalUnitPrice) ||
    n((row as any).preis) ||
    n((row as any).suggestedUnitPrice) ||
    0;

  const pureChapter =
    /^\d{1,2}$/.test(pos) ||
    /^\d{1,2}\.0{1,3}$/.test(pos);

  const structuralText =
    /^titel\s*\d*$/i.test(kurzRaw) ||
    /^abschnitt\s*\d*$/i.test(kurzRaw) ||
    /^kapitel\s*\d*$/i.test(kurzRaw) ||
    /^los\s*\d*$/i.test(kurzRaw) ||
    text.includes("zwischensumme") ||
    text.includes("gesamtsumme") ||
    text.includes("summe titel");

  const hasRealWorkText =
    kurzRaw.length >= 8 ||
    langRaw.length >= 18 ||
    /(aushub|abfuhr|verfüll|verfull|pflaster|asphalt|rohr|leitung|speedpipe|kabel|schacht|beton|schalung|bewehrung|plani|sandbett|tragschicht|deckschicht)/i.test(
      `${kurzRaw} ${langRaw}`
    );

  if (structuralText) return "structure";
  if (pureChapter && !hasRealWorkText) return "structure";

  if (!hasRealWorkText || !unit || menge <= 0) return "incomplete";

  if (
    lightEp <= 0 &&
    (!Array.isArray(row.priceBreakdown) || row.priceBreakdown.length === 0)
  ) {
    return "incomplete";
  }

  if (row.riskLevel === "high" || row.calculationStatus === "critical") {
    return "review";
  }

  return "real-position";
}

function kiIsRealCalcRow(row: Partial<EliteRow>) {
  return !kiIsStructuralRow(row);
}

function compactKiWarningText(value: string): string {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";

  const parts = raw
    .split(" · ")
    .map((x) => x.trim())
    .filter(Boolean);

  const important = parts.filter((x) => {
    const t = x.toLowerCase();
    return (
      t.includes("plausibilitätsgrenze") ||
      t.includes("stabilitätsbremse") ||
      t.includes("datenbankpreis") ||
      t.includes("regionalen unterschieden") ||
      t.includes("prüfen")
    );
  });

  const selected = (important.length ? important : parts).slice(0, 2);
  let out = selected.join(" · ");

  if (out.length > 260) out = out.slice(0, 257).trimEnd() + "…";
  return out;
}
function kiBuildChangeLog(beforeRows: EliteRow[], afterRows: EliteRow[]) {
  const beforeMap = new Map(beforeRows.map((r) => [r.id, r]));
  const afterMap = new Map(afterRows.map((r) => [r.id, r]));

  const changes: string[] = [];
  const warnings: string[] = [];
  const unchanged: string[] = [];

  const countRelevantRows = (list: EliteRow[]) =>
    list.filter((r) => !kiIsStructuralRow(r));

  const countMissingPrice = (list: EliteRow[]) =>
    countRelevantRows(list).filter((r) => round2(getUnitPrice(r)) <= 0).length;

  const countMissingUrkalkulation = (list: EliteRow[]) =>
    countRelevantRows(list).filter((r) => !Array.isArray(r.priceBreakdown) || r.priceBreakdown.length === 0).length;

  const countMissingUnit = (list: EliteRow[]) =>
    countRelevantRows(list).filter((r) => !String(r.einheit || "").trim()).length;

  const countMissingQty = (list: EliteRow[]) =>
    countRelevantRows(list).filter((r) => n(r.menge) <= 0).length;

  const beforeMissingPrice = countMissingPrice(beforeRows);
  const afterMissingPrice = countMissingPrice(afterRows);

  const beforeMissingUrk = countMissingUrkalkulation(beforeRows);
  const afterMissingUrk = countMissingUrkalkulation(afterRows);

  const beforeMissingUnit = countMissingUnit(beforeRows);
  const afterMissingUnit = countMissingUnit(afterRows);

  const beforeMissingQty = countMissingQty(beforeRows);
  const afterMissingQty = countMissingQty(afterRows);

  if (beforeMissingPrice !== afterMissingPrice) {
    changes.push(
      `EP fehlend reduziert: ${beforeMissingPrice} → ${afterMissingPrice}.`
    );
  }

  if (beforeMissingUrk !== afterMissingUrk) {
    changes.push(
      `Urkalkulation fehlend reduziert: ${beforeMissingUrk} → ${afterMissingUrk}.`
    );
  }

  if (beforeMissingUnit !== afterMissingUnit) {
    changes.push(
      `Einheiten fehlend reduziert: ${beforeMissingUnit} → ${afterMissingUnit}.`
    );
  }

  if (beforeMissingQty !== afterMissingQty) {
    changes.push(
      `Mengen fehlend reduziert: ${beforeMissingQty} → ${afterMissingQty}.`
    );
  }

  for (const after of afterRows) {
    if (kiIsStructuralRow(after)) continue;

    const before = beforeMap.get(after.id);

    if (!before) {
      changes.push(`${kiRowLabel(after)} neu hinzugefügt.`);
      continue;
    }

    const beforePrice = round2(getUnitPrice(before));
    const afterPrice = round2(getUnitPrice(after));

    if (beforePrice !== afterPrice) {
      changes.push(
        `${kiRowLabel(after)} – Preis geändert: ${money(beforePrice)} → ${money(afterPrice)}.`
      );
    }

    const beforeText = String(before.kurztext || "").trim();
    const afterText = String(after.kurztext || "").trim();

    if (beforeText !== afterText) {
      changes.push(
        !beforeText && afterText
          ? `${kiRowLabel(after)} – Kurztext ergänzt.`
          : `${kiRowLabel(after)} – Kurztext geändert.`
      );
    }

    const beforeLang = String(before.langtext || "").trim();
    const afterLang = String(after.langtext || "").trim();

    if (beforeLang !== afterLang) {
      changes.push(
        !beforeLang && afterLang
          ? `${kiRowLabel(after)} – Langtext ergänzt.`
          : `${kiRowLabel(after)} – Langtext geändert.`
      );
    }

    if (String(before.einheit || "").trim() !== String(after.einheit || "").trim()) {
      changes.push(
        `${kiRowLabel(after)} – Einheit geändert: ${String(before.einheit || "leer")} → ${String(after.einheit || "leer")}.`
      );
    }

    if (round2(n(before.menge)) !== round2(n(after.menge))) {
      changes.push(
        `${kiRowLabel(after)} – Menge geändert: ${qty(before.menge)} → ${qty(after.menge)}.`
      );
    }

    const beforeBreakdown = before.priceBreakdown?.length || 0;
    const afterBreakdown = after.priceBreakdown?.length || 0;

    if (beforeBreakdown !== afterBreakdown) {
      changes.push(
        beforeBreakdown === 0 && afterBreakdown > 0
          ? `${kiRowLabel(after)} – Urkalkulation / Preisaufbau ergänzt (${afterBreakdown} Ansatz/Ansätze).`
          : `${kiRowLabel(after)} – Urkalkulation geändert (${beforeBreakdown} → ${afterBreakdown} Ansätze).`
      );
    } else if (beforeBreakdown > 0 && afterBreakdown > 0) {
      const beforeSum = round2(
        (before.priceBreakdown || []).reduce((sum, x) => sum + n(x.total), 0)
      );
      const afterSum = round2(
        (after.priceBreakdown || []).reduce((sum, x) => sum + n(x.total), 0)
      );

      if (beforeSum !== afterSum) {
        changes.push(
          `${kiRowLabel(after)} – Urkalkulation Summe geändert: ${money(beforeSum)} → ${money(afterSum)}.`
        );
      }
    }

    if (before.calculationStatus !== after.calculationStatus) {
      changes.push(
        `${kiRowLabel(after)} – Status geändert: ${statusLabel(before.calculationStatus)} → ${statusLabel(after.calculationStatus)}.`
      );
    }

    if (before.riskLevel !== after.riskLevel) {
      changes.push(
        `${kiRowLabel(after)} – Risiko geändert: ${riskLabel(before.riskLevel)} → ${riskLabel(after.riskLevel)}.`
      );
    }

    if (after.warning && after.warning !== before.warning) {
      const compactWarning = compactKiWarningText(after.warning);
      if (compactWarning) {
        warnings.push(`${kiRowLabel(after)} – ${compactWarning}`);
      }
    }
  }

  for (const before of beforeRows) {
    if (kiIsStructuralRow(before)) continue;

    if (!afterMap.has(before.id)) {
      changes.push(`${kiRowLabel(before)} gelöscht.`);
    }
  }

  if (!changes.length && !warnings.length) {
    const allComplete =
      afterMissingPrice === 0 &&
      afterMissingUrk === 0 &&
      afterMissingUnit === 0 &&
      afterMissingQty === 0;

    unchanged.push(
      allComplete
        ? "Prüfung abgeschlossen: Alle sichtbaren LV-Positionen haben EP, Menge, Einheit und Urkalkulation."
        : "Keine sichtbaren Änderungen erkannt. Einzelne Positionen müssen noch manuell geprüft werden."
    );
  }

  return { changes, warnings, unchanged };
}

function kiEmitResult(
  title: string,
  beforeRows: EliteRow[],
  afterRows: EliteRow[],
  summary?: any
) {
  const log = kiBuildChangeLog(beforeRows, afterRows);

  const protocol: string[] = [];

  const checkedCount = typeof summary?.checkedCount === "number" ? summary.checkedCount : afterRows.length;
  const skippedCount = typeof summary?.skippedCount === "number" ? summary.skippedCount : 0;
  const serverRequestedCount =
    typeof summary?.serverRequestedCount === "number" ? summary.serverRequestedCount : 0;
  const serverReturnedCount =
    typeof summary?.serverReturnedCount === "number" ? summary.serverReturnedCount : 0;
  const localFallbackCount =
    typeof summary?.localFallbackCount === "number" ? summary.localFallbackCount : 0;

  protocol.push(`Geprüfte LV-Positionen: ${checkedCount}.`);

  if (skippedCount > 0) {
    protocol.push(`Bereits vollständig übernommen: ${skippedCount}.`);
  }

  if (serverRequestedCount > 0) {
    protocol.push(`An Server-KI gesendet: ${serverRequestedCount}.`);
  }

  if (serverReturnedCount > 0) {
    protocol.push(`Vom Server/OpenAI berechnet: ${serverReturnedCount}.`);
  }

  if (localFallbackCount > 0 && serverReturnedCount === 0) {
    protocol.push(`Lokaler Fallback verwendet: ${localFallbackCount}.`);
  }

  if (serverRequestedCount === 0 && skippedCount > 0) {
    protocol.push("Keine Server-KI nötig: vollständige Positionen übernommen.");
  }

  const cleanWarnings = log.warnings.filter((w) => {
    const x = String(w || "").toLowerCase();

    if (!x.trim()) return false;

    // Nicht als Warnung anzeigen, wenn Server/OpenAI erfolgreich gerechnet hat.
    if (serverReturnedCount > 0) {
      if (x.includes("openai-schätzung verwendet")) return false;
      if (x.includes("regel-engine-fallback verwendet")) return false;
      if (x.includes("lokaler fallback verwendet")) return false;
      if (x.includes("ki-cache verwendet")) return false;
    }

    return true;
  });

  const unchanged =
    !log.changes.length && !cleanWarnings.length && protocol.length
      ? ["Prüfung abgeschlossen. Keine weiteren sichtbaren Änderungen nötig."]
      : log.unchanged;

  window.dispatchEvent(
    new CustomEvent("rlc:ki-action-result", {
      detail: {
        title,
        changes: [...protocol, ...log.changes],
        warnings: cleanWarnings,
        unchanged,
      },
    })
  );
}
async function runEliteCalculation(forceRecalculate = false, expertMode = false) {
  if (!rows.length) {
    alert("Keine Positionen vorhanden.");
    return;
  }

  /*
   * Original-EP vor KI sichern.
   * Wichtig: Nach mehreren KI-Testläufen darf die Stabilitätsbremse nicht gegen bereits
   * veränderte KI-Preise vergleichen, sondern gegen den ersten stabilen EP.
   */
  const preparedRows = rows.map((row) =>
    kiIsStructuralRow(row)
      ? normalizeEliteRow(kiPrepareStructuralRow(row))
      : row
  );

  const rowsForKi = preparedRows
    .filter((row) => kiIsRealCalcRow(row) && (forceRecalculate || expertMode || !(row as any).preisManuellGeprueft))
    .map((row) => {
      const storedOfferUnitPrice =
        n((row as any).angebotUnitPrice) ||
        n((row as any).originalPreKiPrice);

      const calculationStartEp =
        storedOfferUnitPrice > 0 ? storedOfferUnitPrice : getUnitPrice(row);

      return {
        ...row,

        // X84-Angebotspreis bleibt getrennt und wird nicht künstlich aus KI erzeugt.
        angebotUnitPrice: storedOfferUnitPrice,
        angebotTotal: storedOfferUnitPrice > 0 ? round2(n(row.menge) * storedOfferUnitPrice) : 0,
        originalPreKiPrice: storedOfferUnitPrice,

        // Nur Startwert für KI-Berechnung.
        preis: calculationStartEp,
        finalUnitPrice: calculationStartEp,
      } as EliteRow;
    });

  const beforeRows = kiCloneRows(preparedRows);

  try {
    kiEmitStart(
      expertMode
        ? "KI-Expertprüfung wird gestartet…"
        : forceRecalculate
          ? "KI-Neuberechnung schnell wird gestartet…"
          : "KI-Kalkulation wird gestartet…"
    );
    kiEmitProgress(18, "LV-Positionen werden vorbereitet…");

    
    kiStartSmoothProgress({
      from: 18,
      to: 82,
      text: "Server-KI / OpenAI berechnet Positionen…",
      estimatedMs: Math.max(5000, rowsForKi.length * 350),
    });
    const res = await eliteCalculateRows(projectKey, rowsForKi, {
      forceRecalculate,
      maxParallelRows: expertMode ? 4 : forceRecalculate ? 8 : 6,
      maxOpenAiRowsPerBatch: expertMode ? 50 : forceRecalculate ? 8 : 8,
      expertMode,
      useOpenAIIfNoDatabaseHit: expertMode || !forceRecalculate,
    });

    
    kiStopSmoothProgress();
    kiEmitProgress(84, "KI-Ergebnisse werden übernommen…");

    const byKey = new Map<string, EliteKalkulationResultRow>();

    for (const item of res.rows) {
      const key = item.id || item.posNr;
      if (key) byKey.set(String(key), item);
    }

    const next = preparedRows.map((old) => {
      const result = byKey.get(old.id) || byKey.get(old.posNr);

      const base = result
        ? mergeEliteResult(old, result)
        : enhanceKalkulatorInsertions(old);

      return {
        ...base,
        auftragId: old.auftragId || selectedAuftragId,
        auftragName: old.auftragName || selectedAuftrag?.name || "",
        auftragType: old.auftragType || selectedAuftrag?.type,
      };
    });

    kiEmitProgress(78, "Änderungen werden gespeichert…");

    const cleanedNext = next.map((r) =>
      kiIsStructuralRow(r)
        ? {
            ...r,
            materialCost: 0,
            laborCost: 0,
            machineCost: 0,
            subcontractorCost: 0,
            disposalCost: 0,
            overheadCost: 0,
            riskCost: 0,
            profitCost: 0,
            baseUnitPrice: 0,
            suggestedUnitPrice: 0,
            finalUnitPrice: 0,
            preis: 0,
            priceBreakdown: [],
            riskLevel: "low" as RiskLevel,
            calculationStatus: "ok" as CalcStatus,
            warning: "",
            aiReason:
              "Titel-/Gliederungsposition: Keine kalkulatorische Leistungsposition.",
          }
        : r
    );

    persistRows(normalizeKiWarningRows(cleanedNext));
    // saveRowsToDatenbank(cleanedNext, projectKey, projectTitle); // deaktiviert: KI-Kalkulation darf Datenbank nicht automatisch füllen

    setLastKiSource(res.source === "server" ? "Server-KI" : "Lokale Fallback-KI");

    const kiDurationSec =
      typeof (res.summary as any)?.durationMs === "number"
        ? `${((res.summary as any).durationMs / 1000).toFixed(1).replace(".", ",")} s`
        : "";

    const kiSpeedInfo =
      res.source === "server"
        ? [
            kiDurationSec ? `Zeit: ${kiDurationSec}` : "",
            typeof (res.summary as any)?.openAiUsed === "number"
              ? `OpenAI: ${(res.summary as any).openAiUsed}`
              : "",
            typeof (res.summary as any)?.maxParallelRows === "number"
              ? `Parallel: ${(res.summary as any).maxParallelRows}`
              : "",
          ]
            .filter(Boolean)
            .join(" · ")
        : "";

    setServerStatus(
      res.source === "server"
        ? `KI-Prüfung abgeschlossen · X84 bleibt final · RLC-KI nur Prüfwert${kiSpeedInfo ? " · " + kiSpeedInfo : ""}`
        : "Fallback-Kalkulation abgeschlossen · Texte und Preisaufbau ergänzt · Datenbank lokal aktualisiert"
    );
    kiEmitProgress(96, "Änderungsprotokoll wird erstellt…");
    kiEmitResult("KI-Kalkulation abgeschlossen", beforeRows, cleanedNext, res.summary);

    setTimeout(() => setServerStatus(""), 3500);
  } catch {
    kiStopSmoothProgress();
    window.dispatchEvent(
      new CustomEvent("rlc:ki-action-result", {
        detail: {
          title: "KI-Kalkulation fehlgeschlagen",
          changes: [],
          warnings: ["Die KI-Kalkulation konnte nicht abgeschlossen werden. Bitte Server/API prüfen."],
          unchanged: [],
        },
      })
    );

    setServerStatus("KI-Kalkulation fehlgeschlagen");
    setTimeout(() => setServerStatus(""), 3500);
  }
}

  function autoCompleteMissingFields() {
    if (!rows.length) return;

    const beforeRows = kiCloneRows(rows);

    kiEmitStart("Fehlende Daten werden ergänzt…");
    kiEmitProgress(25, "Kurztexte, Langtexte, Einheiten und Preisaufbau werden geprüft…");

    const next = rows.map((r) => kiIsStructuralRow(r) ? normalizeEliteRow(kiPrepareStructuralRow(r)) : enhanceKalkulatorInsertions(r));

    kiEmitProgress(72, "Ergänzungen werden gespeichert…");

    persistRows(normalizeKiWarningRows(next));

    const count =
      problemCounts.kurztextFehlt +
      problemCounts.langtextFehlt +
      problemCounts.einheitFehlt +
      problemCounts.preisaufbauFehlt;

    setServerStatus(
      count > 0
        ? "KI hat fehlende Texte, Einheiten und Preisaufbau ergänzt"
        : "Keine fehlenden Texte, Einheiten oder Preisaufbauten gefunden"
    );

    kiEmitProgress(96, "Änderungsprotokoll wird erstellt…");
    kiEmitResult("Fehlende Daten ergänzt", beforeRows, next);

    setTimeout(() => setServerStatus(""), 3000);
  }

  function handleCsvImport(file: File | null) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const imported = parseImportedCsv(text).map((r) =>
          normalizeEliteRow(r)
        );

        if (!imported.length) {
          alert("Keine gültigen CSV-Zeilen gefunden.");
          return;
        }

        const next = [...imported, ...rows];
        persistRows(normalizeKiWarningRows(next));

        setServerStatus(`${imported.length} CSV-Position(en) importiert`);
        setTimeout(() => setServerStatus(""), 2500);
      } catch {
alert("CSV konnte nicht gelesen werden.");
      } finally {
        if (csvInputRef.current) csvInputRef.current.value = "";
      }
    };

    reader.readAsText(file, "utf-8");
  }

  async function exportGaeb(mode: "x83" | "x84") {
    if (!rows.length) return;

    const filename = `KI_Kalkulation_${safeFileName(projectKey || offer.number)}.${mode}`;

    const payload = {
      projectCode: projectKey,
      mode,
      rows: rows.map((r) => ({
        id: r.id,
        posNr: r.posNr,
        parentPosNr: r.parentPosNr,
        kurztext: r.kurztext,
        langtext: r.langtext,
        einheit: r.einheit,
        menge: n(r.menge),
        preis: getUnitPrice(r),
        gesamt: lineNet(r),
        waehrung: "EUR",
        priceBreakdown: r.priceBreakdown || [],
        bemerkung: [
          r.bemerkung,
          r.aiReason ? `KI-Begründung: ${r.aiReason}` : "",
          r.warning ? `Warnung: ${r.warning}` : "",
          breakdownText(r) ? `Preisaufbau:\n${breakdownText(r)}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      })),
    };

    try {
      setServerStatus(`GAEB ${mode.toUpperCase()} wird erzeugt…`);

      const res = await fetch(
        apiUrl(
          `/api/project-lv/${encodeURIComponent(
            projectKey || "NO_PROJECT"
          )}/export/gaeb/${mode}`
        ),
        {
          method: "POST",
          credentials: "include",
          headers: authJsonHeaders(),
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) throw new Error(`GAEB Export Fehler ${res.status}`);

      const blob = await res.blob();
      downloadBlob(blob, filename);

      setServerStatus(`GAEB ${mode.toUpperCase()} exportiert`);
      setTimeout(() => setServerStatus(""), 2200);
    } catch {
const blob = new Blob([buildLocalGaebFallback(rows, mode)], {
        type: "application/xml;charset=utf-8",
      });

      downloadBlob(blob, filename);
      setServerStatus(`GAEB ${mode.toUpperCase()} lokal exportiert`);
      setTimeout(() => setServerStatus(""), 2200);
    }
  }

  async function saveToProjectServer() {
    if (!projectKey) {
      alert("Kein Projekt gewählt.");
      return;
    }

    const storageRows = sanitizeRowsForStorage(rows);

    setRows(storageRows);
    LV.setAll(storageRows as LVPos[]);
    const payload = {
      version: "elite-v3-price-breakdown",
      meta: {
        projectKey,
        savedAt: new Date().toISOString(),
        offer,
        client,
        company,
        mwst,
        globalMarkup,
        aufschlag: globalMarkup,
        kapRabatt,
        kapMarkup,
        offerNumber: offer.number,
      },
      rows: storageRows,
      summary,
      chapterTotals,
      totals: {
        netto: summary.net,
        aufschlagWert: summary.globalMarkupValue,
        brutto: summary.gross,
      },
    };

    try {
      setServerBusy(true);
      setServerStatus("Speichere…");

      const r = await fetch(
        apiUrl(`${KALKULATION_API_BASE}/${encodeURIComponent(projectKey)}/ki/save`),
        {
          method: "POST",
          credentials: "include",
          headers: authJsonHeaders(),
          body: JSON.stringify(payload),
        }
      );

      if (r.status === 401 || r.status === 403) {
        localStorage.setItem(localBackupKey(projectKey), JSON.stringify(payload));
        setServerStatus("Nicht angemeldet · lokal gesichert");
        return;
      }

      if (r.status === 404) {
        localStorage.setItem(localBackupKey(projectKey), JSON.stringify(payload));
        setServerStatus("Route fehlt · lokal gesichert");
        return;
      }

      const json = await r.json().catch(() => null);

      if (!r.ok || !json?.ok) {
        localStorage.setItem(localBackupKey(projectKey), JSON.stringify(payload));
        setServerStatus("Serverfehler · lokal gesichert");
        return;
      }

      setServerStatus("Gespeichert");
      setTimeout(() => setServerStatus(""), 2000);
    } catch {
localStorage.setItem(localBackupKey(projectKey), JSON.stringify(payload));
      setServerStatus("Fehler · lokal gesichert");
    } finally {
      setServerBusy(false);
    }
  }

  function isValidKalkulationSnapshotRows(candidateRows: EliteRow[]): boolean {
    if (!Array.isArray(candidateRows) || candidateRows.length === 0) return false;

    const validRows = candidateRows.filter((r) => {
      const pos = String((r as any).posNr || (r as any).pos || "").trim();
      const kurztext = String((r as any).kurztext || (r as any).text || "").trim();
      const menge = n((r as any).menge);
      const ep =
        n((r as any).angebotUnitPrice) ||
        n((r as any).originalPreKiPrice) ||
        n((r as any).preis) ||
        n((r as any).finalUnitPrice);

      const looksLikePlaceholder =
        /^Position\s+\d+/i.test(kurztext) ||
        kurztext === "" ||
        kurztext.toLowerCase() === pos.toLowerCase();

      return pos && !looksLikePlaceholder && menge > 0 && ep > 0;
    });

    return validRows.length >= Math.max(1, Math.floor(candidateRows.length * 0.9));
  }

  async function loadFromProjectServer() {
    if (!projectKey) {
      alert("Kein Projekt gewählt.");
      return;
    }

    try {
      setServerBusy(true);
      setServerStatus("Lade…");

      const r = await fetch(
        apiUrl(`${KALKULATION_API_BASE}/${encodeURIComponent(projectKey)}/ki`),
        {
          method: "GET",
          credentials: "include",
          headers: authJsonHeaders(),
        }
      );

      const json = await r.json().catch(() => null);

      if (r.status === 401 || r.status === 403) {
        const raw = localStorage.getItem(localBackupKey(projectKey));
        if (!raw) {
          setServerStatus("Nicht angemeldet · kein lokaler Speicherstand");
          return;
        }
        applySnapshot(JSON.parse(raw));
        setServerStatus("Nicht angemeldet · lokal geladen");
        return;
      }

      if (r.status === 404 || !json?.exists) {
        const raw = localStorage.getItem(localBackupKey(projectKey));
        if (!raw) {
          setServerStatus("Kein Speicherstand");
          return;
        }
        applySnapshot(JSON.parse(raw));
        setServerStatus("Lokal geladen");
        return;
      }

      if (!r.ok || !json?.ok) {
        setServerStatus("Laden fehlgeschlagen");
        return;
      }

      applySnapshot(json.data || {});
      setServerStatus("Geladen");
      setTimeout(() => setServerStatus(""), 2000);
    } catch {
setServerStatus("Fehler beim Laden");
    } finally {
      setServerBusy(false);
    }
  }

  function applySnapshot(data: any) {
    const loadedRows = Array.isArray(data.rows)
      ? data.rows.map((x: any) => normalizeEliteRow(x))
      : [];

    if (loadedRows.length) {
      const safeRows = sanitizeRowsForStorage(loadedRows);

      if (!isValidKalkulationSnapshotRows(safeRows)) {
        setServerStatus("Laden abgebrochen: Speicherstand enthält ungültige Mengen/Positionen");
        setTimeout(() => setServerStatus(""), 3500);
        return;
      }

      persistRows(safeRows);
    }

    const meta = data.meta || {};
    if (typeof meta.mwst === "number") setMwst(meta.mwst);
    if (typeof meta.globalMarkup === "number") setGlobalMarkup(meta.globalMarkup);
    if (typeof meta.aufschlag === "number") setGlobalMarkup(meta.aufschlag);
    if (meta.kapRabatt) setKapRabatt(meta.kapRabatt);
    if (meta.kapMarkup) setKapMarkup(meta.kapMarkup);
    if (meta.offer) setOffer(meta.offer);
    if (meta.client) setClient(meta.client);
  }

  async function handlePdfExport() {
    try {
      setPdfBusy(true);
      setServerStatus("PDF wird erzeugt…");

      await exportPdf({
        projectKey,
        projectTitle,
        rows,
        chapterTotals,
        summary,
        offer,
        client,
        company,
        mwst,
        globalMarkup,
      });

      setServerStatus("PDF erzeugt");
      setTimeout(() => setServerStatus(""), 1800);
    } catch {
setServerStatus("PDF Fehler");
    } finally {
      setPdfBusy(false);
    }
  }

  async function handleUrkalkulationPdfExport() {
  try {
    setPdfBusy(true);
    setServerStatus("Urkalkulation PDF wird erzeugt…");

    const exportRows = selectedAuftragId
      ? rows.filter((r) => r.auftragId === selectedAuftragId)
      : rows;

    if (!exportRows.length) {
      alert(
        selectedAuftragId
          ? "Für diesen Auftrag sind keine Positionen vorhanden."
          : "Keine Positionen vorhanden."
      );
      return;
    }

    exportUrkalkulationPdfLocal({
      projectKey,
      projectTitle,
      rows: exportRows,
      summary,
      offer,
      selectedAuftrag: selectedAuftragId ? selectedAuftrag : null,
      client,
      company,
      globalMarkup,
    });

    setServerStatus("Urkalkulation PDF erzeugt");
    setTimeout(() => setServerStatus(""), 1800);
  } catch {
setServerStatus("Urkalkulation PDF Fehler");
  } finally {
    setPdfBusy(false);
  }
}

    function acceptSafeSuggestions() {
    const safe = rows.filter(isSafeRow);

    if (!safe.length) {
      alert("Keine sicheren Vorschläge vorhanden.");
      return;
    }

    const count = saveRowsToDatenbank(safe, projectKey, projectTitle);

    setServerStatus(`${count} sichere Position(en) übernommen und gelernt`);
    setTimeout(() => setServerStatus(""), 2500);
  }

function selectDuplicateRowsToDelete() {
  const ids = duplicateGroups.flatMap((group) => group.slice(1).map((row) => row.id));

  setSelectedDuplicateIds(ids);

  if (ids.length) {
    setServerStatus(`${ids.length} doppelte Position(en) ausgewählt. Es bleibt je Gruppe 1 Position erhalten.`);
    setTimeout(() => setServerStatus(""), 3000);
  } else {
    setServerStatus("Keine doppelten Positionen gefunden.");
    setTimeout(() => setServerStatus(""), 2500);
  }
}

function toggleDuplicateSelection(rowId: string, checked: boolean) {
  setSelectedDuplicateIds((current) => {
    if (checked) return Array.from(new Set([...current, rowId]));
    return current.filter((id) => id !== rowId);
  });
}

function deleteSelectedDuplicateRows() {
  if (!selectedDuplicateIds.length) {
    alert("Keine doppelten Positionen ausgewählt.");
    return;
  }

  const ok = window.confirm(
    `${selectedDuplicateIds.length} doppelte Position(en) löschen? Je Duplikatgruppe bleibt mindestens 1 Position erhalten.`
  );

  if (!ok) return;

  const ids = new Set(selectedDuplicateIds);
  const next = rows.filter((row) => !ids.has(row.id));

  setSelectedDuplicateIds([]);
  persistRows(next);

  try {
    localStorage.removeItem(KI_HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_CONSUMED_TS_KEY);
  } catch {
//
  }

  setServerStatus(`${ids.size} doppelte Position(en) gelöscht.`);
  setTimeout(() => setServerStatus(""), 3000);
}
function toggleOpenAiSelection(rowId: string, checked: boolean) {
  setSelectedOpenAiIds((current) => {
    if (checked) return Array.from(new Set([...current, rowId]));
    return current.filter((id) => id !== rowId);
  });
}

function clearOpenAiSelection() {
  setSelectedOpenAiIds([]);
  setServerStatus("OpenAI-Auswahl gelöscht");
  setTimeout(() => setServerStatus(""), 1800);
}

function selectWarningsForOpenAi() {
  const ids = rows
    .filter(
      (r) =>
        !kiIsStructuralRow(r) &&
        (r.calculationStatus === "warning" ||
          r.calculationStatus === "critical" ||
          r.riskLevel === "high" ||
          rowHasNoDb(r))
    )
    .map((r) => r.id);

  setSelectedOpenAiIds(Array.from(new Set(ids)));
  setServerStatus(`${ids.length} Position(en) für OpenAI-Prüfung ausgewählt`);
  setTimeout(() => setServerStatus(""), 2500);
}

async function runSelectedOpenAiCheck() {
  const selectedRows = rows.filter(
    (r) => selectedOpenAiIds.includes(r.id) && !kiIsStructuralRow(r)
  );

  if (!selectedRows.length) {
    setServerStatus("Keine Positionen für OpenAI ausgewählt");
    setTimeout(() => setServerStatus(""), 2200);
    return;
  }

  const beforeRows = kiCloneRows(rows);

  try {
    kiEmitStart("Ausgewählte Positionen werden mit OpenAI geprüft…");
    kiEmitProgress(15, `${selectedRows.length} ausgewählte Position(en) werden vorbereitet…`);

    setServerStatus(`${selectedRows.length} Position(en) werden mit OpenAI geprüft…`);

    const res = await eliteCalculateRows(projectKey, selectedRows, {
      forceRecalculate: true,
      expertMode: true,
      useOpenAIIfNoDatabaseHit: true,
      forceOpenAIReview: true,
      maxParallelRows: 3,
      maxOpenAiRowsPerBatch: Math.min(selectedRows.length, 50),
    });

    const byId = new Map<string, EliteKalkulationResultRow>();
    const byPos = new Map<string, EliteKalkulationResultRow>();

    for (const item of res.rows || []) {
      if (item.id) byId.set(String(item.id), item);
      if (item.posNr) byPos.set(String(item.posNr), item);
    }

    const next = rows.map((r) => {
      const result = byId.get(r.id) || byPos.get(r.posNr || "");
      if (!result) return r;

      const currentEp = n(r.finalUnitPrice ?? r.preis);
      const openAiEp = n(
        result.finalUnitPrice ??
          result.suggestedUnitPrice ??
          result.baseUnitPrice ??
          currentEp
      );

      const diff = round2(openAiEp - currentEp);
      const diffPct =
        currentEp > 0 ? round2((Math.abs(diff) / currentEp) * 100) : 0;

      return normalizeEliteRow(
        enhanceKalkulatorInsertions({
          ...r,

          // WICHTIG:
          // OpenAI wird NICHT automatisch übernommen.
          // Der bestehende EP bleibt unverändert.
          preis: currentEp,
          finalUnitPrice: currentEp,
          gesamt: round2(n(r.menge) * currentEp),

          // OpenAI-Vorschlag wird separat gespeichert.
          openAiSuggestedUnitPrice: openAiEp,
          openAiSuggestedTotal: round2(n(r.menge) * openAiEp),
          openAiSuggestedAt: new Date().toISOString(),
          openAiSuggestedReason: result.aiReason || "",
          openAiSuggestedWarning: result.warning || "",
          openAiSuggestedPriceBreakdown: result.priceBreakdown || [],

          rlcPreisMin: (result as any).rlcPreisMin,
          rlcPreisAvg: (result as any).rlcPreisAvg,
          rlcPreisMax: (result as any).rlcPreisMax,
          rlcPreisSource: (result as any).rlcPreisSource,
          rlcPreisGroup: (result as any).rlcPreisGroup,

          calculationStatus: diffPct >= 10 ? "warning" : r.calculationStatus,
          riskLevel: diffPct >= 25 ? "high" : r.riskLevel,

          warning: [
            cleanOpenAiProposalWarning(r.warning),
            `OpenAI-Vorschlag vorhanden: ${openAiEp} €/EH statt aktuell ${currentEp} €/EH (${diff >= 0 ? "+" : ""}${diff} €, ${diffPct} % Abweichung). Bitte manuell übernehmen oder ablehnen.`,
          ]
            .filter(Boolean)
            .join(" · "),
        } as unknown as EliteRow)
      );
    });

    persistRows(normalizeKiWarningRows(next));

    // Wichtig: OpenAI-Testwerte NICHT automatisch in Datenbank speichern.
    // saveRowsToDatenbank(next, projectKey, projectTitle);

    kiEmitProgress(96, "OpenAI-Vorschläge werden gespeichert…");
    kiEmitResult("OpenAI-Prüfung als Vorschlag gespeichert", beforeRows, next, res.summary);

    setSelectedOpenAiIds([]);
    setServerStatus(`${selectedRows.length} OpenAI-Vorschlag/Vorschläge gespeichert`);
    setTimeout(() => setServerStatus(""), 3500);
  } catch (e) {
    console.error(e);
    setServerStatus("OpenAI-Prüfung fehlgeschlagen");
    setTimeout(() => setServerStatus(""), 3500);
  }
}
function getRawOpenAiProposalPrice(row: EliteRow | null | undefined): number {
  return n((row as any)?.openAiSuggestedUnitPrice);
}

function getOpenAiProposalPrice(row: EliteRow | null | undefined): number {
  const openAi = getRawOpenAiProposalPrice(row);
  const rlc = getRlcRangeForRow(row);

  if (openAi <= 0) return 0;

  /*
   * Zentrale Plausibilitätslogik:
   * RLC-Materialpreise dürfen den finalen EP NICHT deckeln.
   * Material dient nur als Urkalkulations-/Materialansatz.
   * Deckelung ist nur erlaubt bei echten Leistungs-/Transport-/Fremdleistungswerten.
   */
  const rlcGroup = String((rlc as any).group || "").toLowerCase();
  const rlcCanLimitFinalPrice =
    rlcGroup.includes("transport") ||
    rlcGroup.includes("maschine") ||
    rlcGroup.includes("fremdleistung") ||
    rlcGroup.includes("oberfläche");

  if (rlcCanLimitFinalPrice && rlc.avg > 0 && rlc.min > 0 && rlc.max > 0) {
    if (openAi > rlc.max) return rlc.avg;
    if (openAi < rlc.min) return rlc.avg;
  }

  return openAi;
}

function rowHasOpenAiProposal(row: EliteRow | null | undefined): boolean {
  return getRawOpenAiProposalPrice(row) > 0 || getOpenAiProposalPrice(row) > 0;
}

function acceptOpenAiSuggestionForRow(rowId: string) {
  const target = rows.find((r) => r.id === rowId);
  if (!target) return;

  const proposal = getOpenAiProposalPrice(target);
  if (proposal <= 0) return;

  const next = rows.map((r) => {
    if (r.id !== rowId) return r;

    const anyRow = r as any;

    return normalizeEliteRow(
      enhanceKalkulatorInsertions({
        ...r,
        preis: proposal,
        finalUnitPrice: proposal,
        suggestedUnitPrice: proposal,
        gesamt: round2(n(r.menge) * proposal),
        source: "ki",
        priceBreakdown:
          Array.isArray(anyRow.openAiSuggestedPriceBreakdown) &&
          anyRow.openAiSuggestedPriceBreakdown.length
            ? anyRow.openAiSuggestedPriceBreakdown
            : r.priceBreakdown,
        warning: "",
        calculationStatus: "ok",
        riskLevel: r.riskLevel === "high" ? "medium" : r.riskLevel,
        aiReason: [
          r.aiReason,
          "OpenAI-Vorschlag wurde manuell für diese Position übernommen.",
          anyRow.openAiSuggestedReason,
        ]
          .filter(Boolean)
          .join("\n\n"),
        preisManuellGeprueft: true,
        preisManuellGeprueftAt: new Date().toISOString(),
      openAiRejected: true,
      openAiSuggestedUnitPrice: undefined,
        openAiSuggestedTotal: undefined,
        openAiSuggestedAt: undefined,
        openAiSuggestedReason: undefined,
        openAiSuggestedWarning: undefined,
        openAiSuggestedPriceBreakdown: undefined,
      } as unknown as EliteRow)
    );
  });

  persistRows(normalizeKiWarningRows(next));
  setServerStatus("OpenAI-Preis für Position übernommen");
  setTimeout(() => setServerStatus(""), 2500);
}

function rejectOpenAiSuggestionForRow(rowId: string) {
  const next = rows.map((r) => {
    if (r.id !== rowId) return r;

    return cleanRlcKiWarningState(normalizeEliteRow({
      ...r,
      warning: "",
      calculationStatus: "ok",
      riskLevel: r.riskLevel === "high" ? "medium" : r.riskLevel,
      preisManuellGeprueft: true,
      preisManuellGeprueftAt: new Date().toISOString(),
      openAiRejected: true,
      openAiSuggestedUnitPrice: undefined,
      openAiSuggestedTotal: undefined,
      openAiSuggestedAt: undefined,
      openAiSuggestedReason: undefined,
      openAiSuggestedWarning: undefined,
      openAiSuggestedPriceBreakdown: undefined,
    } as unknown as EliteRow));
  });

  persistRows(normalizeKiWarningRows(next));
  setServerStatus("OpenAI-Vorschlag abgelehnt");
  setTimeout(() => setServerStatus(""), 2500);
}

function saveOpenAiSuggestionForRow(rowId: string) {
  const target = rows.find((r) => r.id === rowId);
  if (!target) return;

  const proposal = getOpenAiProposalPrice(target);
  if (proposal <= 0) return;

  const anyRow = target as any;

  const learnedRow = normalizeEliteRow(
    enhanceKalkulatorInsertions({
      ...target,
      preis: proposal,
      finalUnitPrice: proposal,
      suggestedUnitPrice: proposal,
      gesamt: round2(n(target.menge) * proposal),
      source: "ki",
      priceBreakdown:
        Array.isArray(anyRow.openAiSuggestedPriceBreakdown) &&
        anyRow.openAiSuggestedPriceBreakdown.length
          ? anyRow.openAiSuggestedPriceBreakdown
          : target.priceBreakdown,
      warning: "",
      aiReason: [
        target.aiReason,
        "Als geprüfter Firmenwert aus OpenAI-Vorschlag gespeichert.",
        anyRow.openAiSuggestedReason,
      ]
        .filter(Boolean)
        .join("\n\n"),
    } as unknown as EliteRow)
  );

  const count = saveRowsToDatenbank([learnedRow], projectKey, projectTitle);
  setServerStatus(`${count} Firmenwert gespeichert`);
  setTimeout(() => setServerStatus(""), 2500);
}

function selectedOpenAiProposalPrice(): number {
  return n((selectedRow as any)?.openAiSuggestedUnitPrice);
}

function selectedHasOpenAiProposal(): boolean {
  return !!selectedRow && selectedOpenAiProposalPrice() > 0;
}

function cleanOpenAiProposalWarning(text?: string): string {
  return String(text || "")
    .split(" · ")
    .filter((part) => !part.toLowerCase().includes("openai-vorschlag"))
    .join(" · ")
    .trim();
}

function acceptSelectedOpenAiSuggestion() {
  if (!selectedRow) return;

  const proposal = selectedOpenAiProposalPrice();
  if (proposal <= 0) {
    setServerStatus("Kein OpenAI-Vorschlag für diese Position vorhanden");
    setTimeout(() => setServerStatus(""), 2200);
    return;
  }

  const next = rows.map((r) => {
    if (r.id !== selectedRow.id) return r;

    const anyRow = r as any;
    const cleanedWarning = cleanOpenAiProposalWarning(r.warning);

    return normalizeEliteRow(
      enhanceKalkulatorInsertions({
        ...r,
        preis: proposal,
        finalUnitPrice: proposal,
        suggestedUnitPrice: proposal,
        gesamt: round2(n(r.menge) * proposal),
        source: "ki",
        priceBreakdown:
          Array.isArray(anyRow.openAiSuggestedPriceBreakdown) &&
          anyRow.openAiSuggestedPriceBreakdown.length
            ? anyRow.openAiSuggestedPriceBreakdown
            : r.priceBreakdown,
        warning: cleanedWarning,
        aiReason: [
          r.aiReason,
          "OpenAI-Vorschlag wurde manuell übernommen.",
          anyRow.openAiSuggestedReason,
        ]
          .filter(Boolean)
          .join("\n\n"),

        preisManuellGeprueft: true,
        preisManuellGeprueftAt: new Date().toISOString(),
      openAiRejected: true,
      openAiSuggestedUnitPrice: undefined,
        openAiSuggestedTotal: undefined,
        openAiSuggestedAt: undefined,
        openAiSuggestedReason: undefined,
        openAiSuggestedWarning: undefined,
        openAiSuggestedPriceBreakdown: undefined,
      } as unknown as EliteRow)
    );
  });

  persistRows(normalizeKiWarningRows(next));
  setServerStatus("OpenAI-Vorschlag wurde übernommen");
  setTimeout(() => setServerStatus(""), 2500);
}

function rejectSelectedOpenAiSuggestion() {
  const next = rows.map((r) => clearOldKiProposalFields(r));

  persistRows(next);

  setSelectedOpenAiIds([]);
  setServerStatus("Alle alten OpenAI/RLC-KI-Vorschläge wurden gelöscht. X84 bleibt final.");
  setTimeout(() => setServerStatus(""), 3000);
}

function saveSelectedOpenAiSuggestionAsKnowledge() {
  if (!selectedRow) return;

  const proposal = selectedOpenAiProposalPrice();
  if (proposal <= 0) {
    setServerStatus("Kein OpenAI-Vorschlag zum Speichern vorhanden");
    setTimeout(() => setServerStatus(""), 2200);
    return;
  }

  const anyRow = selectedRow as any;

  const learnedRow = normalizeEliteRow(
    enhanceKalkulatorInsertions({
      ...selectedRow,
      preis: proposal,
      finalUnitPrice: proposal,
      suggestedUnitPrice: proposal,
      gesamt: round2(n(selectedRow.menge) * proposal),
      source: "ki",
      priceBreakdown:
        Array.isArray(anyRow.openAiSuggestedPriceBreakdown) &&
        anyRow.openAiSuggestedPriceBreakdown.length
          ? anyRow.openAiSuggestedPriceBreakdown
          : selectedRow.priceBreakdown,
      warning: "",
      aiReason: [
        selectedRow.aiReason,
        "Als geprüfter Firmenwert aus OpenAI-Vorschlag gespeichert.",
        anyRow.openAiSuggestedReason,
      ]
        .filter(Boolean)
        .join("\n\n"),
    } as unknown as EliteRow)
  );

  const count = saveRowsToDatenbank([learnedRow], projectKey, projectTitle);

  setServerStatus(`${count} OpenAI-Vorschlag als Firmenwert gespeichert`);
  setTimeout(() => setServerStatus(""), 3000);
}

function activeFilterLabel(): string {
  switch (viewFilter) {
    case "kritisch":
      return "Kritische Positionen";
    case "warnungen":
      return "Warnungen";
    case "hochrisiko":
      return "Hochrisiko";
    case "ohneDb":
      return "Ohne Datenbanktreffer";
    case "sicher":
      return "Sichere Positionen";
    case "alle":
    default:
      return "Alle Positionen";
  }
}
function kiAssistantMessage(): string {
  if (!rows.length) {
    return "Noch keine LV-Positionen vorhanden. Lade zuerst ein Leistungsverzeichnis oder füge Positionen manuell hinzu.";
  }

  if (loading) {
    return "Ich analysiere gerade die Positionen, ergänze fehlende Angaben, prüfe Risiken und baue die Urkalkulation auf.";
  }

  if (
    problemCounts.kurztextFehlt > 0 ||
    problemCounts.langtextFehlt > 0 ||
    problemCounts.einheitFehlt > 0 ||
    problemCounts.preisaufbauFehlt > 0
  ) {
    return `Es fehlen noch Angaben: ${problemCounts.kurztextFehlt} Kurztext, ${problemCounts.langtextFehlt} Langtext, ${problemCounts.einheitFehlt} Einheit, ${problemCounts.preisaufbauFehlt} Preisaufbau. Du kannst diese automatisch ergänzen lassen.`;
  }

  if (summary.critical > 0) {
    return `${summary.critical} Position(en) sind kritisch. Prüfe zuerst Mengen, Einheitspreise und fehlende Kostenansätze.`;
  }

  if (summary.highRisk > 0) {
    return `${summary.highRisk} Position(en) haben erhöhtes Risiko. Prüfe diese Positionen vor dem Export.`;
  }

  if (problemCounts.ohneDb > 0) {
    return `${problemCounts.ohneDb} Position(en) haben keinen sicheren Datenbanktreffer. Nach manueller Prüfung können sie gelernt werden.`;
  }

  if (problemCounts.sicher > 0) {
    return `${problemCounts.sicher} Position(en) sind plausibel und können in die Wissensbasis übernommen werden.`;
  }

  return "Die Kalkulation wirkt plausibel. Prüfe die größten Positionen und exportiere danach Angebot, XLSX, PDF oder GAEB.";
}

function runPrimaryKiAction() {
  if (!rows.length) {
    alert("Keine Positionen vorhanden.");
    return;
  }

  if (
    problemCounts.kurztextFehlt > 0 ||
    problemCounts.langtextFehlt > 0 ||
    problemCounts.einheitFehlt > 0 ||
    problemCounts.preisaufbauFehlt > 0
  ) {
    autoCompleteMissingFields();
    return;
  }

  void runEliteCalculation();
}

return (
  <div style={page}>
    <input
      ref={csvInputRef}
      type="file"
      accept=".csv,text/csv"
      style={{ display: "none" }}
      onChange={(e) => handleCsvImport(e.target.files?.[0] || null)}
    />

    <section style={heroCardCompact}>
      <div style={heroTopLine}>
        <div>
          <div style={eyebrow}>RLC KI-Kalkulation</div>

          <h1 style={titleCompact}>Kalkulation mit KI</h1>

          <p style={subtitleCompact}>
            LV-Positionen kalkulieren, Urkalkulation aufbauen, Risiken prüfen
            und Angebot, PDF, XLSX und GAEB direkt erzeugen.
          </p>
        </div>

        <div style={heroMetaCompact}>
          <span>Projekt</span>
          <b>{projectKey || "—"}</b>
          {lastKiSource ? <em>{lastKiSource}</em> : null}
        </div>
      </div>

      <div style={compactToolbar}>
        <button type="button" style={btnSecondary} onClick={addRow}>
          + Position
        </button>

        <button
          type="button"
          style={btnPrimary}
          onClick={runPrimaryKiAction}
          disabled={loading || !rows.length}
        >
          {loading ? "KI arbeitet…" : "KI starten"}
        </button>

        <button
          type="button"
          style={btnSecondary}
          onClick={() => void runEliteCalculation(true)}
          disabled={loading || !rows.length}
          title="Schnelle Neuberechnung: ignoriert falsche alte Preise, nutzt DB/Rule-Engine/Plausibilitätsdeckel und nur wenige OpenAI-Prüfungen."
        >
          KI neu berechnen schnell
        </button>

        <button
          type="button"
          style={btnSecondary}
          onClick={() => void runEliteCalculation(true, true)}
          disabled={loading || !rows.length}
          title="Langsame Tiefprüfung: nutzt OpenAI für deutlich mehr Positionen. Nur bei Bedarf verwenden."
        >
          KI Expertprüfung
        </button>

        <button
          type="button"
          style={btnSecondary}
          onClick={autoCompleteMissingFields}
          disabled={!rows.length}
        >
          Ergänzen
        </button>

        <button
          type="button"
          style={btnSecondary}
          onClick={saveToProjectServer}
          disabled={serverBusy || !projectKey}
        >
          Speichern
        </button>

        <button
          type="button"
          style={btnSecondary}
          onClick={loadFromProjectServer}
          disabled={serverBusy || !projectKey}
        >
          Laden
        </button>

        <button
  type="button"
  style={btnSecondary}
  onClick={() => setShowQuickActions((v) => !v)}
>
  {showQuickActions ? "Funktionen schließen" : "Funktionen"}
</button>
      </div>

      {serverStatus ? <div style={heroStatus}>{serverStatus}</div> : null}
    </section>

    {showQuickActions ? (
      <section style={compactActionPanel}>
        <div style={compactActionHeader}>
          <div>
            <h2 style={sectionTitle}>Funktionen</h2>
<div style={sectionText}>
  Zentrale Funktionen für LV, Nachträge, Angebot, GAEB, Export und Einstellungen.
</div>
          </div>
        </div>

        <div style={compactActionGrid}>
          <button
            type="button"
            style={compactActionButton}
            onClick={() => navigate("/kalkulation/lv-import")}
          >
            <b>LV / Positionen</b>
            <span>Importieren und bearbeiten</span>
          </button>

          <button
  type="button"
  style={compactActionButton}
  onClick={() => navigate("/kalkulation/nachtraege")}
>
  <b>Nachträge</b>
  <span>Zusatzleistungen und Änderungen bearbeiten</span>
</button>

<button
  type="button"
  style={compactActionButton}
  onClick={() => navigate("/kalkulation/angebot")}
>
  <b>Angebot / Export</b>
  <span>Angebot, PDF und Angebotsunterlagen erzeugen</span>
</button>

<button
  type="button"
  style={compactActionButton}
  onClick={() => navigate("/kalkulation/gaeb")}
>
  <b>GAEB Import / Export</b>
  <span>GAEB-Dateien importieren, prüfen und alle Formate zentral exportieren</span>
</button>

          <button
            type="button"
            style={compactActionButton}
            onClick={() => csvInputRef.current?.click()}
          >
            <b>CSV Import</b>
            <span>Positionen aus CSV laden</span>
          </button>

          <button
            type="button"
            style={compactActionButton}
            onClick={() => downloadCsv(rows)}
            disabled={!rows.length}
          >
            <b>CSV Export</b>
            <span>Aktuelle Kalkulation exportieren</span>
          </button>

          <button
            type="button"
            style={compactActionButton}
            onClick={() => exportXlsx(rows, chapterTotals, summary, offer)}
            disabled={!rows.length}
          >
            <b>XLSX</b>
            <span>Kalkulation mit Preisaufbau</span>
          </button>

          <button
            type="button"
            style={compactActionButton}
            onClick={handlePdfExport}
            disabled={!rows.length || pdfBusy}
          >
            <b>{pdfBusy ? "PDF…" : "PDF Angebot"}</b>
            <span>Angebots-PDF erzeugen</span>
          </button>

          <button
            type="button"
            style={compactActionButton}
            onClick={handleUrkalkulationPdfExport}
            disabled={!rows.length || pdfBusy}
          >
            <b>Urkalkulation PDF</b>
            <span>Detailkalkulation exportieren</span>
          </button>
        </div>
      </section>
    ) : null}

    <section style={compactOrderCard}>
      <div style={orderHead}>
        <div>
          <h2 style={sectionTitle}>Auftragsstruktur</h2>
          <div style={sectionText}>
            Hauptauftrag und Unteraufträge kompakt steuern.
          </div>
        </div>

        <button type="button" style={btnPrimary} onClick={createUnterauftrag}>
          + Unterauftrag
        </button>
      </div>

      <div style={auftragSummaryBoxCompact}>
        <div>
          Auftrag:{" "}
          <b>
            {selectedAuftragId
              ? selectedAuftrag?.name || "—"
              : "Alle Aufträge"}
          </b>
        </div>

        <div>
          Positionen: <b>{selectedAuftragSummary.count}</b> · Kalkuliert:{" "}
          <b>{selectedAuftragSummary.priced}</b> · Netto:{" "}
          <b>{money(selectedAuftragSummary.net)}</b>
        </div>
      </div>

      <div style={auftragTabsCompact}>
        <button
          type="button"
          style={!selectedAuftragId ? auftragTabActive : auftragTab}
          onClick={() => setSelectedAuftragId("")}
        >
          Alle
        </button>

        {auftraege.map((auftrag) => (
          <button
            key={auftrag.id}
            type="button"
            style={
              selectedAuftragId === auftrag.id ? auftragTabActive : auftragTab
            }
            onClick={() => setSelectedAuftragId(auftrag.id)}
          >
            {auftrag.type === "haupt" ? "Haupt" : "Unter"} · {auftrag.name}
          </button>
        ))}
      </div>
    </section>

    <section style={grid4Compact}>
      <KpiCard
        label="Angebot X84 netto"
        value={money(summary.angebotNet)}
        sub={`Brutto ${money(summary.angebotGross)}`}
      />

      <KpiCard
        label="RLC-KI netto"
        value={money(summary.rlcKiNet || summary.net)}
        sub={`Brutto ${money(summary.rlcKiGross || summary.gross)} · Differenz ${money(summary.diffNet)} · ${summary.diffPct}%`}
      />

      <KpiCard
        label="Prüfen"
        value={`${summary.critical + summary.highRisk}`}
        sub={`${summary.critical} kritisch · ${summary.highRisk} Hochrisiko`}
      />

      <KpiCard
        label="Ø Sicherheit"
        value={percent(summary.avgConfidence)}
        sub={`${summary.priced}/${summary.total} kalkuliert`}
      />
    </section>
    {topPriceDiffRows.length > 0 ? (
      <section style={priceCompareCard}>
        <div style={sectionHead}>
          <div>
            <h2 style={sectionTitle}>Preisvergleich X84 ↔ RLC-KI</h2>
            <div style={sectionText}>
              Größte Abweichungen zwischen Angebotspreis X84 und RLC-KI-Vergleichspreis. X84 bleibt final, KI ist nur Prüfwert.
            </div>
          </div>

          <div style={priceCompareBadge}>
            Top {topPriceDiffRows.length} Differenzen
          </div>
        </div>

        <div style={priceCompareTableWrap}>
          <table style={priceCompareTable}>
            <thead>
              <tr>
                <th style={priceCompareTh}>Pos.</th>
                <th style={priceCompareTh}>Kurztext</th>
                <th style={priceCompareThRight}>Menge</th>
                <th style={priceCompareTh}>ME</th>
                <th style={priceCompareThRight}>EP X84</th>
                <th style={priceCompareThRight}>EP RLC-KI</th>
                <th style={priceCompareThRight}>Diff. EP</th>
                <th style={priceCompareThRight}>Diff. %</th>
                <th style={priceCompareThRight}>Diff. GP</th>
                <th style={priceCompareTh}>Bewertung</th>
              </tr>
            </thead>

            <tbody>
              {topPriceDiffRows.map((r) => (
                <tr
                  key={r.id}
                  style={priceCompareTr}
                  onClick={() => {
                    setSelectedId(r.id);
                    setViewFilter("alle");
                    // Kein automatisches Scrollen bei Positionsauswahl.
                  }}
                >
                  <td style={priceCompareTdStrong}>{r.posNr || "—"}</td>
                  <td style={priceCompareTd}>{r.kurztext || "—"}</td>
                  <td style={priceCompareTdRight}>{qty(r.menge)}</td>
                  <td style={priceCompareTd}>{r.einheit || "—"}</td>
                  <td style={priceCompareTdRight}>{money(r.angebotEp)}</td>
                  <td style={priceCompareTdRight}>{money(r.kiEp)}</td>
                  <td style={priceCompareTdRight}>{money(r.diffEp)}</td>
                  <td style={priceCompareTdRight}>{r.diffPct}%</td>
                  <td style={priceCompareTdRight}>{money(r.diffGp)}</td>
                  <td style={priceCompareTd}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span
                        style={
                          Math.abs(r.diffPct) > 30
                            ? badgeCritical
                            : Math.abs(r.diffPct) > 15
                              ? badgeWarn
                              : Math.abs(r.diffPct) > 5
                                ? badgeInfo
                                : badgeOk
                        }
                      >
                        {r.empfehlung}
                      </span>

                      <button
                        type="button"
                        style={btnMini}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(r.id);
                          setViewFilter("alle");
                          scrollToLvPosition(r.id);
                        }}
                      >
                        Bearbeiten
                      </button>

                      <button
                        type="button"
                        style={btnMini}
                        onClick={(e) => {
                          e.stopPropagation();
                          applyKiSuggestedPrice(r.id);
                          setSelectedId(r.id);
                          setViewFilter("alle");
                          scrollToLvPosition(r.id);
                        }}
                      >
                        KI übernehmen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    ) : null}
    {/* KI interna rimossa: ora lavora solo il RLC-KI Assistent globale */}

    {showCommercialSettings ? (
      <section style={card}>
        <div style={sectionHead}>
          <div>
            <h2 style={sectionTitle}>Angebot / Rahmenwerte</h2>
            <div style={sectionText}>
              Diese Werte fließen in PDF, XLSX, Snapshot und Angebotsübergabe
              ein.
            </div>
          </div>
        </div>

        <div style={formGrid}>
          <Field label="Angebot Nr.">
            <input
              style={input}
              value={offer.number}
              onChange={(e) => setOffer({ ...offer, number: e.target.value })}
            />
          </Field>

          <Field label="Ort">
            <input
              style={input}
              value={offer.place}
              onChange={(e) => setOffer({ ...offer, place: e.target.value })}
            />
          </Field>

          <Field label="Kunde">
            <input
              style={input}
              value={client.name}
              onChange={(e) => setClient({ ...client, name: e.target.value })}
            />
          </Field>

          <Field label="Kundenadresse">
            <input
              style={input}
              value={client.address}
              onChange={(e) =>
                setClient({ ...client, address: e.target.value })
              }
            />
          </Field>

          <Field label="Globaler Aufschlag %">
            <input
              type="number"
              style={input}
              value={globalMarkup}
              onChange={(e) => setGlobalMarkup(n(e.target.value))}
            />
          </Field>

          <Field label="MwSt %">
            <input
              type="number"
              style={input}
              value={mwst}
              onChange={(e) => setMwst(n(e.target.value))}
            />
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <Field label="Notizen / Zahlungsbedingungen">
            <textarea
              style={{ ...input, minHeight: 70 }}
              value={offer.notes}
              onChange={(e) => setOffer({ ...offer, notes: e.target.value })}
            />
          </Field>
        </div>
      </section>
    ) : null}

    {showChapterSettings ? (
      <section style={card}>
        <div style={sectionHead}>
          <div>
            <h2 style={sectionTitle}>Kapitelsteuerung</h2>
            <div style={sectionText}>
              Rabatt und Markup pro Kapitel für Angebotsstrategie.
            </div>
          </div>
        </div>

        <div style={chapterGrid}>
          {Array.from(chapters.keys()).map((ch) => (
            <div key={ch} style={chapterBox}>
              <div style={{ fontWeight: 800 }}>Kapitel {ch}</div>

              <div style={chapterInputs}>
                <label style={label}>Rabatt %</label>
                <input
                  type="number"
                  style={smallInput}
                  value={kapRabatt[ch] ?? 0}
                  onChange={(e) =>
                    setKapRabatt({ ...kapRabatt, [ch]: n(e.target.value) })
                  }
                />

                <label style={label}>Markup %</label>
                <input
                  type="number"
                  style={smallInput}
                  value={kapMarkup[ch] ?? 0}
                  onChange={(e) =>
                    setKapMarkup({ ...kapMarkup, [ch]: n(e.target.value) })
                  }
                />
              </div>

              <div style={tiny}>
                Netto: {money(chapterTotals[ch]?.afterChapterMarkup)}
              </div>
            </div>
          ))}

          {!chapters.size ? <div style={muted}>Noch keine Kapitel.</div> : null}
        </div>
      </section>
    ) : null}

    <section id="rlc-lv-positionen" style={calcEditorGrid}>
          {/* ================= OBERER BEREICH: LV KOMPAKT ================= */}
          <div style={card}>
            <div style={sectionHead}>
              <div>
                <h2 style={sectionTitle}>LV / Positionsliste</h2>
                <div style={sectionText}>
                  Kompakte Übersicht der LV-Positionen. Der Kurztext ist jetzt
                  lesbar, die Detailkalkulation erfolgt unten in der Urkalkulation.
                </div>
              </div>

              <div style={exportRow}>
                <button
                  type="button"
                  style={btnPrimary}
                  onClick={runPrimaryKiAction}
                  disabled={loading || !rows.length}
                >
                  {loading ? "KI arbeitet…" : "KI kalkulieren"}
                </button>

                <button
                  type="button"
                  style={btnSecondary}
                  onClick={() => void runEliteCalculation(true)}
                  disabled={loading || !rows.length}
                  title="Schnelle Neuberechnung mit begrenzter OpenAI-Prüfung."
                >
                  KI neu berechnen schnell
                </button>

                <button
                  type="button"
                  style={btnSecondary}
                  onClick={() => void runEliteCalculation(true, true)}
                  disabled={loading || !rows.length}
                  title="Langsame Tiefprüfung mit deutlich mehr OpenAI-Prüfungen."
                >
                  KI Expertprüfung
                </button>

                <button
                  type="button"
                  style={btnSecondary}
                  onClick={addRow}
                >
                  + Position
                </button>

                <details style={lvMenuWrap}>
                  <summary style={lvMenuButton}>Mehr ▾</summary>

                  <div style={lvMenuPanel}>
                    <button
                      type="button"
                      style={lvMenuItem}
                      onClick={() => csvInputRef.current?.click()}
                    >
                      CSV importieren
                    </button>

                    <button
                      type="button"
                      style={lvMenuItem}
                      onClick={() => downloadCsv(rows)}
                      disabled={!rows.length}
                    >
                      CSV exportieren
                    </button>

                    <button
                      type="button"
                      style={lvMenuItem}
                      onClick={() => exportXlsx(rows, chapterTotals, summary, offer)}
                      disabled={!rows.length}
                    >
                      XLSX exportieren
                    </button>

                    <button
                      type="button"
                      style={lvMenuItem}
                      onClick={handlePdfExport}
                      disabled={!rows.length || pdfBusy}
                    >
                      PDF Angebot
                    </button>

                    <button
                      type="button"
                      style={lvMenuItem}
                      onClick={handleUrkalkulationPdfExport}
                      disabled={!rows.length || pdfBusy}
                    >
                      Urkalkulation PDF
                    </button>

                    <button
                      type="button"
                      style={lvMenuItem}
                      onClick={() => exportGaeb("x83")}
                      disabled={!rows.length}
                    >
                      GAEB X83
                    </button>

                    <button
                      type="button"
                      style={lvMenuItem}
                      onClick={() => exportGaeb("x84")}
                      disabled={!rows.length}
                    >
                      GAEB X84
                    </button>
                  </div>
                </details>
              </div>
            </div>

            <div style={filterRow}>
              <FilterButton
                active={viewFilter === "alle"}
                onClick={() => setViewFilter("alle")}
              >
                Alle {rows.length}
              </FilterButton>

              <FilterButton
                active={viewFilter === "kritisch"}
                onClick={() => setViewFilter("kritisch")}
              >
                Kritisch {problemCounts.kritisch}
              </FilterButton>

              <FilterButton
                active={viewFilter === "warnungen"}
                onClick={() => setViewFilter("warnungen")}
              >
                Warnungen {problemCounts.warnungen}
              </FilterButton>

              <FilterButton
                active={viewFilter === "hochrisiko"}
                onClick={() => setViewFilter("hochrisiko")}
              >
                Hochrisiko {problemCounts.hochrisiko}
              </FilterButton>

              <FilterButton
                active={viewFilter === "ohneDb"}
                onClick={() => setViewFilter("ohneDb")}
              >
                Ohne DB {problemCounts.ohneDb}
              </FilterButton>

              <FilterButton
                active={viewFilter === "sicher"}
                onClick={() => setViewFilter("sicher")}
              >
                Sicher {problemCounts.sicher}
              </FilterButton>

              <span style={filterMeta}>
                Sichtbar: {filteredRows.length}/{rows.length}
              </span>
            </div>

            <details open style={lvDropdownBox}>
          <summary style={lvDropdownSummary}>
            <span>
              LV-Positionen · {filteredRows.length} Position(en) · Sichtbar max. {lvPageSize}
            </span>
            <span style={lvDropdownHint}>öffnen / schließen</span>
          </summary>

          <div style={{ ...exportRow, marginBottom: 10 }}>
            <button
              type="button"
              style={btnSecondary}
              onClick={selectWarningsForOpenAi}
              disabled={!rows.length}
              title="Wählt Warnungen, kritische Positionen, Hochrisiko und Positionen ohne DB für OpenAI aus."
            >
              Warnungen auswählen
            </button>

            <button
              type="button"
              style={btnPrimary}
              onClick={() => void runSelectedOpenAiCheck()}
              disabled={loading || selectedOpenAiIds.length === 0}
              title="Prüft nur die ausgewählten Positionen mit OpenAI."
            >
              Auswahl mit OpenAI prüfen ({selectedOpenAiIds.length})
            </button>

            <button
              type="button"
              style={btnSecondary}
              onClick={clearOpenAiSelection}
              disabled={selectedOpenAiIds.length === 0}
            >
              Auswahl löschen
            </button>

            <button
              type="button"
              style={btnPrimary}
              onClick={acceptSelectedOpenAiSuggestion}
              disabled={!selectedHasOpenAiProposal()}
              title="Übernimmt den OpenAI-Vorschlag nur für die aktuell ausgewählte Position."
            >
              OpenAI übernehmen
            </button>

            <button
              type="button"
              style={btnSecondary}
              onClick={rejectSelectedOpenAiSuggestion}
              disabled={!selectedHasOpenAiProposal()}
            >
              OpenAI ablehnen
            </button>

            <button
              type="button"
              style={btnSecondary}
              onClick={saveSelectedOpenAiSuggestionAsKnowledge}
              disabled={!selectedHasOpenAiProposal()}
              title="Speichert den OpenAI-Vorschlag als geprüften Firmenwert in der lokalen Kalkulationsdatenbank."
            >
              Als Firmenwert speichern
            </button>

            <button
              type="button"
              style={btnPrimary}
              onClick={saveAllToKnowledge}
              disabled={!rows.length}
              title="Überträgt alle aktuell kalkulierten LV-Positionen in die Kalkulationsdatenbank."
            >
              In Datenbank übertragen ({rows.length})
            </button>
          </div>
          <div style={lvTableScroll}>
            <table style={lvTable}>
                <thead>
                  <tr>
                    <th style={lvTh}>OpenAI</th>
                    <th style={lvTh}>Auftrag</th>
                    <th style={lvTh}>Pos.</th>
                    <th style={lvTh}>Kurztext</th>
                    <th style={lvThRight}>Menge</th>
                    <th style={lvTh}>ME</th>
                    <th style={lvThRight}>EP X84</th>
                    <th style={lvThRight}>EP RLC-KI</th>
                    <th style={lvThRight}>EP final</th>
                    <th style={lvThRight}>GP final</th>
                    <th style={lvTh}>Status</th>
                    <th style={lvTh}></th>
                  </tr>
                </thead>

                <tbody>
                  {visibleLvRows.map((r) => {
                    const gp = lineNet(r);
                    const isSelected = selectedRow?.id === r.id;

                    return (
                      <tr
                        id={`rlc-row-${r.id}`}
                        key={r.id}
                        style={{
                          ...lvRow,
                          ...(isSelected ? lvRowSelected : {}),
                          ...(r.calculationStatus === "critical"
                            ? lvRowCritical
                            : {}),
                          ...(r.calculationStatus === "warning" ? lvRowWarning : {}),
                          ...(kiIsStructuralRow(r) ? lvRowStructure : {}),
                        }}
                        onClick={() => setSelectedId(r.id)}
                      >
                        <td style={lvTd}>
                          <input
                            type="checkbox"
                            checked={selectedOpenAiIds.includes(r.id)}
                            disabled={kiIsStructuralRow(r)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              toggleOpenAiSelection(r.id, e.target.checked)
                            }
                          />
                        </td>

                        <td style={lvTd}>
                          <select
                            style={lvSelect}
                            value={r.auftragId || ""}
                            onChange={(e) => {
                              const a = auftraege.find(
                                (x) => x.id === e.target.value
                              );

                              updateRow(r.id, {
                                auftragId: a?.id || "",
                                auftragName: a?.name || "",
                                auftragType: a?.type,
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="">Ohne Auftrag</option>

                            {auftraege.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.type === "haupt" ? "Haupt" : "Unter"} ·{" "}
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td style={lvTd}>
                          <input
                            style={lvPosInput}
                            value={r.posNr}
                            onChange={(e) =>
                              updateRow(r.id, { posNr: e.target.value })
                            }
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>

                        <td style={lvTextTd}>
                          <input
                            style={lvKurztextInput}
                            value={r.kurztext}
                            placeholder="Kurztext eingeben…"
                            onChange={(e) =>
                              updateRow(r.id, { kurztext: e.target.value })
                            }
                            onClick={(e) => e.stopPropagation()}
                          />

                          {r.langtext?.trim() ? (
  <div style={lvLangPreview}>
    {r.langtext.slice(0, 150)}
    {r.langtext.length > 150 ? "…" : ""}

    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        style={btnMini}
        onClick={(e) => {
          e.stopPropagation();

          const text = [
            `Position: ${r.posNr || "—"}`,
            `Kurztext: ${r.kurztext || "—"}`,
            "",
            "Langtext:",
            r.langtext || "—",
            "",
            `Menge: ${qty(r.menge)} ${r.einheit || "EH"}`,
            `EP X84: ${money(getOfferUnitPrice(r))}`,
            `EP RLC-KI: ${money(getRlcKiUnitPrice(r))}`,
            `EP final: ${money(getUnitPrice(r))}`,
            `Gesamt netto: ${money(lineNet(r))}`,
          ].join("\n");

          showLangtextModal(text);
        }}
      >
        Langtext / Summe
      </button>
    </div>
  </div>
) : null}

                          {r.warning && !rowHasOpenAiProposal(r) ? (
                            <div style={lvMiniWarning}>{r.warning}</div>
                          ) : null}

                          {rowHasOpenAiProposal(r) ? (
                            <div
                              style={{
                                marginTop: 8,
                                padding: 10,
                                border: "1px solid #93C5FD",
                                background: "#EFF6FF",
                                borderRadius: 12,
                                color: "#1E3A8A",
                                fontSize: 12,
                                fontWeight: 800,
                                lineHeight: 1.45,
                              }}
                            >
                              <div>
  OpenAI-Vorschlag: {money(getOpenAiProposalPrice(r))} / EH
</div>

<div style={{ marginTop: 4 }}>
  EP Angebot X84: {money(getOfferUnitPrice(r))} / EH · RLC-KI aktuell:{" "}
  {money(getRlcKiUnitPrice(r))} / EH
</div>

<div style={{ marginTop: 4 }}>
  Differenz OpenAI zu X84:{" "}
  {money(round2(getOpenAiProposalPrice(r) - getOfferUnitPrice(r)))} ·{" "}
  {getOfferUnitPrice(r) > 0
    ? `${round2((Math.abs(getOpenAiProposalPrice(r) - getOfferUnitPrice(r)) / getOfferUnitPrice(r)) * 100)} %`
    : "—"}
</div>

<div style={{ marginTop: 4 }}>
  Differenz OpenAI zu RLC-KI:{" "}
  {money(round2(getOpenAiProposalPrice(r) - getRlcKiUnitPrice(r)))} ·{" "}
  {getRlcKiUnitPrice(r) > 0
    ? `${round2((Math.abs(getOpenAiProposalPrice(r) - getRlcKiUnitPrice(r)) / getRlcKiUnitPrice(r)) * 100)} %`
    : "—"}
</div>

                              {n((r as any).rlcPreisAvg) > 0 ? (
                                <div style={{ marginTop: 6, fontSize: 11, color: "#1E40AF" }}>
                                  RLC Bibliothek: min {money(n((r as any).rlcPreisMin))} · avg{" "}
                                  {money(n((r as any).rlcPreisAvg))} · max{" "}
                                  {money(n((r as any).rlcPreisMax))}
                                </div>
                              ) : null}

                              <div style={{ marginTop: 4, fontSize: 11, color: "#1D4ED8" }}>
                                Bewertung:{" "}
                                {getRawOpenAiProposalPrice(r) !== getOpenAiProposalPrice(r)
                                  ? "OpenAI wurde automatisch gegen RLC-Bibliothek plausibilisiert"
                                  : getRlcKiUnitPrice(r) <= 0
                                    ? "kein RLC-KI EP vorhanden"
                                    : Math.abs(getOpenAiProposalPrice(r) - getRlcKiUnitPrice(r)) / getRlcKiUnitPrice(r) < 0.1
                                      ? "nahe am aktuellen Preis"
                                      : getOpenAiProposalPrice(r) > getRlcKiUnitPrice(r)
                                        ? "OpenAI sieht aktuellen Preis eher zu niedrig"
                                        : "OpenAI sieht aktuellen Preis eher zu hoch"}
                              </div>

                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                                <button
                                  type="button"
                                  style={btnMini}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    acceptOpenAiSuggestionForRow(r.id);
                                  }}
                                >
                                  OpenAI-Preis übernehmen
                                </button>

                                <button
                                  type="button"
                                  style={btnMini}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    rejectOpenAiSuggestionForRow(r.id);
                                  }}
                                >
                                  Ablehnen
                                </button>

                                <button
                                  type="button"
                                  style={btnMini}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    saveOpenAiSuggestionForRow(r.id);
                                  }}
                                >
                                  Als Firmenwert speichern
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </td>

                        <td style={lvTdRight}>
                          <input
                            type="number"
                            style={lvNumberInput}
                            value={r.menge}
                            onChange={(e) =>
                              updateRow(r.id, { menge: n(e.target.value) })
                            }
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>

                        <td style={lvTd}>
                          <input
                            style={lvUnitInput}
                            value={r.einheit}
                            onChange={(e) =>
                              updateRow(r.id, { einheit: e.target.value })
                            }
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>

                        <td style={lvTdRight}>
                          <b>{money(getOfferUnitPrice(r))}</b>
                        </td>

                        <td style={lvTdRight}>
                          {(() => {
                            const ki = getRlcKiDisplay(r);

                            return (
                              <div style={{ display: "grid", gap: 4, justifyItems: "end" }}>
                                <b style={ki.rejected ? { color: "#B91C1C" } : undefined}>
                                  {ki.label}
                                </b>

                                {ki.rejected && ki.raw > 0 ? (
                                  <span style={{ fontSize: 11, color: "#B91C1C", fontWeight: 800 }}>
                                    verworfen
                                  </span>
                                ) : null}

                                {ki.valid > 0 ? (
                                  <button
                                    type="button"
                                    style={btnMini}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      applyKiSuggestedPrice(r.id);
                                    }}
                                  >
                                    KI übernehmen
                                  </button>
                                ) : null}
                              </div>
                            );
                          })()}
                        </td>

                        <td style={lvTdRight}>
                          <input
                            type="number"
                            style={lvPriceInput}
                            value={getUnitPrice(r)}
                            onChange={(e) =>
                              updateRow(r.id, {
                                finalUnitPrice: n(e.target.value),
                                preis: n(e.target.value),
                                priceDecision: "manual" as any,
                              })
                            }
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>

                        <td style={lvTdRight}>
                          <b>{money(gp)}</b>
                        </td>

                        <td style={lvTd}>
                          <span style={statusStyle(r.calculationStatus)}>
                            {kiIsStructuralRow(r) ? "Struktur" : statusLabel(r.calculationStatus)}
                          </span>
                        </td>

                        <td style={lvTd}>
                          <button
                            type="button"
                            style={btnDangerMini}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteRow(r.id);
                            }}
                          >
                            Löschen
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {!visibleLvRows.length ? (
                    <tr>
                      <td colSpan={12} style={{ ...lvTd, color: "#64748B" }}>
                        Keine Positionen für diesen Filter vorhanden.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
          </div>
        </details>

                </div>

<div style={bottomCalcGrid}>
    <div style={card}>
      <div style={sectionHead}>
        <div>
          <h2 style={sectionTitle}>Takte und Ansätze / Urkalkulation</h2>
          <div style={sectionText}>
            Hier wird der EP der gewählten Position aufgebaut: Lohn, Geräte,
            Stoffe, Fremdleistung, Sonstiges, EKT, EP und GP.
          </div>
        </div>

        <div style={exportRow}>
          <button
            type="button"
            style={btnSecondary}
            onClick={regenerateSelectedBreakdown}
            disabled={!selectedRow}
          >
            KI neu aufbauen
          </button>

          <button
            type="button"
            style={btnPrimary}
            onClick={addBreakdownLine}
            disabled={!selectedRow}
          >
            + Ansatz
          </button>
        </div>
      </div>

      {selectedRow ? (
        <>
          <div style={selectedPositionBar}>
            <div>
              <b>{selectedRow.posNr || "—"}</b> ·{" "}
              {selectedRow.kurztext || "Ohne Text"}
            </div>

            <div>
              Menge: <b>{qty(selectedRow.menge)} {selectedRow.einheit || "EH"}</b> · EP:{" "}
              <b>{money(getUnitPrice(selectedRow))}</b> · GP:{" "}
              <b>{money(lineNet(selectedRow))}</b>
            </div>
          </div>

          <div style={urkalkulationSummary}>
            <div style={urkBox}>
              <span style={urkLabel}>Lohn</span>
              <b>{money(groupSum(selectedRow, "Personal"))}</b>
            </div>

            <div style={urkBox}>
              <span style={urkLabel}>Geräte</span>
              <b>
                {money(
                  groupSum(selectedRow, "Maschinen") +
                    groupSum(selectedRow, "LKW / Transport")
                )}
              </b>
            </div>

            <div style={urkBox}>
              <span style={urkLabel}>Stoffe</span>
              <b>{money(groupSum(selectedRow, "Material"))}</b>
            </div>

            <div style={urkBox}>
              <span style={urkLabel}>Fremd</span>
              <b>{money(groupSum(selectedRow, "Fremdleistung"))}</b>
            </div>

            <div style={urkBox}>
              <span style={urkLabel}>Sonstiges</span>
              <b>
                {money(
                  groupSum(selectedRow, "Entsorgung") +
                    groupSum(selectedRow, "Gemeinkosten") +
                    groupSum(selectedRow, "Risiko") +
                    groupSum(selectedRow, "Gewinn")
                )}
              </b>
            </div>

            <div style={urkBoxStrong}>
              <span style={urkLabel}>EP</span>
              <b>{money(getUnitPrice(selectedRow))}</b>
            </div>
          </div>

          <details open style={lvDropdownBox}>
  <summary style={lvDropdownSummary}>
    <span>
      LV / Positionsliste · {filteredRows.length} Position(en) · Anzeige max. {lvPageSize}
    </span>
    <span style={lvDropdownHint}>öffnen / schließen</span>
  </summary>

  <div style={lvTableScroll}>
    <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Nr</th>
                  <th style={th}>Art</th>
                  <th style={th}>Bezeichnung</th>
                  <th style={th}>Einheit</th>
                  <th style={th}>Menge</th>
                  <th style={th}>Preis</th>
                  <th style={th}>Leistung Netto</th>
                  <th style={th}>Faktor</th>
                  <th style={th}>EP Gesamt</th>
                  <th style={th}>GP Gesamt</th>
                  <th style={th}>Kostenart</th>
                  <th style={th}></th>
                </tr>
              </thead>

              <tbody>
                {(selectedRow.priceBreakdown || []).map((line, idx) => {
                  const gp = round2(n(line.total) * n(selectedRow.menge));

                  return (
                    <tr key={line.id}>
                      <td style={td}>{String(idx + 10).padStart(2, "0")}</td>

                      <td style={td}>
                        <select
                          style={{ ...cellInput, width: 145 }}
                          value={line.group}
                          onChange={(e) =>
                            updateBreakdownLine(line.id, {
                              group: e.target.value as PriceBreakdownGroup,
                            })
                          }
                        >
                          <option value="Personal">Personal / Lohn</option>
                          <option value="Maschinen">Maschinen / Gerät</option>
                          <option value="LKW / Transport">LKW / Transport</option>
                          <option value="Material">Material / Stoffe</option>
                          <option value="Entsorgung">Entsorgung</option>
                          <option value="Fremdleistung">Fremdleistung</option>
                          <option value="Gemeinkosten">Gemeinkosten</option>
                          <option value="Risiko">Risiko</option>
                          <option value="Gewinn">Gewinn</option>
                        </select>
                      </td>

                      <td style={td}>
                        <input
                          style={{ ...cellInput, width: "100%" }}
                          value={line.name}
                          onChange={(e) =>
                            updateBreakdownLine(line.id, { name: e.target.value })
                          }
                        />
                      </td>

                      <td style={td}>
                        <input
                          style={{ ...cellInput, width: 68 }}
                          value={line.unit}
                          onChange={(e) =>
                            updateBreakdownLine(line.id, { unit: e.target.value })
                          }
                        />
                      </td>

                      <td style={tdRight}>
                        <input
                          type="number"
                          style={{ ...cellInput, width: 78, textAlign: "right" }}
                          value={line.qty}
                          onChange={(e) =>
                            updateBreakdownLine(line.id, { qty: n(e.target.value) })
                          }
                        />
                      </td>

                      <td style={tdRight}>
                        <input
                          type="number"
                          style={{ ...cellInput, width: 86, textAlign: "right" }}
                          value={line.price}
                          onChange={(e) =>
                            updateBreakdownLine(line.id, { price: n(e.target.value) })
                          }
                        />
                      </td>

                      <td style={tdRight}>{money(line.total)}</td>
                      <td style={tdRight}>1,000</td>
                      <td style={tdRight}>{money(line.total)}</td>
                      <td style={tdRight}>{money(gp)}</td>
                      <td style={td}>{line.group}</td>

                      <td style={td}>
                        <button
                          type="button"
                          style={btnDangerMini}
                          onClick={() => deleteBreakdownLine(line.id)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!selectedRow.priceBreakdown?.length ? (
                  <tr>
                    <td colSpan={12} style={{ ...td, color: "#64748B" }}>
                      Noch keine Ansätze vorhanden. Klicke auf „+ Ansatz” oder
                      „KI neu aufbauen”.
                    </td>
                  </tr>
                ) : null}

                <tr>
                  <td colSpan={8} style={{ ...tdRight, fontWeight: 900 }}>
                    Summe EP
                  </td>
                  <td style={{ ...tdRight, fontWeight: 900 }}>
                    {money(sumBreakdown(selectedRow.priceBreakdown))}
                  </td>
                  <td style={{ ...tdRight, fontWeight: 900 }}>
                    {money(lineNet(selectedRow))}
                  </td>
                  <td colSpan={2} style={td}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
        </>
      ) : (
        <div style={muted}>Keine Position gewählt.</div>
      )}
    </div>

    {/* ================= RECHTS: INFO / KI ================= */}
    <aside style={sideCard}>
      <h2 style={sectionTitle}>Info / KI-Prüfung</h2>

      {selectedRow ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={label}>Position</div>
            <div style={sideTitle}>
              {selectedRow.posNr || "—"} · {selectedRow.kurztext || "Ohne Text"}
            </div>
          </div>

          <div style={sideBadges}>
            <span style={riskStyle(selectedRow.riskLevel)}>
              Risiko: {riskLabel(selectedRow.riskLevel)}
            </span>
            <span style={statusStyle(selectedRow.calculationStatus)}>
              {statusLabel(selectedRow.calculationStatus)}
            </span>
          </div>

          <div style={compactInfoGrid}>
            <Detail label="Problem" value={rowProblem(selectedRow)} />
            <Detail
              label="Sicherheit"
              value={selectedRow.confidence != null ? percent(selectedRow.confidence) : "—"}
            />
            <Detail label="Finaler EP" value={money(getUnitPrice(selectedRow))} />
            <Detail label="Zeilensumme" value={money(lineNet(selectedRow))} />
            <Detail label="EP Angebot X84" value={money(getOfferUnitPrice(selectedRow))} />
            <Detail label="EP RLC-KI" value={money(getRlcKiUnitPrice(selectedRow))} />
            <Detail label="Differenz EP" value={`${money(getPriceDifference(selectedRow))} · ${getPriceDifferencePct(selectedRow)}%`} />
            <Detail label="Differenz GP" value={money(lineNet(selectedRow) - offerLineNet(selectedRow))} />
          </div>

          <div style={separator} />

          <Detail label="Gewerk" value={selectedRow.gewerk || "—"} />
<Detail label="Leistungsart" value={selectedRow.leistungsart || "—"} />
<Detail label="Bauverfahren" value={selectedRow.bauverfahren || "—"} />

<div style={separator} />

<details open>
  <summary style={detailsSummary}>Artikel / Ressourcen übernehmen</summary>

  <div style={resourceToolbar}>
    <input
      style={input}
      value={catalogQuery}
      onChange={(e) => setCatalogQuery(e.target.value)}
      placeholder="Artikel suchen…"
    />

    <select
      style={input}
      value={catalogGroup}
      onChange={(e) => setCatalogGroup(e.target.value as any)}
    >
      <option value="Alle">Alle</option>
      <option value="Material">Material</option>
      <option value="Arbeiter">Arbeiter</option>
      <option value="Maschinen">Maschinen</option>
      <option value="Sonstiges">Sonstiges</option>
    </select>

    <button
      type="button"
      style={btnSecondary}
      onClick={() => setCatalogRows(Catalog.list())}
    >
      Aktualisieren
    </button>
  </div>

  <div style={resourceList}>
    {visibleCatalogRows.map((item) => (
      <button
        key={item.id}
        type="button"
        style={resourceItem}
        onClick={() => addCatalogRowToSelected(item)}
      >
        <div style={resourceTitle}>
          {item.posNr || "—"} · {item.kurztext || "Ohne Text"}
        </div>

        <div style={resourceMeta}>
          {item.gruppe || "Sonstiges"} · {item.einheit || "EH"} ·{" "}
          {money(item.ep)}
        </div>
      </button>
    ))}

    {!visibleCatalogRows.length ? (
      <div style={muted}>Keine Artikel gefunden.</div>
    ) : null}
  </div>
</details>

<div style={separator} />

          <div>
            <div style={label}>Warnung</div>
            <div style={warningBox}>
              {selectedRow.warning || "Keine kritische Warnung erkannt."}
            </div>
          </div>

          <div>
            <div style={label}>KI-Begründung</div>
            <div style={reasonBox}>
              {selectedRow.aiReason ||
                "Noch keine KI-Begründung vorhanden. Starte die Elite-Kalkulation."}
            </div>
          </div>

          <details open={datenbankMatches.length > 0}>
            <summary style={detailsSummary}>
              Kalkulationsdatenbank ({datenbankMatches.length})
            </summary>

            {datenbankMatches.length ? (
              <div style={knowledgeList}>
                {datenbankMatches.map((match) => (
                  <div key={match.eintrag.id} style={knowledgeItem}>
                    <div style={knowledgeTitle}>{match.eintrag.kurztext}</div>
                    <div style={tiny}>
                      {match.eintrag.posNr || "—"} · EP{" "}
                      {money(match.eintrag.kosten.epNetto)} · Score {match.score}% · genutzt{" "}
                      {match.eintrag.verwendungen}x
                    </div>
                    <div style={tiny}>{match.gruende.join(" · ")}</div>
                    <button
                      type="button"
                      style={btnMini}
                      onClick={() => applyKnowledge(match)}
                    >
                      Werte übernehmen
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={muted}>Keine ähnliche Position in der Kalkulationsdatenbank.</div>
            )}

            <button
              type="button"
              style={{ ...btnSecondary, marginTop: 8 }}
              onClick={saveSelectedToKnowledge}
            >
              Diese Position lernen
            </button>
          </details>

          <details open={!selectedRow.langtext?.trim()}>
            <summary style={detailsSummary}>Langtext / KI-Text</summary>

            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              <Field label="Langtext">
                <textarea
                  style={{ ...input, minHeight: 130 }}
                  value={selectedRow.langtext}
                  onChange={(e) =>
                    updateRow(selectedRow.id, { langtext: e.target.value })
                  }
                />
              </Field>

              <button
                type="button"
                style={btnSecondary}
                onClick={() =>
                  updateRow(selectedRow.id, {
                    ...enhanceKalkulatorInsertions(selectedRow),
                  })
                }
              >
                Langtext automatisch erstellen
              </button>
            </div>
          </details>

          <details>
            <summary style={detailsSummary}>Manuelle Anpassung</summary>

            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              <Field label="Rabatt Zeile %">
                <input
                  type="number"
                  style={input}
                  value={selectedRow.rabatt ?? 0}
                  onChange={(e) =>
                    updateRow(selectedRow.id, { rabatt: n(e.target.value) })
                  }
                />
              </Field>
            </div>
          </details>
        </div>
      ) : (
        <div style={muted}>Keine Position gewählt.</div>
      )}
    </aside>
  </div>
</section>
</div>
);
}

/* ================= UI ================= */

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      style={active ? btnFilterActive : btnFilter}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div style={kpiCard}>
      <div style={kpiLabel}>{label}</div>
      <div style={kpiValue}>{value}</div>
      {sub ? <div style={kpiSub}>{sub}</div> : null}
    </div>
  );
}

function Field({
  label: fieldLabel,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={label}>{fieldLabel}</span>
      {children}
    </label>
  );
}

function Detail({ label: l, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={label}>{l}</div>
      <div style={detailValue}>{value}</div>
    </div>
  );
}

function QuickAction({
  title,
  text,
  onClick,
  disabled,
}: {
  title: string;
  text: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      style={{
        ...quickActionButton,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onClick={onClick}
      disabled={disabled}
    >
      <div style={quickActionTitle}>{title}</div>
      <div style={quickActionText}>{text}</div>
    </button>
  );
}



/* ================= EXPORT ================= */

function downloadCsv(rows: EliteRow[]) {
  const header = [
    "PosNr",
    "Kurztext",
    "Langtext",
    "Einheit",
    "Menge",
    "Material",
    "Lohn",
    "Maschine",
    "Fremdleistung",
    "Entsorgung",
    "Gemeinkosten",
    "Risiko",
    "Gewinn",
    "EP final",
    "Gesamt",
    "Preisaufbau",
    "RiskLevel",
    "Status",
    "Confidence",
    "Warnung",
    "KI-Begründung",
  ];

  const lines = rows.map((r) =>
    [
      r.posNr,
      r.kurztext,
      r.langtext,
      r.einheit,
      r.menge,
      r.materialCost,
      r.laborCost,
      r.machineCost,
      r.subcontractorCost,
      r.disposalCost,
      r.overheadCost,
      r.riskCost,
      r.profitCost,
      getUnitPrice(r),
      lineNet(r),
      breakdownText(r),
      r.riskLevel,
      r.calculationStatus,
      r.confidence,
      r.warning,
      r.aiReason,
    ]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(";")
  );

  const blob = new Blob([[header.join(";"), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  downloadBlob(blob, "ki-kalkulation-elite.csv");
}

function exportXlsx(
  rows: EliteRow[],
  chapterTotals: Record<string, any>,
  summary: any,
  offer: OfferData
) {
  const wsRows = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      Kapitel: getChapter(r.posNr),
      PosNr: r.posNr,
      Kurztext: r.kurztext,
      Langtext: r.langtext,
      Einheit: r.einheit,
      Menge: r.menge,
      Material: r.materialCost,
      Lohn: r.laborCost,
      Maschine: r.machineCost,
      Fremdleistung: r.subcontractorCost,
      Entsorgung: r.disposalCost,
      Gemeinkosten: r.overheadCost,
      Risiko: r.riskCost,
      Gewinn: r.profitCost,
      EP_KI: getRlcKiUnitPrice(r),
      EP_Final: getUnitPrice(r),
      Gesamt: lineNet(r),
      Preisaufbau: breakdownText(r),
      RiskLevel: r.riskLevel,
      Status: r.calculationStatus,
      Confidence: r.confidence,
      Warnung: r.warning,
      KI_Begruendung: r.aiReason,
    }))
  );

  const wsBreakdown = XLSX.utils.json_to_sheet(
    rows.flatMap((r) =>
      (r.priceBreakdown || []).map((line) => ({
        PosNr: r.posNr,
        Kurztext: r.kurztext,
        Gruppe: line.group,
        Bezeichnung: line.name,
        Einheit: line.unit,
        Menge: line.qty,
        Preis: line.price,
        Gesamt: line.total,
        Hinweis: line.note || "",
      }))
    )
  );

  const wsChapters = XLSX.utils.json_to_sheet(
    Object.entries(chapterTotals).map(([chapter, t]: any) => ({
      Kapitel: chapter,
      Netto: t.afterChapterMarkup,
      Risiko: t.risk,
      Gewinn: t.profit,
    }))
  );

  const wsSummary = XLSX.utils.json_to_sheet([
    { Kennzahl: "Angebot", Wert: offer.number },
    { Kennzahl: "Netto", Wert: summary.net },
    { Kennzahl: "Brutto", Wert: summary.gross },
    { Kennzahl: "Direkte Kosten", Wert: summary.directCost },
    { Kennzahl: "Risikopuffer", Wert: summary.riskSum },
    { Kennzahl: "Gewinn", Wert: summary.profitSum },
    { Kennzahl: "Marge %", Wert: summary.marginPct },
    { Kennzahl: "Ø Confidence", Wert: summary.avgConfidence },
    { Kennzahl: "Hochrisiko", Wert: summary.highRisk },
    { Kennzahl: "Kritisch", Wert: summary.critical },
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsRows, "Elite-Kalkulation");
  XLSX.utils.book_append_sheet(wb, wsBreakdown, "Preisaufbau");
  XLSX.utils.book_append_sheet(wb, wsChapters, "Kapitel");
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  XLSX.writeFile(wb, `Elite_Kalkulation_${safeFileName(offer.number)}.xlsx`);
}

async function exportPdf(opts: {
  projectKey: string;
  projectTitle: string;
  rows: EliteRow[];
  chapterTotals: Record<string, any>;
  summary: any;
  offer: OfferData;
  client: ClientData;
  company: CompanyData;
  mwst: number;
  globalMarkup: number;
}) {
  const {
    projectKey,
    rows,
    summary,
    offer,
    client,
    company,
    mwst,
    globalMarkup,
  } = opts;

  const payload = {
    title: "Angebot",
    project: {
      id: projectKey,
      code: projectKey,
      number: projectKey,
      name: "KI-Kalkulation",
      client: client.name,
      auftraggeber: client.name,
      address: client.address,
      adresse: client.address,
      location: offer.place,
      place: offer.place,
    },
    recipient: {
      name: client.name,
      client: client.name,
      auftraggeber: client.name,
      address: client.address,
      adresse: client.address,
      city: "",
      ort: "",
    },
    company: {
      name: company.name,
      address: company.address,
      phone: company.phone,
      email: company.email,
      logoUrl: company.logoUrl,
    },
    options: {
      offerNumber: offer.number,
      number: offer.number,
      city: offer.place,
      place: offer.place,
      dateISO: new Date().toISOString().slice(0, 10),
      payment: offer.notes,
      mwst,
      showWatermark: false,
      colorHeader: true,
      showTableHeader: true,
      showChapterRows: true,
      showPriceBreakdown: true,
    },
    rows: rows.map((r) => ({
      id: r.id,
      posNr: r.posNr,
      lvPos: r.posNr,
      text: r.kurztext,
      kurztext: r.kurztext,
      title: r.kurztext,
      langtext: r.langtext,
      priceBreakdown: r.priceBreakdown || [],
      bemerkung: [
        r.bemerkung,
        breakdownText(r) ? `Preisaufbau:\n${breakdownText(r)}` : "",
        r.aiReason ? `KI-Begründung: ${r.aiReason}` : "",
        r.warning ? `Warnung: ${r.warning}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      einheit: r.einheit,
      unit: r.einheit,
      menge: n(r.menge),
      qty: n(r.menge),
      preis: getUnitPrice(r),
      ep: getUnitPrice(r),
      rabatt: n(r.rabatt),
      zeilen: lineNet(r),
      total: lineNet(r),
      riskLevel: r.riskLevel,
      calculationStatus: r.calculationStatus,
      confidence: r.confidence,
      source: "ki",
    })),
    totals: {
      netto: summary.net,
      subtotal: summary.net - summary.globalMarkupValue,
      aufschlag: globalMarkup,
      aufschlagWert: summary.globalMarkupValue,
      mwst,
      steuer: summary.tax,
      brutto: summary.gross,
      directCost: summary.directCost,
      riskSum: summary.riskSum,
      profitSum: summary.profitSum,
    },
  };

  try {
    const res = await fetch(apiUrl("/api/pdf/kalkulation-ki"), {
      method: "POST",
      credentials: "include",
      headers: authJsonHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`Server PDF Fehler (${res.status})`);

    const blob = await res.blob();
    downloadBlob(blob, `KI_Angebot_${safeFileName(offer.number)}.pdf`);
  } catch {
exportPdfLocal(opts);
  }
}

function exportPdfLocal(opts: {
  projectKey: string;
  projectTitle: string;
  rows: EliteRow[];
  chapterTotals: Record<string, any>;
  summary: any;
  offer: OfferData;
  client: ClientData;
  company: CompanyData;
  mwst: number;
  globalMarkup: number;
}) {
  const { projectKey, rows, summary, offer, client, company, globalMarkup } =
    opts;

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 14;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 16, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(company.name || "RLC Bausoftware", marginX, 28);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `${company.address} · ${company.phone} · ${company.email}`,
    marginX,
    34
  );

  doc.setDrawColor(203, 213, 225);
  doc.line(marginX, 40, pageW - marginX, 40);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42);
  doc.text("KI-Kalkulation / Angebot", marginX, 54);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Projekt: ${projectKey || "—"}`, marginX, 63);
  doc.text(`Angebot: ${offer.number}`, marginX, 69);
  doc.text(`Kunde: ${client.name || "—"}`, marginX + 75, 63);
  doc.text(`Ort: ${offer.place || "—"}`, marginX + 75, 69);
  doc.text(`Datum: ${new Date().toLocaleDateString("de-DE")}`, pageW - marginX, 63, {
    align: "right",
  });

  const kpiY = 82;
  const boxW = 43;
  const boxH = 19;
  const gap = 5;

  const kpis = [
    ["Netto", money(summary.net)],
    ["MwSt", money(summary.tax)],
    ["Brutto", money(summary.gross)],
    ["Direkte Kosten", money(summary.directCost)],
    ["Risiko", money(summary.riskSum)],
    ["Gewinn", money(summary.profitSum)],
  ];

  kpis.forEach(([labelText, value], i) => {
    const x = marginX + i * (boxW + gap);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, kpiY, boxW, boxH, 2.5, 2.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(labelText, x + 3, kpiY + 6);

    doc.setFontSize(9.2);
    doc.setTextColor(15, 23, 42);
    doc.text(String(value), x + 3, kpiY + 14, { maxWidth: boxW - 6 });
  });

  autoTable(doc, {
    startY: 112,
    margin: { left: marginX, right: marginX },
    theme: "grid",
    head: [
      [
        "Pos.",
        "Leistungsbeschreibung / Preisaufbau",
        "ME",
        "Menge",
        "EP",
        "Gesamt",
        "Risiko",
        "Status",
      ],
    ],
    body: rows.map((r) => [
      r.posNr || "—",
      [
        r.kurztext || "—",
        r.langtext ? `\n${r.langtext}` : "",
        breakdownText(r) ? `\n\nPreisaufbau:\n${breakdownText(r)}` : "",
        r.aiReason ? `\n\nKI: ${r.aiReason}` : "",
      ].join(""),
      r.einheit || "—",
      qty(r.menge),
      money(getUnitPrice(r)),
      money(lineNet(r)),
      riskLabel(r.riskLevel),
      statusLabel(r.calculationStatus),
    ]),
    styles: {
      font: "helvetica",
      fontSize: 6.8,
      cellPadding: 1.7,
      overflow: "linebreak",
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 125 },
      2: { cellWidth: 16 },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 26, halign: "right" },
      5: { cellWidth: 28, halign: "right" },
      6: { cellWidth: 22 },
      7: { cellWidth: 24 },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 150;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Globaler Aufschlag: ${globalMarkup}%`, marginX, finalY + 10);
  doc.text(offer.notes || "", marginX, finalY + 16, {
    maxWidth: pageW - marginX * 2,
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, pageH - 14, pageW - marginX, pageH - 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("RLC Bausoftware · KI-Kalkulation", marginX, pageH - 8);
    doc.text(`Seite ${i}/${pages}`, pageW - marginX, pageH - 8, {
      align: "right",
    });
  }

  doc.save(`KI_Angebot_${safeFileName(offer.number)}.pdf`);
}

function exportUrkalkulationPdfLocal(opts: {
  projectKey: string;
  projectTitle: string;
  rows: EliteRow[];
  summary: any;
  offer: OfferData;
  client: ClientData;
  company: CompanyData;
  globalMarkup: number;
  selectedAuftrag?: Auftrag | null;
}) {
    const {
    projectKey,
    projectTitle,
    rows,
    summary,
    offer,
    client,
    company,
    globalMarkup,
    selectedAuftrag,
  } = opts;

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const mx = 4;
  const now = new Date().toLocaleDateString("de-DE");

  function effectiveBreakdown(r: EliteRow): PriceBreakdownLine[] {
    return r.priceBreakdown?.length
      ? r.priceBreakdown
      : buildAutomaticPriceBreakdown(r);
  }

  function sumGroup(r: EliteRow, groups: PriceBreakdownGroup[]): number {
    return round2(
      effectiveBreakdown(r)
        .filter((x) => groups.includes(x.group))
        .reduce((s, x) => s + n(x.total), 0)
    );
  }

  function isRealUrkalkulationPosition(r: EliteRow): boolean {
    if (kiIsStructuralRow(r)) return false;
    const pos = String(r.posNr || "").trim();
    const text = String(r.kurztext || "").trim().toLowerCase();
    const menge = n(r.menge);
    const ep = getUnitPrice(r);

    if (!pos) return false;
    if (pos === "—") return false;
    if (/^\d{1,2}$/.test(pos)) return false;

    if (text === "leistung prüfen") return false;
    if (text.startsWith("leistung zu position") && menge <= 0) return false;

    if (menge <= 0) return false;
    if (ep <= 0) return false;

    return true;
  }

  function rowScore(r: EliteRow): number {
    let score = 0;
    if (String(r.kurztext || "").trim()) score += 10;
    if (String(r.langtext || "").trim()) score += 10;
    if (r.priceBreakdown?.length) score += 20;
    if (n(r.menge) > 0) score += 20;
    if (getUnitPrice(r) > 0) score += 20;
    if (r.calculationStatus === "ok") score += 5;
    return score;
  }

  function uniqueRows(input: EliteRow[]): EliteRow[] {
    const map = new Map<string, EliteRow>();

    for (const r of input) {
      if (!isRealUrkalkulationPosition(r)) continue;

      const key = String(r.posNr || r.id || "").trim();
      const existing = map.get(key);

      if (!existing || rowScore(r) > rowScore(existing)) {
        map.set(key, r);
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      String(a.posNr || "").localeCompare(String(b.posNr || ""), "de", {
        numeric: true,
      })
    );
  }

  const pdfRows = uniqueRows(rows);

  if (!pdfRows.length) {
    alert(
      "Keine gültigen Urkalkulationspositionen gefunden. Bitte prüfen: Pos-Nr, Menge und EP müssen vorhanden sein."
    );
    return;
  }

  const pdfBaseNet = round2(pdfRows.reduce((sum, r) => sum + lineNet(r), 0));
  const pdfMarkupValue = round2(pdfBaseNet * (globalMarkup / 100));
  const pdfNet = round2(pdfBaseNet + pdfMarkupValue);

  const taxRate =
    n(summary.net) > 0 && n(summary.tax) > 0
      ? round2((n(summary.tax) / n(summary.net)) * 100)
      : 19;

  const pdfTax = round2(pdfNet * (taxRate / 100));
  const pdfGross = round2(pdfNet + pdfTax);

  const pdfSummary = {
    ...summary,
    net: pdfNet,
    tax: pdfTax,
    gross: pdfGross,
    globalMarkupValue: pdfMarkupValue,
    directCost: round2(
      pdfRows.reduce(
        (sum, r) =>
          sum +
          n(r.menge) *
            (sumGroup(r, ["Personal"]) +
              sumGroup(r, ["Maschinen", "LKW / Transport"]) +
              sumGroup(r, ["Material"]) +
              sumGroup(r, ["Fremdleistung"]) +
              sumGroup(r, ["Entsorgung"])),
        0
      )
    ),
    riskSum: round2(
      pdfRows.reduce((sum, r) => sum + sumGroup(r, ["Risiko"]) * n(r.menge), 0)
    ),
    profitSum: round2(
      pdfRows.reduce((sum, r) => sum + sumGroup(r, ["Gewinn"]) * n(r.menge), 0)
    ),
  };

  function totalByGroup(groups: PriceBreakdownGroup[]): number {
    return round2(
      pdfRows.reduce((s, r) => s + sumGroup(r, groups) * n(r.menge), 0)
    );
  }

  function lohnStunden(r: EliteRow): number {
    const lohn = sumGroup(r, ["Personal"]);
    return lohn > 0 ? round2(lohn / 55) : 0;
  }

  function drawHeader() {
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.12);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(
  `Urkalkulation${selectedAuftrag?.name ? " · " + selectedAuftrag.name : ""}`,
  mx,
  8
);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.8);
    doc.text(company.name || "RLC Bausoftware", mx, 13);
    doc.text(
      `${company.address || ""} · ${company.phone || ""} · ${company.email || ""}`,
      mx,
      17
    );

    const y0 = 22;
    const h = 35;

    doc.rect(mx, y0, pageW - mx * 2, h);

    doc.line(mx, y0 + 12, pageW - mx, y0 + 12);
    doc.line(mx, y0 + 24, pageW - mx, y0 + 24);

    doc.line(mx + 103, y0, mx + 103, y0 + 12);
    doc.line(mx + 200, y0, mx + 200, y0 + 12);

    doc.line(mx + 48, y0 + 12, mx + 48, y0 + 35);
    doc.line(mx + 104, y0 + 12, mx + 104, y0 + 35);
    doc.line(mx + 153, y0 + 12, mx + 153, y0 + 35);
    doc.line(mx + 207, y0 + 12, mx + 207, y0 + 35);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.7);

    doc.text("Bauvorhaben:", mx + 2, y0 + 6);
    doc.text("Auftraggeber:", mx + 106, y0 + 6);
    doc.text("Ausschreibende Stelle:", mx + 203, y0 + 6);

    doc.text("Projekt-Nr.:", mx + 2, y0 + 19);
    doc.text("Angebot-Nr.:", mx + 51, y0 + 19);
    doc.text("Datum:", mx + 107, y0 + 19);
    doc.text("Kalkulationsart:", mx + 156, y0 + 19);
    doc.text("Währung:", mx + 210, y0 + 19);

    doc.text("Mengenbasis:", mx + 2, y0 + 31);
    doc.text("Preisstand:", mx + 51, y0 + 31);
    doc.text("Globaler Zuschlag:", mx + 107, y0 + 31);

    doc.setFont("helvetica", "normal");

    doc.text(projectTitle || projectKey || "—", mx + 30, y0 + 6, {
      maxWidth: 68,
    });

    doc.text(client.name || "—", mx + 135, y0 + 6, { maxWidth: 55 });
    doc.text(client.address || "—", mx + 135, y0 + 11, { maxWidth: 55 });

    doc.text(client.name || "—", mx + 238, y0 + 6, { maxWidth: 45 });
    doc.text(client.address || "—", mx + 238, y0 + 11, { maxWidth: 45 });

    doc.text(projectKey || "—", mx + 25, y0 + 19);
    doc.text(offer.number || "—", mx + 78, y0 + 19);
    doc.text(now, mx + 124, y0 + 19);
    doc.text("KI / Urkalkulation", mx + 186, y0 + 19);
    doc.text("EUR", mx + 232, y0 + 19);

    doc.text("LV / KI-Kalkulation", mx + 30, y0 + 31);
    doc.text(now, mx + 78, y0 + 31);
    doc.text(`${globalMarkup}%`, mx + 143, y0 + 31);
  }

  drawHeader();

  const personalTotal = totalByGroup(["Personal"]);
  const machineTotal = totalByGroup(["Maschinen", "LKW / Transport"]);
  const materialTotal = totalByGroup(["Material"]);
  const subcontractorTotal = totalByGroup(["Fremdleistung"]);
  const sonstigeTotal = totalByGroup([
    "Entsorgung",
    "Gemeinkosten",
    "Risiko",
    "Gewinn",
  ]);

  autoTable(doc, {
    startY: 62,
    margin: { left: mx, right: mx },
    theme: "grid",
    tableWidth: pageW - mx * 2,
    head: [
      [
        "Zusammenstellung",
        "Lohn",
        "Geräte",
        "Stoffe",
        "Fremdleistung",
        "Sonstiges",
        "Netto",
      ],
    ],
    body: [
      [
        "Einzelkosten der Teilleistungen",
        money(personalTotal),
        money(machineTotal),
        money(materialTotal),
        money(subcontractorTotal),
        money(sonstigeTotal),
        money(pdfBaseNet),
      ],
      [
        `Zuschlag / Aufschlag ${globalMarkup}%`,
        "",
        "",
        "",
        "",
        "",
        money(pdfSummary.globalMarkupValue || 0),
      ],
      ["Gesamtsumme netto", "", "", "", "", "", money(pdfSummary.net)],
      ["MwSt", "", "", "", "", "", money(pdfSummary.tax || 0)],
      ["Gesamtsumme brutto", "", "", "", "", "", money(pdfSummary.gross || 0)],
    ],
    styles: {
      font: "helvetica",
      fontSize: 5.5,
      cellPadding: 0.9,
      lineWidth: 0.06,
      lineColor: [90, 90, 90],
      textColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: [215, 215, 215],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [70, 70, 70],
      lineWidth: 0.08,
    },
    columnStyles: {
      0: { cellWidth: 75 },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right", fontStyle: "bold" },
    },
  });

  const y = (doc as any).lastAutoTable?.finalY || 85;

  autoTable(doc, {
  startY: y + 5,
  margin: { left: mx, right: mx, top: 61 },
  theme: "grid",
  tableWidth: pageW - mx * 2,
  showHead: "everyPage",
  head: [
    [
      "OZ",
      "Leistungsbeschreibung",
      "ML",
      "ZG",
      "Faktor",
      "Divisor",
      "ME",
      "Lohnstd.",
      "Lohn-Betr.",
      "Gerät",
      "Stoffe",
      "Fremd",
      "Sonst.",
      "EKT",
      "EP",
      "GP",
    ],
  ],
  body: pdfRows.flatMap((r) => {
    const menge = n(r.menge);
    const ep = getUnitPrice(r);

    const lohn = sumGroup(r, ["Personal"]);
    const geraet = sumGroup(r, ["Maschinen", "LKW / Transport"]);
    const stoffe = sumGroup(r, ["Material"]);
    const fremd = sumGroup(r, ["Fremdleistung"]);
    const sonst = sumGroup(r, ["Entsorgung", "Gemeinkosten", "Risiko", "Gewinn"]);
    const ekt = lohn + geraet + stoffe + fremd + sonst;

    const main = [
      r.posNr || "—",
      `${r.kurztext || "—"}${r.langtext ? "\n" + r.langtext : ""}`,
      qty(menge),
      "",
      "1,000",
      "1,000",
      r.einheit || "EH",
      qty(lohnStunden(r)),
      money(lohn),
      money(geraet),
      money(stoffe),
      money(fremd),
      money(sonst),
      money(ekt),
      money(ep),
      money(lineNet(r)),
    ];

    const detailRows = effectiveBreakdown(r).map((b) => {
      const isLohn = b.group === "Personal";
      const isGeraet = b.group === "Maschinen" || b.group === "LKW / Transport";
      const isStoffe = b.group === "Material";
      const isFremd = b.group === "Fremdleistung";
      const isSonst = ["Entsorgung", "Gemeinkosten", "Risiko", "Gewinn"].includes(
        b.group
      );

      const bLohnStd = isLohn ? round2(n(b.total) / 55) : 0;

      return [
        "",
        `   ${b.group} - ${b.name}${b.note ? " · " + b.note : ""}`,
        qty(b.qty),
        "",
        "1,000",
        "1,000",
        b.unit || r.einheit || "EH",
        isLohn ? qty(bLohnStd) : "",
        isLohn ? money(b.total) : "",
        isGeraet ? money(b.total) : "",
        isStoffe ? money(b.total) : "",
        isFremd ? money(b.total) : "",
        isSonst ? money(b.total) : "",
        money(b.total),
        "",
        "",
      ];
    });

    return [main, ...detailRows];
  }),
  styles: {
    font: "helvetica",
    fontSize: 4.05,
    cellPadding: 0.38,
    overflow: "linebreak",
    lineWidth: 0.04,
    lineColor: [105, 105, 105],
    textColor: [0, 0, 0],
    minCellHeight: 2.8,
  },
  headStyles: {
    fillColor: [218, 218, 218],
    textColor: [0, 0, 0],
    fontStyle: "bold",
    halign: "center",
    valign: "middle",
    lineWidth: 0.055,
    lineColor: [65, 65, 65],
    minCellHeight: 3.2,
  },
  bodyStyles: {
    valign: "top",
  },
  columnStyles: {
    0: { cellWidth: 12, halign: "center" },
    1: { cellWidth: 72 },
    2: { cellWidth: 10, halign: "right" },
    3: { cellWidth: 7, halign: "center" },
    4: { cellWidth: 10, halign: "right" },
    5: { cellWidth: 10, halign: "right" },
    6: { cellWidth: 8, halign: "center" },
    7: { cellWidth: 11, halign: "right" },
    8: { cellWidth: 13, halign: "right" },
    9: { cellWidth: 13, halign: "right" },
    10: { cellWidth: 13, halign: "right" },
    11: { cellWidth: 12, halign: "right" },
    12: { cellWidth: 12, halign: "right" },
    13: { cellWidth: 13, halign: "right", fontStyle: "bold" },
    14: { cellWidth: 12, halign: "right", fontStyle: "bold" },
    15: { cellWidth: 14, halign: "right", fontStyle: "bold" },
  },
  didParseCell: (data) => {
    if (data.section !== "body") return;

    const raw = data.row.raw as any[];
    const oz = String(raw?.[0] || "").trim();
    const isMainRow = Boolean(oz);

    if (isMainRow) {
      data.cell.styles.fillColor = [246, 246, 246];

      if (data.column.index === 0 || data.column.index >= 13) {
        data.cell.styles.fontStyle = "bold";
      }

      if (data.column.index === 1) {
  data.cell.styles.fontStyle = "normal";
  data.cell.styles.fontSize = 4.2;
}
    } else {
      data.cell.styles.fillColor = [255, 255, 255];

      if (data.column.index === 1) {
  data.cell.styles.fontStyle = "normal";
  data.cell.styles.fontSize = 4.2;
}

      if (data.column.index === 13) {
        data.cell.styles.fontStyle = "bold";
      }
    }
  },
  didDrawPage: () => {
    drawHeader();
  },
});

  let finalY = (doc as any).lastAutoTable?.finalY || 150;

  if (finalY > pageH - 38) {
    doc.addPage();
    drawHeader();
    finalY = 62;
  }

  autoTable(doc, {
    startY: finalY + 5,
    margin: { left: mx, right: mx },
    theme: "grid",
    tableWidth: 125,
    head: [["Kontrollsummen", "Wert"]],
    body: [
      ["Anzahl Positionen", String(pdfRows.length)],
      ["Direkte Kosten", money(pdfSummary.directCost || 0)],
      ["Risikoanteil", money(pdfSummary.riskSum || 0)],
      ["Gewinnanteil", money(pdfSummary.profitSum || 0)],
      ["Netto", money(pdfSummary.net || 0)],
      ["Brutto", money(pdfSummary.gross || 0)],
    ],
    styles: {
      font: "helvetica",
      fontSize: 5.7,
      cellPadding: 0.9,
      lineWidth: 0.06,
      lineColor: [90, 90, 90],
    },
    headStyles: {
      fillColor: [215, 215, 215],
      textColor: [0, 0, 0],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 55, halign: "right", fontStyle: "bold" },
    },
  });

  const pages = doc.getNumberOfPages();

  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(60, 60, 60);
    doc.setDrawColor(120, 120, 120);
    doc.line(mx, pageH - 8, pageW - mx, pageH - 8);
    doc.text("RLC Bausoftware · Urkalkulation", mx, pageH - 4);
    doc.text(`Seite ${i}/${pages}`, pageW - mx, pageH - 4, { align: "right" });
  }

  doc.save(`Urkalkulation_${safeFileName(offer.number || projectKey)}.pdf`);
}
/* ================= STYLES ================= */

const page: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 16,
};

const heroCard: React.CSSProperties = {
  background: "linear-gradient(135deg,#0F172A,#1E3A8A)",
  color: "#FFFFFF",
  borderRadius: 18,
  padding: 22,
  display: "grid",
  gap: 14,
  boxShadow: "0 16px 40px rgba(15,23,42,0.18)",
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.8,
  fontWeight: 800,
};

const title: React.CSSProperties = {
  margin: "4px 0",
  fontSize: 30,
  fontWeight: 900,
};

const subtitle: React.CSSProperties = {
  margin: 0,
  maxWidth: 980,
  opacity: 0.88,
  lineHeight: 1.55,
};

const heroActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const heroMeta: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.9,
};

const quickActionsCard: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #DDE7F5",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
};

const quickActionsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
  gap: 12,
};

const quickActionButton: React.CSSProperties = {
  border: "1px solid #D7E3F5",
  background: "linear-gradient(180deg,#FFFFFF,#F8FAFC)",
  borderRadius: 14,
  padding: 14,
  textAlign: "left",
  minHeight: 96,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const quickActionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  color: "#0F172A",
  marginBottom: 6,
};

const quickActionText: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.45,
  color: "#64748B",
  fontWeight: 700,
};

const grid4: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
  gap: 12,
};

const kpiCard: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const kpiLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const kpiValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 22,
  color: "#0F172A",
  fontWeight: 900,
};

const kpiSub: React.CSSProperties = {
  marginTop: 3,
  fontSize: 12,
  color: "#64748B",
};

const kiAssistantBox: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "54px minmax(0,1fr)",
  gap: 12,
  alignItems: "start",
};

const kiAvatar: React.CSSProperties = {
  width: 54,
  height: 54,
  borderRadius: 18,
  background: "linear-gradient(135deg,#2563EB,#1E3A8A)",
  color: "#FFFFFF",
  display: "grid",
  placeItems: "center",
  fontWeight: 900,
  boxShadow: "0 12px 30px rgba(37,99,235,0.28)",
};

const kiBubble: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  background: "linear-gradient(180deg,#EFF6FF,#FFFFFF)",
  color: "#1E3A8A",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
  display: "grid",
  gap: 10,
};

const kiBubbleTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  color: "#0F172A",
  fontSize: 15,
};

const kiStatus: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  background: "#FFFFFF",
  color: "#1D4ED8",
  borderRadius: 999,
  padding: "4px 9px",
  fontSize: 11,
  fontWeight: 900,
};

const kiText: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.55,
  color: "#1E3A8A",
  fontWeight: 700,
};

const kiQuickFacts: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const kiQuickFact: React.CSSProperties = {
  border: "1px solid #DBEAFE",
  background: "#FFFFFF",
  color: "#334155",
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 12,
  fontWeight: 800,
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const sideCard: React.CSSProperties = {
  ...card,
  alignSelf: "start",
  position: "sticky",
  top: 12,
  maxHeight: "calc(100vh - 24px)",
  overflow: "auto",
};

const sectionHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 12,
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 17,
  color: "#0F172A",
  fontWeight: 900,
};

const sectionText: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#64748B",
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
  gap: 12,
};

const label: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 800,
};

const input: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 11px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};

const smallInput: React.CSSProperties = {
  ...input,
  width: 76,
  padding: "7px 9px",
};

const cellInput: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
  background: "#FFFFFF",
  boxSizing: "border-box",
};

const chapterGrid: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const chapterBox: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: 12,
  minWidth: 250,
  background: "#F8FAFC",
};

const chapterInputs: React.CSSProperties = {
  marginTop: 8,
  display: "grid",
  gridTemplateColumns: "auto 80px auto 80px",
  alignItems: "center",
  gap: 8,
};

const tiny: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: "#64748B",
};

const muted: React.CSSProperties = {
  color: "#64748B",
  fontSize: 13,
};


const exportRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const filterRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: 12,
};

const btnFilter: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#334155",
  borderRadius: 999,
  padding: "7px 11px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const btnFilterActive: React.CSSProperties = {
  ...btnFilter,
  border: "1px solid #2563EB",
  background: "#EFF6FF",
  color: "#1D4ED8",
};

const filterMeta: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 800,
  marginLeft: "auto",
};

const tableWrap: React.CSSProperties = {
  overflowX: "auto",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
};

const table: React.CSSProperties = {
  width: "100%",
  minWidth: 1120,
  borderCollapse: "collapse",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 9px",
  fontSize: 12,
  color: "#475569",
  background: "#F8FAFC",
  borderBottom: "1px solid #E5E7EB",
  whiteSpace: "nowrap",
  fontWeight: 900,
};

const td: React.CSSProperties = {
  padding: "8px 9px",
  fontSize: 12,
  borderBottom: "1px solid #F1F5F9",
  verticalAlign: "middle",
};

const tdRight: React.CSSProperties = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const chapterRow: React.CSSProperties = {
  ...td,
  background: "#EAF2FF",
  color: "#1E3A8A",
  fontWeight: 900,
};

const btnBase: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 13px",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #2563EB",
  background: "#2563EB",
  color: "#FFFFFF",
};

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: "#FFFFFF",
  color: "#0F172A",
};

const btnMini: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  background: "#FFFFFF",
  color: "#0F172A",
  borderRadius: 8,
  padding: "6px 9px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  marginTop: 8,
};

const btnDangerMini: React.CSSProperties = {
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
  borderRadius: 8,
  padding: "6px 9px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const badgeNeutral: React.CSSProperties = {
  display: "inline-flex",
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  color: "#475569",
  borderRadius: 999,
  padding: "4px 9px",
  fontSize: 11,
  fontWeight: 900,
};

const badgeOk: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#15803D",
};

const badgeWarn: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
  color: "#B45309",
};

const badgeInfo: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#1D4ED8",
};

const badgeCritical: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
};

const problemText: React.CSSProperties = {
  fontSize: 12,
  color: "#334155",
  fontWeight: 800,
};

const sideTitle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 15,
  fontWeight: 900,
  color: "#0F172A",
  lineHeight: 1.35,
};

const sideBadges: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const separator: React.CSSProperties = {
  height: 1,
  background: "#E5E7EB",
};

const detailValue: React.CSSProperties = {
  marginTop: 4,
  color: "#0F172A",
  fontWeight: 700,
  fontSize: 13,
};

const compactInfoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  gap: 10,
};

const costGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  gap: 8,
  marginTop: 10,
};

const costBox: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  background: "#F8FAFC",
  borderRadius: 10,
  padding: 9,
};

const costLabel: React.CSSProperties = {
  fontSize: 11,
  color: "#64748B",
  fontWeight: 800,
};

const costValue: React.CSSProperties = {
  marginTop: 3,
  fontSize: 13,
  color: "#0F172A",
  fontWeight: 900,
};

const warningBox: React.CSSProperties = {
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
  color: "#92400E",
  borderRadius: 12,
  padding: 10,
  fontSize: 13,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
};

const reasonBox: React.CSSProperties = {
  border: "1px solid #DBEAFE",
  background: "#EFF6FF",
  color: "#1E3A8A",
  borderRadius: 12,
  padding: 10,
  fontSize: 13,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
};

const detailsSummary: React.CSSProperties = {
  cursor: "pointer",
  fontSize: 13,
  color: "#0F172A",
  fontWeight: 900,
  padding: "8px 0",
};

const knowledgeList: React.CSSProperties = {
  display: "grid",
  gap: 8,
  marginTop: 6,
};

const knowledgeItem: React.CSSProperties = {
  border: "1px solid #DBEAFE",
  background: "#EFF6FF",
  borderRadius: 12,
  padding: 10,
};

const knowledgeTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "#0F172A",
  lineHeight: 1.3,
};

const breakdownHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 8,
  fontSize: 13,
};

const miniTableWrap: React.CSSProperties = {
  overflowX: "auto",
  border: "1px solid #E5E7EB",
  borderRadius: 10,
  marginBottom: 8,
};

const miniTable: React.CSSProperties = {
  width: "100%",
  minWidth: 720,
  borderCollapse: "collapse",
};

const miniTh: React.CSSProperties = {
  textAlign: "left",
  padding: "7px 6px",
  fontSize: 11,
  color: "#475569",
  background: "#F8FAFC",
  borderBottom: "1px solid #E5E7EB",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const miniTd: React.CSSProperties = {
  padding: "6px",
  borderBottom: "1px solid #F1F5F9",
  fontSize: 11,
  verticalAlign: "middle",
};

const miniTdRight: React.CSSProperties = {
  ...miniTd,
  textAlign: "right",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const miniInput: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 7,
  padding: "5px 6px",
  fontSize: 11,
  width: "100%",
  boxSizing: "border-box",
  background: "#FFFFFF",
};

const miniEmpty: React.CSSProperties = {
  padding: 10,
  fontSize: 12,
  color: "#64748B",
};

const auftragTabs: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const auftragTab: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#334155",
  borderRadius: 999,
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
};

const auftragTabActive: React.CSSProperties = {
  ...auftragTab,
  border: "1px solid #2563EB",
  background: "#EFF6FF",
  color: "#1D4ED8",
};

const urkalkulationSummary: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3,minmax(0,1fr))",
  gap: 8,
  marginBottom: 10,
};

const urkBox: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  background: "#F8FAFC",
  borderRadius: 10,
  padding: 9,
  display: "grid",
  gap: 3,
};

const urkBoxStrong: React.CSSProperties = {
  ...urkBox,
  border: "1px solid #2563EB",
  background: "#EFF6FF",
  color: "#1D4ED8",
};

const urkLabel: React.CSSProperties = {
  fontSize: 11,
  color: "#64748B",
  fontWeight: 900,
};

const calcEditorGrid: React.CSSProperties = {
  display: "grid",
  gap: 16,
};

const bottomCalcGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) 420px",
  gap: 16,
  alignItems: "start",
};

const selectedPositionBar: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#1E3A8A",
  borderRadius: 12,
  padding: "10px 12px",
  marginBottom: 10,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  fontSize: 13,
};

const resourceToolbar: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) 130px auto",
  gap: 8,
  marginBottom: 10,
};

const resourceList: React.CSSProperties = {
  display: "grid",
  gap: 6,
  maxHeight: 260,
  overflow: "auto",
  border: "1px solid #E5E7EB",
  borderRadius: 10,
  padding: 6,
  background: "#F8FAFC",
};

const resourceItem: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  borderRadius: 9,
  padding: 9,
  textAlign: "left",
  cursor: "pointer",
};

const resourceTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#0F172A",
};

const resourceMeta: React.CSSProperties = {
  marginTop: 3,
  fontSize: 11,
  color: "#64748B",
  fontWeight: 700,
};

const auftragSummaryBox: React.CSSProperties = {
  marginTop: 12,
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#1E3A8A",
  borderRadius: 12,
  padding: "10px 12px",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  fontSize: 13,
  fontWeight: 800,
};

const pagerBar: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  marginLeft: "auto",
  fontSize: 12,
  color: "#475569",
  fontWeight: 800,
};

const compactHeroCard: React.CSSProperties = {
  ...heroCard,
  padding: 18,
  gap: 12,
};

const compactHeroTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
};

const compactHeroTitleWrap: React.CSSProperties = {
  display: "grid",
  gap: 4,
};

const compactTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 900,
};

const compactSubtitle: React.CSSProperties = {
  margin: 0,
  maxWidth: 820,
  opacity: 0.86,
  lineHeight: 1.45,
  fontSize: 13,
};

const compactHeroActions: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const compactActionBar: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const kiPanel: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  background: "linear-gradient(180deg,#EFF6FF,#FFFFFF)",
  color: "#1E3A8A",
  borderRadius: 16,
  padding: 14,
  boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
  display: "grid",
  gap: 10,
};

const kiPanelClosed: React.CSSProperties = {
  border: "1px solid #D7E3F5",
  background: "#FFFFFF",
  borderRadius: 14,
  padding: "10px 12px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const kiPanelTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const kiPanelTitle: React.CSSProperties = {
  color: "#0F172A",
  fontSize: 15,
  fontWeight: 900,
};

const kiPanelSubtitle: React.CSSProperties = {
  marginTop: 3,
  color: "#1E3A8A",
  fontSize: 13,
  lineHeight: 1.45,
  fontWeight: 700,
};

const kiPanelActions: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const kiFactsCompact: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const kiFactCompact: React.CSSProperties = {
  border: "1px solid #DBEAFE",
  background: "#FFFFFF",
  color: "#334155",
  borderRadius: 999,
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 800,
};

const auftragCardCompact: React.CSSProperties = {
  ...card,
  padding: 14,
};

const auftragHeaderCompact: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 10,
};

const auftragSummaryCompact: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#1E3A8A",
  borderRadius: 12,
  padding: "8px 10px",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  fontSize: 12,
  fontWeight: 800,
  marginBottom: 10,
};

const lvMenuWrap: React.CSSProperties = {
  position: "relative",
};

const lvMenuButton: React.CSSProperties = {
  ...btnSecondary,
  listStyle: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const lvMenuPanel: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 6px)",
  zIndex: 20,
  minWidth: 210,
  border: "1px solid #D7E3F5",
  background: "#FFFFFF",
  borderRadius: 12,
  padding: 6,
  boxShadow: "0 16px 40px rgba(15,23,42,0.16)",
  display: "grid",
  gap: 4,
};

const lvMenuItem: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#0F172A",
  borderRadius: 9,
  padding: "9px 10px",
  textAlign: "left",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

const lvTableWrap: React.CSSProperties = {
  overflowX: "auto",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  background: "#FFFFFF",
};

const lvTable: React.CSSProperties = {
  width: "100%",
  minWidth: 980,
  borderCollapse: "collapse",
};

const lvTh: React.CSSProperties = {
  textAlign: "left",
  padding: "9px 10px",
  fontSize: 11,
  color: "#475569",
  background: "#F8FAFC",
  borderBottom: "1px solid #E5E7EB",
  whiteSpace: "nowrap",
  fontWeight: 900,
};

const lvThRight: React.CSSProperties = {
  ...lvTh,
  textAlign: "right",
};

const lvRow: React.CSSProperties = {
  background: "#FFFFFF",
  cursor: "pointer",
};

const lvRowSelected: React.CSSProperties = {
  background: "#EAF2FF",
};

const lvRowCritical: React.CSSProperties = {
  background: "#FEF2F2",
};

const lvRowWarning: React.CSSProperties = {
  background: "#FFFBEB",
};

const lvRowStructure: React.CSSProperties = {
  background: "#F8FAFC",
  color: "#64748B",
  fontStyle: "italic",
};

const lvTd: React.CSSProperties = {
  padding: "7px 10px",
  fontSize: 12,
  borderBottom: "1px solid #F1F5F9",
  verticalAlign: "middle",
};

const lvTextTd: React.CSSProperties = {
  ...lvTd,
  minWidth: 360,
};

const lvTdRight: React.CSSProperties = {
  ...lvTd,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const lvSelect: React.CSSProperties = {
  ...cellInput,
  width: 155,
  padding: "6px 7px",
};

const lvPosInput: React.CSSProperties = {
  ...cellInput,
  width: 92,
};

const lvKurztextInput: React.CSSProperties = {
  ...cellInput,
  width: "100%",
  minWidth: 330,
  fontWeight: 800,
};

const lvLangPreview: React.CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: "#64748B",
  lineHeight: 1.35,
  maxWidth: 680,
};

const lvMiniWarning: React.CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: "#B45309",
  lineHeight: 1.35,
  fontWeight: 700,
};

const lvPriceCompareInline: React.CSSProperties = {
  marginTop: 6,
  fontSize: 11,
  color: "#1E3A8A",
  fontWeight: 900,
  lineHeight: 1.35,
};
const lvNumberInput: React.CSSProperties = {
  ...cellInput,
  width: 82,
  textAlign: "right",
};

const lvUnitInput: React.CSSProperties = {
  ...cellInput,
  width: 62,
};

const lvPriceInput: React.CSSProperties = {
  ...cellInput,
  width: 92,
  textAlign: "right",
};

const pagerBarCompact: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  marginTop: 12,
  fontSize: 12,
  color: "#475569",
  fontWeight: 800,
};

const heroCardCompact: React.CSSProperties = {
  background: "linear-gradient(135deg,#0F172A,#1E3A8A)",
  color: "#FFFFFF",
  borderRadius: 16,
  padding: 18,
  display: "grid",
  gap: 12,
  boxShadow: "0 10px 28px rgba(15,23,42,0.16)",
};

const heroTopLine: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
};

const titleCompact: React.CSSProperties = {
  margin: "3px 0",
  fontSize: 26,
  fontWeight: 900,
};

const subtitleCompact: React.CSSProperties = {
  margin: 0,
  maxWidth: 900,
  fontSize: 13,
  opacity: 0.9,
  lineHeight: 1.45,
};

const heroMetaCompact: React.CSSProperties = {
  minWidth: 170,
  border: "1px solid rgba(255,255,255,0.22)",
  background: "rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: "10px 12px",
  display: "grid",
  gap: 3,
  fontSize: 12,
};

const heroStatus: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.1)",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const compactToolbar: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const compactActionPanel: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #DDE7F5",
  borderRadius: 14,
  padding: 14,
  boxShadow: "0 4px 14px rgba(15,23,42,0.05)",
};

const compactActionHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10,
};

const compactActionGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))",
  gap: 8,
};

const compactActionButton: React.CSSProperties = {
  border: "1px solid #D7E3F5",
  background: "#FFFFFF",
  borderRadius: 12,
  padding: 11,
  textAlign: "left",
  minHeight: 72,
  cursor: "pointer",
  display: "grid",
  gap: 4,
};

const compactOrderCard: React.CSSProperties = {
  ...card,
  padding: 14,
};

const orderHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 10,
};

const auftragSummaryBoxCompact: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#1E3A8A",
  borderRadius: 10,
  padding: "8px 10px",
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  fontSize: 12,
  fontWeight: 800,
  marginBottom: 8,
};

const auftragTabsCompact: React.CSSProperties = {
  display: "flex",
  gap: 7,
  flexWrap: "wrap",
};

const grid4Compact: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
  gap: 10,
};

const kiAssistantPanel: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  background: "linear-gradient(180deg,#EFF6FF,#FFFFFF)",
  borderRadius: 14,
  padding: 14,
  display: "grid",
  gap: 10,
  boxShadow: "0 6px 18px rgba(37,99,235,0.08)",
};

const kiPanelHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const kiPanelTitleWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const kiAvatarSmall: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 12,
  background: "linear-gradient(135deg,#2563EB,#1E3A8A)",
  color: "#FFFFFF",
  display: "grid",
  placeItems: "center",
  fontWeight: 900,
};


const kiPanelSub: React.CSSProperties = {
  marginTop: 2,
  fontSize: 12,
  color: "#64748B",
  fontWeight: 800,
};

const kiPanelText: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.45,
  color: "#1E3A8A",
  fontWeight: 800,
};

const kiQuickFactsCompact: React.CSSProperties = {
  display: "flex",
  gap: 7,
  flexWrap: "wrap",
};

const kiOpenButton: React.CSSProperties = {
  ...btnSecondary,
  justifySelf: "start",
};













const kiDrawerTitleWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const kiDrawerAvatar: React.CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 16,
  background: "linear-gradient(145deg,#2563EB,#1E40AF)",
  color: "#FFFFFF",
  display: "grid",
  placeItems: "center",
  fontSize: 22,
  fontWeight: 900,
  boxShadow: "0 12px 28px rgba(37,99,235,0.26)",
};




const kiDrawerMessage: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  background: "linear-gradient(180deg,#EFF6FF,#FFFFFF)",
  color: "#1E3A8A",
  borderRadius: 16,
  padding: 13,
  fontSize: 13,
  lineHeight: 1.55,
  fontWeight: 800,
};

const kiDrawerHint: React.CSSProperties = {
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
  color: "#92400E",
  borderRadius: 14,
  padding: 11,
  fontSize: 12,
  lineHeight: 1.45,
};

const kiDrawerStats: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  gap: 8,
};

const lvDropdownBox: React.CSSProperties = {
  border: "1px solid #D7E3F5",
  borderRadius: 14,
  background: "#FFFFFF",
  overflow: "hidden",
};

const lvDropdownSummary: React.CSSProperties = {
  listStyle: "none",
  cursor: "pointer",
  padding: "11px 14px",
  background: "#F8FAFC",
  borderBottom: "1px solid #E5E7EB",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  fontSize: 13,
  fontWeight: 900,
  color: "#0F172A",
};

const lvDropdownHint: React.CSSProperties = {
  fontSize: 11,
  color: "#64748B",
  fontWeight: 800,
};

const lvTableScroll: React.CSSProperties = {
  maxHeight: 520,
  overflowY: "auto",
  overflowX: "auto",
};

const priceCompareCard: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #DDE7F5",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const priceCompareBadge: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#1D4ED8",
  borderRadius: 999,
  padding: "7px 11px",
  fontSize: 12,
  fontWeight: 900,
};

const priceCompareTableWrap: React.CSSProperties = {
  overflowX: "auto",
  overflowY: "auto",
  maxHeight: 285,
  border: "1px solid #E5E7EB",
  borderRadius: 12,
};

const priceCompareTable: React.CSSProperties = {
  width: "100%",
  minWidth: 1120,
  borderCollapse: "collapse",
};

const priceCompareTh: React.CSSProperties = {
  textAlign: "left",
  padding: "9px 10px",
  fontSize: 11,
  color: "#475569",
  background: "#F8FAFC",
  borderBottom: "1px solid #E5E7EB",
  whiteSpace: "nowrap",
  fontWeight: 900,
  position: "sticky",
  top: 0,
  zIndex: 2,
};

const priceCompareThRight: React.CSSProperties = {
  ...priceCompareTh,
  textAlign: "right",
};

const priceCompareTr: React.CSSProperties = {
  cursor: "pointer",
  background: "#FFFFFF",
};

const priceCompareTd: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 12,
  borderBottom: "1px solid #F1F5F9",
  verticalAlign: "middle",
};

const priceCompareTdStrong: React.CSSProperties = {
  ...priceCompareTd,
  fontWeight: 900,
  color: "#0F172A",
};

const priceCompareTdRight: React.CSSProperties = {
  ...priceCompareTd,
  textAlign: "right",
  whiteSpace: "nowrap",
  fontWeight: 800,
};


































































































































































