import { mapAutonomousResultToKiRow } from "../kalkulation/autonomous/rlcAutonomousKalkulator";
import { learnCompanyRecipeFromKiRow } from "../kalkulation/companyRecipeLearning";
import { getBaupreisIndexFactor } from "../kalkulation/priceIndex/baupreisIndexService";
import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { filterUsableRlcPriceSources } from "../kalkulation/quality/priceSourceQualityGate";
import { rlcPreisRangeForText, findRlcPreisItems } from "../kalkulation/rlcPreisBibliothek";
import { calcRecipeKalkulationRow } from "../kalkulation/kalkulationsRecipeEngine";
import { annotateExistingCalculation } from "../kalkulation/constructionIntelligenceEngine";
import { resolveRlcAutonomousCalculation, previewRlcMotorV3 } from "../kalkulation/rlcMotor";
import { runRlcGenerativeKalkulation } from "../kalkulation/generative/rlcGenerativeKalkulation";
import { enrichRlcCalculationPipeline } from "../kalkulation/pipeline/rlcCalculationPipeline";
import { resolveRlcKnowledgeHub } from "../kalkulation/knowledgeHub";
import * as ciFs from "node:fs";
import * as ciPath from "node:path";
import { COMPANIES_ROOT } from "../lib/companiesRoot";
import { completeRlcAiText, completeRlcMarketReviewWithWeb } from "../services/ai/rlcAiGateway";
import { requireProjectMember } from "../middleware/guards";
import { z } from "zod";

const router = Router();
const v3PreviewSchema = z.object({
 projectCode: z.string().min(1).max(128),
 position: z.object({id:z.string().min(1).max(128),position:z.string().min(1).max(128),unit:z.string().min(1).max(24),quantity:z.union([z.number(),z.string().max(40)])}),
 recipe: z.object({id:z.string().min(1).max(128),gaebPosition:z.string().min(1).max(128),components:z.array(z.object({type:z.enum(["material","labour","equipment","transport","disposal"]),quantityPerUnit:z.number().finite().nullable(),rateEUR:z.number().finite().nullable(),evidenceId:z.string().max(256).nullable().optional(),approved:z.boolean().optional()})).max(100),productivity:z.object({quantityPerHour:z.number().finite().nullable(),evidenceId:z.string().max(256).nullable().optional(),approved:z.boolean().optional()}).optional()})
});
/** Authenticated, project-scoped; client cannot grant cost evidence approval. */
router.post("/v3/resource-preview",requireMarketReviewAccess,requireOptionalKalkulationProjectAccess,(req,res)=>{
 const parsed=v3PreviewSchema.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({ok:false,error:"INVALID_V3_PREVIEW_INPUT"});
 try {
  const {position,recipe}=parsed.data;
  const result=previewRlcMotorV3(position,recipe as any);
  return res.json({ok:true,preview:result,evidenceStatus:"client_data_unverified",writeAllowed:false});
 }catch{return res.status(400).json({ok:false,error:"V3_RECIPE_POSITION_MISMATCH"});}
});


function marketRole(req: any): string {
  return String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
}

function requireMarketReviewAccess(req: any, res: any, next: any) {
  if (!["ADMIN", "ADMINISTRATOR", "KALKULATOR"].includes(marketRole(req))) {
    return res.status(403).json({ ok: false, error: "MARKET_REVIEW_FORBIDDEN" });
  }
  return next();
}

function requireMarketCreditOrderWrite(req: any, res: any, next: any) {
  if (!["ADMIN", "ADMINISTRATOR"].includes(marketRole(req))) {
    return res.status(403).json({ ok: false, error: "MARKET_CREDIT_ORDER_FORBIDDEN" });
  }
  return next();
}

const requireOptionalMarketProjectAccess = async (req: any, res: any, next: any) => {
  const token = String(req.body?.projectId || "").trim();
  if (!token) return next();
  req.params = req.params || {};
  req.params.__marketProject = token;
  return requireProjectMember("__marketProject")(req, res, (err?: any) => {
    if (err) return next(err);
    req.body.projectId = String(req.resolvedProjectId || token).trim();
    return next();
  });
};

async function requireOptionalKalkulationProjectAccess(req:any,res:any,next:any) {
  const token = String(req.body?.projectCode || req.body?.projectKey || "").trim();
  if (!token) return next();
  req.params = req.params || {};
  req.params.__kalkulationProject = token;
  return requireProjectMember("__kalkulationProject")(req,res,(err?:any)=>{
    if(err) return next(err);
    const id = String(req.resolvedProjectId || "").trim();
    const code = String(req.resolvedProjectCode || "").trim();
    if(id) req.body.projectKey=id;
    if(code) req.body.projectCode=code;
    return next();
  });
};

const requireKiProjectPathAccess = async (req:any,res:any,next:any) => {
  return requireProjectMember("projectKey")(req,res,(err?:any)=>{
    if(err) return next(err);
    req.params.projectKey = String(req.resolvedProjectId || req.params.projectKey || "").trim();
    return next();
  });
};


function appendAiPrivacyAudit(companyId: string, event: any) {
  try {
    const cid = String(companyId || "").trim();
    if (!cid) return;
    const dir = ciPath.join(COMPANIES_ROOT, cid, "privacy-compliance");
    ciFs.mkdirSync(dir, { recursive: true });
    const file = ciPath.join(dir, "ai-processing-audit.json");
    let rows: any[] = [];
    try {
      if (ciFs.existsSync(file)) {
        const parsed = JSON.parse(ciFs.readFileSync(file, "utf8"));
        if (Array.isArray(parsed)) rows = parsed;
      }
    } catch {}
    rows.push({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      provider: String(event?.provider || "unknown"),
      model: String(event?.model || "unknown"),
      purpose: String(event?.purpose || "kalkulation"),
      feature: String(event?.feature || "KALKULATION_KI"),
      projectCode: String(event?.projectCode || "") || null,
      positionId: String(event?.positionId || "") || null,
      inputTokens: Math.max(0, Number(event?.inputTokens || 0)),
      outputTokens: Math.max(0, Number(event?.outputTokens || 0)),
      totalTokens: Math.max(0, Number(event?.totalTokens || 0)),
      fallbackUsed: event?.fallbackUsed === true,
      contentStored: false,
    });
    if (rows.length > 10_000) rows = rows.slice(rows.length - 10_000);
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    ciFs.writeFileSync(tmp, JSON.stringify(rows, null, 2), "utf8");
    ciFs.renameSync(tmp, file);
  } catch (error) {
    console.error("[RLC-KI][privacy-audit]", error);
  }
}

type RiskLevel = "low" | "medium" | "high";
type CalcStatus = "ok" | "warning" | "critical" | "manual";

type InputRow = {
  id?: string;
  posNr?: string;
  kurztext?: string;
  langtext?: string;
  einheit?: string;
  menge?: number;
  preis?: number;
};

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
  note: string;
};

type DbMatch = {
  row: any;
  score: number;
  reasons: string[];
};

type CalcSource = "database" | "recipe" | "technical-parser" | "openai" | "rule-engine";

function qualityGateStatusOf(db: any): string {
  return s((db?.parameters as any)?.qualityGateStatus);
}

function isDbEntryBlockedByQualityGate(db: any): boolean {
  const status = qualityGateStatusOf(db);
  return status === "Gesperrt" || status === "Nicht verwenden";
}

function qualityGateScoreBonus(db: any): number {
  const status = qualityGateStatusOf(db);

  if (status === "Freigegeben") return 35;
  if (status === "Geprüft") return 24;
  if (status === "KI-Vorschlag") return 4;

  return 0;
}

function qualityGateWeightFactor(db: any): number {
  const status = qualityGateStatusOf(db);

  if (status === "Freigegeben") return 3.0;
  if (status === "Geprüft") return 2.0;
  if (status === "KI-Vorschlag") return 0.65;

  return 1.0;
}

function isApprovedDbMatch(match: DbMatch): boolean {
  const status = qualityGateStatusOf(match.row);
  return status === "Freigegeben" || status === "Geprüft";
}


function companyIdFromReq(req: Express.Request): string {
  return String(
    (req.auth as any)?.companyId ||
      (req.auth as any)?.company ||
      (req.user as any)?.companyId ||
      (req.user as any)?.company ||
      (req as any)?.company?.id ||
      (process.env.NODE_ENV !== "production" && (process.env.DEV_AUTH || "").toLowerCase() === "on" ? process.env.DEV_COMPANY_ID : "") ||
      ""
  ).trim();
}

function s(value: any): string {
  return String(value ?? "").trim();
}

function n(value: any, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;

  const raw = String(value).trim();
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/\s/g, "");

  const x = typeof value === "number" ? value : Number(normalized);
  return Number.isFinite(x) ? x : fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cleanRlcSourceFlags(sourceRaw: any): string {
  return Array.from(
    new Set(
      String(sourceRaw || "rlc-ki-autonomous")
        .split("+")
        .map((x) => x.trim())
        .filter(Boolean)
    )
  ).join("+") || "rlc-ki-autonomous";
}


function cleanRlcWarningText(warningRaw: any): string {
  const parts = String(warningRaw || "")
    .split(" · ")
    .map((x) => x.trim())
    .filter(Boolean);

  return Array.from(new Set(parts)).join(" · ");
}

export function reconcileFinalPriceEvidence(row: any): any {
  if (!row || typeof row !== "object") return row;

  const breakdown = Array.isArray(row.priceBreakdown) ? row.priceBreakdown : [];
  const breakdownEp = round2(
    breakdown.reduce((sum: number, line: any) => sum + n(line?.total), 0)
  );
  const finalEp = round2(
    n(row.rlcKiUnitPrice) ||
    n(row.finalUnitPrice) ||
    n(row.unitPrice) ||
    n(row.preis) ||
    n(row.suggestedUnitPrice)
  );

  if (!(breakdownEp > 0) || !(finalEp > 0)) return row;

  const deltaPct = round2(
    Math.abs(finalEp - breakdownEp) / Math.max(Math.abs(finalEp), Math.abs(breakdownEp), 0.01) * 100
  );

  if (deltaPct > 2) return row;

  const evidenceText = `${s(row.warning)} ${s(row.aiReason)}`;
  if (!/RLC Price-Evidence-Gate/i.test(evidenceText)) return row;

  const hasIndependentReviewGuard =
    /Family-Mismatch-Guard|No-X84 Outlier-Guard|Plausibilitätsstopp|Kleinteile\/Zulagen-Guard|Angebotsbasis-Guard|company-calibration-blocked|RLC Block\+Recalculate/i.test(evidenceText);

  if (hasIndependentReviewGuard) {
    return {
      ...row,
      priceEvidenceStatus: "breakdown-consistent",
      priceEvidenceFinalEp: finalEp,
      priceEvidenceBreakdownEp: breakdownEp,
      priceEvidenceDeltaPct: deltaPct,
    };
  }

  const nativeRisk = riskFromText(
    `${s(row.kurztext)} ${s(row.langtext)}`,
    s(row.einheit),
    n(row.menge)
  );
  const sourceRaw = s(row.source);
  const confidenceSource: CalcSource =
    sourceRaw.includes("database") ? "database" :
    sourceRaw.includes("openai") ? "openai" :
    "rule-engine";
  const restoredConfidence = confidenceFrom(row as InputRow, nativeRisk, [], confidenceSource);

  const cleanedWarning = cleanRlcWarningText(
    s(row.warning)
      .split(" · ")
      .filter((part) => !/RLC Price-Evidence-Gate/i.test(part))
      .join(" · ")
  );

  const cleanedReason = s(row.aiReason)
    .split(/\n\n+/)
    .filter((part) => !/RLC Price-Evidence-Gate/i.test(part))
    .join("\n\n");

  return {
    ...row,
    priceEvidenceStatus: "breakdown-consistent",
    priceEvidenceFinalEp: finalEp,
    priceEvidenceBreakdownEp: breakdownEp,
    priceEvidenceDeltaPct: deltaPct,
    riskLevel: nativeRisk,
    confidence: restoredConfidence,
    calculationStatus: nativeRisk === "high" ? "needs_review" : "ok",
    warning: cleanedWarning,
    aiReason: [
      cleanedReason,
      `RLC Price-Evidence-Recheck FINAL: EP ${finalEp} EUR = Preisaufbau ${breakdownEp} EUR (${deltaPct} % Abweichung). Alter Price-Evidence-Downgrade entfernt.`
    ].filter(Boolean).join("\n\n"),
  };
}

export function cleanRlcOutputRow(row: any): any {
  if (!row || typeof row !== "object") {
    return row;
  }

  return {
    ...row,
    source: cleanRlcSourceFlags(row.source),
    warning: cleanRlcWarningText(row.warning),
  };
}


function norm(value: any): string {
  return s(value).toLowerCase();
}

function safeId(prefix = "pb"): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function tokenize(value: any): string[] {
  return Array.from(
    new Set(
      norm(value)
        .replace(/[.,;:()[\]{}]/g, " ")
        .split(/\s+/)
        .map((x) => x.trim())
        .filter((x) => x.length >= 3)
    )
  );
}

function detectGewerk(text: string): string {
  const t = norm(text);

  if (
    t.includes("rohr") ||
    t.includes("leitung") ||
    t.includes("speedpipe") ||
    t.includes("kabel")
  ) {
    return "Tiefbau / Leitungsbau";
  }

  if (
    t.includes("aushub") ||
    t.includes("graben") ||
    t.includes("boden") ||
    t.includes("verfüll")
  ) {
    return "Tiefbau / Erdarbeiten";
  }

  if (t.includes("asphalt") || t.includes("pflaster") || t.includes("decke")) {
    return "Straßenbau / Oberfläche";
  }

  if (t.includes("beton") || t.includes("schalung") || t.includes("bewehrung")) {
    return "Rohbau / Betonbau";
  }

  return "Allgemein";
}

function detectLeistungsart(text: string): string {
  const t = norm(text);

  if (t.includes("liefern") && t.includes("verlegen")) return "Liefern und Einbauen";
  if (t.includes("liefern")) return "Lieferleistung";
  if (t.includes("verlegen") || t.includes("einbauen")) return "Einbauleistung";
  if (t.includes("aushub") || t.includes("abtrag")) return "Erdbewegung";
  if (t.includes("abfuhr") || t.includes("entsorgung")) return "Transport / Entsorgung";
  if (t.includes("asphalt")) return "Oberflächenwiederherstellung";
  if (t.includes("schacht")) return "Schachtbau / Bauwerk";
  if (t.includes("vermessen") || t.includes("aufmaß")) return "Vermessung / Dokumentation";

  return "Sonstige Leistung";
}

function detectBauverfahren(text: string, unit: string): string {
  const t = norm(text);

  if (t.includes("aushub")) return "Baggeraushub mit Laden / ggf. Abtransport";
  if (t.includes("verfüll")) return "Einbau lagenweise mit Verdichtung";
  if (t.includes("speedpipe")) return "Speedpipe-Verlegung im Leitungsgraben";
  if (t.includes("kabelschutz")) return "Kabelschutzrohr liefern und verlegen";
  if (t.includes("rohr")) return "Rohrleitung liefern/verlegen";
  if (t.includes("asphalt")) return "Asphaltaufbruch und Wiederherstellung";
  if (t.includes("pflaster")) return "Pflaster aufnehmen, lagern und wiederherstellen";
  if (t.includes("schacht")) return "Schacht setzen, ausrichten und anschließen";

  if (unit === "m") return "Längenbezogene Ausführung";
  if (unit === "m²") return "Flächenbezogene Ausführung";
  if (unit === "m³") return "Volumenbezogene Ausführung";

  return "Standard-Ausführung";
}

function normUnit(value: any): string {
  const u = norm(value);
  if (u === "m2" || u === "m^2" || u === "qm") return "m²";
  if (u === "m3" || u === "m^3" || u === "cbm") return "m³";
  if (u === "stk" || u === "stck" || u === "stück" || u === "stueck") return "St";
  return s(value);
}


function isContextSensitivePosition(textRaw: any, unitRaw: any): boolean {
  const text = norm(textRaw);
  
  // RLC FIX:
  // Kabelverlegung darf nicht als Dokumentation/Vermessung context-sensitive eingestuft werden,
  // nur weil im Langtext "Dokumentation" als Nebenleistung vorkommt.
  if (isRlcCableInstallationText(text)) {
    return false;
  }

  const unit = normUnit(unitRaw);

  if (
    unit === "Psch" &&
    /(baustell|einrichtung|vorhaltung|verkehrssicherung|bestands|vermess|erschwernis|dokumentation|bauleitung|koordination|bauzeiten|pauschal|notleitung|temporär|temporaer|medienversorgung|ersatzversorgung|anschluss an bestand|druckprüfung|druckpruefung|absperrarmatur|formstück|formstueck|entsorgung|deponie|belasteter boden|belastet|haufwerk|analytik|deklarationsanalytik|laga|ersatzbaustoffv|wiegeschein|entsorgungsnachweis|dichtheitsprüfung|dichtheitspruefung|druckprüfung|druckpruefung|spülung|spuelung|tv-inspektion|kamerabefahrung|prüfprotokoll|pruefprotokoll|abnahmeunterlagen|bestandsfreigabe|funktionsprüfung|funktionspruefung|schutzmaßnahme|schutzmassnahme|lärmschutz|laermschutz|staubschutz|erschütterungsschutz|erschuetterungsschutz|baumschutz|wurzelschutz|gewässerschutz|gewaesserschutz|ölbindemittel|oelbindemittel|havarie|anwohnerinformation|beweissicherung|zustandsdokumentation|umweltschutz|naturschutz|baustellenlogistik|baustellenzufahrt|zufahrtssicherung|lagerfläche|lagerflaeche|zwischenlager|materialumschlag|baustrom|baustellenbeleuchtung|stromprovisorium|baustellenwasser|spezialgeräte|spezialgeraete|mietverlängerung|mietverlaengerung|genehmigung|genehmigungen|behörde|behoerde|behörden|behoerden|auflage|auflagen|verkehrsrechtliche anordnung|sigeko|sige ko|arbeitssicherheit|sicherheitskonzept|sicherheitsbeauftragter|denkmalpflege|archäologisch|archaeologisch|kampfmittel|sondierung|freigabe|freigaben|spezialtiefbau|baugrubenverbau|spundwand|bohrpfahl|unterfangung|wasserhaltung|bodenverbesserung|hdi|injektion|pressung|microtunneling|rohrvortrieb|vortrieb|pressanlage|bohrgerät|bohrgeraet|injektionsanlage|hausanschluss|hausanschlüsse|hausanschluesse|kernbohrung|wanddurchführung|wanddurchfuehrung|hauseinführung|hauseinfuehrung|gebäudeeinführung|gebaeudeeinfuehrung|innenhof|privatgrund|privatfläche|privatflaeche|eigentümer|eigentuemer|handschachtung|wiederherstellung.*privat|arbeiten am bestand|bestand)/i.test(text)
  ) {
    return true;
  }

  return /(baustelleneinrichtung|baustelle einrichten|baustellengemeinkosten|vorhaltung|gerätevorhaltung|geraetevorhaltung|verkehrssicherung|bestandspläne|bestandsplaene|bestandszeichnung|vermessung|erschwernis|beengte bauweise|bauleitung|baustellenkoordination|dokumentation|wartungs- und bedienungsanleitung|bauzeiten|anliegerverkehr|besucherinformation|bauschild|besprechungsraum|notleitung|temporärer anschluss|temporaerer anschluss|temporäre anschlüsse|temporaere anschluesse|provisorische leitung|medienversorgung|ersatzversorgung|anschluss an bestand|druckprüfung|druckpruefung|absperrarmatur|formstück|formstueck|entsorgung|deponie|belasteter boden|belastet|haufwerk|analytik|deklarationsanalytik|laga|ersatzbaustoffv|wiegeschein|entsorgungsnachweis|dichtheitsprüfung|dichtheitspruefung|druckprüfung|druckpruefung|spülung|spuelung|tv-inspektion|kamerabefahrung|prüfprotokoll|pruefprotokoll|abnahmeunterlagen|bestandsfreigabe|funktionsprüfung|funktionspruefung|schutzmaßnahme|schutzmassnahme|lärmschutz|laermschutz|staubschutz|erschütterungsschutz|erschuetterungsschutz|baumschutz|wurzelschutz|gewässerschutz|gewaesserschutz|ölbindemittel|oelbindemittel|havarie|anwohnerinformation|beweissicherung|zustandsdokumentation|umweltschutz|naturschutz|baustellenlogistik|baustellenzufahrt|zufahrtssicherung|lagerfläche|lagerflaeche|zwischenlager|materialumschlag|baustrom|baustellenbeleuchtung|stromprovisorium|baustellenwasser|spezialgeräte|spezialgeraete|mietverlängerung|mietverlaengerung|genehmigung|genehmigungen|behörde|behoerde|behörden|behoerden|auflage|auflagen|verkehrsrechtliche anordnung|sigeko|sige ko|arbeitssicherheit|sicherheitskonzept|sicherheitsbeauftragter|denkmalpflege|archäologisch|archaeologisch|kampfmittel|sondierung|freigabe|freigaben|spezialtiefbau|baugrubenverbau|spundwand|bohrpfahl|unterfangung|wasserhaltung|bodenverbesserung|hdi|injektion|pressung|microtunneling|rohrvortrieb|vortrieb|pressanlage|bohrgerät|bohrgeraet|injektionsanlage|hausanschluss|hausanschlüsse|hausanschluesse|kernbohrung|wanddurchführung|wanddurchfuehrung|hauseinführung|hauseinfuehrung|gebäudeeinführung|gebaeudeeinfuehrung|innenhof|privatgrund|privatfläche|privatflaeche|eigentümer|eigentuemer|handschachtung|wiederherstellung.*privat|arbeiten am bestand|bestand)/i.test(text);
}


function rlcNoX84Norm(v: any): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

function applyNoX84LinearPriceGuard(input: {
  textRaw: any;
  unitRaw: any;
  mengeRaw: any;
  epRaw: any;
  hasRealX84?: boolean;
}): { applied: boolean; ep: number; warning: string } {
  /*
   * A text-pattern cap is not a price source. It must never overwrite an EP.
   * Exact prices need a compatible company source or a traceable Urkalkulation.
   */
  const originalEp = Number(input.epRaw || 0);
  return { applied: false, ep: originalEp, warning: "" };

  const text = rlcNoX84Norm(input.textRaw);
  const unit = rlcNoX84Norm(input.unitRaw);
  const menge = Number(input.mengeRaw || 0);
  const ep = Number(input.epRaw || 0);

  if (input.hasRealX84 || !Number.isFinite(ep) || ep <= 0 || menge <= 20) {
    return { applied: false, ep, warning: "" };
  }

  const isMeter = /^(m|lfm|laufmeter|laufende meter|meter)$/.test(unit);
  const isVolume = /^(m3|m³|cbm|kubikmeter)$/.test(unit);

  let cap = 0;
  let reason = "";

  if (
    isMeter &&
    /hausanschlussleitung|verlegung hausanschlussleitung|hausanschluss.*leitung|anschlussleitung/.test(text) &&
    !/kernbohrung|hauseinfuehrung|gebaeudeeinfuehrung|wanddurchfuehrung/.test(text)
  ) {
    cap = 11.4;
    reason = "Hausanschlussleitung als lineare Leitungsverlegung";
  } else if (isMeter && /kabelschutzrohr/.test(text)) {
    cap = 30;
    reason = "Kabelschutzrohr ohne eindeutige Komplettleistung";
  } else if (isMeter && /lwl.*miko|lwl.*mikro|miko-kabel|mikrokabel|miko kabel|12 fasern/.test(text)) {
    cap = 10;
    reason = "LWL/Mikro-Kabel linearer Meteransatz";
  } else if (isMeter && /(mikrokabelleerrohrverbund|mikrokabelleerrohr|mikrokabel.*leerrohr)/.test(text)) {
    cap = 10;
    reason = "Mikrokabelleerrohrverbund linearer Meteransatz";
  } else if (isMeter && /(schutzmatte.*kabelverleg|kabelverleg.*schutzmatte)/.test(text)) {
    cap = 10;
    reason = "Schutzmatte Kabelverlegung linearer Meteransatz";
  } else if (isMeter && /(verlegung.*mittelspannungskabel|mittelspannungskabel|verlegung.*ortsnetzkabel|ortsnetzkabel)/.test(text)) {
    cap = 32;
    reason = "Kabelverlegung ohne Tiefbau-Komplettpaket";
  } else if (isMeter && /zwischenplanum/.test(text)) {
    cap = 20;
    reason = "Zwischenplanum linearer Ansatz";
  } else if (isMeter && /drainageleitung|drainageleitungen/.test(text)) {
    cap = 28;
    reason = "Drainageleitung linearer Meteransatz";
  }

  if (
    isVolume &&
    /zuschlag.*rohrgrabenaushub.*(bd-kl\.?\s*6|bkl\.?\s*6|bodenklasse\s*6|klasse\s*6|homogenbereich\s*b4|homogenbreich\s*b4)/.test(text)
  ) {
    cap = 31.9;
    reason = "Zuschlag Rohrgrabenaushub Bodenklasse 6 / Homogenbereich B4";
  }

  if (
    unit === "cm" &&
    /(mehr- oder minderpreis|mehr.*minderpreis)/.test(text)
  ) {
    cap = 25;
    reason = "Mehr-/Minderpreis cm ohne X84-Basis";
  }

  if (cap > 0 && ep > cap) {
    return {
      applied: true,
      ep: cap,
      warning: `RLC No-X84 Preisguard: ${reason}; EP von ${ep.toFixed(2)} auf ${cap.toFixed(2)} €/Einheit plausibilisiert. Ohne X84 bleibt Position prüfpflichtig.`,
    };
  }

  return { applied: false, ep, warning: "" };
}


function isRlcCableInstallationText(textRaw: any): boolean {
  const text = norm(textRaw);
  return /(mittelspannungskabel|ortsnetzkabel|niederspannungskabel|stromkabel|energiekabel|kabelverlegung|verlegung.*kabel|kabel.*verleg|erdkabel|kabelgraben)/i.test(text);
}

function contextSensitiveWarning(textRaw: any): string {
  const text = norm(textRaw);

  if (/(kampfmittel|kampfmittelsondierung|altlast|altlasten|bodenkontamination|bodenklasse unbekannt|bodenanalyse|gutachter|sicherheitsfreigabe|beweissicherung|zustandsaufnahme|rissprotokoll|baubegleitende kontrolle|bodenrisiko|bodenrisiken)/i.test(text)) {
    return "Kontextabhängige Position: Kampfmittel/Altlasten/Bodenrisiken/Beweissicherung hängt stark von Verdachtslage, Sondierungsumfang, Bodenklasse, Analytik, Gutachter, Sicherheitsfreigabe, baubegleitender Kontrolle, Dokumentation und Haftungsrisiko ab. Historische Preise nur als Orientierung verwenden.";
  }

  if (/(wasserhaltung|grundwasserabsenkung|baugrubenentwässerung|baugrubenentwaesserung|pumpensumpf|pumpenanlage|filterbrunnen|drainage|wasserableitung|einleitgenehmigung|dauerbetrieb|pumpenwartung|notstrom|ausfallsicherung|grundwasserhaltung)/i.test(text)) {
    return "Kontextabhängige Position: Wasserhaltung/Grundwasser/Pumpen/Baugrubenentwässerung hängt stark von Dauer, Grundwasserandrang, Pumpentechnik, Filterbrunnen, Ableitung, Einleitgenehmigung, Wartung, Notstrom, Ausfallsicherung und Rückbau ab. Historische Preise nur als Orientierung verwenden.";
  }

  if (/(dokumentation|fotodokumentation|aufmaß|aufmass|massenermittlung|vermessung|vermessungsdaten|gnss|tachymeter|bestandsplan|bestandspläne|bestandsplaene|bestandszeichnung|cad|as-built|as built|dwg|dxf|landxml|übergabeunterlagen|uebergabeunterlagen|nachweisführung|nachweisfuehrung)/i.test(text)) {
    return "Kontextabhängige Position: Dokumentation/Vermessung/Bestandspläne/As-Built hängt stark von Projektumfang, Bauzeit, Vermessungsterminen, GNSS-/Tachymeteraufnahmen, CAD-Nachbearbeitung, Datenformaten, Übergabeunterlagen, Auftraggeberabstimmung und digitaler Nachweisführung ab. Historische Preise nur als Orientierung verwenden.";
  }

  if (/(spezialtiefbau|baugrubenverbau|spundwand|bohrpfahl|unterfangung|bodenverbesserung|hdi|injektion|pressung|microtunneling|rohrvortrieb|vortrieb|pressanlage|bohrgerät|bohrgeraet|injektionsanlage|hausanschluss|hausanschlüsse|hausanschluesse|kernbohrung|wanddurchführung|wanddurchfuehrung|hauseinführung|hauseinfuehrung|gebäudeeinführung|gebaeudeeinfuehrung|innenhof|privatgrund|privatfläche|privatflaeche|eigentümer|eigentuemer|handschachtung|wiederherstellung.*privat|arbeiten am bestand|bestand)/i.test(text)) {
    return "Kontextabhängige Position: Spezialtiefbau/schwierige Bauverfahren hängt stark von Bauverfahren, Baugrund, Verbau, Wasserhaltung, Spezialgeräten, Vortrieb, Pressung, Platzverhältnissen, Risiken, Dokumentation und Rückbau ab. Historische Preise nur als Orientierung verwenden.";
  }

  if (/(verkehrssicherung|verkehrsfuehrung|verkehrsführung|rsa|beschilderung|absperrung|sperrung|umleitung|lichtsignalanlage|ampel|baustellenampel|verkehrszeichen|leitbaken|fußgängerführung|fussgängerführung|fussgaengerfuehrung|anwohnerverkehr)/i.test(text)) {
    return "Kontextabhängige Position: Verkehrssicherung/RSA/Umleitung/Beschilderung hängt stark von Bauzeit, Verkehrsführung, verkehrsrechtlicher Anordnung, Beschilderung, Absperrmaterial, Lichtsignalanlage, täglicher Kontrolle, Wartung, Anpassung, Anwohnerverkehr, Aufbau, Vorhaltung und Rückbau ab. Historische Preise nur als Orientierung verwenden.";
  }

  if (/(genehmigung|genehmigungen|behörde|behoerde|behörden|behoerden|auflage|auflagen|verkehrsrechtliche anordnung|sigeko|sige ko|arbeitssicherheit|sicherheitskonzept|sicherheitsbeauftragter|denkmalpflege|archäologisch|archaeologisch|kampfmittel|sondierung|freigabe|freigaben)/i.test(text)) {
    return "Kontextabhängige Position: Behörden/Genehmigungen/Auflagen/Sicherheit hängt stark von Laufzeit, Auflagen, Terminen, Fachstellen, verkehrsrechtlicher Anordnung, SiGeKo, Kampfmittel, Denkmalpflege, Freigaben und Dokumentationspflichten ab. Historische Preise nur als Orientierung verwenden.";
  }

  if (/(baustelleneinrichtung|baustelle einrichten|vorhaltung|baustellengemeinkosten|bürocontainer|buero container|büro container|buero-container|büro-container|mannschaftscontainer|sanitärcontainer|sanitaercontainer|containeranlage|baustrom|bauwasser|baustellenbeleuchtung)/i.test(text)) {
    return "Kontextabhängige Position: Baustelleneinrichtung/Vorhaltung/Container/Baustrom/Bauwasser hängt stark von Bauzeit, Containeranzahl, Miete, Aufbau, Betrieb, Reinigung, Wartung, Baustrom, Bauwasser, Beleuchtung, Zufahrt, Entfernung, Kontrolle, Rückbau und Gemeinkosten ab. Historische Preise nur als Orientierung verwenden.";
  }

  if (/(baustellenlogistik|baustellenzufahrt|zufahrtssicherung|lagerfläche|lagerflaeche|zwischenlager|materialumschlag|spezialgeräte|spezialgeraete|mietverlängerung|mietverlaengerung)/i.test(text)) {
    return "Kontextabhängige Position: Baustellenlogistik/Zufahrt/Lager/Versorgung hängt stark von Bauzeit, Zufahrt, Lagerflächen, Gerätemiete, Betrieb, Kontrolle, Rückbau und Logistik ab. Historische Preise nur als Orientierung verwenden.";
  }

  if (/(schutzmaßnahme|schutzmassnahme|lärmschutz|laermschutz|staubschutz|erschütterungsschutz|erschuetterungsschutz|baumschutz|wurzelschutz|gewässerschutz|gewaesserschutz|ölbindemittel|oelbindemittel|havarie|anwohnerinformation|beweissicherung|zustandsdokumentation|umweltschutz|naturschutz)/i.test(text)) {
    return "Kontextabhängige Position: Schutzmaßnahmen/Umwelt/Natur/Anwohner hängen stark von Bauzeit, Auflagen, Schutzumfang, Kontrollintervallen, Dokumentation, Rückbau, Risiken und örtlichen Bedingungen ab. Historische Preise nur als Orientierung verwenden.";
  }

  if (/(baustelleneinrichtung|baustelle einrichten|vorhaltung|baustellengemeinkosten)/i.test(text)) {
    return "Kontextabhängige Position: Baustelleneinrichtung/Vorhaltung muss über Dauer, Entfernung, Personal, Geräte, Container, Logistik und Gemeinkosten urkalkuliert werden. Historische Datenbankpreise dürfen nur als Vergleich dienen.";
  }

  if (/(verkehrssicherung|erschwernis|beengte bauweise|bauzeiten|anliegerverkehr)/i.test(text)) {
    return "Kontextabhängige Position: Preis hängt stark von Bauzeit, Verkehrsführung, Platzverhältnissen, Auflagen und Bauablauf ab. Historische Preise nur als Orientierung verwenden.";
  }

  if (/(bestandspläne|bestandsplaene|bestandszeichnung|vermessung|dokumentation|wartungs- und bedienungsanleitung)/i.test(text)) {
    return "Kontextabhängige Position: Dokumentation/Vermessung hängt von Projektumfang, Laufzeit, Datenformaten, Behördenanforderungen und Nachbearbeitung ab. Historische Preise nur als Vergleich verwenden.";
  }

  return "Kontextabhängige Position: Preis muss aus Projektparametern urkalkuliert werden. Datenbankpreis nur als historischer Vergleich.";
}

function contextSensitiveAiHint(textRaw: any, unitRaw: any): string {
  if (!isContextSensitivePosition(textRaw, unitRaw)) return "";

  return `
WICHTIG - kontextabhängige Position:
- Diese Position ist baustellenabhängig.
- Verwende Datenbankpreise NICHT blind als direkten EP.
- Historische Preise dienen nur als Vergleich.
- Kalkuliere über Urkalkulation mit Dauer, Entfernung, Personal, Geräten, Logistik, Gemeinkosten, Risiko und Gewinn.
- Wenn Dauer/Entfernung/Projektgröße fehlen, gib eine Warnung und konservative prüfpflichtige Kalkulation aus.
`;
}


function lightSurfaceRange(text: string, unitRaw: string): { min: number; avg: number; max: number; label: string } {
  const t = norm(text);
  const u = normUnit(unitRaw);

  if (u !== "m²") return { min: 0, avg: 0, max: 0, label: "" };

  if (
    t.includes("unterlage reinigen") ||
    t.includes("untergrund reinigen") ||
    t.includes("fläche reinigen") ||
    t.includes("flaeche reinigen")
  ) {
    return { min: 0.15, avg: 0.45, max: 2.5, label: "Unterlage reinigen" };
  }

  if (
    t.includes("schichtenverbund") ||
    t.includes("haftkleber") ||
    t.includes("bitumenemulsion")
  ) {
    return { min: 0.35, avg: 0.85, max: 2.5, label: "Schichtenverbund" };
  }

  if (
    t.includes("einfräsen") ||
    t.includes("einfraesen") ||
    t.includes("abfräsen") ||
    t.includes("abfraesen") ||
    t.includes("fräsen") ||
    t.includes("fraesen")
  ) {
    return { min: 2, avg: 4.5, max: 9, label: "Asphalt fräsen" };
  }

  if (
    t.includes("ac 11 ds") ||
    t.includes("ads aus ac 11") ||
    t.includes("asphaltdeckschicht") ||
    t.includes("deckschicht")
  ) {
    return { min: 10, avg: 18, max: 32, label: "Asphaltdeckschicht" };
  }

  if (
    t.includes("zulage") &&
    (t.includes("mehr") || t.includes("minder")) &&
    (t.includes("stärke") || t.includes("staerke"))
  ) {
    return { min: 1, avg: 4.5, max: 12, label: "Asphalt Mehr-/Minderstärke" };
  }

  if (t.includes("planie")) {
    return { min: 2, avg: 5, max: 10, label: "Planie" };
  }

  return { min: 0, avg: 0, max: 0, label: "" };
}

function basePrice(text: string, unit: string): number {
  const t = norm(text);
  const u = normUnit(unit);

  const light = lightSurfaceRange(text, unit);
  if (light.avg > 0) return light.avg;

  if (t.includes("aushub") && u === "m³") return 18.5;
  if (t.includes("abfuhr") && (u === "t" || u === "m³")) return 24;
  if (t.includes("verfüll") && u === "m³") return 28;
  if (t.includes("kies") && u === "m³") return 38;
  if (t.includes("speedpipe") && u === "m") return 8.5;
  if (t.includes("kabelschutzrohr") && u === "m") return 18.5;
  if (t.includes("rohr") && u === "m") return 26;
  if (t.includes("pflaster") && u === "m²") return 39;
  if (t.includes("asphalt") && u === "m²") return 18;
  if (t.includes("schacht") && u === "St") return 650;
  if (u === "m") return 14;
  if (u === "m²") return 8;
  if (u === "m³") return 36;
  if (u === "t") return 32;
  if (u === "St") return 75;

  return 25;
}

function riskFromText(text: string, unit: string, menge: number): RiskLevel {
  const t = norm(text);

  if (!text || !unit || menge <= 0) return "high";

  if (
    t.includes("unbekannt") ||
    t.includes("bodenklasse") ||
    t.includes("kontaminiert") ||
    t.includes("bestand") ||
    t.includes("anschluss") ||
    t.includes("grundwasser") ||
    t.includes("entsorgung") ||
    t.includes("nach bedarf") ||
    t.includes("bauseits")
  ) {
    return "high";
  }

  if (text.length < 12 || menge > 1000) return "medium";

  return "low";
}

function scoreDbMatch(row: InputRow, db: any): DbMatch {
  let score = 0;
  const reasons: string[] = [];

  const rowText = `${s(row.posNr)} ${s(row.kurztext)} ${s(row.langtext)}`;
  const dbText = `${s(db.positionNumber)} ${s(db.shortText)} ${s(db.longText)}`;

  const rowTokens = tokenize(rowText);
  const dbTokensArray = tokenize(dbText);
  const dbTokens = new Set(dbTokensArray);

  const tokenHits = rowTokens.filter((t) => dbTokens.has(t)).length;
  const tokenUnion = new Set([...rowTokens, ...dbTokensArray]).size;
  const tokenOverlap = tokenUnion > 0 ? tokenHits / tokenUnion : 0;

  const rowUnit = normUnit(row.einheit);
  const dbUnit = normUnit(db.unit);

  // Positionsnummer ist nur ein Signal, kein technischer Beweis.
  if (s(row.posNr) && norm(row.posNr) === norm(db.positionNumber)) {
    score += 18;
    reasons.push("Positionsnummer identisch");
  }

  // Einheit ist ein starkes Vergleichskriterium.
  if (rowUnit && dbUnit) {
    if (norm(rowUnit) === norm(dbUnit)) {
      score += 15;
      reasons.push("Einheit identisch");
    } else {
      score -= 30;
      reasons.push(`Einheit abweichend: ${rowUnit} / ${dbUnit}`);
    }
  }

  // Textähnlichkeit relativ statt nur absolute Token-Treffer.
  if (tokenHits > 0) {
    const tokenScore = Math.min(
      20,
      Math.round(tokenOverlap * 20) + Math.min(8, tokenHits * 2)
    );
    score += tokenScore;
    reasons.push(
      `${tokenHits} Text-Treffer (${Math.round(tokenOverlap * 100)}% Token-Overlap)`
    );
  }

  const rowGewerk = detectGewerk(rowText);
  const dbGewerk = s(db.trade) || detectGewerk(dbText);

  if (
    rowGewerk !== "Allgemein" &&
    dbGewerk !== "Allgemein"
  ) {
    if (norm(rowGewerk) === norm(dbGewerk)) {
      score += 10;
      reasons.push("Gewerk identisch");
    } else {
      score -= 10;
      reasons.push(`Gewerk abweichend: ${rowGewerk} / ${dbGewerk}`);
    }
  }

  const rowLeistung = detectLeistungsart(rowText);
  const dbLeistung = detectLeistungsart(dbText);

  if (
    rowLeistung !== "Sonstige Leistung" &&
    dbLeistung !== "Sonstige Leistung"
  ) {
    if (norm(rowLeistung) === norm(dbLeistung)) {
      score += 12;
      reasons.push("Leistungsart identisch");
    } else {
      score -= 12;
      reasons.push(
        `Leistungsumfang abweichend: ${rowLeistung} / ${dbLeistung}`
      );
    }
  }

  const rowFacts = rlcExtractTechnicalFacts(rowText);
  const dbFacts = rlcExtractTechnicalFacts(dbText);
  const factOverlap = rlcFactOverlapScore(rowFacts, dbFacts);

  if (rowFacts.size && dbFacts.size) {
    if (factOverlap >= 0.75) {
      score += 18;
      reasons.push(
        `Technische Merkmale stark vergleichbar (${Math.round(factOverlap * 100)}%)`
      );
    } else if (factOverlap >= 0.5) {
      score += 10;
      reasons.push(
        `Technische Merkmale teilweise vergleichbar (${Math.round(factOverlap * 100)}%)`
      );
    } else {
      score -= 15;
      reasons.push(
        `Technische Merkmale schwach vergleichbar (${Math.round(factOverlap * 100)}%)`
      );
    }
  }

  const rowValues = rlcExtractTechnicalValues(rowText);
  const dbValues = rlcExtractTechnicalValues(dbText);

  if (rowValues.dimensions.size && dbValues.dimensions.size) {
    const dimOverlap = rlcSetOverlap(
      rowValues.dimensions,
      dbValues.dimensions
    );

    if (dimOverlap > 0) {
      score += 12;
      reasons.push("Abmessung/DN vergleichbar");
    } else {
      score -= 20;
      reasons.push("Abmessung/DN abweichend");
    }
  }

  if (rowValues.materials.size && dbValues.materials.size) {
    const materialOverlap = rlcSetOverlap(
      rowValues.materials,
      dbValues.materials
    );

    if (materialOverlap > 0) {
      score += 10;
      reasons.push("Material vergleichbar");
    } else {
      score -= 18;
      reasons.push("Material abweichend");
    }
  }

  // Historische Nutzung ist nur noch ein kleiner Zusatzbonus.
  if (n(db.useCount) > 0) {
    score += Math.min(4, n(db.useCount));
    reasons.push(`${n(db.useCount)}x verwendet`);
  }

  if (n(db.confidence) > 0) {
    score += Math.min(4, Math.round(n(db.confidence) * 4));
  }

  // Quality Gate bestätigt Zuverlässigkeit, ersetzt aber keine technische Ähnlichkeit.
  const qgBonus = Math.min(20, qualityGateScoreBonus(db));
  if (qgBonus > 0) {
    score += qgBonus;
    reasons.push(`Quality Gate: ${qualityGateStatusOf(db)}`);
  }

  let finalScore = Math.max(0, Math.min(100, score));

  const unitMismatch =
    !!rowUnit &&
    !!dbUnit &&
    norm(rowUnit) !== norm(dbUnit);

  const dimensionMismatch =
    rowValues.dimensions.size > 0 &&
    dbValues.dimensions.size > 0 &&
    rlcSetOverlap(rowValues.dimensions, dbValues.dimensions) === 0;

  const materialMismatch =
    rowValues.materials.size > 0 &&
    dbValues.materials.size > 0 &&
    rlcSetOverlap(rowValues.materials, dbValues.materials) === 0;

  /*
   * Harte technische Inkompatibilität:
   * Quality Gate / PosNr / UseCount dürfen einen technisch falschen
   * Vergleich niemals wieder zu einem starken DB-Treffer machen.
   */
  if (unitMismatch) {
    finalScore = Math.min(finalScore, 20);
    reasons.push("Hard Stop: Einheit technisch nicht vergleichbar");
  }

  if (dimensionMismatch) {
    finalScore = Math.min(finalScore, 30);
    reasons.push("Hard Stop: Abmessung/DN technisch nicht vergleichbar");
  }

  if (materialMismatch) {
    finalScore = Math.min(finalScore, 30);
    reasons.push("Hard Stop: Material technisch nicht vergleichbar");
  }

  return {
    row: db,
    score: finalScore,
    reasons,
  };
}

function rlcDbSearchTokens(row: InputRow): string[] {
  const text = `${s(row.posNr)} ${s(row.kurztext)} ${s(row.langtext)}`;
  const all = tokenize(text);

  const stop = new Set([
    "und",
    "oder",
    "der",
    "die",
    "das",
    "den",
    "dem",
    "des",
    "ein",
    "eine",
    "einer",
    "einen",
    "mit",
    "ohne",
    "nach",
    "aus",
    "für",
    "von",
    "bis",
    "inkl",
    "einschl",
    "liefern",
    "herstellen",
    "leistung",
    "arbeiten",
  ]);

  const technicalValues = rlcExtractTechnicalValues(text);

  const priority = new Set<string>();

  for (const value of technicalValues.dimensions) {
    priority.add(value);
  }

  for (const value of technicalValues.materials) {
    priority.add(value);
  }

  const technicalWords = all.filter((token) =>
    /^(dn|da)\d+/.test(token) ||
    token.includes("rohr") ||
    token.includes("leitung") ||
    token.includes("kabel") ||
    token.includes("asphalt") ||
    token.includes("pflaster") ||
    token.includes("beton") ||
    token.includes("aushub") ||
    token.includes("graben") ||
    token.includes("verfüll") ||
    token.includes("entsorg") ||
    token.includes("transport") ||
    token.includes("schacht") ||
    token.includes("frostschutz") ||
    token.includes("schotter")
  );

  for (const token of technicalWords) {
    priority.add(token);
  }

  const useful = all
    .filter((token) => !stop.has(token))
    .filter((token) => token.length >= 4)
    .sort((a, b) => b.length - a.length);

  return Array.from(
    new Set([
      ...priority,
      ...useful,
    ])
  ).slice(0, 12);
}

export async function findDbMatches(companyId: string, row: InputRow): Promise<DbMatch[]> {
  const posNr = s(row.posNr);
  const kurztext = s(row.kurztext);
  const tokens = rlcDbSearchTokens(row);

  const or: any[] = [];

  if (posNr) {
    or.push({
      positionNumber: {
        contains: posNr,
        mode: "insensitive",
      },
    });
  }

  /*
   * Kurztext bleibt wichtig, aber nicht als einzige Suchbasis.
   */
  if (kurztext) {
    const shortSearch = kurztext.slice(0, 80);

    or.push({
      shortText: {
        contains: shortSearch,
        mode: "insensitive",
      },
    });

    or.push({
      longText: {
        contains: shortSearch,
        mode: "insensitive",
      },
    });
  }

  /*
   * Technische Suchbegriffe werden bewusst einzeln gesucht.
   * Ranking + Hard Stops entscheiden anschließend über Vergleichbarkeit.
   */
  for (const token of tokens) {
    or.push({
      shortText: {
        contains: token,
        mode: "insensitive",
      },
    });

    or.push({
      longText: {
        contains: token,
        mode: "insensitive",
      },
    });
  }

  if (!or.length) return [];

  const rows = await prisma.kalkulationsDbEntry.findMany({
    where: {
      companyId,
      OR: or,
    },

    /*
     * Größere Kandidatenmenge:
     * Relevanz wird danach durch scoreDbMatch() entschieden,
     * nicht durch useCount allein.
     */
    orderBy: [
      { updatedAt: "desc" },
      { useCount: "desc" },
    ],

    take: 80,
  });

  return rows
    .filter((db) => !isDbEntryBlockedByQualityGate(db))
    .map((db) => scoreDbMatch(row, db))
    .filter((x) => x.score >= 12 && n(x.row.unitPriceNet) > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

function weightedDbPrice(matches: DbMatch[], unit: string): number {
  const usable = matches.filter((m) => {
    if (!unit) return true;
    return norm(m.row.unit) === norm(unit);
  });

  if (!usable.length) return 0;

  const totalWeight = usable.reduce(
    (sum, m) => sum + Math.max(1, m.score) * qualityGateWeightFactor(m.row),
    0
  );
  const weighted = usable.reduce(
    (sum, m) =>
      sum + n(m.row.unitPriceNet) * Math.max(1, m.score) * qualityGateWeightFactor(m.row),
    0
  );

  return totalWeight > 0 ? round2(weighted / totalWeight) : 0;
}

function strongDatabaseHit(matches: DbMatch[], unit: string): boolean {
  const ep = weightedDbPrice(matches, unit);
  if (ep <= 0) return false;

  const top = matches[0];
  if (!top) return false;

  if (isApprovedDbMatch(top) && top.score >= 45) return true;
  if (isApprovedDbMatch(top) && top.score >= 35 && norm(top.row.unit) === norm(unit)) {
    return true;
  }

  /*
   * KI-Vorschläge bleiben bewusst schwach:
   * Ohne Freigegeben/Geprüft dürfen sie niemals als starker Datenbanktreffer gelten.
   */
  return false;
}

function rlcExtractTechnicalFacts(value: string): Set<string> {
  const t = norm(value);
  const facts = new Set<string>();

  const patterns: Array<[RegExp, string]> = [
    [/dn\s*\d+|da\s*\d+|d\s*\d+|\b\d+\s*mm\b|\b\d+\s*cm\b/g, "dimension"],
    [/pe\s*hd|pehd|pvc|pp|stahl|beton|kunststoff|guss|steinzeug/g, "material"],
    [/kabelschutzrohr|schutzrohr|speedpipe|leerrohr|rohr/g, "rohr"],
    [/sandbett|sandbettung|rohrumhuellung|rohrumhüllung|bettung|umhuellung|umhüllung/g, "bettung"],
    [/warnband|trassenwarnband|schutzmatte|kabelschutzmatte/g, "schutz"],
    [/muffe|bogen|abzweig|kupplung|formstueck|formstück|zubehoer|zubehör/g, "zubehoer"],
    [/aushub|graben|rohrgraben|leitungsgraben|boden/g, "aushub"],
    [/verfuell|verfüll|verdicht|frostschutz|schotter|kies/g, "verfuellung"],
    [/asphalt|pflaster|bordstein|randstein|rinne|deckschicht|tragschicht/g, "oberflaeche"],
    [/entsorgung|deponie|abfuhr|laden|transport/g, "entsorgung_transport"],
    [/liefern|lieferung/g, "liefern"],
    [/verlegen|einbauen|montieren|setzen|herstellen/g, "einbauen"],
    [/pausch|psch|vorhalten|betreiben|baustelleneinrichtung|verkehrssicherung|wasserhaltung|dokumentation|vermessung/g, "context"],
  ];

  for (const [rx, label] of patterns) {
    if (rx.test(t)) facts.add(label);
  }

  return facts;
}


function rlcExtractTechnicalValues(value: string): {
  dimensions: Set<string>;
  materials: Set<string>;
} {
  const t = norm(value);

  const dimensions = new Set<string>();
  const materials = new Set<string>();

  const dimensionMatches =
    t.match(
      /\b(?:dn|da|d)\s*\d+(?:[.,]\d+)?\b|\b\d+(?:[.,]\d+)?\s*(?:mm|cm)\b/g
    ) || [];

  for (const value of dimensionMatches) {
    dimensions.add(
      value
        .replace(/\s+/g, "")
        .replace(",", ".")
    );
  }

  const materialMatches =
    t.match(
      /\b(?:pe[-\s]*hd|pehd|pvc|pp|stahl|beton|kunststoff|guss|steinzeug)\b/g
    ) || [];

  for (const value of materialMatches) {
    const canonicalMaterial = value
      .replace(/[-\s]+/g, "")
      .toLowerCase();

    materials.add(canonicalMaterial);
  }

  return {
    dimensions,
    materials,
  };
}

function rlcSetOverlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;

  let hits = 0;

  for (const value of a) {
    if (b.has(value)) hits++;
  }

  return hits / Math.max(a.size, b.size);
}

function rlcFactOverlapScore(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0.5;
  if (!a.size || !b.size) return 0;

  let hit = 0;
  for (const x of a) {
    if (b.has(x)) hit++;
  }

  return hit / Math.max(a.size, b.size);
}

function checkDbPriceComparability(row: any, db: any, match?: DbMatch) {
  const reasons: string[] = [];
  const notes: string[] = [];

  const rowUnit = s(row?.einheit ?? row?.unit);
  const dbUnit = s(db?.unit ?? db?.einheit);
  const rowUnitNorm = norm(rowUnit);
  const dbUnitNorm = norm(dbUnit);

  const rowText = `${s(row?.posNr)} ${s(row?.kurztext)} ${s(row?.langtext)}`.trim();
  const dbText = `${s(db?.positionNumber)} ${s(db?.shortText)} ${s(db?.longText)}`.trim();

  const fullRowNorm = norm(rowText);
  const fullDbNorm = norm(dbText);

  if (!rowText || !dbText) {
    reasons.push("LV-Text oder Datenbank-Langtext fehlt.");
  }

  /*
   * HARD GUARD 1:
   * Einheit muss technisch identisch sein.
   */
  if (rowUnitNorm && dbUnitNorm && rowUnitNorm !== dbUnitNorm) {
    reasons.push(
      `Einheit nicht vergleichbar: LV=${rowUnit || "—"}, DB=${dbUnit || "—"}.`
    );
  }

  if (/psch|pausch/.test(rowUnitNorm) || /psch|pausch/.test(dbUnitNorm)) {
    reasons.push(
      "Pauschalposition: Datenbankwert darf nur als Vergleich dienen."
    );
  }

  if (isContextSensitivePosition(rowText, rowUnit)) {
    reasons.push(
      "Context-sensitive Position: Preis hängt von Dauer, Entfernung, Logistik, Personal/Geräten und Projektgröße ab."
    );
  }

  /*
   * Allgemeine technische Merkmale.
   */
  const rowFacts = rlcExtractTechnicalFacts(rowText);
  const dbFacts = rlcExtractTechnicalFacts(dbText);
  const overlap = rlcFactOverlapScore(rowFacts, dbFacts);

  if (overlap < 0.55) {
    reasons.push(
      `Technische Bestandteile nicht ausreichend vergleichbar (${Math.round(
        overlap * 100
      )}%).`
    );
  } else {
    notes.push(
      `Technische Bestandteile vergleichbar (${Math.round(
        overlap * 100
      )}%).`
    );
  }

  /*
   * Exakte technische Werte.
   * Diese Prüfung ist bewusst unabhängig vom Ranking.
   */
  const rowValues = rlcExtractTechnicalValues(rowText);
  const dbValues = rlcExtractTechnicalValues(dbText);

  if (
    rowValues.dimensions.size > 0 &&
    dbValues.dimensions.size > 0
  ) {
    const dimensionOverlap = rlcSetOverlap(
      rowValues.dimensions,
      dbValues.dimensions
    );

    if (dimensionOverlap === 0) {
      reasons.push(
        `Abmessung/DN nicht vergleichbar: LV=${Array.from(
          rowValues.dimensions
        ).join(", ")}, DB=${Array.from(dbValues.dimensions).join(", ")}.`
      );
    } else {
      notes.push("Abmessung/DN technisch vergleichbar.");
    }
  }

  if (
    rowValues.materials.size > 0 &&
    dbValues.materials.size > 0
  ) {
    const materialOverlap = rlcSetOverlap(
      rowValues.materials,
      dbValues.materials
    );

    if (materialOverlap === 0) {
      reasons.push(
        `Material nicht vergleichbar: LV=${Array.from(
          rowValues.materials
        ).join(", ")}, DB=${Array.from(dbValues.materials).join(", ")}.`
      );
    } else {
      notes.push("Material technisch vergleichbar.");
    }
  }

  /*
   * Leistungsart / Umfang.
   */
  const rowLeistungsart = detectLeistungsart(rowText);
  const dbLeistungsart = detectLeistungsart(dbText);

  if (
    rowLeistungsart &&
    dbLeistungsart &&
    rowLeistungsart !== "Sonstige Leistung" &&
    dbLeistungsart !== "Sonstige Leistung"
  ) {
    if (rowLeistungsart !== dbLeistungsart) {
      reasons.push(
        `Leistungsart nicht vergleichbar: LV=${rowLeistungsart}, DB=${dbLeistungsart}.`
      );
    } else {
      notes.push(`Leistungsart vergleichbar: ${rowLeistungsart}.`);
    }
  }

  /*
   * Zusätzliche Scope-Prüfung.
   */
  const rowHasLiefern =
    fullRowNorm.includes("liefern") ||
    fullRowNorm.includes("lieferung");

  const dbHasLiefern =
    fullDbNorm.includes("liefern") ||
    fullDbNorm.includes("lieferung");

  const rowHasEinbau =
    /verlegen|einbauen|montieren|setzen|herstellen/.test(fullRowNorm);

  const dbHasEinbau =
    /verlegen|einbauen|montieren|setzen|herstellen/.test(fullDbNorm);

  if (rowHasLiefern !== dbHasLiefern) {
    reasons.push("Leistungsumfang Lieferung ist nicht gleich.");
  }

  if (rowHasEinbau !== dbHasEinbau) {
    reasons.push("Leistungsumfang Einbau/Verlegung ist nicht gleich.");
  }

  const rowMenge = n(row?.menge);

  if (rowMenge <= 0) {
    reasons.push("Menge fehlt oder ist 0.");
  }

  const score = n(match?.score);

  if (match && score < 65) {
    reasons.push(`Datenbank-Matchscore zu niedrig (${score}).`);
  }

  const rowPos = s(row?.posNr);
  const dbPos = s(db?.positionNumber);

  const posExact =
    !!rowPos &&
    !!dbPos &&
    norm(rowPos) === norm(dbPos);

  if (!posExact && overlap < 0.7) {
    reasons.push(
      "Keine identische Positionsnummer und technische Ähnlichkeit nicht stark genug."
    );
  }

  return {
    ok: reasons.length === 0,
    reasons,
    notes,
    overlap,
    posExact,
    rowFacts: Array.from(rowFacts),
    dbFacts: Array.from(dbFacts),
    rowDimensions: Array.from(rowValues.dimensions),
    dbDimensions: Array.from(dbValues.dimensions),
    rowMaterials: Array.from(rowValues.materials),
    dbMaterials: Array.from(dbValues.materials),
    rowLeistungsart,
    dbLeistungsart,
  };
}

function dbComparabilityWarning(dbCheck: any): string {
  const parts = Array.isArray(dbCheck?.reasons) ? dbCheck.reasons : [];
  if (!parts.length) return "";
  return "Datenbankpreis gefunden, aber technische Vergleichbarkeit nicht ausreichend bestätigt: " + parts.join(" · ");
}

function confidenceFrom(row: InputRow, risk: RiskLevel, matches: DbMatch[], source: CalcSource): number {
  let score = source === "openai" ? 0.82 : source === "database" ? 0.76 : 0.62;

  if (s(row.posNr)) score += 0.03;
  if (s(row.kurztext).length >= 12) score += 0.06;
  if (s(row.langtext).length >= 30) score += 0.04;
  if (s(row.einheit)) score += 0.03;
  if (n(row.menge) > 0) score += 0.03;

  if (source === "database") {
    if (matches.length) score += Math.min(0.12, matches.length * 0.02);
    if (matches[0]?.score >= 70) score += 0.08;
    else if (matches[0]?.score >= 45) score += 0.04;
  }

  if (risk === "medium") score -= 0.06;
  if (risk === "high") score -= 0.14;

  return Math.max(0.25, Math.min(0.98, round2(score)));
}

function buildPriceBreakdownFromCosts(row: {
  einheit?: string;
  materialCost?: number;
  laborCost?: number;
  machineCost?: number;
  subcontractorCost?: number;
  disposalCost?: number;
  overheadCost?: number;
  riskCost?: number;
  profitCost?: number;
}): PriceBreakdownLine[] {
  const unit = s(row.einheit) || "EH";
  const lines: PriceBreakdownLine[] = [];

  function add(group: PriceBreakdownGroup, name: string, value: any, note = "") {
    const total = round2(n(value));
    if (total <= 0) return;

    lines.push({
      id: safeId(),
      group,
      name,
      unit,
      qty: 1,
      price: total,
      total,
      note,
    });
  }

  add("Material", "Materialansatz", row.materialCost);
  add("Personal", "Lohn / Kolonne", row.laborCost);
  add("Maschinen", "Maschinenansatz", row.machineCost);
  add("Fremdleistung", "Fremdleistung", row.subcontractorCost);
  add("Entsorgung", "Entsorgung / Deponie", row.disposalCost);
  add("Gemeinkosten", "Baustellengemeinkosten", row.overheadCost);
  add("Risiko", "Risikopuffer", row.riskCost);
  add("Gewinn", "Gewinnanteil", row.profitCost);

  return lines;
}

function normalizePriceBreakdown(raw: any, unit: string): PriceBreakdownLine[] {
  if (!Array.isArray(raw)) return [];

  const allowed = new Set<PriceBreakdownGroup>([
    "Personal",
    "Maschinen",
    "LKW / Transport",
    "Material",
    "Entsorgung",
    "Fremdleistung",
    "Gemeinkosten",
    "Risiko",
    "Gewinn",
  ]);

  return raw
    .map((x: any) => {
      const group = allowed.has(x?.group) ? x.group : "Material";
      const qty = n(x?.qty, 1);
      const price = n(x?.price);
      const total =
        x?.total !== undefined && x?.total !== null
          ? round2(n(x.total))
          : round2(qty * price);

      return {
        id: s(x?.id) || safeId(),
        group,
        name: s(x?.name) || "Kostenansatz",
        unit: s(x?.unit) || unit || "EH",
        qty,
        price,
        total,
        note: s(x?.note),
      } satisfies PriceBreakdownLine;
    })
    .filter((x) => x.total > 0);
}

/**
 * OpenAI kann priceBreakdown manchmal für die Gesamtmenge liefern
 * z.B. 100 m × 3,50 € = 350 €.
 *
 * Für RLC müssen priceBreakdown-Linien aber immer pro Einheit gespeichert werden:
 * qty = 1
 * price = Kosten pro Einheit
 * total = Kosten pro Einheit
 *
 * Gesamtwerte werden später im Frontend/PDF über Menge × EP berechnet.
 */
function normalizePriceBreakdownPerUnit(
  raw: any,
  unit: string,
  rowMenge: number
): PriceBreakdownLine[] {
  const lines = normalizePriceBreakdown(raw, unit);
  const menge = Math.max(1, n(rowMenge, 1));

  return lines
    .map((line) => {
      let unitTotal = n(line.total);

      if (menge > 1) {
        const lineQty = Math.max(1, n(line.qty, 1));

        if (Math.abs(lineQty - menge) < 0.0001) {
          unitTotal = n(line.price, unitTotal / menge);
        } else if (line.total > line.price && line.total / menge > 0) {
          unitTotal = line.total / menge;
        } else if (lineQty > 1 && line.total / lineQty > 0) {
          unitTotal = line.total / lineQty;
        }
      }

      unitTotal = round2(unitTotal);

      return {
        ...line,
        unit: unit || line.unit || "EH",
        qty: 1,
        price: unitTotal,
        total: unitTotal,
      };
    })
    .filter((x) => x.total > 0);
}

function sumBreakdown(lines: PriceBreakdownLine[]): number {
  return round2(lines.reduce((sum, x) => sum + n(x.total), 0));
}



function isStructuralTitleRow(row: InputRow): boolean {
  const pos = s(row.posNr);
  const kurz = s(row.kurztext);
  const lang = s(row.langtext);
  const text = `${kurz} ${lang}`.trim();
  const t = norm(text);
  const unit = norm(row.einheit);
  const ep = n(row.preis);
  const menge = n(row.menge);

  if (!text) return false;

  /*
   * Reale LV-Position schlägt Positionsnummer-Form.
   * Manche GAEB/LV verwenden echte Leistungspositionen als 1, 2, 1.10 usw.
   * Eine Position mit Menge > 0, Einheit und technischem Text darf deshalb
   * niemals allein wegen der kurzen OZ als Titel/Gliederung behandelt werden.
   */
  const hasRealText =
    kurz.length >= 8 ||
    lang.length >= 18 ||
    /(aushub|abfuhr|verfüll|verfull|pflaster|asphalt|rohr|leitung|schacht|beton|baustell|boden|trag|entsorg|einbau|ausbau)/i.test(text);

  if (menge > 0 && unit && hasRealText) return false;

  /*
   * Reine Gliederungsnummern:
   * 01, 02, 03, 04 oder 01.00 / 02.00 sind Titel/Abschnitte,
   * aber nur wenn sie keine reale Leistungsposition sind.
   */
  if (/^\d{1,2}$/.test(pos)) return true;
  if (/^\d{1,2}\.0{1,3}$/.test(pos)) return true;

  /*
   * Klassische GAEB-/LV-Strukturzeilen.
   */
  if (
    /^titel\s*\d*$/i.test(kurz) ||
    /^abschnitt\s*\d*$/i.test(kurz) ||
    /^kapitel\s*\d*$/i.test(kurz) ||
    /^los\s*\d*$/i.test(kurz) ||
    /^bereich\s*\d*$/i.test(kurz)
  ) {
    return true;
  }

  /*
   * Generische Sammel-/Hilfszeilen, die keine echte Leistungsposition sind.
   */
  if (
    /^leistung\s+zu\s+position\s+\d+/i.test(kurz) ||
    /^leistung\s+zu\s+pos\.?\s*\d+/i.test(kurz) ||
    /^position\s+\d+$/i.test(kurz) ||
    /^titel\s+\d+/i.test(kurz)
  ) {
    return true;
  }

  if (
    t.includes("leistung zu position") ||
    t.includes("leistung zu pos.") ||
    t.includes("summe titel") ||
    t.includes("zwischensumme") ||
    t.includes("gesamtsumme")
  ) {
    return true;
  }

  /*
   * Titeltext ohne konkrete Bauleistung.
   */
  if (
    t.includes("titel ") &&
    !t.includes("ausführung") &&
    !t.includes("liefern") &&
    !t.includes("verlegen") &&
    !t.includes("einbauen") &&
    !t.includes("aushub") &&
    !t.includes("abfuhr") &&
    !t.includes("verfüll") &&
    !t.includes("asphalt") &&
    !t.includes("pflaster") &&
    !t.includes("beton") &&
    !t.includes("rohr") &&
    !t.includes("leitung")
  ) {
    return true;
  }

  /*
   * Pauschale Strukturpositionen mit kurzer Positionsnummer.
   */
  if ((unit === "ps" || unit === "pauschal") && /^(\d{1,2}|\d{1,2}\.\d{1,2})$/.test(pos)) {
    return true;
  }

  /*
   * Sehr generische Zeilen ohne Menge und ohne Preis nicht kalkulieren.
   */
  if (
    ep <= 0 &&
    menge <= 0 &&
    (
      t === "position" ||
      t === "leistung" ||
      t.startsWith("leistung zu") ||
      t.length < 12
    )
  ) {
    return true;
  }

  return false;
}





function firstLayerCm(text: string, keys: string[]): number {
  const t = norm(text);

  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`${escaped}[^0-9]{0,30}(\\d+(?:[,.]\\d+)?)\\s*cm`, "i"),
      new RegExp(`(\\d+(?:[,.]\\d+)?)\\s*cm[^a-zA-ZäöüÄÖÜß]{0,30}${escaped}`, "i"),
    ];

    for (const pattern of patterns) {
      const m = t.match(pattern);
      if (m?.[1]) return n(m[1]);
    }
  }

  return 0;
}

function technicalLayerPostprocess(
  lines: PriceBreakdownLine[],
  rowText: string
): PriceBreakdownLine[] {
  const t = norm(rowText);

  const splittCm = firstLayerCm(rowText, ["splitt", "splittbett", "bettung"]);
  const frostCm = firstLayerCm(rowText, ["frostschutz", "frostschutzkies", "tragschicht"]);
  const auskofferungCm = firstLayerCm(rowText, ["auskofferung", "aushub", "auskoffern"]);

  const splittM3 = splittCm > 0 ? round2(splittCm / 100) : 0;
  const frostM3 = frostCm > 0 ? round2(frostCm / 100) : 0;
  const aushubM3 = auskofferungCm > 0 ? round2(auskofferungCm / 100) : 0;
  const entsorgungT = aushubM3 > 0 ? round2(aushubM3 * 1.8) : 0;

  const isRasengitter = t.includes("rasengitter");
  const isPflaster =
    t.includes("pflaster") ||
    t.includes("verbundstein") ||
    t.includes("betonstein") ||
    t.includes("naturstein") ||
    isRasengitter;
  const isAsphalt = t.includes("asphalt");
  const lightSurface = lightSurfaceRange(rowText, "m²");
  const isLightSurfaceWork = lightSurface.avg > 0;
  const isSurfaceWork = isPflaster || (isAsphalt && !isLightSurfaceWork);

  let droppedAushubMaterialTotal = 0;
  let hasAushubLine = false;

  const out = lines
    .map((line) => {
      const name = norm(line.name);
      const total = n(line.total);

      // Auskofferung/Aushub darf nicht als Material laufen.
      if (
        line.group === "Material" &&
        (name.includes("auskoffer") || name.includes("aushub"))
      ) {
        droppedAushubMaterialTotal += total;
        return null;
      }

      if (splittM3 > 0 && (name.includes("splitt") || name.includes("bettung"))) {
        return {
          ...line,
          unit: "m³",
          qty: splittM3,
          price: round2(total / splittM3),
          total,
          note: `Schichtdicke ${splittCm} cm = ${splittM3} m³/m²`,
        };
      }

      if (frostM3 > 0 && (name.includes("frostschutz") || name.includes("tragschicht"))) {
        return {
          ...line,
          unit: "m³",
          qty: frostM3,
          price: round2(total / frostM3),
          total,
          note: `Schichtdicke ${frostCm} cm = ${frostM3} m³/m²`,
        };
      }

      if (
        aushubM3 > 0 &&
        line.group === "Maschinen" &&
        (name.includes("auskoffer") ||
          name.includes("aushub") ||
          name.includes("bagger") ||
          name.includes("radlader"))
      ) {
        hasAushubLine = true;

        const minAushubTotal = round2(aushubM3 * 12);
        const realisticTotal = Math.max(total, droppedAushubMaterialTotal, minAushubTotal);

        return {
          ...line,
          group: "Maschinen",
          name: "Auskofferung lösen und laden",
          unit: "m³",
          qty: aushubM3,
          price: round2(realisticTotal / aushubM3),
          total: round2(realisticTotal),
          note: `Auskofferung ${auskofferungCm} cm = ${aushubM3} m³/m²`,
        };
      }

      if (
        entsorgungT > 0 &&
        line.group === "Entsorgung" &&
        (name.includes("aushub") || name.includes("boden") || name.includes("entsorg"))
      ) {
        return {
          ...line,
          name: "Aushubmaterial entsorgen",
          unit: "t",
          qty: entsorgungT,
          price: round2(total / entsorgungT),
          total,
          note: `${aushubM3} m³/m² × 1,8 t/m³ = ${entsorgungT} t/m²`,
        };
      }

      return line;
    })
    .filter(Boolean) as PriceBreakdownLine[];

  // Wenn Auskofferung erwähnt ist, muss sie als eigene Leistung sichtbar sein.
  if (aushubM3 > 0 && !hasAushubLine) {
    const total = round2(Math.max(droppedAushubMaterialTotal, aushubM3 * 12));

    out.push({
      id: safeId(),
      group: "Maschinen",
      name: "Auskofferung lösen und laden",
      unit: "m³",
      qty: aushubM3,
      price: round2(total / aushubM3),
      total,
      note: `Auskofferung ${auskofferungCm} cm = ${aushubM3} m³/m²`,
    });
  }

  const sumGroup = (group: PriceBreakdownGroup) =>
    round2(out.filter((x) => x.group === group).reduce((s, x) => s + n(x.total), 0));

  const personalTotal = sumGroup("Personal");
  const machineTotal = sumGroup("Maschinen");

  // Plausibilitätsprüfung für arbeitsintensive Oberflächenarbeiten.
  // Keine Fantasiepreise: Es werden nur fehlende Mindestanteile als transparente Korrekturzeilen ergänzt.
  const minPersonal = isLightSurfaceWork ? 0 : isRasengitter ? 10 : isPflaster ? 9 : isAsphalt ? 7 : 0;
  const minMachines =
    isLightSurfaceWork
      ? 0
      : isRasengitter || isPflaster
        ? Math.max(8, aushubM3 > 0 ? round2(aushubM3 * 12 + 3) : 8)
        : isAsphalt
          ? 6
          : 0;

  if (minPersonal > 0 && personalTotal < minPersonal) {
    const diff = round2(minPersonal - personalTotal);

    out.push({
      id: safeId(),
      group: "Personal",
      name: "Kolonne / Bauhelfer / Facharbeiter",
      unit: "m²",
      qty: 1,
      price: diff,
      total: diff,
      note: "Plausibilitätskorrektur: Mindestansatz für arbeitsintensive Oberflächenleistung",
    });
  }

  if (minMachines > 0 && machineTotal < minMachines) {
    const diff = round2(minMachines - machineTotal);

    out.push({
      id: safeId(),
      group: "Maschinen",
      name: "Geräte / Verdichtung / Radlader",
      unit: "m²",
      qty: 1,
      price: diff,
      total: diff,
      note: "Plausibilitätskorrektur: Geräte, Verdichtung und Baustellenlogistik",
    });
  }

  return out;
}


function mergePlausibilityLines(lines: PriceBreakdownLine[]): PriceBreakdownLine[] {
  const out = [...lines];

  function isPlausibility(line: PriceBreakdownLine) {
    return norm(line.note).includes("plausibilit") || norm(line.name).includes("geräte / verdichtung");
  }

  function mergeGroup(group: PriceBreakdownGroup, finalName: string, finalNote: string) {
    const groupLines = out.filter((x) => x.group === group);
    if (groupLines.length <= 1) return;

    const plausibility = groupLines.filter(isPlausibility);
    if (!plausibility.length) return;

    const target =
      groupLines.find((x) => !isPlausibility(x)) ||
      groupLines[0];

    const addTotal = plausibility
      .filter((x) => x.id !== target.id)
      .reduce((sum, x) => sum + n(x.total), 0);

    if (addTotal <= 0) return;

    const nextTotal = round2(n(target.total) + addTotal);

    target.name = finalName;
    target.unit = target.unit || "m²";
    target.qty = n(target.qty, 1) || 1;
    target.total = nextTotal;
    target.price = round2(nextTotal / Math.max(n(target.qty, 1), 0.0001));
    target.note = finalNote;

    for (let i = out.length - 1; i >= 0; i--) {
      const line = out[i];
      if (line.group === group && line.id !== target.id && isPlausibility(line)) {
        out.splice(i, 1);
      }
    }
  }

  mergeGroup(
    "Personal",
    "Kolonne / Bauhelfer / Facharbeiter",
    "Arbeitszeit für Verlegen, Ausrichten, Schneiden, Abrütteln und Nebenarbeiten"
  );

  mergeGroup(
    "Maschinen",
    "Auskofferung / Geräte / Verdichtung",
    "Auskofferung, Bagger/Radlader, Verdichtung und Baustellenlogistik"
  );

  return out;
}



function materialKey(value: any): string {
  const t = norm(value);

  if (t.includes("rasengitter")) return "rasengitter";
  if (t.includes("asphaltdeckschicht") || t.includes("asphalt")) return "asphalt";
  if (t.includes("frostschutz")) return "frostschutz";
  if (t.includes("splitt")) return "splitt";
  if (t.includes("pflaster")) return "pflaster";
  if (t.includes("bord")) return "bordstein";
  if (t.includes("rohr") || t.includes("speedpipe")) return "rohr";
  return "";
}

function isMaterialDatabaseEntry(match: DbMatch): boolean {
  const row = match.row || {};
  const text = norm(`${s(row.shortText)} ${s(row.longText)} ${s(row.serviceType)} ${s(row.trade)}`);

  if (text.includes("materialpreis")) return true;
  if (norm(row.serviceType) === "material") return true;
  if (norm(row.source) === "company" && text.includes("liefern")) return true;

  return false;
}

function applyDatabaseMaterialPrices(
  lines: PriceBreakdownLine[],
  matches: DbMatch[],
  rowText: string
): PriceBreakdownLine[] {
  if (!matches.length) return lines;

  const out = [...lines];
  const rowKeyText = norm(rowText);

  const materialMatches = matches
    .filter((m) => isMaterialDatabaseEntry(m))
    .filter((m) => n(m.row?.unitPriceNet) > 0)
    .sort((a, b) => b.score - a.score);

  for (const match of materialMatches) {
    const db = match.row;
    const dbPrice = round2(n(db.unitPriceNet));
    const dbUnit = s(db.unit) || "EH";
    const dbText = `${s(db.shortText)} ${s(db.longText)}`;
    const key = materialKey(dbText);

    if (!key) continue;
    if (!rowKeyText.includes(key)) continue;

    const target = out.find((line) => {
      if (line.group !== "Material") return false;
      const lineText = norm(`${line.name} ${line.note}`);
      return lineText.includes(key);
    });

    if (!target) continue;

    // Nur gleiche/kompatible Einheit überschreiben.
    // Beispiel: Rasengitter m² -> m², Asphaltdeckschicht m² -> m².
    if (dbUnit && target.unit && norm(dbUnit) !== norm(target.unit)) {
      continue;
    }

    target.price = dbPrice;
    target.total = round2(n(target.qty, 1) * dbPrice);
    target.note = `Firmen-/Datenbankpreis übernommen: ${s(db.shortText)} · ${dbPrice} €/` + dbUnit;

    console.log(
      `[kalkulation.ki] Materialpreis aus Datenbank übernommen: ${key} = ${dbPrice} €/${dbUnit}`
    );
  }

  return out;
}

function sanitizeOverheadRiskProfit(
  lines: PriceBreakdownLine[],
  options?: { skipCaps?: boolean }
): PriceBreakdownLine[] {
  const out = [...lines];

  if (options?.skipCaps) return out;

  const directGroups: PriceBreakdownGroup[] = [
    "Material",
    "Personal",
    "Maschinen",
    "LKW / Transport",
    "Entsorgung",
    "Fremdleistung",
  ];

  const directTotal = round2(
    out
      .filter((x) => directGroups.includes(x.group))
      .reduce((sum, x) => sum + n(x.total), 0)
  );

  if (directTotal <= 0) return out;

  const caps: Record<string, { maxPct: number; label: string }> = {
    Gemeinkosten: { maxPct: 0.15, label: "Gemeinkosten auf plausiblen Maximalwert begrenzt" },
    Risiko: { maxPct: 0.10, label: "Risikoaufschlag auf plausiblen Maximalwert begrenzt" },
    Gewinn: { maxPct: 0.15, label: "Gewinnaufschlag auf plausiblen Maximalwert begrenzt" },
  };

  for (const groupName of Object.keys(caps) as PriceBreakdownGroup[]) {
    const cap = caps[groupName];
    const maxTotal = round2(directTotal * cap.maxPct);

    const groupLines = out.filter((x) => x.group === groupName);
    const groupTotal = round2(groupLines.reduce((sum, x) => sum + n(x.total), 0));

    if (!groupLines.length || groupTotal <= maxTotal) continue;

    const first = groupLines[0];

    first.unit = first.unit || "EH";
    first.qty = 1;
    first.total = maxTotal;
    first.price = maxTotal;
    first.note = cap.label;

    for (let i = out.length - 1; i >= 0; i--) {
      const line = out[i];
      if (line.group === groupName && line.id !== first.id) {
        out.splice(i, 1);
      }
    }
  }

  return out;
}

function sumBreakdownGroup(
  lines: PriceBreakdownLine[],
  groups: PriceBreakdownGroup[]
): number {
  const allowed = new Set(groups);
  return round2(
    lines
      .filter((x) => allowed.has(x.group))
      .reduce((sum, x) => sum + n(x.total), 0)
  );
}

function buildWarnings(
  row: InputRow,
  riskLevel: RiskLevel,
  matches: DbMatch[],
  confidence: number,
  source: CalcSource
): string[] {
  const warnings: string[] = [];

  if (!s(row.posNr)) warnings.push("Positionsnummer fehlt");
  if (!s(row.kurztext)) warnings.push("Kurztext fehlt");
  if (!s(row.einheit)) warnings.push("Einheit fehlt");
  if (n(row.menge) <= 0) warnings.push("Menge fehlt oder ist 0");

  const text = norm(`${s(row.kurztext)} ${s(row.langtext)}`);

  if (source === "openai") warnings.push("OpenAI-Schätzung verwendet, bitte fachlich prüfen");
  if (source === "rule-engine") warnings.push("Nur Regel-Engine-Fallback verwendet");
  if (source === "database" && !matches.length) warnings.push("Keine passende Erfahrung in der Datenbank gefunden");
  if (source === "database" && matches.length > 0 && matches[0].score < 35) {
    warnings.push("Datenbanktreffer nur bedingt ähnlich");
  }

  if (riskLevel === "high") warnings.push("Erhöhtes Kalkulationsrisiko");
  if (text.includes("bodenklasse")) warnings.push("Bodenklasse muss geprüft werden");
  if (text.includes("entsorgung")) warnings.push("Entsorgung/Deponieklasse prüfen");
  if (text.includes("bestand") || text.includes("anschluss")) {
    warnings.push("Bestandsanschluss technisch prüfen");
  }
  if (text.includes("verkehr")) warnings.push("Verkehrssicherung/RSA prüfen");
  if (confidence < 0.65) warnings.push("Niedrige Kalkulationssicherheit");

  return Array.from(new Set(warnings));
}

function calculationStatusFrom(warnings: string[], riskLevel: RiskLevel, confidence: number): CalcStatus {
  if (warnings.some((x) => x.includes("fehlt")) || confidence < 0.55) return "critical";
  if (warnings.length || riskLevel !== "low") return "warning";
  return "ok";
}


function calcRuleRow(row: InputRow, matches: DbMatch[], sourceOverride?: CalcSource) {
  const posNr = s(row.posNr);
  const kurztext = s(row.kurztext);
  const langtext = s(row.langtext);
  const einheit = s(row.einheit);
  const menge = n(row.menge);
  const text = `${kurztext} ${langtext}`.trim();

  const contextSensitive = isContextSensitivePosition(text, einheit);
  const dbEpRaw = weightedDbPrice(matches, einheit);
  const dbEp = contextSensitive ? 0 : dbEpRaw;
  const ruleEp = basePrice(text, einheit);
  const rlcRange = rlcPreisRangeForText(text, einheit);
  const rlcAvgEp = n(rlcRange.avg);
  const source: CalcSource = sourceOverride || (dbEp > 0 ? "database" : "rule-engine");

  /*
   * RLC Preisbibliothek:
   * Wenn keine sichere Datenbank vorhanden ist, nutzt die Rule-Engine
   * den höheren plausiblen Wert aus Regelpreis und RLC-Preisbibliothek.
   */
  const base = dbEp > 0 ? dbEp : Math.max(ruleEp, rlcAvgEp);

  const riskLevel = riskFromText(text, einheit, menge);
  const confidence = confidenceFrom(row, riskLevel, matches, source);
  const riskFactor = riskLevel === "high" ? 0.12 : riskLevel === "medium" ? 0.06 : 0.025;

  const materialCost = round2(base * 0.28);
  const laborCost = round2(base * 0.34);
  const machineCost = round2(base * 0.18);

  const disposalCost =
    norm(text).includes("abfuhr") ||
    norm(text).includes("entsorgung") ||
    norm(text).includes("aushub")
      ? round2(base * 0.16)
      : 0;

  const subcontractorCost = 0;
  const direct = materialCost + laborCost + machineCost + disposalCost + subcontractorCost;
  const overheadCost = round2(direct * 0.12);
  const riskCost = round2(direct * riskFactor);
  const profitCost = round2((direct + overheadCost + riskCost) * 0.1);
  const suggestedUnitPrice = round2(direct + overheadCost + riskCost + profitCost);

  const warnings = [
    ...buildWarnings(row, riskLevel, matches, confidence, source),
    contextSensitive ? contextSensitiveWarning(text) : "",
  ].filter(Boolean);
  const calculationStatus = calculationStatusFrom(warnings, riskLevel, confidence);

  const gewerk = detectGewerk(text);
  const leistungsart = detectLeistungsart(text);
  const bauverfahren = detectBauverfahren(text, einheit);

  const matchText = matches.length
    ? matches
        .slice(0, 3)
        .map(
          (m, i) =>
            `${i + 1}. ${s(m.row.positionNumber) || "—"} · ${s(m.row.shortText) || "ohne Text"} · EP ${round2(n(m.row.unitPriceNet))} € · Score ${m.score}`
        )
        .join("; ")
    : "keine verwertbaren Treffer";

  const aiReason =
    contextSensitive
      ? `RLC Urkalkulation: Kontextabhängige Position erkannt. Historische Datenbankwerte wurden nur als Vergleich betrachtet und nicht blind als EP übernommen. Historischer DB-EP: ${dbEpRaw} €. Preis muss über Dauer, Entfernung, Personal, Geräte, Logistik, Gemeinkosten, Risiko und Gewinn geprüft werden.`
      : source === "database"
        ? `Server-KI/Datenbank: Der Preis wurde aus ${matches.length} ähnlichen Erfahrungswert(en) der Kalkulationsdatenbank abgeleitet. Gewichteter Datenbank-EP: ${dbEp} €. Zusätzlich plausibilisiert über Gewerk ${gewerk}, Leistungsart ${leistungsart}, Verfahren ${bauverfahren}. Top-Treffer: ${matchText}.`
        : `Server-Fallback: Kein ausreichend sicherer Datenbanktreffer und keine verwertbare OpenAI-Antwort. Preis wurde über Regel-Engine aus Einheit, Textmerkmalen, Risiko, Gemeinkosten und Gewinn aufgebaut. Regel-EP: ${ruleEp} €; Gewerk ${gewerk}, Leistungsart ${leistungsart}, Verfahren ${bauverfahren}.`;

  const priceBreakdown = buildPriceBreakdownFromCosts({
    einheit,
    materialCost,
    laborCost,
    machineCost,
    subcontractorCost,
    disposalCost,
    overheadCost,
    riskCost,
    profitCost,
  });

  return {
    id: row.id,
    posNr,
    kurztext,
    langtext,
    einheit,
    menge,

    materialCost,
    laborCost,
    machineCost,
    subcontractorCost,
    disposalCost,
    overheadCost,
    riskCost,
    profitCost,

    baseUnitPrice: round2(base),
    suggestedUnitPrice,
    finalUnitPrice: suggestedUnitPrice,

    confidence,
    riskLevel,
    calculationStatus,

    gewerk,
    leistungsart,
    bauverfahren,

      rlcPreisMin: round2(n(rlcRange.min)),
      rlcPreisAvg: round2(n(rlcRange.avg)),
      rlcPreisMax: round2(n(rlcRange.max)),
      rlcPreisSource: rlcAvgEp > 0 ? "RLC Preisbibliothek" : "",
      rlcPreisGroup: rlcAvgEp > 0 ? rlcRange.matches?.[0]?.group || "" : "",

    warning: warnings.join(" · "),
    aiReason,
    source,
    priceBreakdown,
  };
}

function extractJson(text: string): any | null {
  const clean = s(text)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(clean);
  } catch {
    const first = clean.indexOf("{");
    const last = clean.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(clean.slice(first, last + 1));
      } catch {
        return null;
      }
    }
  }

  return null;
}

async function openAiCalcRow(row: InputRow, matches: DbMatch[], companyId = "", projectCode = ""): Promise<any | null> {
  if (process.env.RLC_RECIPE_DEBUG === "1") {
    console.log("[RLC_RECIPE_DEBUG] openAiCalcRow SKIPPED - OpenAI disabled");
    return null;
  }

  const posNr = s(row.posNr);
  const kurztext = s(row.kurztext);
  const langtext = s(row.langtext);
  const einheit = s(row.einheit);
  const menge = n(row.menge);
  const text = `${kurztext} ${langtext}`.trim();

  const gewerk = detectGewerk(text);
  const leistungsart = detectLeistungsart(text);
  const bauverfahren = detectBauverfahren(text, einheit);
  // Suggestions shown to KI must be auditable price sources, not historic values.
  const rlcPreisTreffer = findRlcPreisItems({
    text,
    unit: einheit,
    limit: 12,
    documentedOnly: true,
  });
  const rlcPreisRange = rlcPreisRangeForText(text, einheit);
  const contextHint = contextSensitiveAiHint(text, einheit);

  const projectDurationDays =
    n((row as any).projectDurationDays) ||
    n((row as any).durationDays) ||
    n((row as any).bauzeitTage) ||
    0;

  const projectDistanceKm =
    n((row as any).projectDistanceKm) ||
    n((row as any).distanceKm) ||
    n((row as any).entfernungKm) ||
    0;

  const projectSize =
    s((row as any).projectSize) ||
    s((row as any).projektGroesse) ||
    s((row as any).baustellenGroesse);

  const projectPersonnel =
    s((row as any).projectPersonnel) ||
    s((row as any).personal) ||
    s((row as any).workers);

  const projectMachines =
    s((row as any).projectMachines) ||
    s((row as any).geraete) ||
    s((row as any).maschinen);

  const projectLogistics =
    s((row as any).projectLogistics) ||
    s((row as any).logistik) ||
    s((row as any).baustellenlogistik);

  const projectContextBlock = [
    projectDurationDays > 0 ? `- Projektdauer: ${projectDurationDays} Tage` : "- Projektdauer: nicht angegeben",
    projectDistanceKm > 0 ? `- Entfernung Baustelle/Firma: ${projectDistanceKm} km` : "- Entfernung Baustelle/Firma: nicht angegeben",
    projectSize ? `- Projektgröße/Baustellenumfang: ${projectSize}` : "- Projektgröße/Baustellenumfang: nicht angegeben",
    projectPersonnel ? `- Personalansatz: ${projectPersonnel}` : "- Personalansatz: nicht angegeben",
    projectMachines ? `- Geräte/Maschinen: ${projectMachines}` : "- Geräte/Maschinen: nicht angegeben",
    projectLogistics ? `- Logistik/Randbedingungen: ${projectLogistics}` : "- Logistik/Randbedingungen: nicht angegeben",
  ].join("\n");

  const prompt = `
${contextHint}
Du bist ein erfahrener deutscher Bau-Kalkulator für Tiefbau, Leitungsbau, Glasfaserbau, Straßenbau und Hochbau.

Erstelle eine fachlich plausible Urkalkulation pro Einheit für diese LV-Position.

Position:
- Positionsnummer: ${posNr || "—"}
- Kurztext: ${kurztext || "—"}
- Langtext: ${langtext || "—"}
- Einheit: ${einheit || "EH"}
- Menge: ${menge || 1}
- Erkanntes Gewerk: ${gewerk}
- Leistungsart: ${leistungsart}
- Bauverfahren: ${bauverfahren}

Projektkontext / Baustellenparameter:
${projectContextBlock}

RLC Preisbibliothek / interne Plausibilitätswerte:
${rlcPreisTreffer.length
  ? rlcPreisTreffer
      .map(
        (p, i) =>
          `${i + 1}. ${p.group} | ${p.name} | Einheit ${p.unit} | min ${p.minPrice} EUR | avg ${p.avgPrice} EUR | max ${p.maxPrice} EUR | Kategorie ${p.category}`
      )
      .join("\n")
  : "Keine passenden RLC-Bibliothekswerte."}
RLC Range für diese Position: min ${round2(n(rlcPreisRange.min))} EUR | avg ${round2(n(rlcPreisRange.avg))} EUR | max ${round2(n(rlcPreisRange.max))} EUR.

Datenbank-/Erfahrungswerte, falls vorhanden:
${matches.length
  ? matches
      .slice(0, 5)
      .map(
        (m, i) =>
          `${i + 1}. Pos ${s(m.row.positionNumber) || "—"} | ${s(m.row.shortText) || "ohne Text"} | Einheit ${s(m.row.unit) || "—"} | EP ${round2(n(m.row.unitPriceNet))} EUR | Score ${m.score}`
      )
      .join("\n")
  : "Keine verwertbaren Datenbanktreffer."}

Wichtig:
- Nutze vorhandene Datenbank-/Erfahrungswerte als wichtige Referenz, aber nicht blind.
- Prüfe immer die Plausibilität des Datenbankpreises gegen LV-Text, Schichtdicken, Material, Entsorgung, Transport, Personal und Maschinen.
- Wenn der Datenbankpreis nur Material oder nur Teilleistung abbildet, ergänze fehlende Leistungen.
- Wenn der Datenbankpreis für die vollständige Position offensichtlich zu niedrig oder zu hoch ist, gib eine Warnung und eine fachlich plausible korrigierte Urkalkulation aus.
- Wenn der Datenbankpreis plausibel ist, übernimm ihn bzw. leite den Preis daraus ab.
- Antworte ausschließlich als JSON.
- Keine Markdown-Erklärung.
- Alle Preise netto in EUR pro Einheit.
- WICHTIG: Gemeinkosten, Risiko und Gewinn müssen als absolute EUR-Beträge ausgegeben werden, niemals als Prozentzahl.
- Beispiel falsch: Gewinn price 15 total 15, wenn 15 % gemeint sind.
- Beispiel richtig: Gewinn 15 % von 100000 EUR = price 15000 total 15000.
- finalUnitPrice muss exakt die Summe der priceBreakdown-total-Werte pro Einheit sein.
- priceBreakdown muss eine professionelle Urkalkulation pro Einheit enthalten.
- Verwende realistische, konservative Baustellenwerte, nicht zu niedrige Fantasiepreise.
- Bei kontextabhängigen Positionen wie Baustelleneinrichtung, Vorhaltung, Verkehrssicherung, Dokumentation oder Vermessung musst du Projektdauer, Entfernung, Personal, Geräte, Container, Logistik und Gemeinkosten ausdrücklich berücksichtigen.
- Wenn Projektdauer oder Entfernung angegeben sind, darfst du nicht schreiben, dass Dauer/Entfernung/Projektgröße fehlen.
- Bei langen Baustellenlaufzeiten muss die Vorhaltung über die gesamte Laufzeit plausibel berücksichtigt werden.

Spezialregel für Baustelleneinrichtung / Vorhaltung / Baustellengemeinkosten:
- Kalkuliere nicht als grobe Pauschale, sondern als nachvollziehbare zeitabhängige Urkalkulation.
- Berechne die Laufzeit aus Projektdauer: Monate = Projektdauer / 30, Tage = Projektdauer.
- Container, Baustrom, Bauwasser, Sanitär, Lagerflächen und sonstige Baustelleneinrichtung müssen über die Laufzeit monatlich oder tageweise kalkuliert werden.
- Gerätevorhaltung darf nicht symbolisch mit kleinen Pauschalen angesetzt werden, sondern muss über Laufzeit, Geräteart und realistische Vorhaltekosten bewertet werden.
- Personal darf nicht als komplette Kolonne über 730 Tage voll gerechnet werden, wenn es sich nur um Baustelleneinrichtung/Vorhaltung handelt; kalkuliere stattdessen anteilige Einrichtung, Kontrolle, Bauleitung, Polier, Koordination und laufende Betreuung.
- Antransport, Abtransport, Geräteumsetzung und Entfernung zur Baustelle müssen separat berücksichtigt werden.
- Baustellengemeinkosten müssen zur Projektdauer passen und dürfen bei langen Laufzeiten nicht unrealistisch niedrig sein.
- Gib die priceBreakdown-Zeilen so aus, dass man Dauer, Monatsansatz oder Tagesansatz erkennen kann.
- Beispielstruktur:
  1. Antransport / Aufbau
  2. Container / Baustelleneinrichtung monatlich
  3. Baustrom / Bauwasser / Sanitär monatlich
  4. Gerätevorhaltung / Kleingeräte / Sicherung
  5. Bauleitung / Polier / Koordination anteilig
  6. Logistik / Fahrten / Entfernung
  7. Gemeinkosten
  8. Risiko
  9. Gewinn

Spezialregel für Verkehrssicherung / Verkehrsführung / RSA:
- Wenn der LV-Text Verkehrssicherung, Verkehrsführung, Straßensperrung, Beschilderung, Absperrung, Lichtsignalanlage oder Ampel enthält, kalkuliere zeitabhängig über die volle Projektdauer.
- Verwende die angegebene Projektdauer strikt. Beispiel: Bei 180 Tagen darf eine Lichtsignalanlage nicht nur über 30 Tage kalkuliert werden.
- Beschilderung, Absperrmaterial, Leitbaken, Verkehrszeichen, Sperrmaterial und mobile Lichtsignalanlage müssen als eigene priceBreakdown-Zeilen erscheinen, wenn sie im LV-Text genannt sind.
- Regelmäßige Kontrollen, Wartung, Anpassung der Verkehrsführung, RSA/StVO-Auflagen und Genehmigungs-/Koordinationsaufwand müssen separat berücksichtigt werden.
- Logistik, Anfahrt, Aufbau, Umbau und Abbau müssen separat kalkuliert werden, besonders wenn eine Entfernung angegeben ist.
- Bei langer Laufzeit müssen Miete/Vorhaltung der Lichtsignalanlage, Beschilderung und Absperrmaterial über die gesamte Laufzeit plausibel gerechnet werden.
- Beispielstruktur:
  1. Beschilderung / Verkehrszeichen
  2. Absperrmaterial / Leitbaken / Sperrmaterial
  3. Lichtsignalanlage / Ampel über komplette Laufzeit
  4. Kontrollen / Wartung / Anpassung Verkehrsführung
  5. Aufbau / Umbau / Abbau
  6. Logistik / Fahrten / Entfernung
  7. Gemeinkosten
  8. Risiko
  9. Gewinn

Spezialregel für Gebäudenah / Hausanschlüsse / Bestand / Innenhof / Privatgrund:
- Wenn der LV-Text Hausanschluss, Kernbohrung, Wanddurchführung, Hauseinführung, Gebäudeeinführung, Bestand, Innenhof, Privatgrund, Privatfläche, Eigentümerabstimmung, Handschachtung oder Wiederherstellung Privatfläche enthält, kalkuliere NICHT als einfache Erschwernis oder normale Leitung.
- Diese Position muss als gebäudenahe Hausanschluss-/Bestandsleistung mit Zugang, Schutz, Handschachtung, Kernbohrung, Hauseinführung, Eigentümerabstimmung, Wiederherstellung und Dokumentation kalkuliert werden.
- Kernbohrung/Wanddurchführung/Hauseinführung müssen separat erscheinen.
- Handschachtung/Innenhof/beengter Zugang müssen separat erscheinen.
- Schutz vorhandener Oberflächen muss separat erscheinen.
- Wiederherstellung Privatfläche muss separat erscheinen.
- Abstimmung Eigentümer und Dokumentation müssen separat erscheinen.
- Beispielstruktur:
  1. Baustellenzugang / Anfahrt / Einrichtung
  2. Handschachtung / Innenhof / beengter Zugang
  3. Kernbohrung / Wanddurchführung
  4. Hauseinführung / Anschluss an Bestand
  5. Schutz vorhandener Oberflächen
  6. Wiederherstellung Privatfläche
  7. Eigentümerabstimmung / Termine
  8. Dokumentation / Nachweise
  9. Gemeinkosten
  10. Risiko
  11. Gewinn

Spezialregel für Spezialtiefbau / schwierige Bauverfahren:
- Wenn der LV-Text Spezialtiefbau, Baugrubenverbau, Spundwand, Bohrpfahl, Unterfangung, komplexe Wasserhaltung, Bodenverbesserung, HDI, Injektion, Pressung, Microtunneling oder Rohrvortrieb enthält, kalkuliere NICHT als Asphaltzulage, Nebenleistung, einfache Rohrleitung oder Firmenkalibrierung.
- Diese Position muss als komplexes Spezialtiefbauverfahren mit Geräteantransport, Spezialgerät, Fachkolonne, Verbau, Wasserhaltung, Vortrieb/Pressung, Dokumentation, Risiko und Rückbau kalkuliert werden.
- Baugrubenverbau/Spundwand/Bohrpfahl/Unterfangung müssen separat erscheinen, wenn genannt.
- Wasserhaltung komplex muss separat erscheinen, wenn genannt.
- Bodenverbesserung/HDI/Injektion müssen separat erscheinen, wenn genannt.
- Pressung/Microtunneling/Rohrvortrieb müssen separat erscheinen, wenn genannt.
- Spezialgeräte-Antransport, Einrichtung, Rückbau und Dokumentation müssen separat erscheinen.
- Beispielstruktur:
  1. Spezialgeräte-Antransport / Einrichtung
  2. Baugrubenverbau / Spundwand / Bohrpfahl / Unterfangung
  3. Komplexe Wasserhaltung
  4. Bodenverbesserung / HDI / Injektion
  5. Pressung / Microtunneling / Rohrvortrieb
  6. Spezialtiefbau-Kolonne / Bauleitung / Vermessung
  7. Rückbau / Abbau / Logistik
  8. Dokumentation / Nachweise
  9. Gemeinkosten
  10. Risiko
  11. Gewinn

Spezialregel für Kampfmittel / Altlasten / Bodenrisiken / Beweissicherung:
- Wenn der LV-Text Kampfmittel, Kampfmittelsondierung, Altlasten, Bodenkontamination, Bodenklasse unbekannt, Bodenanalyse, Gutachter, Sicherheitsfreigabe, Beweissicherung, Zustandsaufnahme, Rissprotokoll oder baubegleitende Kontrolle enthält, kalkuliere NICHT als allgemeine Behörden-/Genehmigungsposition.
- Diese Position muss als Risiko-/Gutachter-/Sondierungsleistung mit Fachfirma, Analyse, Freigabe, Beweissicherung und baubegleitender Kontrolle kalkuliert werden.
- Kampfmittelsondierung/Sicherheitsfreigabe muss separat erscheinen.
- Altlasten/Bodenkontamination/Bodenanalyse muss separat erscheinen.
- Gutachter/Fachfirma muss separat erscheinen.
- Beweissicherung/Zustandsaufnahme/Rissprotokoll muss separat erscheinen.
- Baubegleitende Kontrolle muss separat erscheinen.
- Beispielstruktur:
  1. Anfahrt / Einrichtung / Koordination
  2. Kampfmittelsondierung / Sicherheitsfreigabe
  3. Altlastenprüfung / Bodenkontamination / Bodenanalyse
  4. Gutachter / Fachfirma / baubegleitende Kontrolle
  5. Beweissicherung / Zustandsaufnahme / Rissprotokoll
  6. Dokumentation / Nachweise / Freigabeunterlagen
  7. Gemeinkosten
  8. Risiko
  9. Gewinn

Spezialregel für Behörden / Genehmigungen / Auflagen / Sicherheit:
- Wenn der LV-Text Genehmigungen, Behördenauflagen, verkehrsrechtliche Anordnung, Abstimmung mit Behörden, SiGeKo, Arbeitssicherheit, Sicherheitskonzept, Denkmalpflege, archäologische Begleitung, Kampfmittelsondierung, Freigabe oder Dokumentation enthält, kalkuliere NICHT als normale Dokumentation, Vorhaltung oder allgemeine Baustelleneinrichtung.
- Diese Position muss als Behörden-, Sicherheits- und Freigabemanagement über Laufzeit, Termine, externe Fachstellen, Unterlagen, Begehungen und Dokumentation kalkuliert werden.
- Genehmigungen/Behördenauflagen müssen separat erscheinen.
- Verkehrsrechtliche Anordnung muss separat erscheinen.
- SiGeKo/Arbeitssicherheit/Sicherheitskonzept müssen separat erscheinen.
- Denkmalpflege/archäologische Begleitung müssen separat erscheinen.
- Kampfmittelsondierung/Freigabe muss separat erscheinen.
- Behördentermine/Abstimmung/Dokumentation müssen separat erscheinen.
- Beispielstruktur:
  1. Genehmigungen / Behördenauflagen
  2. Verkehrsrechtliche Anordnung
  3. Behördenabstimmung / Termine / Freigaben
  4. SiGeKo / Arbeitssicherheit / Sicherheitskonzept
  5. Denkmalpflege / archäologische Begleitung
  6. Kampfmittelsondierung / Freigabe
  7. Dokumentation / Unterlagen / Nachweise
  8. Anfahrt / Logistik
  9. Gemeinkosten
  10. Risiko
  11. Gewinn

Spezialregel für Baustellenlogistik / Zufahrt / Lager / Versorgung:
- Wenn der LV-Text Baustellenlogistik, Baustellenzufahrt, Zufahrtssicherung, Lagerflächen, Zwischenlager, Materialumschlag, Baustrom, Baustellenbeleuchtung, Stromprovisorium, Baustellenwasser, Spezialgeräte-Miete oder Mietverlängerung enthält, kalkuliere NICHT als Provisorium/Baustraße und NICHT als allgemeine Baustelleneinrichtung.
- Diese Position muss als Logistik-, Lager- und Versorgungsmaßnahme über Bauzeit, Vorhaltung, Betrieb, Kontrolle und Rückbau kalkuliert werden.
- Baustellenzufahrt/Zufahrtssicherung muss separat erscheinen, wenn genannt.
- Lagerfläche/Zwischenlager/Materialumschlag muss separat erscheinen, wenn genannt.
- Baustrom/Stromprovisorium/Baustellenbeleuchtung muss separat erscheinen, wenn genannt.
- Baustellenwasser/Wasseranschluss muss separat erscheinen, wenn genannt.
- Spezialgeräte-Miete/Mietverlängerung muss separat erscheinen, wenn genannt.
- Rückbau/Abbau/Logistik/Anfahrt muss separat kalkuliert werden.
- Beispielstruktur:
  1. Baustellenzufahrt / Zufahrtssicherung
  2. Lagerflächen / Zwischenlager
  3. Materialumschlag / Radlader / Stapler
  4. Baustrom / Stromprovisorium / Beleuchtung
  5. Baustellenwasser / Wasseranschluss
  6. Spezialgeräte-Miete / Mietverlängerung
  7. Kontrolle / Betrieb / Vorhaltung während Laufzeit
  8. Rückbau / Abbau / Logistik / Anfahrt
  9. Gemeinkosten
  10. Risiko
  11. Gewinn

Spezialregel für Schutzmaßnahmen / Umwelt / Natur / Anwohner:
- Wenn der LV-Text Schutzmaßnahmen, Lärmschutz, Staubschutz, Erschütterungsschutz, Baumschutz, Wurzelschutz, Gewässerschutz, Ölbindemittel, Havarie-Schutz, Anwohnerinformation, Beweissicherung oder Zustandsdokumentation enthält, kalkuliere NICHT als allgemeine Dokumentation oder Baustelleneinrichtung.
- Diese Position muss als Schutzmaßnahmenpaket über Dauer, Aufbau, Kontrolle, Unterhaltung, Dokumentation und Rückbau kalkuliert werden.
- Lärmschutz/Staubschutz/Erschütterungsschutz müssen separat erscheinen, wenn genannt.
- Baum-/Wurzelschutz und Gewässerschutz müssen separat erscheinen, wenn genannt.
- Ölbindemittel/Havarie-Schutz müssen separat erscheinen, wenn genannt.
- Anwohnerinformation, Beweissicherung und Zustandsdokumentation müssen separat erscheinen, wenn genannt.
- Regelmäßige Kontrolle/Unterhaltung über die Laufzeit muss separat erscheinen.
- Rückbau/Abbau und Logistik müssen separat kalkuliert werden.
- Beispielstruktur:
  1. Lärmschutz / Staubschutz / Erschütterungsschutz
  2. Baumschutz / Wurzelschutz
  3. Gewässerschutz / Ölbindemittel / Havarie-Schutz
  4. Anwohnerinformation
  5. Beweissicherung / Zustandsdokumentation
  6. Kontrolle / Unterhaltung während Laufzeit
  7. Rückbau / Abbau / Logistik
  8. Gemeinkosten
  9. Risiko
  10. Gewinn

Spezialregel für Prüfungen / Abnahmen / technische Nachweise:
- Wenn der LV-Text Dichtheitsprüfung, Druckprüfung, Spülung, TV-Inspektion, Kamerabefahrung, Prüfprotokolle, Abnahmeunterlagen, Funktionsprüfung oder Bestandsfreigabe enthält, kalkuliere NICHT als allgemeine Dokumentation, Vorhaltung oder normale Rohrleitung.
- Diese Position muss als technische Prüf-/Nachweisleistung kalkuliert werden.
- Spülung/Reinigung muss separat erscheinen, wenn genannt.
- TV-Inspektion/Kamerabefahrung muss separat erscheinen, wenn genannt.
- Dichtheitsprüfung/Druckprüfung muss separat erscheinen, wenn genannt.
- Prüfgerät/Messgerät/TV-Kamera/Spülfahrzeug muss separat berücksichtigt werden.
- Auswertung, Prüfprotokolle, Dokumentation, Abnahmeunterlagen und Bestandsfreigabe müssen separat erscheinen.
- Anfahrt/Logistik muss separat kalkuliert werden, wenn Entfernung angegeben ist.
- Bei Einheit m muss der EP längenbezogen realistisch bleiben; Gemeinkosten, Risiko und Gewinn dürfen nicht als riesige €/m-Werte angesetzt werden.
- Beispielstruktur:
  1. Spülung / Reinigung Leitung
  2. TV-Inspektion / Kamerabefahrung
  3. Dichtheitsprüfung / Druckprüfung
  4. Prüfgerät / TV-Kamera / Spülfahrzeug
  5. Auswertung / Prüfprotokolle / Dokumentation
  6. Abnahmeunterlagen / Bestandsfreigabe
  7. Anfahrt / Logistik
  8. Gemeinkosten
  9. Risiko
  10. Gewinn

Spezialregel für Entsorgung / Deponie / belasteter Boden / Haufwerk / Analytik:
- Wenn der LV-Text Entsorgung, Deponie, belasteter Boden, Haufwerk, Probenahme, Deklarationsanalytik, ErsatzbaustoffV, LAGA, Wiegescheine oder Entsorgungsnachweise enthält, kalkuliere NICHT als Reinigung oder einfache Transportposition.
- Diese Position muss aus mehreren Kostenblöcken aufgebaut werden: Probenahme, Analytik, Klassifizierung, Laden, Transport, Deponiegebühren, Nachweise und Risiko.
- Deponieklasse/Materialklasse ist entscheidend. Wenn sie fehlt, muss die Kalkulation prüfpflichtig bleiben.
- Transport muss über Entfernung, LKW-Fahrten, Menge und Dichte plausibel gerechnet werden.
- Deponiegebühren müssen separat erscheinen.
- Analytik/Probenahme/Deklaration müssen separat erscheinen, wenn genannt.
- Wiegescheine, Entsorgungsnachweise und Dokumentation müssen separat erscheinen.
- Beispielstruktur:
  1. Probenahme / Haufwerksbeprobung
  2. Deklarationsanalytik / Einstufung ErsatzbaustoffV/LAGA
  3. Laden / Umschlag
  4. Transport zur Deponie
  5. Deponiegebühren / Annahmegebühren
  6. Wiegescheine / Entsorgungsnachweise
  7. Bauleitung / Nachweisführung
  8. Gemeinkosten
  9. Risiko
  10. Gewinn

Spezialregel für temporäre Anschlüsse / Notleitungen / provisorische Medienversorgung:
- Wenn der LV-Text temporärer Anschluss, temporäre Anschlüsse, Notleitung, provisorische Leitung, provisorische Medienversorgung, Ersatzversorgung, Anschluss an Bestand, Druckprüfung, Absperrarmaturen, Formstücke oder tägliche Kontrolle enthält, kalkuliere NICHT als normale Rohrleitungsposition.
- Diese Position muss als vollständige temporäre Versorgungsmaßnahme kalkuliert werden: Herstellen, Anschließen, Prüfen, Betreiben/Vorhalten, Kontrollieren und Rückbauen.
- Rohrmaterial, Formstücke, Absperrarmaturen und Verbindungsteile müssen separat erscheinen, wenn genannt.
- Anschluss an Bestand / Bestandseinbindung muss separat erscheinen.
- Druckprüfung / Spülung / Inbetriebnahme muss separat erscheinen, wenn genannt.
- Vorhaltung/Betrieb über die angegebene Laufzeit muss separat erscheinen.
- Tägliche/regelmäßige Kontrolle und Wartung müssen separat erscheinen.
- Rückbau, Trennung, Laden, Abtransport und Wiederherstellung müssen separat erscheinen.
- Logistik/Anfahrt/Materialanlieferung muss separat kalkuliert werden.
- Beispielstruktur:
  1. Rohrmaterial / Formstücke / Armaturen
  2. Herstellen / Verlegen temporäre Notleitung
  3. Anschluss an Bestand / Einbindung
  4. Druckprüfung / Spülung / Inbetriebnahme
  5. Vorhaltung / Betrieb über Laufzeit
  6. Kontrolle / Wartung
  7. Rückbau / Trennung / Abtransport
  8. Logistik / Anfahrt / Materialtransporte
  9. Gemeinkosten
  10. Risiko
  11. Gewinn

Spezialregel für Schutzmaßnahmen / Umwelt / Natur / Anwohner:
- Wenn der LV-Text Schutzmaßnahmen, Lärmschutz, Staubschutz, Erschütterungsschutz, Baumschutz, Wurzelschutz, Gewässerschutz, Ölbindemittel, Havarie-Schutz, Anwohnerinformation, Beweissicherung oder Zustandsdokumentation enthält, kalkuliere NICHT als allgemeine Dokumentation oder Baustelleneinrichtung.
- Diese Position muss als Schutzmaßnahmenpaket über Dauer, Aufbau, Kontrolle, Unterhaltung, Dokumentation und Rückbau kalkuliert werden.
- Lärmschutz/Staubschutz/Erschütterungsschutz müssen separat erscheinen, wenn genannt.
- Baum-/Wurzelschutz und Gewässerschutz müssen separat erscheinen, wenn genannt.
- Ölbindemittel/Havarie-Schutz müssen separat erscheinen, wenn genannt.
- Anwohnerinformation, Beweissicherung und Zustandsdokumentation müssen separat erscheinen, wenn genannt.
- Regelmäßige Kontrolle/Unterhaltung über die Laufzeit muss separat erscheinen.
- Rückbau/Abbau und Logistik müssen separat kalkuliert werden.
- Beispielstruktur:
  1. Lärmschutz / Staubschutz / Erschütterungsschutz
  2. Baumschutz / Wurzelschutz
  3. Gewässerschutz / Ölbindemittel / Havarie-Schutz
  4. Anwohnerinformation
  5. Beweissicherung / Zustandsdokumentation
  6. Kontrolle / Unterhaltung während Laufzeit
  7. Rückbau / Abbau / Logistik
  8. Gemeinkosten
  9. Risiko
  10. Gewinn

Spezialregel für Prüfungen / Abnahmen / technische Nachweise:
- Wenn der LV-Text Dichtheitsprüfung, Druckprüfung, Spülung, TV-Inspektion, Kamerabefahrung, Prüfprotokolle, Abnahmeunterlagen, Funktionsprüfung oder Bestandsfreigabe enthält, kalkuliere NICHT als allgemeine Dokumentation, Vorhaltung oder normale Rohrleitung.
- Diese Position muss als technische Prüf-/Nachweisleistung kalkuliert werden.
- Spülung/Reinigung muss separat erscheinen, wenn genannt.
- TV-Inspektion/Kamerabefahrung muss separat erscheinen, wenn genannt.
- Dichtheitsprüfung/Druckprüfung muss separat erscheinen, wenn genannt.
- Prüfgerät/Messgerät/TV-Kamera/Spülfahrzeug muss separat berücksichtigt werden.
- Auswertung, Prüfprotokolle, Dokumentation, Abnahmeunterlagen und Bestandsfreigabe müssen separat erscheinen.
- Anfahrt/Logistik muss separat kalkuliert werden, wenn Entfernung angegeben ist.
- Bei Einheit m muss der EP längenbezogen realistisch bleiben; Gemeinkosten, Risiko und Gewinn dürfen nicht als riesige €/m-Werte angesetzt werden.
- Beispielstruktur:
  1. Spülung / Reinigung Leitung
  2. TV-Inspektion / Kamerabefahrung
  3. Dichtheitsprüfung / Druckprüfung
  4. Prüfgerät / TV-Kamera / Spülfahrzeug
  5. Auswertung / Prüfprotokolle / Dokumentation
  6. Abnahmeunterlagen / Bestandsfreigabe
  7. Anfahrt / Logistik
  8. Gemeinkosten
  9. Risiko
  10. Gewinn

Spezialregel für Entsorgung / Deponie / belasteter Boden / Haufwerk / Analytik:
- Wenn der LV-Text Entsorgung, Deponie, belasteter Boden, Haufwerk, Probenahme, Deklarationsanalytik, ErsatzbaustoffV, LAGA, Wiegescheine oder Entsorgungsnachweise enthält, kalkuliere NICHT als Reinigung oder einfache Transportposition.
- Diese Position muss aus mehreren Kostenblöcken aufgebaut werden: Probenahme, Analytik, Klassifizierung, Laden, Transport, Deponiegebühren, Nachweise und Risiko.
- Deponieklasse/Materialklasse ist entscheidend. Wenn sie fehlt, muss die Kalkulation prüfpflichtig bleiben.
- Transport muss über Entfernung, LKW-Fahrten, Menge und Dichte plausibel gerechnet werden.
- Deponiegebühren müssen separat erscheinen.
- Analytik/Probenahme/Deklaration müssen separat erscheinen, wenn genannt.
- Wiegescheine, Entsorgungsnachweise und Dokumentation müssen separat erscheinen.
- Beispielstruktur:
  1. Probenahme / Haufwerksbeprobung
  2. Deklarationsanalytik / Einstufung ErsatzbaustoffV/LAGA
  3. Laden / Umschlag
  4. Transport zur Deponie
  5. Deponiegebühren / Annahmegebühren
  6. Wiegescheine / Entsorgungsnachweise
  7. Bauleitung / Nachweisführung
  8. Gemeinkosten
  9. Risiko
  10. Gewinn

Spezialregel für temporäre Anschlüsse / Notleitungen / provisorische Medienversorgung:
- Wenn der LV-Text temporärer Anschluss, temporäre Anschlüsse, Notleitung, provisorische Leitung, provisorische Medienversorgung, Ersatzversorgung, Anschluss an Bestand, Druckprüfung, Absperrarmaturen, Formstücke oder tägliche Kontrolle enthält, kalkuliere NICHT als normale Rohrleitungsposition.
- Diese Position muss als vollständige temporäre Versorgungsmaßnahme kalkuliert werden: Herstellen, Anschließen, Prüfen, Betreiben/Vorhalten, Kontrollieren und Rückbauen.
- Rohrmaterial, Formstücke, Absperrarmaturen und Verbindungsteile müssen separat erscheinen, wenn genannt.
- Anschluss an Bestand / Bestandseinbindung muss separat erscheinen.
- Druckprüfung / Spülung / Inbetriebnahme muss separat erscheinen, wenn genannt.
- Vorhaltung/Betrieb über die angegebene Laufzeit muss separat erscheinen.
- Tägliche/regelmäßige Kontrolle und Wartung müssen separat erscheinen.
- Rückbau, Trennung, Laden, Abtransport und Wiederherstellung müssen separat erscheinen.
- Logistik/Anfahrt/Materialanlieferung muss separat kalkuliert werden.
- Beispielstruktur:
  1. Rohrmaterial / Formstücke / Armaturen
  2. Herstellen / Verlegen temporäre Notleitung
  3. Anschluss an Bestand / Einbindung
  4. Druckprüfung / Spülung / Inbetriebnahme
  5. Vorhaltung / Betrieb über Laufzeit
  6. Kontrolle / Wartung
  7. Rückbau / Trennung / Abtransport
  8. Logistik / Anfahrt / Materialtransporte
  9. Gemeinkosten
  10. Risiko
  11. Gewinn

Spezialregel für Provisorien / Umleitungen / temporäre Baustraßen / temporäre Anschlüsse:
- Wenn der LV-Text Provisorium, provisorisch, Baustraße, Umleitung, Baustellenumleitung, temporärer Anschluss, temporäre Zufahrt, Vorhalten, Unterhalten oder Rückbau enthält, kalkuliere NICHT als normale Materialposition.
- Diese Position muss als vollständige temporäre Maßnahme kalkuliert werden: Herstellen, Vorhalten, Unterhalten, Anpassen, Reinigen und Rückbauen.
- Material wie Schottertragschicht, Geotextil, Platten, Rohre, Kabel, Absperrung oder Beschilderung muss als realistische Pauschale oder Mengenannahme erscheinen, niemals als symbolischer Kleinstwert.
- Vorhaltung über die angegebene Dauer muss separat berücksichtigt werden.
- Unterhaltung/Reinigung/Anpassung während der Laufzeit muss separat erscheinen.
- Rückbau, Laden, Abtransport und Entsorgung/Wiederverwertung müssen separat erscheinen.
- Logistik/Anfahrt/Materialanlieferung muss separat kalkuliert werden.
- Wenn Herstellen/Einbau genannt ist, muss eine eigene priceBreakdown-Zeile "Herstellung / Einbau provisorische Baustraße" erscheinen.
- Wenn Unterhalten/Reinigung/Anpassung genannt ist, muss EXAKT eine eigene priceBreakdown-Zeile "Unterhaltung / Reinigung / Anpassung während Laufzeit" erscheinen. Diese Kosten dürfen nicht in Gemeinkosten versteckt werden.
- Wenn Umleitung/Beschilderung genannt ist, muss EXAKT eine eigene priceBreakdown-Zeile "Beschilderung / Umleitung / Verkehrsführung" erscheinen. Diese Kosten dürfen nicht in Gemeinkosten versteckt werden.
- Wenn Rückbau genannt ist, muss eine eigene priceBreakdown-Zeile "Rückbau / Laden / Abtransport" erscheinen.
- Wenn eine dieser LV-Komponenten fehlt, ist die Kalkulation unvollständig.
- Beispielstruktur:
  1. Herstellen provisorische Baustraße / Umleitung
  2. Material Schotter / Geotextil / Tragschicht
  3. Maschinen / Einbau / Verdichtung
  4. Vorhaltung über Laufzeit
  5. Unterhaltung / Reinigung / Anpassung
  6. Beschilderung / Verkehrsführung
  7. Rückbau / Laden / Abtransport
  8. Logistik / Anfahrt / Materialtransporte
  9. Gemeinkosten
  10. Risiko
  11. Gewinn

Spezialregel für Wasserhaltung / Pumpen / Grundwasser / Baugrubenentwässerung:
- Wenn der LV-Text Wasserhaltung, Pumpen, Tauchpumpen, Grundwasser, Baugrubenentwässerung, Ableitung des Wassers, Vorfluter, Kanal, Schläuche oder Stromversorgung enthält, kalkuliere NICHT als Baustelleneinrichtungspauschale.
- Diese Position ist eine zeitabhängige Wasserhaltungs-/Pumpenkalkulation.
- Pumpen-Vorhaltung muss separat erscheinen: Tauchpumpen, Ersatzpumpe, Pumpentechnik.
- Schläuche, Leitungen, Ableitung in Kanal/Vorfluter müssen separat erscheinen, wenn genannt.
- Stromversorgung und Stromkosten müssen separat berücksichtigt werden.
- Regelmäßige Kontrolle, Wartung, Reinigung und Funktionsprüfung müssen separat erscheinen.
- Risiko für Pumpenausfall, Starkregen, höheren Grundwasserandrang und 24h-Betrieb muss berücksichtigt werden.
- Wenn Dauer angegeben ist, müssen Pumpen, Strom und Kontrolle über die volle Dauer plausibel gerechnet werden.
- Beispielstruktur:
  1. Pumpen-Vorhaltung / Tauchpumpen / Ersatzpumpe
  2. Schläuche / Leitungen / Ableitung
  3. Stromversorgung / Stromkosten
  4. Kontrolle / Wartung / Funktionsprüfung
  5. Aufbau / Abbau / Logistik / Anfahrt
  6. Gemeinkosten
  7. Risiko
  8. Gewinn

Spezialregel für Gerätevorhaltung / Bauzeitunterbrechung / Stillstand / Wartezeiten:
- Wenn der LV-Text Gerätevorhaltung, Vorhaltung, Bauzeitunterbrechung, Stillstand, Wartezeit, Wartezeiten, behördliche Freigaben, Leitungsfreigaben oder Bauablaufstörungen enthält, kalkuliere NICHT als Baustelleneinrichtungspauschale.
- Diese Position muss als zeitabhängige Vorhalte-/Stillstandskalkulation aufgebaut werden.
- Gerätevorhaltung muss separat erscheinen: z.B. Bagger, Verdichtungsgerät, Kleingeräte, Baustelleneinrichtung.
- Personal-Wartezeiten müssen separat erscheinen: z.B. Polier anteilig, Maschinist anteilig, Bauleitung/Koordination.
- Stillstand/Wartezeit darf nicht mit voller Kolonne über die gesamte Dauer gerechnet werden, sondern mit realistischen Anteilen oder betroffenen Tagen/Stunden.
- Erneute Anfahrt, Abfahrt, Umsetzen und Logistik müssen separat erscheinen, wenn Entfernung angegeben ist.
- Wenn Geräte teilweise auf der Baustelle bleiben, kalkuliere Vorhaltekosten über die Stillstands-/Unterbrechungsdauer.
- Beispielstruktur:
  1. Gerätevorhaltung Bagger / Kleingeräte
  2. Personal-Wartezeit / Polier / Maschinist anteilig
  3. Bauleitung / Koordination / Freigaben
  4. Stillstand / Bauablaufstörung
  5. Erneute Anfahrt / Logistik / Entfernung
  6. Gemeinkosten
  7. Risiko
  8. Gewinn

Spezialregel für Erschwernis / beengte Bauweise / schwierige Bauverhältnisse:
- Wenn der LV-Text Erschwernis, beengte Bauweise, beengte Verhältnisse, Handschachtung, Anliegerverkehr, bestehende Versorgungsleitungen, erschwerte Zugänglichkeit oder erschwerte Gerätebewegung enthält, kalkuliere NICHT als normale Tiefbauposition.
- Diese Position ist eine Zuschlags-/Erschwernisposition und muss aus Mehrzeit, Minderleistung, zusätzlicher Sicherung, Handarbeit, kleineren Geräten, Umsetzen der Geräte, Wartezeiten und Koordination berechnet werden.
- Kalkuliere nicht automatisch die komplette Kolonne über die gesamte Bauzeit als Vollleistung. Berechne stattdessen den zusätzlichen Mehraufwand gegenüber normaler Bauweise.
- Handschachtung muss separat erscheinen, wenn im LV genannt.
- Arbeiten neben bestehenden Versorgungsleitungen müssen separat als Sicherungs-/Suchschachtung-/Koordinationsaufwand erscheinen.
- Anliegerverkehr, beengte Zufahrt, Verkehrsbehinderung und zusätzliche Sicherung müssen separat bewertet werden, wenn genannt.
- Beispielstruktur:
  1. Mehrzeit Personal / Minderleistung
  2. Handschachtung / Arbeiten von Hand
  3. Kleingeräte / Minibagger / erschwerte Gerätebewegung
  4. Sicherung bestehender Leitungen / Suchschachtung
  5. Anliegerverkehr / beengte Logistik / Koordination
  6. Gemeinkosten
  7. Risiko
  8. Gewinn

Spezialregel für Dokumentation / Bestandspläne / Vermessung:
- Wenn der LV-Text Dokumentation, Fotodokumentation, Aufmaß, Bestandspläne, Vermessungsdaten, As-Built, Übergabeunterlagen oder Behördenabstimmung enthält, kalkuliere NICHT Bauleiter oder Vermessungstechniker full-time über die gesamte Bauzeit.
- Die Bauzeit ist nur ein Einflussfaktor für Umfang und Häufigkeit, aber keine Vollzeit-Arbeitszeit für Dokumentation.
- Kalkuliere realistische Teilaufwände: z.B. regelmäßige Fotodokumentation stundenweise, Aufmaßtermine tageweise, Vermessungseinsätze nach Anzahl Termine, CAD-/Bestandsplanbearbeitung als Büroaufwand, Übergabe/Abstimmung separat.
- Wenn keine genaue Anzahl Termine angegeben ist, verwende konservative Annahmen und schreibe sie in die note.
- Bestandsplan/CAD/DWG/PDF/LandXML/As-Built muss als eigene priceBreakdown-Zeile erscheinen, wenn im LV erwähnt.
- Fotodokumentation, Aufmaß, Vermessung, CAD-Bearbeitung, Übergabeunterlagen und Behörden-/AG-Abstimmung sollen getrennte Zeilen sein, wenn im LV genannt.
- Beispielstruktur:
  1. Fotodokumentation regelmäßig, stundenweise
  2. Aufmaß / Massenermittlung / Aufmaßunterlagen
  3. Vermessungseinsätze / GNSS / Tachymeter
  4. CAD-/Bestandsplanbearbeitung / As-Built
  5. Digitale Übergabeunterlagen / PDF/DWG/LandXML
  6. Abstimmung Auftraggeber / Behörden
  7. Gemeinkosten
  8. Risiko
  9. Gewinn
- Wenn der LV-Text Schichtdicken enthält, müssen diese technisch berechnet und als eigene Zeilen ausgegeben werden.
- Bei m²-Positionen gilt zwingend: cm-Schichtdicke / 100 = m³ je m².
- Verwende in priceBreakdown technische Einheiten, nicht pauschal immer m².
- Beispiel: Splittbett 5 cm = qty 0.05, unit "m³", price €/m³, total €/m².
- Beispiel: Frostschutzkies 35 cm = qty 0.35, unit "m³", price €/m³, total €/m².
- Beispiel: Auskofferung 50 cm = qty 0.50, unit "m³", price €/m³, total €/m².
- Entsorgung bei Aushub: m³ × ca. 1,8 t/m³ = t je m².
- Beispiel: 0,50 m³/m² Auskofferung × 1,8 t/m³ = 0,90 t/m² Entsorgung.
- Aushub/Auskofferung lösen und laden ist eine eigene Maschinen-/Personal- oder Erdarbeitszeile und darf nicht nur in Entsorgung versteckt werden.
- Entsorgung ist nur Deponie/Verwertung/Abfuhr des Materials.
- LKW / Transport für Materialanlieferung und LKW / Transport für Aushubabfuhr müssen getrennt werden, wenn beide vorkommen.
- Rasengitterpflaster / Pflasterflächen müssen getrennte Zeilen enthalten für:
  1. Rasengitter/Pflaster Material, unit "m²", qty 1
  2. Splittbett/Bettung, unit "m³", qty aus cm-Dicke berechnet
  3. Frostschutz/Tragschicht, unit "m³", qty aus cm-Dicke berechnet, falls erwähnt
  4. Auskofferung/Aushub lösen und laden, unit "m³", qty aus cm-Dicke berechnet, falls erwähnt
  5. Entsorgung Aushubmaterial, unit "t", qty aus m³ × 1,8 berechnet, falls Auskofferung/Aushub erwähnt
  6. LKW / Transport Materialanlieferung
  7. LKW / Transport Aushubabfuhr
  8. Personal/Facharbeiter/Helfer
  9. Maschinen/Bagger/Radlader/Rüttelplatte/Walze
  10. Gemeinkosten
  11. Risiko
  12. Gewinn
- Für Materialpreise verwende plausible Nettoansätze:
  Splitt 2/5 ca. 45–70 €/m³,
  Frostschutzkies 0/32 ca. 35–60 €/m³,
  Aushub lösen/laden ca. 8–18 €/m³,
  Aushub entsorgen ca. 18–45 €/t,
  Rasengitterpflaster Standard ca. 20–35 €/m², schwere/spezielle Ausführung ca. 35–60 €/m²,
  LKW/Transport je nach Anteil realistisch ansetzen.
- Transport darf nicht als Fremdleistung ausgegeben werden, sondern als Gruppe "LKW / Transport", außer es ist ausdrücklich Subunternehmerleistung.
- Entsorgung darf nicht generisch "Abfallentsorgung" heißen, sondern z.B. "Aushubmaterial entsorgen" oder "Asphaltaufbruch entsorgen".
- Bei Rasengitterpflaster mit 5 cm Splitt, 35 cm Frostschutz und 50 cm Auskofferung ist ein EP unter 70 €/m² in der Regel unplausibel, außer Material/Entsorgung/Transport sind ausdrücklich nicht enthalten.
- Kennzeichne die Schätzung als prüfpflichtig.

JSON-Schema:
{
  "materialCost": number,
  "laborCost": number,
  "machineCost": number,
  "subcontractorCost": number,
  "disposalCost": number,
  "overheadCost": number,
  "riskCost": number,
  "profitCost": number,
  "baseUnitPrice": number,
  "suggestedUnitPrice": number,
  "finalUnitPrice": number,
  "confidence": number,
  "riskLevel": "low" | "medium" | "high",
  "calculationStatus": "ok" | "warning" | "critical",
  "gewerk": string,
  "leistungsart": string,
  "bauverfahren": string,
  "warning": string,
  "aiReason": string,
  "priceBreakdown": [
    {
      "group": "Personal" | "Maschinen" | "LKW / Transport" | "Material" | "Entsorgung" | "Fremdleistung" | "Gemeinkosten" | "Risiko" | "Gewinn",
      "name": string,
      "unit": string,
      "qty": number,
      "price": number,
      "total": number,
      "note": string
    }
  ]
}
`;

  const completion = await completeRlcAiText({
    purpose: "kalkulation",
    temperature: 0.15,
    responseFormat: "json",
    messages: [
      {
        role: "system",
        content:
          "Du bist ein präziser Bau-Kalkulator. Du lieferst ausschließlich valides JSON ohne Markdown.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  appendAiPrivacyAudit(companyId, {
    provider: completion.provider,
    model: completion.model,
    purpose: "kalkulation",
    feature: "KALKULATION_KI_ROW",
    projectCode,
    positionId: row.id || row.posNr || "",
    inputTokens: completion.usage?.inputTokens,
    outputTokens: completion.usage?.outputTokens,
    totalTokens: completion.usage?.totalTokens,
    fallbackUsed: completion.fallbackUsed,
  });

  const content = completion.text || "";
  const parsed = extractJson(content);
  if (!parsed || typeof parsed !== "object") return null;

  const materialCost = round2(n(parsed.materialCost));
  const laborCost = round2(n(parsed.laborCost));
  const machineCost = round2(n(parsed.machineCost));
  const subcontractorCost = round2(n(parsed.subcontractorCost));
  const disposalCost = round2(n(parsed.disposalCost));
  const overheadCost = round2(n(parsed.overheadCost));
  const riskCost = round2(n(parsed.riskCost));
  const profitCost = round2(n(parsed.profitCost));

  const directTotal =
    materialCost +
    laborCost +
    machineCost +
    subcontractorCost +
    disposalCost +
    overheadCost +
    riskCost +
    profitCost;

  const normalizedBreakdown = normalizePriceBreakdownPerUnit(parsed.priceBreakdown, einheit, menge);
  const fallbackBreakdown = buildPriceBreakdownFromCosts({
    einheit,
    materialCost,
    laborCost,
    machineCost,
    subcontractorCost,
    disposalCost,
    overheadCost,
    riskCost,
    profitCost,
  });

  const rawPriceBreakdown = normalizedBreakdown.length ? normalizedBreakdown : fallbackBreakdown;
  let priceBreakdown = sanitizeOverheadRiskProfit(
    mergePlausibilityLines(
      applyDatabaseMaterialPrices(technicalLayerPostprocess(rawPriceBreakdown, text), matches, text)
    ),
    {
      skipCaps: isContextSensitivePosition(text, einheit),
    }
  );
  let breakdownTotal = sumBreakdown(priceBreakdown);

  const disposalFallbackContext =
    /entsorgung|deponie|belasteter boden|belastet|haufwerk|analytik|deklarationsanalytik|laga|ersatzbaustoffv|wiegeschein|entsorgungsnachweis/.test(norm(`${kurztext} ${langtext}`));

  if (disposalFallbackContext && breakdownTotal <= 0) {
    priceBreakdown = [
      {
        id: crypto.randomUUID(),
        group: "Entsorgung",
        name: "Probenahme / Haufwerksbeprobung",
        unit: einheit,
        qty: 1,
        price: 10,
        total: 10,
        note: "Fallback: prüfpflichtige Schätzung, da Deponie-/Materialklasse fehlt.",
      },
      {
        id: crypto.randomUUID(),
        group: "Entsorgung",
        name: "Deklarationsanalytik / Einstufung ErsatzbaustoffV/LAGA",
        unit: einheit,
        qty: 1,
        price: 15,
        total: 15,
        note: "Fallback: Analytik/Einstufung separat angesetzt.",
      },
      {
        id: crypto.randomUUID(),
        group: "Maschinen",
        name: "Laden / Umschlag",
        unit: einheit,
        qty: 1,
        price: 20,
        total: 20,
        note: "Fallback: Laden/Umschlag pro Einheit.",
      },
      {
        id: crypto.randomUUID(),
        group: "LKW / Transport",
        name: "Transport zur Deponie",
        unit: einheit,
        qty: 1,
        price: projectDistanceKm > 0 ? 30 : 20,
        total: projectDistanceKm > 0 ? 30 : 20,
        note: `Fallback: Transport prüfpflichtig kalkuliert${projectDistanceKm > 0 ? `, Entfernung ${projectDistanceKm} km` : ""}.`,
      },
      {
        id: crypto.randomUUID(),
        group: "Entsorgung",
        name: "Deponiegebühren / Annahmegebühren",
        unit: einheit,
        qty: 1,
        price: 45,
        total: 45,
        note: "Fallback: Deponieklasse fehlt, daher konservative prüfpflichtige Annahme.",
      },
      {
        id: crypto.randomUUID(),
        group: "Entsorgung",
        name: "Wiegescheine / Entsorgungsnachweise",
        unit: einheit,
        qty: 1,
        price: 5,
        total: 5,
        note: "Fallback: Nachweise separat angesetzt.",
      },
      {
        id: crypto.randomUUID(),
        group: "Personal",
        name: "Bauleitung / Nachweisführung",
        unit: einheit,
        qty: 1,
        price: 6,
        total: 6,
        note: "Fallback: Nachweisführung/Bauleitung anteilig.",
      },
      {
        id: crypto.randomUUID(),
        group: "Gemeinkosten",
        name: "Gemeinkosten",
        unit: einheit,
        qty: 1,
        price: 10,
        total: 10,
        note: "Fallback: Gemeinkosten.",
      },
      {
        id: crypto.randomUUID(),
        group: "Risiko",
        name: "Risiko",
        unit: einheit,
        qty: 1,
        price: 8,
        total: 8,
        note: "Fallback: erhöhtes Risiko wegen fehlender Material-/Deponieklasse.",
      },
      {
        id: crypto.randomUUID(),
        group: "Gewinn",
        name: "Gewinn",
        unit: einheit,
        qty: 1,
        price: 12,
        total: 12,
        note: "Fallback: Gewinn.",
      },
    ];

    breakdownTotal = sumBreakdown(priceBreakdown);
  }

  /*
   * Harte Fachlogik:
   * Reine Abfuhr-/Transportpositionen ohne Entsorgung/Deponie dürfen von OpenAI
   * nicht wie Bodenentsorgung kalkuliert werden.
   */
  const ntOpenAi = norm(text);
  const isPureTransportWithoutDisposal =
    (ntOpenAi.includes("abfuhr") ||
      ntOpenAi.includes("abfahren") ||
      ntOpenAi.includes("transport")) &&
    !ntOpenAi.includes("entsorgung") &&
    !ntOpenAi.includes("deponie") &&
    !ntOpenAi.includes("verwertung");

  const rlcTransportAvg = round2(n(rlcPreisRange.avg));
  const rlcTransportMax = round2(n(rlcPreisRange.max));

  if (
    isPureTransportWithoutDisposal &&
    rlcTransportAvg > 0 &&
    rlcTransportMax > 0 &&
    breakdownTotal > rlcTransportMax
  ) {
    priceBreakdown = [
      {
        id: "openai-transport-rlc-deckel",
        group: "LKW / Transport",
        name: "Abfuhr / Transport gemäß RLC Preisbibliothek",
        unit: einheit || "t",
        qty: 1,
        price: rlcTransportAvg,
        total: rlcTransportAvg,
        note: "OpenAI-Wert wurde gedeckelt: reine Transportposition ohne Entsorgung/Deponie.",
      },
    ];
    breakdownTotal = rlcTransportAvg;
  }

  if (disposalFallbackContext && priceBreakdown.length) {
    const disposalDirectGroups: PriceBreakdownGroup[] = [
      "Material",
      "Personal",
      "Maschinen",
      "LKW / Transport",
      "Entsorgung",
      "Fremdleistung",
      "Gemeinkosten",
    ];

    const disposalBase = round2(
      priceBreakdown
        .filter((x) => disposalDirectGroups.includes(x.group))
        .reduce((sum, x) => sum + n(x.total), 0)
    );

    if (disposalBase > 0) {
      const maxRisk = round2(disposalBase * 0.12);
      const maxProfit = round2(disposalBase * 0.15);

      for (const line of priceBreakdown) {
        if (line.group === "Risiko" && n(line.total) > maxRisk) {
          line.qty = 1;
          line.price = maxRisk;
          line.total = maxRisk;
          line.note = "RLC Guard: Risiko für Entsorgung auf plausiblen Maximalwert begrenzt, da OpenAI Wert pro m³ unplausibel hoch war.";
        }

        if (line.group === "Gewinn" && n(line.total) > maxProfit) {
          line.qty = 1;
          line.price = maxProfit;
          line.total = maxProfit;
          line.note = "RLC Guard: Gewinn für Entsorgung auf plausiblen Maximalwert begrenzt, da OpenAI Wert pro m³ unplausibel hoch war.";
        }
      }

      breakdownTotal = sumBreakdown(priceBreakdown);
    }
  }

  const testingGuardContext =
    /dichtheitsprüfung|dichtheitspruefung|druckprüfung|druckpruefung|spülung|spuelung|tv-inspektion|kamerabefahrung|prüfprotokoll|pruefprotokoll|abnahmeunterlagen|bestandsfreigabe|funktionsprüfung|funktionspruefung/.test(norm(`${kurztext} ${langtext}`));

  const riskSoilFallbackContext =
    /kampfmittel|kampfmittelsondierung|altlast|altlasten|bodenkontamination|bodenklasse unbekannt|bodenanalyse|gutachter|sicherheitsfreigabe|beweissicherung|zustandsaufnahme|rissprotokoll|baubegleitende kontrolle|bodenrisiko|bodenrisiken/.test(norm(`${kurztext} ${langtext}`));

  if (riskSoilFallbackContext) {
    const riskSoilText = norm(
      priceBreakdown
        .map((x) => `${x.group} ${x.name} ${x.note}`)
        .join(" ")
    );

    const riskSoilTotal = sumBreakdown(priceBreakdown);

    const hasGenericAuthorityBreakdown =
      /genehmigung|genehmigungen|behördenauflagen|behoerdenauflagen|verkehrsrechtliche anordnung|denkmalpflege|archäologie|archaeologie|sigeko|arbeitssicherheit|sicherheitskonzept/.test(riskSoilText);

    const missingRequiredRiskSoilParts =
      !/anfahrt|einrichtung|koordination/.test(riskSoilText) ||
      !/kampfmittel|sondierung|sicherheitsfreigabe|freigabe/.test(riskSoilText) ||
      !/altlast|bodenkontamination|bodenanalyse|bodenklasse/.test(riskSoilText) ||
      !/gutachter|fachfirma|baubegleitende kontrolle/.test(riskSoilText) ||
      !/beweissicherung|zustandsaufnahme|rissprotokoll/.test(riskSoilText) ||
      !/dokumentation|nachweise|freigabeunterlagen/.test(riskSoilText);

    if (
      priceBreakdown.length < 8 ||
      hasGenericAuthorityBreakdown ||
      missingRequiredRiskSoilParts ||
      riskSoilTotal < 26000 ||
      riskSoilTotal > 46000
    ) {
      priceBreakdown = [
        {
          id: crypto.randomUUID(),
          group: "LKW / Transport",
          name: "Anfahrt / Einrichtung / Koordination",
          unit: einheit,
          qty: 1,
          price: 1800,
          total: 1800,
          note: "Fallback: Anfahrt, Einrichtung und Koordination separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "Kampfmittelsondierung / Sicherheitsfreigabe",
          unit: einheit,
          qty: 1,
          price: 8500,
          total: 8500,
          note: "Fallback: Kampfmittelsondierung und Sicherheitsfreigabe separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "Altlastenprüfung / Bodenkontamination / Bodenanalyse",
          unit: einheit,
          qty: 1,
          price: 7200,
          total: 7200,
          note: "Fallback: Bodenanalyse/Altlastenprüfung separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "Gutachter / Fachfirma / baubegleitende Kontrolle",
          unit: einheit,
          qty: 1,
          price: 6200,
          total: 6200,
          note: "Fallback: Gutachter/Fachfirma/baubegleitende Kontrolle separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "Beweissicherung / Zustandsaufnahme / Rissprotokoll",
          unit: einheit,
          qty: 1,
          price: 4200,
          total: 4200,
          note: "Fallback: Beweissicherung/Zustandsaufnahme/Rissprotokoll separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Personal",
          name: "Dokumentation / Nachweise / Freigabeunterlagen",
          unit: einheit,
          qty: 1,
          price: 2400,
          total: 2400,
          note: "Fallback: Dokumentation und Freigabeunterlagen separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Gemeinkosten",
          name: "Gemeinkosten",
          unit: einheit,
          qty: 1,
          price: 2600,
          total: 2600,
          note: "Fallback: Gemeinkosten.",
        },
        {
          id: crypto.randomUUID(),
          group: "Risiko",
          name: "Risiko",
          unit: einheit,
          qty: 1,
          price: 2200,
          total: 2200,
          note: "Fallback: Risiko wegen Kampfmittel-/Altlasten-/Freigabeabhängigkeit.",
        },
        {
          id: crypto.randomUUID(),
          group: "Gewinn",
          name: "Gewinn",
          unit: einheit,
          qty: 1,
          price: 3000,
          total: 3000,
          note: "Fallback: Gewinn.",
        },
      ];

      breakdownTotal = sumBreakdown(priceBreakdown);
    }
  }

  const houseConnectionFallbackContext =
    /hausanschluss|hausanschlüsse|hausanschluesse|kernbohrung|wanddurchführung|wanddurchfuehrung|hauseinführung|hauseinfuehrung|gebäudeeinführung|gebaeudeeinfuehrung|innenhof|privatgrund|privatfläche|privatflaeche|eigentümer|eigentuemer|handschachtung|wiederherstellung.*privat|arbeiten am bestand|bestand/.test(norm(`${kurztext} ${langtext}`));

  if (houseConnectionFallbackContext) {
    const houseText = norm(
      priceBreakdown
        .map((x) => `${x.group} ${x.name} ${x.note}`)
        .join(" ")
    );

    const houseTotal = sumBreakdown(priceBreakdown);

    const missingRequiredHouseParts =
      !/zugang|anfahrt|einrichtung/.test(houseText) ||
      !/handschachtung|innenhof|beengter zugang|beengt/.test(houseText) ||
      !/kernbohrung|wanddurchführung|wanddurchfuehrung/.test(houseText) ||
      !/hauseinführung|hauseinfuehrung|anschluss an bestand|bestand/.test(houseText) ||
      !/schutz|oberfläche|oberflaeche/.test(houseText) ||
      !/wiederherstellung|privatfläche|privatflaeche/.test(houseText) ||
      !/eigentümer|eigentuemer|abstimmung|termin/.test(houseText) ||
      !/dokumentation|nachweis/.test(houseText);

    if (priceBreakdown.length < 8 || missingRequiredHouseParts || houseTotal < 4200 || houseTotal > 8500) {
      priceBreakdown = [
        {
          id: crypto.randomUUID(),
          group: "LKW / Transport",
          name: "Baustellenzugang / Anfahrt / Einrichtung",
          unit: einheit,
          qty: 1,
          price: 450,
          total: 450,
          note: "Fallback: Zugang/Anfahrt/Einrichtung separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Personal",
          name: "Handschachtung / Innenhof / beengter Zugang",
          unit: einheit,
          qty: 1,
          price: 1250,
          total: 1250,
          note: "Fallback: Handschachtung im Bestand/Innenhof separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "Kernbohrung / Wanddurchführung",
          unit: einheit,
          qty: 1,
          price: 850,
          total: 850,
          note: "Fallback: Kernbohrung/Wanddurchführung separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "Hauseinführung / Anschluss an Bestand",
          unit: einheit,
          qty: 1,
          price: 1450,
          total: 1450,
          note: "Fallback: Hauseinführung/Bestandsanschluss separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Material",
          name: "Schutz vorhandener Oberflächen",
          unit: einheit,
          qty: 1,
          price: 350,
          total: 350,
          note: "Fallback: Oberflächenschutz separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "Wiederherstellung Privatfläche",
          unit: einheit,
          qty: 1,
          price: 950,
          total: 950,
          note: "Fallback: Wiederherstellung Privatfläche separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Personal",
          name: "Eigentümerabstimmung / Termine",
          unit: einheit,
          qty: 1,
          price: 350,
          total: 350,
          note: "Fallback: Eigentümerabstimmung separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Personal",
          name: "Dokumentation / Nachweise",
          unit: einheit,
          qty: 1,
          price: 250,
          total: 250,
          note: "Fallback: Dokumentation/Nachweise separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Gemeinkosten",
          name: "Gemeinkosten",
          unit: einheit,
          qty: 1,
          price: 550,
          total: 550,
          note: "Fallback: Gemeinkosten.",
        },
        {
          id: crypto.randomUUID(),
          group: "Risiko",
          name: "Risiko",
          unit: einheit,
          qty: 1,
          price: 450,
          total: 450,
          note: "Fallback: Risiko wegen Bestand/Privatgrund/beengtem Zugang.",
        },
        {
          id: crypto.randomUUID(),
          group: "Gewinn",
          name: "Gewinn",
          unit: einheit,
          qty: 1,
          price: 650,
          total: 650,
          note: "Fallback: Gewinn.",
        },
      ];

      breakdownTotal = sumBreakdown(priceBreakdown);
    }
  }

  const specialCivilFallbackContext =
    /spezialtiefbau|baugrubenverbau|spundwand|bohrpfahl|unterfangung|wasserhaltung|bodenverbesserung|hdi|injektion|pressung|microtunneling|rohrvortrieb|vortrieb|pressanlage|bohrgerät|bohrgeraet|injektionsanlage/.test(norm(`${kurztext} ${langtext}`));

  if (specialCivilFallbackContext) {
    const specialCivilTotal = sumBreakdown(priceBreakdown);
    const specialCivilGrossTotal =
      normUnit(einheit) === "m" && menge > 1
        ? round2(specialCivilTotal * menge)
        : specialCivilTotal;

    const specialCivilText = norm(
      priceBreakdown
        .map((x) => `${x.group} ${x.name} ${x.note}`)
        .join(" ")
    );

    const missingRequiredSpecialCivilParts =
      !/antransport|einrichtung|spezialgerät|spezialgeraet/.test(specialCivilText) ||
      !/verbau|spundwand|bohrpfahl|unterfangung/.test(specialCivilText) ||
      !/wasserhaltung|pumpen/.test(specialCivilText) ||
      !/bodenverbesserung|hdi|injektion/.test(specialCivilText) ||
      !/pressung|microtunneling|rohrvortrieb|vortrieb/.test(specialCivilText) ||
      !/kolonne|bauleitung|vermessung/.test(specialCivilText) ||
      !/rückbau|rueckbau|abbau|logistik/.test(specialCivilText);

    if (
      priceBreakdown.length === 0 ||
      missingRequiredSpecialCivilParts ||
      specialCivilTotal <= 0 ||
      specialCivilGrossTotal < 75000
    ) {
      priceBreakdown = [
        {
          id: crypto.randomUUID(),
          group: "LKW / Transport",
          name: "Spezialgeräte-Antransport / Einrichtung",
          unit: einheit,
          qty: 1,
          price: 6500,
          total: 6500,
          note: "Fallback: Spezialgerät-Antransport und Einrichtung separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "Baugrubenverbau / Spundwand / Bohrpfahl / Unterfangung",
          unit: einheit,
          qty: 1,
          price: 12000,
          total: 12000,
          note: "Fallback: komplexer Verbau separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Maschinen",
          name: "Komplexe Wasserhaltung / Pumpen",
          unit: einheit,
          qty: 1,
          price: 4500,
          total: 4500,
          note: "Fallback: Wasserhaltung/Pumpen separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "Bodenverbesserung / HDI / Injektion",
          unit: einheit,
          qty: 1,
          price: 7000,
          total: 7000,
          note: "Fallback: Bodenverbesserung/HDI/Injektion separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "Pressung / Microtunneling / Rohrvortrieb",
          unit: einheit,
          qty: 1,
          price: 18000,
          total: 18000,
          note: "Fallback: Vortrieb/Pressung separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Personal",
          name: "Spezialtiefbau-Kolonne / Bauleitung / Vermessung",
          unit: einheit,
          qty: 1,
          price: 9500,
          total: 9500,
          note: "Fallback: Fachkolonne/Bauleitung/Vermessung separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "LKW / Transport",
          name: "Rückbau / Abbau / Logistik",
          unit: einheit,
          qty: 1,
          price: 4000,
          total: 4000,
          note: "Fallback: Rückbau/Logistik separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Personal",
          name: "Dokumentation / Nachweise",
          unit: einheit,
          qty: 1,
          price: 1800,
          total: 1800,
          note: "Fallback: Dokumentation/Nachweise separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Gemeinkosten",
          name: "Gemeinkosten",
          unit: einheit,
          qty: 1,
          price: 6000,
          total: 6000,
          note: "Fallback: Gemeinkosten.",
        },
        {
          id: crypto.randomUUID(),
          group: "Risiko",
          name: "Risiko",
          unit: einheit,
          qty: 1,
          price: 5500,
          total: 5500,
          note: "Fallback: hohes Risiko wegen Spezialtiefbau/beengter Bauweise.",
        },
        {
          id: crypto.randomUUID(),
          group: "Gewinn",
          name: "Gewinn",
          unit: einheit,
          qty: 1,
          price: 7000,
          total: 7000,
          note: "Fallback: Gewinn.",
        },
      ];

      if (normUnit(einheit) === "m" && menge > 1) {
        for (const line of priceBreakdown) {
          const totalPauschal = n(line.total);
          const epPerUnit = round2(totalPauschal / menge);

          line.unit = einheit;
          line.qty = 1;
          line.price = epPerUnit;
          line.total = epPerUnit;
          line.note = `${s(line.note)} · RLC Spezialtiefbau: Pauschalansatz auf ${menge} ${einheit} umgelegt.`;
        }
      }

      breakdownTotal = sumBreakdown(priceBreakdown);
    }
  }

  const waterHoldingFallbackContext =
    /wasserhaltung|grundwasserabsenkung|baugrubenentwässerung|baugrubenentwaesserung|pumpensumpf|pumpenanlage|filterbrunnen|drainage|wasserableitung|einleitgenehmigung|dauerbetrieb|pumpenwartung|notstrom|ausfallsicherung|grundwasserhaltung/.test(norm(`${kurztext} ${langtext}`));

  if (waterHoldingFallbackContext) {
    const waterText = norm(
      priceBreakdown
        .map((x) => `${x.group} ${x.name} ${x.note}`)
        .join(" ")
    );

    const hasGenericAuthorityBreakdown =
      /genehmigung|genehmigungen|behördenauflagen|behoerdenauflagen|verkehrsrechtliche anordnung|denkmalpflege|archäologie|archaeologie|sigeko|arbeitssicherheit|sicherheitskonzept|kampfmittel/.test(waterText);

    const hasGenericSpecialCivilBreakdown =
      /spezialtiefbau|spundwand|bohrpfahl|unterfangung|microtunneling|rohrvortrieb|pressung/.test(waterText);

    const missingRequiredWaterParts =
      !/pumpe|pumpenanlage|pumpensumpf/.test(waterText) ||
      !/grundwasser|wasserhaltung|baugrubenentwässerung|baugrubenentwaesserung/.test(waterText) ||
      !/ableitung|einleitgenehmigung/.test(waterText) ||
      !/dauerbetrieb|wartung|kontrolle/.test(waterText) ||
      !/notstrom|ausfallsicherung/.test(waterText);

    if (
      priceBreakdown.length < 8 ||
      hasGenericAuthorityBreakdown ||
      hasGenericSpecialCivilBreakdown ||
      missingRequiredWaterParts
    ) {
      priceBreakdown = [
        {
          id: crypto.randomUUID(),
          group: "LKW / Transport",
          name: "Anfahrt / Einrichtung / Aufbau Wasserhaltung",
          unit: einheit,
          qty: 1,
          price: 1800,
          total: 1800,
          note: "Fallback: Anfahrt, Einrichtung und Aufbau separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Maschinen",
          name: "Pumpenanlage / Pumpensumpf / Filterbrunnen",
          unit: einheit,
          qty: 1,
          price: 6800,
          total: 6800,
          note: "Fallback: Pumpenanlage, Pumpensumpf und Filterbrunnen separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "Grundwasserabsenkung / Baugrubenentwässerung",
          unit: einheit,
          qty: 1,
          price: 8500,
          total: 8500,
          note: "Fallback: Grundwasserabsenkung und Baugrubenentwässerung separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Material",
          name: "Drainage / Wasserableitung / Leitungen",
          unit: einheit,
          qty: 1,
          price: 3200,
          total: 3200,
          note: "Fallback: Drainage, Wasserableitung und Leitungen separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "Einleitgenehmigung / Wasserrecht / Nachweise",
          unit: einheit,
          qty: 1,
          price: 2400,
          total: 2400,
          note: "Fallback: Einleitgenehmigung und Nachweise separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Personal",
          name: "Dauerbetrieb / Kontrolle / Pumpenwartung",
          unit: einheit,
          qty: 1,
          price: 5400,
          total: 5400,
          note: "Fallback: Dauerbetrieb, Kontrolle und Pumpenwartung separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Maschinen",
          name: "Notstrom / Ausfallsicherung",
          unit: einheit,
          qty: 1,
          price: 2600,
          total: 2600,
          note: "Fallback: Notstrom und Ausfallsicherung separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "LKW / Transport",
          name: "Rückbau / Abbau / Abtransport",
          unit: einheit,
          qty: 1,
          price: 1800,
          total: 1800,
          note: "Fallback: Rückbau, Abbau und Abtransport separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Gemeinkosten",
          name: "Gemeinkosten",
          unit: einheit,
          qty: 1,
          price: 2800,
          total: 2800,
          note: "Fallback: Gemeinkosten.",
        },
        {
          id: crypto.randomUUID(),
          group: "Risiko",
          name: "Risiko",
          unit: einheit,
          qty: 1,
          price: 2600,
          total: 2600,
          note: "Fallback: Risiko wegen Wasserandrang, Dauerbetrieb und Ausfallrisiko.",
        },
        {
          id: crypto.randomUUID(),
          group: "Gewinn",
          name: "Gewinn",
          unit: einheit,
          qty: 1,
          price: 3400,
          total: 3400,
          note: "Fallback: Gewinn.",
        },
      ];

      breakdownTotal = sumBreakdown(priceBreakdown);
    }
  }

  const authorityFallbackContext =
    !riskSoilFallbackContext &&
    !waterHoldingFallbackContext &&
    /genehmigung|genehmigungen|behörde|behoerde|behörden|behoerden|auflage|auflagen|verkehrsrechtliche anordnung|sigeko|arbeitssicherheit|sicherheitskonzept|sicherheitsbeauftragter|denkmalpflege|archäologisch|archaeologisch|freigaben/.test(norm(`${kurztext} ${langtext}`));

  if (authorityFallbackContext) {
    const authorityText = norm(
      priceBreakdown
        .map((x) => `${x.group} ${x.name} ${x.note}`)
        .join(" ")
    );

    const missingRequiredAuthorityParts =
      !/genehmigung|behörde|behoerde|auflage/.test(authorityText) ||
      !/verkehrsrechtliche anordnung|verkehrsrechtlich/.test(authorityText) ||
      !/sigeko|arbeitssicherheit|sicherheitskonzept|sicherheitsbeauftragter/.test(authorityText) ||
      !/denkmal|archäologisch|archaeologisch/.test(authorityText) ||
      !/kampfmittel|sondierung|freigabe/.test(authorityText) ||
      !/dokumentation|unterlagen|nachweise/.test(authorityText);

    const authorityTotal = sumBreakdown(priceBreakdown);

    if (priceBreakdown.length <= 5 || missingRequiredAuthorityParts || authorityTotal > 60000) {
      priceBreakdown = [
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "Genehmigungen / Behördenauflagen",
          unit: einheit,
          qty: 1,
          price: 2200,
          total: 2200,
          note: "Fallback: Genehmigungen/Behördenauflagen separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "Verkehrsrechtliche Anordnung",
          unit: einheit,
          qty: 1,
          price: 1800,
          total: 1800,
          note: "Fallback: verkehrsrechtliche Anordnung separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Personal",
          name: "Behördenabstimmung / Termine / Freigaben",
          unit: einheit,
          qty: 1,
          price: 3600,
          total: 3600,
          note: "Fallback: Behördenabstimmung über Laufzeit separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "SiGeKo / Arbeitssicherheit / Sicherheitskonzept",
          unit: einheit,
          qty: 1,
          price: 4200,
          total: 4200,
          note: "Fallback: Sicherheitskoordination separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "Denkmalpflege / archäologische Begleitung",
          unit: einheit,
          qty: 1,
          price: 3500,
          total: 3500,
          note: "Fallback: Denkmalpflege/Archäologie separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "Kampfmittelsondierung / Freigabe",
          unit: einheit,
          qty: 1,
          price: 6500,
          total: 6500,
          note: "Fallback: Kampfmittelsondierung/Freigabe separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Personal",
          name: "Dokumentation / Unterlagen / Nachweise",
          unit: einheit,
          qty: 1,
          price: 2400,
          total: 2400,
          note: "Fallback: Dokumentation/Nachweise separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "LKW / Transport",
          name: "Anfahrt / Logistik / Ortstermine",
          unit: einheit,
          qty: 1,
          price: projectDistanceKm > 0 ? 1200 : 900,
          total: projectDistanceKm > 0 ? 1200 : 900,
          note: `Fallback: Ortstermine/Anfahrt separat angesetzt${projectDistanceKm > 0 ? `, Entfernung ${projectDistanceKm} km` : ""}.`,
        },
        {
          id: crypto.randomUUID(),
          group: "Gemeinkosten",
          name: "Gemeinkosten",
          unit: einheit,
          qty: 1,
          price: 2500,
          total: 2500,
          note: "Fallback: Gemeinkosten.",
        },
        {
          id: crypto.randomUUID(),
          group: "Risiko",
          name: "Risiko",
          unit: einheit,
          qty: 1,
          price: 1800,
          total: 1800,
          note: "Fallback: Risiko wegen Behörden-/Freigabeabhängigkeit.",
        },
        {
          id: crypto.randomUUID(),
          group: "Gewinn",
          name: "Gewinn",
          unit: einheit,
          qty: 1,
          price: 2400,
          total: 2400,
          note: "Fallback: Gewinn.",
        },
      ];

      breakdownTotal = sumBreakdown(priceBreakdown);
    }
  }

  const logisticsFallbackContext =
    /baustellenlogistik|baustellenzufahrt|zufahrtssicherung|lagerfläche|lagerflaeche|zwischenlager|materialumschlag|baustrom|baustellenbeleuchtung|stromprovisorium|baustellenwasser|spezialgeräte|spezialgeraete|mietverlängerung|mietverlaengerung/.test(norm(`${kurztext} ${langtext}`));

  if (logisticsFallbackContext) {
    const logisticsText = norm(
      priceBreakdown
        .map((x) => `${x.group} ${x.name} ${x.note}`)
        .join(" ")
    );

    const missingRequiredLogisticsParts =
      !/zufahrt|baustellenzufahrt|zufahrtssicherung/.test(logisticsText) ||
      !/lagerfläche|lagerflaeche|zwischenlager|lagerflächen|lagerflaechen/.test(logisticsText) ||
      !/materialumschlag|umschlag|radlader|stapler/.test(logisticsText) ||
      !/baustrom|stromprovisorium|beleuchtung|baustellenbeleuchtung/.test(logisticsText) ||
      !/baustellenwasser|wasseranschluss|bauwasser|wasser/.test(logisticsText) ||
      !/spezialgeräte|spezialgeraete|miete|mietverlängerung|mietverlaengerung/.test(logisticsText) ||
      !/kontrolle|betrieb|vorhaltung|laufzeit|unterhaltung/.test(logisticsText) ||
      !/rückbau|rueckbau|abbau|logistik|anfahrt/.test(logisticsText);

    const hasOnlyGenericLogistics =
      priceBreakdown.length <= 3 ||
      !/zufahrt|lager|umschlag|baustrom|beleuchtung|wasser|spezialgerät|spezialgeraet|miete|vorhaltung|rückbau|rueckbau/.test(logisticsText) ||
      missingRequiredLogisticsParts;

    if (hasOnlyGenericLogistics) {
      priceBreakdown = [
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "Baustellenzufahrt / Zufahrtssicherung",
          unit: einheit,
          qty: 1,
          price: 1500,
          total: 1500,
          note: "Fallback: Zufahrt herstellen/sichern separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Gemeinkosten",
          name: "Lagerflächen / Zwischenlager",
          unit: einheit,
          qty: 1,
          price: 1200,
          total: 1200,
          note: "Fallback: Lagerfläche/Zwischenlager separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Maschinen",
          name: "Materialumschlag / Radlader / Stapler",
          unit: einheit,
          qty: 1,
          price: 1800,
          total: 1800,
          note: "Fallback: Materialumschlag mit Gerät separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Material",
          name: "Baustrom / Stromprovisorium / Beleuchtung",
          unit: einheit,
          qty: 1,
          price: 1500,
          total: 1500,
          note: "Fallback: Baustrom/Beleuchtung über Laufzeit separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Material",
          name: "Baustellenwasser / Wasseranschluss",
          unit: einheit,
          qty: 1,
          price: 900,
          total: 900,
          note: "Fallback: Baustellenwasser/Wasseranschluss separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Fremdleistung",
          name: "Spezialgeräte-Miete / Mietverlängerung",
          unit: einheit,
          qty: 1,
          price: 2200,
          total: 2200,
          note: "Fallback: Spezialgeräte-Miete/Mietverlängerung separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "Personal",
          name: "Kontrolle / Betrieb / Vorhaltung während Laufzeit",
          unit: einheit,
          qty: 1,
          price: 1800,
          total: 1800,
          note: "Fallback: Kontrolle/Betrieb/Vorhaltung über Laufzeit separat angesetzt.",
        },
        {
          id: crypto.randomUUID(),
          group: "LKW / Transport",
          name: "Rückbau / Abbau / Logistik / Anfahrt",
          unit: einheit,
          qty: 1,
          price: projectDistanceKm > 0 ? 1200 : 900,
          total: projectDistanceKm > 0 ? 1200 : 900,
          note: `Fallback: Rückbau/Logistik separat angesetzt${projectDistanceKm > 0 ? `, Entfernung ${projectDistanceKm} km` : ""}.`,
        },
        {
          id: crypto.randomUUID(),
          group: "Gemeinkosten",
          name: "Gemeinkosten",
          unit: einheit,
          qty: 1,
          price: 1600,
          total: 1600,
          note: "Fallback: Gemeinkosten.",
        },
        {
          id: crypto.randomUUID(),
          group: "Risiko",
          name: "Risiko",
          unit: einheit,
          qty: 1,
          price: 900,
          total: 900,
          note: "Fallback: Risiko wegen Logistik-/Vorhaltungsabhängigkeit.",
        },
        {
          id: crypto.randomUUID(),
          group: "Gewinn",
          name: "Gewinn",
          unit: einheit,
          qty: 1,
          price: 1200,
          total: 1200,
          note: "Fallback: Gewinn.",
        },
      ];

      breakdownTotal = sumBreakdown(priceBreakdown);
    }
  }

  if (testingGuardContext && priceBreakdown.length) {
    const testingDirectGroups: PriceBreakdownGroup[] = [
      "Material",
      "Personal",
      "Maschinen",
      "LKW / Transport",
      "Fremdleistung",
    ];

    const testingBase = round2(
      priceBreakdown
        .filter((x) => testingDirectGroups.includes(x.group))
        .reduce((sum, x) => sum + n(x.total), 0)
    );

    if (testingBase > 0) {
      const maxOverhead = round2(testingBase * 0.12);
      const maxRisk = round2(testingBase * 0.08);
      const maxProfit = round2(testingBase * 0.12);

      for (const line of priceBreakdown) {
        if (line.group === "Gemeinkosten" && n(line.total) > maxOverhead) {
          line.qty = 1;
          line.price = maxOverhead;
          line.total = maxOverhead;
          line.note = "RLC Guard: Gemeinkosten für Prüf-/Nachweisleistung auf plausiblen Maximalwert begrenzt.";
        }

        if (line.group === "Risiko" && n(line.total) > maxRisk) {
          line.qty = 1;
          line.price = maxRisk;
          line.total = maxRisk;
          line.note = "RLC Guard: Risiko für Prüf-/Nachweisleistung auf plausiblen Maximalwert begrenzt.";
        }

        if (line.group === "Gewinn" && n(line.total) > maxProfit) {
          line.qty = 1;
          line.price = maxProfit;
          line.total = maxProfit;
          line.note = "RLC Guard: Gewinn für Prüf-/Nachweisleistung auf plausiblen Maximalwert begrenzt.";
        }
      }

      const directAfterCaps = round2(
        priceBreakdown
          .filter((x) => testingDirectGroups.includes(x.group))
          .reduce((sum, x) => sum + n(x.total), 0)
      );

      const minRisk = round2(directAfterCaps * 0.03);
      const minProfit = round2(directAfterCaps * 0.05);

      for (const line of priceBreakdown) {
        if (line.group === "Risiko" && n(line.total) < minRisk) {
          line.qty = 1;
          line.price = minRisk;
          line.total = minRisk;
          line.note = "RLC Guard: Risiko für Prüf-/Nachweisleistung auf Mindestwert 3% der Direktkosten gesetzt.";
        }

        if (line.group === "Gewinn" && n(line.total) < minProfit) {
          line.qty = 1;
          line.price = minProfit;
          line.total = minProfit;
          line.note = "RLC Guard: Gewinn für Prüf-/Nachweisleistung auf Mindestwert 5% der Direktkosten gesetzt.";
        }
      }

      breakdownTotal = sumBreakdown(priceBreakdown);
    }

    const testingRlcMax = n(rlcPreisRange?.max);
    const testingHardCap = round2(Math.max(testingRlcMax > 0 ? testingRlcMax * 1.8 : 0, 45));

    if (testingHardCap > 0 && breakdownTotal > testingHardCap) {
      const factor = testingHardCap / breakdownTotal;

      for (const line of priceBreakdown) {
        line.price = round2(n(line.price) * factor);
        line.total = round2(n(line.total) * factor);
        line.note = `${s(line.note)} · RLC Guard: Prüf-/Nachweisleistung auf fachlichen Maximalwert ${testingHardCap} EUR/${einheit} skaliert.`;
      }

      breakdownTotal = sumBreakdown(priceBreakdown);
    }
  }

  const surfaceGuardText = norm(`${kurztext} ${langtext}`);
  const isSurfaceBreakdownGuard =
    !/geraetevorhaltung|gerätevorhaltung|bauzeitunterbrechung|stillstand|wartezeit|wartezeiten|leitungsfreigabe|behoerdliche freigabe|behördliche freigabe|bauablaufstoerung|bauablaufstörung/.test(surfaceGuardText) &&
    /oberfläche|oberflaeche|oberflächen|oberflaechen|wiederherstellung|verkehrsfläche|verkehrsflaeche|asphalt|asphaltaufbruch|fräsen|fraesen|frostschutz|schottertragschicht|asphalttragschicht|asphaltdeckschicht|pflaster|pflasterfläche|pflasterflaeche|bordstein|bordsteine|rinne|rinnen|verkehrsfreigabe|aufbruchmaterial/.test(surfaceGuardText);

  const surfaceBreakdownLooksContaminated =
    priceBreakdown.some((x) =>
      /rlc-doc|hausanschluss|hauseinführung|hauseinfuehrung|kernbohrung|wanddurchführung|wanddurchfuehrung|bestandsplan|as-built|fotodokumentation|vermessung|cad-bearbeitung|übergabeunterlagen|uebergabeunterlagen|verkehrssicherung|rsa|notleitung|medienversorgung/.test(
        norm(`${x.group} ${x.name} ${x.note}`)
      )
    ) || round2(breakdownTotal || directTotal) < 25000;

  if (isSurfaceBreakdownGuard && surfaceBreakdownLooksContaminated) {
    const km = Math.max(0, projectDistanceKm || 0);

    const makeSurfaceLine = (
      group: PriceBreakdownGroup,
      name: string,
      price: number,
      note: string
    ): PriceBreakdownLine => ({
      id: `rlc-surface-${Math.random().toString(36).slice(2)}`,
      group,
      name,
      unit: "Psch",
      qty: 1,
      price: round2(price),
      total: round2(price),
      note,
    });

    const aufbruch = 5200;
    const entsorgung = 4200;
    const frostschutz = 9800;
    const asphaltTrag = 11200;
    const asphaltDeck = 9800;
    const pflaster = 7600;
    const bordstein = 7200;
    const verdichtung = 4200;
    const verkehrNeben = 3200;
    const logistik = Math.max(1800, km * 45);

    const direct =
      aufbruch +
      entsorgung +
      frostschutz +
      asphaltTrag +
      asphaltDeck +
      pflaster +
      bordstein +
      verdichtung +
      verkehrNeben +
      logistik;

    const overhead = round2(direct * 0.1);
    const risk = round2(direct * 0.07);
    const profit = round2((direct + overhead + risk) * 0.08);

    priceBreakdown = [
      makeSurfaceLine("Fremdleistung", "Aufbruch / Fräsen / Ausbau Oberfläche", aufbruch, "Aufbruch und Vorbereitung der Verkehrsfläche."),
      makeSurfaceLine("Entsorgung", "Entsorgung Aufbruchmaterial", entsorgung, "Laden, Transport und Entsorgung von Aufbruchmaterial."),
      makeSurfaceLine("Material", "Frostschutz / Schottertragschicht", frostschutz, "Einbau und Verdichtung der Frostschutz- und Schottertragschicht."),
      makeSurfaceLine("Fremdleistung", "Asphalttragschicht", asphaltTrag, "Einbau Asphalttragschicht inkl. Geräte und Kolonne."),
      makeSurfaceLine("Fremdleistung", "Asphaltdeckschicht", asphaltDeck, "Einbau Asphaltdeckschicht inkl. Anschluss an Bestand."),
      makeSurfaceLine("Fremdleistung", "Pflasterflächen / Anpassungen", pflaster, "Wiederherstellung Pflasterflächen und Anpassungsarbeiten."),
      makeSurfaceLine("Fremdleistung", "Bordsteine / Rinnen", bordstein, "Bordstein- und Rinnenarbeiten ca. 45 m."),
      makeSurfaceLine("Maschinen", "Verdichtung / Walze / Rüttelplatte", verdichtung, "Geräteeinsatz für Verdichtung und Oberflächenherstellung."),
      makeSurfaceLine("Personal", "Arbeiten unter Verkehr / Anwohner / Nebenarbeiten", verkehrNeben, "Nebenarbeiten, Anwohnerverkehr und Verkehrsfreigabe."),
      makeSurfaceLine("LKW / Transport", "Logistik / Materiallieferung / Anfahrt", logistik, `Materiallieferung, Geräte- und Baustellenlogistik, Entfernung ca. ${km} km.`),
      makeSurfaceLine("Gemeinkosten", "Gemeinkosten", overhead, "Gemeinkosten für Oberflächenwiederherstellung."),
      makeSurfaceLine("Risiko", "Risiko", risk, "Risiko wegen Anschluss an Bestand, Verkehrslage und Mischflächen."),
      makeSurfaceLine("Gewinn", "Gewinn", profit, "Kalkulatorischer Gewinn."),
    ];

    breakdownTotal = sumBreakdown(priceBreakdown);
  }

  const tempSupplyGuardText = norm(`${kurztext} ${langtext}`);
  const isTempSupplyBreakdownGuard =
    /notleitung|provisorische leitung|temporäre medienversorgung|temporaere medienversorgung|medienversorgung|ersatzversorgung|temporärer anschluss|temporaerer anschluss|temporäre anschlüsse|temporaere anschluesse|temporär.*anschluss|temporaer.*anschluss/.test(tempSupplyGuardText);

  const tempSupplyBreakdownLooksContaminated =
    priceBreakdown.some((x) =>
      /hausanschluss|hauseinführung|hauseinfuehrung|kernbohrung|wanddurchführung|wanddurchfuehrung|privatfläche|privatflaeche|bestandsplan|as-built|fotodokumentation|genehmigung|behörden|behoerden|kampfmittel|sigeko|denkmalpflege/.test(
        norm(`${x.group} ${x.name} ${x.note}`)
      )
    ) || round2(breakdownTotal || directTotal) < 12000;

  if (isTempSupplyBreakdownGuard && tempSupplyBreakdownLooksContaminated) {
    const km = Math.max(0, projectDistanceKm || 0);
    const days = Math.max(1, projectDurationDays || 1);
    const months = Math.max(1, days / 30);

    const makeTempLine = (
      group: PriceBreakdownGroup,
      name: string,
      price: number,
      note: string
    ): PriceBreakdownLine => ({
      id: `rlc-temp-${Math.random().toString(36).slice(2)}`,
      group,
      name,
      unit: "Psch",
      qty: 1,
      price: round2(price),
      total: round2(price),
      note,
    });

    const material = 8500;
    const montage = 7200;
    const anschluss = 4200;
    const pruefung = 2600;
    const betrieb = 1800 * months;
    const kontrolle = 1200 * months;
    const rueckbau = 4200;
    const logistik = Math.max(1800, km * 40);

    const direct = material + montage + anschluss + pruefung + betrieb + kontrolle + rueckbau + logistik;
    const overhead = round2(direct * 0.1);
    const risk = round2(direct * 0.08);
    const profit = round2((direct + overhead + risk) * 0.08);

    priceBreakdown = [
      makeTempLine("Material", "Rohrmaterial / Formstücke / Absperrarmaturen", material, "Material für provisorische Notleitung und temporäre Medienversorgung."),
      makeTempLine("Personal", "Herstellung / Montage der Notleitung", montage, "Montage, Verlegen und Sichern der temporären Versorgung."),
      makeTempLine("Fremdleistung", "Temporärer Anschluss an Bestand / Einbindung", anschluss, "Einbindung, Anschluss und Trennung vom Bestand."),
      makeTempLine("Fremdleistung", "Druckprüfung / Spülung / Inbetriebnahme", pruefung, "Prüfung, Spülung und Inbetriebnahme vor Nutzung."),
      makeTempLine("Personal", "Betrieb / Vorhaltung über Laufzeit", betrieb, `Betrieb und Vorhaltung über ca. ${days} Tage.`),
      makeTempLine("Personal", "Tägliche Kontrolle / Wartung", kontrolle, "Regelmäßige Kontrolle, Wartung und Störungsbereitschaft."),
      makeTempLine("LKW / Transport", "Rückbau / Trennung / Abtransport", rueckbau, "Rückbau, Trennung, Laden und Abtransport."),
      makeTempLine("LKW / Transport", "Logistik / Anfahrt / Materialtransport", logistik, `Anfahrt und Materialtransporte, Entfernung ca. ${km} km.`),
      makeTempLine("Gemeinkosten", "Gemeinkosten", overhead, "Gemeinkosten für temporäre Versorgung."),
      makeTempLine("Risiko", "Risiko", risk, "Risiko wegen Betrieb, Ausfall, Bestandseinbindung und Laufzeit."),
      makeTempLine("Gewinn", "Gewinn", profit, "Kalkulatorischer Gewinn."),
    ];

    breakdownTotal = sumBreakdown(priceBreakdown);
  }

  const documentationGuardText = norm(`${kurztext} ${langtext}`);
  const isDocumentationBreakdownGuard =
    !isSurfaceBreakdownGuard &&
    !/entsorgung|deponie|belasteter boden|belastet|haufwerk|analytik|deklarationsanalytik|laga|ersatzbaustoffv|wiegeschein|entsorgungsnachweis/.test(documentationGuardText) &&
    !/kampfmittel|kampfmittelsondierung|altlast|altlasten|bodenkontamination|bodenanalyse|gutachter|sicherheitsfreigabe|bodenrisiko|bodenrisiken/.test(documentationGuardText) &&
    /dokumentation|fotodokumentation|aufmaß|aufmass|massenermittlung|vermessung|vermessungsdaten|gnss|tachymeter|bestandsplan|bestandspläne|bestandsplaene|bestandszeichnung|cad|as-built|as built|dwg|dxf|landxml|übergabeunterlagen|uebergabeunterlagen|nachweisführung|nachweisfuehrung/.test(documentationGuardText);

  const breakdownLooksAuthorityContaminated =
    priceBreakdown.some((x) =>
      /genehmigung|behörden|behoerden|verkehrsrechtliche anordnung|sigeko|arbeitssicherheit|denkmalpflege|archäolog|archaeolog|kampfmittel|freigabe/.test(
        norm(`${x.group} ${x.name} ${x.note}`)
      )
    );

  if (isDocumentationBreakdownGuard && breakdownLooksAuthorityContaminated) {
    const km = Math.max(0, projectDistanceKm || 0);
    const days = Math.max(1, projectDurationDays || 1);

    const makeLine = (
      group: PriceBreakdownGroup,
      name: string,
      price: number,
      note: string
    ): PriceBreakdownLine => ({
      id: `rlc-doc-${Math.random().toString(36).slice(2)}`,
      group,
      name,
      unit: "Psch",
      qty: 1,
      price: round2(price),
      total: round2(price),
      note,
    });

    const photoDoc = 1800;
    const aufmass = 3200;
    const survey = 5200;
    const cadAsBuilt = 6800;
    const digitalHandover = 2800;
    const clientCoordination = 1800;
    const travelLogistics = Math.max(900, km * 35);
    const projectDurationFactor = Math.max(1, Math.min(3, days / 90));

    const directDoc =
      photoDoc +
      aufmass +
      survey +
      cadAsBuilt +
      digitalHandover +
      clientCoordination +
      travelLogistics;

    const durationSurcharge = round2((projectDurationFactor - 1) * 2500);
    const overhead = round2((directDoc + durationSurcharge) * 0.1);
    const risk = round2((directDoc + durationSurcharge) * 0.06);
    const profit = round2((directDoc + durationSurcharge + overhead + risk) * 0.08);

    priceBreakdown = [
      makeLine("Personal", "Fotodokumentation / digitale Baustellendokumentation", photoDoc, "Fotodokumentation und strukturierte digitale Nachweisführung."),
      makeLine("Personal", "Aufmaß / Massenermittlung", aufmass, "Aufmaß, Mengenermittlung und prüffähige Zusammenstellung."),
      makeLine("Fremdleistung", "Vermessung GNSS / Tachymeter", survey, "Vermessung von Leitungen, Schächten und relevanten Ausführungspunkten."),
      makeLine("Fremdleistung", "CAD-Bearbeitung / Bestandspläne / As-Built", cadAsBuilt, "CAD-Nachbearbeitung, Bestandsplanerstellung und As-Built-Dokumentation."),
      makeLine("Personal", "Übergabeunterlagen PDF/DWG/DXF/LandXML", digitalHandover, "Digitale Übergabeunterlagen in geforderten Datenformaten."),
      makeLine("Personal", "Abstimmung Auftraggeber / Planprüfung", clientCoordination, "Fachliche Abstimmung mit Auftraggeber und Planprüfung; keine Behörden-/Genehmigungsposition."),
      makeLine("LKW / Transport", "Anfahrt / Ortstermine / Vermessungstermine", travelLogistics, `Baustellenanfahrt und Ortstermine, Entfernung ca. ${km} km.`),
      makeLine("Gemeinkosten", "Projektlaufzeit-Zuschlag Dokumentation", durationSurcharge, `Zuschlag für Koordination über ca. ${days} Tage Bauzeit.`),
      makeLine("Gemeinkosten", "Gemeinkosten", overhead, "Gemeinkosten für Dokumentations- und Vermessungsabwicklung."),
      makeLine("Risiko", "Risiko", risk, "Prüfpflichtiges Risiko wegen unklarer Detailtiefe, Datenformaten und Übergabeanforderungen."),
      makeLine("Gewinn", "Gewinn", profit, "Kalkulatorischer Gewinn."),
    ].filter((x) => x.total > 0);

    breakdownTotal = sumBreakdown(priceBreakdown);
  }

  /**
   * Quelle der Wahrheit ist ab hier die Urkalkulation pro Einheit.
   * Dadurch bleiben Hauptkosten, EP, PDF und Frontend immer konsistent.
   */
  const normalizedMaterialCost = sumBreakdownGroup(priceBreakdown, ["Material"]);
  const normalizedLaborCost = sumBreakdownGroup(priceBreakdown, ["Personal"]);
  const normalizedMachineCost = sumBreakdownGroup(priceBreakdown, [
    "Maschinen",
    "LKW / Transport",
  ]);
  const normalizedSubcontractorCost = sumBreakdownGroup(priceBreakdown, ["Fremdleistung"]);
  const normalizedDisposalCost = sumBreakdownGroup(priceBreakdown, ["Entsorgung"]);
  const normalizedOverheadCost = sumBreakdownGroup(priceBreakdown, ["Gemeinkosten"]);
  const normalizedRiskCost = sumBreakdownGroup(priceBreakdown, ["Risiko"]);
  const normalizedProfitCost = sumBreakdownGroup(priceBreakdown, ["Gewinn"]);

  let suggestedUnitPrice = round2(breakdownTotal || directTotal);
  let finalUnitPrice = suggestedUnitPrice;
  const noX84LinearGuard = applyNoX84LinearPriceGuard({
    textRaw: `${kurztext || ""} ${langtext || ""}`,
    unitRaw: einheit,
    mengeRaw: menge,
    epRaw: finalUnitPrice,
    hasRealX84:
      Number((row as any).angebotUnitPrice || 0) > 0 ||
      Number((row as any).angebotTotal || 0) > 0 ||
      Number((row as any).originalPreKiPrice || 0) > 0 ||
      Number((row as any).x84UnitPrice || 0) > 0 ||
      String((row as any).gaebType || (row as any).importType || (row as any).importSource || "")
        .toLowerCase()
        .includes("x84"),
  });

  if (noX84LinearGuard.applied) {
    finalUnitPrice = noX84LinearGuard.ep;
  }


  const siteSetupGuardText = norm(`${kurztext} ${langtext}`);
  const isLongSiteSetupGuard =
    /baustelleneinrichtung|baustelle einrichten|baustellengemeinkosten|containeranlage|bürocontainer|buero container|büro container|buero-container|büro-container|mannschaftscontainer|sanitärcontainer|sanitaercontainer|lagercontainer|baustrom|bauwasser|baustellenbeleuchtung|sanitaer|sanitär/.test(siteSetupGuardText) &&
    projectDurationDays >= 180 &&
    normUnit(einheit) === "Psch";

  if (isLongSiteSetupGuard) {
    const months = Math.max(1, projectDurationDays / 30);
    const setupOnce = 8500;
    const dismantleOnce = 6500;
    const monthlyContainer = 1800 * months;
    const monthlyUtilities = 700 * months;
    const monthlyCleaningControl = 650 * months;
    const distanceLogistics = Math.max(2500, projectDistanceKm * 45);
    const minSiteSetup = round2(
      setupOnce +
      dismantleOnce +
      monthlyContainer +
      monthlyUtilities +
      monthlyCleaningControl +
      distanceLogistics
    );

    if (finalUnitPrice < minSiteSetup) {
      const factor = finalUnitPrice > 0 ? minSiteSetup / finalUnitPrice : 1;

      for (const line of priceBreakdown) {
        line.price = round2(n(line.price) * factor);
        line.total = round2(n(line.total) * factor);
        line.note = `${s(line.note)} · RLC Guard: Langzeit-Baustelleneinrichtung auf Mindest-Urkalkulation ${minSiteSetup} EUR skaliert.`;
      }

      breakdownTotal = sumBreakdown(priceBreakdown);
      suggestedUnitPrice = round2(breakdownTotal || minSiteSetup);
      finalUnitPrice = suggestedUnitPrice;
    }
  }

  const rawRisk = s(parsed.riskLevel);
  const riskLevel: RiskLevel =
    rawRisk === "low" || rawRisk === "medium" || rawRisk === "high"
      ? rawRisk
      : riskFromText(text, einheit, menge);

  const confidence = Math.max(
    0.25,
    Math.min(0.92, round2(n(parsed.confidence, confidenceFrom(row, riskLevel, matches, "openai"))))
  );

  const contextSensitiveOpenAi = isContextSensitivePosition(text, einheit);

  const contextQualityWarnings: string[] = [];

  if (contextSensitiveOpenAi) {
    const months = projectDurationDays > 0 ? projectDurationDays / 30 : 0;

    const contextBreakdownText = norm(
      priceBreakdown
        .map((x) => `${x.group} ${x.name} ${x.unit} ${x.qty} ${x.price} ${x.total} ${x.note}`)
        .join(" ")
    );

    const rowContextText = norm(`${kurztext} ${langtext}`);

    const isSurfaceRestorationContext =
      /oberfläche|oberflaeche|oberflächen|oberflaechen|wiederherstellung|verkehrsfläche|verkehrsflaeche|asphalt|asphaltaufbruch|fräsen|fraesen|frostschutz|schottertragschicht|asphalttragschicht|asphaltdeckschicht|pflaster|pflasterfläche|pflasterflaeche|bordstein|bordsteine|rinne|rinnen|verdichtung|verkehrsfreigabe|aufbruchmaterial/.test(rowContextText);

    const isAuthorityContext =
      /genehmigung|genehmigungen|behörde|behoerde|behörden|behoerden|auflage|auflagen|verkehrsrechtliche anordnung|sigeko|sige ko|arbeitssicherheit|sicherheitskonzept|sicherheitsbeauftragter|denkmalpflege|archäologisch|archaeologisch|kampfmittel|sondierung|freigabe|freigaben/.test(rowContextText);

    const isSiteSetupContext =
      !isAuthorityContext &&
      /baustelleneinrichtung|baustelle einrichten|baustellengemeinkosten|containeranlage|bürocontainer|buero container|büro container|buero-container|büro-container|mannschaftscontainer|sanitärcontainer|sanitaercontainer|lagercontainer|baustrom|bauwasser|baustellenbeleuchtung|sanitaer|sanitär/.test(rowContextText);

    const isLogisticsContext =
      !isAuthorityContext &&
      !isSiteSetupContext &&
      /baustellenlogistik|baustellenzufahrt|zufahrtssicherung|lagerfläche|lagerflaeche|zwischenlager|materialumschlag|spezialgeräte|spezialgeraete|mietverlängerung|mietverlaengerung/.test(rowContextText);

    const isProtectionContext =
      !isLogisticsContext &&
      /schutzmaßnahme|schutzmassnahme|lärmschutz|laermschutz|staubschutz|erschütterungsschutz|erschuetterungsschutz|baumschutz|wurzelschutz|gewässerschutz|gewaesserschutz|ölbindemittel|oelbindemittel|havarie|anwohnerinformation|beweissicherung|zustandsdokumentation|umweltschutz|naturschutz/.test(rowContextText);

    const isTemporarySupplyContext =
      !isProtectionContext &&
      /notleitung|temporaer.*anschluss|temporär.*anschluss|temporaere.*anschluesse|temporäre.*anschlüsse|provisorische leitung|medienversorgung|ersatzversorgung|anschluss an bestand|druckpruefung|druckprüfung|absperrarmatur|formstueck|formstück/.test(rowContextText);

    const isTrafficSafetyContext =
      !isProtectionContext &&
      /verkehrssicherung|verkehrsfuehrung|verkehrsführung|strassensperrung|straßensperrung|sperrung|beschilderung|absperrung|lichtsignalanlage|baustellenampel|ampel|verkehrszeichen|leitbake|leitbaken|fußgängerführung|fussgängerführung|fussgaengerfuehrung|anwohnerverkehr|\brsa\b/.test(rowContextText);

    const isProvisoriumContext =
      !isLogisticsContext &&
      !isProtectionContext &&
      !isTemporarySupplyContext &&
      !isTrafficSafetyContext &&
      /provisor|baustrasse|baustraße|umleitung|baustellenumleitung|temporaer|temporär|rueckbau|rückbau|unterhalten|unterhaltung/.test(rowContextText);

    const isTestingContext =
      !isProtectionContext &&
      /dichtheitsprüfung|dichtheitspruefung|druckprüfung|druckpruefung|spülung|spuelung|tv-inspektion|kamerabefahrung|prüfprotokoll|pruefprotokoll|abnahmeunterlagen|bestandsfreigabe|funktionsprüfung|funktionspruefung/.test(rowContextText);

    const isDocumentationContext =
      !isAuthorityContext &&
      !isProtectionContext &&
      !isTestingContext &&
      /dokumentation|fotodokumentation|aufmass|aufmaß|bestandsplan|bestandsplaene|bestandspläne|vermessung|vermessungsdaten|as-built|as built|uebergabeunterlagen|übergabeunterlagen|behoerden|behörden|auftraggeber/.test(rowContextText);

    const isVorhaltungContext =
      !isAuthorityContext &&
      !isProtectionContext &&
      !isTestingContext &&
      /geraetevorhaltung|gerätevorhaltung|bauzeitunterbrechung|stillstand|wartezeit|wartezeiten|leitungsfreigabe|freigabe|bauablaufstoerung|bauablaufstörung/.test(rowContextText);

    const isSiteSetupLongDurationContext =
      isSiteSetupContext ||
      (
        !isProtectionContext &&
        !isTrafficSafetyContext &&
        !isDocumentationContext &&
        !isVorhaltungContext &&
        /baustelleneinrichtung|vorhaltung|baustellengemeinkosten|container|baustrom|bauwasser|sanitaer|sanitär/.test(rowContextText)
      );

    const hasContainer = /container|baustelleneinrichtung/.test(contextBreakdownText);
    const hasUtilities = /baustrom|bauwasser|sanitaer|sanitär|toilette|wc/.test(contextBreakdownText);
    const hasTransport = /antransport|abtransport|transport|fahrt|fahrten|logistik|anfahrt/.test(contextBreakdownText);

    const hasLogisticsAccess = /zufahrt|baustellenzufahrt|zufahrtssicherung|sicherung/.test(contextBreakdownText);
    const hasLogisticsStorage = /lagerfläche|lagerflaeche|zwischenlager|lager/.test(contextBreakdownText);
    const hasLogisticsHandling = /materialumschlag|umschlag|radlader|stapler/.test(contextBreakdownText);
    const hasLogisticsPowerLight = /baustrom|stromprovisorium|beleuchtung|baustellenbeleuchtung|verteiler/.test(contextBreakdownText);
    const hasLogisticsWater = /baustellenwasser|wasseranschluss|bauwasser/.test(contextBreakdownText);
    const hasLogisticsRental = /spezialgeräte|spezialgeraete|miete|mietverlängerung|mietverlaengerung/.test(contextBreakdownText);
    const hasLogisticsOperation = /kontrolle|betrieb|vorhaltung|laufzeit|unterhaltung/.test(contextBreakdownText);
    const hasLogisticsRemoval = /rückbau|rueckbau|abbau|logistik|anfahrt/.test(contextBreakdownText);

    const hasProtectionNoiseDustVibration = /lärmschutz|laermschutz|staubschutz|erschütterung|erschuetterung/.test(contextBreakdownText);
    const hasProtectionTreeRoot = /baumschutz|wurzelschutz|baum|wurzel/.test(contextBreakdownText);
    const hasProtectionWaterHavarie = /gewässerschutz|gewaesserschutz|ölbindemittel|oelbindemittel|havarie/.test(contextBreakdownText);
    const hasProtectionResidents = /anwohner|information|bürger|buerger/.test(contextBreakdownText);
    const hasProtectionEvidence = /beweissicherung|zustandsdokumentation|zustand|dokumentation/.test(contextBreakdownText);
    const hasProtectionControl = /kontrolle|unterhaltung|wartung|regelmäßig|regelmaessig/.test(contextBreakdownText);
    const hasProtectionRemovalLogistics = /rückbau|rueckbau|abbau|logistik|anfahrt/.test(contextBreakdownText);
    const hasCoordination = /bauleitung|polier|koordination|baustellenkoordination|kontrolle|kontrollen|wartung/.test(contextBreakdownText);
    const hasTemporalBasis = /monat|monate|monatlich|tag|tage|taeglich|täglich|laufzeit|vorhaltung|miete|wartung|stunde|stunden|\bh\b|termin|termine|einsatz|einsaetze|einsätze/.test(contextBreakdownText);

    const hasTrafficSigns = /beschilderung|schild|schilder|verkehrszeichen/.test(contextBreakdownText);
    const hasBarrierMaterial = /absperr|bake|leitbake|leitkegel|schranke|sperr/.test(contextBreakdownText);
    const hasTrafficLight = /lichtsignalanlage|ampel|lsa/.test(contextBreakdownText);
    const hasTrafficControl = /verkehrsfuehrung|verkehrsführung|kontrolle|kontrollen|wartung|anpassung|\brsa\b|stvo|genehmigung/.test(contextBreakdownText);

    const hasPhotoDocumentation = /fotodokumentation|foto|bilder/.test(contextBreakdownText);
    const hasAufmass = /aufmass|aufmaß|massenermittlung|massen/.test(contextBreakdownText);
    const hasSurvey = /vermessung|gnss|tachymeter|vermessungsdaten/.test(contextBreakdownText);
    const hasCadBestandsplan = /cad|bestandsplan|bestandsplaene|bestandspläne|as-built|as built|dwg|dxf/.test(contextBreakdownText);
    const hasDigitalHandover = /uebergabe|übergabe|pdf|dwg|landxml|unterlagen/.test(contextBreakdownText);
    const hasClientAuthorityCoordination = /auftraggeber|behoerde|behörde|behoerden|behörden|abstimmung/.test(contextBreakdownText);

    const hasVorhaltungMachines = /geraetevorhaltung|gerätevorhaltung|bagger|verdichtungsgeraet|verdichtungsgerät|kleingeraet|kleingerät|maschine|maschinen/.test(contextBreakdownText);
    const hasVorhaltungPersonnel = /personal-wartezeit|wartezeit|polier|maschinist|personal/.test(contextBreakdownText);
    const hasVorhaltungCoordination = /bauleitung|koordination|freigabe|freigaben|behoerde|behörde|leitungsfreigabe/.test(contextBreakdownText);
    const hasVorhaltungStillstand = /stillstand|bauzeitunterbrechung|bauablaufstoerung|bauablaufstörung|wartezeiten|wartezeit/.test(contextBreakdownText);
    const hasVorhaltungLogistics = /erneute anfahrt|anfahrt|abfahrt|umsetzen|logistik|entfernung|fahrt|fahrten/.test(contextBreakdownText);

    const hasProvisoriumHerstellung = /herstellen|herstellung|einbau|einbauen|verdichtung|baustrasse|baustraße|umleitung/.test(contextBreakdownText);
    const hasProvisoriumMaterial = /schotter|tragschicht|geotextil|platten|material/.test(contextBreakdownText);
    const hasProvisoriumVorhaltung = /vorhalten|vorhaltung|laufzeit|dauer|120 tage|tage/.test(contextBreakdownText);
    const hasProvisoriumUnterhaltung = /unterhalten|unterhaltung|reinigung|anpassung|wartung/.test(contextBreakdownText);
    const hasProvisoriumRueckbau = /rueckbau|rückbau|abtransport|entsorgung|laden/.test(contextBreakdownText);
    const hasProvisoriumLogistik = /logistik|anfahrt|materialanlieferung|transport|abtransport/.test(contextBreakdownText);
    const hasProvisoriumBeschilderung = /beschilderung|verkehrsfuehrung|verkehrsführung|umleitung|verkehrszeichen/.test(contextBreakdownText);

    const hasTempSupplyMaterial = /rohr|rohrmaterial|formstueck|formstück|armatur|absperr|material/.test(contextBreakdownText);
    const hasTempSupplyInstall = /herstellen|verlegen|einbau|montage|notleitung|provisorische leitung/.test(contextBreakdownText);
    const hasTempSupplyConnection = /anschluss|bestand|einbindung|anschliessen|anschließen/.test(contextBreakdownText);
    const hasTempSupplyPressureTest = /druckpruefung|druckprüfung|spuelung|spülung|inbetriebnahme|pruefung|prüfung/.test(contextBreakdownText);
    const hasTempSupplyOperation = /vorhaltung|betrieb|betreiben|laufzeit|dauer|90 tage|tage/.test(contextBreakdownText);
    const hasTempSupplyControl = /kontrolle|kontroll|wartung|taeglich|täglich/.test(contextBreakdownText);
    const hasTempSupplyRemoval = /rueckbau|rückbau|trennung|abtransport|laden/.test(contextBreakdownText);
    const hasTempSupplyLogistics = /logistik|anfahrt|materialanlieferung|transport|abtransport/.test(contextBreakdownText);

    if (isLogisticsContext && /baustellenzufahrt|zufahrtssicherung/.test(rowContextText) && !hasLogisticsAccess) {
      contextQualityWarnings.push("Context-Guard: Baustellenlogistik: Baustellenzufahrt/Zufahrtssicherung fehlt oder ist nicht separat kalkuliert.");
    }

    if (isLogisticsContext && /lagerfläche|lagerflaeche|zwischenlager/.test(rowContextText) && !hasLogisticsStorage) {
      contextQualityWarnings.push("Context-Guard: Baustellenlogistik: Lagerfläche/Zwischenlager fehlt oder ist nicht separat kalkuliert.");
    }

    if (isLogisticsContext && /materialumschlag/.test(rowContextText) && !hasLogisticsHandling) {
      contextQualityWarnings.push("Context-Guard: Baustellenlogistik: Materialumschlag/Radlader/Stapler fehlt oder ist nicht separat kalkuliert.");
    }

    if (isLogisticsContext && /baustrom|stromprovisorium|beleuchtung|baustellenbeleuchtung/.test(rowContextText) && !hasLogisticsPowerLight) {
      contextQualityWarnings.push("Context-Guard: Baustellenlogistik: Baustrom/Stromprovisorium/Beleuchtung fehlt oder ist nicht separat kalkuliert.");
    }

    if (isLogisticsContext && /baustellenwasser|wasseranschluss|bauwasser/.test(rowContextText) && !hasLogisticsWater) {
      contextQualityWarnings.push("Context-Guard: Baustellenlogistik: Baustellenwasser/Wasseranschluss fehlt oder ist nicht separat kalkuliert.");
    }

    if (isLogisticsContext && /spezialgeräte|spezialgeraete|mietverlängerung|mietverlaengerung/.test(rowContextText) && !hasLogisticsRental) {
      contextQualityWarnings.push("Context-Guard: Baustellenlogistik: Spezialgeräte-Miete/Mietverlängerung fehlt oder ist nicht separat kalkuliert.");
    }

    if (isLogisticsContext && projectDurationDays > 0 && !hasLogisticsOperation) {
      contextQualityWarnings.push("Context-Guard: Baustellenlogistik: Kontrolle/Betrieb/Vorhaltung über die Laufzeit fehlt oder ist nicht separat kalkuliert.");
    }

    if (isLogisticsContext && !hasLogisticsRemoval) {
      contextQualityWarnings.push("Context-Guard: Baustellenlogistik: Rückbau/Abbau/Logistik/Anfahrt fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProtectionContext && /lärmschutz|laermschutz|staubschutz|erschütterungsschutz|erschuetterungsschutz/.test(rowContextText) && !hasProtectionNoiseDustVibration) {
      contextQualityWarnings.push("Context-Guard: Schutzmaßnahmen: Lärm-/Staub-/Erschütterungsschutz fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProtectionContext && /baumschutz|wurzelschutz/.test(rowContextText) && !hasProtectionTreeRoot) {
      contextQualityWarnings.push("Context-Guard: Schutzmaßnahmen: Baum-/Wurzelschutz fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProtectionContext && /gewässerschutz|gewaesserschutz|ölbindemittel|oelbindemittel|havarie/.test(rowContextText) && !hasProtectionWaterHavarie) {
      contextQualityWarnings.push("Context-Guard: Schutzmaßnahmen: Gewässerschutz/Ölbindemittel/Havarie-Schutz fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProtectionContext && /anwohnerinformation/.test(rowContextText) && !hasProtectionResidents) {
      contextQualityWarnings.push("Context-Guard: Schutzmaßnahmen: Anwohnerinformation fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProtectionContext && /beweissicherung|zustandsdokumentation/.test(rowContextText) && !hasProtectionEvidence) {
      contextQualityWarnings.push("Context-Guard: Schutzmaßnahmen: Beweissicherung/Zustandsdokumentation fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProtectionContext && projectDurationDays > 0 && !hasProtectionControl) {
      contextQualityWarnings.push("Context-Guard: Schutzmaßnahmen: regelmäßige Kontrolle/Unterhaltung über die Laufzeit fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProtectionContext && !hasProtectionRemovalLogistics) {
      contextQualityWarnings.push("Context-Guard: Schutzmaßnahmen: Rückbau/Abbau/Logistik fehlt oder ist nicht separat kalkuliert.");
    }

    if (!isProtectionContext && projectDurationDays >= 180 && !hasTemporalBasis) {
      contextQualityWarnings.push("Context-Guard: Bei langer Laufzeit fehlt eine erkennbare Monats-/Tages-/Vorhaltungsbasis im priceBreakdown.");
    }

    if (isSiteSetupLongDurationContext && projectDurationDays >= 180 && !hasContainer) {
      contextQualityWarnings.push("Context-Guard: Container/Baustelleneinrichtung fehlt oder ist nicht separat erkennbar.");
    }

    if (isSiteSetupLongDurationContext && projectDurationDays >= 180 && !hasUtilities) {
      contextQualityWarnings.push("Context-Guard: Baustrom/Bauwasser/Sanitär fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTrafficSafetyContext && !isSurfaceRestorationContext && !hasTrafficSigns) {
      contextQualityWarnings.push("Context-Guard: Verkehrssicherung: Beschilderung/Verkehrszeichen fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTrafficSafetyContext && !isSurfaceRestorationContext && !hasBarrierMaterial) {
      contextQualityWarnings.push("Context-Guard: Verkehrssicherung: Absperrmaterial/Leitbaken/Sperrmaterial fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTrafficSafetyContext && /lichtsignalanlage|ampel/.test(rowContextText) && !hasTrafficLight) {
      contextQualityWarnings.push("Context-Guard: Verkehrssicherung: Lichtsignalanlage/Ampel ist im LV erwähnt, aber nicht separat kalkuliert.");
    }

    if (isTrafficSafetyContext && projectDurationDays >= 30 && !hasTrafficControl) {
      contextQualityWarnings.push("Context-Guard: Verkehrssicherung: Kontrolle/Wartung/Verkehrsführung/RSA-Genehmigung fehlt oder ist nicht separat erkennbar.");
    }

    if (isDocumentationContext && !hasPhotoDocumentation && /foto|fotodokumentation/.test(rowContextText)) {
      contextQualityWarnings.push("Context-Guard: Dokumentation: Fotodokumentation ist im LV erwähnt, aber nicht separat kalkuliert.");
    }

    if (isDocumentationContext && !hasAufmass && /aufmass|aufmaß/.test(rowContextText)) {
      contextQualityWarnings.push("Context-Guard: Dokumentation: Aufmaß/Massenermittlung ist im LV erwähnt, aber nicht separat kalkuliert.");
    }

    if (isDocumentationContext && !hasSurvey && /vermessung|vermessungsdaten/.test(rowContextText)) {
      contextQualityWarnings.push("Context-Guard: Dokumentation: Vermessung/Vermessungsdaten sind im LV erwähnt, aber nicht separat kalkuliert.");
    }

    if (isDocumentationContext && !hasCadBestandsplan && /bestandsplan|bestandsplaene|bestandspläne|as-built|as built/.test(rowContextText)) {
      contextQualityWarnings.push("Context-Guard: Dokumentation: Bestandsplan/CAD/As-Built ist im LV erwähnt, aber nicht separat kalkuliert.");
    }

    if (isDocumentationContext && !hasDigitalHandover && /uebergabe|übergabe|unterlagen|digital/.test(rowContextText)) {
      contextQualityWarnings.push("Context-Guard: Dokumentation: Digitale Übergabeunterlagen fehlen oder sind nicht separat kalkuliert.");
    }

    if (isDocumentationContext && !hasClientAuthorityCoordination && /auftraggeber|behoerde|behörde|behoerden|behörden|abstimmung/.test(rowContextText)) {
      contextQualityWarnings.push("Context-Guard: Dokumentation: Abstimmung mit Auftraggeber/Behörden fehlt oder ist nicht separat kalkuliert.");
    }

    if (isVorhaltungContext && !hasVorhaltungMachines) {
      contextQualityWarnings.push("Context-Guard: Vorhaltung/Stillstand: Gerätevorhaltung ist erwähnt, aber nicht separat kalkuliert.");
    }

    if (isVorhaltungContext && !hasVorhaltungPersonnel) {
      contextQualityWarnings.push("Context-Guard: Vorhaltung/Stillstand: Personal-Wartezeit/Polier/Maschinist fehlt oder ist nicht separat kalkuliert.");
    }

    if (isVorhaltungContext && !hasVorhaltungCoordination) {
      contextQualityWarnings.push("Context-Guard: Vorhaltung/Stillstand: Bauleitung/Koordination/Freigaben fehlen oder sind nicht separat kalkuliert.");
    }

    if (isVorhaltungContext && !hasVorhaltungStillstand) {
      contextQualityWarnings.push("Context-Guard: Vorhaltung/Stillstand: Stillstand/Wartezeiten/Bauablaufstörung fehlen oder sind nicht separat kalkuliert.");
    }

    if (isVorhaltungContext && projectDistanceKm > 0 && !hasVorhaltungLogistics) {
      contextQualityWarnings.push("Context-Guard: Vorhaltung/Stillstand: erneute Anfahrt/Logistik/Entfernung fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProvisoriumContext && !hasProvisoriumHerstellung) {
      contextQualityWarnings.push("Context-Guard: Provisorium/Baustraße: Herstellung/Einbau fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProvisoriumContext && !hasProvisoriumMaterial) {
      contextQualityWarnings.push("Context-Guard: Provisorium/Baustraße: Material wie Schotter/Geotextil/Tragschicht fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProvisoriumContext && projectDurationDays > 0 && !hasProvisoriumVorhaltung) {
      contextQualityWarnings.push("Context-Guard: Provisorium/Baustraße: Vorhaltung über die Laufzeit fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProvisoriumContext && !isSiteSetupLongDurationContext && !hasProvisoriumUnterhaltung) {
      contextQualityWarnings.push("Context-Guard: Provisorium/Baustraße: Unterhaltung/Reinigung/Anpassung fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProvisoriumContext && !hasProvisoriumRueckbau) {
      contextQualityWarnings.push("Context-Guard: Provisorium/Baustraße: Rückbau/Laden/Abtransport fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProvisoriumContext && projectDistanceKm > 0 && !hasProvisoriumLogistik) {
      contextQualityWarnings.push("Context-Guard: Provisorium/Baustraße: Logistik/Anfahrt/Materialtransporte fehlen oder sind nicht separat kalkuliert.");
    }

    if (isProvisoriumContext && /umleitung|beschilderung/.test(rowContextText) && !hasProvisoriumBeschilderung) {
      contextQualityWarnings.push("Context-Guard: Provisorium/Baustraße: Beschilderung/Umleitung/Verkehrsführung fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTemporarySupplyContext && !hasTempSupplyMaterial) {
      contextQualityWarnings.push("Context-Guard: Temporäre Versorgung: Rohrmaterial/Formstücke/Armaturen fehlen oder sind nicht separat kalkuliert.");
    }

    if (isTemporarySupplyContext && !hasTempSupplyInstall) {
      contextQualityWarnings.push("Context-Guard: Temporäre Versorgung: Herstellen/Verlegen/Montage der Notleitung fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTemporarySupplyContext && !hasTempSupplyConnection) {
      contextQualityWarnings.push("Context-Guard: Temporäre Versorgung: Anschluss an Bestand/Einbindung fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTemporarySupplyContext && /druckpruefung|druckprüfung|spuelung|spülung/.test(rowContextText) && !hasTempSupplyPressureTest) {
      contextQualityWarnings.push("Context-Guard: Temporäre Versorgung: Druckprüfung/Spülung/Inbetriebnahme fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTemporarySupplyContext && projectDurationDays > 0 && !hasTempSupplyOperation) {
      contextQualityWarnings.push("Context-Guard: Temporäre Versorgung: Vorhaltung/Betrieb über die Laufzeit fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTemporarySupplyContext && /kontrolle|wartung|taeglich|täglich/.test(rowContextText) && !hasTempSupplyControl) {
      contextQualityWarnings.push("Context-Guard: Temporäre Versorgung: Kontrolle/Wartung fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTemporarySupplyContext && /rueckbau|rückbau/.test(rowContextText) && !hasTempSupplyRemoval) {
      contextQualityWarnings.push("Context-Guard: Temporäre Versorgung: Rückbau/Trennung/Abtransport fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTemporarySupplyContext && projectDistanceKm > 0 && !hasTempSupplyLogistics) {
      contextQualityWarnings.push("Context-Guard: Temporäre Versorgung: Logistik/Anfahrt/Materialtransporte fehlen oder sind nicht separat kalkuliert.");
    }

    if (!isProtectionContext && !isDocumentationContext && !isVorhaltungContext && !isProvisoriumContext && !isTemporarySupplyContext && projectDistanceKm > 0 && !hasTransport) {
      contextQualityWarnings.push("Context-Guard: Entfernung/Antransport/Abtransport/Logistik fehlt oder ist zu schwach ausgewiesen.");
    }

    if (!isDocumentationContext && !isVorhaltungContext && projectDurationDays >= 180 && !hasCoordination) {
      contextQualityWarnings.push("Context-Guard: Bauleitung/Polier/Koordination/Kontrolle fehlt oder ist nicht separat kalkuliert.");
    }

    const softMinForLongSite = months >= 12 ? round2(months * 2500) : 0;

    if (softMinForLongSite > 0 && finalUnitPrice > 0 && finalUnitPrice < softMinForLongSite) {
      contextQualityWarnings.push(
        `Context-Guard: EP ${round2(finalUnitPrice)} EUR wirkt für ${round2(months)} Monate Laufzeit auffällig niedrig. Weicher Prüfwert ca. ${softMinForLongSite} EUR.`
      );
    }

      const noX84FinalLinearGuard = applyNoX84LinearPriceGuard({
        textRaw: `${kurztext || ""} ${langtext || ""}`,
        unitRaw: einheit,
        mengeRaw: menge,
        epRaw: finalUnitPrice,
        hasRealX84:
          Number((row as any).angebotUnitPrice || 0) > 0 ||
          Number((row as any).angebotTotal || 0) > 0 ||
          Number((row as any).originalPreKiPrice || 0) > 0 ||
          Number((row as any).x84UnitPrice || 0) > 0 ||
          String((row as any).gaebType || (row as any).importType || (row as any).importSource || "")
            .toLowerCase()
            .includes("x84"),
      });

      if (noX84FinalLinearGuard.applied) {
        finalUnitPrice = noX84FinalLinearGuard.ep;
        suggestedUnitPrice = noX84FinalLinearGuard.ep;
        contextQualityWarnings.push(noX84FinalLinearGuard.warning);
      }

    const contextDirectCost = round2(
      normalizedMaterialCost +
      normalizedLaborCost +
      normalizedMachineCost +
      normalizedSubcontractorCost +
      normalizedDisposalCost
    );

    if (contextDirectCost > 0) {
      const minRisk = round2(contextDirectCost * 0.03);
      const minProfit = round2(contextDirectCost * 0.05);

      if (normalizedRiskCost > 0 && normalizedRiskCost < minRisk) {
        contextQualityWarnings.push(
          `Context-Guard: Risiko ${round2(normalizedRiskCost)} EUR wirkt zu niedrig. Mindest-Prüfansatz ca. 3% der Direktkosten = ${minRisk} EUR.`
        );
      }

      if (normalizedProfitCost > 0 && normalizedProfitCost < minProfit) {
        contextQualityWarnings.push(
          `Context-Guard: Gewinn ${round2(normalizedProfitCost)} EUR wirkt zu niedrig. Mindest-Prüfansatz ca. 5% der Direktkosten = ${minProfit} EUR.`
        );
      }
    }
  }

  const isErschwernisOpenAi =
    /erschwernis|beengte|beengt|handschachtung|anliegerverkehr|versorgungsleitung|erschwerte/.test(norm(`${kurztext} ${langtext}`));

  const isVorhaltungOpenAi =
    /geraetevorhaltung|gerätevorhaltung|bauzeitunterbrechung|stillstand|wartezeit|wartezeiten|leitungsfreigabe|behoerdliche freigabe|behördliche freigabe|bauablaufstoerung|bauablaufstörung/.test(norm(`${kurztext} ${langtext}`));

  const isWasserhaltungOpenAi =
    /wasserhaltung|pumpe|pumpen|tauchpumpe|grundwasser|baugrubenentwaesserung|baugrubenentwässerung|vorfluter|ableitung.*wasser/.test(norm(`${kurztext} ${langtext}`));

  const isDisposalOpenAi =
    /entsorgung|deponie|belasteter boden|belastet|haufwerk|analytik|deklarationsanalytik|laga|ersatzbaustoffv|wiegeschein|entsorgungsnachweis/.test(norm(`${kurztext} ${langtext}`));

  const surfacePriorityText = norm(`${kurztext} ${langtext}`);
  const blocksSurfaceRestoration =
    /hausanschluss|hausanschlüsse|hausanschluesse|kernbohrung|wanddurchführung|wanddurchfuehrung|hauseinführung|hauseinfuehrung|gebäudeeinführung|gebaeudeeinfuehrung|schutzmaßnahmen|schutzmassnahmen|schutz vorhandener|bestandsleitungen|vorhandene leitungen|erschwernis|beengte bauweise|beengte platzverhältnisse|beengten platzverhaeltnissen|handschachtung/.test(surfacePriorityText);

  const isSurfaceRestorationOpenAi =
    !isVorhaltungOpenAi &&
    !blocksSurfaceRestoration &&
    /oberfläche|oberflaeche|oberflächen|oberflaechen|wiederherstellung|verkehrsfläche|verkehrsflaeche|asphalt|asphaltaufbruch|fräsen|fraesen|frostschutz|schottertragschicht|asphalttragschicht|asphaltdeckschicht|pflaster|pflasterfläche|pflasterflaeche|bordstein|bordsteine|rinne|rinnen|verkehrsfreigabe|aufbruchmaterial/.test(surfacePriorityText);

  const isTempSupplyOpenAi =
    /notleitung|provisorische leitung|temporäre medienversorgung|temporaere medienversorgung|medienversorgung|ersatzversorgung|temporärer anschluss|temporaerer anschluss|temporäre anschlüsse|temporaere anschluesse|temporär.*anschluss|temporaer.*anschluss/.test(norm(`${kurztext} ${langtext}`));

  const isTestingOpenAi =
    !isTempSupplyOpenAi &&
    /dichtheitsprüfung|dichtheitspruefung|druckprüfung|druckpruefung|spülung|spuelung|tv-inspektion|kamerabefahrung|prüfprotokoll|pruefprotokoll|abnahmeunterlagen|bestandsfreigabe|funktionsprüfung|funktionspruefung/.test(norm(`${kurztext} ${langtext}`));

  const isSiteSetupOpenAi =
    /baustelleneinrichtung|baustelle einrichten|baustellengemeinkosten|containeranlage|bürocontainer|buero container|büro container|buero-container|büro-container|mannschaftscontainer|sanitärcontainer|sanitaercontainer|lagercontainer|baustrom|bauwasser|baustellenbeleuchtung|sanitaer|sanitär/.test(norm(`${kurztext} ${langtext}`));

  const isLogisticsOpenAi =
    !isSiteSetupOpenAi &&
    /baustellenlogistik|baustellenzufahrt|zufahrtssicherung|lagerfläche|lagerflaeche|zwischenlager|materialumschlag|spezialgeräte|spezialgeraete|mietverlängerung|mietverlaengerung/.test(norm(`${kurztext} ${langtext}`));

  const isTrafficSafetyOpenAi =
    !isSurfaceRestorationOpenAi &&
    /verkehrssicherung|verkehrsfuehrung|verkehrsführung|strassensperrung|straßensperrung|sperrung|beschilderung|absperrung|lichtsignalanlage|baustellenampel|ampel|verkehrszeichen|leitbake|leitbaken|fußgängerführung|fussgängerführung|fussgaengerfuehrung|anwohnerverkehr|\brsa\b/.test(norm(`${kurztext} ${langtext}`));

  const documentationPriorityText = norm(`${kurztext} ${langtext}`);
  const blocksDocumentation =
    /dichtheitsprüfung|dichtheitspruefung|druckprüfung|druckpruefung|spülung|spuelung|tv-inspektion|kamerabefahrung|prüfprotokoll|pruefprotokoll|abnahmeunterlagen|funktionsprüfung|funktionspruefung|genehmigung|genehmigungen|behörde|behoerde|behörden|behoerden|auflage|auflagen|verkehrsrechtliche anordnung|sigeko|sige ko|arbeitssicherheit|sicherheitskonzept|schutzmaßnahmen|schutzmassnahmen|schutz vorhandener|bestandsleitungen|vorhandene leitungen|hausanschluss|hausanschlüsse|hausanschluesse|kernbohrung|hauseinführung|hauseinfuehrung|gebäudeeinführung|gebaeudeeinfuehrung|erschwernis|beengte bauweise|handschachtung|kampfmittel|kampfmittelsondierung|altlast|altlasten|bodenkontamination|bodenanalyse|gutachter|sicherheitsfreigabe|bodenrisiko|bodenrisiken/.test(documentationPriorityText);

  const isDocumentationOpenAi =
    !isTempSupplyOpenAi &&
    !isSurfaceRestorationOpenAi &&
    !isDisposalOpenAi &&
    !blocksDocumentation &&
    /dokumentation|fotodokumentation|aufmaß|aufmass|massenermittlung|vermessung|vermessungsdaten|gnss|tachymeter|bestandsplan|bestandspläne|bestandsplaene|bestandszeichnung|cad|as-built|as built|dwg|dxf|landxml|übergabeunterlagen|uebergabeunterlagen|nachweisführung|nachweisfuehrung/.test(documentationPriorityText);

  const isAuthorityOpenAi =
    !isWasserhaltungOpenAi &&
    !isTrafficSafetyOpenAi &&
    !isDocumentationOpenAi &&
    !isVorhaltungOpenAi &&
    /genehmigung|genehmigungen|behörde|behoerde|behörden|behoerden|auflage|auflagen|verkehrsrechtliche anordnung|sigeko|sige ko|arbeitssicherheit|sicherheitskonzept|sicherheitsbeauftragter|denkmalpflege|archäologisch|archaeologisch|kampfmittel|sondierung|freigabe|freigaben/.test(norm(`${kurztext} ${langtext}`));

  const isSpecialCivilOpenAi =
    !isWasserhaltungOpenAi &&
    /spezialtiefbau|baugrubenverbau|spundwand|bohrpfahl|unterfangung|bodenverbesserung|hdi|injektion|pressung|microtunneling|rohrvortrieb|vortrieb|pressanlage|bohrgerät|bohrgeraet|injektionsanlage/.test(norm(`${kurztext} ${langtext}`));

  const isHouseConnectionOpenAi =
    !isDocumentationOpenAi &&
    !isTempSupplyOpenAi &&
    !isSurfaceRestorationOpenAi &&
    /hausanschluss|hausanschlüsse|hausanschluesse|kernbohrung|wanddurchführung|wanddurchfuehrung|hauseinführung|hauseinfuehrung|gebäudeeinführung|gebaeudeeinfuehrung|innenhof|privatgrund|privatfläche|privatflaeche|eigentümer|eigentuemer|handschachtung|wiederherstellung.*privat|arbeiten am bestand|bestand/.test(norm(`${kurztext} ${langtext}`));

  const baseWarnings = buildWarnings(row, riskLevel, matches, confidence, "openai").filter((w) => {
    const msg = String(w || "");

    if (isTestingOpenAi && /bestandsanschluss/i.test(msg)) return false;
    if (isTempSupplyOpenAi && /bestandsanschluss|hausanschluss|gebäudeeinführung|gebaeudeeinfuehrung|dokumentation\/vermessung|prüfung|pruefung/i.test(msg)) return false;
    if (isSurfaceRestorationOpenAi && /entsorgung\/deponieklasse|bestandsanschluss|verkehrssicherung|rsa|dokumentation\/vermessung|hausanschluss|gebäudeeinführung|gebaeudeeinfuehrung/i.test(msg)) return false;
    if (/schutzmaßnahmen|schutzmassnahmen|schutz vorhandener|bestandsleitungen|vorhandene leitungen|schutzplatten|oberflächenschutz|oberflaechenschutz/i.test(text) && /hausanschluss|gebäudeeinführung|gebaeudeeinfuehrung|bestandsanschluss|hauseinführung|hauseinfuehrung|kernbohrung|privatgrund|handschachtung/i.test(msg)) return false;
    if (/behörden|behoerden|genehmigung|genehmigungen|auflagen|sigeko|sige ko|sicherheitskonzept|verkehrsrechtliche anordnung|fachstellen|freigaben/i.test(text) && /dokumentation\/vermessung|bestandspläne|bestandsplaene|as-built|gnss|tachymeter|cad/i.test(msg)) return false;
    if (isAuthorityOpenAi && /dokumentation\/vermessung|bestandspläne|as-built/i.test(msg)) return false;
    if (/schutzmaßnahmen|schutzmassnahmen|schutz vorhandener|bestandsleitungen|vorhandene leitungen/i.test(text) && /hausanschluss|gebäudeeinführung|gebaeudeeinfuehrung|bestandsanschluss/i.test(msg)) return false;
    if (/erschwernis|beengte bauweise|beengte platzverhältnisse|beengten platzverhaeltnissen/i.test(text) && /hausanschluss|gebäudeeinführung|gebaeudeeinfuehrung|bestandsanschluss|schutzmaßnahmen|schutzmassnahmen/i.test(msg)) return false;
    if (isTrafficSafetyOpenAi && /baustelleneinrichtung|provisorium|baustraße|baustrasse|spezialtiefbau|behörden|behoerden/i.test(msg)) return false;
    if (isDocumentationOpenAi && /bestandsanschluss|hausanschluss|gebäudeeinführung|gebaeudeeinfuehrung|behörden|behoerden|kampfmittel|denkmalpflege|sigeko|arbeitssicherheit|verkehrssicherung|rsa/i.test(msg)) return false;
    if (isAuthorityOpenAi && /verkehrssicherung|rsa|dokumentation\/vermessung|vorhaltung\/stillstand|vorhaltung|stillstand/i.test(msg)) return false;
    if (isSpecialCivilOpenAi && /erschwernis|beengte bauweise/i.test(msg)) return false;
    if (isHouseConnectionOpenAi && /erschwernis|beengte bauweise/i.test(msg)) return false;

    return isErschwernisOpenAi || isVorhaltungOpenAi || isDisposalOpenAi || isTestingOpenAi || isLogisticsOpenAi
      ? !/verkehrssicherung|rsa/i.test(msg)
      : true;
  });

  let warnings = [
    ...baseWarnings,
    contextSensitiveOpenAi
      ? isHouseConnectionOpenAi
        ? /schutzmaßnahmen|schutzmassnahmen|schutz vorhandener|bestandsleitungen|vorhandene leitungen|schutzplatten|oberflächenschutz|oberflaechenschutz/i.test(text)
          ? /erschwernis|beengte bauweise|beengte platzverhältnisse|beengten platzverhaeltnissen|geringe lagerflächen|geringe lagerflaechen|erschwerte logistik|langsamere ausführung|langsamere ausfuehrung|zusätzliche koordination|zusaetzliche koordination/i.test(text)
            ? "Kontextabhängige Position: Erschwernis/beengte Bauweise hängt stark von Platzverhältnissen, Handschachtung, Leitungsbestand, Lagerflächen, Gerätebewegung, Logistik, langsameren Arbeitsabläufen und zusätzlicher Koordination ab. Historische Preise nur als Orientierung verwenden."
            : "Kontextabhängige Position: Schutzmaßnahmen/Bestandssicherung/Oberflächenschutz hängt stark von vorhandenen Leitungen, Oberflächen, Gebäuden, Sicherungsart, Kontrollaufwand, Rückbau, Wiederherstellung und Bauzeit ab. Historische Preise nur als Orientierung verwenden."
          : /behörden|behoerden|genehmigung|genehmigungen|auflagen|sigeko|sige ko|sicherheitskonzept|verkehrsrechtliche anordnung|fachstellen|freigaben/i.test(text)
          ? "Kontextabhängige Position: Behörden/Genehmigungen/Auflagen/Sicherheit hängt stark von Laufzeit, Auflagen, Terminen, Fachstellen, verkehrsrechtlicher Anordnung, SiGeKo, Freigaben, Abstimmungen, Nachweisen und Dokumentationspflichten ab. Historische Preise nur als Orientierung verwenden."
          : "Kontextabhängige Position: Hausanschluss/Gebäudeeinführung/Arbeiten im Bestand hängt stark von Zugang, Innenhof, Privatgrund, Handschachtung, Kernbohrung, Hauseinführung, Schutz vorhandener Oberflächen, Eigentümerabstimmung, Wiederherstellung und Dokumentation ab. Historische Preise nur als Orientierung verwenden."
        : isWasserhaltungOpenAi
          ? "Kontextabhängige Position: Wasserhaltung/Grundwasser/Pumpen/Baugrubenentwässerung hängt stark von Dauer, Grundwasserandrang, Pumpentechnik, Filterbrunnen, Ableitung, Einleitgenehmigung, Wartung, Notstrom, Ausfallsicherung und Rückbau ab. Historische Preise nur als Orientierung verwenden."
          : isSpecialCivilOpenAi
            ? "Kontextabhängige Position: Spezialtiefbau/schwierige Bauverfahren hängt stark von Bauverfahren, Baugrund, Verbau, Spezialgeräten, Vortrieb, Pressung, Platzverhältnissen, Risiken, Dokumentation und Rückbau ab. Historische Preise nur als Orientierung verwenden."
          : isErschwernisOpenAi
          ? "Kontextabhängige Position: Erschwernis/beengte Bauweise hängt stark von Bauzeit, Platzverhältnissen, Handschachtung, Leitungsbestand, Anliegerverkehr, Gerätebewegung und Sicherungsaufwand ab. Historische Preise nur als Orientierung verwenden."
          : isTestingOpenAi
          ? "Kontextabhängige Position: Prüfungen/Abnahmen/technische Nachweise hängen stark von Leitungslänge, DN, Prüfverfahren, Spülung, TV-Inspektion, Geräteeinsatz, Auswertung, Protokollen, Abnahme und Anfahrt ab. Historische Preise nur als Orientierung verwenden."
          : isTrafficSafetyOpenAi
          ? "Kontextabhängige Position: Verkehrssicherung/RSA/Umleitung/Beschilderung hängt stark von Bauzeit, Verkehrsführung, verkehrsrechtlicher Anordnung, Beschilderung, Absperrmaterial, Lichtsignalanlage, täglicher Kontrolle, Wartung, Anpassung, Anwohnerverkehr, Aufbau, Vorhaltung und Rückbau ab. Historische Preise nur als Orientierung verwenden."
          : /behörden|behoerden|genehmigung|genehmigungen|auflagen|sigeko|sige ko|sicherheitskonzept|verkehrsrechtliche anordnung|fachstellen|freigaben/i.test(text)
          ? "Kontextabhängige Position: Behörden/Genehmigungen/Auflagen/Sicherheit hängt stark von Laufzeit, Auflagen, Terminen, Fachstellen, verkehrsrechtlicher Anordnung, SiGeKo, Freigaben, Abstimmungen, Nachweisen und Dokumentationspflichten ab. Historische Preise nur als Orientierung verwenden."
          : isDocumentationOpenAi
          ? "Kontextabhängige Position: Dokumentation/Vermessung/Bestandspläne/As-Built hängt stark von Projektumfang, Bauzeit, Vermessungsterminen, GNSS-/Tachymeteraufnahmen, CAD-Nachbearbeitung, Datenformaten, Übergabeunterlagen, Auftraggeberabstimmung und digitaler Nachweisführung ab. Historische Preise nur als Orientierung verwenden."
          : isTempSupplyOpenAi
          ? "Kontextabhängige Position: Temporäre Versorgung/Notleitung/Medienversorgung hängt stark von Rohrmaterial, Formstücken, Armaturen, Anschluss an Bestand, Druckprüfung, Spülung, Betrieb, Kontrolle, Wartung, Laufzeit, Rückbau, Trennung, Abtransport und Logistik ab. Historische Preise nur als Orientierung verwenden."
          : isSurfaceRestorationOpenAi
          ? "Kontextabhängige Position: Oberflächenwiederherstellung/Asphalt/Pflaster/Bordstein hängt stark von Fläche, Schichtaufbau, Aufbruch, Entsorgung, Frostschutz, Tragschichten, Asphalt, Pflaster, Bordstein, Verkehrslage, Anwohnerverkehr, Anschluss an Bestand und Nebenarbeiten ab. Historische Preise nur als Orientierung verwenden."
          : isDisposalOpenAi
            ? "Kontextabhängige Position: Entsorgung/Deponie/belasteter Boden hängt stark von Materialklasse, Analytik, Deponieklasse, Menge, Transportentfernung, Deponiegebühren und Nachweispflichten ab. Historische Preise nur als Orientierung verwenden."
            : isWasserhaltungOpenAi
            ? "Kontextabhängige Position: Wasserhaltung/Pumpen/Baugrubenentwässerung hängt stark von Dauer, Grundwasserandrang, Pumpentechnik, Stromversorgung, Ableitung, Kontrolle/Wartung, Ausfallrisiko und Wetter ab. Historische Preise nur als Orientierung verwenden."
            : isVorhaltungOpenAi
            ? "Kontextabhängige Position: Gerätevorhaltung/Stillstand/Wartezeiten hängt stark von Unterbrechungsdauer, betroffenen Geräten, Personalbindung, Freigaben, Bauablaufstörungen, erneuter Anfahrt und Logistik ab. Historische Preise nur als Orientierung verwenden."
            : isSiteSetupOpenAi
            ? "Kontextabhängige Position: Baustelleneinrichtung/Vorhaltung/Container/Baustrom/Bauwasser hängt stark von Bauzeit, Containeranzahl, Miete, Aufbau, Betrieb, Reinigung, Wartung, Baustrom, Bauwasser, Beleuchtung, Zufahrt, Entfernung, Kontrolle, Rückbau und Gemeinkosten ab. Historische Preise nur als Orientierung verwenden."
            : contextSensitiveWarning(text)
      : "",
    ...contextQualityWarnings,
  ].filter(Boolean);

  const rawStatus = s(parsed.calculationStatus);
  const calculationStatus = contextSensitiveOpenAi
    ? "needs_review"
    : rawStatus === "ok" || rawStatus === "warning" || rawStatus === "critical"
      ? rawStatus
      : calculationStatusFrom(warnings, riskLevel, confidence);

  const finalRiskLevel = contextSensitiveOpenAi ? "high" : riskLevel;
  const finalConfidence = contextSensitiveOpenAi
    ? Math.min(confidence, contextQualityWarnings.length ? 0.55 : 0.65)
    : confidence;

  const returnContextText = norm(`${kurztext} ${langtext}`);
  const returnUnitText = norm(`${einheit || ""}`);
  const returnMenge = Number(menge || 0);

  const isMeterUnitReturn =
    /^(m|lfm|laufmeter|laufende meter|meter)$/.test(returnUnitText);

  const isLinearHouseConnectionLineReturn =
    isMeterUnitReturn &&
    returnMenge > 20 &&
    /hausanschlussleitung|hausanschluss.*leitung|verlegung hausanschlussleitung|hausanschlussrohr|anschlussleitung/.test(returnContextText) &&
    !/kernbohrung|hauseinführung|hauseinfuehrung|gebäudeeinführung|gebaeudeeinfuehrung|wanddurchführung|wanddurchfuehrung/.test(returnContextText);

  const isSurfaceRestorationReturn =
    !/geraetevorhaltung|gerätevorhaltung|bauzeitunterbrechung|stillstand|wartezeit|wartezeiten|leitungsfreigabe|behoerdliche freigabe|behördliche freigabe|bauablaufstoerung|bauablaufstörung|hausanschluss|hausanschlüsse|hausanschluesse|kernbohrung|wanddurchführung|wanddurchfuehrung|hauseinführung|hauseinfuehrung|gebäudeeinführung|gebaeudeeinfuehrung|schutzmaßnahmen|schutzmassnahmen|schutz vorhandener|bestandsleitungen|vorhandene leitungen|erschwernis|beengte bauweise|beengte platzverhältnisse|beengten platzverhaeltnissen|handschachtung/.test(returnContextText) &&
    /oberfläche|oberflaeche|oberflächen|oberflaechen|wiederherstellung|verkehrsfläche|verkehrsflaeche|asphalt|asphaltaufbruch|fräsen|fraesen|frostschutz|schottertragschicht|asphalttragschicht|asphaltdeckschicht|pflaster|pflasterfläche|pflasterflaeche|bordstein|bordsteine|rinne|rinnen|verkehrsfreigabe|aufbruchmaterial/.test(returnContextText);

  const isTempSupplyReturn =
    /notleitung|provisorische leitung|temporäre medienversorgung|temporaere medienversorgung|medienversorgung|ersatzversorgung|temporärer anschluss|temporaerer anschluss|temporäre anschlüsse|temporaere anschluesse|temporär.*anschluss|temporaer.*anschluss/.test(returnContextText);

  const isDocumentationReturn =
    !isTempSupplyReturn &&
    !isSurfaceRestorationReturn &&
    !/entsorgung|deponie|belasteter boden|belastet|haufwerk|analytik|deklarationsanalytik|laga|ersatzbaustoffv|wiegeschein|entsorgungsnachweis/.test(returnContextText) &&
    !/kampfmittel|kampfmittelsondierung|altlast|altlasten|bodenkontamination|bodenanalyse|gutachter|sicherheitsfreigabe|bodenrisiko|bodenrisiken/.test(returnContextText) &&
    !/dichtheitsprüfung|dichtheitspruefung|druckprüfung|druckpruefung|spülung|spuelung|tv-inspektion|kamerabefahrung|prüfprotokoll|pruefprotokoll|abnahmeunterlagen|funktionsprüfung|funktionspruefung|genehmigung|genehmigungen|behörde|behoerde|behörden|behoerden|auflage|auflagen|verkehrsrechtliche anordnung|sigeko|sige ko|arbeitssicherheit|sicherheitskonzept|schutzmaßnahmen|schutzmassnahmen|schutz vorhandener|bestandsleitungen|vorhandene leitungen|hausanschluss|hausanschlüsse|hausanschluesse|kernbohrung|hauseinführung|hauseinfuehrung|gebäudeeinführung|gebaeudeeinfuehrung|erschwernis|beengte bauweise|handschachtung/.test(returnContextText) &&
    /dokumentation|fotodokumentation|aufmaß|aufmass|massenermittlung|vermessung|vermessungsdaten|gnss|tachymeter|bestandsplan|bestandspläne|bestandsplaene|bestandszeichnung|cad|as-built|as built|dwg|dxf|landxml|übergabeunterlagen|uebergabeunterlagen|nachweisführung|nachweisfuehrung/.test(returnContextText);

  const isErschwernisReturn =
    /erschwernis|beengte bauweise|beengte platzverhältnisse|beengten platzverhaeltnissen|geringe lagerflächen|geringe lagerflaechen|erschwerte logistik|langsamere ausführung|langsamere ausfuehrung|zusätzliche koordination|zusaetzliche koordination/.test(returnContextText);

  const isProtectionReturn =
    !/hausanschluss|hausanschlüsse|hausanschluesse|kernbohrung|wanddurchführung|wanddurchfuehrung|hauseinführung|hauseinfuehrung|gebäudeeinführung|gebaeudeeinfuehrung|baustellenlogistik|baustellenzufahrt|zufahrtssicherung|lagerfläche|lagerflaeche|zwischenlager|materialumschlag|erschwernis|beengte bauweise|beengte platzverhältnisse|beengten platzverhaeltnissen/.test(returnContextText) &&
    /schutzmaßnahmen|schutzmassnahmen|schutz vorhandener|bestandsleitungen|vorhandene leitungen|schutzplatten|oberflächenschutz|oberflaechenschutz|kontrollmaßnahmen|kontrollmassnahmen/.test(returnContextText);

  const isHouseConnectionReturn =
    !isLinearHouseConnectionLineReturn &&
    !isDocumentationReturn &&
    !isTempSupplyReturn &&
    !isSurfaceRestorationReturn &&
    !isErschwernisReturn &&
    !isProtectionReturn &&
    /hausanschluss|hausanschlüsse|hausanschluesse|kernbohrung|wanddurchführung|wanddurchfuehrung|hauseinführung|hauseinfuehrung|gebäudeeinführung|gebaeudeeinfuehrung|innenhof|privatgrund|privatfläche|privatflaeche|eigentümer|eigentuemer|handschachtung|wiederherstellung.*privat|arbeiten am bestand|bestand/.test(returnContextText);

  const isWaterHoldingReturn =
    /wasserhaltung|grundwasserabsenkung|baugrubenentwässerung|baugrubenentwaesserung|pumpensumpf|pumpenanlage|filterbrunnen|drainage|wasserableitung|einleitgenehmigung|dauerbetrieb|pumpenwartung|notstrom|ausfallsicherung|grundwasserhaltung/.test(returnContextText);

  const isSpecialCivilReturn =
    !isWaterHoldingReturn &&
    /spezialtiefbau|baugrubenverbau|spundwand|bohrpfahl|unterfangung|bodenverbesserung|hdi|injektion|pressung|microtunneling|rohrvortrieb|vortrieb|pressanlage|bohrgerät|bohrgeraet|injektionsanlage/.test(returnContextText);

  const isRiskSoilReturn =
    /kampfmittel|kampfmittelsondierung|altlast|altlasten|bodenkontamination|bodenklasse unbekannt|bodenanalyse|gutachter|sicherheitsfreigabe|beweissicherung|zustandsaufnahme|rissprotokoll|baubegleitende kontrolle|bodenrisiko|bodenrisiken/.test(returnContextText);

  const isVorhaltungReturn =
    /geraetevorhaltung|gerätevorhaltung|bauzeitunterbrechung|stillstand|wartezeit|wartezeiten|leitungsfreigabe|behoerdliche freigabe|behördliche freigabe|bauablaufstoerung|bauablaufstörung/.test(returnContextText);
  const isAuthorityReturn =
    !isWaterHoldingReturn &&
    !isDocumentationReturn &&
    !isVorhaltungReturn &&
    /genehmigung|genehmigungen|behörde|behoerde|behörden|behoerden|auflage|auflagen|verkehrsrechtliche anordnung|sigeko|sige ko|arbeitssicherheit|sicherheitskonzept|sicherheitsbeauftragter|denkmalpflege|archäologisch|archaeologisch|kampfmittel|sondierung|freigabe|freigaben/.test(returnContextText);

  const isSiteSetupReturn =
    /baustelleneinrichtung|baustelle einrichten|baustellengemeinkosten|containeranlage|bürocontainer|buero container|büro container|buero-container|büro-container|mannschaftscontainer|sanitärcontainer|sanitaercontainer|lagercontainer|baustrom|bauwasser|baustellenbeleuchtung|sanitaer|sanitär/.test(returnContextText);

  const isLogisticsReturn =
    !isSiteSetupReturn &&
    !/erschwernis|beengte bauweise|beengte platzverhältnisse|beengten platzverhaeltnissen|geringe lagerflächen|geringe lagerflaechen|erschwerte logistik|langsamere ausführung|langsamere ausfuehrung|zusätzliche koordination|zusaetzliche koordination|handschachtung/.test(returnContextText) &&
    /baustellenlogistik|baustellenzufahrt|zufahrtssicherung|lagerfläche|lagerflaeche|zwischenlager|materialumschlag|spezialgeräte|spezialgeraete|mietverlängerung|mietverlaengerung/.test(returnContextText);


  const isTestingReturn =
    /dichtheitsprüfung|dichtheitspruefung|druckprüfung|druckpruefung|spülung|spuelung|tv-inspektion|kamerabefahrung|prüfprotokoll|pruefprotokoll|abnahmeunterlagen|bestandsfreigabe|funktionsprüfung|funktionspruefung/.test(returnContextText);

  const isDisposalReturn =
    /entsorgung|deponie|belasteter boden|belastet|haufwerk|analytik|deklarationsanalytik|laga|ersatzbaustoffv|wiegeschein|entsorgungsnachweis/.test(returnContextText);

  const isTrafficSafetyReturn =
    /verkehrssicherung|verkehrsfuehrung|verkehrsführung|strassensperrung|straßensperrung|sperrung|beschilderung|absperrung|lichtsignalanlage|baustellenampel|ampel|verkehrszeichen|leitbake|leitbaken|fußgängerführung|fussgängerführung|fussgaengerfuehrung|anwohnerverkehr|\brsa\b/.test(returnContextText);

  const isProvisoriumReturn =
    !isTempSupplyReturn &&
    !isTrafficSafetyReturn &&
    /provisor|baustrasse|baustraße|umleitung|baustellenumleitung|temporaer|temporär|rueckbau|rückbau/.test(returnContextText);
  const isWasserhaltungReturn =
    /wasserhaltung|pumpe|pumpen|tauchpumpe|grundwasser|baugrubenentwaesserung|baugrubenentwässerung|vorfluter|ableitung.*wasser/.test(returnContextText);

  return {
    id: row.id,
    posNr,
    kurztext,
    langtext,
    einheit,
    menge,

    materialCost: normalizedMaterialCost,
    laborCost: normalizedLaborCost,
    machineCost: normalizedMachineCost,
    subcontractorCost: normalizedSubcontractorCost,
    disposalCost: normalizedDisposalCost,
    overheadCost: normalizedOverheadCost,
    riskCost: normalizedRiskCost,
    profitCost: normalizedProfitCost,

    baseUnitPrice: finalUnitPrice,
    suggestedUnitPrice,
    finalUnitPrice,

    confidence: finalConfidence,
    riskLevel: finalRiskLevel,
    calculationStatus,

    gewerk: isWaterHoldingReturn
      ? "Tiefbau / Wasserhaltung"
      : isRiskSoilReturn
        ? "Tiefbau / Kampfmittel & Altlasten"
      : isSurfaceRestorationReturn
        ? "Straßenbau / Oberflächenwiederherstellung"
      : isDocumentationReturn
        ? "Tiefbau / Dokumentation & Vermessung"
      : isTempSupplyReturn
        ? "Tiefbau / Temporäre Versorgung"
      : isErschwernisReturn
        ? "Tiefbau / Erschwernis & Bestand"
      : isLogisticsReturn
        ? "Tiefbau / Baustellenlogistik"
      : isProtectionReturn
        ? "Tiefbau / Schutzmaßnahmen"
      : isLinearHouseConnectionLineReturn
        ? "Tiefbau / Leitungsbau"
      : isHouseConnectionReturn
        ? "Tiefbau / Hausanschlüsse & Bestand"
      : isSpecialCivilReturn
        ? "Tiefbau / Spezialtiefbau"
      : isAuthorityReturn
        ? "Tiefbau / Behörden & Sicherheit"
      : isSiteSetupReturn
        ? "Tiefbau / Baustelleneinrichtung"
      : isLogisticsReturn
        ? "Tiefbau / Baustellenlogistik"
      : isProtectionReturn
        ? "Tiefbau / Schutzmaßnahmen"
      : isTestingReturn
        ? "Tiefbau / Prüfungen"
      : isDisposalReturn
        ? "Tiefbau / Entsorgung"
      : isTrafficSafetyReturn
        ? "Tiefbau / Verkehrssicherung"
      : isTempSupplyReturn
        ? "Tiefbau / Temporäre Versorgung"
      : isProvisoriumReturn
        ? "Tiefbau / Provisorien"
        : isWasserhaltungReturn
          ? "Tiefbau / Wasserhaltung"
      : /geraetevorhaltung|gerätevorhaltung|bauzeitunterbrechung|stillstand|wartezeit|wartezeiten|leitungsfreigabe|behoerdliche freigabe|behördliche freigabe|bauablaufstoerung|bauablaufstörung/.test(norm(`${kurztext} ${langtext}`))
        ? "Tiefbau / Vorhaltung"
      : /erschwernis|beengte|beengt|handschachtung|anliegerverkehr|versorgungsleitung|erschwerte/.test(norm(`${kurztext} ${langtext}`))
        ? "Tiefbau / Erschwernis"
        : s(parsed.gewerk) || gewerk,
    leistungsart: isWaterHoldingReturn
      ? "Wasserhaltung / Grundwasser / Pumpen / Baugrubenentwässerung"
      : isRiskSoilReturn
        ? "Kampfmittel / Altlasten / Bodenrisiken / Beweissicherung"
      : isSurfaceRestorationReturn
        ? "Asphalt / Pflaster / Bordstein / Wiederherstellung"
      : isDocumentationReturn
        ? "Dokumentation / Vermessung / Bestandspläne / As-Built"
      : isTempSupplyReturn
        ? "Temporärer Anschluss / Notleitung / Medienversorgung"
      : isErschwernisReturn
        ? "Erschwernis / beengte Bauweise / Arbeiten im Bestand"
      : isLogisticsReturn
        ? "Zufahrt / Lager / Baustellenversorgung"
      : isProtectionReturn
        ? "Schutzmaßnahmen / Bestandssicherung / Oberflächenschutz"
      : isLinearHouseConnectionLineReturn
        ? "Hausanschlussleitung / Leitungsverlegung"
      : isHouseConnectionReturn
        ? "Hausanschluss / Gebäudeeinführung / Arbeiten im Bestand"
      : isSpecialCivilReturn
        ? "Spezialtiefbau / schwierige Bauverfahren"
      : isAuthorityReturn
        ? "Genehmigungen / Auflagen / Sicherheitskoordination"
      : isSiteSetupReturn
        ? "Baustelleneinrichtung / Vorhaltung / Container / Baustrom / Bauwasser"
      : isLogisticsReturn
        ? "Zufahrt / Lager / Baustellenversorgung"
      : isProtectionReturn
        ? "Umwelt-, Natur- und Anwohnerschutz"
      : isTestingReturn
        ? "Prüfung / Abnahme / technische Nachweise"
      : isDisposalReturn
        ? "Entsorgung / Deponie / belasteter Boden"
      : isTrafficSafetyReturn
        ? "Verkehrssicherung / RSA / Umleitung / Beschilderung"
      : isTempSupplyReturn
        ? "Temporärer Anschluss / Notleitung / Medienversorgung"
      : isProvisoriumReturn
        ? "Provisorium / Baustraße / Umleitung"
        : isWasserhaltungReturn
          ? "Wasserhaltung / Pumpen / Baugrubenentwässerung"
      : /geraetevorhaltung|gerätevorhaltung|bauzeitunterbrechung|stillstand|wartezeit|wartezeiten|leitungsfreigabe|behoerdliche freigabe|behördliche freigabe|bauablaufstoerung|bauablaufstörung/.test(norm(`${kurztext} ${langtext}`))
        ? "Gerätevorhaltung / Stillstand / Wartezeiten"
      : /erschwernis|beengte|beengt|handschachtung|anliegerverkehr|versorgungsleitung|erschwerte/.test(norm(`${kurztext} ${langtext}`))
        ? "Erschwernis / beengte Bauweise"
        : s(parsed.leistungsart) || leistungsart,
    bauverfahren: isWaterHoldingReturn
      ? "Temporäre Wasserhaltung mit Pumpenanlage, Ableitung, Wartung, Notstrom und Rückbau"
      : isRiskSoilReturn
        ? "Baubegleitende Sondierung, Analyse, Gutachterleistung, Freigabe und Dokumentation"
      : isSurfaceRestorationReturn
        ? "Wiederherstellung von Verkehrsflächen mit Tragschichten, Asphalt, Pflaster, Bordstein und Anschluss an Bestand"
      : isDocumentationReturn
        ? "Digitale Bestandsaufnahme, CAD-/As-Built-Erstellung und Übergabedokumentation"
      : isTempSupplyReturn
        ? "Temporäre Herstellung, Prüfung, Betrieb und Rückbau"
      : isErschwernisReturn
        ? "Erschwerte Ausführung mit Handschachtung, beengter Logistik und zusätzlicher Koordination"
      : isLogisticsReturn
        ? "Logistik-, Lager- und Versorgungsmaßnahmen mit Vorhaltung und Rückbau"
      : isProtectionReturn
        ? "Sichern, Schützen, Kontrollieren und Rückbauen vorhandener Anlagen"
      : isLinearHouseConnectionLineReturn
        ? "Lineare Leitungsverlegung nach Meteransatz ohne Hausanschluss-Pauschale"
      : isHouseConnectionReturn
        ? "Gebäudenahe Ausführung mit Handschachtung, Kernbohrung, Hauseinführung und Wiederherstellung"
      : isSpecialCivilReturn
        ? "Verbau, Wasserhaltung, Bodenverbesserung, Pressung und Rohrvortrieb"
      : isAuthorityReturn
        ? "Behörden-, Sicherheits- und Freigabemanagement mit Dokumentation"
      : isSiteSetupReturn
        ? "Einrichtung, Betrieb, Vorhaltung, Unterhaltung und Rückbau der Baustelleneinrichtung"
      : isLogisticsReturn
        ? "Logistik-, Lager- und Versorgungsmaßnahmen mit Vorhaltung und Rückbau"
      : isProtectionReturn
        ? "Schutzmaßnahmen mit Aufbau, Kontrolle, Dokumentation und Rückbau"
      : isTestingReturn
        ? "Technische Prüfung mit Spülung, TV-Inspektion, Dichtheitsprüfung und Dokumentation"
      : isDisposalReturn
        ? "Entsorgungskalkulation mit Analytik, Transport, Deponie und Nachweisen"
      : isTrafficSafetyReturn
        ? "RSA-konforme Verkehrsführung mit Aufbau, Vorhaltung, täglicher Kontrolle und Rückbau"
      : isTempSupplyReturn
        ? "Temporäre Herstellung, Prüfung, Betrieb und Rückbau"
      : isProvisoriumReturn
        ? "Temporäre Herstellung, Vorhaltung, Unterhaltung und Rückbau"
        : isWasserhaltungReturn
          ? "Zeitabhängige Wasserhaltungs- und Pumpenkalkulation"
      : /geraetevorhaltung|gerätevorhaltung|bauzeitunterbrechung|stillstand|wartezeit|wartezeiten|leitungsfreigabe|behoerdliche freigabe|behördliche freigabe|bauablaufstoerung|bauablaufstörung/.test(norm(`${kurztext} ${langtext}`))
        ? "Zeitabhängige Vorhalte- und Stillstandskalkulation"
      : /erschwernis|beengte|beengt|handschachtung|anliegerverkehr|versorgungsleitung|erschwerte/.test(norm(`${kurztext} ${langtext}`))
        ? "Zuschlagskalkulation für erschwerte Bauausführung"
        : s(parsed.bauverfahren) || bauverfahren,

      rlcPreisMin: round2(n(rlcPreisRange.min)),
      rlcPreisAvg: round2(n(rlcPreisRange.avg)),
      rlcPreisMax: round2(n(rlcPreisRange.max)),
      rlcPreisSource: n(rlcPreisRange.avg) > 0 ? "RLC Preisbibliothek" : "",
      rlcPreisGroup: n(rlcPreisRange.avg) > 0 ? rlcPreisRange.matches?.[0]?.group || "" : "",

    warning: [s(parsed.warning), ...warnings].filter(Boolean).join(" · "),
    aiReason:
      [
        s(parsed.aiReason),
        contextQualityWarnings.length
          ? "RLC Context-Guard: Die Urkalkulation ist fachlich prüfpflichtig, weil bei einer kontextabhängigen Position einzelne Pflichtbestandteile fehlen oder auffällig niedrig angesetzt wurden."
          : "",
      ].filter(Boolean).join("\n\n") ||
      `OpenAI-Kalkulation: Keine ausreichend sichere Datenbankbasis vorhanden. Die Urkalkulation wurde per OpenAI aus LV-Text, Einheit, Menge, Gewerk, Leistungsart und Bauverfahren erstellt. Fachliche Prüfung erforderlich.`,

    source: cleanRlcSourceFlags("openai"),
    aiProvider: completion.provider,
    aiModel: completion.model,
    aiFallbackUsed: completion.fallbackUsed,
    priceBreakdown,
  };
}

function marketReviewFingerprint(row: InputRow): string {
  const ref: any = (row as any).referencePosition || null;
  const normalized = JSON.stringify({
    posNr: s(row.posNr).toLowerCase(),
    kurztext: s(row.kurztext).replace(/\s+/g, " ").toLowerCase(),
    langtext: s(row.langtext).replace(/\s+/g, " ").toLowerCase(),
    einheit: s(row.einheit).toLowerCase(),
    menge: n(row.menge),
    referencePosition: ref ? {
      posNr: s(ref.posNr).toLowerCase(),
      kurztext: s(ref.kurztext).replace(/\s+/g, " ").toLowerCase(),
      langtext: s(ref.langtext).replace(/\s+/g, " ").toLowerCase(),
      einheit: s(ref.einheit).toLowerCase(),
      menge: n(ref.menge),
    } : null,
  });
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

async function independentOpenAiReview(row: InputRow): Promise<any | null> {
  const posNr = s(row.posNr);
  const kurztext = s(row.kurztext);
  const langtext = s(row.langtext);
  const einheit = s(row.einheit);
  const menge = n(row.menge);
  const reference = (row as any).referencePosition || null;
  const referenceText = reference
    ? `\nBezug aus vorheriger LV-Position (nur Leistungsumfang, ohne Preise):\nPosition: ${s(reference?.posNr) || "—"}\nKurztext: ${s(reference?.kurztext) || "—"}\nLangtext: ${s(reference?.langtext) || "—"}\nEinheit: ${s(reference?.einheit) || "—"}\nMenge: ${n(reference?.menge)}\n`
    : "";

  if (!kurztext || !einheit) return null;

  const prompt = `Du bist ein unabhängiger deutscher Baukalkulator.
Erstelle eine zweite, eigenständige Markt-Plausibilisierung für genau eine LV-Position.

WICHTIG: Du erhältst absichtlich KEINEN RLC-Preis, KEINEN X84-Preis, KEINE Datenbankpreise und KEINE bestehende Urkalkulation. Berechne nicht durch Rückgabe oder Anpassung eines vorhandenen Preises. Recherchiere aktuelle deutsche Marktpreise im Web und leite daraus zusammen mit LV-Text, Einheit, Menge und Bauwissen einen eigenständigen plausiblen Netto-Einheitspreis ab. Bevorzuge belastbare Hersteller-, Händler-, Preislisten- und öffentliche Ausschreibungsquellen. Berücksichtige Preisstand 2026, soweit verfügbar.

Position: ${posNr || "—"}
Kurztext: ${kurztext}
Langtext: ${langtext || "—"}
Menge: ${menge}
Einheit: ${einheit}
${referenceText}
Antworte ausschließlich als JSON:
{
  "suggestedUnitPrice": number,
  "confidence": number,
  "reason": string,
  "assumptions": string,
  "warning": string
}

Der Preis ist netto pro ${einheit}; nenne knappe, nachvollziehbare Annahmen. Bevorzuge mehrere fachlich vergleichbare Quellen und vermeide Extremwerte. Wenn Angaben fehlen, schätze konservativ und benenne die Unsicherheit.`;

  const completion = await completeRlcMarketReviewWithWeb({
    purpose: "market_review",
    temperature: 0.2,
    responseFormat: "json",
    maxTokens: 600,
    messages: [
      { role: "system", content: "Du bist ein unabhängiger Baupreis-Gutachter. Antworte nur mit validem JSON." },
      { role: "user", content: prompt },
    ],
  });

  const parsed = extractJson(completion.text || "");
  const rawMarketPrice = round2(n(parsed?.suggestedUnitPrice));
  if (rawMarketPrice <= 0) {
    console.error("[RLC-KI][market-review-empty-price]", { posNr, kurztext, model: completion.model, text: String(completion.text || "").slice(0, 800) });
    return null;
  }

  const rlcRange = rlcPreisRangeForText(`${kurztext} ${langtext}`.trim(), einheit);
  const rlcMin = round2(n(rlcRange.min));
  const rlcAvg = round2(n(rlcRange.avg));
  const rlcMax = round2(n(rlcRange.max));
  const hasVerifiedRlcRange = rlcMin > 0 && rlcAvg > 0 && rlcMax > 0;
  const outsideVerifiedRange = hasVerifiedRlcRange && (rawMarketPrice < rlcMin || rawMarketPrice > rlcMax);

  // RLC Quality Gate: documented/calibrated RLC market ranges are the economic
  // safety rail. A volatile web-only estimate may inform the result but may not
  // become an adoptable final price when it falls outside that verified range.
  const suggestedUnitPrice = outsideVerifiedRange ? rlcAvg : rawMarketPrice;
  const gateNote = outsideVerifiedRange
    ? `RLC Quality Gate: externer Marktwert ${rawMarketPrice} €/EH liegt außerhalb des verifizierten RLC-Marktbereichs ${rlcMin}–${rlcMax} €/EH. Verwendet wird der RLC-Mittelwert ${rlcAvg} €/EH.`
    : hasVerifiedRlcRange
      ? `RLC Quality Gate: Marktwert liegt innerhalb des verifizierten RLC-Marktbereichs ${rlcMin}–${rlcMax} €/EH.`
      : "RLC Quality Gate: Kein dokumentierter RLC-Marktbereich verfügbar; Ergebnis bleibt prüfpflichtig.";

  return {
    id: row.id,
    posNr,
    suggestedUnitPrice,
    finalUnitPrice: suggestedUnitPrice,
    rawMarketPrice,
    rlcMarketMin: rlcMin,
    rlcMarketAvg: rlcAvg,
    rlcMarketMax: rlcMax,
    rlcPreisMin: rlcMin,
    rlcPreisAvg: rlcAvg,
    rlcPreisMax: rlcMax,
    rlcPreisSource: hasVerifiedRlcRange ? "RLC verifizierter Marktbereich" : "",
    rlcPreisGroup: hasVerifiedRlcRange ? (rlcRange.matches?.[0]?.group || "") : "",
    qualityGateAdjusted: outsideVerifiedRange,
    confidence: outsideVerifiedRange ? Math.min(n(parsed?.confidence) || 0.6, 0.85) : n(parsed?.confidence) || 0.6,
    aiReason: [s(parsed?.reason), s(parsed?.assumptions), gateNote].filter(Boolean).join(" · "),
    warning: [s(parsed?.warning), !hasVerifiedRlcRange ? "RLC-Marktbereich nicht dokumentiert – fachliche Prüfung erforderlich." : ""].filter(Boolean).join(" · "),
    source: "openai-independent",
    aiProvider: completion.provider,
    aiModel: completion.model,
    aiUsage: completion.usage || null,
    webSearchCalls: completion.webSearchCalls || 0,
    marketSources: completion.sources || [],
  };
}

function shouldUseOpenAIForRow(
  row: InputRow,
  matches: DbMatch[],
  useOpenAI: boolean,
  openAiBudgetLeft: number,
  forceRecalculate = false
): boolean {
  if (!useOpenAI) return false;
  if (openAiBudgetLeft <= 0) return false;
  if (isStructuralTitleRow(row)) return false;

  if (forceRecalculate) return true;

  const unit = s(row.einheit);
  const fullText = `${s(row.kurztext)} ${s(row.langtext)}`.trim();
  const contextSensitive = isContextSensitivePosition(fullText, unit);
  const hasStrongDb = contextSensitive ? false : strongDatabaseHit(matches, unit);

  /*
   * Qualität vor Geschwindigkeit:
   * - Starker DB-Treffer = keine OpenAI nötig.
   * - Ohne starken DB-Treffer darf OpenAI auch bei bekannten Positionen prüfen,
   *   sonst fallen Aushub/Pflaster/Leistenstein auf zu niedrige Rule-Engine-Werte.
   */
  if (hasStrongDb) return false;

  const text = `${s(row.kurztext)} ${s(row.langtext)}`.trim();
  const risk = riskFromText(text, unit, n(row.menge));

  if (risk === "high") return true;
  if (!s(row.kurztext) || !unit || n(row.menge) <= 0) return true;
  if (!matches.length) return true;

  return false;
}



import fs from "fs";
import path from "path";
import { reverseUrkalkulationFromX84 } from "../kalkulation/rlcReverseUrkalkulationEngine";

const KALKULATION_AI_CACHE_FILE =
  process.env.KALKULATION_AI_CACHE_FILE ||
  "/app/data/kalkulation-ai-cache.json";

function loadKalkulationAiCache() {
  try {
    if (!fs.existsSync(KALKULATION_AI_CACHE_FILE)) return;

    const raw = fs.readFileSync(KALKULATION_AI_CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") return;

    for (const [key, value] of Object.entries(parsed)) {
      kalkulationAiCache.set(key, value);
    }

    console.log(
      `[kalkulation.ki] AI cache loaded: ${kalkulationAiCache.size} entries`
    );
  } catch (e: any) {
    console.warn("[kalkulation.ki] AI cache load failed:", e?.message || e);
  }
}

let cacheSaveTimer: NodeJS.Timeout | null = null;

function scheduleKalkulationAiCacheSave() {
  if (cacheSaveTimer) return;

  cacheSaveTimer = setTimeout(() => {
    cacheSaveTimer = null;

    try {
      fs.mkdirSync(path.dirname(KALKULATION_AI_CACHE_FILE), { recursive: true });

      const obj: Record<string, any> = {};
      for (const [key, value] of kalkulationAiCache.entries()) {
        obj[key] = value;
      }

      fs.writeFileSync(
        KALKULATION_AI_CACHE_FILE,
        JSON.stringify(obj, null, 2),
        "utf8"
      );
    } catch (e: any) {
      console.warn("[kalkulation.ki] AI cache save failed:", e?.message || e);
    }
  }, 750);
}


const kalkulationAiCache = new Map<string, any>();
loadKalkulationAiCache();

function cacheKeyForRow(row: InputRow): string {
  const pos = s(row.posNr).toLowerCase();
  const kurz = s(row.kurztext).toLowerCase();
  const lang = s(row.langtext).toLowerCase();
  const unit = s(row.einheit).toLowerCase();
  const menge = round2(n(row.menge));

  return ["rlc-ki-pipeline-v2", pos, kurz, lang.slice(0, 500), unit, menge].join("|");
}

function cloneCachedRow(row: any, input: InputRow) {
  return {
    ...row,
    id: input.id,
    posNr: s(input.posNr),
    menge: n(input.menge, row.menge),
  };
}


function rlcCriticalTextFamily(row: any): string {
  const text = norm([
    row?.posNr,
    row?.position,
    row?.kurztext,
    row?.shortText,
    row?.text,
    row?.langtext,
    row?.description,
  ].join(" "));

  if (/baustelleneinrichtung|baustellen.*einrichtung|baustelle.*vorhalten|baustelle.*betreiben/.test(text)) return "baustelleneinrichtung";
  if (/erschwernis|bestandsplaene|bestandspläne|vermessung|dokumentation|beh[oö]rde|verkehrssicherung/.test(text)) return "context_psch";
  if (/rohrgrabenaushub|leitungsgrabenaushub|grabenaushub|rohrgraben.*aushub/.test(text)) return "rohrgrabenaushub";
  if (/zuschlag.*rohrgrabenaushub|rohrgrabenaushub.*bd-kl|bodenklasse|bd-kl/.test(text)) return "rohrgrabenzuschlag";
  if (/kabelschutzrohr/.test(text)) return "kabelschutzrohr";
  if (/schutzmatte|rohrschutz|kabelschutzmatte/.test(text)) return "schutzmatte";
  if (/mikrokabelleerrohr|mikro.*leerrohr|speedpipe|leerrohrverbund/.test(text)) return "mikro_leerrohr";
  if (/rohrumhuellung|rohrumhüllung|sandueberdeckung|sandüberdeckung|sohlbettung/.test(text)) return "rohrumhuellung";
  return "";
}

function rlcBlocksTechnicalParser(row: any): boolean {
  const family = rlcCriticalTextFamily(row);
  const unit = norm(row?.einheit ?? row?.unit);

  if (family === "baustelleneinrichtung") return true;
  if (family === "context_psch" && /psch|pausch|st/.test(unit)) return true;
  if (family === "rohrgrabenaushub") return true;
  if (family === "rohrgrabenzuschlag") return true;
  if (family === "kabelschutzrohr") return true;
  if (family === "schutzmatte") return true;
  if (family === "mikro_leerrohr") return true;
  if (family === "rohrumhuellung") return true;

  return false;
}




function rlcGlobalKnowledgeFamilyKey(textRaw: any): string {
  const text = norm(String(textRaw || ""));

  if (/rohrschutzmatte|kabelschutzmatte|schutzmatte/.test(text)) return "schutzmatte";
  if (/kabelschutzrohr|schutzrohr|kabelleerrohr|kabellehrrohr|leerrohr|dn\s*110/.test(text)) return "kabelschutzrohr";
  if (/mikroroh?r|mikro.*rohr|mikrorohrverband|speedpipe|lwl.*rohr|glasfaser.*rohr|leerrohrverbund/.test(text)) return "lwl_mikrorohr";
  if (/lwl|glasfaser|telekom|vodafone/.test(text)) return "lwl_glasfaser";

  if (/gasleitung|gasrohr|pe\s*dn\s*63/.test(text)) return "gasleitung";
  if (/wasserleitung|trinkwasserleitung|wasserrohr|dn\s*100/.test(text)) return "wasserleitung";
  if (/fernwaerme|fernwärme|nahwaerme|nahwärme/.test(text)) return "fernwaerme";
  if (/mittelspannung|stromkabel|energiekabel|kabel.*verlegen/.test(text)) return "strom_kabel";
  if (/hausanschluss|hausanschlussleitung|hauseinfuehrung|hauseinführung|anschluss an bestand/.test(text)) return "hausanschluss";

  if (/asphalt.*schneiden|asphaltschnitt|schneiden.*asphalt/.test(text)) return "asphalt_schneiden";
  if (/asphalt.*aufnehmen|asphalt.*entsorgen|asphaltdecke.*aufnehmen/.test(text)) return "asphalt_aufnehmen";
  if (/asphalttragschicht|tragschicht.*asphalt/.test(text)) return "asphalt_tragschicht";
  if (/asphaltdeckschicht|deckschicht.*asphalt/.test(text)) return "asphalt_deckschicht";

  if (/suchschlitz|suchgraben|erkundungsschlitz/.test(text)) return "suchschlitz";
  if (/rohrgraben|rohrgrabenaushub|leitungsgraben|grabenaushub/.test(text)) return "rohrgraben";
  if (/handschachtung|handschacht/.test(text)) return "handschachtung";
  if (/verbau|grabenverbau/.test(text)) return "verbau";
  if (/spundwand/.test(text)) return "spundwand";
  if (/horizontalbohrung|hdd|spuelbohrung|spülbohrung|bohrung/.test(text)) return "hdd";

  if (/pflaster|betonpflaster|natursteinpflaster|klinkerpflaster|oekopflaster|ökopflaster/.test(text)) return "pflaster";
  if (/bordstein|randstein|hochbord|tiefbord|leistenstein|einzeiler|dreizeiler/.test(text)) return "bordstein";
  if (/asphalt.*schneiden|asphaltschnitt|schneiden.*asphalt/.test(text)) return "asphalt_schneiden";
  if (/asphalt.*aufnehmen|asphalt.*entsorgen|asphaltdecke.*aufnehmen/.test(text)) return "asphalt_aufnehmen";
  if (/asphalttragschicht|tragschicht.*asphalt/.test(text)) return "asphalt_tragschicht";
  if (/asphaltdeckschicht|deckschicht.*asphalt/.test(text)) return "asphalt_deckschicht";
  if (/bankett/.test(text)) return "bankett";

  if (/schachtabdeckung|abdeckung.*d400|d400/.test(text)) return "schachtabdeckung";
  if (/strassenablauf|straßenablauf|ablauf.*setzen/.test(text)) return "strassenablauf";
  if (/kabelschacht/.test(text)) return "kabelschacht";
  if (/schacht.*dn|fertigteilschacht|schacht.*setzen/.test(text)) return "schacht";

  if (/entsorgen|entsorgung|kippe|deponie|aushubmaterial.*abfahren|boden.*abfahren/.test(text)) return "entsorgung";
  if (/kanal|kanalrohr|kg-rohr|kg rohr|dn\s*150|schmutzwasser|regenwasser/.test(text)) return "kanal";
  if (/auffuellung|auffüllung|frostschutz|frostschutzmaterial|schotter|kies|mineralbeton|verfuell|verfüll|sandbettung|bettung/.test(text)) return "auffuellung";
  if (/auskofferung|auskoffern|boden auskoffern/.test(text)) return "auskofferung";
  if (/fluessigboden|flüssigboden/.test(text)) return "fluessigboden";
  if (/warnband|trassenband/.test(text)) return "warnband";

  if (/regiestunde.*facharbeiter|facharbeiter.*nachweis|arbeiter.*nachweis/.test(text)) return "regie_personal";
  if (/regiestunde.*bagger|mobilbagger|kettenbagger|bagger.*nachweis/.test(text)) return "regie_bagger";
  if (/lkw|transport|dreiachser|kipper/.test(text)) return "transport_lkw";
  if (/ruettelplatte|rüttelplatte|verdichtungsgeraet|verdichtungsgerät/.test(text)) return "verdichtung_geraet";

  if (/statik.*druckerh[oö]hungsschacht|druckerh[oö]hungsschacht.*statik/.test(text)) return "statik_druckerhoehungsschacht";
  if (/betonsockel|sockel.*c\s*25|c\s*25\/30/.test(text)) return "betonsockel";
  if (/forststra[sß]e|forststrasse|forststraßen|forststrassen/.test(text)) return "forststrasse";

  if (/baustelleneinrichtung/.test(text)) return "baustelleneinrichtung";
  if (/verkehrssicherung|rsa|beschilderung|umleitung|ampel|absperrung|bauzaun|absturzsicherung/.test(text)) return "sicherung";
  if (/hoehenfestpunkt|höhenfestpunkt|vermessung|bestandsaufnahme|gelaendeaufnahme|geländeaufnahme|dokumentation|as-built/.test(text)) return "vermessung";
  if (/spartenerkundung|sparten.*erkundung|leitungsfreigabe/.test(text)) return "spartenerkundung";
  if (/ueberfahrt|überfahrt|ueberfahrten|überfahrten/.test(text)) return "ueberfahrt";
  if (/rasenansaat|oberboden|planum|fsk korrigieren|frostschutzschicht korrigieren|aufsatz ausbauen|reinigung von strassen|reinigung von straßen|probenahme|deklarationsanalyse|verdichtbares material|recyclingmaterial|betonfundament|wurzelstock|kunststoffrohrleitung|rohrleitung ausbauen|abstimmung mit projektbeteiligten/.test(text)) return "fremdfamilie";

  return "";
}

function rlcGlobalKnowledgeFamilyCompatible(row: InputRow, item: any): boolean {
  const rowText = [
    (row as any).posNr,
    (row as any).kurztext,
    (row as any).shortText,
    (row as any).text,
    (row as any).langtext,
    (row as any).longText,
  ].join(" ");

  const itemText = [
    (item as any).normalizedKey,
    (item as any).shortText,
    (item as any).longText,
    (item as any).category,
    (item as any).gewerk,
  ].join(" ");

  const rowFamily = rlcGlobalKnowledgeFamilyKey(rowText);
  const itemFamily = rlcGlobalKnowledgeFamilyKey(itemText);

  if (!rowFamily || !itemFamily) return item.globalKnowledgeSimilarity >= 70;
  return rowFamily === itemFamily;
}


function globalKnowledgeSimilarity(row: InputRow, item: any): number {
  const rowText = s(`${row.kurztext ?? ""} ${row.langtext ?? ""}`).toLowerCase();
  const itemText = s(`${item.shortText ?? ""} ${item.longText ?? ""}`).toLowerCase();

  const rowUnit = s(row.einheit).toLowerCase();
  const itemUnit = s(item.unit).toLowerCase();

  const rowTokens = new Set(
    rowText
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((x) => x.length >= 4)
  );

  const itemTokens = new Set(
    itemText
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((x) => x.length >= 4)
  );

  let score = 0;

  if (rowUnit && itemUnit && rowUnit === itemUnit) score += 25;
  if (s(item.shortText).toLowerCase() === s(row.kurztext).toLowerCase()) score += 45;
  if (s(item.shortText).toLowerCase().includes(s(row.kurztext).toLowerCase())) score += 25;
  if (s(row.kurztext).toLowerCase().includes(s(item.shortText).toLowerCase())) score += 25;

  let overlap = 0;
  for (const token of rowTokens) {
    if (itemTokens.has(token)) overlap += 1;
  }

  score += Math.min(30, overlap * 10);

  if (s(item.category) && rowText.includes(s(item.category).toLowerCase())) score += 10;
  if (s(item.gewerk) && rowText.includes(s(item.gewerk).toLowerCase())) score += 8;

  return score;
}


function recalcBlockedTechnicalAfterGlobalKnowledge(row: InputRow, result: any): any {
  const blocked =
    (result as any)?.technicalParserBlocked === true ||
    s((result as any)?.source).includes("technical-parser-blocked-by-family-mismatch");

  if (!blocked) return result;

  const alreadyRecalculated = (result as any)?.recalculatedAfterBlock === true;
  if (alreadyRecalculated) return result;

  const gk = (result as any)?.globalKnowledgeMatch;
  if (!gk) return result;

  const rowUnit = normUnit(s((row as any).einheit));
  const gkUnit = normUnit(s((gk as any).unit));
  const sameUnit = !!rowUnit && !!gkUnit && rowUnit === gkUnit;

  const gkConfidence = n((gk as any).confidence);
  const gkAvg = n((gk as any).priceAvg);
  const gkMin = n((gk as any).priceMin);
  const fallbackEp = gkAvg > 0 ? gkAvg : gkMin > 0 ? gkMin : 0;

  if (!sameUnit || gkConfidence < 0.5 || fallbackEp <= 0) return result;

  const qty = n((row as any).menge ?? (row as any).quantity ?? (result as any).menge ?? (result as any).quantity);
  const total = qty > 0 ? round2(fallbackEp * qty) : n((result as any).totalNet ?? (result as any).gesamt ?? (result as any).totalPrice);

  const oldEp = n(
    (result as any).finalUnitPrice ??
    (result as any).rlcKiUnitPrice ??
    (result as any).unitPrice ??
    (result as any).preis
  );

  const note =
    `RLC Block+Recalculate: Nach Global-Knowledge-Treffer wurde der blockierte technical-parser Preis ersetzt. ` +
    `Neuer prüfpflichtiger EP aus Global Knowledge Ø ${round2(fallbackEp)} €/Einheit.`;

  return {
    ...result,
    source: cleanRlcSourceFlags("technical-parser-blocked-by-family-mismatch-recalculated-gk"),
    confidence: Math.min(n((result as any).confidence, 0.5), 0.52),
    riskLevel: "high",
    calculationStatus: "needs_review",
    suggestedUnitPrice: round2(fallbackEp),
    finalUnitPrice: round2(fallbackEp),
    baseUnitPrice: round2(fallbackEp),
    rlcKiUnitPrice: round2(fallbackEp),
    unitPrice: round2(fallbackEp),
    preis: round2(fallbackEp),
    totalNet: total,
    rlcKiTotal: total,
    gesamt: total,
    totalPrice: total,
    warning: [s((result as any).warning), note].filter(Boolean).join(" · "),
    aiReason: [s((result as any).aiReason), note].filter(Boolean).join("\n\n"),
    recalculatedAfterBlock: true,
    recalculatedUnitPrice: round2(fallbackEp),
    recalculatedTotalNet: total,
    recalculationSource: "global-knowledge-average-after-hint",
    blockedOriginalUnitPrice: round2(oldEp),
  };
}


function cleanRohrgrabenaushubTechnicalSource(row: InputRow, result: any): any {
  const rowText = norm([
    (row as any)?.posNr,
    (row as any)?.kurztext,
    (row as any)?.langtext,
    (row as any)?.text,
  ].join(" "));

  const isRohrgrabenaushub =
    /rohrgrabenaushub|leitungsgrabenaushub|grabenaushub/.test(rowText);

  if (!isRohrgrabenaushub) return result;

  const source = s((result as any)?.source);
  const resultText = norm([
    source,
    (result as any)?.gewerk,
    (result as any)?.leistungsart,
    (result as any)?.bauverfahren,
    (result as any)?.aiReason,
    (result as any)?.warning,
    JSON.stringify((result as any)?.priceBreakdown ?? []),
  ].join(" "));

  const shouldCleanTechnicalSource =
    source === "technical-parser" ||
    (
      source.includes("technical-parser") &&
      (
        resultText.includes("firmenkalibrierung") ||
        resultText.includes("firmeneigenen x84") ||
        resultText.includes("rlc firmenkalibrierung aus x84")
      )
    );

  if (!shouldCleanTechnicalSource) return result;

  const ep = n(
    (result as any).finalUnitPrice ??
    (result as any).rlcKiUnitPrice ??
    (result as any).unitPrice ??
    (result as any).preis
  );

  const qty = n(
    (row as any).menge ??
    (row as any).quantity ??
    (result as any).menge ??
    (result as any).quantity
  );

  const total = ep > 0 && qty > 0
    ? round2(ep * qty)
    : n((result as any).totalNet ?? (result as any).gesamt ?? (result as any).totalPrice);

  const note =
    "RLC Source-Cleanup: Rohrgrabenaushub wurde als technische Aushubposition erkannt. " +
    "Falsche Firmenkalibrierung-Markierung wurde entfernt; EP bleibt prüfpflichtig.";

  return {
    ...result,
    source: cleanRlcSourceFlags("technical-parser-rohrgrabenaushub-cleaned"),
    confidence: Math.min(n((result as any).confidence, 0.5), 0.62),
    riskLevel: "high",
    calculationStatus: "needs_review",
    totalNet: total,
    rlcKiTotal: total,
    gesamt: total,
    totalPrice: total,
    warning: [s((result as any).warning), note].filter(Boolean).join(" · "),
    aiReason: [s((result as any).aiReason), note].filter(Boolean).join("\n\n"),
    sourceCleanupApplied: true,
    sourceCleanupReason: note,
  };
}


export async function applyGlobalKnowledgeHint(row: InputRow, result: any): Promise<any> {
  try {
    const text = s(`${row.kurztext ?? ""} ${row.langtext ?? ""}`);
    const unit = s(row.einheit);

    if (!text.trim()) return result;

    const tokens = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/)
      .filter((x) => x.length >= 4)
      .slice(0, 6);

    if (!tokens.length) return result;

    const q = tokens[0];

    const matches = await prisma.rlcGlobalKnowledgeAggregated.findMany({
      where: {
        AND: [
          {
            OR: [
              ...tokens.map((token) => ({ normalizedKey: { contains: token } })),
              ...tokens.map((token) => ({ shortText: { contains: token, mode: "insensitive" as const } })),
              ...tokens.map((token) => ({ longText: { contains: token, mode: "insensitive" as const } })),
              ...tokens.map((token) => ({ gewerk: { contains: token, mode: "insensitive" as const } })),
              ...tokens.map((token) => ({ category: { contains: token, mode: "insensitive" as const } })),
            ],
          },
          unit ? { unit: { contains: unit, mode: "insensitive" } } : {},
        ],
      },
      orderBy: [
        { confidence: "desc" },
        { sampleCount: "desc" },
        { updatedAt: "desc" },
      ],
      take: 3,
    });

    const scoredMatches = matches
      .map((m: any) => ({ ...m, globalKnowledgeSimilarity: globalKnowledgeSimilarity(row, m) }))
      .filter((m: any) => m.globalKnowledgeSimilarity >= 70 || rlcGlobalKnowledgeFamilyCompatible(row, m))
      .sort((a: any, b: any) => b.globalKnowledgeSimilarity - a.globalKnowledgeSimilarity);

    const best = scoredMatches[0];
    if (!best) return result;

    const note = `Global Knowledge Vergleich: ${best.priceMin ?? "-"}–${best.priceMax ?? "-"} €/` +
      `${(best.unit ?? unit) || "Einheit"}, Ø ${best.priceAvg ?? "-"} €/` +
      `${(best.unit ?? unit) || "Einheit"}, Confidence ${best.confidence}. Nur Vergleichswert, kein finaler Kalkulationspreis.`;

    const gkConfidence = n(best.confidence);
    const gkMin = n(best.priceMin);
    const gkMax = n(best.priceMax);
    const gkRangeRatio = gkMin > 0 && gkMax > 0 ? gkMax / gkMin : 999;

    const gkStrong =
      gkConfidence >= 0.7 &&
      !best.isContextSensitive &&
      gkRangeRatio <= 4;

    const resultEp = n(
      (result as any).finalUnitPrice ??
      (result as any).rlcKiUnitPrice ??
      (result as any).unitPrice ??
      (result as any).preis
    );

    const gkOutlier =
      gkStrong &&
      resultEp > 0 &&
      gkMax > 0 &&
      resultEp > gkMax * 3;

    // Global Knowledge is diagnostic evidence only. It cannot approve, demote,
    // or override the technical confidence/risk/review verdict from the price engine.
    const boostedConfidence = (result as any).confidence;
    const boostedRiskLevel = (result as any).riskLevel;
    const boostedStatus = (result as any).calculationStatus;

    const trustNote = gkStrong
      ? gkOutlier
        ? `Global Knowledge Outlier-Guard: KI-EP ${resultEp} €/Einheit liegt deutlich über Global-Knowledge-Max ${gkMax} €/Einheit bei Confidence ${gkConfidence}. Position bleibt fachlich prüfpflichtig; Preis wurde nicht automatisch ersetzt.`
        : `Global Knowledge Confidence-Guard: starker Vergleichstreffer (${gkConfidence}) bestätigt Plausibilität. Preis bleibt KI-/Regel-Ergebnis, Global Knowledge ist nur Kontrollwert.`
      : "";

    return recalcBlockedTechnicalAfterGlobalKnowledge(row, {
      ...result,
      confidence: boostedConfidence,
      riskLevel: boostedRiskLevel,
      calculationStatus: boostedStatus,
      globalKnowledgeMatch: best,
      globalKnowledgeMatches: scoredMatches,
      globalKnowledgePriceMin: best.priceMin,
      globalKnowledgePriceAvg: best.priceAvg,
      globalKnowledgePriceMax: best.priceMax,
      globalKnowledgeConfidence: best.confidence,
      globalKnowledgeSource: Array.isArray(best.sources) ? best.sources.join(', ') : '',
      warning: [s(result?.warning), note, trustNote].filter(Boolean).join(" · "),
      aiReason: [s(result?.aiReason), note, trustNote].filter(Boolean).join("\n\n"),
    });
  } catch (e: any) {
    return {
      ...result,
      warning: [
        s(result?.warning),
        `Global Knowledge Vergleich konnte nicht geladen werden: ${e?.message ?? "unknown error"}`,
      ].filter(Boolean).join(" · "),
    };
  }
}

const RLC_LEGACY_DATABASE_PRICE_ENABLED = false;
const RLC_LEGACY_RULE_ENGINE_PRICE_ENABLED = false;

function buildUnresolvedV2Row(row: InputRow, reason: string) {
  return {
    ...row,
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
    rlcKiUnitPrice: 0,
    unitPrice: 0,
    preis: 0,
    totalNet: 0,
    rlcKiTotal: 0,
    gesamt: 0,
    confidence: 0.35,
    riskLevel: "high",
    calculationStatus: "needs_review",
    warning: cleanRlcWarningText(
      "Keine freigegebene RLC-v2-/Recipe-Preisermittlung verfügbar. Legacy DB/v1/rule-engine dürfen den EP nicht mehr bestimmen."
    ),
    aiReason: reason,
    source: cleanRlcSourceFlags("rlc-v2-unresolved"),
    priceBreakdown: [],
  };
}

export async function calcSmartRow(
  row: InputRow,
  matches: DbMatch[] | null,
  companyId: string,
  useOpenAI: boolean,
  openAiBudgetLeft = 999,
  forceRecalculate = false,
  allRows: InputRow[] = [],
  projectCode?: string
) {
  if (isStructuralTitleRow(row)) {
    return {
      id: row.id,
      posNr: s(row.posNr),
      kurztext: s(row.kurztext),
      langtext: s(row.langtext),
      einheit: s(row.einheit) || "PS",
      menge: n(row.menge, 1),
      materialCost: 0,
      laborCost: 0,
      machineCost: 0,
      subcontractorCost: 0,
      disposalCost: 0,
      overheadCost: 0,
      riskCost: 0,
      profitCost: 0,
      baseUnitPrice: n(row.preis),
      suggestedUnitPrice: n(row.preis),
      finalUnitPrice: n(row.preis),
      confidence: 0.9,
      riskLevel: "low",
      calculationStatus: n(row.preis) > 0 ? "manual" : "ok",
      gewerk: "Gliederung / Titel",
      leistungsart: "Strukturposition",
      bauverfahren: "Keine kalkulatorische Leistungsposition",
      warning: "",
      aiReason: "Titel-/Gliederungsposition: Keine kalkulatorische Leistungsposition. Von OpenAI bewusst ausgeschlossen.",
      source: cleanRlcSourceFlags("rule-engine"),
      priceBreakdown: [],
    };
  }

  const autoPosNr = s((row as any).posNr || (row as any).pos).toUpperCase();
  const autoPlaceholderText = norm(
    [s((row as any).kurztext), s((row as any).langtext)].filter(Boolean).join(" ")
  );
  const autoPlaceholderSearchText = autoPlaceholderText
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
  const isUnresolvedAutoKiPlaceholder =
    autoPosNr.startsWith("AUTO.") &&
    autoPlaceholderSearchText.includes("keine ausreichend aehnliche lv-position gefunden");

  if (isUnresolvedAutoKiPlaceholder) {
    return buildUnresolvedV2Row(
      row,
      "AutoKI-Position ohne belastbare Leistungsbeschreibung: Kein EP bis Beschreibung fachlich bestätigt oder korrigiert wurde."
    );
  }

  /*
   * RLC V2 PRIMARY ABSOLUTE:
   * Der Family Catalog v2 ist die erste und maßgebliche Preisquelle.
   * Technical Parser, Recipe-Legacy, DB, Cache und OpenAI dürfen nur greifen,
   * wenn v2 für diese Position kein belastbares Ergebnis liefert.
   */
  const primaryAutonomousResolved = resolveRlcAutonomousCalculation(
    row as any,
    (allRows.length ? allRows : [row]) as any,
    projectCode
  );
  const primaryAutonomousRow = mapAutonomousResultToKiRow(
    row as any,
    primaryAutonomousResolved
  );
  // RLC Motor is the only automatic EP authority. All legacy recipe/DB/AI
  // branches below are retained for migration only and cannot execute here.
  if (!primaryAutonomousRow) {
    return buildUnresolvedV2Row(row, "RLC Motor: keine technisch freigegebene Urkalkulation; EP gesperrt.");
  }
  return {
    ...primaryAutonomousRow,
    source: cleanRlcSourceFlags((primaryAutonomousRow as any).source),
    aiReason: [s((primaryAutonomousRow as any).aiReason), "RLC Motor: einzige automatische Preisautorität."].filter(Boolean).join("\n\n"),
  };


}


function normalizeLearningRisk(value: any): string {
  const v = s(value).toLowerCase();

  if (v === "low" || v === "niedrig") return "niedrig";
  if (v === "high" || v === "hoch") return "hoch";
  if (v === "critical" || v === "kritisch") return "kritisch";

  return "mittel";
}

function isValidLearningRow(row: any): boolean {
  if (!row) return false;
  if (row.source === "rule-engine") return false;
  if (row.source === "database") return false;
  if (row.source === "x84-company-baseline") return false;
  if (isStructuralTitleRow(row)) return false;

  const ep = n(row.finalUnitPrice ?? row.suggestedUnitPrice ?? row.baseUnitPrice);
  const kurztext = s(row.kurztext);
  const unit = s(row.einheit);
  const confidence = n(row.confidence);

  if (!kurztext || !unit || ep <= 0) return false;
  if (confidence < 0.6) return false;

  return true;
}


function validateKiLearningBreakdown(row: any): {
  valid: boolean;
  reason: string;
  ep: number;
  breakdownTotal: number;
  deltaPct: number;
} {
  const ep = n(
    row?.finalUnitPrice ??
    row?.rlcKiUnitPrice ??
    row?.suggestedUnitPrice ??
    row?.baseUnitPrice
  );

  const breakdown = Array.isArray(row?.priceBreakdown)
    ? row.priceBreakdown
    : [];

  if (!(ep > 0)) {
    return {
      valid: false,
      reason: "LEARNING_EP_MISSING",
      ep,
      breakdownTotal: 0,
      deltaPct: 100,
    };
  }

  /*
   * Kein Breakdown = keine belastbare Urkalkulation.
   * Solche Preise dürfen nicht als CompanyRecipe gelernt werden.
   */
  if (!breakdown.length) {
    return {
      valid: false,
      reason: "LEARNING_BREAKDOWN_MISSING",
      ep,
      breakdownTotal: 0,
      deltaPct: 100,
    };
  }

  const breakdownTotal = round2(
    breakdown.reduce(
      (sum: number, line: any) => sum + n(line?.total),
      0
    )
  );

  if (!(breakdownTotal > 0)) {
    return {
      valid: false,
      reason: "LEARNING_BREAKDOWN_EMPTY",
      ep,
      breakdownTotal,
      deltaPct: 100,
    };
  }

  const deltaPct = Math.abs(breakdownTotal - ep) / ep * 100;

  /*
   * Rundungsdifferenzen sind erlaubt.
   * EP und Urkalkulation müssen aber dieselbe Kalkulation darstellen.
   */
  const tolerance = Math.max(0.02, ep * 0.02);
  const valid = Math.abs(breakdownTotal - ep) <= tolerance;

  return {
    valid,
    reason: valid
      ? "OK"
      : "LEARNING_EP_BREAKDOWN_MISMATCH",
    ep: round2(ep),
    breakdownTotal,
    deltaPct: round2(deltaPct),
  };
}

async function saveKiLearningRows(
  companyId: string,
  projectKey: string,
  rows: any[]
): Promise<number> {
  const project = projectKey
    ? await prisma.project.findFirst({
        where: {
          companyId,
          OR: [{ id: projectKey }, { code: projectKey }, { number: projectKey }],
        },
        select: { id: true, code: true, name: true, number: true },
      })
    : null;

  async function processLearningRow(row: any): Promise<number> {
    const learningSource = s(row?.source);
    if (learningSource.includes("rlc-autonomous-urkalkulation")) return 0;
    if (isStructuralTitleRow(row)) return 0;
    if (!isValidLearningRow(row)) return 0;

    const learningBreakdownGate = validateKiLearningBreakdown(row);
    if (!learningBreakdownGate.valid) {
      console.warn("[RLC KI Learning BLOCKED]", {
        posNr: s(row?.posNr),
        kurztext: s(row?.kurztext),
        reason: learningBreakdownGate.reason,
        ep: learningBreakdownGate.ep,
        breakdownTotal: learningBreakdownGate.breakdownTotal,
        deltaPct: learningBreakdownGate.deltaPct,
      });
      return 0;
    }

    const posNr = s(row.posNr);
    const kurztext = s(row.kurztext);
    const langtext = s(row.langtext);
    const einheit = s(row.einheit);
    const menge = n(row.menge);
    const ep = n(row.finalUnitPrice ?? row.suggestedUnitPrice ?? row.baseUnitPrice);
    const gp = round2(ep * Math.max(0, menge));

    const qualityGateStatus = "KI-Vorschlag";

    const existing = await prisma.kalkulationsDbEntry.findFirst({
      where: {
        companyId,
        positionNumber: posNr,
      },
      select: {
        id: true,
        source: true,
        useCount: true,
        parameters: true,
      },
    });

    const parameters = {
      ...((existing?.parameters as any) || {}),
      ...(row.parameters || {}),
      qualityGateStatus,
      learningSource: row.source || "ki",
      learnedAt: new Date().toISOString(),
      warning: s(row.warning),
      aiReason: s(row.aiReason),
      priceBreakdown: Array.isArray(row.priceBreakdown) ? row.priceBreakdown : [],
    };

    const data = {
      companyId,
      projectId: project?.id || null,
      source: cleanRlcSourceFlags("ki-learning"),
      projectCode: s(project?.code || project?.number || projectKey),
      projectName: s(project?.name),

      positionNumber: posNr,
      shortText: kurztext,
      longText: langtext,
      unit: einheit,
      quantity: menge,

      materialCost: n(row.materialCost),
      laborCost: n(row.laborCost),
      machineCost: n(row.machineCost),
      subcontractorCost: n(row.subcontractorCost),
      disposalCost: n(row.disposalCost),
      transportCost: 0,
      overheadCost: n(row.overheadCost),
      riskCost: n(row.riskCost),
      profitCost: n(row.profitCost),

      unitPriceNet: ep,
      totalNet: gp,

      trade: s(row.gewerk),
      serviceType: s(row.leistungsart),
      constructionMethod: s(row.bauverfahren),
      soilClass: "",

      riskLevel: normalizeLearningRisk(row.riskLevel),
      confidence: n(row.confidence, 0.75),

      parameters,
      resources: Array.isArray(row.priceBreakdown) ? row.priceBreakdown : [],
      tags: ["ki-learning", "ki-vorschlag"],

      aiNote: s(row.aiReason),
      calculatorNote: s(row.warning),
      lastUsedAt: new Date(),
    };

    /*
     * Recipe-Learning è indipendente dalla protezione della KalkulationsDb.
     * Anche se un prezzo X84/freigegeben non può essere sovrascritto,
     * un breakdown KI valido può diventare una ricetta proposta.
     */
    try {
      const recipeLearningResult = await learnCompanyRecipeFromKiRow({
        companyId,
        projectId: project?.id || null,
        row,
      });

      if (recipeLearningResult !== "skipped") {
        console.info(
          `[RLC CompanyRecipe Learning] ${recipeLearningResult}: ${posNr} ${kurztext}`
        );
      }
    } catch (recipeError: any) {
      console.warn(
        "[RLC CompanyRecipe Learning ERROR]",
        posNr,
        recipeError?.message || recipeError
      );
    }

    if (existing) {
      /*

       * X84-Firmen-Baseline ist die geprüfte Angebotsbasis.

       * KI-Learning darf diese Position niemals überschreiben.

       */

      if (existing.source === "x84-company-baseline") {

        return 0;

      }


      const existingStatus = s((existing.parameters as any)?.qualityGateStatus);

      /*
       * Freigegebene oder gesperrte Einträge nicht automatisch überschreiben.
       * Das ist der erste Quality-Gate-Schutz.
       */
      if (
        existingStatus === "Freigegeben" ||
        existingStatus === "Gesperrt" ||
        existingStatus === "Nicht verwenden"
      ) {
        return 0;
      }

      await prisma.kalkulationsDbEntry.update({
        where: { id: existing.id },
        data: {
          ...data,
          useCount: { increment: 1 },
        },
      });
    } else {
      await prisma.kalkulationsDbEntry.create({
        data: {
          ...data,
          useCount: 1,
        },
      });
    }

    return 1;
  }

  let nextLearningIndex = 0;
  const learningConcurrency = Math.min(6, Math.max(1, rows.length));

  async function learningWorker(): Promise<number> {
    let workerSaved = 0;
    while (nextLearningIndex < rows.length) {
      const index = nextLearningIndex++;
      workerSaved += await processLearningRow(rows[index]);
    }
    return workerSaved;
  }

  const savedByWorker = await Promise.all(
    Array.from({ length: learningConcurrency }, () => learningWorker())
  );

  return savedByWorker.reduce((sum, value) => sum + value, 0);
}


export function applyDuplicateQuantityOutlierGuard(rows: any[]): any[] {
  const groups = new Map<string, any[]>();

  for (const row of rows) {
    const kurz = rlcNoX84Norm(row?.kurztext || row?.shortText || row?.text || "");
    const lang = rlcNoX84Norm(row?.langtext || row?.longText || row?.description || "");
    const unit = rlcNoX84Norm(row?.einheit || row?.unit || "");
    const ep = round2(
      n(row?.finalUnitPrice) ||
      n(row?.rlcKiUnitPrice) ||
      n(row?.unitPrice) ||
      n(row?.preis) ||
      n(row?.suggestedUnitPrice)
    );

    if (!kurz || !unit || ep <= 0) continue;

    const langKey = lang.slice(0, 220);
    const key = `${kurz}|${langKey}|${unit}|${ep}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const duplicateKeys = new Map<string, {
    count: number;
    qtySum: number;
    totalSum: number;
    posList: string;
    label: string;
    exactPositionDuplicate: boolean;
  }>();

  for (const [key, items] of groups.entries()) {
    if (items.length < 2) continue;

    const qtySum = items.reduce((sum, r) => sum + n(r?.menge ?? r?.quantity), 0);
    const totalSum = items.reduce((sum, r) => {
      const ep =
        n(r?.finalUnitPrice) ||
        n(r?.rlcKiUnitPrice) ||
        n(r?.unitPrice) ||
        n(r?.preis) ||
        n(r?.suggestedUnitPrice);
      const qty = n(r?.menge ?? r?.quantity);
      return sum + (n(r?.totalNet) || n(r?.rlcKiTotal) || n(r?.gesamt) || ep * qty);
    }, 0);

    const unit = rlcNoX84Norm(items[0]?.einheit || items[0]?.unit || "");
    const isLinear = /^(m|lfm|meter|laufmeter|laufende meter)$/.test(unit);

    // Kein Preis-Cut: nur fachliche Warnung.
    // Auslösen nur bei echter Relevanz, damit kleine Wiederholungen nicht stören.
    if (
      (isLinear && qtySum >= 5000 && totalSum >= 50000) ||
      totalSum >= 100000
    ) {
      const posValues = items
        .map((r) => s(r?.posNr || r?.position || r?.pos))
        .filter(Boolean);
      const exactPositionDuplicate =
        posValues.length > 1 && new Set(posValues).size < posValues.length;

      duplicateKeys.set(key, {
        count: items.length,
        qtySum: round2(qtySum),
        totalSum: round2(totalSum),
        posList: posValues.join(", "),
        label: s(items[0]?.kurztext || items[0]?.shortText || items[0]?.text || "Position"),
        exactPositionDuplicate,
      });
    }
  }

  return rows.map((row) => {
    const kurz = rlcNoX84Norm(row?.kurztext || row?.shortText || row?.text || "");
    const lang = rlcNoX84Norm(row?.langtext || row?.longText || row?.description || "");
    const unit = rlcNoX84Norm(row?.einheit || row?.unit || "");
    const ep = round2(
      n(row?.finalUnitPrice) ||
      n(row?.rlcKiUnitPrice) ||
      n(row?.unitPrice) ||
      n(row?.preis) ||
      n(row?.suggestedUnitPrice)
    );

    const key = `${kurz}|${lang.slice(0, 220)}|${unit}|${ep}`;

    const fullText = `${kurz} ${lang}`;
    const isSmallSupplement =
      /mehr\s*-?\s*oder\s*-?\s*minderpreis|mehrpreis|minderpreis|zulage|zuschlag/.test(fullText) &&
      /^(cm|mm)$/.test(unit);

    const offerBaselineCandidates = [
      { source: "angebotUnitPrice", value: n(row?.angebotUnitPrice) },
      { source: "originalPreKiPrice", value: n(row?.originalPreKiPrice) },
      { source: "x84UnitPrice", value: n(row?.x84UnitPrice) },
      { source: "reverseUrkalkulation.x84UnitPrice", value: n(row?.reverseUrkalkulation?.x84UnitPrice) },
      { source: "dbComparability.x84UnitPrice", value: n(row?.dbComparability?.x84UnitPrice) },
    ];

    const selectedOfferBaseline = offerBaselineCandidates.find((x) => x.value > 0);
    const offerEp = round2(selectedOfferBaseline?.value || 0);
    const offerBaselineSource = selectedOfferBaseline?.source || "";

    const explodedAgainstOffer =
      isSmallSupplement &&
      offerEp > 0 &&
      ep > 0 &&
      ep / offerEp >= 10;

    if (explodedAgainstOffer) {
      const warningText =
        `RLC Kleinteile/Zulagen-Guard: Position ist als Mehr-/Minderpreis, Zulage oder Zuschlag je ${unit} erkennbar. ` +
        `KI-/Bibliothekspreis ${ep} EUR/${unit}, Angebotsbasis ${offerEp} EUR/${unit}, Faktor ${round2(ep / offerEp)}. ` +
        `Angebotsbasis dient nur als Benchmark; der RLC-EP wird nicht automatisch ersetzt. Position muss fachlich geprüft werden.`;

      return {
        ...row,
        calculationStatus: "needs_review",
        riskLevel: "high",
        confidence: Math.min(n(row?.confidence, 0.5), 0.45),
        warning: [s(row?.warning), warningText].filter(Boolean).join(" · "),
        aiReason: [s(row?.aiReason), warningText].filter(Boolean).join("\n\n"),
        kleinteileZulagenGuard: {
          applied: true,
          originalKiEp: ep,
          offerEp,
          factor: round2(ep / offerEp),
          unit,
        },
      };
    }


      // RLC_SAFE_BASELINE_GUARDS_START
      const qtyForExtremeGuard = n(row?.menge ?? row?.quantity);
      const gpDiffAgainstOffer = round2((ep - offerEp) * qtyForExtremeGuard);
      const factorAgainstOffer = offerEp > 0 && ep > 0 ? round2(ep / offerEp) : 0;

      const isOfferBaselineExtremeOutlier =
        offerEp > 0 &&
        ep > 0 &&
        qtyForExtremeGuard > 0 &&
        (
          factorAgainstOffer >= 10 ||
          factorAgainstOffer <= 0.1 ||
          (Math.abs(gpDiffAgainstOffer) >= 50000 && (factorAgainstOffer >= 3 || factorAgainstOffer <= 0.35))
        );

      const isLinearMaterialBaselineOutlier =
        /rohrumh[uü]llung|sand[uü]berdeckung|splitt[uü]berdeckung|sohlbettung|bettung|schutzmatte|ortungsband|trassenwarnband|kabelschutzrohr|mikrokabel|mikroroh?r|leer[r]?ohr|lwl|baustahl|stahl|bewehrung|hdpe|pe\s*100|druckrohr|kanal\s*sp[uü]len|druckprobe/.test(fullText) &&
        /^(m|lfm|meter|laufmeter|laufende meter|kg)$/.test(unit) &&
        offerEp > 0 &&
        ep > 0 &&
        qtyForExtremeGuard > 0 &&
        factorAgainstOffer >= 1.75 &&
        Math.abs(gpDiffAgainstOffer) >= 25000;

      const isContextBaselineOutlier =
        /rohrgrabenaushub|baugrubenaushub|aushub|bodenklasse|bd-kl|r[üu]ckverf[üu]llung|auff[üu]llmaterial|erschwernis|baustelleneinrichtung|verkehrssicherung|wasserhaltung|pilotbohrung|horizontalbohrung|schacht|pumpstation|fertigteilschacht|forststraßen|zwischenplanum/.test(fullText) &&
        offerEp > 0 &&
        ep > 0 &&
        qtyForExtremeGuard > 0 &&
        Math.abs(gpDiffAgainstOffer) >= 50000 &&
        (factorAgainstOffer >= 1.75 || factorAgainstOffer <= 0.35);

      if (isOfferBaselineExtremeOutlier || isLinearMaterialBaselineOutlier || isContextBaselineOutlier) {
        const guardType = isLinearMaterialBaselineOutlier
          ? "linear-material"
          : isContextBaselineOutlier
            ? "context-baseline"
            : "baseline-extreme";

        const warningText =
          `RLC Angebotsbasis-Guard (${guardType}): KI-/Parser-EP ${ep} EUR/${unit}, Angebotsbasis ${offerEp} EUR/${unit}, Faktor ${factorAgainstOffer}, GP-Differenz ${gpDiffAgainstOffer} EUR. ` +
          `Die Angebotsbasis dient nur als Benchmark. Der RLC-EP wird nicht automatisch durch X84/Angebot ersetzt; Position bleibt prüfpflichtig.`;

        return {
          ...row,
          calculationStatus: "needs_review",
          riskLevel: "high",
          confidence: Math.min(n(row?.confidence, 0.5), 0.45),
          warning: [s(row?.warning), warningText].filter(Boolean).join(" · "),
          aiReason: [s(row?.aiReason), warningText].filter(Boolean).join("\n\n"),
          offerBaselineGuard: {
            applied: true,
            type: guardType,
            source: cleanRlcSourceFlags(offerBaselineSource),
            originalKiEp: ep,
            offerEp,
            factor: factorAgainstOffer,
            gpDiff: gpDiffAgainstOffer,
            unit,
          },
          x84ExtremeDeviationGuard: {
            applied: guardType === "baseline-extreme",
            originalKiEp: ep,
            offerEp,
            factor: factorAgainstOffer,
            gpDiff: gpDiffAgainstOffer,
            unit,
          },
          linearMaterialBaselineGuard: {
            applied: guardType === "linear-material",
            originalKiEp: ep,
            offerEp,
            factor: factorAgainstOffer,
            gpDiff: gpDiffAgainstOffer,
            unit,
          },
          contextBaselineGuard: {
            applied: guardType === "context-baseline",
            originalKiEp: ep,
            offerEp,
            factor: factorAgainstOffer,
            gpDiff: gpDiffAgainstOffer,
            unit,
          },
        };
      }
      // RLC_SAFE_BASELINE_GUARDS_END
    const dup = duplicateKeys.get(key);
    if (!dup) return row;

    const warningText =
      `RLC Mengen-/Positionsduplikat-Guard: "${dup.label}" erscheint ${dup.count}x mit identischem/nahezu identischem Langtext, Einheit und EP. ` +
      `Summe Menge ${dup.qtySum}, Summe GP ${dup.totalSum} €. Positionen: ${dup.posList}. ` +
      `Prüfen, ob echte getrennte Bauabschnitte vorliegen oder Import-/Cache-/LV-Duplikate.`;

    return {
      ...row,
      // Gleicher Text/EP in verschiedenen LV-Positionen ist bei wiederkehrenden
      // Bauabschnitten normal. Nur identische Positionsnummern gelten als echter
      // Import-/Cache-Duplikatfehler und dürfen Confidence/Risk verschlechtern.
      ...(dup.exactPositionDuplicate
        ? {
            calculationStatus: "needs_review",
            riskLevel: "high",
            confidence: Math.min(n(row?.confidence, 0.5), 0.45),
          }
        : {}),
      warning: [
        s(row?.warning),
        warningText,
      ].filter(Boolean).join(" · "),
      aiReason: [
        s(row?.aiReason),
        warningText,
      ].filter(Boolean).join("\n\n"),
      duplicateQuantityGuard: {
        applied: dup.exactPositionDuplicate,
        informational: !dup.exactPositionDuplicate,
        count: dup.count,
        qtySum: dup.qtySum,
        totalSum: dup.totalSum,
        positions: dup.posList,
      },
    };
  });
}

function buildSummary(rows: any[]) {
  const totalNet = rows.reduce((sum, r) => sum + n(r.finalUnitPrice) * n(r.menge), 0);
  const avgConfidence = rows.length
    ? rows.reduce((sum, r) => sum + n(r.confidence), 0) / rows.length
    : 0;

  return {
    totalNet: round2(totalNet),
    avgConfidence: round2(avgConfidence),
    highRiskCount: rows.filter((r) => r.riskLevel === "high").length,
    warningCount: rows.filter((r) => r.calculationStatus === "warning").length,
    criticalCount: rows.filter((r) => r.calculationStatus === "critical").length,
    openAiCount: rows.filter((r) => s(r.source).includes("openai")).length,
    databaseCount: rows.filter((r) => s(r.source).includes("database")).length,
    ruleEngineCount: rows.filter((r) => s(r.source) === "rule-engine").length,
    recipeCount: rows.filter((r) => s(r.source).includes("recipe")).length,
    technicalParserCount: rows.filter((r) => s(r.source).includes("technical-parser")).length,
    autonomousCount: rows.filter((r) => s(r.source).includes("rlc-autonomous-urkalkulation")).length,
  };
}




function hasHistoricalOfferBaseline(row: any): boolean {
  return (
    n(row?.angebotUnitPrice) > 0 ||
    n(row?.x84UnitPrice) > 0 ||
    n(row?.angebotTotal) > 0 ||
    n(row?.x84Total) > 0
  );
}





function rlcNoX84FamilyKey(textRaw: any): string {
  const text = norm(String(textRaw || ""));

  if (/rohrschutzmatte|kabelschutzmatte|schutzmatte/.test(text)) return "schutzmatte";
  if (/kabelschutzrohr|schutzrohr|kabelleerrohr|kabellehrrohr|leerrohr|dn\s*110/.test(text)) return "kabelschutzrohr";
  if (/mikroroh?r|mikro.*rohr|mikrorohrverband|speedpipe|lwl.*rohr|glasfaser.*rohr|leerrohrverbund/.test(text)) return "lwl_mikrorohr";
  if (/lwl|glasfaser|telekom|vodafone/.test(text)) return "lwl_glasfaser";

  if (/gasleitung|gasrohr|pe\s*dn\s*63/.test(text)) return "gasleitung";
  if (/wasserleitung|trinkwasserleitung|wasserrohr|dn\s*100/.test(text)) return "wasserleitung";
  if (/fernwaerme|fernwärme|nahwaerme|nahwärme/.test(text)) return "fernwaerme";
  if (/mittelspannung|stromkabel|energiekabel|kabel.*verlegen/.test(text)) return "strom_kabel";
  if (/hausanschluss|hausanschlussleitung|hauseinfuehrung|hauseinführung|anschluss an bestand/.test(text)) return "hausanschluss";

  if (/asphalt.*schneiden|asphaltschnitt|schneiden.*asphalt/.test(text)) return "asphalt_schneiden";
  if (/asphalt.*aufnehmen|asphalt.*entsorgen|asphaltdecke.*aufnehmen/.test(text)) return "asphalt_aufnehmen";
  if (/asphalttragschicht|tragschicht.*asphalt/.test(text)) return "asphalt_tragschicht";
  if (/asphaltdeckschicht|deckschicht.*asphalt/.test(text)) return "asphalt_deckschicht";

  if (/suchschlitz|suchgraben|erkundungsschlitz/.test(text)) return "suchschlitz";
  if (/rohrgraben|rohrgrabenaushub|leitungsgraben|grabenaushub/.test(text)) return "rohrgraben";
  if (/handschachtung|handschacht/.test(text)) return "handschachtung";
  if (/verbau|grabenverbau/.test(text)) return "verbau";
  if (/spundwand/.test(text)) return "spundwand";
  if (/horizontalbohrung|hdd|spuelbohrung|spülbohrung|bohrung/.test(text)) return "hdd";

  if (/pflaster|betonpflaster|natursteinpflaster|klinkerpflaster|oekopflaster|ökopflaster/.test(text)) return "pflaster";
  if (/bordstein|randstein|hochbord|tiefbord|leistenstein|einzeiler|dreizeiler/.test(text)) return "bordstein";
  if (/asphalt.*schneiden|asphaltschnitt|schneiden.*asphalt/.test(text)) return "asphalt_schneiden";
  if (/asphalt.*aufnehmen|asphalt.*entsorgen|asphaltdecke.*aufnehmen/.test(text)) return "asphalt_aufnehmen";
  if (/asphalttragschicht|tragschicht.*asphalt/.test(text)) return "asphalt_tragschicht";
  if (/asphaltdeckschicht|deckschicht.*asphalt/.test(text)) return "asphalt_deckschicht";
  if (/bankett/.test(text)) return "bankett";

  if (/schachtabdeckung|abdeckung.*d400|d400/.test(text)) return "schachtabdeckung";
  if (/strassenablauf|straßenablauf|ablauf.*setzen/.test(text)) return "strassenablauf";
  if (/kabelschacht/.test(text)) return "kabelschacht";
  if (/schacht.*dn|fertigteilschacht|schacht.*setzen/.test(text)) return "schacht";

  if (/entsorgen|entsorgung|kippe|deponie|aushubmaterial.*abfahren|boden.*abfahren/.test(text)) return "entsorgung";
  if (/kanal|kanalrohr|kg-rohr|kg rohr|dn\s*150|schmutzwasser|regenwasser/.test(text)) return "kanal";
  if (/auffuellung|auffüllung|frostschutz|frostschutzmaterial|schotter|kies|mineralbeton|verfuell|verfüll|sandbettung|bettung/.test(text)) return "auffuellung";
  if (/auskofferung|auskoffern|boden auskoffern/.test(text)) return "auskofferung";
  if (/fluessigboden|flüssigboden/.test(text)) return "fluessigboden";
  if (/warnband|trassenband/.test(text)) return "warnband";

  if (/regiestunde.*facharbeiter|facharbeiter.*nachweis|arbeiter.*nachweis/.test(text)) return "regie_personal";
  if (/regiestunde.*bagger|mobilbagger|kettenbagger|bagger.*nachweis/.test(text)) return "regie_bagger";
  if (/lkw|transport|dreiachser|kipper/.test(text)) return "transport_lkw";
  if (/ruettelplatte|rüttelplatte|verdichtungsgeraet|verdichtungsgerät/.test(text)) return "verdichtung_geraet";

  if (/statik.*druckerh[oö]hungsschacht|druckerh[oö]hungsschacht.*statik/.test(text)) return "statik_druckerhoehungsschacht";
  if (/betonsockel|sockel.*c\s*25|c\s*25\/30/.test(text)) return "betonsockel";
  if (/forststra[sß]e|forststrasse|forststraßen|forststrassen/.test(text)) return "forststrasse";

  if (/baustelleneinrichtung/.test(text)) return "baustelleneinrichtung";
  if (/verkehrssicherung|rsa|beschilderung|umleitung|ampel|absperrung|bauzaun|absturzsicherung/.test(text)) return "sicherung";
  if (/hoehenfestpunkt|höhenfestpunkt|vermessung|bestandsaufnahme|gelaendeaufnahme|geländeaufnahme|dokumentation|as-built/.test(text)) return "vermessung";
  if (/spartenerkundung|sparten.*erkundung|leitungsfreigabe/.test(text)) return "spartenerkundung";
  if (/ueberfahrt|überfahrt|ueberfahrten|überfahrten/.test(text)) return "ueberfahrt";
  if (/rasenansaat|oberboden|planum|fsk korrigieren|frostschutzschicht korrigieren|aufsatz ausbauen|reinigung von strassen|reinigung von straßen|probenahme|deklarationsanalyse|verdichtbares material|recyclingmaterial|betonfundament|wurzelstock|kunststoffrohrleitung|rohrleitung ausbauen|abstimmung mit projektbeteiligten/.test(text)) return "fremdfamilie";

  return "";
}

function rlcNoX84CompanyCalibrationMismatch(row: any, result: any, hit: any): string {
  const rowText = [
    row?.posNr,
    row?.kurztext,
    row?.shortText,
    row?.text,
    row?.langtext,
    row?.longText,
  ].join(" ");

  const breakdownNames = Array.isArray(result?.priceBreakdown)
    ? result.priceBreakdown
        .map((x: any) => [x?.group, x?.label, x?.name, x?.unit].filter(Boolean).join(" "))
        .join(" ")
    : "";

  /*
   * Wichtig:
   * warning/aiReason enthalten generische Boilerplate-Texte wie "Leitungsgraben",
   * "Graben", "Bettung" usw. Diese dürfen NICHT für die Familienbasis zählen,
   * sonst entstehen falsche Mismatches bei Asphalt, Flüssigboden, Fernwärme usw.
   */
  const resultText = [
    result?.source,
    result?.gewerk,
    result?.leistungsart,
    result?.bauverfahren,
    breakdownNames,
    hit?.title,
    hit?.match,
  ].join(" ");

  const rowFamily = rlcNoX84FamilyKey(rowText);
  const resultFamily = rlcNoX84FamilyKey(resultText);

  if (!rowFamily || !resultFamily) return "";
  if (rowFamily === resultFamily) return "";

  return `RLC Family-Mismatch-Guard: Firmenkalibrierung blockiert. LV-Familie "${rowFamily}" passt nicht zur Kalibrierungsbasis "${resultFamily}".`;
}


export function applyRlcPriceEvidenceGate(row: any, result: any): any {
  if (!result || typeof result !== "object") return result;

  const finalEp =
    n((result as any).rlcKiUnitPrice) ||
    n((result as any).finalUnitPrice) ||
    n((result as any).unitPrice) ||
    n((result as any).preis);

  const breakdown = Array.isArray((result as any).priceBreakdown)
    ? (result as any).priceBreakdown
    : [];
  const breakdownEp = round2(
    breakdown.reduce((sum: number, line: any) => sum + n(line?.total), 0)
  );

  if (finalEp <= 0 || breakdownEp <= 0) {
    return {
      ...result,
      priceEvidenceStatus: "missing-price-evidence",
      calculationStatus: "needs_review",
      riskLevel: "high",
      confidence: Math.min(n((result as any).confidence, 0.5), 0.4),
      warning: [
        s((result as any).warning),
        "RLC Price-Evidence-Gate: finaler EP oder nachvollziehbarer Preisaufbau fehlt. Kein automatischer Preisentscheid."
      ].filter(Boolean).join(" · ")
    };
  }

  const delta = round2(breakdownEp - finalEp);
  const deltaPct = round2(Math.abs(delta) / Math.max(Math.abs(finalEp), Math.abs(breakdownEp), 0.01) * 100);

  if (deltaPct <= 2) {
    const evidenceText = s((result as any).warning) + " " + s((result as any).aiReason);
    const hadStalePriceEvidencePenalty =
      /RLC Price-Evidence-Gate/i.test(evidenceText) &&
      n((result as any).confidence) <= 0.4 &&
      s((result as any).riskLevel) === "high";

    const hasIndependentReviewGuard =
      /Family-Mismatch-Guard|No-X84 Outlier-Guard|Plausibilitätsstopp|Kleinteile\/Zulagen-Guard|Angebotsbasis-Guard|company-calibration-blocked|RLC Block\+Recalculate/i.test(evidenceText);

    // Ein vom Family Catalog ausdrücklich gesetzter Prüfstatus bleibt bestehen.
    // Diese Bereinigung betrifft nur alte Price-Evidence-Downgrades.
    if (
      hadStalePriceEvidencePenalty &&
      !hasIndependentReviewGuard &&
      s((result as any).calculationStatus) !== "needs_review"
    ) {
      const nativeRisk = riskFromText(
        s((row as any).kurztext) + " " + s((row as any).langtext),
        s((row as any).einheit),
        n((row as any).menge)
      );
      const sourceRaw = s((result as any).source);
      const confidenceSource: CalcSource =
        sourceRaw.includes("database") ? "database" :
        sourceRaw.includes("openai") ? "openai" :
        "rule-engine";
      const restoredConfidence = confidenceFrom(row as InputRow, nativeRisk, [], confidenceSource);
      const restoredStatus =
        nativeRisk === "high"
          ? "needs_review"
          : ((result as any).calculationStatus === "critical" ? "critical" : "ok");

      return {
        ...result,
        priceEvidenceStatus: "breakdown-consistent",
        priceEvidenceFinalEp: finalEp,
        priceEvidenceBreakdownEp: breakdownEp,
        priceEvidenceDeltaPct: deltaPct,
        riskLevel: nativeRisk,
        confidence: restoredConfidence,
        calculationStatus: restoredStatus,
        warning: cleanRlcWarningText(
          s((result as any).warning)
            .split(" · ")
            .filter((part) => !/RLC Price-Evidence-Gate/i.test(part))
            .join(" · ")
        ),
        aiReason: [
          s((result as any).aiReason),
          "RLC Price-Evidence-Recheck: finaler EP " + finalEp + " EUR und Preisaufbau " + breakdownEp + " EUR sind konsistent (" + deltaPct + " %). Ein früherer Price-Evidence-Downgrade wurde deshalb aufgehoben; fachliches Restrisiko bleibt " + nativeRisk + "."
        ].filter(Boolean).join("\n\n")
      };
    }

    return {
      ...result,
      priceEvidenceStatus: "breakdown-consistent",
      priceEvidenceFinalEp: finalEp,
      priceEvidenceBreakdownEp: breakdownEp,
      priceEvidenceDeltaPct: deltaPct
    };
  }

  return {
    ...result,
    priceEvidenceStatus: "breakdown-mismatch",
    priceEvidenceFinalEp: finalEp,
    priceEvidenceBreakdownEp: breakdownEp,
    priceEvidenceDeltaPct: deltaPct,
    calculationStatus: "needs_review",
    riskLevel: "high",
    confidence: Math.min(n((result as any).confidence, 0.5), 0.4),
    warning: [
      s((result as any).warning),
      `RLC Price-Evidence-Gate: EP ${round2(finalEp)} stimmt nicht mit Preisaufbau ${round2(breakdownEp)} überein (${deltaPct} %). Preis nicht automatisch ändern.`
    ].filter(Boolean).join(" · "),
    aiReason: [
      s((result as any).aiReason),
      "RLC Price-Evidence-Gate blockiert die automatische Preisfreigabe, bis Quelle, Einheit und Urkalkulation konsistent sind."
    ].filter(Boolean).join("\n\n")
  };
}

type X84BenchmarkResolution = {
  unitPrice: number;
  total: number;
  quantity: number;
  quality: "coherent" | "derived_from_total" | "unusable";
  note: string;
};

/**
 * X84 è uno storico di confronto, mai un prezzo RLC. Gli import precedenti
 * contengono casi in cui il GP è stato scritto anche nel campo EP: in quei
 * casi il benchmark usa GP / quantità solo in memoria e lo rende esplicito.
 */
function resolveX84Benchmark(row: any, result?: any): X84BenchmarkResolution {
  const quantity = n(row?.menge ?? row?.qty ?? row?.quantity ?? result?.menge ?? result?.quantity);
  const rawUnitPrice = n(
    row?.angebotUnitPrice ?? row?.x84UnitPrice ?? row?.x84Ep ??
    result?.angebotUnitPrice ?? result?.x84UnitPrice
  );
  const total = n(row?.angebotTotal ?? row?.x84Total ?? result?.angebotTotal ?? result?.x84Total);

  if (quantity <= 0 || (rawUnitPrice <= 0 && total <= 0)) {
    return { unitPrice: 0, total: 0, quantity, quality: "unusable", note: "X84 ohne verwertbare Menge bzw. Preisbasis." };
  }

  if (rawUnitPrice > 0 && total > 0) {
    const expected = rawUnitPrice * quantity;
    const tolerance = Math.max(0.02, Math.abs(expected) * 0.005);
    if (Math.abs(expected - total) <= tolerance) {
      return { unitPrice: rawUnitPrice, total, quantity, quality: "coherent", note: "X84-EP und X84-GP sind mengenlogisch kohärent." };
    }
    if (quantity > 0) {
      return {
        unitPrice: round2(total / quantity), total, quantity, quality: "derived_from_total",
        note: "X84-EP ist inkohärent zu Menge und GP; Benchmark-EP nur aus X84-GP / Menge abgeleitet. RLC-Preis unverändert."
      };
    }
  }

  if (rawUnitPrice > 0 && total <= 0) {
    return { unitPrice: rawUnitPrice, total: round2(rawUnitPrice * quantity), quantity, quality: "unusable", note: "X84-GP fehlt; Benchmark nicht freigabefähig." };
  }

  return { unitPrice: 0, total: 0, quantity, quality: "unusable", note: "X84-Benchmark nicht verwertbar." };
}

export function applyRlcX84BenchmarkLearningSignal(row: any, result: any): any {
  if (!result || typeof result !== "object") return result;

  const benchmark = resolveX84Benchmark(row, result);
  const qty = benchmark.quantity;

  const rlcEp = n(
    (result as any)?.rlcKiUnitPrice ??
    (result as any)?.finalUnitPrice ??
    (result as any)?.unitPrice ??
    (result as any)?.preis
  );
  const x84Ep = benchmark.unitPrice;

  if (benchmark.quality === "unusable" || qty <= 0 || rlcEp <= 0 || x84Ep <= 0) return result;

  const x84Gp = benchmark.total || round2(x84Ep * qty);
  const rlcGp = round2(rlcEp * qty);
  const diffGp = round2(rlcGp - x84Gp);
  const diffPct = round2(((rlcEp - x84Ep) / x84Ep) * 100);

  const absPct = Math.abs(diffPct);
  const absGp = Math.abs(diffGp);

  let status = "ok";
  let learningSignal = "none";

  if (absPct <= 10) {
    status = "within_10_percent";
    learningSignal = "stable_reference";
  } else if (absPct <= 15) {
    status = "review_light";
    learningSignal = "soft_learning_candidate";
  } else if (absGp <= 500) {
    status = "review_small_amount";
    learningSignal = "low_priority_learning_candidate";
  } else {
    status = "review_required";
    learningSignal = "strong_learning_candidate";
  }

  return {
    ...result,

    x84BenchmarkEp: x84Ep,
    x84BenchmarkGp: x84Gp,
    x84BenchmarkQuality: benchmark.quality,
    x84BenchmarkDerived: benchmark.quality === "derived_from_total",
    x84BenchmarkIntegrityNote: benchmark.note,
    x84BenchmarkDiffPct: diffPct,
    x84BenchmarkDiffGp: diffGp,
    x84BenchmarkStatus: status,
    x84BenchmarkLearningSignal: learningSignal,
    x84BenchmarkUsedAsPrice: false,
    x84BenchmarkNote:
      "X84 wurde nur als Benchmark/Lernsignal gespeichert. Der Preis wurde nicht blind aus X84 übernommen.",
  };
}




function evaluateDbComparability(row: any, result: any) {
  const benchmark = resolveX84Benchmark(row, result);
  const x84Ep = benchmark.unitPrice;

  const kiEp =
    n(result?.rlcKiUnitPrice) ||
    n(result?.finalUnitPrice) ||
    n(result?.suggestedUnitPrice) ||
    0;

  const unit = norm(row?.einheit ?? result?.einheit);
  const text = norm(
    [
      row?.kurztext,
      row?.langtext,
      result?.kurztext,
      result?.langtext,
    ].filter(Boolean).join(" ")
  );

  const source = s(result?.source);
  const reverse = result?.reverseUrkalkulation || null;

  if (!x84Ep || !kiEp) {
    return {
      status: "not_checked",
      comparable: true,
      reason: "X84/KI-EP fehlt. Vergleich nicht möglich.",
      x84UnitPrice: round2(x84Ep),
      kiUnitPrice: round2(kiEp),
      factor: x84Ep > 0 ? round2(kiEp / x84Ep) : 0,
    };
  }

  if (source !== "database") {
    return {
      status: "x84_baseline",
      comparable: true,
      reason: "Keine direkte Datenbankbewertung. X84 wurde als Angebotsbasis rückwärts in eine Urkalkulation zerlegt.",
      x84UnitPrice: round2(x84Ep),
      kiUnitPrice: round2(kiEp),
      factor: x84Ep > 0 ? round2(kiEp / x84Ep) : 0,
      workClass: reverse?.workClass || "",
    };
  }

  const factor = kiEp / x84Ep;

  /*
   * Historische Angebotsbasis:
   * Kein pauschaler Preisindex.
   *
   * Wenn eine belastbare historische Bezugszeit vorhanden ist, wird die
   * Preisentwicklung zeitabhängig berechnet. Fehlt eine solche Zeitbasis,
   * bleibt der Faktor neutral bei 1.0 und X84 dient nur als Plausibilitäts-
   * bzw. Benchmarkwert.
   *
   * Die Preisentwicklung wird über den offiziellen Destatis-Baupreisindex
   * 61261-0004 ermittelt und dient ausschließlich der historischen Vergleichbarkeit.
   */
  const historicalDateRaw =
    row?.priceDate ??
    result?.priceDate ??
    null;

  const historicalDate = historicalDateRaw
    ? new Date(historicalDateRaw)
    : null;

  const historicalToleranceRaw = Number(
    process.env.RLC_HISTORICAL_PRICE_TOLERANCE ?? "0.15"
  );

  const historicalTolerance = Number.isFinite(historicalToleranceRaw)
    ? Math.max(0.05, Math.min(0.50, historicalToleranceRaw))
    : 0.15;

  let historicalAgeYears = 0;

  if (
    historicalDate &&
    Number.isFinite(historicalDate.getTime()) &&
    historicalDate.getTime() < Date.now()
  ) {
    historicalAgeYears =
      (Date.now() - historicalDate.getTime()) /
      (365.25 * 24 * 60 * 60 * 1000);
  }

  const historicalIndex = getBaupreisIndexFactor({
    sourceDate: historicalDate,
    targetDate: new Date(),
    text: [
      row?.kurztext,
      row?.shortText,
      row?.langtext,
      row?.longText,
      result?.kurztext,
      result?.shortText,
      result?.langtext,
      result?.longText,
      reverse?.workClass,
    ]
      .filter(Boolean)
      .join(" "),
  });

  const historicalIndexFactor =
    historicalIndex.reliable
      ? historicalIndex.factor
      : 1;

  const expectedHistoricalEp = x84Ep * historicalIndexFactor;
  const minHistoricalEp = expectedHistoricalEp * (1 - historicalTolerance);
  const maxHistoricalEp = expectedHistoricalEp * (1 + historicalTolerance);

  if (
    source === "database" &&
    x84Ep > 0 &&
    kiEp > 0 &&
    (kiEp < minHistoricalEp || kiEp > maxHistoricalEp)
  ) {
    return {
      status: "needs_review",
      comparable: false,
      reason:
        historicalAgeYears > 0
          ? "Datenbankwert liegt außerhalb der zeitbezogen indexierten historischen X84-Basis. Prüfung über Langtext, Menge, Einheit und Urkalkulation erforderlich."
          : "Datenbankwert liegt außerhalb der historischen X84-Basis. Da keine belastbare Bezugszeit vorliegt, wurde kein pauschaler Preisindex angewendet.",
      x84UnitPrice: round2(x84Ep),
      expectedHistoricalUnitPrice: round2(expectedHistoricalEp),
      minOkUnitPrice: round2(minHistoricalEp),
      maxOkUnitPrice: round2(maxHistoricalEp),
      historicalIndexFactor: round2(historicalIndexFactor),
      historicalIndexReliable: historicalIndex.reliable,
      historicalIndexFamily: historicalIndex.family,
      historicalIndexSource: historicalIndex.source,
      historicalSourceIndex: historicalIndex.sourceIndex,
      historicalTargetIndex: historicalIndex.targetIndex,
      historicalAgeYears: round2(historicalAgeYears),
      kiUnitPrice: round2(kiEp),
      factor: round2(kiEp / expectedHistoricalEp),
      workClass: reverse?.workClass || "",
    };
  }

  const lightWork =
    text.includes("druckprobe") ||
    text.includes("druckprüfung") ||
    text.includes("kalibrierung") ||
    text.includes("ortungsband") ||
    text.includes("warnband") ||
    text.includes("trassenwarnband") ||
    text.includes("schutzband") ||
    text.includes("spülung") ||
    text.includes("entkeimung");

  const massUnit =
    unit === "m" ||
    unit === "lfm" ||
    unit === "m²" ||
    unit === "m2" ||
    unit === "kg";

  const massPosition = n(row?.menge ?? result?.menge) >= 1000 && massUnit;

  if (lightWork && factor > 20) {
    return {
      status: "not_comparable",
      comparable: false,
      reason:
        "Datenbankwert ist für eine leichte Neben-/Prüfleistung im Verhältnis zum X84-Preis extrem hoch. Wahrscheinlich anderer Leistungsumfang oder falscher Lernwert.",
      x84UnitPrice: round2(x84Ep),
      kiUnitPrice: round2(kiEp),
      factor: round2(factor),
      workClass: reverse?.workClass || "",
    };
  }

  if (massPosition && factor > 50) {
    return {
      status: "not_comparable",
      comparable: false,
      reason:
        "Massposition mit sehr großer Preisabweichung. Datenbankwert wird nicht direkt als vergleichbarer EP bewertet.",
      x84UnitPrice: round2(x84Ep),
      kiUnitPrice: round2(kiEp),
      factor: round2(factor),
      workClass: reverse?.workClass || "",
    };
  }

  if (factor > 10 || factor < 0.1) {
    return {
      status: "needs_review",
      comparable: false,
      reason:
        "Datenbankwert weicht stark vom X84-Preis ab. Vergleich nur mit Langtext- und Urkalkulationsprüfung zulässig.",
      x84UnitPrice: round2(x84Ep),
      kiUnitPrice: round2(kiEp),
      factor: round2(factor),
      workClass: reverse?.workClass || "",
    };
  }

  return {
    status: "comparable",
    comparable: true,
    reason: "Datenbankwert liegt in einem plausiblen Verhältnis zum X84-Preis.",
    x84UnitPrice: round2(x84Ep),
    kiUnitPrice: round2(kiEp),
    factor: round2(factor),
    workClass: reverse?.workClass || "",
  };
}

export function enrichRowWithReverseUrkalkulation(row: any, result: any) {
  const benchmark = resolveX84Benchmark(row, result);
  const x84UnitPrice = benchmark.unitPrice;
  const menge = benchmark.quantity;
  const x84Total = benchmark.total;

  if (benchmark.quality === "unusable" || !x84UnitPrice || !menge) {
    return {
      ...result,
      reverseUrkalkulation: null,
    };
  }

  const reverseUrkalkulation = reverseUrkalkulationFromX84({
    posNr: row?.posNr ?? row?.position ?? row?.pos ?? result?.posNr,
    kurztext: row?.kurztext ?? row?.shortText ?? row?.text ?? result?.kurztext,
    langtext: row?.langtext ?? row?.longText ?? row?.description ?? result?.langtext,
    einheit: row?.einheit ?? row?.unit ?? result?.einheit,
    menge,
    x84UnitPrice,
    x84Total,
    projectDistanceKm:
      n(row?.projectDistanceKm) ||
      n(result?.projectDistanceKm) ||
      undefined,
    projectDurationDays:
      n(row?.projectDurationDays) ||
      n(result?.projectDurationDays) ||
      undefined,
  });

  let enriched = {
    ...result,
    reverseUrkalkulation,
    x84BenchmarkUnitPrice: round2(x84UnitPrice),
    x84BenchmarkTotal: round2(x84Total),
    x84BenchmarkQuality: benchmark.quality,
    x84BenchmarkDerived: benchmark.quality === "derived_from_total",
    x84BenchmarkIntegrityNote: benchmark.note,
    x84BenchmarkUsedAsPrice: false,
    priceDate:
      row?.priceDate ??
      result?.priceDate ??
      null,
    priceDateSource:
      row?.priceDateSource ??
      result?.priceDateSource ??
      null,
  };

  const dbComparability = evaluateDbComparability(row, enriched);

  if (
    dbComparability?.status === "not_comparable" ||
    dbComparability?.status === "needs_review"
  ) {
    /*
     * RLC NO-X84-FINAL-OVERRIDE:
     * X84 darf hier NICHT mehr finalUnitPrice / rlcKiUnitPrice / preis überschreiben.
     * X84 bleibt nur Benchmark, Reverse-Urkalkulation und Prüfhinweis.
     * Der eigentliche RLC-KI-Preis bleibt aus Technical Parser / Recipe / DB / Global Knowledge / OpenAI / Rule Engine.
     */
    return {
      ...enriched,
      dbComparability,
      reverseUrkalkulation,
      x84BenchmarkUnitPrice: round2(x84UnitPrice),
      x84BenchmarkTotal: round2(x84Total),
      calculationStatus:
        enriched?.calculationStatus === "critical" ? "critical" : "warning",
      riskLevel:
        enriched?.riskLevel === "high" ? "high" : "medium",
      source:
        enriched?.source && enriched.source !== "x84-reverse-urkalkulation"
          ? enriched.source
          : "rlc-ki-no-x84-final-override",
      warning: [
        s(result?.warning),
        dbComparability?.status === "not_comparable"
          ? "DB-Treffer nicht vergleichbar. X84 wurde nur als Benchmark/Reverse-Analyse genutzt, nicht als finaler RLC-KI-Preis."
          : "DB-Treffer prüfpflichtig. X84 bleibt Vergleichswert; finaler RLC-KI-Preis wurde nicht durch X84 überschrieben.",
      ].filter(Boolean).join(" · "),
      aiReason: [
        s(result?.aiReason),
        "RLC NO-X84-FINAL-OVERRIDE: X84 ist nur Benchmark/Reverse-Urkalkulation. Der finale RLC-KI-Preis bleibt eigenständig.",
        reverseUrkalkulation?.explanation || "",
      ].filter(Boolean).join("\n\n"),
    };
  }

  /*
   * RLC NO-X84-SOURCE-OVERRIDE:
   * Auch wenn ein X84-Benchmark exakt gleich ist, darf die Quelle nicht mehr
   * als x84-reverse-urkalkulation markiert werden. X84 ist nur Vergleich.
   */
  const finalSource =
    enriched?.source && enriched.source !== "x84-reverse-urkalkulation"
      ? enriched.source
      : result?.source && result.source !== "x84-reverse-urkalkulation"
        ? result.source
        : "rlc-ki-autonomous";

  return {
    ...enriched,
    source: cleanRlcSourceFlags(finalSource),
    dbComparability,
    warning: [
      s(result?.warning),
      dbComparability?.status === "needs_review" ? "DB-Treffer nur nach Langtext-/Urkalkulationsprüfung vergleichbar." : "",
    ].filter(Boolean).join(" · "),
  };
}


router.post("/generate", requireOptionalKalkulationProjectAccess, async (req, res) => {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) {
      return res.status(403).json({ ok: false, error: "NO_COMPANY" });
    }

    const text = s(req.body?.text);
    const projectCode = s(req.body?.projectCode || req.body?.projectKey);

    if (!text) {
      return res.status(400).json({
        ok: false,
        error: "TEXT_REQUIRED",
      });
    }

    const result = await runRlcGenerativeKalkulation({
      text,
      companyId,
      projectCode: projectCode || undefined,
    });

    return res.json(result);
  } catch (error: any) {
    console.error("[RLC-KI][generate]", error);

    return res.status(500).json({
      ok: false,
      error: "GENERATIVE_KALKULATION_FAILED",
      message: String(error?.message || error),
    });
  }
});

function marketReviewEstimatedCostUsd(result: any): number {
  if (String(result?.aiProvider || "").toLowerCase() !== "openai") return 0;
  const inputTokens = n(result?.aiUsage?.inputTokens);
  const outputTokens = n(result?.aiUsage?.outputTokens);
  const inputPerMillion = Number(process.env.OPENAI_MARKET_REVIEW_INPUT_USD_PER_M || 0.10);
  const outputPerMillion = Number(process.env.OPENAI_MARKET_REVIEW_OUTPUT_USD_PER_M || 0.50);
  const webSearchPerCall = Number(process.env.OPENAI_WEB_SEARCH_USD_PER_CALL || 0.01);
  const webSearchCalls = Math.max(0, Math.round(n(result?.webSearchCalls)));
  return Math.round(((inputTokens / 1_000_000) * inputPerMillion + (outputTokens / 1_000_000) * outputPerMillion + webSearchCalls * webSearchPerCall) * 1_000_000) / 1_000_000;
}

type MarketCreditSource = "MONTHLY_INCLUDED" | "PURCHASED";

function currentMarketCreditMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

async function marketCreditBalance(companyId: string) {
  const monthKey = currentMarketCreditMonth();
  await prisma.companySubscription.updateMany({
    where: {
      companyId,
      OR: [{ aiMarketMonthKey: null }, { aiMarketMonthKey: { not: monthKey } }],
    },
    data: { aiMarketMonthKey: monthKey, aiMarketMonthlyUsed: 0 },
  });
  const sub = await prisma.companySubscription.findUnique({
    where: { companyId },
    select: {
      status: true,
      aiMarketMonthlyIncluded: true,
      aiMarketMonthlyUsed: true,
      aiMarketMonthKey: true,
      aiMarketCreditsPurchased: true,
    },
  });
  if (!sub || !["ACTIVE", "GRACE"].includes(String(sub.status))) {
    return { active: false, monthKey, included: 0, used: 0, includedRemaining: 0, purchasedRemaining: 0, totalRemaining: 0 };
  }
  const included = Math.max(0, n(sub.aiMarketMonthlyIncluded));
  const used = Math.max(0, n(sub.aiMarketMonthlyUsed));
  const purchasedRemaining = Math.max(0, n(sub.aiMarketCreditsPurchased));
  const includedRemaining = Math.max(0, included - used);
  return { active: true, monthKey, included, used, includedRemaining, purchasedRemaining, totalRemaining: includedRemaining + purchasedRemaining };
}

async function reserveMarketCredits(companyId: string, count: number): Promise<MarketCreditSource[]> {
  const wanted = Math.max(1, Math.floor(count));
  const monthKey = currentMarketCreditMonth();
  return prisma.$transaction(async (tx) => {
    await tx.companySubscription.updateMany({
      where: {
      companyId,
      OR: [{ aiMarketMonthKey: null }, { aiMarketMonthKey: { not: monthKey } }],
    },
      data: { aiMarketMonthKey: monthKey, aiMarketMonthlyUsed: 0 },
    });

    const reserved: MarketCreditSource[] = [];
    for (let i = 0; i < wanted; i += 1) {
      const included = await tx.$executeRawUnsafe(
        `UPDATE "CompanySubscription"
         SET "aiMarketMonthlyUsed" = "aiMarketMonthlyUsed" + 1, "updatedAt" = NOW()
         WHERE "companyId" = $1
           AND "status" IN ('ACTIVE','GRACE')
           AND "aiMarketMonthKey" = $2
           AND "aiMarketMonthlyUsed" < "aiMarketMonthlyIncluded"`,
        companyId,
        monthKey
      );
      if (included === 1) {
        reserved.push("MONTHLY_INCLUDED");
        continue;
      }

      const purchased = await tx.$executeRawUnsafe(
        `UPDATE "CompanySubscription"
         SET "aiMarketCreditsPurchased" = "aiMarketCreditsPurchased" - 1, "updatedAt" = NOW()
         WHERE "companyId" = $1
           AND "status" IN ('ACTIVE','GRACE')
           AND "aiMarketCreditsPurchased" > 0`,
        companyId
      );
      if (purchased === 1) {
        reserved.push("PURCHASED");
        continue;
      }

      const error: any = new Error("KI-Marktpreisprüfungen aufgebraucht");
      error.code = "AI_MARKET_CREDITS_EXHAUSTED";
      throw error;
    }
    return reserved;
  });
}

async function refundMarketCredits(companyId: string, reserved: MarketCreditSource[]) {
  if (!reserved.length) return;
  const monthKey = currentMarketCreditMonth();
  const included = reserved.filter((source) => source === "MONTHLY_INCLUDED").length;
  const purchased = reserved.filter((source) => source === "PURCHASED").length;
  await prisma.$transaction(async (tx) => {
    if (included > 0) {
      await tx.$executeRawUnsafe(
        `UPDATE "CompanySubscription"
         SET "aiMarketMonthlyUsed" = GREATEST(0, "aiMarketMonthlyUsed" - $3), "updatedAt" = NOW()
         WHERE "companyId" = $1 AND "aiMarketMonthKey" = $2`,
        companyId,
        monthKey,
        included
      );
    }
    if (purchased > 0) {
      await tx.companySubscription.updateMany({
        where: { companyId },
        data: { aiMarketCreditsPurchased: { increment: purchased } },
      });
    }
  });
}


const MARKET_CREDIT_PACKAGES: Record<number, number> = {
  100: 990,
  500: 3900,
  2000: 12900,
};

router.get("/market-credit-orders", requireMarketReviewAccess, async (req, res) => {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(403).json({ ok: false, error: "NO_COMPANY" });
    const orders = await prisma.aiMarketCreditOrder.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    return res.json({ ok: true, orders });
  } catch (error: any) {
    console.error("[RLC-KI][market-credit-orders]", error);
    return res.status(500).json({ ok: false, error: "MARKET_CREDIT_ORDERS_FAILED" });
  }
});

router.post("/market-credit-orders", requireMarketCreditOrderWrite, async (req, res) => {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(403).json({ ok: false, error: "NO_COMPANY" });
    const credits = Math.floor(Number(req.body?.credits || 0));
    const priceCents = MARKET_CREDIT_PACKAGES[credits];
    if (!priceCents) return res.status(400).json({ ok: false, error: "INVALID_CREDIT_PACKAGE" });
    const userId = String((req.auth as any)?.sub ?? (req.user as any)?.id ?? "").trim() || null;
    const existing = await prisma.aiMarketCreditOrder.findFirst({
      where: { companyId, credits, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return res.json({ ok: true, order: existing, reused: true });
    const order = await prisma.aiMarketCreditOrder.create({
      data: { companyId, userId, credits, priceCents, status: "PENDING" },
    });
    return res.json({ ok: true, order, reused: false });
  } catch (error: any) {
    console.error("[RLC-KI][market-credit-order-create]", error);
    return res.status(500).json({ ok: false, error: "MARKET_CREDIT_ORDER_CREATE_FAILED" });
  }
});

router.get("/market-review-usage", requireMarketReviewAccess, async (req, res) => {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(403).json({ ok: false, error: "NO_COMPANY" });
    const from = req.query?.from ? new Date(String(req.query.from)) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const where = { companyId, createdAt: { gte: from } };
    const [summary, byModel, balance] = await Promise.all([
      prisma.aiMarketReviewUsage.aggregate({
        where,
        _sum: { creditsUsed: true, inputTokens: true, outputTokens: true, totalTokens: true, webSearchCalls: true, estimatedCostUsd: true },
        _count: { _all: true },
      }),
      prisma.aiMarketReviewUsage.groupBy({
        by: ["provider", "model"],
        where,
        _sum: { creditsUsed: true, inputTokens: true, outputTokens: true, totalTokens: true, estimatedCostUsd: true },
        _count: { _all: true },
      }),
      marketCreditBalance(companyId),
    ]);
    return res.json({ ok: true, from, summary, byModel, balance });
  } catch (error: any) {
    console.error("[RLC-KI][market-review-usage]", error);
    return res.status(500).json({ ok: false, error: "MARKET_REVIEW_USAGE_FAILED" });
  }
});

router.post(
  "/independent-openai-review",
  requireMarketReviewAccess,
  requireOptionalMarketProjectAccess,
  async (req, res) => {
  let companyId = "";
  let reservedCredits: MarketCreditSource[] = [];
  try {
    companyId = companyIdFromReq(req) || "";
    if (!companyId) return res.status(403).json({ ok: false, error: "NO_COMPANY" });

    const rows: InputRow[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ ok: false, error: "NO_ROWS" });
    if (rows.length > 25) return res.status(400).json({ ok: false, error: "MAX_25_ROWS" });

    const marketMonth = currentMarketCreditMonth();
    const fingerprints = rows.map((row) => marketReviewFingerprint(row));
    const cached = await prisma.aiMarketReviewCache.findMany({
      where: { companyId, marketMonth, fingerprint: { in: fingerprints } },
    });
    const cacheMap = new Map(cached.map((entry: any) => [entry.fingerprint, entry.result as any]));
    const missingIndexes = fingerprints.map((fp, index) => cacheMap.has(fp) ? -1 : index).filter((index) => index >= 0);
    reservedCredits = missingIndexes.length ? await reserveMarketCredits(companyId, missingIndexes.length) : [];
    const freshResults = missingIndexes.length
      ? await Promise.all(missingIndexes.map((index) => independentOpenAiReview(rows[index])))
      : [];
    const validFresh = freshResults.filter(Boolean);
    if (validFresh.length < reservedCredits.length) {
      const unusedReservations = reservedCredits.slice(validFresh.length);
      await refundMarketCredits(companyId, unusedReservations);
      reservedCredits = reservedCredits.slice(0, validFresh.length);
    }
    for (let j = 0; j < missingIndexes.length; j += 1) {
      const result: any = freshResults[j];
      if (!result) continue;
      const fp = fingerprints[missingIndexes[j]];
      await prisma.aiMarketReviewCache.upsert({
        where: { companyId_fingerprint_marketMonth: { companyId, fingerprint: fp, marketMonth } },
        create: { companyId, fingerprint: fp, marketMonth, result },
        update: { result },
      });
      cacheMap.set(fp, result);
    }
    const valid = rows.map((row, index) => {
      const result: any = cacheMap.get(fingerprints[index]);
      if (!result) return null;
      return { ...result, id: row.id, posNr: s(row.posNr), cacheHit: !missingIndexes.includes(index) };
    }).filter(Boolean);
    if (!valid.length) {
      if (reservedCredits.length) {
        await refundMarketCredits(companyId, reservedCredits);
        reservedCredits = [];
      }
      return res.status(502).json({ ok: false, error: "OPENAI_MARKET_REVIEW_EMPTY", message: "OpenAI hat keinen verwertbaren Marktpreis geliefert. Bitte erneut versuchen." });
    }
    const userId = String((req.auth as any)?.sub ?? (req.user as any)?.id ?? "").trim() || null;
    const projectId = String(req.body?.projectId || "").trim() || null;

    if (valid.length) {
      await prisma.aiMarketReviewUsage.createMany({
        data: valid.map((result: any, resultIndex: number) => ({
          companyId,
          userId,
          projectId,
          positionId: String(result?.id || "").trim() || null,
          provider: String(result?.aiProvider || "unknown"),
          model: String(result?.aiModel || "unknown"),
          inputTokens: result?.cacheHit ? 0 : Math.max(0, Math.round(n(result?.aiUsage?.inputTokens))),
          outputTokens: result?.cacheHit ? 0 : Math.max(0, Math.round(n(result?.aiUsage?.outputTokens))),
          totalTokens: result?.cacheHit ? 0 : Math.max(0, Math.round(n(result?.aiUsage?.totalTokens))),
          webSearchCalls: result?.cacheHit ? 0 : Math.max(0, Math.round(n(result?.webSearchCalls))),
          creditsUsed: result?.cacheHit ? 0 : (String(result?.aiProvider || "").toLowerCase() === "openai" ? 1 : 0),
          creditSource: result?.cacheHit ? "CACHE" : reservedCredits[resultIndex] || null,
          estimatedCostUsd: result?.cacheHit ? 0 : marketReviewEstimatedCostUsd(result),
          status: result?.cacheHit ? "CACHE_HIT" : "SUCCESS",
        })),
      });
    }

    const metering = valid.reduce((acc: any, result: any) => {
      if (!result?.cacheHit && String(result?.aiProvider || "").toLowerCase() === "openai") acc.creditsUsed += 1;
      if (!result?.cacheHit) {
        acc.inputTokens += n(result?.aiUsage?.inputTokens);
        acc.outputTokens += n(result?.aiUsage?.outputTokens);
        acc.totalTokens += n(result?.aiUsage?.totalTokens);
        acc.webSearchCalls += n(result?.webSearchCalls);
        acc.estimatedCostUsd += marketReviewEstimatedCostUsd(result);
      }
      return acc;
    }, { creditsUsed: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, webSearchCalls: 0, estimatedCostUsd: 0 });

    const balance = await marketCreditBalance(companyId);
    reservedCredits = [];
    return res.json({ ok: true, rows: valid, source: "openai-independent", metering, balance });
  } catch (error: any) {
    if (companyId && reservedCredits.length) {
      try {
        await refundMarketCredits(companyId, reservedCredits);
      } catch (refundError) {
        console.error("[RLC-KI][market-credit-refund]", refundError);
      }
    }
    console.error("[RLC-KI][independent-openai-review]", error);
    if (error?.code === "AI_MARKET_CREDITS_EXHAUSTED") {
      const balance = companyId ? await marketCreditBalance(companyId).catch(() => null) : null;
      return res.status(402).json({
        ok: false,
        error: "AI_MARKET_CREDITS_EXHAUSTED",
        message: "KI-Marktpreisprüfungen aufgebraucht. Bitte Zusatzkontingent buchen.",
        balance,
      });
    }
    return res.status(500).json({ ok: false, error: "INDEPENDENT_OPENAI_REVIEW_FAILED", message: String(error?.message || error) });
  }
});

router.post("/suggest-batch", requireOptionalKalkulationProjectAccess, async (req, res) => {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(403).json({ ok: false, error: "NO_COMPANY" });

    let rows: InputRow[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ ok: false, error: "NO_ROWS" });

    /*
     * RLC X84 PRICE-DATE LINK:
     *
     * Eine historische Bezugszeit wird nur übernommen, wenn der Client den
     * konkreten LVHeader nennt. Wir nehmen NICHT automatisch den letzten LV
     * des Projekts, weil X83/X84-Versionen zeitlich und fachlich voneinander
     * abweichen können.
     *
     * LVHeader.priceDate stammt ausschließlich aus GAEB AwardInfo/BidDate.
     * GAEB VersDate wird nicht als wirtschaftlicher Preisstand verwendet.
     */
    const batchProjectKey = s(req.body?.projectCode || req.body?.projectKey);
    const batchLvHeaderId = s(
      req.body?.lvHeaderId ||
      req.body?.sourceLvHeaderId ||
      req.body?.options?.lvHeaderId ||
      req.body?.options?.sourceLvHeaderId
    );

    console.log("[RLC-KI][suggest-batch] SOURCE_LV", {
      projectKey: batchProjectKey,
      sourceLvHeaderId: batchLvHeaderId || null,
      rows: rows.length,
    });

    if (batchProjectKey && batchLvHeaderId) {
      const batchProject = await prisma.project.findFirst({
        where: {
          companyId,
          OR: [
            { id: batchProjectKey },
            { code: batchProjectKey },
            { number: batchProjectKey },
          ],
        },
        select: { id: true },
      });

      if (batchProject) {
        const batchPositions = Array.from(
          new Set(
            rows
              .map((row: any) => String(row?.posNr || row?.position || "").trim())
              .filter(Boolean)
          )
        );

        const sourceLvHeader = await prisma.lVHeader.findFirst({
          where: {
            id: batchLvHeaderId,
            projectId: batchProject.id,
          },
          select: {
            id: true,
            priceDate: true,
            priceDateSource: true,
            positions: {
              where: batchPositions.length ? { position: { in: batchPositions } } : undefined,
              select: {
                position: true,
                kurztext: true,
                langtext: true,
                einheit: true,
                menge: true,
              },
            },
          },
        });

        if (sourceLvHeader) {
          // The browser can contain a stale/minimal projection after GAEB import.
          // Rehydrate missing technical fields from the explicitly selected X83 LV,
          // never from X84 and never from a different project/version.
          const sourceByPos = new Map(
            sourceLvHeader.positions.map((position) => [String(position.position).trim(), position])
          );
          const sourcePriceDate = sourceLvHeader.priceDate?.toISOString();
          rows = rows.map((row: any) => {
            const source = sourceByPos.get(String(row?.posNr || row?.position || "").trim());
            return {
              ...row,
              kurztext: s(row?.kurztext).trim() || source?.kurztext || "",
              langtext: s(row?.langtext).trim() || source?.langtext || "",
              einheit: s(row?.einheit).trim() || source?.einheit || "",
              menge: n(row?.menge, 0) > 0 ? row.menge : Number(source?.menge || 0),
              priceDate: row?.priceDate || sourcePriceDate,
              priceDateSource:
                row?.priceDateSource ||
                sourceLvHeader.priceDateSource ||
                (sourcePriceDate ? "LVHeader.priceDate" : undefined),
            };
          });
        }
      }
    }

    const options = { ...(req.body || {}), ...(req.body?.options || {}) };

      // RLC SPEED FIX:
      // Standard-Kalkulation darf OpenAI nicht massenhaft verwenden.
      // OpenAI nur wenn explizit expertMode / forceOpenAIReview / useOpenAIIfNoDatabaseHit=true.
      const useOpenAIIfNoDatabaseHit =
        options.useOpenAIIfNoDatabaseHit === true ||
        options.expertMode === true ||
        options.forceOpenAIReview === true;

      const maxOpenAiRowsPerBatch = Math.max(
        0,
        Math.min(20, n(options.maxOpenAiRowsPerBatch, useOpenAIIfNoDatabaseHit ? 5 : 0))
      );
      const forceRecalculate =
        options.forceRecalculate === true ||
        options.ignoreCache === true ||
        options.noCache === true ||
        req.body?.forceRecalculate === true;

      const startedAt = Date.now();

      const out: any[] = new Array(rows.length);
      let openAiUsed = 0;
      let nextRowIndex = 0;

      /*
       * SPEED FIX SERVER:
       * Vorher wurde jede Position sequenziell gerechnet.
       * Jetzt laufen mehrere Positionen kontrolliert parallel.
       * OpenAI bleibt über maxOpenAiRowsPerBatch begrenzt.
       */
      const maxParallelRows = Math.max(
        1,
        Math.min(8, n(options.maxParallelRows, forceRecalculate ? 6 : 4))
      );

      async function processRow(index: number) {
        const row = rows[index];
        const rowStartedAt = Date.now();

        let budgetLeft = 0;

        try {
          // DB-Matches werden in calcSmartRow lazy geladen – erst NACH
          // dem schnellen Family-Catalog-v2-Pfad.
          const matches: DbMatch[] | null = null;

          // Eine Position ohne Kurz- und Langtext ist kein kalkulierbarer
          // Leistungsinhalt. Sie darf niemals einen OpenAI-Slot belegen,
          // sonst hängt ein 50er-Batch an leeren GAEB-Zeilen.
          const hasTechnicalText = Boolean(
            s((row as any)?.kurztext).trim() || s((row as any)?.langtext).trim()
          );
          if (hasTechnicalText && openAiUsed < maxOpenAiRowsPerBatch) {
            openAiUsed += 1;
            budgetLeft = 1;
          }

          const constructionIntelligenceStartedAt = performance.now();
          const calcSmartStartedAt = Date.now();
          out[index] = await calcSmartRow(
            row,
            matches,
            companyId,
            useOpenAIIfNoDatabaseHit,
            budgetLeft,
            forceRecalculate,
            rows,
            s(req.body?.projectCode || req.body?.projectKey)
          );
          const calcSmartMs = Date.now() - calcSmartStartedAt;

          out[index] = applyRlcX84BenchmarkLearningSignal(row, out[index]);
          const globalKnowledgeStartedAt = Date.now();
          out[index] = await applyGlobalKnowledgeHint(row, out[index]);
          const globalKnowledgeMs = Date.now() - globalKnowledgeStartedAt;
          out[index] = annotateExistingCalculation(out[index], {
            startedAtMs: constructionIntelligenceStartedAt,
            stages: [
              {
                stage: "existing-calcSmartRow-pipeline",
                ok: true,
              },
              {
                stage: "final-guards",
                ok: true,
              },
              {
                stage: "global-knowledge-hint",
                ok: true,
              },
            ],
          });
          const enrichStartedAt = Date.now();
          out[index] = enrichRlcCalculationPipeline({ row, baseResult: out[index] });
          const enrichMs = Date.now() - enrichStartedAt;

          const rowDurationMs = Date.now() - rowStartedAt;
          if (rowDurationMs >= 1000) {
            console.log("[RLC PERF ROW]", {
              posNr: s(row?.posNr),
              durationMs: rowDurationMs,
              calcSmartMs,
              globalKnowledgeMs,
              enrichMs,
              source: s(out[index]?.source),
              family: s(out[index]?.rlcFamily || out[index]?.family || out[index]?.gewerk),
            });
          }

          if (out[index]?.source !== "openai" && budgetLeft > 0) {
            openAiUsed = Math.max(0, openAiUsed - 1);
          }
        } catch (rowError: any) {
          if (budgetLeft > 0) {
            openAiUsed = Math.max(0, openAiUsed - 1);
          }

          console.error("[kalkulation.ki] row fallback", {
            index,
            posNr: s(row?.posNr),
            kurztext: s(row?.kurztext).slice(0, 120),
            error: rowError?.message || rowError,
          });

          const finalRowBeforeKnowledgeHub = applyRlcX84BenchmarkLearningSignal(
            row,
            buildUnresolvedV2Row(
              row,
              "RLC v2 primary mode: Fehler im Positionslauf. Legacy rule-engine fallback wurde bewusst nicht als Preisquelle verwendet."
            )
          );

          const knowledgeHub = resolveRlcKnowledgeHub({
            kurztext: (row as any)?.kurztext,
            langtext: (row as any)?.langtext,
            text: `${(row as any)?.kurztext || ""} ${(row as any)?.langtext || ""}`,
            unit: (row as any)?.einheit,
            family: (finalRowBeforeKnowledgeHub as any)?.rlcFamily || (finalRowBeforeKnowledgeHub as any)?.family || (finalRowBeforeKnowledgeHub as any)?.gewerk
          });

          if (knowledgeHub.hasExternalKnowledge && finalRowBeforeKnowledgeHub) {
            console.log("[RLC KnowledgeHub FINAL]", {
              posNr: (row as any)?.posNr,
              matches: knowledgeHub.externalMatches.length,
              confidence: knowledgeHub.externalKnowledgeConfidence
            });

            (finalRowBeforeKnowledgeHub as any).externalKnowledge = knowledgeHub.externalMatches;
            (finalRowBeforeKnowledgeHub as any).externalKnowledgeConfidence = knowledgeHub.externalKnowledgeConfidence;
            (finalRowBeforeKnowledgeHub as any).aiReason = [
              String((finalRowBeforeKnowledgeHub as any).aiReason || ""),
              ...knowledgeHub.technicalNotes
            ].filter(Boolean).join("\n\n");
          }

          out[index] = finalRowBeforeKnowledgeHub;
        }
      }

      async function worker() {
        while (nextRowIndex < rows.length) {
          const index = nextRowIndex;
          nextRowIndex += 1;
          await processRow(index);
        }
      }

      await Promise.all(
        Array.from(
          { length: Math.min(maxParallelRows, rows.length) },
          () => worker()
        )
      );

      const finalRows = out.map((r, index) => {
        const base =
          r ||
          buildUnresolvedV2Row(
            rows[index],
            "RLC v2 primary mode: Kein Ergebnis im Batch-Puffer. Legacy rule-engine fallback wurde nicht als Preisquelle verwendet."
          );
        const enriched = enrichRowWithReverseUrkalkulation(rows[index], base);
        const finalCandidate = applyRlcX84BenchmarkLearningSignal(rows[index], enriched);
        return applyRlcPriceEvidenceGate(rows[index], finalCandidate);
      });
        const guardedFinalRows = applyDuplicateQuantityOutlierGuard(finalRows)
      .map(cleanRlcOutputRow);

        const learningProjectKey = s(req.body?.projectCode || req.body?.projectKey);
        const learnedCount = await saveKiLearningRows(
          companyId,
          learningProjectKey,
          guardedFinalRows
        );

      console.log("[kalkulation.ki] learning", {
        rows: guardedFinalRows.length,
        learnedCount,
        durationMs: Date.now() - startedAt,
        maxParallelRows,
        maxOpenAiRowsPerBatch,
        openAiUsed,
        sources: guardedFinalRows.reduce((acc: any, r: any) => {
          const key = r?.source || "unknown";
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {}),
      });

      return res.json({
        ok: true,
        source: cleanRlcSourceFlags("server"),
        engine: "database-recipe-openai-rule-engine-parallel-v2",
        rows: guardedFinalRows,
        summary: {
          ...buildSummary(guardedFinalRows),
          learnedCount,
          forceRecalculate,
          cacheBypassed: forceRecalculate,
          durationMs: Date.now() - startedAt,
          maxParallelRows,
          maxOpenAiRowsPerBatch,
          openAiUsed,
        },
    });
  } catch (e: any) {
    console.error("[kalkulation.ki] suggest-batch failed:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "KI_SUGGEST_FAILED",
    });
  }
});



// RLC_CONSTRUCTION_INTELLIGENCE_REANNOTATE_ENDPOINT_V2
router.post("/construction-intelligence/reannotate/:projectKey", requireKiProjectPathAccess, async (req, res) => {
  try {
    const projectKey = String(req.params.projectKey || "").trim();

    if (!/^[A-Za-z0-9._-]+$/.test(projectKey)) {
      return res.status(400).json({
        ok: false,
        error: "Ungültiger Projektschlüssel.",
      });
    }

    const projectsRoot = process.env.PROJECTS_ROOT || "/app/data/projects";
    const filePath = ciPath.join(
      projectsRoot,
      projectKey,
      "kalkulation",
      "ki-kalkulation.json"
    );

    if (!ciFs.existsSync(filePath)) {
      return res.status(404).json({
        ok: false,
        projectKey,
        error: "KI-Kalkulation nicht gefunden.",
      });
    }

    const originalText = ciFs.readFileSync(filePath, "utf8");
    const raw = JSON.parse(originalText);

    const rows = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.rows)
        ? raw.rows
        : Array.isArray(raw?.positions)
          ? raw.positions
          : Array.isArray(raw?.items)
            ? raw.items
            : [];

    if (!rows.length) {
      return res.status(400).json({
        ok: false,
        projectKey,
        error: "Keine Kalkulationspositionen gefunden.",
      });
    }

    let annotatedRows = 0;

    const updatedRows = rows.map((row: any) => {
      if (!row || typeof row !== "object") return row;

      const updated = annotateExistingCalculation(row, {
        stages: [
          {
            stage: "existing-file-reannotation",
            ok: true,
          },
        ],
      });

      if (updated?.constructionIntelligence) annotatedRows += 1;
      return updated ?? row;
    });

    let updatedDocument: any;

    if (Array.isArray(raw)) {
      updatedDocument = updatedRows;
    } else if (Array.isArray(raw?.rows)) {
      updatedDocument = { ...raw, rows: updatedRows };
    } else if (Array.isArray(raw?.positions)) {
      updatedDocument = { ...raw, positions: updatedRows };
    } else if (Array.isArray(raw?.items)) {
      updatedDocument = { ...raw, items: updatedRows };
    } else {
      return res.status(400).json({
        ok: false,
        projectKey,
        error: "Unbekanntes KI-Dateiformat.",
      });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${filePath}.bak-ci-v2-${timestamp}`;
    const temporaryPath = `${filePath}.tmp-ci-v2`;

    ciFs.copyFileSync(filePath, backupPath);
    ciFs.writeFileSync(
      temporaryPath,
      JSON.stringify(updatedDocument, null, 2),
      "utf8"
    );
    ciFs.renameSync(temporaryPath, filePath);

    return res.json({
      ok: true,
      projectKey,
      engine: "rlc-construction-intelligence-v2",
      totalRows: rows.length,
      annotatedRows,
      priceModified: false,
      backupPath,
      filePath,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(
      "[construction-intelligence-reannotate]",
      error?.message || error
    );

    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "Construction-Intelligence-Reannotation fehlgeschlagen.",
    });
  }
});


// RLC_CONSTRUCTION_INTELLIGENCE_STATUS_ENDPOINT_V2
router.get("/construction-intelligence/status/:projectKey", requireKiProjectPathAccess, async (req, res) => {
  try {
    const projectKey = String(req.params.projectKey || "").trim();

    if (!/^[A-Za-z0-9._-]+$/.test(projectKey)) {
      return res.status(400).json({
        ok: false,
        error: "Ungültiger Projektschlüssel.",
      });
    }

    const projectsRoot = process.env.PROJECTS_ROOT || "/app/data/projects";
    const filePath = ciPath.join(
      projectsRoot,
      projectKey,
      "kalkulation",
      "ki-kalkulation.json"
    );

    if (!ciFs.existsSync(filePath)) {
      return res.status(404).json({
        ok: false,
        projectKey,
        error: "KI-Kalkulation nicht gefunden.",
      });
    }

    const raw = JSON.parse(ciFs.readFileSync(filePath, "utf8"));
    const rows = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.rows)
        ? raw.rows
        : Array.isArray(raw?.positions)
          ? raw.positions
          : Array.isArray(raw?.items)
            ? raw.items
            : [];

    const numeric = (value: unknown): number => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const unitPrice = (row: Record<string, any>): number =>
      numeric(
        row?.rlcKiUnitPrice ??
          row?.finalUnitPrice ??
          row?.suggestedUnitPrice ??
          row?.unitPrice ??
          row?.ep ??
          row?.preis
      );

    const annotated = rows.filter(
      (row: Record<string, any>) =>
        row && typeof row === "object" && row.constructionIntelligence
    );

    const sourceCounts: Record<string, number> = {};
    const reviewRows: Array<Record<string, any>> = [];
    const decisionRows: Array<Record<string, any>> = [];
    let confidenceSum = 0;
    let decisionScoreSum = 0;
    let decisionScoredRows = 0;
    let mismatchCount = 0;

    for (const row of annotated) {
      const ci = row.constructionIntelligence || {};
      const source =
        normalizeSource(ci.finalSource) ||
        normalizeSource(row.source) ||
        normalizeSource(row.calculationSource) ||
        "existing-calculation";

      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      confidenceSum += numeric(ci.confidence);

      const decisionScore = numeric(ci.decisionScore);
      const decisionReasons = Array.isArray(ci.decisionReasons)
        ? ci.decisionReasons
        : [];
      const decisionComponents =
        ci.decisionComponents &&
        typeof ci.decisionComponents === "object"
          ? ci.decisionComponents
          : {};
      const alternatives = Array.isArray(ci.alternatives)
        ? ci.alternatives
        : [];

      if (Number.isFinite(Number(ci.decisionScore))) {
        decisionScoreSum += decisionScore;
        decisionScoredRows += 1;
      }

      decisionRows.push({
        posNr:
          row.posNr ??
          row.positionsnummer ??
          row.position ??
          row.oz ??
          null,
        kurztext: row.kurztext ?? row.shortText ?? "",
        source,
        ep: unitPrice(row),
        confidence: numeric(ci.confidence),
        decisionScore,
        decisionReasons,
        decisionComponents,
        alternatives,
        requiresReview: Boolean(ci.requiresReview),
        engine: ci.engine || "unknown",
      });

      const currentEp = unitPrice(row);
      const observedEp = numeric(ci.finalEp);

      if (
        Number.isFinite(currentEp) &&
        Number.isFinite(observedEp) &&
        Math.abs(currentEp - observedEp) > 0.000001
      ) {
        mismatchCount += 1;
      }

      if (ci.requiresReview) {
        reviewRows.push({
          posNr:
            row.posNr ??
            row.positionsnummer ??
            row.position ??
            row.oz ??
            null,
          kurztext: row.kurztext ?? row.shortText ?? "",
          source,
          ep: currentEp,
          confidence: numeric(ci.confidence),
          decisionScore,
          decisionReasons,
          decisionComponents,
          alternatives,
          durationMs: numeric(ci.totalDurationMs),
        });
      }
    }

    reviewRows.sort(
      (a, b) => numeric(a.confidence) - numeric(b.confidence)
    );

    const coverage = rows.length > 0 ? annotated.length / rows.length : 0;
    const averageConfidence =
      annotated.length > 0 ? confidenceSum / annotated.length : 0;
    const averageDecisionScore =
      decisionScoredRows > 0
        ? decisionScoreSum / decisionScoredRows
        : 0;

    decisionRows.sort(
      (a, b) => numeric(b.decisionScore) - numeric(a.decisionScore)
    );

    return res.json({
      ok: true,
      projectKey,
      engine: "rlc-construction-intelligence-v2",
      mode: "multi-factor-explainable-observer",
      decisionMode: "multi-factor-explainable-selection",
      summary: {
        totalRows: rows.length,
        annotatedRows: annotated.length,
        coverage,
        coveragePercent: Math.round(coverage * 10000) / 100,
        averageConfidence:
          Math.round(averageConfidence * 10000) / 10000,
        averageDecisionScore:
          Math.round(averageDecisionScore * 100) / 100,
        decisionScoredRows,
        requiresReview: reviewRows.length,
        epSourceMismatches: mismatchCount,
        priceModified: mismatchCount > 0,
      },
      sources: Object.entries(sourceCounts)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count),
      reviewRows: reviewRows.slice(0, 200),
      decisions: decisionRows.slice(0, 500),
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(
      "[construction-intelligence-status]",
      error?.message || error
    );

    return res.status(500).json({
      ok: false,
      error: "Construction-Intelligence-Status konnte nicht geladen werden.",
    });
  }
});



const normalizeSource = (value: unknown): string => {
  const source = String(value ?? "").trim();

  if (!source || source.toLowerCase() === "unknown") {
    return "";
  }

  return source;
};

export default router;
