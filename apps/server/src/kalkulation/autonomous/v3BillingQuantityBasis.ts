/** GAEB billing-unit basis is usable even when no layer thickness can be inferred. It is NOT a resource recipe or EP. */
export function determineBillingBasis(unit:string,quantity:unknown){
 const normalized=unit.trim().toLowerCase().replace(/³/g,'3').replace(/²/g,'2').replace(/\.$/,'');
 const family:Record<string,string>={m:'length',lfdm:'length',lfm:'length',cm:'length',m2:'area',qm:'area',m3:'volume',t:'mass',to:'mass',kg:'mass',st:'count',stk:'count',stck:'count',d:'time',h:'time',std:'time',wo:'time',psch:'lump_sum'};
 const basis=family[normalized]||null;
 const q=typeof quantity==='number'?quantity:typeof quantity==='string'&&quantity.trim()?Number(quantity.replace(',','.')):NaN;
 const valid=basis!==null&&Number.isFinite(q)&&q>0;
 return {unit,basis,contractQuantity:valid?q:null,contractQuantityUsable:valid,resourceQuantityKnown:false,resourceQuantitySource:null,productionWriteAllowed:false,epEUR:null,missing:valid?['technical_resource_decomposition','approved_productivity','approved_unit_costs']:['billing_unit_or_positive_quantity_missing']};
}
