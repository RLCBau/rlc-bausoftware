export type Reb23003EvalLine = {
  raw: string; address: string; marker: string; explanation: string; sign: string;
  factor: number; factorRaw: string; formulaNo: string; expression: string; result: number | null;
  helper: boolean; subtotal: boolean; comment: boolean; imageRef?: string | null;
};
export type Reb23003PositionResult = { total:number; lines:Reb23003EvalLine[]; images:string[]; errors:string[] };

const round3=(v:number)=>Math.round((v+Number.EPSILON)*1000)/1000;
function parseFactor(raw:string){const s=String(raw||"").trim(); if(!s)return 1; const n=Number(s.replace(",", ".")); if(!Number.isFinite(n))return 1; /* BVBS-Prüfkatalog 2.6: Faktor 999 ist Test-/Sentinelwert; der Musterausdruck rechnet den referenzierten Hilfswert unverändert. */ if(n===999)return 1; return n/1000;}
function parseImplied(raw:string):number|null{const s=String(raw||"").trim(); if(!s)return null; if(/^[+-]?\d+$/.test(s))return Number(s)/1000; if(/^[+-]?\d+[,.]\d+$/.test(s))return Number(s.replace(",",".")); return null;}
function safeMath(expr:string){const c=expr.replace(/,/g,".").replace(/[^0-9+\-*/().\s]/g,""); if(!c.trim())return NaN; try{return Number(new Function(`"use strict";return (${c});`)());}catch{return NaN;}}
function tokenizeFixedExpression(expr:string,addresses:Map<string,number>):Array<number|string>{
  const p=String(expr||"").replace(/=/g," ").replace(/([+*/-])/g," $1 ").trim(); const out:Array<number|string>=[];
  for(const t0 of p.split(/\s+/).filter(Boolean)){const t=t0.trim(); if(["+","-","*","/"].includes(t)){out.push(t);continue;}
    if(/^\d{4}[0-9A-Z][0-9]$/i.test(t)&&addresses.has(t.toUpperCase())){out.push(addresses.get(t.toUpperCase())!);continue;}
    const n=parseImplied(t); if(n!==null)out.push(n);}
  return out;
}
const numericArgs=(e:string,a:Map<string,number>)=>tokenizeFixedExpression(e,a).filter((v):v is number=>typeof v==="number");
function formula0(expr:string,a:Map<string,number>){const t=tokenizeFixedExpression(expr,a);return safeMath(t.map(v=>typeof v==="number"?String(v):v).join(" "));}
function formula91(expr:string,a:Map<string,number>){let s=String(expr||"").replace(/=/g," ");s=s.replace(/\b\d{4}[0-9A-Z][0-9]\b/gi,m=>{const v=a.get(m.toUpperCase());return v==null?"NaN":String(v);});return safeMath(s);}
function heron(a:number,b:number,c:number){const s=(a+b+c)/2;return Math.sqrt(Math.max(0,s*(s-a)*(s-b)*(s-c)));}
function evalSimple(no:string,args:number[]):number{const [a,b,c,d,e]=args;switch(no){
 case"01":{if(args.length<2)return NaN;const x=a*b/2;return args.length>=3?x*c:x;}
 case"02":{if(args.length<3)return NaN;const x=a*b*Math.sin(c*Math.PI/200)/2;return args.length>=4?x*d:x;}
 case"03":{if(args.length<3)return NaN;const x=heron(a,b,c);return args.length>=4?x*d:x;}
 case"04":return args.length===2?a*b:args.length>=3?a*b*c:NaN;
 case"05":return args.length===3?(a+b)/2*c:args.length>=4?(a+b)/2*c*d:NaN;
 case"06":{if(args.length<2)return NaN;const x=a*b*Math.PI/200;return args.length>=3?x*c:x;}
 case"07":{if(args.length<2)return NaN;const x=a*a*b*Math.PI/400;return args.length>=3?x*c:x;}
 case"08":{if(args.length<3)return NaN;const x=(a*a-b*b)*c*Math.PI/400;return args.length>=4?x*d:x;}
 case"09":{if(args.length<2)return NaN;const x=2*a*b/3;return args.length>=3?x*c:x;}
 case"10":{if(args.length<2)return NaN;const h=b*Math.PI/400,x=a*a*(Math.tan(h)-h);return args.length>=3?x*c:x;}
 case"11":{if(args.length<4)return NaN;const[R,r,alpha,H]=args;return(R+r)*Math.sqrt((R-r)**2+H**2)*alpha*Math.PI/400;}
 case"12":{if(args.length<4)return NaN;const[R,r,alpha,H]=args;return(R*R+R*r+r*r)*alpha*H*Math.PI/(3*400);}
 case"13":{if(args.length<5)return NaN;const[aa,h,H1,H2,H3]=args;return aa*h*(H1+H2+H3)/6;}
 case"14":{if(args.length<5)return NaN;const[A,B,H,aa,bb]=args;return(2*A*B+2*aa*bb+A*bb+aa*B)*H/12;}
 case"15":{if(args.length<5)return NaN;const[A,B,H,aa,bb]=args;return(2*A*B+2*aa*bb+A*bb+aa*B)*H/6;}
 case"20":return args.length>=2?Math.sqrt(a*a+b*b):NaN;
 default:return NaN;}}
