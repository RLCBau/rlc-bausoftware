/** Contract scope completeness for native resource recipes.
 * Pricing inputs are never inferred from X84 or historical EP.
 */
import type {RlcAutonomousCostLine} from "./types";
export type NativeScope = "asphalt_layer"|"material_ex_works";
const REQUIRED:Record<NativeScope,readonly string[]>={
  asphalt_layer:["material","fracht","fertiger","walze","lohn","baustellenlogistik"],
  material_ex_works:["material"]
};
export function checkRlcNativeScope(scope:NativeScope,covered:readonly string[],lines:readonly RlcAutonomousCostLine[]){
  // A declared coverage flag is insufficient: every scope component needs
  // an actual physical cost line bearing the same resource tag.
  const present=new Set(covered);
  const lineTags=new Set(lines.flatMap(line=>{
    const note=String(line.note||"");
    return [...note.matchAll(/\[RLC_SCOPE:([a-z_]+)\]/g)].map(match=>match[1]);
  }));
  const missing=REQUIRED[scope].filter(key=>!present.has(key)||!lineTags.has(key));
  const invalid=lines.filter(l=>!l.consumption||
    !(Number(l.consumption.resourceQtyPerGaebUnit)>0)||
    !(Number(l.consumption.resourceRateEUR)>0)||
    !String(l.consumption.basis||"").trim()).map(l=>l.name);
  // Documented quantities can still be assumptions. Completeness is not economic approval.
  return {complete:missing.length===0 && invalid.length===0,missing,invalid,
    economicallyApproved:false as const};
}
