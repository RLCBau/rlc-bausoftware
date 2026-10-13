/**
 * Shared resource arithmetic for RLC Motor's Urkalkulation.
 * Does not select families, infer production rates or approve prices.
 */
import type {RlcAutonomousCostLine} from "./types";
export type RlcResourceComponent = {
  group:RlcAutonomousCostLine["group"];
  name:string;
  resourceUnit:"t"|"m3"|"m2"|"m"|"h"|"st";
  quantityPerGaebUnit:number;
  netRateEUR:number;
  basis:string;
  note?:string;
};
const money=(v:number)=>Math.round((v+Number.EPSILON)*100)/100;
export function composeRlcResourceLines(
  gaebUnit:string,
  components:ReadonlyArray<RlcResourceComponent>
):RlcAutonomousCostLine[]{
  return components.map((c,i)=>{
    if(!Number.isFinite(c.quantityPerGaebUnit)||c.quantityPerGaebUnit<=0)throw new Error("RLC_RESOURCE_INVALID_CONSUMPTION");
    if(!Number.isFinite(c.netRateEUR)||c.netRateEUR<=0)throw new Error("RLC_RESOURCE_INVALID_RATE");
    if(!c.basis.trim())throw new Error("RLC_RESOURCE_MISSING_BASIS");
    const unitPrice=money(c.quantityPerGaebUnit*c.netRateEUR);
    if(unitPrice<=0)throw new Error("RLC_RESOURCE_TOO_SMALL_TO_PRICE");
    return {
      id:`resource-${i+1}`,group:c.group,name:c.name,qty:1,unit:gaebUnit,
      unitPrice,total:unitPrice,note:c.note,
      consumption:{
        status:"recipe_assumption",resourceQtyPerGaebUnit:c.quantityPerGaebUnit,
        resourceUnit:c.resourceUnit,resourceRateEUR:c.netRateEUR,basis:c.basis
      }
    };
  });
}
