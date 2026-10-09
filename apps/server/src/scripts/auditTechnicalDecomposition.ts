import fs from 'fs';
import { decomposeTechnicalPosition } from '../kalkulation/autonomous/technicalPositionDecomposer';
const source = process.argv[2];
if (!source) throw new Error('Usage: ts-node auditTechnicalDecomposition.ts <audit.json>');
const raw = JSON.parse(fs.readFileSync(source,'utf8'));
const positions = raw.massMarketReviewRows || [];
const counts:Record<string,number> = {};
const mismatch:Record<string,number> = {};
const examples:any[] = [];
for (const p of positions) {
 const d = decomposeTechnicalPosition({kurztext:p.shortText,langtext:p.longText,einheit:p.unit,menge:p.quantity});
 const key = `${d.object}/${d.operation}/${d.status}`;
 counts[key] = (counts[key]||0)+1;
 const candidate = d.object==='frostschutz_layer' && p.family==='Pruefung/Plattendruck';
 if (candidate) {
   mismatch['FSS_AS_PLATE_TEST']=(mismatch['FSS_AS_PLATE_TEST']||0)+1;
   if(examples.length<15)examples.push({project:p.project,pos:p.pos,short:p.shortText,oldEP:p.ep,work:d.object,components:d.required});
 }
}
console.log(JSON.stringify({total:positions.length,classified:positions.length-(Object.entries(counts).filter(([k])=>k.endsWith('/needs_review')).reduce((a,[,v])=>a+v,0)),counts,mismatch,examples},null,2));
