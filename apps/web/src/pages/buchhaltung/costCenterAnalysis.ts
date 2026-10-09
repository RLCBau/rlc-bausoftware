export type CostSource={available:boolean;items:any[];error?:string};
export const costCenterKey=(v:unknown)=>String(v??"").trim()||"OHNE-KOSTENSTELLE";
export function cents(v:any):bigint{
 if(typeof v!=="number"&&typeof v!=="string")throw new Error("Ungültiger Betrag in Quelldaten.");
 const s=String(v).trim().replace(",",".");if(!/^-?\d{1,16}(?:\.\d{1,2})?$/.test(s))throw new Error("Betrag mit mehr als zwei Nachkommastellen oder ungültigem Format.");
 const negative=s.startsWith("-"),[whole,part=""]=(negative?s.slice(1):s).split(".");const n=BigInt(whole)*100n+BigInt(part.padEnd(2,"0"));return negative?-n:n;
}
export function euroCents(v:bigint|null){if(v===null)return "–";const a=v<0n?-v:v;return (v<0n?"-":"")+(a/100n).toLocaleString("de-DE")+","+(a%100n).toString().padStart(2,"0")+" €";}
export function csvCell(v:any){const s=String(v??"");return '"'+(/^\s*[=+\-@]|^[\t\r\n]/.test(s)?"'":"")+s.replace(/"/g,'""')+'"';}
export function analyzeCostCenters(masters:CostSource,bills:CostSource,labor:CostSource,machines:CostSource){
 const map=new Map<string,any>();
 const ensure=(v:any)=>{const code=costCenterKey(v);if(!map.has(code))map.set(code,{id:"",code,description:code==="OHNE-KOSTENSTELLE"?"Noch nicht zugeordnet":"Aus Kosten erkannt",mainArea:"Automatisch",budget:0n,active:true,supplier:0n,labor:0n,machines:0n});return map.get(code);};
 for(const m of masters.items){const row=ensure(m.code);Object.assign(row,{...m,budget:cents(m.budgetText??m.budget),supplier:0n,labor:0n,machines:0n});}
 let billCount=0,draftCount=0;
 for(const b of bills.items){if(String(b.status).toLowerCase()!=="booked"){draftCount++;continue;}ensure(b.data?.costCenter).supplier+=cents(b.netAmount);billCount++;}
 for(const l of labor.items){if(!["number","string"].includes(typeof l.personnelCost)||String(l.personnelCost).trim()===""||!Number.isFinite(Number(l.personnelCost)))throw new Error("Personalkosten in Quelldaten ungültig.");ensure(l.costCenter||l.kostenstelle).labor+=cents(Number(l.personnelCost).toFixed(2));}
 for(const m of machines.items)ensure(m.costCenter||m.kostenstelle).machines+=cents(m.amount);
 const rows=[...map.values()].map(r=>{if(!masters.available)r.budget=null;if(!bills.available)r.supplier=null;if(!labor.available)r.labor=null;if(!machines.available)r.machines=null;const actual=[r.supplier,r.labor,r.machines].every(x=>x!==null)?r.supplier+r.labor+r.machines:null;return {...r,actual,variance:r.budget!==null&&actual!==null?r.budget-actual:null};}).sort((a,b)=>a.code.localeCompare(b.code));
 return {rows,billCount,draftCount};
}
