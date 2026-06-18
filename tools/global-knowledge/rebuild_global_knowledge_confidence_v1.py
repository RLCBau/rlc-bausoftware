import subprocess

NODE = r'''
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function n(v){ const x=Number(v); return Number.isFinite(x)?x:0; }

function ratio(min,max){
  const a=n(min), b=n(max);
  if(a<=0 || b<=0) return 999;
  return b/a;
}

async function main(){
  const rows = await prisma.rlcGlobalKnowledgeAggregated.findMany();

  let updated = 0;

  for(const r of rows){
    const samples = n(r.sampleCount);
    const rr = ratio(r.priceMin, r.priceMax);
    const sources = Array.isArray(r.sources) ? r.sources.length : 0;

    let confidence = 0.32;

    if(samples >= 2) confidence += 0.08;
    if(samples >= 3) confidence += 0.10;
    if(samples >= 5) confidence += 0.12;
    if(samples >= 10) confidence += 0.15;

    if(sources >= 2) confidence += 0.08;
    if(sources >= 3) confidence += 0.10;

    if(rr <= 1.5) confidence += 0.12;
    else if(rr <= 2.5) confidence += 0.08;
    else if(rr <= 4) confidence += 0.03;
    else confidence -= 0.12;

    if(r.isContextSensitive) confidence = Math.min(confidence, 0.45);
    if(samples <= 1) confidence = Math.min(confidence, 0.55);
    if(rr >= 6) confidence = Math.min(confidence, 0.50);

    confidence = Math.max(0.18, Math.min(0.92, confidence));
    confidence = Number(confidence.toFixed(2));

    await prisma.rlcGlobalKnowledgeAggregated.update({
      where: { id: r.id },
      data: {
        confidence,
        needsReview: confidence < 0.70 || r.isContextSensitive || rr >= 5
      }
    });

    updated++;
  }

  console.log(JSON.stringify({ ok:true, checked: rows.length, updated }, null, 2));
}

main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
'''

p = subprocess.run(
  ["docker","exec","-i","rlc-server","sh","-lc","cd /app && node"],
  input=NODE,
  text=True,
  capture_output=True
)

print(p.stdout)
if p.stderr:
    print(p.stderr)
if p.returncode != 0:
    raise SystemExit(p.returncode)
