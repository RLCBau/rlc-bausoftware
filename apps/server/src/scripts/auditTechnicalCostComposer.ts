import fs from 'fs';
import {composeTechnicalCost} from '../kalkulation/autonomous/technicalCostComposer';
const doc=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const rows=doc.massMarketReviewRows||[];
const groups:Record<string,number>={};
const blockers:Record<string,number>={};
const examples:any[]=[];
let priced=0;
for(const p of rows){
 const x=composeTechnicalCost({kurztext:p.shortText,langtext:p.longText,einheit:p.unit,menge:p.quantity});
 if(x.status==='calculated'){priced++;groups[x.scope]=(groups[x.scope]||0)+1;
  if(examples.length<12)examples.push({text:p.shortText.slice(0,100),unit:p.unit,directCost:x.unitPriceEUR,priorEP:p.ep,lines:x.lines});
 } else for(const why of x.reason)blockers[why]=(blockers[why]||0)+1;
}
console.log(JSON.stringify({total:rows.length,directCostCalculated:priced,requiresTechnicalReview:rows.length-priced,byScope:groups,blockers,examples},null,2));
