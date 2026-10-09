import fs from 'fs';
import {createHash} from 'crypto';
const raw=JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const output=process.argv[3];
const all=raw.massMarketReviewRows as any[];
const trades=['Erdbau','Kanalbau','Straßenbau','Pflaster'];
const result:any[]=[];
for(const trade of trades){
 const candidates=all.filter(p=>p.family===trade||String(p.family).startsWith(trade+'/'));
 const unique=new Map<string,any>();
 for(const p of candidates){
  const short=String(p.shortText||'').replace(/\s+/g,' ').trim();
  const long=String(p.longText||'').replace(/\s+/g,' ').trim();
  if(short.length<14||long.length<55||!String(p.unit||'').trim())continue;
  const key=createHash('sha256').update(trade+'|'+p.unit+'|'+short+'|'+long).digest('hex');
  if(!unique.has(key)) unique.set(key,{id:key.slice(0,20),trade,project:p.project,position:p.pos,unit:p.unit,quantity:p.quantity,shortText:short,longText:long,priorRlcEP:p.ep,x84Benchmark:p.x84,referenceType:'evaluation_only_not_ki_input'});
 }
 const sorted=[...unique.values()].sort((a,b)=>a.id.localeCompare(b.id));
 // 15 original RLC zero-price + 10 positive-priced per trade, when available.
 result.push(...sorted.filter(x=>!(x.priorRlcEP>0)).slice(0,15),...sorted.filter(x=>x.priorRlcEP>0).slice(0,10));
}
fs.writeFileSync(output,JSON.stringify({version:'technical-ai-pilot-100/v1',selected:result.length,positions:result},null,2));
console.log(JSON.stringify({selected:result.length,byTrade:Object.fromEntries(trades.map(t=>[t,result.filter(x=>x.trade===t).length])),zeroCount:result.filter(x=>!(x.priorRlcEP>0)).length}));
