/** Contract geometry ranges; neither quantities nor prices are inferred when dimensions are missing. */
export function extractGaebRange(text:string,unit:string){
 const s=text.toLowerCase().replace(/,/g,'.').replace(/width:\d+pt/g,' ');
 const parse=(patterns:RegExp[])=>{for(const re of patterns){const m=s.match(re);if(m){const a=Number(m[1]),b=m[3]?Number(m[2]):a,scale=(m[3]||m[2])==='cm'?0.01:1;if(a>0&&b>=a)return [a*scale,b*scale] as [number,number];}}return null;};
 const thickness=parse([/(?:bettungsdicke|schichtdicke)\s*:?\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(cm|m)\b/,/(?:bettungsdicke|schichtdicke)\s*:?\s*(\d+(?:\.\d+)?)\s*(cm|m)\b/]);
 const width=parse([/(?:grabenbreite|sohlbreite)\s*:?\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(cm|m)\b/,/(?:grabenbreite|sohlbreite)\s*:?\s*(\d+(?:\.\d+)?)\s*(m)\b/]);
 const depth=parse([/(?:grabentiefe|\btiefe)\s*(?:über|von)?\s*(\d+(?:\.\d+)?)\s*(?:bis|[-–])\s*(\d+(?:\.\d+)?)\s*(m)\b/]);
 const u=unit.toLowerCase();const area=u==='m2'||u==='m²';const linear=u==='m'||u==='lfm';
 const layer=area&&thickness?thickness:null;
 const trench=linear&&width&&depth?[width[0]*depth[0],width[1]*depth[1]]:null;
 return {thicknessM:thickness,widthM:width,depthM:depth,layerM3PerM2:layer,trenchM3PerM:trench,status:'needs_review' as const,approvedForEP:false};
}
