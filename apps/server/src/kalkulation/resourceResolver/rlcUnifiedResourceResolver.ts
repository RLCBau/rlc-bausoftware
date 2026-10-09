import {
  findRlcPreisItems,
} from "../rlcPreisBibliothek";

export type UnifiedResourceResult = {
  refKey: string;
  price: number;
  unit: string;
  source:
    | "COMPANY"
    | "RLC_TIEFBAU_CATALOG"
    | "UNRESOLVED";
  name: string;
};


function n(v:any){
  const x = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

function s(v:any){
  return String(v ?? "").trim();
}


export function resolveRlcUnifiedResource(params:{
  refKey:string;
  text:string;
  unit:string;
  allowTiefbauLibrary:boolean;
}): UnifiedResourceResult {

  const {
    refKey,
    text,
    unit,
    allowTiefbauLibrary
  } = params;


  /*
   * Company Preise werden vorher aufgelöst.
   * Dieser Resolver übernimmt nur Bibliothek/Fallback.
   */


  /*
   * Tiefbau Library nur für explizite RLC_PREIS Referenzen.
   * Keine automatische Positionssuche für Ressourcen.
   * Sonst werden z.B. Labor/Maschinen mit LV-Preisen verwechselt.
   */
  if (
    allowTiefbauLibrary &&
    refKey.toUpperCase().startsWith("RLC_PREIS:")
  ) {

    const matches = findRlcPreisItems({
      text:`${text} ${refKey}`,
      unit,
      group: "Material",
      limit:1,
      // A resource price is valid only if it is an external list price or a
      // company calibration. Family-derived and legacy values are not sources.
      documentedOnly:true,
    });

    if(matches[0]){

      return {
        refKey,
        price:n(matches[0].avgPrice),
        unit:matches[0].unit,
        source:"RLC_TIEFBAU_CATALOG",
        name:matches[0].name
      };

    }
  }


  return {
    refKey,
    price:0,
    unit:unit || "EH",
    source:"UNRESOLVED",
    name:refKey
  };

}
