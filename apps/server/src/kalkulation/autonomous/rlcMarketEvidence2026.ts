/**
 * Independent market price evidence. These are material-only net factory prices.
 * Not suitable as installed GAEB EP, production overrides or X84 truth.
 */
export const RLC_MARKET_SOURCES_2026 = {
  raedlingerAsphalt: {
    url: "https://www.raedlinger.com/documents/medien/preislisten/asphalt/preisliste-asphaltmischgut-raedlinger-asphaltbau-2026.pdf",
    validFrom: "2026-05-18",
    type: "manufacturer_net_ex_works" as const,
    unit: "t" as const,
  }
};
export const RLC_ASPHALT_EX_WORKS_2026: Record<string, number> = {
  "AC 16 T": 103.10,
  "AC 22 T": 102.20,
  "AC 32 T": 102.20,
  "AC 16 B": 128.70,
  "AC 22 B": 130.90,
  "AC 11 D N": 145,
  "AC 11 D S": 140.90,
  "AC 16 T D": 133.50,
};
export type MarketEvidenceDiagnosis = {
  material: string | null;
  materialNetEURPerT: number | null;
  sourceUrl: string | null;
  unitCompatible: boolean;
  contractScopeComparable: false;
  reason: string;
};
export function diagnoseRlcAsphaltMarketEvidence(input: { kurztext?: string; langtext?: string; einheit?: string }): MarketEvidenceDiagnosis {
  const text = [input.kurztext,input.langtext].filter(Boolean).join(" ").replace(/\s+/g," ").toUpperCase();
  // Sort longest first so AC 16 T D cannot incorrectly match AC 16 T.
  const keys = Object.keys(RLC_ASPHALT_EX_WORKS_2026).sort((a,b)=>b.length-a.length);
  const matched = keys.filter(k => new RegExp("(^|[^A-Z0-9])"+k.replace(/ /g,"\\s*")+"(?![A-Z0-9])","i").test(text));
  // A long grade such as AC 16 T D legitimately contains AC 16 T.
  // Keep the longest exact grade; reject distinct grades in the same LV.
  const material = matched.length && matched.every(k => matched[0] === k || matched[0].startsWith(k + " "))
    ? matched[0] : null;
  const normalizedUnit = String(input.einheit||"").toLowerCase().trim().replace(/\.$/,"");
  const unitCompatible = ["t","to","ton","tonne"].includes(normalizedUnit);
  return {
    material, materialNetEURPerT:material?RLC_ASPHALT_EX_WORKS_2026[material]:null,
    sourceUrl:material?RLC_MARKET_SOURCES_2026.raedlingerAsphalt.url:null,
    unitCompatible,
    contractScopeComparable:false,
    reason: matched.length > 1 && !material ? "ambiguous_material_grade"
      : !material ? "exact_material_grade_missing"
      : !unitCompatible ? "gaeb_unit_not_factory_ton"
      : "material_price_only_scope_and_logistics_unverified",
  };
}

/** Verifiable net ex-works material anchors, not installed GAEB unit prices. */
export const RLC_AGGREGATES_EX_WORKS_2026 = {
  source: "https://www.glueck-kies.de/kies-sand-hartsteinsplitt/preise.php",
  validFrom: "2026-04-01",
  pricesEURPerT: {
    "Betonsand 0/4": 24.90,
    "Kabelsand 0/4": 21.40,
    "Feinsand 0/1": 16.90,
    "Frostschutzkies 0/32": 20.00,
    "Bettungsmaterial 0/5": 26.90,
  },
} as const;

export function diagnoseRlcAggregateMarketEvidence(input:{kurztext?:string;langtext?:string;einheit?:string}) {
 const text=[input.kurztext,input.langtext].filter(Boolean).join(" ").toLowerCase();
 const candidates=[
  {name:"Kabelsand 0/4",regex:/\bkabelsand\b[^\n]{0,25}(?:0\s*\/\s*4)?/i},
  {name:"Betonsand 0/4",regex:/\bbetonsand\b[^\n]{0,25}(?:0\s*\/\s*4)?/i},
  {name:"Frostschutzkies 0/32",regex:/\bfrostschutzkies\b[^\n]{0,25}0\s*\/\s*32/i},
  {name:"Bettungsmaterial 0/5",regex:/\bbettungsmaterial\b[^\n]{0,25}0\s*\/\s*5(?!\d)/i},
  {name:"Feinsand 0/1",regex:/\bfeinsand\b[^\n]{0,25}0\s*\/\s*1(?!\d)/i},
 ].filter(c=>c.regex.test(text));
 const name=candidates.length===1?candidates[0].name:null;
 const unitCompatible=/^(t|to|ton|tonne)$/i.test(String(input.einheit||"").trim());
 return {
  material:name,
  materialNetEURPerT:name?RLC_AGGREGATES_EX_WORKS_2026.pricesEURPerT[name as keyof typeof RLC_AGGREGATES_EX_WORKS_2026.pricesEURPerT]:null,
  sourceUrl:name?RLC_AGGREGATES_EX_WORKS_2026.source:null,
  unitCompatible,
  contractScopeComparable:false as const,
  reason: candidates.length>1?"ambiguous_material":!name?"specific_material_missing":!unitCompatible?"gaeb_unit_not_factory_ton":"transport_installation_and_scope_unverified"
 };
}
