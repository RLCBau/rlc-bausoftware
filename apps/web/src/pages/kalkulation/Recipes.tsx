// apps/web/src/pages/kalkulation/Recipes.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useProject } from "../../store/useProject";
import { LV, type LVPos } from "./store.lv";
import { KalkulationsDatenbank } from "./kalkulationsDatenbank";
import { RecipeLibrary } from "./recipeLibrary";
import { API_BASE as RAW_API_BASE } from "../../lib/apiBase";
import {
  detectWorkType,
  getWorkTypeProfile,
  isForbiddenForWorkType,
  shouldForceLocalCalculation,
  type WorkTypeKey,
} from "./workTypeLibrary";
import {
  detectTechnicalPosition,
  getTechnicalPositionCount,
} from "./technicalPositionLibrary";

/* ================= TYPES ================= */

type ResourceGroup =
  | "Personal"
  | "Maschinen"
  | "LKW / Transport"
  | "Material"
  | "Entsorgung"
  | "Fremdleistung"
  | "Gemeinkosten"
  | "Risiko"
  | "Gewinn"
  | "Zeit / Leistung"
  | "Zuschläge";

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

type ResourceItem = {
  id: string;
  group: ResourceGroup;
  name: string;
  unit: string;
  defaultPrice: number;
};

type ExternalLibraryItem = {
  id?: string;
  code?: string;
  posNr?: string;
  title?: string;
  name?: string;
  kurztext?: string;
  langtext?: string;
  category?: string;
  group?: string;
  unit?: string;
  einheit?: string;
  qty?: number;
  menge?: number;
  unitPrice?: number;
  price?: number;
  ep?: number;
  defaultPrice?: number;
  source?: string;
};

type RecipeLine = {
  id: string;
  group: ResourceGroup;
  resourceId: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  note: string;
  aiSuggested?: boolean;
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

type CalcDraftRow = {
  id: string;

  auftragId?: string;
  auftragName?: string;
  auftragType?: "haupt" | "unter" | string;

  posNr: string;
  kurztext: string;
  langtext: string;
  einheit: string;
  menge: number;
  preis: number;
  gesamt: number;

  materialCost: number;
  laborCost: number;
  machineCost: number;
  subcontractorCost: number;
  disposalCost: number;
  overheadCost: number;
  riskCost: number;
  profitCost: number;

  baseUnitPrice: number;
  suggestedUnitPrice: number;
  finalUnitPrice: number;

  riskLevel: "low" | "medium" | "high";
  calculationStatus: "ok" | "warning" | "critical" | "manual";

  gewerk: string;
  leistungsart: string;
  bauverfahren: string;

  warning: string;
  aiReason: string;

  priceBreakdown: PriceBreakdownLine[];
  meta?: any;
};

type CompanyRecipe = {
  id: string;
  signature: string;
  title: string;
  sourcePosNr: string;
  sourceText: string;
  unit: string;
  createdAt: string;
  updatedAt: string;
  lines: RecipeLine[];
};

type ContextValues = {
  depthM: number;
  distanceKm: number;
  soilClass: string;
  restricted: boolean;
  groundwater: boolean;
  asphalt: boolean;
  trafficControl: boolean;
  dailyOutput: number;
};

type RecipeReturnContext = {
  source?: string;
  projectKey?: string;
  projectTitle?: string;
  auftragId?: string;
  auftragName?: string;
  auftragType?: "haupt" | "unter" | string;
  returnTo?: string;
  ts?: string;
};

type DraftPosition = {
  id?: string;
  posNr: string;
  kurztext: string;
  langtext: string;
  einheit: string;
  menge: number;
};

const COMPANY_RECIPE_KEY = "rlc_company_resource_recipes_v1";
const KI_HANDOFF_KEY = "rlc_kalkulation_ki_handoff_v1";
const MANUELL_HANDOFF_KEY = "rlc_kalkulation_manuell_handoff_v1";
const RECIPE_CONTEXT_KEY = "rlc_recipes_new_position_context_v1";
const NACHTRAG_BUFFER_KEY = "rlc:nachtrag-buffer";

/* ================= RESOURCE CATALOG ================= */

const RESOURCE_CATALOG: ResourceItem[] = [
  { id: "P-FACHARBEITER", group: "Personal", name: "Facharbeiter Tiefbau", unit: "h", defaultPrice: 52 },
  { id: "P-HELFER", group: "Personal", name: "Bauhelfer", unit: "h", defaultPrice: 39 },
  { id: "P-POLIER", group: "Personal", name: "Polier / Vorarbeiter", unit: "h", defaultPrice: 68 },
  { id: "P-VERMESSER", group: "Personal", name: "Vermessungstechniker", unit: "h", defaultPrice: 72 },
  { id: "P-BAULEITER", group: "Personal", name: "Bauleiter", unit: "h", defaultPrice: 82 },

  { id: "M-MINIBAGGER", group: "Maschinen", name: "Minibagger 2–3 t", unit: "h", defaultPrice: 48 },
  { id: "M-BAGGER-8T", group: "Maschinen", name: "Bagger 8 t", unit: "h", defaultPrice: 78 },
  { id: "M-BAGGER-15T", group: "Maschinen", name: "Bagger 15 t", unit: "h", defaultPrice: 108 },
  { id: "M-BAGGER-22T", group: "Maschinen", name: "Bagger 22 t", unit: "h", defaultPrice: 132 },
  { id: "M-RADLADER", group: "Maschinen", name: "Radlader", unit: "h", defaultPrice: 84 },
  { id: "M-RUETTELPLATTE", group: "Maschinen", name: "Rüttelplatte", unit: "h", defaultPrice: 22 },
  { id: "M-WALZE", group: "Maschinen", name: "Walze", unit: "h", defaultPrice: 58 },
  { id: "M-FUGENSCHNEIDER", group: "Maschinen", name: "Fugenschneider", unit: "h", defaultPrice: 44 },
  { id: "M-PFLASTERKNACKER", group: "Maschinen", name: "Pflasterknacker / Steinschneider", unit: "h", defaultPrice: 28 },

  { id: "T-LKW-3A", group: "LKW / Transport", name: "LKW 3-Achser", unit: "h", defaultPrice: 98 },
  { id: "T-LKW-4A", group: "LKW / Transport", name: "LKW 4-Achser", unit: "h", defaultPrice: 118 },
  { id: "T-LKW-SATTEL", group: "LKW / Transport", name: "Sattelzug / Schubboden", unit: "h", defaultPrice: 135 },
  { id: "T-TIEFLADER", group: "LKW / Transport", name: "Tieflader / Maschinentransport", unit: "pauschal", defaultPrice: 380 },
  { id: "T-ANFAHRT", group: "LKW / Transport", name: "Anfahrt / Baustelleneinrichtung", unit: "km", defaultPrice: 2.9 },

  { id: "MAT-SAND", group: "Material", name: "Sand / Bettungsmaterial", unit: "m³", defaultPrice: 36 },
  { id: "MAT-KIES", group: "Material", name: "Kies / Schotter 0/32", unit: "m³", defaultPrice: 44 },
  { id: "MAT-FROSTSCHUTZ-032", group: "Material", name: "Frostschutzkies 0/32 liefern", unit: "m³", defaultPrice: 48 },
  { id: "MAT-FROSTSCHUTZ-045", group: "Material", name: "Frostschutzmaterial 0/45 liefern", unit: "m³", defaultPrice: 52 },
  { id: "MAT-ASPHALT", group: "Material", name: "Asphalttragschicht / Deckschicht", unit: "m²", defaultPrice: 48 },
  { id: "MAT-SPEEDPIPE", group: "Material", name: "Speedpipe / Rohrverband", unit: "m", defaultPrice: 6.8 },
  { id: "MAT-ROHR", group: "Material", name: "Rohrleitung / Kabelschutzrohr", unit: "m", defaultPrice: 14 },
  { id: "MAT-WARNBAND", group: "Material", name: "Trassenwarnband", unit: "m", defaultPrice: 0.8 },
  { id: "MAT-SCHACHT", group: "Material", name: "Schacht / Muffe / Formteil", unit: "St", defaultPrice: 220 },

  { id: "MAT-PFLASTER-BETON-6", group: "Material", name: "Betonpflaster 6 cm liefern", unit: "m²", defaultPrice: 30 },
  { id: "MAT-PFLASTER-BETON-8", group: "Material", name: "Betonpflaster 8 cm liefern", unit: "m²", defaultPrice: 36 },
  { id: "MAT-PFLASTER-BETON-10", group: "Material", name: "Betonpflaster 10 cm liefern", unit: "m²", defaultPrice: 42 },
  { id: "MAT-PFLASTER-NATUR", group: "Material", name: "Natursteinpflaster liefern", unit: "m²", defaultPrice: 75 },
  { id: "MAT-RASENGITTER", group: "Material", name: "Rasengitterstein Beton liefern", unit: "m²", defaultPrice: 38 },
  { id: "MAT-SPLITT", group: "Material", name: "Splittbett 2/5", unit: "m³", defaultPrice: 54 },
  { id: "MAT-FUGENSAND", group: "Material", name: "Fugensand / Brechsand", unit: "m²", defaultPrice: 3.2 },
  { id: "MAT-BORD-TIEF", group: "Material", name: "Tiefbordstein liefern", unit: "m", defaultPrice: 18 },
  { id: "MAT-BORD-HOCH", group: "Material", name: "Hochbordstein liefern", unit: "m", defaultPrice: 28 },
  { id: "MAT-BORD-RUND", group: "Material", name: "Rundbordstein liefern", unit: "m", defaultPrice: 24 },
  { id: "MAT-BETON-C20", group: "Material", name: "Beton C20/25 für Rückenstütze", unit: "m³", defaultPrice: 155 },

  { id: "E-BODEN", group: "Entsorgung", name: "Bodenaushub entsorgen", unit: "t", defaultPrice: 34 },
  { id: "E-ASPHALT", group: "Entsorgung", name: "Asphaltaufbruch entsorgen", unit: "t", defaultPrice: 58 },
  { id: "E-BAUSCHUTT", group: "Entsorgung", name: "Bauschutt / Mischmaterial entsorgen", unit: "t", defaultPrice: 62 },
  { id: "E-ALTPFLASTER", group: "Entsorgung", name: "Altpflaster / Bettungsmaterial entsorgen", unit: "t", defaultPrice: 44 },

  { id: "Z-LEISTUNG", group: "Zeit / Leistung", name: "Leistung / Produktivität", unit: "m/Tag", defaultPrice: 0 },
  { id: "Z-BAUZEIT", group: "Zeit / Leistung", name: "Bauzeitansatz", unit: "Tag", defaultPrice: 0 },

  { id: "Z-GEMEINKOSTEN", group: "Zuschläge", name: "Baustellengemeinkosten", unit: "%", defaultPrice: 10 },
  { id: "Z-RISIKO", group: "Zuschläge", name: "Risikozuschlag", unit: "%", defaultPrice: 6 },
  { id: "Z-GEWINN", group: "Zuschläge", name: "Gewinnzuschlag", unit: "%", defaultPrice: 10 },
];

const GROUPS: ResourceGroup[] = [
  "Personal",
  "Maschinen",
  "LKW / Transport",
  "Material",
  "Entsorgung",
  "Fremdleistung",
  "Gemeinkosten",
  "Risiko",
  "Gewinn",
  "Zeit / Leistung",
  "Zuschläge",
];

/* ================= HELPERS ================= */

function safeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function n(value: unknown, fallback = 0): number {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/\s/g, "");

  const x = typeof value === "number" ? value : Number(normalized);
  return Number.isFinite(x) ? x : fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function money(value: unknown): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(n(value));
}

function num(value: unknown, digits = 2): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n(value));
}

