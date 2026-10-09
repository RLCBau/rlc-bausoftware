import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

(async () => {
  const projects = await prisma.project.findMany({ select: { code: true, lvSets: { take: 1, orderBy: { version: "desc" }, select: { positions: { where: { x84UnitPrice: { not: null } }, select: { position: true, kurztext: true, einheit: true, menge: true, x84UnitPrice: true, x84Total: true } } } } } });
  const rows: any[] = [];
  for (const project of projects) for (const row of project.lvSets[0]?.positions || []) {
    const ep = Number(row.x84UnitPrice || 0), total = row.x84Total === null ? null : Number(row.x84Total), qty = Number(row.menge || 0);
    const expected = ep * qty;
    const consistent = total !== null && Math.abs(total - expected) <= Math.max(0.02, Math.abs(expected) * 0.005);
    const totalAsEp = total !== null && qty > 0 && Math.abs(ep - total) <= Math.max(0.02, Math.abs(total) * 0.005);
    rows.push({ project: project.code, pos: row.position, unit: row.einheit, qty, text: String(row.kurztext || "").slice(0, 140), ep, total, expected, consistent, totalAsEp });
  }
  const stats = { rows: rows.length, withTotal: rows.filter(r => r.total !== null).length, consistent: rows.filter(r => r.consistent).length, totalAsEp: rows.filter(r => r.totalAsEp).length, missingTotal: rows.filter(r => r.total === null).length };
  console.log(JSON.stringify({ stats, inconsistent: rows.filter(r => r.total !== null && !r.consistent).sort((a,b) => Math.abs(b.expected - b.total) - Math.abs(a.expected - a.total)).slice(0,100), totalAsEp: rows.filter(r => r.totalAsEp).slice(0,100) }, null, 2));
  await prisma.$disconnect();
})().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
