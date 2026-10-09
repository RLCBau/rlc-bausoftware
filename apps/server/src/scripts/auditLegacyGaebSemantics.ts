import * as fs from "fs";
import { calculateAutonomousUrkalkulation } from "../kalkulation/autonomous/autonomousUrkalkulationEngine";

const ctx:any={
  projectType:"Tiefbau", trade:"Tiefbau", difficulty:"medium",
  logisticsRisk:"medium", trafficRisk:"medium", durationRisk:"medium",
  marketFactor:1, distanceFactor:1, bgkRate:0, profitRate:0,
  confidence:0.9, warnings:[]
};

const specs = [
  ["BA-2026-002","/tmp/ba002.psv"],
  ["BA-2026-003","/tmp/ba003.psv"],
] as const;

const norm=(s:string)=>String(s||"").toLowerCase().replace(/\s+/g," ").trim();

for (const [code,path] of specs) {
  if (!fs.existsSync(path)) continue;
  const rows=fs.readFileSync(path,"utf8").trim().split(/\r?\n/).map(l=>{
    const p=l.split("|");
    return {posNr:p[0],kurztext:p[1]||"",langtext:p[2]||"",einheit:p[3]||"",menge:Number(p[4]||0)};
  });

  let alternativeCandidateSum=0;
  let bedarfCandidateSum=0;
  let altCount=0;
  let bedarfCount=0;

  for (let i=0;i<rows.length;i++) {
    const row=rows[i];
    const x:any=calculateAutonomousUrkalkulation(row as any,ctx,rows as any[]);
    const sum=Number(x?.unitPrice||0)*row.menge;
    const text=norm(row.kurztext+" "+row.langtext);
    const prev=i>0?rows[i-1]:null;

    const obviousAlt =
      !!prev &&
      /(?:wie\s+pos\.?\s+vor|wie\s+vor).*(?:jedoch|abweichend)/i.test(text) &&
      row.einheit===prev.einheit &&
      Math.abs(row.menge-prev.menge)<1e-9;

    if (obviousAlt) {
      altCount++;
      alternativeCandidateSum+=sum;
      console.log(["GAEB_ALT_CANDIDATE",code,row.posNr,row.kurztext,row.menge,row.einheit,Number(x?.unitPrice||0).toFixed(2),sum.toFixed(2),prev?.posNr||""].join("|"));
    }

    const regieLike =
      /stundenlohn|stundensatz|material gegen rechnungsnachweis|bagger,?\s*\d+\s*kw|frontlader|flächenrüttler|flaechenruettler|abbruchhammer|lkw-kipper/i.test(text);

    if (regieLike) {
      bedarfCount++;
      bedarfCandidateSum+=sum;
      console.log(["GAEB_BEDARF_CANDIDATE",code,row.posNr,row.kurztext,row.menge,row.einheit,Number(x?.unitPrice||0).toFixed(2),sum.toFixed(2)].join("|"));
    }
  }

  console.log([
    "LEGACY_GAEB_SEMANTICS",
    code,
    "ALT_CANDIDATES="+altCount,
    "ALT_SUM="+alternativeCandidateSum.toFixed(2),
    "BEDARF_CANDIDATES="+bedarfCount,
    "BEDARF_SUM="+bedarfCandidateSum.toFixed(2)
  ].join("|"));
}