function todayDE(): string {
  return new Date().toLocaleDateString("de-DE");
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function lowerText(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

function apiUrl(path: string): string {
  const base = String(RAW_API_BASE || "").replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  if (!base) return cleanPath;

  if (base.endsWith("/api") && cleanPath.startsWith("/api/")) {
    return `${base}${cleanPath.slice(4)}`;
  }

  return `${base}${cleanPath}`;
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

async function postKiSuggest(projectCode: string, row: LVPos): Promise<any | null> {
  try {
    const token = getAuthToken();

    const res = await fetch(apiUrl("/api/kalkulation/ki/suggest-batch"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        projectCode: projectCode || "NO_PROJECT",
        rows: [
          {
            id: row.id,
            posNr: row.posNr,
            kurztext: row.kurztext,
            langtext: row.langtext,
            einheit: row.einheit,
            menge: row.menge,
            preis: row.preis,
          },
        ],
        options: {
          language: "de",
          sector: "Tiefbau/Hochbau",
          calculationLevel: "elite",
          includePriceBreakdown: true,
          useKalkulationsDatenbank: true,
          useOpenAIIfNoDatabaseHit: true,
        },
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok || !Array.isArray(json.rows) || !json.rows[0]) {
      console.warn("[Recipes KI] Server response invalid:", res.status, json);
      return null;
    }

    return json.rows[0];
  } catch (e) {
    console.warn("[Recipes KI] Server not reachable:", e);
    return null;
  }
}

function normSearch(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .trim();
}

function getProject(projectCtx: any): ProjectLike | null {
  const p =
    projectCtx?.project ||
    projectCtx?.currentProject ||
    projectCtx?.selectedProject ||
    projectCtx?.current ||
    projectCtx;

  if (!p || typeof p !== "object") return null;
  return p as ProjectLike;
}

function getProjectKey(project: ProjectLike | null): string {
  return String(
    project?.code ||
      project?.number ||
      project?.projektnummer ||
      project?.id ||
      ""
  ).trim();
}

function getProjectTitle(project: ProjectLike | null): string {
  const code = getProjectKey(project);
  const name = String(project?.name || project?.projectName || "Projekt").trim();
  return code ? `${code} — ${name}` : "Kein Projekt gewählt";
}

function getProjectPlace(project: ProjectLike | null): string {
  return String(project?.place || project?.ort || project?.location || "").trim();
}

function textSignature(row: LVPos | null): string {
  const text = normSearch(`${row?.kurztext || ""} ${row?.langtext || ""}`);

  if (text.includes("rasengitter")) return "rasengitterstein";
  if (text.includes("frostschutz")) return "frostschutz";
  if (text.includes("bord") || text.includes("randstein")) return "bordstein";
  if (text.includes("speedpipe")) return "speedpipe";
  if (text.includes("glasfaser")) return "glasfaser";
  if (text.includes("graben") || text.includes("aushub")) return "graben";
  if (text.includes("asphalt")) return "asphalt_herstellen";
  if (text.includes("rohr")) return "rohrleitung";
  if (text.includes("schacht")) return "schacht_setzen";
  if (
    text.includes("pflaster") ||
    text.includes("verbundstein") ||
    text.includes("betonstein") ||
    text.includes("naturstein")
  ) {
    return "pflaster_verlegen";
  }
  if (text.includes("kabel")) return "kabel";
  if (text.includes("verfull") || text.includes("verfuell")) return "verfuellung";

  return String(row?.kurztext || row?.posNr || "position")
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, "_")
    .slice(0, 50);
}

function inferUnitFromText(textValue: string): string {
  const text = normSearch(textValue);

  if (
    text.includes("pflaster") ||
    text.includes("asphalt") ||
    text.includes("flache") ||
    text.includes("rasengitter")
  ) {
    return "m²";
  }

  if (
    text.includes("aushub") ||
    text.includes("boden") ||
    text.includes("kies") ||
    text.includes("schotter") ||
    text.includes("frostschutz")
  ) {
    return "m³";
  }

  if (
    text.includes("rohr") ||
    text.includes("leitung") ||
    text.includes("speedpipe") ||
    text.includes("kabel") ||
    text.includes("bord") ||
    text.includes("randstein")
  ) {
    return "m";
  }

  if (
    text.includes("schacht") ||
    text.includes("muffe") ||
    text.includes("abzweig")
  ) {
    return "St";
  }

  if (text.includes("entsorgung") || text.includes("deponie")) return "t";

  return "m";
}

function inferGewerk(row: LVPos | null): string {
  const text = normSearch(`${row?.kurztext || ""} ${row?.langtext || ""}`);

  if (text.includes("rasengitter")) return "Straßenbau / Rasengitterarbeiten";
  if (text.includes("pflaster")) return "Straßenbau / Pflasterarbeiten";
  if (text.includes("bord") || text.includes("randstein")) return "Straßenbau / Bordsteinarbeiten";
  if (
    text.includes("leitungsgraben") ||
    text.includes("graben herstellen") ||
    text.includes("kabelgraben") ||
    text.includes("rohrgraben") ||
    text.includes("trasse herstellen")
  ) return "Tiefbau / Leitungsbau";
  if (text.includes("asphalt")) return "Straßenbau / Asphaltbau";
  if (text.includes("frostschutz")) return "Straßenbau / Tragschichten";
  if (text.includes("graben") || text.includes("aushub")) return "Tiefbau / Erdarbeiten";
  if (
    text.includes("rohr") ||
    text.includes("leitung") ||
    text.includes("speedpipe") ||
    text.includes("kabel")
  ) {
    return "Tiefbau / Leitungsbau";
  }
  if (text.includes("schacht")) return "Tiefbau / Schachtbau";

  return "Tiefbau";
}

function inferBauverfahren(row: LVPos | null, ctx: ContextValues): string {
  const text = normSearch(`${row?.kurztext || ""} ${row?.langtext || ""}`);

  if (text.includes("rasengitter")) {
    return "Rasengitterfläche herstellen mit Tragschicht, Bettung, Verlegung, Abrütteln und Verfüllen der Kammern";
  }

  if (text.includes("pflaster")) {
    return "Pflasterfläche herstellen mit Tragschicht, Bettung, Verlegung, Zuschnitt, Abrütteln und Verfugung";
  }

  if (text.includes("bord") || text.includes("randstein")) {
    return "Bordstein setzen mit Aushub, Fundamentbeton, Rückenstütze, Ausrichten und Verfugen";
  }

  if (text.includes("frostschutz")) {
    return "Frostschutzschicht lagenweise einbauen, profilgerecht herstellen und verdichten";
  }

  if (
    text.includes("leitungsgraben") ||
    text.includes("graben herstellen") ||
    text.includes("kabelgraben") ||
    text.includes("rohrgraben") ||
    text.includes("trasse herstellen")
  ) {
    return "Leitungsgraben / Trasse herstellen mit Aushub, Leitungszone, Verfüllung, Verdichtung und Oberflächenbezug";
  }

  if (text.includes("asphalt")) {
    return "Asphaltfläche herstellen / wiederherstellen mit Verdichtung und Anschluss an Bestand";
  }

  if (text.includes("speedpipe")) return "Speedpipe-Verlegung im Leitungsgraben";
  if (text.includes("rohr") || text.includes("leitung")) return "Rohrleitung liefern und fachgerecht verlegen";

  if (text.includes("graben") || text.includes("aushub")) {
    return `Baggeraushub bis ca. ${ctx.depthM} m mit Laden, Sichern und Verfüllen`;
  }

  if (text.includes("schacht")) return "Schacht setzen, ausrichten, anschließen und verfüllen";

  return "Standardausführung gemäß LV und örtlichen Erfordernissen";
}

function suggestLangtextForDraft(draft: DraftPosition, ctx: ContextValues): string {
  const text = normSearch(`${draft.kurztext} ${draft.langtext}`);
  const unit = draft.einheit || inferUnitFromText(draft.kurztext);

  if (text.includes("rasengitter")) {
    return `Rasengittersteinfläche herstellen. Einschließlich Prüfen und Vorbereiten des Untergrundes, Herstellen der tragfähigen Frostschutz- beziehungsweise Tragschicht, Herstellen der Bettung, Liefern und Verlegen der Rasengittersteine, Schneiden und Anpassen in Rand- und Anschlussbereichen, Abrütteln sowie Verfüllen der Kammern mit geeignetem Material. Einschließlich aller erforderlichen Nebenleistungen, Geräte, Personal, Material, Transport und Baustellenorganisation. Abrechnung nach tatsächlich ausgeführter Fläche in ${unit}.`;
  }

  if (
    text.includes("pflaster") ||
    text.includes("verbundstein") ||
    text.includes("betonstein") ||
    text.includes("naturstein")
  ) {
    return `Pflasterfläche herstellen. Einschließlich Prüfen und Vorbereiten des Untergrundes, Herstellen beziehungsweise Ergänzen der Tragschicht, Herstellen und Feinplanieren der Bettung, Liefern und Verlegen der Pflastersteine im vereinbarten Verband, Schneiden von Rand- und Anschlussbereichen, höhengerechtem Anschluss an Bestand, Abrütteln der Pflasterfläche sowie Verfüllen der Fugen mit geeignetem Fugenmaterial. Einschließlich aller erforderlichen Nebenleistungen, Geräte, Personal, Material, Transport und Baustellenorganisation. Abrechnung nach tatsächlich ausgeführter Fläche in ${unit}.`;
  }

  if (text.includes("bord") || text.includes("randstein")) {
    return `Bordstein beziehungsweise Einfassung fachgerecht setzen. Einschließlich Aushub, Herstellen des Betonfundaments, Liefern und Setzen der Bordsteine, höhen- und fluchtgerechtem Ausrichten, Herstellen der Rückenstütze, Schneiden und Anpassen, Verfugen sowie Wiederherstellung der angrenzenden Bereiche. Einschließlich Personal, Geräte, Material, Transport und Nebenleistungen. Abrechnung nach tatsächlich gesetzter Länge in ${unit}.`;
  }

  if (text.includes("frostschutz")) {
    return `Frostschutzschicht herstellen. Einschließlich Liefern des geeigneten Frostschutzmaterials, lagenweisem Einbau, profilgerechtem Verteilen, Verdichten, Herstellen der geforderten Tragfähigkeit sowie Kontrolle der Höhenlage. Einschließlich Personal, Maschinen, Transport und Nebenleistungen. Abrechnung nach tatsächlich eingebauter Menge in ${unit}.`;
  }

  if (
    text.includes("leitungsgraben") ||
    text.includes("graben herstellen") ||
    text.includes("kabelgraben") ||
    text.includes("rohrgraben") ||
    text.includes("trasse herstellen")
  ) {
    return `Leitungsgraben beziehungsweise Trasse fachgerecht herstellen. Einschließlich Schneiden und Aufnehmen vorhandener Oberflächen soweit erforderlich, Aushub, Herstellen der Grabensohle, Sichern des Grabens, Herstellen der Leitungszone, Bettung, Warnband beziehungsweise Trassenkennzeichnung, Verfüllen und lagenweisem Verdichten nach technischem Erfordernis. Oberfläche und Wiederherstellung sind entsprechend der Positionsbeschreibung zu berücksichtigen. Abrechnung nach tatsächlich ausgeführter Länge beziehungsweise Menge in ${unit}.`;
  }

  if (text.includes("asphalt")) {
    return `Asphaltfläche herstellen beziehungsweise wiederherstellen. Einschließlich Schneiden der Anschlusskanten, Vorbereiten des Untergrundes, Einbau der Asphaltschicht, Verdichtung, höhengerechtem Anschluss an Bestand und fachgerechter Oberflächenherstellung. Einschließlich Material, Geräte, Personal, Transport, Entsorgung und Nebenleistungen. Abrechnung nach tatsächlich ausgeführter Fläche in ${unit}.`;
  }

  if (
    text.includes("speedpipe") ||
    text.includes("rohr") ||
    text.includes("leitung") ||
    text.includes("kabel")
  ) {
    return `Leitung beziehungsweise Rohrsystem liefern und fachgerecht verlegen. Einschließlich Herstellen der Leitungszone, Bettung, Ausrichten, Einbauen, Warnband beziehungsweise Trassenkennzeichnung, fachgerechtem Anschluss sowie Verfüllen und Verdichten nach Erfordernis. Grabentiefe ca. ${ctx.depthM} m, Bodenklasse ${ctx.soilClass}. Abrechnung nach tatsächlich ausgeführter Länge in ${unit}.`;
  }

  if (
    text.includes("aushub") ||
    text.includes("graben") ||
    text.includes("auskofferung") ||
    text.includes("auskoffern") ||
    text.includes("erdarbeiten") ||
    text.includes("baugrube")
  ) {
    const soil = String(ctx.soilClass || "").toUpperCase().startsWith("BK")
      ? String(ctx.soilClass)
      : `BK ${ctx.soilClass}`;

    const extras = [
      ctx.restricted ? "Ausführung bei eingeschränktem Arbeitsraum." : "",
      ctx.groundwater ? "Erschwernisse durch Grundwasser sind zu berücksichtigen." : "",
      ctx.asphalt ? "Asphaltflächen beziehungsweise befestigte Oberflächen sind im Arbeitsbereich betroffen." : "",
      ctx.trafficControl ? "Verkehrssicherung und Sicherung der Arbeitsstelle sind einzukalkulieren." : "",
    ].filter(Boolean).join(" ");

    return `Auskofferung beziehungsweise Erdarbeiten fachgerecht ausführen. Einschließlich Lösen und Laden des Bodens, profilgerechtem Herstellen der Aushubfläche beziehungsweise Baugrube, seitlichem Lagern oder Abfahren des Aushubmaterials, Herstellen der erforderlichen Arbeitsräume, Sichern der Arbeitsstelle sowie aller Nebenleistungen für Personal, Geräte, Maschinen, Transport und Baustellenorganisation.

Ausführungstiefe ca. ${ctx.depthM} m, Bodenklasse ${soil}, Entfernung zur Baustelle beziehungsweise Transportansatz ca. ${ctx.distanceKm} km. Die kalkulierte Leistung basiert auf einer Tagesleistung von ca. ${ctx.dailyOutput} ${unit}/Tag. ${extras}

Abrechnung nach tatsächlich ausgeführter und prüfbarer Menge in ${unit}.`;
  }

  if (text.includes("schacht")) {
    return `Schacht beziehungsweise Formteil fachgerecht einbauen. Einschließlich Herstellen der Baugrube, Bettung, Setzen, Ausrichten, Anschließen, Abdichten, Verfüllen und Verdichten sowie aller erforderlichen Nebenleistungen. Abrechnung nach Stückzahl in ${unit}.`;
  }

  return `Leistung fachgerecht ausführen. Einschließlich aller erforderlichen Nebenleistungen, Material, Personal, Maschinen, Transport, Baustellenorganisation, Dokumentation und Abrechnung nach tatsächlich ausgeführter Menge in ${unit}.`;
}

function loadCompanyRecipes(): CompanyRecipe[] {
  try {
    const raw = localStorage.getItem(COMPANY_RECIPE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCompanyRecipes(rows: CompanyRecipe[]) {
  localStorage.setItem(COMPANY_RECIPE_KEY, JSON.stringify(rows));
}

function loadRecipeLibraryRows(): ExternalLibraryItem[] {
  const api = RecipeLibrary as any;

  try {
    if (typeof api.list === "function") {
      const rows = api.list();
      return Array.isArray(rows) ? rows : [];
    }

    if (typeof api.all === "function") {
      const rows = api.all();
      return Array.isArray(rows) ? rows : [];
    }

    if (typeof api.getAll === "function") {
      const rows = api.getAll();
      return Array.isArray(rows) ? rows : [];
    }
  } catch {
    return [];
  }

  return [];
}

function importRecipeLibraryCsv(text: string) {
  const api = RecipeLibrary as any;

  if (typeof api.importCsvPriceLibrary === "function") {
    return api.importCsvPriceLibrary(text);
  }

  if (typeof api.importCsv === "function") {
    return api.importCsv(text);
  }

  throw new Error("RecipeLibrary Import-Funktion fehlt.");
}

function libraryTitle(item: ExternalLibraryItem): string {
  return String(item.title || item.name || item.kurztext || item.code || item.posNr || "").trim();
}

function libraryCode(item: ExternalLibraryItem): string {
  return String(item.code || item.posNr || item.id || "").trim();
}

function libraryUnit(item: ExternalLibraryItem): string {
  return String(item.unit || item.einheit || "EH").trim();
}

function libraryPrice(item: ExternalLibraryItem): number {
  return n(item.unitPrice ?? item.price ?? item.ep ?? item.defaultPrice);
}

function libraryQty(item: ExternalLibraryItem): number {
  return Math.max(n(item.qty ?? item.menge, 1), 0.0001);
}

function libraryGroup(item: ExternalLibraryItem): ResourceGroup {
  const text = normSearch(
    `${item.group || ""} ${item.category || ""} ${libraryTitle(item)}`
  );

  if (
    text.includes("lohn") ||
    text.includes("personal") ||
    text.includes("arbeiter") ||
    text.includes("facharbeiter") ||
    text.includes("helfer") ||
    text.includes("polier")
  ) {
    return "Personal";
  }

  if (
    text.includes("maschine") ||
    text.includes("bagger") ||
    text.includes("radlader") ||
    text.includes("walze") ||
    text.includes("ruttel") ||
    text.includes("gerät") ||
    text.includes("geraet")
  ) {
    return "Maschinen";
  }

  if (
    text.includes("lkw") ||
    text.includes("transport") ||
    text.includes("tieflader") ||
    text.includes("anfahrt")
  ) {
    return "LKW / Transport";
  }

  if (
    text.includes("entsorgung") ||
    text.includes("deponie") ||
    text.includes("verwertung") ||
    text.includes("boden entsorgen") ||
    text.includes("aufbruch entsorgen")
  ) {
    return "Entsorgung";
  }

  if (text.includes("fremdleistung") || text.includes("subunternehmer")) {
    return "Fremdleistung";
  }

  if (text.includes("gemeinkosten")) return "Gemeinkosten";
  if (text.includes("risiko")) return "Risiko";
  if (text.includes("gewinn")) return "Gewinn";

  if (text.includes("zuschlag")) return "Zuschläge";

  return "Material";
}

function libraryResourceId(item: ExternalLibraryItem): string {
  const base =
    libraryCode(item) ||
    `${libraryTitle(item)}-${libraryUnit(item)}-${libraryPrice(item)}`;

  return `LIB-${String(base)
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "_")
    .slice(0, 120)}`;
}

function recipeLineFromLibrary(item: ExternalLibraryItem): RecipeLine {
  const title = libraryTitle(item);
  const unit = libraryUnit(item);
  const group = libraryGroup(item);

  return {
    id: safeId(),
    group,
    resourceId: libraryResourceId(item),
    name: title || "Bibliothek-Position",
    unit,
    qty: libraryQty(item),
    price: libraryPrice(item),
    note: item.source ? `Bibliothek: ${item.source}` : "Aus importierter Bibliothek",
    aiSuggested: false,
  };
}

function isSurchargeLike(row: Partial<RecipeLine>): boolean {
  const group = String(row.group || "").trim();

  return (
    group === "Zuschläge" ||
    group === "Gemeinkosten" ||
    group === "Risiko" ||
    group === "Gewinn" ||
    String(row.unit || "").trim() === "%"
  );
}

function lineTotal(row: RecipeLine): number {
  if (isSurchargeLike(row)) return 0;
  return round2(n(row.qty) * n(row.price));
}

function directTotal(lines: RecipeLine[]): number {
  return round2(
    lines
      .filter((r) => !isSurchargeLike(r))
      .reduce((s, r) => s + lineTotal(r), 0)
  );
}

function surchargePercent(lines: RecipeLine[]): number {
  return lines
    .filter((x) => x.group === "Zuschläge" && x.unit === "%")
    .reduce((s, x) => s + n(x.price), 0);
}

function totalWithSurcharges(lines: RecipeLine[]): number {
  const base = directTotal(lines);
  return round2(base * (1 + surchargePercent(lines) / 100));
}

function unitPrice(total: number, qty: number): number {
  return qty > 0 ? round2(total / qty) : 0;
}

function makeLine(resourceId: string, qty: number, note = "", aiSuggested = true): RecipeLine {
  const r = RESOURCE_CATALOG.find((x) => x.id === resourceId);

  if (!r) {
    return {
      id: safeId(),
      group: "Material",
      resourceId: "",
      name: "Neue Ressource",
      unit: "St",
      qty,
      price: 0,
      note,
      aiSuggested,
    };
  }

  return {
    id: safeId(),
    group: r.group,
    resourceId: r.id,
    name: r.name,
    unit: r.unit,
    qty,
    price: r.defaultPrice,
    note,
    aiSuggested,
  };
}

function makeDefaultDraft(): DraftPosition {
  return {
    id: "",
    posNr: "",
    kurztext: "",
    langtext: "",
    einheit: "m",
    menge: 1,
  };
}

function draftFromLv(row: LVPos): DraftPosition {
  return {
    id: String(row.id || ""),
    posNr: String(row.posNr || ""),
    kurztext: String(row.kurztext || ""),
    langtext: String(row.langtext || ""),
    einheit: String(row.einheit || "m"),
    menge: n(row.menge, 1),
  };
}

function draftToLvPos(draft: DraftPosition): LVPos {
  return {
    id: draft.id || "NEW_RECIPE_POSITION",
    posNr: draft.posNr,
    kurztext: draft.kurztext,
    langtext: draft.langtext,
    einheit: draft.einheit,
    menge: n(draft.menge, 1),
    preis: 0,
    gesamt: 0,
    waehrung: "EUR",
    source: "manual",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as LVPos;
}

function validateDraft(draft: DraftPosition): string[] {
  const errors: string[] = [];

  if (!normalizeText(draft.posNr)) errors.push("Positionsnummer fehlt.");
  if (!normalizeText(draft.kurztext)) errors.push("Kurztext fehlt.");
  if (!normalizeText(draft.einheit)) errors.push("Einheit fehlt.");
  if (n(draft.menge) <= 0) errors.push("Menge muss größer als 0 sein.");

  return errors;
}

function priceBreakdownGroupToResourceGroup(group: string): ResourceGroup {
  if (group === "Personal") return "Personal";
  if (group === "Maschinen") return "Maschinen";
  if (group === "LKW / Transport") return "LKW / Transport";
  if (group === "Material") return "Material";
  if (group === "Entsorgung") return "Entsorgung";
  if (group === "Fremdleistung") return "Fremdleistung";
  if (group === "Gemeinkosten") return "Gemeinkosten";
  if (group === "Risiko") return "Risiko";
  if (group === "Gewinn") return "Gewinn";
  return "Material";
}

function recipeLinesFromServerPriceBreakdown(serverRow: any): RecipeLine[] {
  const pb = Array.isArray(serverRow?.priceBreakdown)
    ? serverRow.priceBreakdown
    : [];

  const menge = Math.max(n(serverRow?.menge, 1), 1);

  return pb
    .map((line: any) => {
      const group = priceBreakdownGroupToResourceGroup(String(line?.group || "Material"));
      const qtyPerUnit = Math.max(n(line?.qty, 1), 0.0001);
      const price = n(line?.price ?? line?.total);

      return {
        id: safeId(),
        group,
        resourceId: "",
        name: normalizeText(line?.name) || "KI-Kostenansatz",
        unit: normalizeText(line?.unit) || normalizeText(serverRow?.einheit) || "EH",
        qty: round2(qtyPerUnit * menge),
        price,
        note:
          normalizeText(line?.note) ||
          `Server-KI / ${serverRow?.source || "openai"}`,
        aiSuggested: true,
      } as RecipeLine;
    })
    .filter((line: RecipeLine) => n(line.price) > 0);
}


function cleanRecipeLinesByWorkType(
  lines: RecipeLine[],
  workType: WorkTypeKey
): RecipeLine[] {
  if (workType === "unknown") return lines;

  return lines.filter((line) => {
    return !isForbiddenForWorkType({
      workType,
      group: line.group,
      resourceId: line.resourceId,
      name: line.name,
      note: line.note,
    });
  });
}

function dispatchWorkTypeAmbiguous(detection: ReturnType<typeof detectWorkType>) {
  dispatchActiveKiSuggestion({
    id: "recipes-worktype-ambiguous",
    level: "warning",
    title: detection.title || "Leistung unklar",
    text:
      detection.message ||
      "Die Leistungsart ist zu ungenau. Bitte genauer beschreiben, was kalkuliert werden soll.",
    nextLabel: "Leistung klären",
    action: "focusPosition",
    autoOpen: false,
    pulse: true,
  });
}

function createKiSuggestion(row: LVPos, ctx: ContextValues): RecipeLine[] {
  const qty = Math.max(n(row.menge), 1);
  const text = normSearch(`${row.posNr} ${row.kurztext} ${row.langtext}`);
  const calcText = normSearch(`${row.posNr} ${row.kurztext}`);

  const technicalPosition = detectTechnicalPosition({
    posNr: row.posNr || "",
    kurztext: row.kurztext || "",
    langtext: row.langtext || "",
    einheit: row.einheit || "",
  });

  const detectedWorkType = technicalPosition
    ? {
        key: technicalPosition.workType,
        confidence: 0.99,
        ambiguous: false,
        title: technicalPosition.title,
        message: `Technische Position erkannt: ${technicalPosition.title}`,
      }
    : detectWorkType({
        posNr: row.posNr || "",
        kurztext: row.kurztext || "",
        langtext: row.langtext || "",
        einheit: row.einheit || "",
      });

  if (detectedWorkType.ambiguous || detectedWorkType.key === "unknown") {
    dispatchWorkTypeAmbiguous(detectedWorkType);
    return [];
  }

  const workType = detectedWorkType.key;
  const isPlanie = workType === "planie";

  const asphaltAmbiguous =
    text.includes("asphalt") &&
    !text.includes("herstellen") &&
    !text.includes("wiederherstellen") &&
    !text.includes("einbauen") &&
    !text.includes("asphaltieren") &&
    !text.includes("fras") &&
    !text.includes("fräs") &&
    !text.includes("abfräsen") &&
    !text.includes("aufbruch") &&
    !text.includes("ausbauen") &&
    !text.includes("abbruch") &&
    !text.includes("entfernen");

  if (asphaltAmbiguous) {
    dispatchActiveKiSuggestion({
      id: "recipes-asphalt-ambiguous",
      level: "warning",
      title: "Asphalt-Leistung unklar",
      text:
        "Ich erkenne Asphalt, aber nicht eindeutig ob Asphalt hergestellt, wiederhergestellt, gefräst, ausgebaut oder entsorgt werden soll. Bitte Kurztext präzisieren oder KI-Klärung starten.",
      nextLabel: "Leistung klären",
      action: "clarifyWorkIntent",
      autoOpen: false,
      pulse: true,
    });

    return [];
  }


  const depthFactor =
    ctx.depthM >= 2.0 ? 1.55 : ctx.depthM >= 1.5 ? 1.32 : ctx.depthM >= 1.2 ? 1.14 : 1;

  const soilFactor =
    ctx.soilClass === "7"
      ? 1.55
      : ctx.soilClass === "6"
        ? 1.38
        : ctx.soilClass === "5"
          ? 1.24
          : ctx.soilClass === "4"
            ? 1.12
            : 1;

  const restrictionFactor = ctx.restricted ? 1.28 : 1;
  const waterFactor = ctx.groundwater ? 1.25 : 1;
  const trafficFactor = ctx.trafficControl ? 1.12 : 1;
  const distanceFactor = ctx.distanceKm > 30 ? 1.08 : ctx.distanceKm > 15 ? 1.04 : 1;

  const factor =
    depthFactor *
    soilFactor *
    restrictionFactor *
    waterFactor *
    trafficFactor *
    distanceFactor;

  let dailyOutput = Math.max(n(ctx.dailyOutput), 1);

  if (technicalPosition && n(ctx.dailyOutput) <= 0) {
    dailyOutput = technicalPosition.defaultDailyOutput;
  }

  if (dailyOutput <= 1) {
    if (isPlanie) dailyOutput = 180;
    else if (workType === "auffuellung") dailyOutput = 70;
    else if (workType === "kies_tragschicht" || workType === "frostschutz") dailyOutput = 85;
    else if (workType === "pflaster_verlegen") dailyOutput = 28;
    else if (workType === "asphalt_fraesen") dailyOutput = 250;
    else if (workType === "asphalt_herstellen") dailyOutput = 120;
    else if (workType === "leitung_graben") dailyOutput = 35;
    else if (workType === "bordstein") dailyOutput = 45;
    else if (workType === "entsorgung") dailyOutput = 80;
    else dailyOutput = 35;
  }

  const days = Math.max(qty / dailyOutput, 0.15);
  const lines: RecipeLine[] = [];

/* ✅ FIX: Planie/Feinplanum ist eine leichte Flächenleistung.
   Nicht als Aushub, Kiestragschicht, Entsorgung oder m²-Stunden-Mix kalkulieren. */
if (isPlanie) {
  const planieDailyOutput = Math.max(n(ctx.dailyOutput), 180); // m²/Tag Default
  const planieDays = Math.max(qty / planieDailyOutput, 0.12);

  lines.push(
    makeLine(
      "P-FACHARBEITER",
      round2(Math.max(planieDays * 5.5 * factor, 2.5)),
      "Planie / Feinplanum herstellen, Höhenkontrolle, Nacharbeiten"
    )
  );

  lines.push(
    makeLine(
      "M-RADLADER",
      round2(Math.max(planieDays * 2.2 * factor, 1.0)),
      "Profilieren, Verteilen, Abziehen"
    )
  );

  lines.push(
    makeLine(
      "M-WALZE",
      round2(Math.max(planieDays * 1.5, 0.8)),
      "Verdichtung / Nachverdichtung nach Erfordernis"
    )
  );

  if (ctx.restricted) {
    lines.push(
      makeLine(
        "P-HELFER",
        round2(Math.max(planieDays * 2.0 * factor, 0.75)),
        "Unterstützung bei eingeschränktem Arbeitsraum"
      )
    );
  }

  lines.push({ ...makeLine("Z-LEISTUNG", planieDailyOutput, "Leistung je Arbeitstag", true), price: 0 });
  lines.push({ ...makeLine("Z-BAUZEIT", round2(planieDays), "rechnerische Bauzeit", true), price: 0 });
  lines.push(makeLine("Z-GEMEINKOSTEN", 1, "Baustellengemeinkosten / Organisation", true));
  lines.push(makeLine("Z-RISIKO", 1, ctx.groundwater ? "erhöht wegen Grundwasser / Erschwernis" : "normaler Risikopuffer", true));
  lines.push(makeLine("Z-GEWINN", 1, "Gewinnzuschlag", true));

  // ✅ Sicherheitskorrektur: Planie/Feinplanum darf niemals Material-/Entsorgungs-/Transportaufbau bekommen.
  // Planie ist keine Frostschutzschicht, keine Auskofferung und keine Entsorgung.
  if (isPlanie) {
    const cleaned = lines.filter((line) => {
      const g = String(line.group || "");
      const t = normSearch(`${line.name || ""} ${line.note || ""} ${line.resourceId || ""}`);

      if (g === "Material") return false;
      if (g === "Entsorgung") return false;
      if (g === "LKW / Transport") return false;

      if (t.includes("frostschutz")) return false;
      if (t.includes("splitt")) return false;
      if (t.includes("kies")) return false;
      if (t.includes("aushub")) return false;
      if (t.includes("auskoffer")) return false;
      if (t.includes("entsorg")) return false;
      if (t.includes("transport")) return false;

      return true;
    });

    const hasPersonal = cleaned.some((x) => x.group === "Personal");
    const hasMachine = cleaned.some((x) => x.group === "Maschinen");

    if (!hasPersonal) {
      cleaned.unshift(
        makeLine(
          "P-FACHARBEITER",
          round2(Math.max((qty / Math.max(n(ctx.dailyOutput), 180)) * 5.5, 2.5)),
          "Planie / Feinplanum herstellen, Höhenkontrolle, Nacharbeiten"
        )
      );
    }

    if (!hasMachine) {
      cleaned.splice(
        1,
        0,
        makeLine(
          "M-RADLADER",
          round2(Math.max((qty / Math.max(n(ctx.dailyOutput), 180)) * 2.2, 1.0)),
          "Profilieren, Abziehen, leichte Nachverdichtung"
        )
      );
    }

    return cleaned;
  }

  return cleanRecipeLinesByWorkType(lines, workType);
}

  if (false) {
    lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 0.45 * factor), "Planie / Feinplanum herstellen"));
    lines.push(makeLine("P-HELFER", round2(days * 8 * 0.25 * factor), "Unterstützung Höhenkontrolle / Nacharbeit"));
    lines.push(makeLine("M-RADLADER", round2(days * 2.0 * factor), "Profilieren / Abziehen"));
    lines.push(makeLine("M-WALZE", round2(days * 1.8), "Verdichtung / Nachverdichtung"));
  }

  if (workType === "auffuellung") {
    lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 0.65 * factor), "Auffüllung lagenweise herstellen"));
    lines.push(makeLine("P-HELFER", round2(days * 8 * 0.35 * factor), "Unterstützung Einbau / Kontrolle"));
    lines.push(makeLine("M-RADLADER", round2(days * 4.0 * factor), "Material verteilen"));
    lines.push(makeLine("M-WALZE", round2(days * 3.0), "lagenweise Verdichtung"));
    lines.push(makeLine("T-LKW-4A", round2(days * 2.5 * distanceFactor), "Materialtransport"));
  }

  if (workType === "kies_tragschicht" || workType === "frostschutz") {
    lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 0.55 * factor), "Tragschicht / Frostschutz herstellen"));
    lines.push(makeLine("P-HELFER", round2(days * 8 * 0.30 * factor), "Einbaukontrolle / Unterstützung"));
    lines.push(makeLine("M-RADLADER", round2(days * 4.2 * factor), "Material verteilen"));
    lines.push(makeLine("M-WALZE", round2(days * 3.0), "Verdichtung"));
    lines.push(makeLine("MAT-FROSTSCHUTZ-032", qty, "Frostschutzkies / Schotter / Tragschichtmaterial"));
    lines.push(makeLine("T-LKW-4A", round2(days * 3.0 * distanceFactor), "Anlieferung Material"));
  }

  if (workType === "pflaster_verlegen") {
    const isNatur = text.includes("naturstein");
    const is10 = text.includes("10 cm") || text.includes("10cm");
    const mat = isNatur ? "MAT-PFLASTER-NATUR" : is10 ? "MAT-PFLASTER-BETON-10" : "MAT-PFLASTER-BETON-8";

    lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 1.25 * factor), "Pflasterfläche herstellen"));
    lines.push(makeLine("P-HELFER", round2(days * 8 * 0.95 * factor), "Material verteilen, schneiden, verfugen"));
    lines.push(makeLine("M-RUETTELPLATTE", round2(days * 2.7), "Abrütteln der Pflasterfläche"));
    lines.push(makeLine("M-PFLASTERKNACKER", round2(days * 1.35), "Pflaster schneiden / Randanpassung"));
    lines.push(makeLine(mat, qty, "Pflastersteine liefern"));
    lines.push(makeLine("MAT-SPLITT", round2(qty * 0.045), "Splittbett"));
    lines.push(makeLine("MAT-FUGENSAND", qty, "Fugen verfüllen"));
    lines.push(makeLine("T-LKW-4A", round2(days * 1.8 * distanceFactor), "Materialtransport"));
  }

  if (workType === "asphalt_fraesen") {
    lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 0.45 * factor), "Fräsarbeiten überwachen / einmessen"));
    lines.push(makeLine("P-HELFER", round2(days * 8 * 0.30 * factor), "Absicherung / Reinigung"));
    lines.push(makeLine("M-FUGENSCHNEIDER", round2(days * 1.2), "Anschlusskanten schneiden"));
    lines.push(makeLine("M-RADLADER", round2(days * 2.5 * factor), "Fräsgut laden / Fläche reinigen"));
    lines.push(makeLine("T-LKW-4A", round2(days * 3.5 * distanceFactor), "Fräsgut abfahren"));
    lines.push(makeLine("E-ASPHALT", round2(qty * 0.18), "Asphaltfräsgut entsorgen / verwerten"));
  }

  if (workType === "asphalt_herstellen") {
    lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 0.75 * factor), "Asphaltfläche herstellen / wiederherstellen"));
    lines.push(makeLine("P-HELFER", round2(days * 8 * 0.45 * factor), "Einbaukontrolle / Unterstützung"));
    lines.push(makeLine("M-RADLADER", round2(days * 4.5 * factor), "Asphalt / Material verteilen"));
    lines.push(makeLine("M-WALZE", round2(days * 3.0), "Verdichtung Asphalt"));
    lines.push(makeLine("M-FUGENSCHNEIDER", round2(days * 1.2), "Anschlusskanten schneiden"));
    lines.push(makeLine("MAT-ASPHALT", qty, "Asphalttragschicht / Asphaltdeckschicht"));
    lines.push(makeLine("T-LKW-4A", round2(days * 2.2 * distanceFactor), "Asphalttransport"));
  }

  if (workType === "auskofferung") {
    lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 0.85 * factor), "Auskofferung / Erdarbeiten"));
    lines.push(makeLine("P-HELFER", round2(days * 8 * 0.45 * factor), "Einweisen / Sichern / Nacharbeit"));
    lines.push(makeLine(ctx.depthM > 1.35 ? "M-BAGGER-15T" : "M-BAGGER-8T", round2(days * 5.5 * factor), "Aushub lösen und laden"));
    lines.push(makeLine("T-LKW-4A", round2(days * 3.5 * distanceFactor), "Aushubtransport"));
    lines.push(makeLine("E-BODEN", round2(qty * Math.max(ctx.depthM || 1, 0.3) * 1.6), "Aushubmaterial entsorgen / verwerten"));
  }

  if (workType === "leitung_graben") {
    lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 1.55 * factor), "Kolonne Tiefbau / Leitungsbau"));
    lines.push(makeLine("P-HELFER", round2(days * 8 * 1.05 * factor), "Einbau, Verdichtung, Unterstützung"));
    lines.push(makeLine(ctx.depthM > 1.8 ? "M-BAGGER-22T" : ctx.depthM > 1.35 ? "M-BAGGER-15T" : "M-BAGGER-8T", round2(days * 6.8 * factor), "Graben herstellen"));
    lines.push(makeLine("M-RUETTELPLATTE", round2(days * 3.2), "Verdichtung lagenweise"));
    lines.push(makeLine("T-LKW-4A", round2(days * 4.0 * distanceFactor), "Abfuhr / Anlieferung"));
    lines.push(makeLine("MAT-SAND", round2(qty * 0.22 * Math.max(ctx.depthM || 1, 0.8)), "Bettung / Leitungszone"));

    if (calcText.includes("speedpipe")) {
      lines.push(makeLine("MAT-SPEEDPIPE", qty, "Speedpipe gemäß Position"));
      lines.push(makeLine("MAT-WARNBAND", qty, "Warnband / Trassenband"));
    } else if ((calcText.includes("rohr verlegen") || calcText.includes("leitung verlegen") || calcText.includes("kabelschutzrohr") || calcText.includes("rohrleitung")) && !calcText.includes("leitungsgraben")) {
      lines.push(makeLine("MAT-ROHR", qty, "Rohr / Leitung gemäß Position"));
      lines.push(makeLine("MAT-WARNBAND", qty, "Warnband / Trassenband"));
    }
  }

  if (workType === "bordstein") {
    const mat = text.includes("hochbord")
      ? "MAT-BORD-HOCH"
      : text.includes("rundbord")
        ? "MAT-BORD-RUND"
        : "MAT-BORD-TIEF";

    lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 1.2 * factor), "Bordstein setzen"));
    lines.push(makeLine("P-HELFER", round2(days * 8 * 0.75 * factor), "Aushub, Beton, Ausrichten"));
    lines.push(makeLine("M-MINIBAGGER", round2(days * 2.0 * factor), "Aushub Bordsteinrinne"));
    lines.push(makeLine(mat, qty, "Bordstein liefern"));
    lines.push(makeLine("MAT-BETON-C20", round2(qty * 0.055), "Fundament und Rückenstütze"));
    lines.push(makeLine("T-LKW-3A", round2(days * 1.2 * distanceFactor), "Materialtransport"));
  }

  if (workType === "schacht_setzen") {
    lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 1.0 * factor), "Schacht setzen / anschließen"));
    lines.push(makeLine("P-HELFER", round2(days * 8 * 0.7 * factor), "Unterstützung Schachteinbau"));
    lines.push(makeLine("M-BAGGER-8T", round2(days * 4.0 * factor), "Schachtgrube / Einbau"));
    lines.push(makeLine("MAT-SCHACHT", Math.max(qty, 1), "Schacht / Formteil"));
  }

  if (workType === "entsorgung") {
    lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 0.25 * factor), "Entsorgung organisieren / Nachweis"));
    lines.push(makeLine("M-RADLADER", round2(days * 2.5 * factor), "Material laden"));
    lines.push(makeLine("T-LKW-4A", round2(days * 4.0 * distanceFactor), "Transport Entsorgung"));
    lines.push(makeLine(text.includes("asphalt") ? "E-ASPHALT" : text.includes("pflaster") ? "E-ALTPFLASTER" : "E-BODEN", qty, "Entsorgung / Verwertung"));
  }

  if (isPlanie) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const g = lines[i]?.group;
      const name = normSearch(`${lines[i]?.name || ""} ${lines[i]?.note || ""}`);

      if (
        g === "Material" ||
        g === "Entsorgung" ||
        g === "LKW / Transport" ||
        name.includes("frostschutz") ||
        name.includes("splitt") ||
        name.includes("aushub") ||
        name.includes("entsorg")
      ) {
        lines.splice(i, 1);
      }
    }
  }

  lines.push({ ...makeLine("Z-LEISTUNG", dailyOutput, "Leistung je Arbeitstag", true), price: 0 });
  lines.push({ ...makeLine("Z-BAUZEIT", round2(days), "rechnerische Bauzeit", true), price: 0 });
  lines.push(makeLine("Z-GEMEINKOSTEN", 1, "Baustellengemeinkosten / Organisation", true));
  lines.push(makeLine("Z-RISIKO", 1, ctx.groundwater ? "erhöht wegen Grundwasser / Erschwernis" : "normaler Risikopuffer", true));
  lines.push(makeLine("Z-GEWINN", 1, "Gewinnzuschlag", true));

  // ✅ Sicherheitskorrektur: Planie/Feinplanum darf niemals Material-/Entsorgungs-/Transportaufbau bekommen.
  // Planie ist keine Frostschutzschicht, keine Auskofferung und keine Entsorgung.
  if (isPlanie) {
    const cleaned = lines.filter((line) => {
      const g = String(line.group || "");
      const t = normSearch(`${line.name || ""} ${line.note || ""} ${line.resourceId || ""}`);

      if (g === "Material") return false;
      if (g === "Entsorgung") return false;
      if (g === "LKW / Transport") return false;

      if (t.includes("frostschutz")) return false;
      if (t.includes("splitt")) return false;
      if (t.includes("kies")) return false;
      if (t.includes("aushub")) return false;
      if (t.includes("auskoffer")) return false;
      if (t.includes("entsorg")) return false;
      if (t.includes("transport")) return false;

      return true;
    });

    const hasPersonal = cleaned.some((x) => x.group === "Personal");
    const hasMachine = cleaned.some((x) => x.group === "Maschinen");

    if (!hasPersonal) {
      cleaned.unshift(
        makeLine(
          "P-FACHARBEITER",
          round2(Math.max((qty / Math.max(n(ctx.dailyOutput), 180)) * 5.5, 2.5)),
          "Planie / Feinplanum herstellen, Höhenkontrolle, Nacharbeiten"
        )
      );
    }

    if (!hasMachine) {
      cleaned.splice(
        1,
        0,
        makeLine(
          "M-RADLADER",
          round2(Math.max((qty / Math.max(n(ctx.dailyOutput), 180)) * 2.2, 1.0)),
          "Profilieren, Abziehen, leichte Nachverdichtung"
        )
      );
    }

    return cleaned;
  }

  return cleanRecipeLinesByWorkType(lines, workType);
}

