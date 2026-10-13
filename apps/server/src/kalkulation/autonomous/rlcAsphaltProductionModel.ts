/**
 * Native asphalt production model. Inputs are project-specific measured/quoted
 * parameters, never extrapolated from X84 or historical EP.
 * No automatic price if any required parameter is missing.
 */
import {composeRlcResourceLines} from "./rlcResourceComposer";
import {checkRlcNativeScope} from "./rlcNativeScopeGate";
export type AsphaltProjectResources={
  mixRateEURPerT:number;
  compactedDensityTPerM3:number;
  compactedThicknessM:number;
  freightEURPerT:number;
  paverEURPerHour:number;
  rollerEURPerHour:number;
  workerEURPerHour:number;
  asphaltTonnesPerHour:number;
  workers:number;
  siteLogisticsEURPerM2:number;
  basis:Record<"material"|"density"|"thickness"|"fracht"|"fertiger"|"walze"|"lohn"|"baustellenlogistik"|"productivity",string>;
};
export function calculateCompleteAsphaltLayerM2(input:AsphaltProjectResources){
  const b=input.basis;
  const values=[
    input.mixRateEURPerT,input.compactedDensityTPerM3,input.compactedThicknessM,
    input.freightEURPerT,input.paverEURPerHour,input.rollerEURPerHour,
    input.workerEURPerHour,input.asphaltTonnesPerHour,input.workers,
    input.siteLogisticsEURPerM2
  ];
  if(values.some(v=>!Number.isFinite(v)||v<=0))throw Error("RLC_ASPHALT_PROJECT_RESOURCES_INCOMPLETE");
  if(input.compactedThicknessM>0.5||input.compactedDensityTPerM3>3.5||input.workers>30)throw Error("RLC_ASPHALT_PARAMETERS_OUT_OF_RANGE");
  if(Object.values(b).some(v=>!String(v||"").trim()))throw Error("RLC_ASPHALT_MISSING_SOURCE_BASIS");
  const tonnes=input.compactedThicknessM*input.compactedDensityTPerM3;
  const hourPerM2=tonnes/input.asphaltTonnesPerHour;
  const lines=composeRlcResourceLines("m2",[
    {group:"Material",name:"Asphaltmischgut",resourceUnit:"t",quantityPerGaebUnit:tonnes,netRateEUR:input.mixRateEURPerT,basis:b.material+"; "+b.density+"; "+b.thickness,note:"[RLC_SCOPE:material]"},
    {group:"Nachunternehmer",name:"Asphaltfracht",resourceUnit:"t",quantityPerGaebUnit:tonnes,netRateEUR:input.freightEURPerT,basis:b.fracht,note:"[RLC_SCOPE:fracht]"},
    {group:"Maschinen",name:"Asphaltfertiger",resourceUnit:"h",quantityPerGaebUnit:hourPerM2,netRateEUR:input.paverEURPerHour,basis:b.fertiger+"; "+b.productivity,note:"[RLC_SCOPE:fertiger]"},
    {group:"Maschinen",name:"Asphaltwalze",resourceUnit:"h",quantityPerGaebUnit:hourPerM2,netRateEUR:input.rollerEURPerHour,basis:b.walze+"; "+b.productivity,note:"[RLC_SCOPE:walze]"},
    {group:"Lohn",name:"Asphaltkolonne",resourceUnit:"h",quantityPerGaebUnit:hourPerM2*input.workers,netRateEUR:input.workerEURPerHour,basis:b.lohn+"; "+b.productivity,note:"[RLC_SCOPE:lohn]"},
    {group:"Gemeinkosten",name:"Baustellenlogistik",resourceUnit:"m2",quantityPerGaebUnit:1,netRateEUR:input.siteLogisticsEURPerM2,basis:b.baustellenlogistik,note:"[RLC_SCOPE:baustellenlogistik]"}
  ]);
  const scope=checkRlcNativeScope("asphalt_layer",["material","fracht","fertiger","walze","lohn","baustellenlogistik"],lines);
  if(!scope.complete)throw Error("RLC_ASPHALT_SCOPE_INCOMPLETE");
  return {lines,unitPrice:Math.round(lines.reduce((sum,line)=>sum+line.total,0)*100)/100,
    economicallyApproved:false as const,physicalTonnesPerM2:tonnes};
}
