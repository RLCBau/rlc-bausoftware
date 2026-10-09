/**
 * Deterministic V2 catalog audit.
 * It never writes to the database and never uses X84 as a price source.
 * Run: npx ts-node src/scripts/auditCalculationPipeline.ts > /tmp/rlc-pipeline-audit.json
 */
import { PrismaClient } from "@prisma/client";
import { calculateAutonomousUrkalkulation as calculate } from "../kalkulation/autonomous/autonomousUrkalkulationEngine";

const prisma = new PrismaClient();

const context: any = {
  projectType: "Tiefbau",
  trade: "Tiefbau",
  difficulty: "medium",
  logisticsRisk: "medium",
  trafficRisk: "medium",
  durationRisk: "medium",
  marketFactor: 1,
  distanceFactor: 1,
  confidence: 0.9,
  warnings: [],
};

function textOf(row: any): string {
  return String(row?.kurztext || row?.langtext || "").trim();
}

function positionSort(left: any, right: any): number {
  const a = (String(left?.posNr || "").match(/\d+/g) || []).map(Number);
  const b = (String(right?.posNr || "").match(/\d+/g) || []).map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const delta = (a[i] ?? -1) - (b[i] ?? -1);
    if (delta) return delta;
  }
  return String(left?.posNr || "").localeCompare(String(right?.posNr || ""), "de");
}