/* ================= PRICE BREAKDOWN ================= */

function mapDirectGroup(group: ResourceGroup): PriceBreakdownGroup | null {
  if (group === "Personal") return "Personal";
  if (group === "Maschinen") return "Maschinen";
  if (group === "LKW / Transport") return "LKW / Transport";
  if (group === "Material") return "Material";
  if (group === "Entsorgung") return "Entsorgung";
  if (group === "Fremdleistung") return "Fremdleistung";
  if (group === "Gemeinkosten") return "Gemeinkosten";
  if (group === "Risiko") return "Risiko";
  if (group === "Gewinn") return "Gewinn";
  return null;
}

function recipeCostTotals(lines: RecipeLine[], menge: number) {
  const qtyDivisor = Math.max(n(menge), 1);
  const base = directTotal(lines);

  const materialTotal = lines.filter((x) => x.group === "Material").reduce((s, x) => s + lineTotal(x), 0);
  const laborTotal = lines.filter((x) => x.group === "Personal").reduce((s, x) => s + lineTotal(x), 0);
  const machineTotal = lines.filter((x) => x.group === "Maschinen").reduce((s, x) => s + lineTotal(x), 0);
  const transportTotal = lines.filter((x) => x.group === "LKW / Transport").reduce((s, x) => s + lineTotal(x), 0);
  const disposalTotal = lines.filter((x) => x.group === "Entsorgung").reduce((s, x) => s + lineTotal(x), 0);
  const subcontractorTotal = lines.filter((x) => x.group === "Fremdleistung").reduce((s, x) => s + lineTotal(x), 0);
  const directOverheadTotal = lines.filter((x) => x.group === "Gemeinkosten").reduce((s, x) => s + lineTotal(x), 0);
  const directRiskTotal = lines.filter((x) => x.group === "Risiko").reduce((s, x) => s + lineTotal(x), 0);
  const directProfitTotal = lines.filter((x) => x.group === "Gewinn").reduce((s, x) => s + lineTotal(x), 0);

  const overheadPct = lines.filter((x) => x.resourceId === "Z-GEMEINKOSTEN").reduce((s, x) => s + n(x.price), 0);
  const riskPct = lines.filter((x) => x.resourceId === "Z-RISIKO").reduce((s, x) => s + n(x.price), 0);
  const profitPct = lines.filter((x) => x.resourceId === "Z-GEWINN").reduce((s, x) => s + n(x.price), 0);

  const surchargeBase =
    materialTotal + laborTotal + machineTotal + transportTotal + disposalTotal + subcontractorTotal;

  const overheadTotal = round2(directOverheadTotal + surchargeBase * (overheadPct / 100));
  const riskTotal = round2(directRiskTotal + surchargeBase * (riskPct / 100));
  const profitTotal = round2(directProfitTotal + surchargeBase * (profitPct / 100));

  return {
    base,
    materialTotal,
    laborTotal,
    machineTotal,
    transportTotal,
    disposalTotal,
    subcontractorTotal,
    overheadPct,
    riskPct,
    profitPct,
    overheadTotal,
    riskTotal,
    profitTotal,
    materialCost: round2(materialTotal / qtyDivisor),
    laborCost: round2(laborTotal / qtyDivisor),
    machineCost: round2(machineTotal / qtyDivisor),
    subcontractorCost: round2(subcontractorTotal / qtyDivisor),
    disposalCost: round2(disposalTotal / qtyDivisor),
    transportCost: round2(transportTotal / qtyDivisor),
    overheadCost: round2(overheadTotal / qtyDivisor),
    riskCost: round2(riskTotal / qtyDivisor),
    profitCost: round2(profitTotal / qtyDivisor),
  };
}

