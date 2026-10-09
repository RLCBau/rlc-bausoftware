/** Pure geometric takeoff from explicitly written GAEB dimensions; never a quoted EP. */
export function gaebGeometricTakeoff(kind:'pipe'|'trench'|'asphalt',shortText:string,longText:string,unit:string){
 const text=(shortText+' '+longText).toLowerCase().replace(/,/g,'.');
 const missing:string[]=[];const dimensions:Record<string,number>={};
 const capture=(name:string,pattern:RegExp,scale=1)=>{const match=text.match(pattern);if(match){const value=Number(match[1])*scale;if(Number.isFinite(value)&&value>0)dimensions[name]=value;else missing.push('invalid_'+name);}else missing.push('missing_'+name);};
 if(kind==='pipe')capture('nominalDiameterMM',/\bdn\s*(\d{2,4})\b/);
 if(kind==='trench'){
  capture('widthM',/(?:grabenbreite|sohlbreite|\bbreite\b|\bb\s*=)\s*:?\s*(\d+(?:\.\d+)?)\s*m\b/);
  capture('depthM',/(?:grabentiefe|\btiefe\b|\bt\s*=)\s*:?\s*(\d+(?:\.\d+)?)\s*m\b/);
 }
 if(kind==='asphalt')capture('thicknessM',/(?:schichtdicke|einbaudicke|\bdicke\b)\s*:?\s*(\d+(?:\.\d+)?)\s*cm\b/,0.01);
 let quantityPerBillingUnit:number|null=null;let quantityUnit:string|null=null;
 if(kind==='trench'&&['m','lfm'].includes(unit.toLowerCase())&&dimensions.widthM&&dimensions.depthM){quantityPerBillingUnit=dimensions.widthM*dimensions.depthM;quantityUnit='m3/m';}
 if(kind==='asphalt'&&['m2','m²'].includes(unit.toLowerCase())&&dimensions.thicknessM){quantityPerBillingUnit=dimensions.thicknessM;quantityUnit='m3/m2';}
 if(kind==='pipe'&&['m','lfm'].includes(unit.toLowerCase())&&dimensions.nominalDiameterMM){quantityPerBillingUnit=1;quantityUnit='m/m';}
 if(quantityPerBillingUnit===null)missing.push('billing_unit_or_geometry_unresolved');
 return {kind,dimensions,quantityPerBillingUnit,quantityUnit,missing,status:'needs_review' as const,approvedForEP:false,unitPriceEUR:null};
}
