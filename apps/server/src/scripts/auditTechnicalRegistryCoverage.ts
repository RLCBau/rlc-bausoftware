import fs from 'fs';
import {TechnicalProductivityRegistry} from '../kalkulation/autonomous/technicalProductivityRegistry';
import {calculateWithTechnicalRegistry} from '../kalkulation/autonomous/technicalRegistryCalculator';
const source=process.argv[2];if(!source)throw Error('audit file required');
const data=JSON.parse(fs.readFileSync(source,'utf8'));
const registry=new TechnicalProductivityRegistry();
const counts:Record<string,number>={};
let matched=0,calculated=0;
for(const p of data.massMarketReviewRows){
 const row={kurztext:p.shortText,langtext:p.longText,einheit:p.unit,menge:p.quantity};
 const match=registry.resolve(row);counts[match.reason]=(counts[match.reason]||0)+1;
 if(match.record)matched++;
 const result=calculateWithTechnicalRegistry(row,registry);
 if(result.status==='calculated')calculated++;
}
console.log(JSON.stringify({rows:data.massMarketReviewRows.length,approvedRecipes:registry.size(),matched,calculated,unmatched:counts},null,2));