function buildPriceBreakdown(lines: RecipeLine[], row: LVPos | null): PriceBreakdownLine[] {
  const menge = Math.max(n(row?.menge), 1);
  const totals = recipeCostTotals(lines, menge);
  const unit = row?.einheit || "EH";

  const direct: PriceBreakdownLine[] = lines
    .filter((line) => line.group !== "Zeit / Leistung" && line.group !== "Zuschläge")
    .map((line) => {
      const mapped = mapDirectGroup(line.group) || "Material";
      const totalWholePosition = lineTotal(line);
      const qtyPerUnit = round2(n(line.qty) / menge);
      const totalPerUnit = round2(totalWholePosition / menge);

      return {
        id: safeId(),
        group: mapped,
        name: line.name,
        unit: line.unit,
        qty: qtyPerUnit,
        price: n(line.price),
        total: totalPerUnit,
        note: line.note,
      };
    })
    .filter((line) => line.total > 0);

  const hasDirectOverhead = direct.some((x) => x.group === "Gemeinkosten");
  const hasDirectRisk = direct.some((x) => x.group === "Risiko");
  const hasDirectProfit = direct.some((x) => x.group === "Gewinn");

  if (totals.overheadTotal > 0 && !hasDirectOverhead) {
    direct.push({
      id: safeId(),
      group: "Gemeinkosten",
      name: `Baustellengemeinkosten ${num(totals.overheadPct, 2)} %`,
      unit,
      qty: 1,
      price: round2(totals.overheadTotal / menge),
      total: round2(totals.overheadTotal / menge),
      note: "aus Zuschlag berechnet",
    });
  }

  if (totals.riskTotal > 0 && !hasDirectRisk) {
    direct.push({
      id: safeId(),
      group: "Risiko",
      name: `Risikozuschlag ${num(totals.riskPct, 2)} %`,
      unit,
      qty: 1,
      price: round2(totals.riskTotal / menge),
      total: round2(totals.riskTotal / menge),
      note: "aus Zuschlag berechnet",
    });
  }

  if (totals.profitTotal > 0 && !hasDirectProfit) {
    direct.push({
      id: safeId(),
      group: "Gewinn",
      name: `Gewinnzuschlag ${num(totals.profitPct, 2)} %`,
      unit,
      qty: 1,
      price: round2(totals.profitTotal / menge),
      total: round2(totals.profitTotal / menge),
      note: "aus Zuschlag berechnet",
    });
  }

  return direct;
}

function breakdownText(lines: PriceBreakdownLine[]): string {
  return lines
    .map(
      (line) =>
        `${line.group}: ${line.name} · ${num(line.qty, 2)} ${line.unit} × ${money(line.price)} = ${money(line.total)}`
    )
    .join("\n");
}


function isGenericLangtext(value: unknown): boolean {
  const text = normSearch(value);

  if (!text) return true;

  const genericPhrases = [
    "leistung fachgerecht ausfuhren",
    "leistung fachgerecht ausführen",
    "einschliesslich aller erforderlichen nebenleistungen",
    "einschließlich aller erforderlichen nebenleistungen",
    "material personal maschinen transport",
    "baustellenorganisation dokumentation und abrechnung",
  ];

  return genericPhrases.some((x) => text.includes(normSearch(x)));
}


type SmartWorkType = WorkTypeKey | "standard";


function isAmbiguousSmartDraft(draft: DraftPosition): boolean {
  const text = normSearch(`${draft.kurztext || ""} ${draft.langtext || ""}`);
  const words = text.split(" ").filter(Boolean);

  if (words.length > 3) return false;

  const ambiguous = [
    "asphalt",
    "pflaster",
    "kies",
    "schotter",
    "leitung",
    "rohr",
    "graben",
    "planie",
    "aushub",
    "bordstein",
    "frostschutz",
  ];

  return ambiguous.some((x) => text === x || text === `${x} herstellen`);
}

function dispatchAmbiguousSmartDraft(draft: DraftPosition) {
  const text = String(draft.kurztext || "Leistung").trim();

  dispatchActiveKiSuggestion({
    id: "recipes-ambiguous-worktype",
    level: "warning",
    title: "Leistung präzisieren",
    text:
      `"${text}" ist zu ungenau. Bitte genauer angeben, was gemeint ist, z. B. Asphalt fräsen, Asphalt herstellen, Asphalt aufnehmen, Asphalttragschicht, Asphaltdeckschicht, Pflaster verlegen, Kies einbauen, Leitung verlegen oder Graben herstellen.`,
    nextLabel: "Positionsdaten prüfen",
    action: "focusPosition",
    autoOpen: false,
    pulse: true,
  });
}

function isAmbiguousSmartDraftHard(draft: DraftPosition): boolean {
  const kurz = normSearch(draft.kurztext || "").trim();
  const lang = normSearch(draft.langtext || "").trim();
  const text = `${kurz} ${lang}`.trim();

  if (!kurz) return true;

  // Nur exakt zu kurze/generische Einzelbegriffe blockieren.
  const ambiguousExact = new Set([
    "asphalt",
    "pflaster",
    "kies",
    "schotter",
    "leitung",
    "rohr",
    "graben",
    "erde",
    "boden",
    "material",
    "aushub",
  ]);

  if (ambiguousExact.has(kurz)) return true;

  // Diese Begriffe sind schon fachlich spezifisch genug und dürfen NICHT blockieren.
  const specificSignals = [
    "asphalttragschicht",
    "asphaltdeckschicht",
    "asphaltbinderschicht",
    "asphalt frasen",
    "asphalt fräsen",
    "asphalt herstellen",
    "asphalt einbauen",
    "asphalt aufnehmen",
    "asphalt schneiden",
    "asphalt wiederherstellen",
    "pflaster aufnehmen",
    "pflaster verlegen",
    "pflaster herstellen",
    "kiestragschicht",
    "schottertragschicht",
    "frostschutzschicht",
    "planie herstellen",
    "feinplanum herstellen",
    "leitung verlegen",
    "graben herstellen",
    "rohrleitung verlegen",
    "speedpipe verlegen",
  ];

  if (specificSignals.some((x) => text.includes(normSearch(x)))) return false;

  // Wenn nur 1 Wort oder extrem kurzer Text vorhanden ist, muss die KI nachfragen.
  const words = kurz.split(" ").filter(Boolean);
  if (words.length <= 1 && kurz.length < 14) return true;

  return false;
}

function ambiguousSmartDraftMessage(draft: DraftPosition): string {
  const kurz = String(draft.kurztext || "Leistung").trim();

  if (normSearch(kurz).includes("asphalt")) {
    return `"${kurz}" ist zu ungenau. Bitte auswählen/beschreiben: Asphalt fräsen, Asphalt aufnehmen/abbrechen, Asphalttragschicht einbauen, Asphaltdeckschicht einbauen, Asphaltfläche herstellen oder Asphalt wiederherstellen.`;
  }

  if (normSearch(kurz).includes("pflaster")) {
    return `"${kurz}" ist zu ungenau. Bitte genauer beschreiben: Pflaster aufnehmen, Pflaster neu verlegen, Bettung herstellen, Fugen verfüllen oder Fläche wiederherstellen.`;
  }

  if (normSearch(kurz).includes("kies") || normSearch(kurz).includes("schotter") || normSearch(kurz).includes("frostschutz")) {
    return `"${kurz}" ist zu ungenau. Bitte genauer beschreiben: Frostschutz liefern und einbauen, Kiestragschicht herstellen, Splittbettung herstellen oder Material nur liefern.`;
  }

  return `"${kurz}" ist zu ungenau. Bitte die Leistung genauer beschreiben, bevor KI-Langtext, Ressourcen und EP berechnet werden.`;
}

function dispatchAmbiguousSmartDraftHard(draft: DraftPosition) {
  dispatchActiveKiSuggestion({
    id: "recipes-ambiguous-hard-stop",
    level: "warning",
    title: "Leistung präzisieren",
    text: ambiguousSmartDraftMessage(draft),
    nextLabel: "Positionsdaten prüfen",
    action: "focusPosition",
    autoOpen: false,
    pulse: true,
  });
}

function detectSmartWorkType(draft: DraftPosition): SmartWorkType {
  const text = normSearch(`${draft.posNr || ""} ${draft.kurztext || ""} ${draft.langtext || ""}`);


  if (
    text.includes("leitungsgraben") ||
    text.includes("graben herstellen") ||
    text.includes("kabelgraben") ||
    text.includes("rohrgraben") ||
    text.includes("trasse herstellen")
  ) {
    return "leitung_graben";
  }
  if (
    text.includes("leitungsgraben") ||
    text.includes("graben herstellen") ||
    text.includes("kabelgraben") ||
    text.includes("rohrgraben") ||
    text.includes("trasse herstellen")
  ) {
    return "leitung_graben";
  }

  if (text.includes("asphalt") && (text.includes("fras") || text.includes("fräs") || text.includes("abfräsen"))) {
    return "asphalt_fraesen";
  }

  if (
    text.includes("auskofferung") ||
    text.includes("auskoffern") ||
    text.includes("aushub") ||
    text.includes("baugrube") ||
    text.includes("erdarbeiten")
  ) {
    return "auskofferung";
  }

  if (
    text.includes("planie") ||
    text.includes("planum") ||
    text.includes("feinplanum") ||
    text.includes("untergrund profilieren") ||
    text.includes("untergrund herstellen")
  ) {
    return "planie";
  }

  if (
    text.includes("auffullung") ||
    text.includes("auffüllung") ||
    text.includes("verfullung") ||
    text.includes("verfüllung") ||
    text.includes("einbauen und verdichten") ||
    text.includes("verfuellen") ||
    text.includes("verfüllen")
  ) {
    return "auffuellung";
  }

  if (
    text.includes("kies") ||
    text.includes("schotter") ||
    text.includes("tragschicht") ||
    text.includes("frostschutz") ||
    text.includes("mineralgemisch")
  ) {
    return text.includes("frostschutz") ? "frostschutz" : "kies_tragschicht";
  }

  if (
    text.includes("pflaster") ||
    text.includes("verbundstein") ||
    text.includes("betonstein") ||
    text.includes("naturstein") ||
    text.includes("rasengitter")
  ) {
    return "pflaster_verlegen";
  }

  if (text.includes("bord") || text.includes("randstein") || text.includes("einfassung")) {
    return "bordstein";
  }

  if (text.includes("asphalt")) {
    return "asphalt_herstellen";
  }

  if (
    text.includes("leitung") ||
    text.includes("rohr") ||
    text.includes("speedpipe") ||
    text.includes("kabel") ||
    text.includes("graben") ||
    text.includes("trasse")
  ) {
    return "leitung_graben";
  }

  if (text.includes("schacht") || text.includes("schachtbauwerk") || text.includes("kontrollschacht")) {
    return "schacht_setzen";
  }

  if (
    text.includes("entsorgung") ||
    text.includes("abfahren") ||
    text.includes("deponie") ||
    text.includes("verwertung") ||
    text.includes("aufbruch entsorgen")
  ) {
    return "entsorgung";
  }

  return "standard";
}

