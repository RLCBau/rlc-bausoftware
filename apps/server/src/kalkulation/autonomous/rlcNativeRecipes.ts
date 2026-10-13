/**
 * RLC Motor native resource recipes, independent of V2.
 * Deliberately restricted to explicit ex-works supply positions; no installation,
 * freight, surcharges or hidden work scope may be inferred.
 */
import type {RlcAutonomousCalcInput,RlcAutonomousCalcResult} from "./types";
import {composeRlcResourceLines} from "./rlcResourceComposer";
import {diagnoseRlcAsphaltMarketEvidence,diagnoseRlcAggregateMarketEvidence} from "./rlcMarketEvidence2026";
import {PERSONNEL_INTERNAL_COST_2026,MACHINE_INTERNAL_COST_2026} from "./tiefbauCostRates2026";

export function calculateRlcNativeRecipe(row:RlcAutonomousCalcInput):RlcAutonomousCalcResult|null {
  const short=String(row.kurztext||"").trim();
  const long=String(row.langtext||"").trim();
  const combined=(short+" "+long).toLocaleLowerCase("de-DE");
  const unit=String(row.einheit||"").trim().toLowerCase();
  if(!["t","to","tonne"].includes(unit))return null;
  // Full-work native route: strict asphalt unit-tonne delivery AND installation.
  // Do not infer quantities from LV text; productive hours below are explicit assumptions.
  const supply=/\b(?:liefern|lieferung)\b/.test(combined);
  const install=/\b(?:einbauen|einbau)\b/.test(combined);
  const excluded=/\b(?:zulage|zuschlag|abbruch|ausbauen|entsorgen|fräsen|fraesen|kleinmenge|handeinbau|provisorisch|reparatur|flicken|vorhalten|wie vor|vorposition)\b/.test(combined);
  const exWorks=/\b(?:ab\s+werk|frei\s+werk)\b/.test(combined);
  if(supply&&install&&!excluded&&!exWorks){
    const asphalt=diagnoseRlcAsphaltMarketEvidence(row);
    if(asphalt.material && asphalt.materialNetEURPerT!==null && asphalt.unitCompatible){
      const lines=composeRlcResourceLines("t",[
        {group:"Material",name:asphalt.material+" Asphaltmischgut ab Werk",resourceUnit:"t",quantityPerGaebUnit:1,netRateEUR:asphalt.materialNetEURPerT,basis:"Rädlinger 2026 Preis je Tonne; Lieferwerk/Region prüfen"},
        {group:"Maschinen",name:"Walze je Tonne",resourceUnit:"h",quantityPerGaebUnit:1/16,netRateEUR:MACHINE_INTERNAL_COST_2026.roller_14t,basis:"Planannahme 16 t/h je Walze; Einbaukolonne/Transport separat"},
        {group:"Lohn",name:"Facharbeiter Asphaltkolonne je Tonne",resourceUnit:"h",quantityPerGaebUnit:2/16,netRateEUR:PERSONNEL_INTERNAL_COST_2026.facharbeiter_lg4,basis:"Planannahme 2 Facharbeiter bei 16 t/h; Personalbedarf projektspezifisch prüfen"}
      ]);
      const ep=Math.round(lines.reduce((sum,line)=>sum+line.total,0)*100)/100;
      const qty=Number(row.menge);
      return {unitPrice:0,total:0,
        confidence:0.35,riskLevel:"high",source:"rlc-motor-native-resources",
        calculationStatus:"needs_review",trade:"Straßenbau/Asphalt-Einbau-nativ",
        bauverfahren:"Asphalt liefern und einbauen",leistungsart:asphalt.material+" liefern und einbauen",
        costLines:lines,warnings:["RLC_NATIVE_PROVISIONAL_PRODUCTIVITY","RLC_NATIVE_LOGISTICS_AND_PAVER_NOT_PRICED","RLC_NATIVE_COST_SCOPE_INCOMPLETE"],
        aiReason:"Native Urkalkulation Teilkomponenten (unfreigegebener Zwischenwert "+ep+" EUR/t); Fracht, Fertiger und Baustellenleistung nicht nachgewiesen. EP/GP gesperrt."};
    }
  }
  if(!/\b(?:ab\s+werk|frei\s+werk)\b/i.test(combined))return null;
  if(/\b(?:einbauen|verlegen|verdichten|transport|anliefern|frei\s+baustelle|zulage|zuschlag|entsorg|abbruch|ausbauen|vorhalten|aufbringen)\b/i.test(combined))return null;
  if(!/\b(?:liefern|lieferung|verkauf)\b/i.test(combined))return null;
  const asphalt=diagnoseRlcAsphaltMarketEvidence(row);
  const aggregate=diagnoseRlcAggregateMarketEvidence(row);
  // Never silently price two different grades/material groups in the same position.
  if(asphalt.material && aggregate.material)return null;
  const material=asphalt.material ?? aggregate.material;
  const price=asphalt.material?asphalt.materialNetEURPerT:aggregate.materialNetEURPerT;
  if(!material || price===null || !Number.isFinite(price))return null;
  const lines=composeRlcResourceLines("t",[{
    group:"Material",name:material+" netto ab Werk",resourceUnit:"t",
    quantityPerGaebUnit:1,netRateEUR:price,
    basis:asphalt.material?"Rädlinger 18.05.2026 Materialliste, 1 t je Vertragstonne, Werk und Region zu bestätigen":
      "Glück Kies Preisliste 2026, 1 t je Vertragstonne, Werk und Region zu bestätigen"
  }]);
  const unitPrice=lines[0].total;
  const qty=Number(row.menge);
  const quantity=Number.isFinite(qty)?Math.max(1,qty):1;
  return {
    unitPrice,total:Math.round(unitPrice*quantity*100)/100,
    confidence:0.5,riskLevel:"medium",source:"rlc-motor-native-resources",
    calculationStatus:"warning",trade:asphalt.material?"Straßenbau/Asphaltmischgut-ab-Werk":"Erdbau/Gesteinskörnung-ab-Werk",
    bauverfahren:"Materiallieferung ab Werk",leistungsart:material+" netto ab Werk",
    costLines:lines,
    warnings:["RLC_NATIVE_MARKET_ANCHOR_REGION_UNVERIFIED","RLC_NATIVE_RESOURCE_ASSUMPTIONS_NOT_APPROVED"],
    aiReason:"RLC Motor native: explizite reine Werksabgabe ohne Einbau und Transport; Materialpreis regional zu validieren."
  };
}
