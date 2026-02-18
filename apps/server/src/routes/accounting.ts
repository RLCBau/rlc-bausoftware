import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { requirePermission } from "../middleware/rbac.ts";
import { requireProjectMember } from "../middleware/guards.ts";
import { z } from "zod";
import { validate, qList } from "../middleware/validation.ts";

const router = Router({ mergeParams: true });

/** Invoices */
router.get("/:projectId/accounting/invoices", requirePermission("buchhaltung:read"), requireProjectMember("projectId"), validate(qList,"query"), async (req, res) => {
  const { page, pageSize, q } = req.query as any;
  const projectId = String(req.params.projectId);
  const acc = await prisma.accountingRoot.findUnique({ where: { projectId } });
  if (!acc) return res.json({ ok:true, page, pageSize, total:0, rows:[] });
  const where: any = { accountingId: acc.id };
  if (q) where.number = { contains: q, mode: "insensitive" };
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({ where, skip:(page-1)*pageSize, take: pageSize, orderBy:{ date:"desc" } }),
    prisma.invoice.count({ where })
  ]);
  res.json({ ok:true, page, pageSize, total, rows });
});

const invSchema = z.object({ number: z.string().min(1), date: z.string(), customerId: z.string().uuid(), netAmount: z.number().nonnegative(), taxAmount: z.number().nonnegative(), grossAmount: z.number().nonnegative(), data: z.any().optional() });
router.post("/:projectId/accounting/invoices", requirePermission("buchhaltung:*"), requireProjectMember("projectId"), validate(invSchema), async (req, res) => {
  const projectId = String(req.params.projectId);
  const acc = await prisma.accountingRoot.findUnique({ where: { projectId } });
  if (!acc) return res.status(400).json({ error: "Keine Buchhaltung für Projekt" });
  const inv = await prisma.invoice.create({ data: { accountingId: acc.id, ...req.body, date: new Date(req.body.date) } });
  res.status(201).json({ ok:true, invoice: inv });
});

/** DATEV / USt / Mahnwesen */
router.get("/:projectId/accounting/report/datev", requirePermission("datev:export"), requireProjectMember("projectId"), async (req, res) => {
  const projectId = String(req.params.projectId);
  const ledger = await prisma.ledgerEntry.findMany({ where: { accounting: { projectId } }, orderBy: { date: "asc" } });
  const rows = ["Datum;Konto;Gegenkonto;Betrag;Text"];
  for (const l of ledger) rows.push([l.date.toISOString().slice(0,10), l.account, l.contraAccount, l.amount.toString(), l.text || ""].join(";"));
  res.header("Content-Type","text/csv; charset=utf-8").attachment(`DATEV_${projectId}.csv`).send(rows.join("\n"));
});

router.get("/:projectId/accounting/report/ust", requirePermission("ust:report"), requireProjectMember("projectId"), async (req, res) => {
  const projectId = String(req.params.projectId);
  const now = new Date(); const y = now.getUTCFullYear(); const m = now.getUTCMonth()+1;
  const start = new Date(Date.UTC(y, m-1, 1)), end = new Date(Date.UTC(y, m, 1));
  const inv = await prisma.invoice.findMany({ where: { accounting: { projectId }, date: { gte: start, lt: end } } });
  const bills = await prisma.vendorBill.findMany({ where: { accounting: { projectId }, date: { gte: start, lt: end } } });
  const ust = inv.reduce((a,v)=>a + Number(v.taxAmount), 0);
  const vor = bills.reduce((a,v)=>a + Number(v.taxAmount), 0);
  res.json({ ok:true, period:`${y}-${m}`, umsatzsteuer: ust, vorsteuer: vor, zahlung: ust - vor });
});

router.get("/:projectId/accounting/report/mahnwesen", requirePermission("mahnwesen:*"), requireProjectMember("projectId"), async (req, res) => {
  const projectId = String(req.params.projectId);
  const open = await prisma.invoice.findMany({ where: { accounting: { projectId }, status: "open" }, orderBy: { date: "asc" } });
  const today = new Date();
  const items = open.map(inv => {
    const days = Math.floor((today.getTime() - inv.date.getTime())/86400000);
    const stufe = days > 60 ? 3 : days > 30 ? 2 : days > 14 ? 1 : 0;
    return { number: inv.number, date: inv.date, gross: inv.grossAmount, days, stufe };
  });
  res.json({ ok:true, items });
});

export default router;