function buildSmartLocalLangtext(draft: DraftPosition, ctx: ContextValues): string {
  const unit = draft.einheit || inferUnitFromText(draft.kurztext) || "EH";
  const qty = n(draft.menge, 1);
  const title = String(draft.kurztext || "Leistung").trim();
  const workType = detectSmartWorkType(draft);

  const soil = String(ctx.soilClass || "").trim()
    ? `Bodenklasse BK ${ctx.soilClass}`
    : "Bodenklasse gemäß örtlicher Feststellung";

  const depth = n(ctx.depthM) > 0 ? `Ausführungstiefe / Grabentiefe ca. ${ctx.depthM} m.` : "";
  const distance = n(ctx.distanceKm) > 0 ? `Transportansatz / Entfernung zur Baustelle ca. ${ctx.distanceKm} km.` : "";
  const daily = n(ctx.dailyOutput) > 0 ? `Kalkulierter Leistungsansatz ca. ${ctx.dailyOutput} ${unit}/Tag.` : "";

  const extras = [
    ctx.restricted ? "Eingeschränkter Arbeitsraum ist berücksichtigt." : "",
    ctx.groundwater ? "Erschwernisse durch Grundwasser sind zu berücksichtigen." : "",
    ctx.trafficControl ? "Verkehrssicherung und Baustellenabsicherung sind einzukalkulieren." : "",
    ctx.asphalt ? "Asphaltflächen beziehungsweise gebundene Oberflächen sind betroffen." : "",
  ].filter(Boolean).join(" ");

  const params = [depth, soil + ".", distance, daily, extras].filter(Boolean).join(" ");

  if (workType === "auskofferung") {
    return `Auskofferung beziehungsweise Erdarbeiten für "${title}" fachgerecht ausführen. Einschließlich Lösen, Laden, profilgerechtem Herstellen der Aushubfläche oder Baugrube, seitlichem Lagern oder Abfahren des Aushubmaterials, Herstellen der erforderlichen Arbeitsräume, Sichern der Arbeitsstelle sowie aller erforderlichen Nebenleistungen.

${params}

Abrechnung nach tatsächlich ausgeführter und prüfbarer Menge in ${unit}.`;
  }

  if (workType === "planie") {
    return `Planie beziehungsweise Feinplanum für "${title}" fachgerecht herstellen. Einschließlich Vorbereiten des Untergrundes, Lösen kleiner Unebenheiten, profil- und höhengerechtem Abziehen, Verdichten nach Erfordernis, Herstellen der geforderten Ebenheit und Tragfähigkeit sowie Kontrolle der Höhenlage.

${params}

Abrechnung nach tatsächlich hergestellter und prüfbarer Menge in ${unit}.`;
  }

  if (workType === "auffuellung") {
    return `Auffüllung beziehungsweise Verfüllung für "${title}" fachgerecht herstellen. Einschließlich Liefern oder Übernehmen des geeigneten Materials, lagenweisem Einbau, profilgerechtem Verteilen, Verdichten nach technischen Anforderungen, Anschluss an Bestand sowie aller Nebenleistungen für Personal, Geräte, Transport und Baustellenorganisation.

${params}

Abrechnung nach tatsächlich eingebauter und verdichteter Menge in ${unit}.`;
  }

  if (workType === "kies_tragschicht" || workType === "frostschutz") {
    return `Kies-, Schotter-, Frostschutz- beziehungsweise Tragschicht für "${title}" fachgerecht herstellen. Einschließlich Liefern des geeigneten Materials, profilgerechtem Einbau, lagenweisem Verteilen, Verdichten, Herstellen der geforderten Tragfähigkeit, Höhenkontrolle und Anschluss an angrenzende Bereiche.

${params}

Abrechnung nach tatsächlich eingebauter und verdichteter Menge in ${unit}.`;
  }

  if (workType === "pflaster_verlegen") {
    return `Pflasterfläche beziehungsweise Steinbelag für "${title}" fachgerecht herstellen. Einschließlich Prüfen und Vorbereiten des Untergrundes, Herstellen oder Ergänzen der Tragschicht, Herstellen der Bettung, Liefern und Verlegen der Steine, Schneiden und Anpassen in Rand- und Anschlussbereichen, höhengerechtem Anschluss an Bestand, Abrütteln sowie Verfüllen der Fugen.

${params}

Abrechnung nach tatsächlich ausgeführter Fläche beziehungsweise Menge in ${unit}.`;
  }

  if (workType === "asphalt_fraesen") {
    return `Asphaltfläche für "${title}" fachgerecht fräsen beziehungsweise aufnehmen. Einschließlich Einrichten und Sichern der Arbeitsstelle, Fräsen der gebundenen Schicht in der erforderlichen Stärke, Laden des Fräsgutes, Abfahren beziehungsweise Verwertung/Entsorgung, Reinigen der Fläche sowie Vorbereiten für den weiteren Aufbau.

${params}

Abrechnung nach tatsächlich gefräster und prüfbarer Menge in ${unit}.`;
  }

  if (workType === "asphalt_herstellen") {
    return `Asphaltfläche für "${title}" fachgerecht herstellen beziehungsweise wiederherstellen. Einschließlich Schneiden oder Vorbereiten der Anschlusskanten, Herstellen des tragfähigen Untergrundes, Einbau der Asphaltschicht, Verdichtung, höhengerechtem Anschluss an Bestand, Oberflächenherstellung sowie aller Nebenleistungen.

${params}

Abrechnung nach tatsächlich ausgeführter und prüfbarer Menge in ${unit}.`;
  }

  if (workType === "leitung_graben") {
    return `Leitungsgraben beziehungsweise Trasse für "${title}" fachgerecht herstellen und bearbeiten. Einschließlich Aushub, Sicherung des Grabens, Herstellen der Leitungszone, Bettung, Verlegen beziehungsweise Vorbereiten der Leitung/Speedpipe/Kabeltrasse, Warnband oder Trassenkennzeichnung, Verfüllen und lagenweisem Verdichten nach technischem Erfordernis.

${params}

Abrechnung nach tatsächlich ausgeführter Länge beziehungsweise Menge in ${unit}.`;
  }

  if (workType === "schacht_setzen") {
    return `Schacht beziehungsweise Formteil für "${title}" fachgerecht einbauen. Einschließlich Herstellen der Baugrube, Bettung, Setzen, Ausrichten, Anschließen, Abdichten, Verfüllen, Verdichten, Anschluss an Bestand sowie aller erforderlichen Nebenleistungen.

${params}

Abrechnung nach tatsächlich eingebauter Stückzahl beziehungsweise Menge in ${unit}.`;
  }

  if (workType === "entsorgung") {
    return `Material für "${title}" fachgerecht aufnehmen, laden, transportieren und entsorgen beziehungsweise verwerten. Einschließlich Sortieren nach Materialart, Laden, Transport, Deponie-/Entsorgungsgebühren soweit zutreffend, Nachweisführung sowie Reinigung der Arbeitsstelle.

${params}

Abrechnung nach tatsächlich entsorgter beziehungsweise verwerteter Menge in ${unit}.`;
  }

  if (workType === "bordstein") {
    return `Bordstein, Randstein beziehungsweise Einfassung für "${title}" fachgerecht setzen. Einschließlich Aushub, Herstellen des Fundaments, Liefern und Setzen der Bauteile, höhen- und fluchtgerechtem Ausrichten, Herstellen der Rückenstütze, Schneiden und Anpassen, Verfugen sowie Wiederherstellung angrenzender Bereiche.

${params}

Abrechnung nach tatsächlich gesetzter Länge beziehungsweise Menge in ${unit}.`;
  }

  return `${title} fachgerecht gemäß Leistungsverzeichnis und örtlichen Erfordernissen ausführen. Einschließlich Arbeitsvorbereitung, Einrichten und Sichern der Arbeitsstelle, Bereitstellung von Personal, Maschinen und Material, fachgerechter Ausführung, Nebenleistungen, Transport, Dokumentation und Übergabe der prüfbaren Leistung.

${params}

Abrechnung nach tatsächlich ausgeführter und prüfbarer Menge in ${unit}.`;
}

function getSmartLangtextAuthToken(): string {
  try {
    const keys = ["rlc_token", "token", "authToken", "accessToken", "rlc_auth_token", "rlc_access_token"];
    for (const key of keys) {
      const v = localStorage.getItem(key);
      if (v && v.trim()) return v.trim();
    }
  } catch {
    //
  }

  return "";
}

