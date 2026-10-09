import type { RlcAutonomousCalcInput } from "./types";

export type WorkComponent = "material" | "labour" | "equipment" | "transport" | "disposal" | "subcontract";
export type WorkOperation = "construct" | "supply" | "install" | "remove" | "dispose" | "test" | "surcharge" | "unknown";
export type TechnicalPosition = {
  operation: WorkOperation;
  object: string;
  dimensions: { dnMm?: number; grain?: string; thicknessCm?: number };
  material?: string;
  unit: string;
  required: WorkComponent[];
  excluded: WorkComponent[];
  confidence: number;
  missing: string[];
  evidence: string[];
  status: "classified" | "needs_review";
};

/** Interpret the principal LV performance from Kurztext, cross-check Langtext.
 * This module NEVER sets an EP. Unknown scope remains explicitly unresolved.
 */
export function decomposeTechnicalPosition(row: RlcAutonomousCalcInput): TechnicalPosition {
  const clean = (v: unknown) => String(v ?? "")
    .replace(/\\'[0-9a-fA-F]{2}/g, " ").replace(/[\u0080-\u009fÿð]/g, " ")
    .normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const short = clean(row.kurztext);
  const long = clean(row.langtext);
  const text = `${short} ${long}`;
  const unit = clean(row.einheit).replace("m³", "m3").replace("m²", "m2");
  const evidence: string[] = [];
  const required = new Set<WorkComponent>();
  const excluded = new Set<WorkComponent>();
  const missing: string[] = [];
  let object = "unknown";
  if (/\b(?:fss|frostschutzschicht)\b/.test(short)) object = "frostschutz_layer";
  else if (/\b(?:plattendruckversuch|lastplattendruck|lastplatte)\b/.test(short)) object = "plate_load_test";
  else if (/\b(?:rohrbogen|bogen\s+pp|pp\s*sn\s*10\s*bogen|pp\s+bogen)\b/.test(short)) object = "pipe_bend";
  else if (/\b(?:schachtanschluss|kanalanschluss)\b/.test(short)) object = "manhole_connection";
  else if (/\b(?:schachtbodenteil|kontrollschacht|einstiegsschacht)\b/.test(short)) object = "manhole_component";
  else if (/\b(?:bodenaushub|boden.*(?:lösen|loesen|ausheben)|grabenaushub)\b/.test(short)) object = "excavation";
  else if (/\b(?:frostschutzkies|kabelsand|splitt|schotter)\b/.test(short)) object = "aggregate";
  // Deterministic technical nouns; never use old RLC trade labels as truth.
  if (object === "unknown") {
    const patterns: Array<[RegExp,string]> = [
      [/\b(?:stundenlohn|stundensatz|baufacharbeiter|bauvorarbeiter|fachwerker|bauhelfer|lohnstunden|regiestunden)\b/,"labour_hour"],
      [/\b(?:hydraulikbagger|raupenbagger|minibagger|radbagger|mobilbagger)\b/,"excavator_hour"],
      [/\b(?:lkw|kipper|lastkraftwagen|dreiachser|vierachser)\b/,"truck_hour"],
      [/\b(?:asphaltoberbau schneiden|asphalt.*(?:schneiden|trennen)|bitumenbelag einschneiden|asphaltschnitt)\b/,"asphalt_cut"],
      [/\b(?:planum herstellen|feinplanie|planie fahrbahn|kiesplanie)\b/,"formation_level"],
      [/\b(?:bordstein|tiefbord|hochbord|randstein|einfassung)\b/,"kerb"],
      [/\b(?:pflastersteine|pflasterfläche|betonpflaster|natursteinpflaster)\b/,"paving"],
      [/\b(?:straßenablauf|strassenablauf|sinkkasten|einlaufkasten)\b/,"road_gully"],
      [/\b(?:rohrleitung|kunststoffrohrl|pp-rohre|kanalrohr|kanalrohre|kg-rohr)\b/,"pipe_line"],
      [/\b(?:rohrbogen|abzweig|überschiebmuffe|ueberschiebmuffe|muffenstopfen|reduzierstück|reduzierstueck|formstück|formstueck)\b/,"pipe_fitting"],
      [/\b(?:schottertragschicht|tragschicht herstellen|frostschutzkies|schüttgut|schuettgut|sand-splitt)\b/,"aggregate_layer"],
      [/\b(?:bodenabtrag|bodenaushub|oberboden abtragen|graben lösen|graben loesen|baugrube ausheben)\b/,"excavation"],
      [/\b(?:boden entsorgen|bodenaushub entsorgen|abfall nicht gefährlich|abfall nicht gefaehrlich|bauschutt entsorgen)\b/,"waste_disposal"],
      [/\b(?:graben verfüllen|graben verfuellen|boden einbauen|verfüllen verdichten|verfuellen verdichten)\b/,"backfill"],
    ];
    for (const [pattern, value] of patterns) if (pattern.test(short)) {object=value;break;}
  }
  if (object !== "unknown") evidence.push(`object:${object}:shorttext`);
  const surcharge = /\b(?:zulage|zuschlag|mehrpreis)\b/.test(short);
  const test = object === "plate_load_test" || /\b(?:dichtheitsprüfung|dichtheitspruefung|druckprüfung)\b/.test(short);
  const remove = /\b(?:ausbauen|rückbauen|rueckbauen|abbrechen|demontieren)\b/.test(short);
  const dispose = /\b(?:entsorgen|deponieren)\b/.test(short);
  const supply = /\b(?:liefern|lieferung|frei bau|frei baustelle)\b/.test(short);
  const install = /\b(?:einbauen|verlegen|montieren|montage|herstellen|setzen|verdichten)\b/.test(short) || /\bfss\s+herstellen\b/.test(short);
  let operation: WorkOperation = surcharge ? "surcharge" : test ? "test" : dispose ? "dispose" : remove ? "remove" : supply && install ? "construct" : install ? "install" : supply ? "supply" : "unknown";
  // Contract nouns encode a clear operation even without a trailing verb.
  if (operation === "unknown" && object === "labour_hour" && ["h","std","stunde"].includes(unit)) operation = "install";
  if (operation === "unknown" && ["excavator_hour","truck_hour"].includes(object) && ["h","std","stunde"].includes(unit)) operation = "install";
  if (operation === "unknown" && object === "asphalt_cut" && /(?:schneiden|trennen|schnitt|einschneiden)/.test(short)) operation = "install";

  if (operation !== "unknown") evidence.push(`operation:${operation}:shorttext`);
  if (operation === "test") {required.add("labour");required.add("equipment");excluded.add("material");}
  if (operation === "supply") {required.add("material");required.add("transport");excluded.add("labour");}
  if (operation === "install" || operation === "construct") {required.add("labour");required.add("equipment");if (!["excavation","asphalt_cut","formation_level","labour_hour","excavator_hour","truck_hour"].includes(object)) required.add("material");if (operation === "construct")required.add("transport");}
  if (object === "labour_hour") {required.clear();required.add("labour");excluded.add("material");excluded.add("equipment");}
  if (object === "excavator_hour" || object === "truck_hour") {required.clear();required.add("equipment");excluded.add("material");}
  if (operation === "remove") {required.add("labour");required.add("equipment");excluded.add("material");}
  if (operation === "dispose") {required.add("transport");required.add("disposal");required.add("equipment");excluded.add("material");}
  if (operation === "surcharge") {required.add("labour");missing.push("reference_base_position_and_incremental_scope");}
  if (/\b(?:bauseits gestellt|vom ag gestellt|nur montage|beigestellt)\b/.test(text)) {required.delete("material");excluded.add("material");evidence.push("owner_supplied_material");}
  // Technical dimensions: never infer from a neighbor or an unrelated mention in Langtext.
  const dn = short.match(/\b(?:dn|da)\s*[/=: -]?\s*(\d{2,4})\b/);
  const grain = short.match(/\b(0\s*\/\s*(?:32|45|56|63))\b/);
  const thickness = short.match(/\b(?:dicke|stärke|staerke|d)\s*[=:]?\s*(\d{1,3})\s*cm\b/);
  const dimensions = { ...(dn ? {dnMm:Number(dn[1])}:{}), ...(grain ? {grain:grain[1].replace(/\s/g, "")}:{}), ...(thickness ? {thicknessCm:Number(thickness[1])}:{}) };
  const material = /\bpp\b/.test(short) ? "PP" : /\bpvc\b/.test(short) ? "PVC" : /\bpe(?:-hd)?\b/.test(short) ? "PE" : /\bbeton\b/.test(short) ? "BETON" : undefined;
  if (object === "unknown") missing.push("main_work_object");
  if (operation === "unknown") missing.push("work_operation");
  if (["pipe_bend","pipe_fitting"].includes(object) && !dimensions.dnMm) missing.push("nominal_diameter");
  if (object === "frostschutz_layer" && !dimensions.grain) missing.push("material_grading");
  if (!unit) missing.push("billing_unit");
  const confidence = Math.max(0,Math.min(1,(object !== "unknown" ? .45 : 0)+(operation !== "unknown" ? .3 : 0)+(unit ? .15 : 0)+(missing.length === 0 ? .1 : 0)));
  return {object,operation,dimensions,material,unit,required:[...required],excluded:[...excluded],confidence,missing,evidence,status:missing.length ? "needs_review" : "classified"};
}
