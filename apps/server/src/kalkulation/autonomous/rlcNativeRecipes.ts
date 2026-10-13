/**
 * RLC Motor native resource recipes, independent of V2.
 * Deliberately restricted to explicit ex-works supply positions; no installation,
 * freight, surcharges or hidden work scope may be inferred.
 */
import type {RlcAutonomousCalcInput,RlcAutonomousCalcResult} from "./types";
import {composeRlcResourceLines} from "./rlcResourceComposer";
import {diagnoseRlcAsphaltMarketEvidence} from "./rlcMarketEvidence2026";

export function calculateRlcNativeRecipe(row:RlcAutonomousCalcInput):RlcAutonomousCalcResult|null {
  const short=String(row.kurztext||"").trim();
  const long=String(row.langtext||"").trim();
  const combined=(short+" "+long).toLocaleLowerCase("de-DE");
  const unit=String(row.einheit||"").trim().toLowerCase();
  if(!["t","to","tonne"].includes(unit))return null;
  if(!/\b(?:ab\s+werk|frei\s+werk)\b/i.test(combined))return null;
  if(/\b(?:einbauen|verlegen|verdichten|transport|anliefern|frei\s+baustelle|zulage|zuschlag|entsorg|abbruch|ausbauen|vorhalten|aufbringen)\b/i.test(combined))return null;
  if(!/\b(?:liefern|lieferung|verkauf)\b/i.test(combined))return null;
  const evidence=diagnoseRlcAsphaltMarketEvidence(row);
  if(!evidence.material || evidence.materialNetEURPerT===null || !evidence.unitCompatible)return null;
  const lines=composeRlcResourceLines("t",[{
    group:"Material",name:evidence.material+" Asphaltmischgut netto ab Werk",resourceUnit:"t",
    quantityPerGaebUnit:1,netRateEUR:evidence.materialNetEURPerT,
    basis:"Rädlinger 18.05.2026 Materialliste, 1 t je Vertragstonne, Werk und Region zu bestätigen"
  }]);
  const unitPrice=lines[0].total;
  const qty=Number(row.menge);
  const quantity=Number.isFinite(qty)?Math.max(1,qty):1;
  return {
    unitPrice,total:Math.round(unitPrice*quantity*100)/100,
    confidence:0.5,riskLevel:"medium",source:"rlc-motor-native-resources",
    calculationStatus:"warning",trade:"Straßenbau/Asphaltmischgut-ab-Werk",
    bauverfahren:"Materiallieferung ab Werk",leistungsart:"Asphaltmischgut netto ab Werk",
    costLines:lines,
    warnings:["RLC_NATIVE_MARKET_ANCHOR_REGION_UNVERIFIED","RLC_NATIVE_RESOURCE_ASSUMPTIONS_NOT_APPROVED"],
    aiReason:"RLC Motor native: explizite reine Werksabgabe ohne Einbau und Transport; Materialpreis regional zu validieren."
  };
}