async function tryServerSmartLangtext(
  draft: DraftPosition,
  ctx: ContextValues,
  localFallback: string
): Promise<string> {
  const base = String(
    ((import.meta as any)?.env?.VITE_API_URL as string | undefined) ||
      ((import.meta as any)?.env?.VITE_BACKEND_URL as string | undefined) ||
      ""
  ).replace(/\/+$/, "");

  if (!base) return "";

  const token = getSmartLangtextAuthToken();

  const payload = {
    task: "generate_tiefbau_langtext",
    instruction:
      "Erzeuge einen professionellen, positionsbezogenen deutschen Langtext für ein Tiefbau-Leistungsverzeichnis. Nicht generisch schreiben. Nutze Kurztext, Menge, Einheit und Ausführungsparameter.",
    draft,
    context: ctx,
    localFallback,
  };

  const endpoints = [
    "/api/kalkulation/ki/langtext",
    "/api/ki/langtext",
    "/api/support/chat",
  ];

  for (const endpoint of endpoints) {
    try {
      const body =
        endpoint === "/api/support/chat"
          ? {
              message: `${payload.instruction}\n\nKurztext: ${draft.kurztext}\nEinheit: ${draft.einheit}\nMenge: ${draft.menge}\nTiefe: ${ctx.depthM} m\nBodenklasse: ${ctx.soilClass}\nEntfernung: ${ctx.distanceKm} km\nLeistung/Tag: ${ctx.dailyOutput}\n\nBitte nur den fertigen Langtext ausgeben.`,
              page: "kalkulation-rezepte",
              module: "Urkalkulation",
              context: payload,
            }
          : payload;

      const res = await fetch(`${base}${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) continue;

      const json = await res.json().catch(() => null);
      const text = String(
        json?.langtext ||
          json?.text ||
          json?.answer ||
          json?.message ||
          json?.result ||
          ""
      ).trim();

      if (text.length > 80 && !isGenericLangtext(text)) return text;
    } catch {
      //
    }
  }

  return "";
}

function dispatchActiveKiSuggestion(detail: {
  id: string;
  title: string;
  text: string;
  nextLabel: string;
  action: string;
  level?: "info" | "success" | "warning" | "critical";
  autoOpen?: boolean;
  pulse?: boolean;
}) {
  window.dispatchEvent(
    new CustomEvent("rlc:active-ki-suggestion", {
      detail: {
        ...detail,
        module: "kalkulation",
        pageKey: "kalkulation-rezepte",
        eventName: "rlc:rezepte-command",
      },
    })
  );
}

function clearActiveKiSuggestion() {
  window.dispatchEvent(new CustomEvent("rlc:active-ki-clear"));
}



type CompositeSplitSuggestion = {
  kurztext: string;
  langtext: string;
  einheit: "m²" | "m³" | "m" | "t";
  menge: number;
  preis: number;
  leistungsart: string;
};

function parseCmFromText(text: string, keys: string[], fallbackCm: number): number {
  const t = normSearch(text);

  for (const key of keys) {
    const k = normSearch(key);
    const rx = new RegExp(`${k}[^0-9]{0,20}(\\d+(?:[,.]\\d+)?)\\s*cm`);
    const m = t.match(rx);
    if (m?.[1]) return n(m[1], fallbackCm);
  }

  return fallbackCm;
}

function detectCompositeSplitSuggestions(row: LVPos | DraftPosition | null): CompositeSplitSuggestion[] {
  const text = normSearch(`${row?.kurztext || ""} ${row?.langtext || ""}`);
  const baseQty = Math.max(n((row as any)?.menge, 1), 1);
  const unit = String((row as any)?.einheit || "").trim();

  if (unit !== "m²" && unit !== "m2") return [];

  const hasComposite =
    (text.includes("mit") || text.includes("inkl") || text.includes("einschl")) &&
    (
      text.includes("pflaster") ||
      text.includes("planie") ||
      text.includes("auskoffer") ||
      text.includes("fsk") ||
      text.includes("frostschutz") ||
      text.includes("splitt") ||
      text.includes("sandbett") ||
      text.includes("bettung") ||
      text.includes("aufnehmen") ||
      text.includes("entsorgen")
    );

  if (!hasComposite) return [];

  const out: CompositeSplitSuggestion[] = [];

  if (text.includes("pflaster") && (text.includes("aufnehmen") || text.includes("ausbauen") || text.includes("entfernen"))) {
    out.push({
      kurztext: "Pflasterfläche aufnehmen",
      langtext: "Pflasterfläche fachgerecht aufnehmen. Einschließlich Lösen, Aufnehmen, seitlichem Lagern oder Laden sowie Reinigung der Arbeitsfläche.",
      einheit: "m²",
      menge: baseQty,
      preis: 18,
      leistungsart: "pflaster_aufnehmen",
    });
  }

  if (text.includes("pflaster") && (text.includes("entsorgen") || text.includes("abfahren"))) {
    out.push({
      kurztext: "Altpflaster / Bettungsmaterial entsorgen",
      langtext: "Altpflaster beziehungsweise Bettungsmaterial laden, abfahren und fachgerecht entsorgen oder verwerten. Einschließlich Transport, Entsorgungsgebühren und Nachweisführung.",
      einheit: "t",
      menge: round2(baseQty * 0.22),
      preis: 44,
      leistungsart: "pflaster_entsorgung",
    });
  }

  if (text.includes("sandbett") || text.includes("bettung")) {
    out.push({
      kurztext: "Sandbettung aufnehmen und entsorgen",
      langtext: "Vorhandene Sandbettung aufnehmen, laden, abfahren und fachgerecht entsorgen oder verwerten. Einschließlich Reinigung und Vorbereitung des Untergrundes.",
      einheit: "t",
      menge: round2(baseQty * 0.09),
      preis: 44,
      leistungsart: "bettung_entsorgung",
    });
  }

  if (text.includes("auskoffer")) {
    const cm = parseCmFromText(text, ["auskofferung", "auskoffern", "aushub"], 35);
    const m3 = round2(baseQty * (cm / 100));

    out.push({
      kurztext: `Auskofferung ${cm} cm herstellen`,
      langtext: `Auskofferung in einer Stärke von ca. ${cm} cm fachgerecht ausführen. Einschließlich Lösen, Laden, profilgerechtem Herstellen der Aushubfläche, seitlichem Lagern oder Abfahren des Aushubmaterials sowie aller Nebenleistungen.`,
      einheit: "m³",
      menge: m3,
      preis: 45,
      leistungsart: "auskofferung",
    });
  }

  if (text.includes("planie") || text.includes("planum")) {
    out.push({
      kurztext: "Planie / Feinplanum herstellen",
      langtext: "Planie beziehungsweise Feinplanum fachgerecht herstellen. Einschließlich profil- und höhengerechtem Abziehen, Verdichten nach Erfordernis und Kontrolle der Höhenlage.",
      einheit: "m²",
      menge: baseQty,
      preis: 4.5,
      leistungsart: "planie",
    });
  }

  if (text.includes("fsk") || text.includes("frostschutz")) {
    const cm = parseCmFromText(text, ["fsk", "frostschutz", "frostschutzschicht"], 20);

    out.push({
      kurztext: `Frostschutzschicht ${cm} cm herstellen`,
      langtext: `Frostschutzschicht in einer Stärke von ca. ${cm} cm fachgerecht herstellen. Einschließlich Liefern, profilgerechtem Einbau, lagenweisem Verdichten und Höhenkontrolle.`,
      einheit: "m²",
      menge: baseQty,
      preis: round2(12 + cm * 0.75),
      leistungsart: "frostschutz",
    });
  }

  if (text.includes("splitt")) {
    const cm = parseCmFromText(text, ["splitt", "splittbett"], 5);

    out.push({
      kurztext: `Splittbett ${cm} cm herstellen`,
      langtext: `Splittbett in einer Stärke von ca. ${cm} cm fachgerecht herstellen. Einschließlich Liefern, Verteilen, Abziehen und Vorbereiten für die Pflasterverlegung.`,
      einheit: "m²",
      menge: baseQty,
      preis: round2(4 + cm * 0.7),
      leistungsart: "splittbett",
    });
  }

  const isPflasterRueckbau =
    text.includes("aufnehmen") ||
    text.includes("ausbauen") ||
    text.includes("entfernen") ||
    text.includes("abbrechen") ||
    text.includes("entsorgen") ||
    text.includes("abfahren");

  if (text.includes("pflaster") && !isPflasterRueckbau) {
    out.push({
      kurztext: "Pflasterfläche herstellen",
      langtext: "Pflasterfläche fachgerecht herstellen. Einschließlich Liefern und Verlegen der Pflastersteine, Schneiden und Anpassen, Abrütteln, Verfugen sowie Anschluss an Bestand.",
      einheit: "m²",
      menge: baseQty,
      preis: 55,
      leistungsart: "pflaster_verlegen",
    });
  }

  return out.length >= 2 ? out : [];
}

function buildCompositeSplitLvRows(row: LVPos | DraftPosition, existing: LVPos[]): LVPos[] {
  const suggestions = detectCompositeSplitSuggestions(row);
  if (!suggestions.length) return [];

  const basePos = String((row as any).posNr || "POS").trim() || "POS";
  const now = new Date().toISOString();

  return suggestions.map((s, idx) => {
    const posNr = `${basePos}.${String(idx + 1).padStart(2, "0")}`;
    const preis = s.preis;

    return {
      id: safeId(),
      posNr,
      kurztext: s.kurztext,
      langtext: s.langtext,
      einheit: s.einheit,
      menge: s.menge,
      preis,
      gesamt: round2(s.menge * preis),
      waehrung: "EUR",
      source: "rezept",
      materialCost: round2(preis * 0.45),
      laborCost: round2(preis * 0.25),
      machineCost: round2(preis * 0.15),
      subcontractorCost: 0,
      disposalCost: s.leistungsart === "auskofferung" ? round2(preis * 0.15) : 0,
      overheadCost: round2(preis * 0.08),
      riskCost: round2(preis * 0.03),
      profitCost: round2(preis * 0.04),
      baseUnitPrice: preis,
      suggestedUnitPrice: preis,
      finalUnitPrice: preis,
      riskLevel: "medium",
      calculationStatus: "warning",
      gewerk: "Tiefbau / Straßenbau",
      leistungsart: s.leistungsart,
      bauverfahren: s.kurztext,
      warning: "Automatisch aus zusammengesetzter Position erzeugt. Bitte Menge und EP prüfen.",
      aiReason: "Die ursprüngliche Position enthielt mehrere technische Leistungen. Diese wurden in prüfbare Einzelpositionen aufgeteilt.",
      priceBreakdown: [],
      createdAt: now,
      updatedAt: now,
    } as LVPos;
  }).filter((p) => !existing.some((e) => String(e.posNr || "") === String(p.posNr || "")));
}

type SurfaceFollowUpSuggestion = {
  surface: "asphalt" | "pflaster" | "schotter" | "gruen";
  kurztext: string;
  langtext: string;
  einheit: "m²";
  preis: number;
};

function detectSurfaceFollowUp(row: LVPos | DraftPosition | null): SurfaceFollowUpSuggestion | null {
  const text = normSearch(`${row?.kurztext || ""} ${row?.langtext || ""}`);

  const isTrench =
    text.includes("leitungsgraben") ||
    text.includes("graben herstellen") ||
    text.includes("kabelgraben") ||
    text.includes("rohrgraben") ||
    text.includes("trasse herstellen");

  if (!isTrench) return null;

  const hasSurface =
    text.includes("oberflache") ||
    text.includes("oberfläche") ||
    text.includes("belag") ||
    text.includes("wiederherstellen");

  if (!hasSurface) return null;

  if (text.includes("asphalt")) {
    return {
      surface: "asphalt",
      kurztext: "Asphaltfläche nach Leitungsgraben wiederherstellen",
      langtext:
        "Asphaltfläche nach Leitungsgraben fachgerecht wiederherstellen. Einschließlich Vorbereiten und Reinigen der Anschlusskanten, Herstellen des tragfähigen Untergrundes, Einbau der erforderlichen Asphaltschicht, Verdichtung, höhengerechtem Anschluss an Bestand sowie aller Nebenleistungen. Breite und Schichtaufbau sind projektbezogen zu prüfen.",
      einheit: "m²",
      preis: 65,
    };
  }

  if (text.includes("pflaster") || text.includes("platten") || text.includes("verbundstein")) {
    return {
      surface: "pflaster",
      kurztext: "Pflasterfläche nach Leitungsgraben wiederherstellen",
      langtext:
        "Pflasterfläche nach Leitungsgraben fachgerecht wiederherstellen. Einschließlich Herstellen beziehungsweise Ergänzen der Tragschicht, Splittbett, Verlegen der Pflastersteine, Schneiden und Anpassen, Abrütteln, Verfugen und höhengerechtem Anschluss an Bestand. Breite und vorhandenes Material sind projektbezogen zu prüfen.",
      einheit: "m²",
      preis: 58,
    };
  }

  if (text.includes("schotter") || text.includes("kies") || text.includes("mineralgemisch")) {
    return {
      surface: "schotter",
      kurztext: "Schotterfläche nach Leitungsgraben wiederherstellen",
      langtext:
        "Schotter- beziehungsweise Kiesfläche nach Leitungsgraben fachgerecht wiederherstellen. Einschließlich Liefern und Einbauen geeigneten Materials, profilgerechtem Verteilen, Verdichten und Anschluss an Bestand. Schichtdicke und Körnung sind projektbezogen zu prüfen.",
      einheit: "m²",
      preis: 28,
    };
  }

  if (text.includes("grun") || text.includes("grün") || text.includes("rasen") || text.includes("bankett")) {
    return {
      surface: "gruen",
      kurztext: "Grünfläche nach Leitungsgraben wiederherstellen",
      langtext:
        "Grünfläche beziehungsweise Bankett nach Leitungsgraben fachgerecht wiederherstellen. Einschließlich profilgerechtem Auffüllen, Andecken mit Oberboden, Planieren, Ansaat beziehungsweise Wiederherstellung nach örtlichem Erfordernis.",
      einheit: "m²",
      preis: 12,
    };
  }

  return null;
}

function nextSurfaceFollowUpPosNr(basePosNr: string, existing: LVPos[]): string {
  const base = String(basePosNr || "OW").trim() || "OW";

  for (let i = 1; i <= 20; i++) {
    const candidate = `${base}.OW${i}`;
    if (!existing.some((r) => String(r.posNr || "") === candidate)) return candidate;
  }

  return `${base}.OW${Date.now()}`;
}


function detectSurfaceWidthM(row: LVPos | DraftPosition | null): number {
  const text = normSearch(`${row?.kurztext || ""} ${row?.langtext || ""}`);

  const patterns = [
    /(?:oberflache|oberfläche|belag|wiederherstellung|asphalt|pflaster).*?(?:breite|b)\s*(?:ca\.?\s*)?(\d+(?:[,.]\d+)?)\s*m/,
    /(?:breite|b)\s*(?:ca\.?\s*)?(\d+(?:[,.]\d+)?)\s*m/,
    /(\d+(?:[,.]\d+)?)\s*m\s*(?:breit|breite)/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const width = n(match[1]);
      if (width >= 0.2 && width <= 5) return width;
    }
  }

  if (text.includes("gehweg")) return 0.8;
  if (text.includes("strasse") || text.includes("straße")) return 1.0;
  if (text.includes("asphalt")) return 0.6;
  if (text.includes("pflaster")) return 0.6;
  if (text.includes("schotter") || text.includes("kies")) return 0.7;
  if (text.includes("grun") || text.includes("grün") || text.includes("rasen") || text.includes("bankett")) return 0.8;

  return 0.6;
}

function calcSurfaceFollowUpMenge(row: LVPos | DraftPosition | null): number {
  const length = Math.max(n((row as any)?.menge, 1), 1);
  const unit = String((row as any)?.einheit || "").trim();

  if (unit === "m²") return round2(length);
  if (unit === "m") return round2(length * detectSurfaceWidthM(row));

  return round2(length);
}

function buildSurfaceFollowUpLv(row: LVPos | DraftPosition, existing: LVPos[]): LVPos | null {
  const suggestion = detectSurfaceFollowUp(row as any);
  if (!suggestion) return null;

  const now = new Date().toISOString();
  const menge = calcSurfaceFollowUpMenge(row);
  const preis = suggestion.preis;

  return {
    id: safeId(),
    posNr: nextSurfaceFollowUpPosNr(String((row as any).posNr || ""), existing),
    kurztext: suggestion.kurztext,
    langtext: suggestion.langtext,
    einheit: suggestion.einheit,
    menge,
    preis,
    gesamt: round2(menge * preis),
    waehrung: "EUR",
    source: "rezept",
    materialCost: round2(preis * 0.55),
    laborCost: round2(preis * 0.18),
    machineCost: round2(preis * 0.12),
    subcontractorCost: 0,
    disposalCost: 0,
    overheadCost: round2(preis * 0.08),
    riskCost: round2(preis * 0.03),
    profitCost: round2(preis * 0.04),
    baseUnitPrice: preis,
    suggestedUnitPrice: preis,
    finalUnitPrice: preis,
    riskLevel: "medium",
    calculationStatus: "warning",
    gewerk: suggestion.surface === "asphalt" ? "Straßenbau / Asphaltbau" : "Oberflächenwiederherstellung",
    leistungsart: `oberflaeche_${suggestion.surface}_wiederherstellen`,
    bauverfahren: suggestion.kurztext,
    warning: `Automatisch erkannte Folgeposition. Menge wurde aus Grabenlänge × angenommener Oberflächenbreite ${detectSurfaceWidthM(row)} m berechnet. Bitte prüfen.`,
    aiReason:
      "Die Hauptposition enthält eine Oberfläche im Bereich eines Leitungsgrabens. Deshalb wurde eine separate Wiederherstellungsposition vorgeschlagen.",
    priceBreakdown: [
      {
        id: safeId(),
        group: "Material",
        name: suggestion.kurztext,
        unit: suggestion.einheit,
        qty: 1,
        price: preis,
        total: preis,
        note: "Richtwert für automatische Folgeposition",
      },
    ],
    createdAt: now,
    updatedAt: now,
  } as LVPos;
}

/* ================= EXPORT ================= */

function exportCsv(lines: RecipeLine[], row: LVPos | null, total: number, ep: number) {
  const priceBreakdown = buildPriceBreakdown(lines, row);
  const header = ["Gruppe", "Ressource", "Einheit", "Menge", "Preis", "Gesamt", "Hinweis"];

  const body = lines.map((r) =>
    [r.group, r.name, r.unit, String(r.qty).replace(".", ","), String(r.price).replace(".", ","), String(lineTotal(r)).replace(".", ","), r.note]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(";")
  );

  body.push(["", "", "", "", "Gesamt", String(total).replace(".", ","), ""].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"));
  body.push(["", "", "", "", "EP", String(ep).replace(".", ","), ""].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"));
  body.push(["", "", "", "", "Preisaufbau", breakdownText(priceBreakdown), ""].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"));

  const blob = new Blob([[header.join(";"), ...body].join("\n")], {
    type: "text/csv;charset=utf-8",
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Ressourcen_Kalkulation_${row?.posNr || "Position"}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportPdf(opts: {
  projectTitle: string;
  projectPlace: string;
  row: LVPos | null;
  ctx: ContextValues;
  lines: RecipeLine[];
  total: number;
  ep: number;
}) {
  const { projectTitle, projectPlace, row, ctx, lines, total, ep } = opts;
  const priceBreakdown = buildPriceBreakdown(lines, row);

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 14;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.rect(10, 10, pageW - 20, 277);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text("RLC Bausoftware", marginX, 22);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text("Urkalkulation / Rezeptkalkulation", marginX, 28);

  doc.setDrawColor(203, 213, 225);
  doc.line(marginX, 34, pageW - marginX, 34);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  doc.text("Kalkulationsrezept", marginX, 48);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`Projekt: ${projectTitle}`, marginX, 58, { maxWidth: 130 });
  doc.text(`Datum: ${todayDE()}`, 150, 58);
  if (projectPlace) doc.text(`Ort: ${projectPlace}`, marginX, 65, { maxWidth: 130 });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`Position: ${row?.posNr || "—"} · ${row?.kurztext || "—"}`, marginX, 78, {
    maxWidth: 180,
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Menge: ${num(row?.menge, 3)} ${row?.einheit || ""} · Tiefe: ${ctx.depthM} m · Entfernung: ${ctx.distanceKm} km · Bodenklasse: ${ctx.soilClass}`,
    marginX,
    86
  );

  autoTable(doc, {
    startY: 96,
    margin: { left: marginX, right: marginX },
    theme: "grid",
    head: [["Gruppe", "Ressource", "ME", "Menge", "EP", "Gesamt", "Hinweis"]],
    body: lines.map((r) => [
      r.group,
      r.name,
      r.unit,
      r.unit === "%" ? "" : num(r.qty, 2),
      r.unit === "%" ? `${num(r.price, 2)} %` : money(r.price),
      r.unit === "%" ? "—" : money(lineTotal(r)),
      r.note || "",
    ]),
    styles: {
      font: "helvetica",
      fontSize: 7.8,
      cellPadding: 1.8,
      overflow: "linebreak",
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [239, 246, 255],
      textColor: [30, 58, 138],
      fontStyle: "bold",
    },
  });

  const y1 = (doc as any).lastAutoTable?.finalY + 8 || 180;

  autoTable(doc, {
    startY: y1,
    margin: { left: marginX, right: marginX },
    theme: "grid",
    head: [["Preisaufbau", "Bezeichnung", "ME", "Menge", "Preis", "Gesamt"]],
    body: priceBreakdown.map((r) => [r.group, r.name, r.unit, num(r.qty, 2), money(r.price), money(r.total)]),
    styles: {
      font: "helvetica",
      fontSize: 7.4,
      cellPadding: 1.7,
      overflow: "linebreak",
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [240, 253, 244],
      textColor: [21, 128, 61],
      fontStyle: "bold",
    },
  });

  const y = (doc as any).lastAutoTable?.finalY + 10 || 240;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(115, y, 80, 34, 3, 3, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text("Gesamt netto", 120, y + 9);
  doc.text("EP kalkuliert", 120, y + 18);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(money(total), 190, y + 9, { align: "right" });
  doc.text(money(ep), 190, y + 18, { align: "right" });

  doc.save(`Rezeptkalkulation_${row?.posNr || "Position"}.pdf`);
}

/* ================= COMPONENT ================= */

export default function Recipes() {
  const nav = useNavigate();
  const projectCtx: any = useProject();
  const project = getProject(projectCtx);

  const projectKey = getProjectKey(project);
  const projectTitle = getProjectTitle(project);
  const projectPlace = getProjectPlace(project);

  const libraryImportRef = useRef<HTMLInputElement | null>(null);

  const recipeContext = useMemo<RecipeReturnContext>(() => {
    try {
      const raw = sessionStorage.getItem(RECIPE_CONTEXT_KEY);
      const parsed = JSON.parse(raw || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }, []);

  const [lvRows, setLvRows] = useState<LVPos[]>(() => LV.list());
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [draftPos, setDraftPos] = useState<DraftPosition>(() => makeDefaultDraft());

  const [ctx, setCtx] = useState<ContextValues>({
    depthM: 0,
    distanceKm: 0,
    soilClass: "3",
    restricted: false,
    groundwater: false,
    asphalt: false,
    trafficControl: false,
    dailyOutput: 0,
  });

  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [info, setInfo] = useState("");
  const [companyRecipes, setCompanyRecipes] = useState<CompanyRecipe[]>(() => loadCompanyRecipes());

  const [libraryRows, setLibraryRows] = useState<ExternalLibraryItem[]>(() =>
    loadRecipeLibraryRows()
  );
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryGroupFilter, setLibraryGroupFilter] = useState<ResourceGroup | "Alle">("Alle");

  const selectedRow = useMemo<LVPos>(() => draftToLvPos(draftPos), [draftPos]);

  const resourceOptions = useMemo(() => {
    const libOptions = libraryRows
      .map((item) => {
        const id = libraryResourceId(item);
        const title = libraryTitle(item);
        if (!title) return null;

        return {
          id,
          label: `${libraryGroup(item)} · ${title}`,
          group: libraryGroup(item),
          source: "library" as const,
          item,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      label: string;
      group: ResourceGroup;
      source: "library";
      item: ExternalLibraryItem;
    }>;

    const catalogOptions = RESOURCE_CATALOG.map((item) => ({
      id: item.id,
      label: `${item.group} · ${item.name}`,
      group: item.group,
      source: "catalog" as const,
      item,
    }));

    const used = new Set<string>();
    const out: Array<{
      id: string;
      label: string;
      group: ResourceGroup;
      source: "catalog" | "library";
      item: ResourceItem | ExternalLibraryItem;
    }> = [];

    [...catalogOptions, ...libOptions].forEach((option) => {
      if (used.has(option.id)) return;
      used.add(option.id);
      out.push(option);
    });

    return out;
  }, [libraryRows]);

  const priceBreakdown = useMemo(
    () => buildPriceBreakdown(lines, selectedRow),
    [lines, selectedRow]
  );

  const filteredLv = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lvRows;

    return lvRows.filter((r) =>
      `${r.posNr || ""} ${r.kurztext || ""} ${r.langtext || ""}`.toLowerCase().includes(q)
    );
  }, [lvRows, query]);

  const filteredLibraryRows = useMemo(() => {
    const q = normSearch(libraryQuery || draftPos.kurztext);

    return libraryRows
      .filter((item) => {
        const g = libraryGroup(item);
        if (libraryGroupFilter !== "Alle" && g !== libraryGroupFilter) return false;
        if (!q) return true;

        const hay = normSearch(
          `${libraryCode(item)} ${libraryTitle(item)} ${item.category || ""} ${item.group || ""} ${libraryUnit(item)}`
        );

        return q
          .split(/\s+/)
          .filter(Boolean)
          .every((part) => hay.includes(part));
      })
      .slice(0, 200);
  }, [libraryRows, libraryQuery, libraryGroupFilter, draftPos.kurztext]);

  const summary = useMemo(() => {
    const base = directTotal(lines);
    const surcharge = surchargePercent(lines);
    const total = totalWithSurcharges(lines);
    const ep = unitPrice(total, n(selectedRow.menge));

    return {
      base,
      surcharge,
      total,
      ep,
      gp: round2(n(selectedRow.menge) * ep),
      count: lines.length,
      ai: lines.filter((x) => x.aiSuggested).length,
    };
  }, [lines, selectedRow]);

  const activeAuftragLabel = recipeContext.auftragName
    ? `${recipeContext.auftragType === "unter" ? "Unterauftrag" : "Hauptauftrag"} · ${recipeContext.auftragName}`
    : "Kein Auftrag-Kontext";

  useEffect(() => {
    setInfo(
      recipeContext.auftragName
        ? `Position wird für ${activeAuftragLabel} erstellt.`
        : "Neue Position wird ohne Auftrag-Kontext erstellt."
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshLibrary() {
    const next = loadRecipeLibraryRows();
    setLibraryRows(next);
    setInfo(`Bibliothek aktualisiert: ${next.length.toLocaleString("de-DE")} Einträge.`);
  }

  function importRecipeLibraryFile(file: File | null | undefined) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const result = importRecipeLibraryCsv(String(reader.result || ""));
        const next = loadRecipeLibraryRows();

        setLibraryRows(next);

        const imported = n((result as any)?.imported);
        const merged = n((result as any)?.duplicatesMerged);
        const skipped = n((result as any)?.skipped);
        const total = n((result as any)?.total, next.length);

        setInfo(
          `Bibliothek importiert: ${imported} neu, ${merged} Duplikate zusammengeführt, ${skipped} übersprungen. Gesamt: ${total}.`
        );
      } catch (e: any) {
        alert(`Bibliothek Import fehlgeschlagen: ${e?.message || e}`);
      } finally {
        if (libraryImportRef.current) libraryImportRef.current.value = "";
      }
    };

    reader.readAsText(file, "utf-8");
  }

  function addLibraryItem(item: ExternalLibraryItem) {
    const line = recipeLineFromLibrary(item);
    setLines((prev) => [...prev, line]);
    setInfo(`Bibliotheksposition übernommen: ${line.name}`);
  }

  function resetDraft() {
    setSelectedId("");
    setDraftPos(makeDefaultDraft());
    setLines([]);
    setInfo("Neue Position gestartet.");
  }

  function loadExistingPosition(row: LVPos) {
    setSelectedId(String(row.id || ""));
    setDraftPos(draftFromLv(row));
    setLines([]);
    setLibraryQuery(String(row.kurztext || ""));
    setInfo(`Position ${row.posNr || "—"} als Grundlage geladen.`);
  }

  async function autoFillLangtext() {
    const unit = draftPos.einheit || inferUnitFromText(draftPos.kurztext);
    const draft: DraftPosition = { ...draftPos, einheit: unit };

    if (isAmbiguousSmartDraftHard(draft)) {
      const message =
        "KI gestoppt: Die Position ist zu ungenau. Bitte genauer beschreiben, z. B. Asphalt fräsen, Asphalttragschicht einbauen, Pflaster aufnehmen, Pflaster neu verlegen, Kiestragschicht herstellen, Auffüllung herstellen.";

      setInfo(message);

      dispatchActiveKiSuggestion({
        id: "recipes-ambiguous-position",
        level: "warning",
        title: "Position zu ungenau",
        text:
          `Der Kurztext ist zu allgemein. Ich kann daraus keine sichere Urkalkulation erstellen.

Mögliche gemeinte Leistungen:
• Asphalt fräsen / abtragen
• Asphaltaufbruch aufnehmen und entsorgen
• Asphalttragschicht herstellen
• Asphaltdeckschicht herstellen
• Asphaltfläche wiederherstellen
• Anschlusskanten schneiden
• Asphalt im Leitungsgraben wiederherstellen

Bitte den Kurztext genauer formulieren, z. B. "Asphalt fräsen 4 cm", "Asphalttragschicht AC 32 herstellen" oder "Asphaltfläche nach Leitungsgraben wiederherstellen".`,
        nextLabel: "Kurztext präzisieren",
        action: "focusKurztext",
        autoOpen: false,
        pulse: true,
      });

      try {
        const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          'input[name="kurztext"], textarea[name="kurztext"]'
        );
        el?.focus();
      } catch {
        //
      }

      return;
    }

    const localLangtext =
      buildSmartLocalLangtext(draft, ctx) || suggestLangtextForDraft(draft, ctx);

    let finalLangtext = localLangtext;
    let usedServerKi = false;

    try {
      setInfo("KI-Langtext wird über Server/OpenAI verbessert…");

      const serverLangtext = await tryServerSmartLangtext(draft, ctx, localLangtext);

      if (serverLangtext) {
        finalLangtext = serverLangtext;
        usedServerKi = true;
      }
    } catch {
      //
    }

    setDraftPos({
      ...draft,
      langtext: finalLangtext,
    });

    setInfo(
      usedServerKi
        ? "Langtext wurde über Server-KI fachlich erstellt."
        : "Langtext wurde lokal fachlich erstellt."
    );

    clearActiveKiSuggestion();
  }
  async function kiSuggest() {
    const errors = validateDraft(draftPos);
    if (errors.length) {
      alert(errors.join("\n"));
      return;
    }

    const withText =
      draftPos.langtext.trim().length > 10
        ? draftPos
        : {
            ...draftPos,
            einheit: draftPos.einheit || inferUnitFromText(draftPos.kurztext),
            langtext: suggestLangtextForDraft(draftPos, ctx),
          };

    if (withText !== draftPos) setDraftPos(withText);

    const rowForCalc = draftToLvPos(withText);
    const technicalPosition = detectTechnicalPosition({
      posNr: rowForCalc.posNr,
      kurztext: rowForCalc.kurztext,
      langtext: rowForCalc.langtext,
      einheit: rowForCalc.einheit,
    });

    const detectedWorkType = technicalPosition
      ? {
          key: technicalPosition.workType,
          confidence: 0.99,
          ambiguous: false,
          title: technicalPosition.title,
          message: `Technische Position erkannt: ${technicalPosition.title}`,
        }
      : detectWorkType({
          posNr: rowForCalc.posNr,
          kurztext: rowForCalc.kurztext,
          langtext: rowForCalc.langtext,
          einheit: rowForCalc.einheit,
        });

    if (detectedWorkType.ambiguous || detectedWorkType.key === "unknown") {
      dispatchWorkTypeAmbiguous(detectedWorkType);
      setLines([]);
      setInfo(detectedWorkType.message || "Leistungsart unklar. Bitte Kurztext präzisieren.");
      return;
    }

    setInfo(
      technicalPosition
        ? `Technische Position erkannt: ${technicalPosition.title} · Bibliothek: ${getTechnicalPositionCount()} Positionen`
        : `KI-Urkalkulation wird berechnet: ${detectedWorkType.title}…`
    );

    const forceLocal = !!technicalPosition || shouldForceLocalCalculation(detectedWorkType.key);
    const serverRow = forceLocal ? null : await postKiSuggest(projectKey, rowForCalc);

    if (serverRow?.source === "rule-engine") {
      console.warn("[Recipes KI] Rule-Engine rejected for recipe calculation:", serverRow);
      setInfo(
        "Server-KI hat keine vollständige Urkalkulation geliefert. Es wird automatisch eine lokale professionelle Urkalkulation erstellt."
      );
    } else if (serverRow?.priceBreakdown?.length) {
      const serverLinesRaw = recipeLinesFromServerPriceBreakdown(serverRow);
      const serverLines = cleanRecipeLinesByWorkType(serverLinesRaw, detectedWorkType.key);

      if (serverLines.length) {
        setLines(serverLines);

        setInfo(
          `Server-KI übernommen: ${serverRow.source || "server"} · EP ${money(
            serverRow.finalUnitPrice || serverRow.suggestedUnitPrice
          )} · ${serverLines.length} Urkalkulationszeilen`
        );

        return;
      }
    }

    const signature = textSignature(rowForCalc);
    const saved = companyRecipes.find((r) => r.signature === signature);

    if (saved?.lines?.length) {
      setLines(saved.lines.map((x) => ({ ...x, id: safeId(), aiSuggested: true })));
      setInfo("Gespeicherte Firmen-Rezeptur angewendet und als Urkalkulation übernommen.");
      return;
    }

    const suggested = createKiSuggestion(rowForCalc, ctx);
    setLines(suggested);

    const surfaceFollowUp = detectSurfaceFollowUp(rowForCalc);

    if (surfaceFollowUp) {
      dispatchActiveKiSuggestion({
        id: "recipes-surface-followup",
        level: "info",
        title: "Oberfläche erkannt",
        text: `In der Position wurde eine Oberfläche erkannt. Soll zusätzlich die Folgeposition „${surfaceFollowUp.kurztext}“ erstellt werden?`,
        nextLabel: "Folgeposition erstellen",
        action: "createSurfaceFollowup",
        autoOpen: false,
        pulse: true,
      });

      setInfo(
        `Urkalkulation erstellt. Zusätzlich erkannt: ${surfaceFollowUp.kurztext}. Folgeposition kann automatisch erstellt werden.`
      );
    } else {
      setInfo("Professionelle Urkalkulation lokal erstellt: Ressourcen, Zuschläge, EP und Preisaufbau wurden berechnet.");
    }
  }

  useEffect(() => {
    if (!draftPos.kurztext.trim()) {
      clearActiveKiSuggestion();
      return;
    }

    const compositeSplitReady = detectCompositeSplitSuggestions(selectedRow);

    if (compositeSplitReady.length) {
      dispatchActiveKiSuggestion({
        id: "recipes-composite-split",
        level: "warning",
        title: "Mehrere Leistungen erkannt",
        text: `Diese Position enthält mehrere technische Leistungen. Soll ich daraus ${compositeSplitReady.length} prüfbare Einzelpositionen erstellen?`,
        nextLabel: "Einzelpositionen erstellen",
        action: "createCompositeSplit",
        autoOpen: false,
        pulse: true,
      });
      return;
    }

    if (!draftPos.langtext.trim() || isGenericLangtext(draftPos.langtext)) {
      dispatchActiveKiSuggestion({
        id: "recipes-langtext-generic",
        level: "warning",
        title: "Langtext fachlich verbessern",
        text:
          "Der Langtext ist leer oder noch zu allgemein. Soll ich ihn positionsbezogen aus Kurztext, Einheit, Menge und Ausführungsparametern erzeugen?",
        nextLabel: "Langtext erzeugen",
        action: "generateLongText",
        autoOpen: false,
        pulse: true,
      });
      return;
    }
if (!lines.length) {
      dispatchActiveKiSuggestion({
        id: "recipes-resources-missing",
        level: "warning",
        title: "Urkalkulation fehlt",
        text:
          "Für diese Position fehlen Ressourcen und Preisaufbau. Soll ich Personal, Maschinen, Material, Transport, Zuschläge und EP automatisch vorschlagen?",
        nextLabel: "KI-Ressourcen vorschlagen",
        action: "suggestResources",
        autoOpen: false,
        pulse: true,
      });
      return;
    }

    if (summary.ep <= 0) {
      dispatchActiveKiSuggestion({
        id: "recipes-ep-missing",
        level: "critical",
        title: "EP fehlt",
        text:
          "Die Ressourcen sind vorhanden, aber der Einheitspreis ist noch 0. Soll ich Zuschläge und Preisaufbau neu berechnen?",
        nextLabel: "EP berechnen",
        action: "calculatePriceBuildUp",
        autoOpen: false,
        pulse: true,
      });
      return;
    }

    const surfaceFollowUpReady = detectSurfaceFollowUp(selectedRow);

    if (surfaceFollowUpReady) {
      dispatchActiveKiSuggestion({
        id: "recipes-surface-followup",
        level: "info",
        title: "Oberfläche erkannt",
        text: `In der Position wurde eine Oberfläche erkannt. Soll zusätzlich die Folgeposition „${surfaceFollowUpReady.kurztext}“ erstellt werden?`,
        nextLabel: "Folgeposition erstellen",
        action: "createSurfaceFollowup",
        autoOpen: false,
        pulse: true,
      });
      return;
    }

    dispatchActiveKiSuggestion({
      id: "recipes-ready",
      level: "success",
      title: "Position bereit",
      text:
        "Langtext, Ressourcen und EP sind vorhanden. Nächster sinnvoller Schritt: Position ins LV speichern oder als Nachtrag/Angebot weitergeben.",
      nextLabel: "Position übernehmen",
      action: "insertPosition",
      autoOpen: false,
      pulse: false,
    });
  }, [draftPos.kurztext, draftPos.langtext, draftPos.einheit, draftPos.menge, lines, summary.ep]);
  function addLine(group: ResourceGroup) {
    const first = RESOURCE_CATALOG.find((x) => x.group === group);
    setLines((prev) => [
      ...prev,
      {
        id: safeId(),
        group,
        resourceId: first?.id || "",
        name: first?.name || "",
        unit: first?.unit || "St",
        qty: 1,
        price: first?.defaultPrice || 0,
        note: "",
        aiSuggested: false,
      },
    ]);
  }

  function updateLine(id: string, patch: Partial<RecipeLine>) {
    setLines((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        let next = { ...r, ...patch };

        if (patch.resourceId !== undefined) {
          if (!patch.resourceId) return { ...next, resourceId: "" };

          if (patch.resourceId.startsWith("LIB-")) {
            const libItem = libraryRows.find((item) => libraryResourceId(item) === patch.resourceId);
            if (libItem) {
              const libLine = recipeLineFromLibrary(libItem);
              next = { ...next, ...libLine, id: r.id };
            }
          } else {
            const item = RESOURCE_CATALOG.find((x) => x.id === patch.resourceId);
            if (item) {
              next = {
                ...next,
                group: item.group,
                name: item.name,
                unit: item.unit,
                price: item.defaultPrice,
              };
            }
          }
        }

        return next;
      })
    );
  }

  function deleteLine(id: string) {
    setLines((prev) => prev.filter((r) => r.id !== id));
  }

  function saveAsCompanyRecipe() {
    const errors = validateDraft(draftPos);
    if (errors.length || !lines.length) {
      alert([...errors, !lines.length ? "Keine Ressourcen vorhanden." : ""].filter(Boolean).join("\n"));
      return;
    }

    const signature = textSignature(selectedRow);
    const now = new Date().toISOString();

    const recipe: CompanyRecipe = {
      id: safeId(),
      signature,
      title: selectedRow.kurztext || signature,
      sourcePosNr: selectedRow.posNr || "",
      sourceText: `${selectedRow.kurztext || ""} ${selectedRow.langtext || ""}`,
      unit: selectedRow.einheit || "",
      createdAt: now,
      updatedAt: now,
      lines,
    };

    const next = [recipe, ...companyRecipes.filter((r) => r.signature !== signature)];
    setCompanyRecipes(next);
    saveCompanyRecipes(next);
    setInfo("Firmen-Rezeptur gespeichert.");
  }

  function makeLvPayload() {
    const errors = validateDraft(draftPos);
    if (errors.length) {
      alert(errors.join("\n"));
      return null;
    }

    if (!lines.length) {
      alert("Bitte zuerst Ressourcen / Urkalkulation erfassen.");
      return null;
    }

    const menge = Math.max(n(draftPos.menge), 1);
    const totals = recipeCostTotals(lines, menge);
    const pb = buildPriceBreakdown(lines, selectedRow);
    const now = new Date().toISOString();
    const id = draftPos.id || safeId();

    const riskLevel: "low" | "medium" | "high" =
      ctx.groundwater || ctx.restricted || ctx.trafficControl || ctx.soilClass === "6" || ctx.soilClass === "7"
        ? "high"
        : "medium";

    const warning = riskLevel === "high" ? "Erschwerte Bedingungen aus Rezept erkannt." : "";

    const payload = {
      ...selectedRow,
      id,
      auftragId: recipeContext.auftragId || "",
      auftragName: recipeContext.auftragName || "",
      auftragType: recipeContext.auftragType || "",
      posNr: draftPos.posNr,
      kurztext: draftPos.kurztext,
      langtext: draftPos.langtext || suggestLangtextForDraft(draftPos, ctx),
      einheit: draftPos.einheit,
      menge,
      preis: summary.ep,
      gesamt: round2(menge * summary.ep),
      waehrung: "EUR",
      materialCost: totals.materialCost,
      laborCost: totals.laborCost,
      machineCost: totals.machineCost,
      subcontractorCost: totals.subcontractorCost,
      disposalCost: totals.disposalCost,
      transportCost: totals.transportCost,
      overheadCost: totals.overheadCost,
      riskCost: totals.riskCost,
      profitCost: totals.profitCost,
      baseUnitPrice: summary.ep,
      suggestedUnitPrice: summary.ep,
      finalUnitPrice: summary.ep,
      riskLevel,
      calculationStatus: "ok",
      gewerk: inferGewerk(selectedRow),
      leistungsart: textSignature(selectedRow),
      bauverfahren: inferBauverfahren(selectedRow, ctx),
      warning,
      aiReason: `Aus Ressourcen-Rezept übernommen.\n\nPreisaufbau:\n${breakdownText(pb)}`,
      priceBreakdown: pb,
      source: "recipe",
      createdAt: selectedRow.createdAt || now,
      updatedAt: now,
    } as any;

    return { payload, totals, pb, riskLevel, warning };
  }

  function saveCurrentToDatenbank() {
    const made = makeLvPayload();
    if (!made) return 0;

    const { payload, totals, pb, riskLevel, warning } = made;

    KalkulationsDatenbank.upsert(
      KalkulationsDatenbank.fromCalculatedPosition({
        quelle: "rezept",
        projektCode: projectKey,
        projektName: projectTitle,
        posNr: payload.posNr || "",
        kurztext: payload.kurztext || "",
        langtext: payload.langtext || "",
        einheit: payload.einheit || "",
        menge: n(payload.menge),
        materialCost: totals.materialCost,
        laborCost: totals.laborCost,
        machineCost: totals.machineCost,
        subcontractorCost: totals.subcontractorCost,
        disposalCost: totals.disposalCost,
        transportCost: totals.transportCost,
        overheadCost: totals.overheadCost,
        riskCost: totals.riskCost,
        profitCost: totals.profitCost,
        finalUnitPrice: n(payload.preis),
        totalNet: round2(n(payload.menge) * n(payload.preis)),
        gewerk: inferGewerk(payload),
        leistungsart: textSignature(payload),
        bauverfahren: inferBauverfahren(payload, ctx),
        riskLevel,
        confidence: 0.9,
        aiReason: `Aus professioneller Rezept- und Ressourcen-Kalkulation übernommen.\n\nPreisaufbau:\n${breakdownText(pb)}`,
        warning,
      })
    );

    setInfo("Position wurde in der Kalkulationsdatenbank gespeichert.");
    return 1;
  }

  function applyToLv() {
    const made = makeLvPayload();
    if (!made) return null;

    LV.upsert(made.payload as LVPos);
    saveCurrentToDatenbank();

    const next = LV.list();
    setLvRows(next);
    setDraftPos(draftFromLv(made.payload as LVPos));
    setSelectedId(String(made.payload.id || ""));
    setInfo("Position wurde vollständig mit Urkalkulation ins LV übernommen.");

    return made.payload as LVPos;
  }

  function createCompositeSplitPositions() {
    const existing = LV.list();
    const rows = buildCompositeSplitLvRows(selectedRow, existing);

    if (!rows.length) {
      setInfo("Keine zusammengesetzte Position erkannt oder Einzelpositionen sind bereits vorhanden.");
      return;
    }

    rows.forEach((r) => LV.upsert(r));
    setLvRows(LV.list());
    setInfo(`Zusammengesetzte Position aufgeteilt: ${rows.length} Einzelposition(en) erstellt.`);
  }

  function createSurfaceFollowUpPosition() {
    const existing = LV.list();
    const followUp = buildSurfaceFollowUpLv(selectedRow, existing);

    if (!followUp) {
      setInfo("Keine passende Oberflächen-Folgeposition erkannt.");
      return;
    }

    LV.upsert(followUp);
    setLvRows(LV.list());
    setInfo(`Folgeposition erstellt: ${followUp.posNr} · ${followUp.kurztext}.`);
  }

  function saveForHandoff() {
    const made = makeLvPayload();
    if (!made) return false;
    LV.upsert(made.payload as LVPos);
    saveCurrentToDatenbank();
    setLvRows(LV.list());
    return true;
  }

  function savePayloadForNavigation() {
    const made = makeLvPayload();
    if (!made) return null;
    LV.upsert(made.payload as LVPos);
    saveCurrentToDatenbank();
    setLvRows(LV.list());
    return made.payload as LVPos & any;
  }

  function pushToKi() {
    const ok = saveForHandoff();
    if (!ok) return;
    nav(recipeContext.returnTo || "/kalkulation/mit-ki?from=rezepte");
  }

  function pushToManuell() {
    const ok = saveForHandoff();
    if (!ok) return;
    nav("/kalkulation/manuell?from=rezepte");
  }

  function pushToAngebot() {
    const payload = savePayloadForNavigation();
    if (!payload) return;
    nav("/kalkulation/angebot?from=rezepte");
  }

  function pushToNachtrag() {
    const payload = savePayloadForNavigation();
    if (!payload) return;
    localStorage.setItem(
      NACHTRAG_BUFFER_KEY,
      JSON.stringify({
        projectId: projectKey,
        projectKey,
        createdAt: Date.now(),
        source: "REZEPTE",
        rows: [{
          pos: payload.posNr || "",
          posNr: payload.posNr || "",
          kurztext: payload.kurztext || "",
          title: payload.kurztext || "",
          langtext: payload.langtext || "",
          einheit: payload.einheit || "m",
          unit: payload.einheit || "m",
          qty: n(payload.menge),
          mengeDelta: n(payload.menge),
          preis: n(payload.preis),
          begruendung: "Aus Urkalkulation / Rezeptkalkulation als Nachtrag übernommen.",
          note: "Aus Urkalkulation / Rezeptkalkulation als Nachtrag übernommen.",
          regieRowId: payload.id || safeId(),
          date: new Date().toISOString(),
        }],
      })
    );
    nav("/kalkulation/nachtraege?from=rezepte");
  }

  function openModule(path: string) {
    if (path === "/kalkulation/nachtraege") return pushToNachtrag();
    if (path === "/kalkulation/angebot") return pushToAngebot();
    if (lines.length && !saveForHandoff()) return;
    nav(path);
  }
  useEffect(() => {
    function handleRezepteCommand(event: Event) {
      const detail = (event as CustomEvent<{ action?: string }>).detail;
      const action = String(detail?.action || "").trim();

      if (!action) return;

      if (action === "newPosition") return resetDraft();

      if (action === "suggestResources" || action === "calculatePriceBuildUp") {
        void kiSuggest();
        return;
      }

      if (action === "createCompositeSplit") {
        createCompositeSplitPositions();
        return;
      }

      if (action === "createSurfaceFollowup") {
        createSurfaceFollowUpPosition();
        return;
      }

      if (action === "generateLongText") {
        void autoFillLangtext();
        return;
      }

      if (action === "insertPosition") {
        applyToLv();
        return;
      }
    }

    window.addEventListener("rlc:rezepte-command", handleRezepteCommand);
    return () => window.removeEventListener("rlc:rezepte-command", handleRezepteCommand);
  }, [draftPos, lines, selectedRow, summary.ep, companyRecipes, libraryRows]);
  const validationErrors = validateDraft(draftPos);

  return (
    <div style={page}>
      <input
        ref={libraryImportRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={(e) => importRecipeLibraryFile(e.target.files?.[0])}
      />

      <section style={heroCard}>
        <div>
          <div style={eyebrow}>RLC Urkalkulation</div>
          <h1 style={title}>Neue Position mit Urkalkulation</h1>
          <p style={subtitle}>
            Position vollständig erfassen, Ressourcen kalkulieren, EP/GP automatisch bilden und mit Preisaufbau an KI, Nachträge, Angebot und GAEB übergeben.
          </p>
        </div>

        <div style={heroActions}>
          <button type="button" style={btnSecondary} onClick={resetDraft}>
            Neue Position
          </button>

          <button type="button" style={btnPrimary} onClick={kiSuggest}>
            KI-Ressourcen vorschlagen
          </button>

          <button type="button" style={btnSecondary} onClick={autoFillLangtext}>
            Langtext automatisch
          </button>

          <button type="button" style={btnSecondary} onClick={applyToLv} disabled={!lines.length}>
            Position ins LV speichern
          </button>

          <button type="button" style={btnPrimary} onClick={pushToKi} disabled={!lines.length}>
            In Kalkulation übernehmen
          </button>
        </div>

        <div style={heroMeta}>
          Projekt: <b>{projectTitle}</b> · Auftrag: <b>{activeAuftragLabel}</b> · Bibliothek:{" "}
          <b>{libraryRows.length.toLocaleString("de-DE")}</b>
          {info ? <span> · {info}</span> : null}
        </div>
      </section>

      <section style={grid5}>
        <KpiCard label="Direkte Kosten" value={money(summary.base)} />
        <KpiCard label="Zuschläge" value={`${num(summary.surcharge, 1)} %`} />
        <KpiCard label="EP kalkuliert" value={money(summary.ep)} sub={`${summary.count} Ressourcen`} />
        <KpiCard label="Menge" value={`${num(draftPos.menge, 3)} ${draftPos.einheit}`} />
        <KpiCard label="GP kalkuliert" value={money(summary.gp)} />
      </section>

      <section style={quickNavCard}>
        <div>
          <h2 style={sectionTitle}>Weiterverarbeitung</h2>
          <div style={sectionText}>
            Nach dem Erfassen der Position kann sie direkt in die weiteren Kalkulationsmodule übernommen werden.
          </div>
        </div>

        <div style={buttonRowNoTop}>
          <button type="button" style={btnSecondary} onClick={() => openModule("/kalkulation/lv-import")}>
            LV / Positionen
          </button>
          <button type="button" style={btnSecondary} onClick={() => openModule("/kalkulation/nachtraege")}>
            Nachtrag erstellen
          </button>
          <button type="button" style={btnSecondary} onClick={() => openModule("/kalkulation/angebot")}>
            Angebot / Export
          </button>
          <button type="button" style={btnSecondary} onClick={() => openModule("/kalkulation/gaeb")}>
            GAEB
          </button>
        </div>
      </section>

      <section style={layout}>
        <aside style={leftCard}>
          <div style={sectionHead}>
            <div>
              <h2 style={sectionTitle}>LV als Vorlage</h2>
              <div style={sectionText}>Bestehende Position laden oder neue Position frei erfassen.</div>
            </div>
          </div>

          <button type="button" style={{ ...btnPrimary, width: "100%", marginBottom: 10 }} onClick={resetDraft}>
            + Neue Position
          </button>

          <input
            style={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suche PosNr / Text…"
          />

          <div style={lvList}>
            {filteredLv.map((r) => {
              const active = String(r.id) === selectedId;

              return (
                <button
                  key={r.id}
                  type="button"
                  style={{ ...lvItem, ...(active ? lvItemActive : {}) }}
                  onClick={() => loadExistingPosition(r)}
                >
                  <b>{r.posNr || "—"}</b>
                  <span>{r.kurztext || "Ohne Kurztext"}</span>
                  <small>
                    {num(r.menge, 3)} {r.einheit || ""}
                  </small>
                </button>
              );
            })}

            {!filteredLv.length ? <div style={emptyState}>Kein LV vorhanden.</div> : null}
          </div>
        </aside>

        <main style={mainStack}>
          <section style={card}>
            <div style={sectionHead}>
              <div>
                <h2 style={sectionTitle}>1. Positionsdaten</h2>
                <div style={sectionText}>Hier wird die komplette LV-Position erfasst.</div>
              </div>

              {validationErrors.length ? (
                <div style={warningPill}>{validationErrors.length} Pflichtfeld(er) offen</div>
              ) : (
                <div style={okPill}>Positionsdaten vollständig</div>
              )}
            </div>

            <div style={formGrid}>
              <Field label="Positionsnummer">
                <input
                  style={input}
                  value={draftPos.posNr}
                  onChange={(e) => setDraftPos({ ...draftPos, posNr: e.target.value })}
                  placeholder="z.B. 01.0010"
                />
              </Field>

              <Field label="Einheit">
                <select
                  style={input}
                  value={draftPos.einheit}
                  onChange={(e) => setDraftPos({ ...draftPos, einheit: e.target.value })}
                >
                  <option value="m">m</option>
                  <option value="m²">m²</option>
                  <option value="m³">m³</option>
                  <option value="St">St</option>
                  <option value="t">t</option>
                  <option value="h">h</option>
                  <option value="pauschal">pauschal</option>
                </select>
              </Field>

              <Field label="Menge">
                <input
                  type="number"
                  step="0.001"
                  style={input}
                  value={draftPos.menge}
                  onChange={(e) => setDraftPos({ ...draftPos, menge: n(e.target.value) })}
                />
              </Field>
            </div>

            <div style={{ marginTop: 12 }}>
              <Field label="Kurztext">
                <input
                  style={input}
                  value={draftPos.kurztext}
                  onChange={(e) => {
                    const kurztext = e.target.value;
                    setDraftPos({
                      ...draftPos,
                      kurztext,
                      einheit: draftPos.einheit || inferUnitFromText(kurztext),
                    });
                    setLibraryQuery(kurztext);
                  }}
                  placeholder="z.B. Frostschutzkies 0/32 einbauen, Rasengitterstein verlegen, Tiefbord setzen"
                />
              </Field>
            </div>

            <div style={{ marginTop: 12 }}>
              <Field label="Langtext">
                <textarea
                  style={{ ...input, minHeight: 120, lineHeight: 1.5 }}
                  value={draftPos.langtext}
                  onChange={(e) => setDraftPos({ ...draftPos, langtext: e.target.value })}
                  placeholder="Ausführliche Leistungsbeschreibung, Nebenleistungen, Abrechnung, technische Anforderungen..."
                />
              </Field>

              <button type="button" style={{ ...btnSecondary, marginTop: 8 }} onClick={autoFillLangtext}>
                Langtext automatisch erstellen
              </button>
            </div>
          </section>

          <section style={card}>
            <div style={sectionHead}>
              <div>
                <h2 style={sectionTitle}>2. Parameter der Ausführung</h2>
                <div style={sectionText}>Diese Werte beeinflussen Personal, Maschinen, Transport, Material, Zeit und Risiko.</div>
              </div>
            </div>

            <div style={formGrid}>
              <Field label="Grabentiefe / Tiefe m">
                <input type="number" step="0.1" style={input} value={ctx.depthM} onChange={(e) => setCtx({ ...ctx, depthM: n(e.target.value) })} />
              </Field>

              <Field label="Entfernung Baustelle km">
                <input type="number" step="1" style={input} value={ctx.distanceKm} onChange={(e) => setCtx({ ...ctx, distanceKm: n(e.target.value) })} />
              </Field>

              <Field label="Bodenklasse">
                <select style={input} value={ctx.soilClass} onChange={(e) => setCtx({ ...ctx, soilClass: e.target.value })}>
                  <option value="1">BK 1</option>
                  <option value="2">BK 2</option>
                  <option value="3">BK 3</option>
                  <option value="4">BK 4</option>
                  <option value="5">BK 5</option>
                  <option value="6">BK 6</option>
                  <option value="7">BK 7</option>
                </select>
              </Field>

              <Field label="Leistung pro Tag">
                <input type="number" step="1" style={input} value={ctx.dailyOutput} onChange={(e) => setCtx({ ...ctx, dailyOutput: n(e.target.value) })} />
              </Field>
            </div>

            <div style={buttonRow}>
              <label style={checkLabel}>
                <input type="checkbox" checked={ctx.restricted} onChange={(e) => setCtx({ ...ctx, restricted: e.target.checked })} />
                eingeschränkter Arbeitsraum
              </label>

              <label style={checkLabel}>
                <input type="checkbox" checked={ctx.groundwater} onChange={(e) => setCtx({ ...ctx, groundwater: e.target.checked })} />
                Grundwasser
              </label>

              <label style={checkLabel}>
                <input type="checkbox" checked={ctx.asphalt} onChange={(e) => setCtx({ ...ctx, asphalt: e.target.checked })} />
                Asphalt betroffen
              </label>

              <label style={checkLabel}>
                <input type="checkbox" checked={ctx.trafficControl} onChange={(e) => setCtx({ ...ctx, trafficControl: e.target.checked })} />
                Verkehrssicherung
              </label>
            </div>
          </section>

          <section style={card}>
            <div style={sectionHead}>
              <div>
                <h2 style={sectionTitle}>3. Importierte Bibliothek / Preise</h2>
                <div style={sectionText}>
                  CSV-Bibliothek durchsuchen und echte Artikel/Positionen direkt in die Urkalkulation übernehmen.
                </div>
              </div>

              <div style={buttonRowNoTop}>
                <button type="button" style={btnSecondary} onClick={() => libraryImportRef.current?.click()}>
                  CSV importieren
                </button>
                <button type="button" style={btnSecondary} onClick={refreshLibrary}>
                  Aktualisieren
                </button>
              </div>
            </div>

            <div style={libraryFilterGrid}>
              <input
                style={input}
                value={libraryQuery}
                onChange={(e) => setLibraryQuery(e.target.value)}
                placeholder="Bibliothek suchen: Frostschutz, Rasengitter, Bordstein, LKW..."
              />

              <select
                style={input}
                value={libraryGroupFilter}
                onChange={(e) => setLibraryGroupFilter(e.target.value as ResourceGroup | "Alle")}
              >
                <option value="Alle">Alle Gruppen</option>
                {GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div style={libraryList}>
              {filteredLibraryRows.map((item, idx) => (
                <button
                  key={`${libraryCode(item) || idx}-${libraryTitle(item)}`}
                  type="button"
                  style={libraryItem}
                  onClick={() => addLibraryItem(item)}
                >
                  <b>{libraryCode(item) || "—"} · {libraryTitle(item) || "Ohne Text"}</b>
                  <span>
                    {libraryGroup(item)} · {libraryUnit(item)} · {money(libraryPrice(item))}
                  </span>
                </button>
              ))}

              {!filteredLibraryRows.length ? (
                <div style={emptyCell}>
                  Keine Bibliothekstreffer. Importiere zuerst eine CSV oder ändere die Suche.
                </div>
              ) : null}
            </div>
          </section>

          <section style={card}>
            <div style={sectionHead}>
              <div>
                <h2 style={sectionTitle}>4. Urkalkulation / Ressourcen</h2>
                <div style={sectionText}>Personal, Geräte, Material, Transport, Entsorgung und Zuschläge bilden den EP.</div>
              </div>
            </div>

            <div style={addGroupRow}>
              {GROUPS.map((g) => (
                <button key={g} type="button" style={btnSecondary} onClick={() => addLine(g)}>
                  + {g}
                </button>
              ))}
            </div>

            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Gruppe</th>
                    <th style={th}>Ressource</th>
                    <th style={th}>ME</th>
                    <th style={thRight}>Menge</th>
                    <th style={thRight}>Preis</th>
                    <th style={thRight}>Gesamt</th>
                    <th style={th}>Hinweis</th>
                    <th style={th}>Aktion</th>
                  </tr>
                </thead>

                <tbody>
                  {lines.map((line) => {
                    const hasKnownOption = resourceOptions.some((x) => x.id === line.resourceId);

                    return (
                      <tr key={line.id}>
                        <td style={td}>
                          <span style={groupBadge(line.group)}>{line.group}</span>
                        </td>

                        <td style={td}>
                          <select
                            style={cellInput}
                            value={line.resourceId || ""}
                            onChange={(e) => updateLine(line.id, { resourceId: e.target.value })}
                          >
                            {!line.resourceId ? (
                              <option value="">
                                {line.name ? `Manuell · ${line.name}` : "Manuell"}
                              </option>
                            ) : null}

                            {line.resourceId && !hasKnownOption ? (
                              <option value={line.resourceId}>
                                {line.resourceId.startsWith("LIB-")
                                  ? `Bibliothek · ${line.name || line.resourceId}`
                                  : line.name || line.resourceId}
                              </option>
                            ) : null}

                            <option value="">Manuell</option>

                            <optgroup label="Standard-Ressourcen">
                              {RESOURCE_CATALOG.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.group} · {r.name}
                                </option>
                              ))}
                            </optgroup>

                            {libraryRows.length ? (
                              <optgroup label="Importierte Bibliothek">
                                {resourceOptions
                                  .filter((option) => option.source === "library")
                                  .slice(0, 1000)
                                  .map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.label}
                                    </option>
                                  ))}
                              </optgroup>
                            ) : null}
                          </select>

                          {(!line.resourceId || line.resourceId.startsWith("LIB-")) ? (
                            <input
                              style={{ ...cellInput, marginTop: 6 }}
                              value={line.name}
                              onChange={(e) => updateLine(line.id, { name: e.target.value })}
                              placeholder="Eigene Ressource"
                            />
                          ) : null}
                        </td>

                        <td style={td}>
                          <input style={{ ...cellInput, width: 80 }} value={line.unit} onChange={(e) => updateLine(line.id, { unit: e.target.value })} />
                        </td>

                        <td style={tdRight}>
                          <input
                            type="number"
                            style={{ ...cellInput, width: 90, textAlign: "right" }}
                            value={line.qty}
                            onChange={(e) => updateLine(line.id, { qty: n(e.target.value) })}
                            disabled={line.unit === "%"}
                          />
                        </td>

                        <td style={tdRight}>
                          <input
                            type="number"
                            style={{ ...cellInput, width: 95, textAlign: "right" }}
                            value={line.price}
                            onChange={(e) => updateLine(line.id, { price: n(e.target.value) })}
                          />
                        </td>

                        <td style={tdRight}>
                          <b>{line.unit === "%" ? "—" : money(lineTotal(line))}</b>
                        </td>

                        <td style={td}>
                          <input style={cellInput} value={line.note} onChange={(e) => updateLine(line.id, { note: e.target.value })} placeholder="Hinweis" />
                        </td>

                        <td style={td}>
                          <button type="button" style={btnDangerMini} onClick={() => deleteLine(line.id)}>
                            Löschen
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {!lines.length ? (
                    <tr>
                      <td colSpan={8} style={emptyCell}>
                        Noch keine Ressourcen. Erfasse die Positionsdaten und klicke auf „KI-Ressourcen vorschlagen“ oder übernimm Artikel aus der Bibliothek.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section style={card}>
            <div style={sectionHead}>
              <div>
                <h2 style={sectionTitle}>5. Preisaufbau für KI-Kalkulation</h2>
                <div style={sectionText}>Diese Struktur wird in die Kalkulation mit KI übernommen.</div>
              </div>
            </div>

            <div style={tableWrap}>
              <table style={{ ...table, minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={th}>Gruppe</th>
                    <th style={th}>Bezeichnung</th>
                    <th style={th}>ME</th>
                    <th style={thRight}>Menge je Einheit</th>
                    <th style={thRight}>Preis</th>
                    <th style={thRight}>EP-Anteil</th>
                    <th style={th}>Hinweis</th>
                  </tr>
                </thead>

                <tbody>
                  {priceBreakdown.map((line) => (
                    <tr key={line.id}>
                      <td style={td}>{line.group}</td>
                      <td style={td}>{line.name}</td>
                      <td style={td}>{line.unit}</td>
                      <td style={tdRight}>{num(line.qty, 3)}</td>
                      <td style={tdRight}>{money(line.price)}</td>
                      <td style={tdRight}>
                        <b>{money(line.total)}</b>
                      </td>
                      <td style={td}>{line.note || ""}</td>
                    </tr>
                  ))}

                  {!priceBreakdown.length ? (
                    <tr>
                      <td colSpan={7} style={emptyCell}>
                        Noch kein Preisaufbau vorhanden.
                      </td>
                    </tr>
                  ) : null}

                  {priceBreakdown.length ? (
                    <tr>
                      <td colSpan={5} style={{ ...tdRight, fontWeight: 900 }}>
                        Summe EP
                      </td>
                      <td style={{ ...tdRight, fontWeight: 900 }}>{money(summary.ep)}</td>
                      <td style={td}></td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </section>
    </div>
  );
}

/* ================= UI ================= */

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function groupBadge(group: ResourceGroup): React.CSSProperties {
  if (group === "Personal") return badgeBlue;
  if (group === "Maschinen") return badgeOrange;
  if (group === "LKW / Transport") return badgePurple;
  if (group === "Material") return badgeGreen;
  if (group === "Entsorgung") return badgeRed;
  if (group === "Fremdleistung") return badgePurple;
  if (group === "Gemeinkosten") return badgeNeutral;
  if (group === "Risiko") return badgeWarn;
  if (group === "Gewinn") return badgeGreen;
  if (group === "Zeit / Leistung") return badgeNeutral;
  return badgeWarn;
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
  maxWidth: 1040,
  opacity: 0.9,
  lineHeight: 1.55,
};

const heroActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const heroMeta: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.92,
};

const grid5: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
  gap: 12,
};

const quickNavCard: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #DBEAFE",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
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

const layout: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "360px minmax(0,1fr)",
  gap: 16,
  alignItems: "start",
};

const leftCard: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  position: "sticky",
  top: 12,
};

const mainStack: React.CSSProperties = {
  display: "grid",
  gap: 16,
  minWidth: 0,
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
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
  lineHeight: 1.45,
};

const input: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 11px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
  background: "#FFFFFF",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 800,
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
  gap: 12,
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 12,
};

const buttonRowNoTop: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const checkLabel: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  fontSize: 13,
  color: "#0F172A",
  fontWeight: 700,
};

const lvList: React.CSSProperties = {
  display: "grid",
  gap: 8,
  marginTop: 12,
  maxHeight: "68vh",
  overflow: "auto",
};

const lvItem: React.CSSProperties = {
  display: "grid",
  gap: 4,
  textAlign: "left",
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  borderRadius: 12,
  padding: 10,
  cursor: "pointer",
  color: "#0F172A",
};

const lvItemActive: React.CSSProperties = {
  borderColor: "#2563EB",
  background: "#EFF6FF",
};

const addGroupRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 12,
};

const tableWrap: React.CSSProperties = {
  overflow: "auto",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
};

const table: React.CSSProperties = {
  width: "100%",
  minWidth: 1180,
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

const thRight: React.CSSProperties = {
  ...th,
  textAlign: "right",
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

const cellInput: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
  width: "100%",
  boxSizing: "border-box",
  background: "#FFFFFF",
};

const emptyCell: React.CSSProperties = {
  padding: 16,
  color: "#64748B",
  fontSize: 13,
};

const emptyState: React.CSSProperties = {
  border: "1px dashed #CBD5E1",
  background: "#F8FAFC",
  borderRadius: 12,
  padding: 14,
  color: "#64748B",
  fontSize: 13,
};

const warningPill: React.CSSProperties = {
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
  color: "#B45309",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 900,
};

const okPill: React.CSSProperties = {
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#15803D",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 900,
};

const libraryFilterGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) 220px",
  gap: 10,
  marginBottom: 10,
};

const libraryList: React.CSSProperties = {
  display: "grid",
  gap: 8,
  maxHeight: 310,
  overflow: "auto",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: 8,
  background: "#F8FAFC",
};

const libraryItem: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  borderRadius: 10,
  padding: 10,
  display: "grid",
  gap: 4,
  textAlign: "left",
  cursor: "pointer",
  color: "#0F172A",
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

const badgeBlue: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#1D4ED8",
};

const badgeOrange: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #FED7AA",
  background: "#FFF7ED",
  color: "#C2410C",
};

const badgePurple: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #DDD6FE",
  background: "#F5F3FF",
  color: "#6D28D9",
};

const badgeGreen: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#15803D",
};

const badgeRed: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
};

const badgeWarn: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
  color: "#B45309",
};
















































































