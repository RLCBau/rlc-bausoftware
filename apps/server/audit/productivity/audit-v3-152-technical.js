const fs=require('fs');
const {PrismaClient}=require('@prisma/client');
const {diagnoseV3LunaCandidate}=require('../../src/kalkulation/autonomous/v3LunaMotorBridge');
const {resolveV3GaebReference}=require('../../src/kalkulation/autonomous/v3GaebReferenceResolver');
const {analyzeRlcProjectContext}=require('../../src/kalkulation/autonomous/projectContextAnalyzer');
const {auditV3VariantResources}=require('../../src/kalkulation/autonomous/v3VariantResourceAudit');
const {calculateRlcMotorWithContext}=require('../../src/kalkulation/rlcMotor');
const {diagnoseV3VariantCostOverlap}=require('../../src/kalkulation/autonomous/v3VariantCostOverlap');
const {auditV3IncrementalCosts}=require('../../src/kalkulation/autonomous/v3VariantIncrementalAudit');
const {checkV3SurchargeScope}=require('../../src/kalkulation/autonomous/v3SurchargeScopeGate');
(async()=>{
 const saved=JSON.parse(fs.readFileSync('/tmp/rlc-v3-reference-193-results.json','utf8'));
 const valid=new Map(saved.filter(x=>x.relation==='legitimate_variant').map(x=>[x.index,x]));
 const p=new PrismaClient(),sample=[];let cursor;
 try{
 while(sample.length<193){
  const hs=await p.lVHeader.findMany({take:15,...(cursor?{skip:1,cursor:{id:cursor}}:{}),orderBy:{id:'asc'},select:{id:true,title:true,positions:{select:{position:true,kurztext:true,langtext:true,einheit:true}}}});
  if(!hs.length)break;cursor=hs[hs.length-1].id;
  for(const h of hs){const a=h.positions.map(r=>({posNr:r.position,kurztext:r.kurztext,langtext:r.langtext||'',einheit:r.einheit}));
   for(const row of a){if(!/zulage|zuschlag/i.test(row.kurztext||''))continue;
    const ref=resolveV3GaebReference(row,a);if(ref.status==='incompatible_previous'&&ref.basePosition&&sample.length<193)sample.push({row,a,ref,title:h.title});
   }
  }
 }
 }finally{await p.$disconnect();}
 const summary={sample:sample.length,aiCandidate:valid.size,examined:0,uniqueBase:0,baseFamilyEligible:0,variantFamilyEligible:0,bothEligible:0,missingReference:0,unmatched:0,missingUnit:0,exceptions:0,priceApproved:0,urkBaseWithLines:0,urkVariantWithLines:0,urkBaseReview:0,urkVariantReview:0,technicalGaps:{},resourceEvidenceComplete:0,productivityVerified:0,readyForCostReview:0,possibleDoubleCount:0,overlapByGroup:{},incrementalScreened:0,incrementalApproved:0,scopeEvidenceComplete:0,scopeGapTotals:{}};
 const details=[];
 for(const [index,record] of sample.entries()){
  if(!valid.has(index))continue;summary.examined++;
  const base=record.a.slice(0,record.a.indexOf(record.row)).filter(r=>r.posNr===record.ref.basePosition);
  if(base.length!==1){summary.missingReference++;continue;}summary.uniqueBase++;
  let baseCount=0,variantCount=0,trade='UNRESOLVED';
  const context=analyzeRlcProjectContext(record.a,record.title||'');
  trade=String(context.trade||'UNRESOLVED');
  if(trade==='UNRESOLVED') summary.unmatched++;
  try{
   const a=diagnoseV3LunaCandidate(base[0],trade);
   const b=diagnoseV3LunaCandidate(record.row,trade);
   baseCount=a.eligibleCount;variantCount=b.eligibleCount;
   if(baseCount)summary.baseFamilyEligible++;
   if(variantCount)summary.variantFamilyEligible++;
   if(baseCount&&variantCount)summary.bothEligible++;
  }catch(e){summary.exceptions++;}
  if(!record.row.einheit)summary.missingUnit++;
  const baseCalc=calculateRlcMotorWithContext(base[0],context,record.a);
  const variantCalc=calculateRlcMotorWithContext(record.row,context,record.a);
  if(baseCalc?.costLines?.length)summary.urkBaseWithLines++;
  if(variantCalc?.costLines?.length)summary.urkVariantWithLines++;
  if(baseCalc?.calculationStatus==='needs_review')summary.urkBaseReview++;
  if(variantCalc?.calculationStatus==='needs_review')summary.urkVariantReview++;
  const checklist=auditV3VariantResources({base:base[0],variant:record.row,baseFamilies:baseCount,variantFamilies:variantCount});
  for(const gap of checklist.gaps)summary.technicalGaps[gap.code]=(summary.technicalGaps[gap.code]||0)+1;
  if(checklist.resources.every(r=>r.verified))summary.resourceEvidenceComplete++;
  if(checklist.productivityVerified)summary.productivityVerified++;
  if(checklist.readyForCostReview)summary.readyForCostReview++;
  const overlap=diagnoseV3VariantCostOverlap(baseCalc,variantCalc);
  if(overlap.status==='possible_double_count')summary.possibleDoubleCount++;
  for(const group of overlap.duplicateGroups)summary.overlapByGroup[group]=(summary.overlapByGroup[group]||0)+1;
  const incremental=auditV3IncrementalCosts(baseCalc,variantCalc);
  summary.incrementalScreened++;
  if(incremental.incrementalEP!==null)summary.incrementalApproved++;
  const scope=checkV3SurchargeScope({base:base[0],surcharge:record.row,baseCalculation:baseCalc,surchargeCalculation:variantCalc});
  if(scope.documentaryComplete)summary.scopeEvidenceComplete++;
  for(const code of scope.missing)summary.scopeGapTotals[code]=(summary.scopeGapTotals[code]||0)+1;
  details.push({scope,incremental,overlap,checklist,urkalkulation:{baseStatus:baseCalc?.calculationStatus||"no_recipe",variantStatus:variantCalc?.calculationStatus||"no_recipe",baseGroups:[...new Set((baseCalc?.costLines||[]).map(l=>l.group))],variantGroups:[...new Set((variantCalc?.costLines||[]).map(l=>l.group))],evidenceCertified:false},index,trade,basePosition:record.ref.basePosition,surchargePosition:record.row.posNr,baseFamilyCandidates:baseCount,variantFamilyCandidates:variantCount,needsTechnicalReview:true,epApproved:false});
 }
 fs.writeFileSync('/tmp/rlc-v3-152-technical-audit.json',JSON.stringify({summary,details},null,2));
 console.log('TECHNICAL_AUDIT',JSON.stringify(summary));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