function normalizedPattern(value: string): string {
  return value
    .toLowerCase()
    .replace(/\d+(?:[.,]\d+)?/g, "#")
    .replace(/[^a-zäöüß#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function issueReason(result: any, ep: number): string {
  const evidence = [
    ...(Array.isArray(result?.warnings) ? result.warnings : []),
    result?.aiReason,
    result?.bauverfahren,
    result?.leistungsart,
  ].filter(Boolean).join(" ").toLowerCase();

  if (ep <= 0 && /kein.*(?:ep|preis|kalkulation)|nicht.*(?:berechnet|ermittelt)|unresolved/.test(evidence)) {
    return "NO_SUPPORTED_V2_FAMILY";
  }
  if (/ohne .*(?:dn|durchmesser|tiefe|schichtdicke|klasse|material|menge|einheit)/.test(evidence)) {
    return "MISSING_TECHNICAL_PARAMETER";
  }
  if (/nicht eindeutig|technische klärung|prüf/.test(evidence)) {
    return "TECHNICAL_CLARIFICATION";
  }
  if (/entsorgung|belastet|deponie|avv|ebv/.test(evidence)) {
    return "DISPOSAL_OR_MATERIAL_CLASS";
  }
  if (/risiko|erschwernis|verkehr|wasserhaltung/.test(evidence)) {
    return "PROJECT_CONDITION";
  }
  return ep <= 0 ? "UNCLASSIFIED_ZERO" : "REVIEW_OTHER";
}

function parametricCandidate(text: string, unit: string): string {
  const value = text.toLowerCase();
  const normalizedUnit = unit.toLowerCase().replace("²", "2").replace("³", "3");
  const hasDn = /\b(?:dn|da|od)\s*=?\s*\d+/.test(value);
  const hasThickness = /\b(?:dicke|d\s*=?)\s*\d+(?:[.,]\d+)?\s*cm\b|\b\d+(?:[.,]\d+)?\s*cm\b/.test(value);
  const hasSoilClass = /\b(?:z\s*[0-2](?:[.,]\d)?|dk\s*[0-3]|avv|ebv)\b/.test(value);

  if (/(?:rohrleitung|druckrohr|kunststoffrohr|\bpe(?:-hd)?\b|\bpvc\b|\bpp(?:-md)?\b)/.test(value) && hasDn && normalizedUnit === "m") return "PIPE_DN_MATERIAL";
  if (/(?:bogen|abzweig|muffe|formst[üu]ck|endkappe)/.test(value) && hasDn && /^(?:st|stk|stck)$/.test(normalizedUnit)) return "PIPE_FITTING_DN";
  if (/(?:schacht|straßenablauf|strassenablauf)/.test(value) && (hasDn || /\btiefe\b/.test(value)) && /^(?:st|stk|stck)$/.test(normalizedUnit)) return "SHAFT_DN_DEPTH";
  if (/(?:asphalt|\bac\s*\d)/.test(value) && hasThickness && normalizedUnit === "m2") return "ASPHALT_THICKNESS";
  if (/(?:abbruch|abbrechen|r[üu]ckbau|ausbauen)/.test(value) && /(?:beton|asphalt|pflaster|mauerwerk)/.test(value) && (hasThickness || normalizedUnit === "m3")) return "DEMOLITION_MATERIAL";
  if (/(?:baugrube|aushub|rohrgraben|leitungsgraben)/.test(value) && normalizedUnit === "m3") return "EARTHWORK_VOLUME";
  if (/(?:entsorgen|abfahren|verwerten)/.test(value) && hasSoilClass && /^(?:m3|t)$/.test(normalizedUnit)) return "DISPOSAL_CLASS";
  if (/(?:pflaster|bordstein|einfassung)/.test(value) && /(?:beton|granit|naturstein|klinker)/.test(value) && /^(?:m2|m)$/.test(normalizedUnit)) return "PAVING_MATERIAL";
  return "";
}

function semanticCluster(text: string, unit: string): string {
  const v = text.toLowerCase();
  const u = unit.toLowerCase().replace("²", "2").replace("³", "3");
  if (/\b(?:rohr|leitung|druckrohr|wasserleitung|kanal|schacht|muffe|bogen|abzweig|formst[üu]ck|dn\s*\d+)\b/.test(v)) return "KANAL_ROHR_SCHACHT";
  if (/\b(?:aushub|baugrube|graben|boden|erd|verf[üu]ll|hinterf[üu]ll|planum|verdicht|sch[üu]tt)\b/.test(v)) return "ERDBAU_SCHUETTGUT";
  if (/\b(?:entsorg|depon|verwert|avv|ebv|z\s*[0-2](?:[.,]\d)?|dk\s*[0-3]|belastet)\b/.test(v)) return "ENTSORGUNG";
  if (/\b(?:asphalt|bitumen|ac\s*\d|deckschicht|tragschicht)\b/.test(v)) return "ASPHALT";
  if (/\b(?:pflaster|bord|einfassung|plattenbelag|naturstein|granit|rasenstein)\b/.test(v)) return "PFLASTER_BORD";
  if (/\b(?:beton|stahlbeton|mauerwerk|abbruch|abbrechen|r[üu]ckbau|hdw)\b/.test(v)) return "BETON_ABBRUCH";
  if (/\b(?:bagger|lkw|radlader|walze|kran|ger[äa]t|maschine|regie|stundenlohn|zuschlag)\b/.test(v) || /^(?:h|std)$/.test(u)) return "MASCHINEN_REGIE";
  if (/\b(?:kabel|fernmelde|telekom|lsa|signal|strom|elektro)\b/.test(v)) return "KABEL_TELEKOM_ELEKTRO";
  if (/\b(?:rasen|geh[öo]lz|baum|pflanz|humus|substrat|vegetation|dachfl[äa]che)\b/.test(v)) return "LANDSCHAFT_DACH";
  if (/\b(?:alternative pos|zulage zu pos|gem[aä]ss pos|wie vor|freitext|hinweis|angaben und anforderungen)\b/.test(v)) return "BEZUG_FREITEXT";
  return "SONSTIGE";
}

/** Diagnose zeros without fabricating a price or downgrading technical reviews. */
function zeroRootCause(row: any, result: any): string {
  const short = String(row.kurztext || "").replace(/\\bwidth:\\s*\\d+pt\\b/gi, " ").trim();
  const long = String(row.langtext || "").trim();
  const text = (short + " " + long).toLowerCase();
  const unit = String(row.einheit || "").trim().toLowerCase();
  if (!unit || unit === "eh") return "UNIT_UNSPECIFIED";
  if (/^(?:freitext(?:\\s*\\.{2,})?|zulage|zuschlag|wie vor|alternativ(?:e)?(?:\\s+pos\\.)?|nach pos\\.|sonstiges|.)$/i.test(short)) return "SHORTTEXT_REQUIRES_REFERENCE";
  if (/\\b(?:alternative nach wahl|alternative pos|wahlposition|wie vor|zu pos\\.|gem[aä]ß pos|lt\\. pos\\.|pos\\. vor|bauseits|nur nach nachweis)\\b/i.test(text)) return "REFERENCE_OR_OPTION";
  if (/(?:\\.{3}|freitext|\\[eintrag|\\[bitte|text erg[aä]nzen)/i.test(text)) return "PLACEHOLDER_OR_INCOMPLETE";
  if (/(?:schadstoff|entsorg|abfall|dk\\s*[0-3]|avv|ebv|asbest|pak|teer)/i.test(text) && !/(?:\\bavv\\s*\\d{6}|\\bdk\\s*[0-3]|\\bz\\s*[0-2]\\b)/i.test(text)) return "DISPOSAL_CLASS_CHECK";
  if (/(?:\\brohr\\b|\\bdn\\s*\\d+|\\bschacht\\b|\\bgraben\\b|\\bgrabentiefe\\b)/i.test(text)) return "PIPE_TRENCH_TECHNICAL";
  if (/^(?:h|std|stunde)$/.test(unit) || /\b(?:regie|maschine|ger[aä]t|lkw|bagger|kran|walze)\b/i.test(text)) return "MACHINE_REGIE_TECHNICAL";
  if (/\\b(?:asphalt|pflaster|bordstein|beton|erdarbeiten|aushub|verf[üu]llen|schotter)\\b/i.test(text)) return "CONSTRUCTION_TECHNICAL";
  if ((short + long).trim().length < 18) return "INSUFFICIENT_DESCRIPTION";
  if (String(result?.source || "") === "none") return "NO_V2_FAMILY";
  return "V2_FAMILY_WITHOUT_EP";
}

function addBucket(
  buckets: Record<string, { count: number; examples: any[] }>,
  key: string,
  example: any
) {
  const bucket = buckets[key] || (buckets[key] = { count: 0, examples: [] });
  bucket.count += 1;
  if (bucket.examples.length < 3) bucket.examples.push(example);
}

async function main() {
  const projects = await prisma.project.findMany({
    select: {
      code: true,
      lvSets: {
        take: 1,
        orderBy: { version: "desc" },
        select: {
          positions: {
            select: {
              id: true,
              position: true,
              kurztext: true,
              langtext: true,
              einheit: true,
              menge: true,
              x84UnitPrice: true,
            },
          },
        },
      },
    },
  });

  const status: Record<string, number> = {};
  const sources: Record<string, number> = {};
  const zeroFamilies: Record<string, { count: number; examples: any[] }> = {};
  const reviewFamilies: Record<string, { count: number; examples: any[] }> = {};
  const patterns: Record<string, { count: number; examples: any[] }> = {};
  const semanticClusters: Record<string, { count: number; examples: any[] }> = {};
  const zeroUnits: Record<string, { count: number; examples: any[] }> = {};
  const zeroRootCauses: Record<string, { count: number; examples: any[] }> = {};
  const zeroResourceStates: Record<string, { count: number; examples: any[] }> = {};
  const zeroResourceFamilies: Record<string, { count: number; examples: any[] }> = {};
  const zeroShortTextClusters: Record<string, { count: number; examples: any[] }> = {};
  const zeroLongtextDiagnostics: Record<string, { count: number; examples: any[] }> = {};
  const unresolvedPatterns: Record<string, { count: number; examples: any[] }> = {};
  const unresolvedUnits: Record<string, { count: number; examples: any[] }> = {};
  const parametricCandidates: Record<string, { count: number; examples: any[] }> = {};
  let rows = 0;
  let textRows = 0;
  let resolved = 0;
  let zero = 0;
  let x84Rows = 0;
  const x84Comparison = { benchmarkRows: 0, comparablePositive: 0, nonpositiveX84: 0, rlcZero: 0, abs10: 0, abs20: 0, abs30: 0, abs50: 0, abs100: 0, signedSum: 0, absoluteSum: 0, samples: [] as any[] };
  const x84FamilyGroups: Record<string, { count: number; abs20: number; abs30: number; totalAbsoluteDeviation: number; examples: any[] }> = {};
  const x84DeviationValues: number[] = [];
  const x84Direction = { rlcAbove: 0, rlcBelow: 0, within10: 0 };
  const belowV2DirectCost: Record<string, { count: number; examples: any[] }> = {};
  const recipeCalibrationGroups: Record<string, { count:number; within10:number; above10:number; below10:number; deviations:number[]; samples:any[] }> = {};
  const criticalParts: Record<string, { count:number; within10:number; high:number; low:number; examples:any[] }> = {};
  const partsDataQuality: Record<string,{count:number; examples:any[]}> = {};
  const comparableDetailRows: any[] = [];
  const massMarketReviewRows: any[] = [];

  for (const project of projects) {
    const currentRows = (project.lvSets[0]?.positions || [])
      .map((row: any) => ({
        id: row.id,
        posNr: row.position,
        kurztext: row.kurztext,
        langtext: row.langtext || "",
        einheit: row.einheit,
        menge: Number(row.menge),
        x84UnitPrice: row.x84UnitPrice == null ? null : Number(row.x84UnitPrice),
      }))
      .sort(positionSort);

    for (const row of currentRows) {
      rows += 1;
      const raw = textOf(row);
      if (!raw) continue;
      textRows += 1;
      if (row.x84UnitPrice != null) x84Rows += 1;

      const result: any = calculate(row, context, currentRows);
      const ep = Number(result?.unitPrice || 0);
      const calculationStatus = String(result?.calculationStatus || "unresolved");
      const source = String(result?.source || "none");
      const family = `${String(result?.trade || "UNRESOLVED")} / ${String(result?.leistungsart || "UNRESOLVED")} / ${String(row.einheit || "EH")}`;
      const reason = issueReason(result, ep);
      const x84 = Number(row.x84UnitPrice);
      massMarketReviewRows.push({project:project.code,pos:row.posNr,unit:row.einheit,quantity:row.menge,shortText:String(row.kurztext||""),longText:String(row.langtext||""),family:String(result?.trade||"UNRESOLVED"),recipe:String(result?.leistungsart||"UNRESOLVED"),ep,x84:row.x84UnitPrice,resources:(result?.costLines||[]).map((l:any)=>({group:l.group,name:l.name,qty:l.qty,unitPrice:l.unitPrice,total:l.total}))});
      if (row.x84UnitPrice != null) {
        x84Comparison.benchmarkRows++;
        if (!(x84 > 0)) x84Comparison.nonpositiveX84++;
        else if (!(ep > 0)) x84Comparison.rlcZero++;
        else {
          const signedPct = (ep / x84 - 1) * 100;
          comparableDetailRows.push({project:project.code,pos:row.posNr,unit:row.einheit,shortText:String(row.kurztext||""),longText:String(row.langtext||"").slice(0,1200),trade:String(result?.trade||""),recipe:String(result?.leistungsart||""),ep,x84,resources:(result?.costLines||[]).map((l:any)=>({group:l.group,name:l.name,total:l.total}))});
          const absPct = Math.abs(signedPct);
          x84Comparison.comparablePositive++;
          x84DeviationValues.push(absPct);
          const directCost = (Array.isArray(result?.costLines) ? result.costLines : []).filter((line:any) => !/^(gemeinkosten|gewinn)$/i.test(String(line.group))).reduce((sum:number,line:any)=>sum+Number(line.total||0),0);
          if (directCost > 0 && x84 < directCost) addBucket(belowV2DirectCost, String(result?.trade || "UNKNOWN").split("/")[0], {project:project.code,pos:row.posNr,rlcEp:ep,x84Ep:x84,directCost:Number(directCost.toFixed(2)),unit:row.einheit,text:String(row.kurztext||"").slice(0,100)});
          if (absPct <= 10) x84Direction.within10++; else if (signedPct > 0) x84Direction.rlcAbove++; else x84Direction.rlcBelow++;
          x84Comparison.signedSum += signedPct;
          x84Comparison.absoluteSum += absPct;
          if (absPct > 10) x84Comparison.abs10++;
          if (absPct > 20) x84Comparison.abs20++;
          if (absPct > 30) x84Comparison.abs30++;
          if (absPct > 50) x84Comparison.abs50++;
          if (absPct > 100) x84Comparison.abs100++;
          const trade = String(result?.trade || "UNCLASSIFIED").split("/")[0];
          const recipeKey = [String(result?.trade || "UNCLASSIFIED"),String(result?.leistungsart || "UNKNOWN"),String(row.einheit || "EH").toLowerCase()].join(" / ");
          if (/^(?:Rohrbau\/Formteil|Kanalbau\/Schachtanschluss)$/.test(String(result?.trade || ""))) {
            const sourceText = `${row.kurztext || ""} ${row.langtext || ""}`.toLowerCase();
            const dnMatch = sourceText.match(/\b(?:dn|da)\s*(\d{2,4})/);
            const material = /steinzeug|\bstz\b/.test(sourceText) ? "STEINZEUG" : /\bggg\b|guss|duktil/.test(sourceText) ? "GUSS" : /\bpe(?:100|-hd)?\b/.test(sourceText) ? "PE" : /\bpp\b|polypropylen/.test(sourceText) ? "PP" : /pvc|kunststoff/.test(sourceText) ? "PVC_KUNSTSTOFF" : /beton/.test(sourceText) ? "BETON" : "MATERIAL_UNBEKANNT";
            const dn = dnMatch ? Number(dnMatch[1]) : 0;
            const shortNormalized = String(row.kurztext || "").toLowerCase();
            const inShort = shortNormalized.match(/\b(?:dn|da)\s*(\d{2,4})/);
            const dnInShort = inShort ? Number(inShort[1]) : 0;
            const materialInShort = /\bpp\b/.test(shortNormalized) ? "PP" : /\bpe\b|pe-hd/.test(shortNormalized) ? "PE" : /\bggg\b|guss/.test(shortNormalized) ? "GUSS" : /pvc|kunststoff/.test(shortNormalized) ? "PVC" : "UNKNOWN";
            const conflict = dnInShort && dn && dnInShort !== dn;
            const dataKey = `${String(result?.trade)} / ${conflict ? "DN_CONFLICT" : dnInShort ? "DN_SHORT" : dn ? "DN_LONG_ONLY" : "DN_ABSENT"} / ${materialInShort !== "UNKNOWN" ? "MATERIAL_SHORT" : material !== "MATERIAL_UNBEKANNT" ? "MATERIAL_LONG_ONLY" : "MATERIAL_ABSENT"}`;
            addBucket(partsDataQuality,dataKey,{project:project.code,pos:row.posNr,dnShort:dnInShort,dnFirst:dn,materialShort:materialInShort,text:String(row.kurztext||"").slice(0,120)});
            const dnBand = dn ? (dn <= 150 ? "DN<=150" : dn <= 300 ? "DN151-300" : dn <= 600 ? "DN301-600" : "DN>600") : "DN_UNBEKANNT";
            const operation = /zulage|zuschlag/.test(sourceText) ? "ZULAGE" : /herstellen|montieren|einbauen/.test(sourceText) ? "EINBAU" : "UMFANG_UNKLAR";
            const key = [String(result?.trade),material,dnBand,operation].join(" / ");
            const part = criticalParts[key] || (criticalParts[key] = {count:0,within10:0,high:0,low:0,examples:[]});
            part.count++; if (absPct<=10) part.within10++; else if (signedPct>0) part.high++; else part.low++;
            if (part.examples.length < 2) part.examples.push({pos:row.posNr,ep,benchmark:x84,text:String(row.kurztext||"").slice(0,100)});
          }
          const cg = recipeCalibrationGroups[recipeKey] || (recipeCalibrationGroups[recipeKey]={count:0,within10:0,above10:0,below10:0,deviations:[],samples:[]});
          cg.count++; cg.deviations.push(signedPct);
          if(absPct<=10) cg.within10++; else if(signedPct>0) cg.above10++; else cg.below10++;
          if(cg.samples.length<3) cg.samples.push({project:project.code,pos:row.posNr,rlcEp:ep,x84Ep:x84,shortText:String(row.kurztext||"").slice(0,120)});
          const g = x84FamilyGroups[trade] || (x84FamilyGroups[trade] = {count:0,abs20:0,abs30:0,totalAbsoluteDeviation:0,examples:[]});
          g.count++; g.totalAbsoluteDeviation += absPct;
          if (absPct > 20) g.abs20++;
          if (absPct > 30) g.abs30++;
          const sample = {project:project.code,pos:row.posNr,unit:row.einheit,rlcEp:ep,x84Ep:x84,signedPct:Number(signedPct.toFixed(2)),trade,text:String(row.kurztext||"").slice(0,140)};
          if(g.examples.length < 4) g.examples.push(sample);
          if(x84Comparison.samples.length < 100 && absPct > 50) x84Comparison.samples.push(sample);
        }
      }
      const example = {
        project: project.code,
        pos: row.posNr,
        unit: row.einheit,
        text: raw.slice(0, 220),
        x84Benchmark: row.x84UnitPrice,
      };

      status[calculationStatus] = (status[calculationStatus] || 0) + 1;
      sources[source] = (sources[source] || 0) + 1;
      if (ep > 0) {
        resolved += 1;
      } else {
        zero += 1;
        addBucket(zeroFamilies, `${reason} / ${family}`, example);
        addBucket(patterns, `${reason} / ${normalizedPattern(raw)}`, example);
        addBucket(semanticClusters, semanticCluster(raw, String(row.einheit || "")), example);
        addBucket(zeroUnits, String(row.einheit || "EH"), example);
        addBucket(zeroRootCauses, zeroRootCause(row, result), example);
        const longValue = String(row.langtext || "");
        const hasDimension = /(?:dn|da)\s*\d{2,4}|(?:dicke|tiefe|stärke)\s*[:=]?\s*\d+[,.]?\d*\s*(?:mm|cm|m)/i.test(longValue);
        const hasReference = /(?:pos\.?\s*\[?\d|wie vor|vorposition|alternative pos)/i.test(raw);
        addBucket(zeroLongtextDiagnostics, `${longValue.trim() ? (hasDimension ? "LONG_DIM" : "LONG_NO_DIM") : "NO_LONG"} / ${hasReference ? "REF" : "NO_REF"}`, example);
        const shortKey = String(row.kurztext || "").toLowerCase().replace(/[^a-zäöüß0-9]+/g, " ").trim().replace(/\s+/g, " ");
        if (shortKey.length >= 9) addBucket(zeroShortTextClusters, `${String(row.einheit || "EH").toLowerCase()} / ${shortKey}`, example);
        const costLines = Array.isArray(result?.costLines) ? result.costLines : [];
        const pricedLines = costLines.filter((line: any) => Number(line?.total || 0) > 0);
        addBucket(zeroResourceStates, source === "none" ? "NO_FAMILY" : costLines.length === 0 ? "FAMILY_NO_RESOURCE_LINES" : pricedLines.length === 0 ? "RESOURCE_LINES_ALL_ZERO" : "POSITIVE_RESOURCES_BUT_EP_ZERO", example);
        if (source !== "none" && costLines.length === 0) addBucket(zeroResourceFamilies, `${result?.trade || "UNKNOWN"} / ${result?.leistungsart || "UNKNOWN"} / ${row.einheit || "EH"}`, example);
        if (source === "none") {
          addBucket(unresolvedPatterns, normalizedPattern(raw), example);
          addBucket(unresolvedUnits, String(row.einheit || "EH"), example);
        }
        const candidate = parametricCandidate(raw, String(row.einheit || ""));
        if (candidate) addBucket(parametricCandidates, candidate, example);
      }
      if (calculationStatus === "needs_review") {
        addBucket(reviewFamilies, `${reason} / ${family}`, example);
      }
    }
  }

  const rank = (buckets: Record<string, { count: number; examples: any[] }>, limit: number) =>
    Object.entries(buckets)
      .sort((left: any, right: any) => right[1].count - left[1].count)
      .slice(0, limit);

  console.log(JSON.stringify({
    schema: "rlc-calculation-pipeline-audit/v1",
    generatedAt: new Date().toISOString(),
    pricePolicy: {
      x84: "benchmark_only",
      legacyDatabase: "diagnostic_only",
      legacyRuleEngine: "diagnostic_only",
    },
    totals: {
      rows,
      textRows,
      blankRows: rows - textRows,
      x84BenchmarkRows: x84Rows,
      resolved,
      zero,
      resolvedPercent: Number((resolved / Math.max(1, textRows) * 100).toFixed(2)),
      zeroPercent: Number((zero / Math.max(1, textRows) * 100).toFixed(2)),
    },
    status,
    sources,
    topZeroFamilies: rank(zeroFamilies, 120),
    topReviewFamilies: rank(reviewFamilies, 120),
    zeroSemanticClusters: rank(semanticClusters, 40),
    zeroUnits: rank(zeroUnits, 40),
    zeroRootCauses: rank(zeroRootCauses, 40),
    zeroResourceStates: rank(zeroResourceStates, 40),
    zeroResourceFamilies: rank(zeroResourceFamilies, 120),
    zeroShortTextClusters: rank(zeroShortTextClusters, 150),
    zeroLongtextDiagnostics: rank(zeroLongtextDiagnostics, 20),
    x84Comparison: { ...x84Comparison, signedMeanPct: Number((x84Comparison.signedSum / Math.max(1,x84Comparison.comparablePositive)).toFixed(2)), meanAbsolutePct: Number((x84Comparison.absoluteSum / Math.max(1,x84Comparison.comparablePositive)).toFixed(2)) },
    x84BelowV2DirectCostByTrade: rank(belowV2DirectCost, 50),
    x84DeviationDistribution: { medianAbsPct: Number((x84DeviationValues.sort((a,b)=>a-b)[Math.floor(x84DeviationValues.length/2)] || 0).toFixed(2)), ...x84Direction },
    partsDataQuality: rank(partsDataQuality, 80),
    comparableDetailRows,
    massMarketReviewRows,
    criticalPartClusters: Object.entries(criticalParts).map(([key,v])=>({key,...v})).sort((a,b)=>b.count-a.count).slice(0,80),
    recipeCalibrationGroups: Object.entries(recipeCalibrationGroups).map(([recipe,g])=>{const ds=g.deviations.sort((a,b)=>a-b); return {recipe,count:g.count,within10:g.within10,above10:g.above10,below10:g.below10,medianSignedPct:Number((ds[Math.floor(ds.length/2)]||0).toFixed(2)),samples:g.samples};}).sort((a,b)=>b.count-a.count).slice(0,180),
    x84FamilyGroups: Object.entries(x84FamilyGroups).map(([name,g]) => ({name,...g,meanAbsPct:Number((g.totalAbsoluteDeviation/g.count).toFixed(2))})).sort((a,b)=>b.count-a.count).slice(0,80),
    unresolvedPatterns: rank(unresolvedPatterns, 120),
    unresolvedUnits: rank(unresolvedUnits, 40),
    parametricRecoveryCandidates: rank(parametricCandidates, 40),
    topZeroPatterns: rank(patterns, 120),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