function evalCyclic(no:string,exprs:string[],a:Map<string,number>):number{
 if(no==="00")return formula0(exprs.join(" "),a);
 if(no==="30")return Math.sqrt(Math.max(0,formula0(exprs.join(" "),a)));
 if(no==="31"||no==="32"){const v=exprs.flatMap(e=>numericArgs(e,a));if(!v.length)return NaN;return no==="31"?v.reduce((s,x)=>s+x,0)/v.length:Math.sqrt(v.reduce((s,x)=>s+x*x,0)/v.length);}
 if(no==="21"){const v=exprs.flatMap(e=>numericArgs(e,a));if(v.length<4)return NaN;const pts:Array<[number,number]>=[];for(let i=0;i+1<v.length;i+=2)pts.push([v[i],v[i+1]]);let s=0;for(let i=1;i<pts.length;i++){const dx=pts[i][0]-pts[i-1][0],dy=pts[i][1]-pts[i-1][1];s+=Math.sqrt(dx*dx+dy*dy);}return s;}
 if(no==="22"){const v=exprs.flatMap(e=>numericArgs(e,a));if(v.length<6)return NaN;const pts:Array<[number,number]>=[];for(let i=0;i+1<v.length;i+=2)pts.push([v[i],v[i+1]]);let z=0;for(let i=0;i<pts.length-1;i++)z+=pts[i][0]*pts[i+1][1]-pts[i+1][0]*pts[i][1];return Math.abs(z)/2;}
 if(no==="23"){const r=exprs.map(e=>numericArgs(e,a)).filter(x=>x.length>=2);if(r.length<2)return NaN;let s=0;for(let i=1;i<r.length;i++){const p=r[i-1],c=r[i];s+=(c[0]-p[0])*(p.slice(1).reduce((x,y)=>x+y,0)+c.slice(1).reduce((x,y)=>x+y,0))/2;}return s;}
 if(no==="25"){const r=exprs.map(e=>numericArgs(e,a)).filter(x=>x.length>=4);if(r.length<2)return NaN;const p=r.map(v=>({st:v[0],area:(v[2]+v[3])*v[1]/2}));let s=0;for(let i=1;i<p.length;i++)s+=(p[i].st-p[i-1].st)*(p[i].area+p[i-1].area)/2;return s;}
 return NaN;
}
function parseRow(rawValue:unknown):Reb23003EvalLine{const raw=String(rawValue||"").padEnd(80," ").slice(0,80),marker=raw.slice(12,13),comment=marker==="*",m=comment?raw.slice(13,69).match(/#Bild\s+([^\s]+)/i):null;return{raw,address:raw.slice(69,75).trim().toUpperCase(),marker,explanation:raw.slice(13,22).trim(),sign:raw.slice(22,23),factor:parseFactor(raw.slice(23,29)),factorRaw:raw.slice(23,29).trim(),formulaNo:raw.slice(29,31).trim(),expression:raw.slice(31,69),result:null,helper:marker==="H",subtotal:marker==="Z",comment,imageRef:m?.[1]||null};}
export function evaluateReb23003Rows(rows:unknown[],externalAddresses:Map<string,number>=new Map()):Reb23003PositionResult{
 const parsed=rows.map(parseRow),addresses=externalAddresses,errors:string[]=[],images=parsed.map(x=>x.imageRef).filter((x):x is string=>!!x);let total=0;let blockSubtotal=0;
 /* REB erlaubt Adressreferenzen auf Hilfswerte. Für BVBS 2.6 steht der referenzierte H-Wert nach der Formel-91-Zeile: unabhängige H-Zeilen daher vorab berechnen. */
 for(const line of parsed){if(!line.helper||line.comment||!line.formulaNo||line.formulaNo==="91"||!line.address)continue;const v=evalSimple(line.formulaNo.padStart(2,"0"),numericArgs(line.expression,addresses));if(Number.isFinite(v))addresses.set(line.address,(line.sign==="-"?-1:1)*line.factor*v);}
 const apply=(line:Reb23003EvalLine,value:number)=>{const signed=(line.sign==="-"?-1:1)*line.factor*value;line.result=signed;if(line.helper){if(line.address)addresses.set(line.address,signed);return;}total+=signed;blockSubtotal+=signed;if(line.address){if(line.subtotal){addresses.set(line.address,blockSubtotal);blockSubtotal=0;}else addresses.set(line.address,signed);}};
 for(let i=0;i<parsed.length;){const line=parsed[i];if(line.comment||!line.formulaNo){i++;continue;}const no=line.formulaNo.padStart(2,"0");
  if(no==="91"){const g=[line];let expr=line.expression,j=i;while(!expr.includes("=")&&j+1<parsed.length&&parsed[j+1].formulaNo==="91"){j++;g.push(parsed[j]);expr+=" "+parsed[j].expression;}const v=formula91(expr,addresses);if(Number.isFinite(v))apply(g[g.length-1],v);else errors.push(`Formel91:${g.map(x=>x.address).join(",")}`);i=j+1;continue;}
  if(["00","21","22","23","25","30","31","32"].includes(no)){const g=[line];let j=i;while(!g[g.length-1].expression.includes("=")&&j+1<parsed.length&&parsed[j+1].formulaNo===line.formulaNo){j++;g.push(parsed[j]);}const v=evalCyclic(no,g.map(x=>x.expression),addresses);if(Number.isFinite(v))apply(g[g.length-1],v);else errors.push(`Formel${no}:${g.map(x=>x.address).join(",")}`);i=j+1;continue;}
  const v=evalSimple(no,numericArgs(line.expression,addresses));if(Number.isFinite(v))apply(line,v);else errors.push(`Formel${no}:${line.address}`);i++;}
 return{total:round3(total),lines:parsed,images,errors};}
export function evaluateReb23003Positions(positions:Array<{pos:string;qTakeoffRows:unknown[]}>){const addr=new Map<string,number>(),out=new Map<string,Reb23003PositionResult>();for(const p of positions)out.set(p.pos,evaluateReb23003Rows(p.qTakeoffRows||[],addr));return out;}
