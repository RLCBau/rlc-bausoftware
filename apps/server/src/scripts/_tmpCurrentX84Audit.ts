import { PrismaClient } from "@prisma/client";
import { calculateAutonomousUrkalkulation as calc } from "../kalkulation/autonomous/autonomousUrkalkulationEngine";
const prisma = new PrismaClient();
const ctx: any = { projectType: "Tiefbau", trade: "Tiefbau", difficulty: "medium", logisticsRisk: "medium", trafficRisk: "medium", durationRisk: "medium", marketFactor: 1, distanceFactor: 1, confidence: 0.9, warnings: [] };

(async () => {
  const projects = await prisma.project.findMany({ select: { code: true, lvSets: { take: 1, orderBy: { version: "desc" }, select: { positions: { where: { x84UnitPrice: { not: null } }, select: { position: true, kurztext: true, langtext: true, einheit: true, menge: true, x84UnitPrice: true } } } } } });
  const out: any[] = []; let x84Total = 0, rlcTotal = 0, unresolved = 0;
  for (const project of projects) for (const row of project.lvSets[0]?.positions || []) {
    const text = String(row.kurztext || row.langtext || "").trim(); if (!text) continue;
    const x: any = calc({ posNr: row.position, kurztext: row.kurztext, langtext: row.langtext || "", einheit: row.einheit, menge: Number(row.menge) } as any, ctx, []);
    const x84 = Number(row.x84UnitPrice), rlc = Number(x?.unitPrice || 0), qty = Number(row.menge || 0), pct = x84 ? ((rlc - x84) / x84) * 100 : null;
    x84Total += x84 * qty; rlcTotal += rlc * qty; if (!rlc) unresolved++;
    out.push({ project: project.code, pos: row.position, unit: row.einheit, qty, text: text.slice(0, 150), x84, rlc, pct, totalDiff: (rlc - x84) * qty, trade: x?.trade || null, art: x?.leistungsart || null, status: x?.calculationStatus || "unresolved" });
  }
  const buckets = { unresolved: out.filter(x => !x.rlc).length, within5: out.filter(x => x.rlc && Math.abs(x.pct) <= 5).length, between5and12: out.filter(x => x.rlc && Math.abs(x.pct) > 5 && Math.abs(x.pct) <= 12).length, above12: out.filter(x => x.rlc && Math.abs(x.pct) > 12).length };
  console.log(JSON.stringify({ positions: out.length, unresolved, x84Total, rlcTotal, totalPercent: x84Total ? ((rlcTotal - x84Total) / x84Total) * 100 : null, buckets, largestByValue: [...out].sort((a,b) => Math.abs(b.totalDiff) - Math.abs(a.totalDiff)).slice(0,80), largestByPercent: out.filter(x => x.rlc && x.x84 > 0).sort((a,b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0,80) }, null, 2));
  await prisma.$disconnect();
})().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
