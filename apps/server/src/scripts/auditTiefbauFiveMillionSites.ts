import { calculateAutonomousUrkalkulation } from "../kalkulation/autonomous/autonomousUrkalkulationEngine";
import { TIEFBAU_COVERAGE_CASES } from "../kalkulation/autonomous/tiefbauCoverageCases";

type Pos = { text: string; unit: string; qty: number };
type Site = { id: string; name: string; positions: Pos[] };

const ctx: any = {
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

const generic = new Set([
  "Kanalbauleistung","Wasserleitungsbau","Oberflächenwiederherstellung","Oberflächenbau",
  "Erdbau/Schüttgut","Sonderbauverfahren","Grabenloser Leitungsbau","Sicherungsleistung",
  "Dokumentationsleistung","Entsorgungsleistung","Prüfleistung","Logistikleistung",
  "Gasleitungsbau","Fernwärmebau","Glasfaser-Kabelbau","Kabelbau","Leitungskreuzung",
]);

function q(unit: string): number {
  const u = unit.toLowerCase();
  if (u === "m" || u === "lfm") return 900;
  if (u === "m²" || u === "m2") return 1800;
  if (u === "m³" || u === "m3" || u === "cbm") return 1200;
  if (u === "t" || u === "to") return 850;
  if (u === "kg") return 12000;
  if (u === "h" || u === "std") return 180;
  if (u === "tag" || u === "d") return 45;
  if (u === "wo" || u === "woche") return 8;
  if (u === "monat") return 3;
  if (u === "st" || u === "stck" || u === "stk") return 18;
  if (u === "cm") return 200;
  if (u === "psch" || u === "pausch") return 1;
  return 10;
}

function siteIndex(textRaw: string): number {
  const t = textRaw.toLowerCase();

  if (/baugrube|spundwand|trägerbohl|traegerbohl|bohrpfahl|schlitzwand|spritzbeton|nagelwand|mikropf|verpressanker|verankerung|wasserhaltung|wellpoint|filterbrunnen|grundwasserabsenk|kampfmittel|bewehrte erde/.test(t)) return 0;
  if (/asphalt|fahrbahn|frostschutz|schottertragschicht|planum|tok-band|markierung|regelplan|verkehrssicherung|lichtsignalanlage|gleitwand|fräsen|fraesen/.test(t)) return 1;
  if (/kanalrohr|kanal |abwasser|regenwasser|hausanschluss.*kanal|tv.inspektion|dichtheitsprüfung kanal|dichtheitspruefung kanal|schlauchliner|inliner|kanalrenov/.test(t)) return 2;
  if (/schacht|straßenablauf|strassenablauf|entwässerungsrinne|entwaesserungsrinne|schlitzrinne|pumpwerk|pumpenschacht|armaturenschacht/.test(t)) return 3;
  if (/trinkwasser|wasserleitung|hydrant|absperrschieber|ggg|gasleitung|gas |fernwärme|fernwaerme|kmr/.test(t)) return 4;
  if (/bayernwerk|nayy|nay2y|na2yy|na2xy|na2xs|mittelspannung|niederspannung|telekom|vodafone|lwl|speedpipe|mikro|kabelschutzrohr|kabelzug|trafostation/.test(t)) return 5;
  if (/pflaster|bord|leistenstein|hochbord|tiefbord|rundbord|tastbord|busbord|rinnenstein|muldenstein|außenanlage|aussenanlage|plattenbelag|treppe|mauerwinkel/.test(t)) return 6;
  if (/landschaft|rasen|pflanz|baum|wurzel|rodung|hecke|böschung|boeschung|sicker|rigole|versicker|drän|draen|wasserbausteine|ufer|gabion|regenrückhalte|regenrueckhalte/.test(t)) return 7;
  if (/rückbau|rueckbau|ausbauen|außer betrieb|ausser betrieb|provisor|umlegen|unterfangen|freilegen und sichern|wiederverlegen|wieder setzen|abbruch/.test(t)) return 8;
  return 9;
}

const names = [
  "Baugrube / Spezialtiefbau",
  "Straßenbau komplett",
  "Kanalbau komplett",
  "Schächte / Pumpwerke / Entwässerungsbauwerke",
  "Wasser / Gas / Fernwärme",
  "Bayernwerk / Telekom / Vodafone",
  "Außenanlagen / Pflaster / Borde",
  "Landschaftsbau / Versickerung / Wasserbau",
  "Rückbau / Provisorien / Bestand",
  "Mega-Mischbaustelle Tiefbau"
];

const sites: Site[] = names.map((name, i) => ({
  id: "SITE5M-" + String(i + 1).padStart(2, "0"),
  name,
  positions: [],
}));

for (const c of TIEFBAU_COVERAGE_CASES) {
  sites[siteIndex(c.text)].positions.push({ text: c.text, unit: c.unit, qty: q(c.unit) });
}

// Explicit infiltration / stormwater package requested for large real projects.
const infil: Pos[] = [
  { text: "Sickergrube 5 m³ herstellen mit Kiesfüllung und Geotextil", unit: "St", qty: 12 },
  { text: "Sickergrube 10 m³ herstellen mit Kiesfüllung und Geotextil", unit: "St", qty: 8 },
  { text: "Sickerschacht DN1000 3,00 m tief liefern und setzen", unit: "St", qty: 18 },
  { text: "Sickerschacht DN1500 4,00 m tief liefern und setzen", unit: "St", qty: 10 },
  { text: "Versickerungsrigole 0,80 x 1,00 m Kies 16/32 mit Geotextil herstellen", unit: "m", qty: 900 },
  { text: "Rigolenkörper Kunststoff 300 l/m² liefern und einbauen", unit: "m³", qty: 650 },
  { text: "Versickerungsmulde 30 cm Oberboden herstellen", unit: "m²", qty: 2400 },
  { text: "Mulden-Rigolen-System herstellen", unit: "m", qty: 750 },
  { text: "Dränrohr DN100 gelocht mit Filterkies und Vlies verlegen", unit: "m", qty: 1600 },
  { text: "Dränrohr DN150 gelocht mit Filterkies und Vlies verlegen", unit: "m", qty: 1000 },
  { text: "Regenrückhaltebecken Erdbecken herstellen", unit: "m³", qty: 4200 },
  { text: "Drosselschacht Regenrückhaltebecken DN1500 herstellen", unit: "St", qty: 4 },
  { text: "Notüberlauf Regenrückhaltebecken herstellen", unit: "St", qty: 4 },
  { text: "Überflutungsfläche modellieren und Oberboden ansäen", unit: "m²", qty: 3500 },
  { text: "Versickerungsfähiges Pflaster 8 cm mit Dränbettung herstellen", unit: "m²", qty: 4200 },
  { text: "Bodenaustausch unter Versickerungsanlage mit Kies 0/32 herstellen", unit: "m³", qty: 1400 },
];
sites[7].positions.push(...infil);

// Normalize every synthetic project to approximately EUR 5 million.
const TARGET = 5_000_000;
const TOLERANCE = 0.03;

function evaluate(site: Site) {
  let total = 0;
  const failures: string[] = [];
  let zero = 0;
  let mismatch = 0;
  for (let i = 0; i < site.positions.length; i++) {
    const x = site.positions[i];
    const row: any = {
      posNr: site.id + "." + String(i + 1).padStart(4, "0"),
      kurztext: x.text,
      langtext: x.text,
      einheit: x.unit,
      menge: x.qty,
    };
    const r: any = calculateAutonomousUrkalkulation(row, ctx, [row]);
    if (!r || generic.has(r.leistungsart || "")) failures.push(row.posNr + "|" + x.text + "|" + (r?.leistungsart || "NULL"));
    const ep = Number(r?.unitPrice || 0);
    if (!(ep > 0)) zero++;
    const pb = (r?.costLines || []).reduce((s: number, l: any) => s + Number(l.unitPrice || 0), 0);
    if (ep > 0 && Math.abs(pb * 1.23 - ep) > 0.20 && Math.abs(pb - ep) > 0.20) mismatch++;
    total += ep * x.qty;
  }
  return { total, failures, zero, mismatch };
}

for (const site of sites) {
  let r = evaluate(site);
  if (r.total > 0) {
    const factor = TARGET / r.total;
    for (const x of site.positions) {
      const u = x.unit.toLowerCase();
      const discrete = ["st","stck","stk","tag","d","wo","woche","monat","psch","pausch"].includes(u);
      const scaled = x.qty * factor;
      x.qty = discrete ? Math.max(1, Math.round(scaled)) : Math.max(0.01, Math.round(scaled * 100) / 100);
    }
    r = evaluate(site);
  }
  const deltaPct = r.total > 0 ? ((r.total - TARGET) / TARGET) * 100 : -100;
  console.log([
    "SITE5M", site.id, site.name,
    "POSITIONS=" + site.positions.length,
    "TOTAL=" + r.total.toFixed(2),
    "DELTA_PCT=" + deltaPct.toFixed(2),
    "FAIL=" + r.failures.length,
    "ZERO=" + r.zero,
    "MISMATCH=" + r.mismatch,
  ].join("|"));
  for (const f of r.failures.slice(0, 100)) console.error("SITE5M_GAP|" + site.id + "|" + f);
  if (Math.abs(deltaPct) > TOLERANCE * 100) console.error("SITE5M_TARGET_MISS|" + site.id + "|" + deltaPct.toFixed(2));
}

const totalPositions = sites.reduce((s, x) => s + x.positions.length, 0);
console.log("SITE5M_SUITE|SITES=" + sites.length + "|POSITIONS=" + totalPositions + "|TARGET_EACH=5000000");
