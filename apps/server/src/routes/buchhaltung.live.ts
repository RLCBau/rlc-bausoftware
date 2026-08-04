// @ts-nocheck
// Persistent project accounting API. It uses the existing AccountingRoot,
// VendorBill, Payment and LedgerEntry tables; no demo storage is involved.
import { Router } from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { PROJECTS_ROOT } from "../lib/projectsRoot";
import { requirePermission } from "../middleware/rbac";
import { requireProjectMember } from "../middleware/guards";

const router = Router({ mergeParams: true });
const toNumber = (value: any) => Number(value || 0);
const isoDate = (value: any) => new Date(String(value || new Date().toISOString()));
const object = (value: any) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

async function projectFor(key: string) {
  const project = await prisma.project.findFirst({
    where: { OR: [{ id: String(key) }, { code: String(key) }] },
    select: { id: true, code: true, name: true, companyId: true },
  });
  if (!project) throw new Error("Projekt nicht gefunden.");
  return project;
}
async function rootFor(projectId: string) {
  return prisma.accountingRoot.upsert({ where: { projectId }, update: {}, create: { projectId } });
}
function safeProjectFolder(code: string) { return String(code || "").replace(/[^A-Za-z0-9_-]/g, "_"); }
function approvedDeliveryNotes(code: string) {
  const dir = path.join(PROJECTS_ROOT, safeProjectFolder(code), "ls");
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))).filter(Boolean);
  } catch { return []; }
}
router.get("/:projectKey/buchhaltung-live/bootstrap", requirePermission("buchhaltung:read"), requireProjectMember("projectKey"), async (req, res) => {
  try {
    const project = await projectFor(req.params.projectKey); const root = await rootFor(project.id);
    const [invoices, vendorBills, payments, ledger] = await Promise.all([
      prisma.invoice.findMany({ where: { accountingId: root.id }, orderBy: { date: "desc" } }),
      prisma.vendorBill.findMany({ where: { accountingId: root.id }, include: { supplier: { select: { id: true, name: true } } }, orderBy: { date: "desc" } }),
      prisma.payment.findMany({ where: { accountingId: root.id }, orderBy: { date: "desc" } }),
      prisma.ledgerEntry.findMany({ where: { accountingId: root.id }, orderBy: { date: "desc" } }),
    ]);
    return res.json({ ok: true, project, invoices, vendorBills, payments, ledger, lieferscheine: approvedDeliveryNotes(project.code) });
  } catch (error: any) { return res.status(400).json({ ok: false, error: error?.message || "Buchhaltung konnte nicht geladen werden." }); }
});
router.post("/:projectKey/buchhaltung-live/vendor-bills", requirePermission("buchhaltung:*"), requireProjectMember("projectKey"), async (req, res) => {
  try {
    const { number, supplierName, supplierId, date, netAmount, taxAmount, grossAmount, kostenstelle, dueDate, note } = req.body || {};
    if (!number || !(supplierName || supplierId) || !date) return res.status(400).json({ ok: false, error: "Rechnungsnummer, Lieferant und Datum sind Pflicht." });
    const project = await projectFor(req.params.projectKey); const root = await rootFor(project.id);
    let supplier = supplierId ? await prisma.party.findFirst({ where: { id: String(supplierId), companyId: project.companyId } }) : null;
    if (!supplier) {
      supplier = await prisma.party.findFirst({ where: { companyId: project.companyId, type: "SUPPLIER", name: String(supplierName) } });
      if (!supplier) supplier = await prisma.party.create({ data: { companyId: project.companyId, type: "SUPPLIER", name: String(supplierName) } });
    }
    const bill = await prisma.vendorBill.create({ data: { accountingId: root.id, number: String(number), supplierId: supplier.id, date: isoDate(date), netAmount: toNumber(netAmount), taxAmount: toNumber(taxAmount), grossAmount: toNumber(grossAmount), data: { kostenstelle: String(kostenstelle || ""), dueDate: dueDate || null, note: note || null } } });
    return res.status(201).json({ ok: true, vendorBill: bill });
  } catch (error: any) { return res.status(400).json({ ok: false, error: error?.message || "Eingangsrechnung konnte nicht gespeichert werden." }); }
});
router.post("/:projectKey/buchhaltung-live/payments", requirePermission("buchhaltung:*"), requireProjectMember("projectKey"), async (req, res) => {
  try {
    const { date, amount, direction, method, reference, refType, refId, note } = req.body || {};
    if (!date || !Number.isFinite(toNumber(amount)) || toNumber(amount) <= 0 || !["IN", "OUT"].includes(String(direction))) return res.status(400).json({ ok: false, error: "Datum, Betrag und Richtung sind Pflicht." });
    const project = await projectFor(req.params.projectKey); const root = await rootFor(project.id);
    const payment = await prisma.payment.create({ data: { accountingId: root.id, date: isoDate(date), amount: toNumber(amount), direction: String(direction), method: String(method || "Überweisung"), refType: refType || null, refId: refId || null, data: { reference: reference || null, note: note || null } } });
    return res.status(201).json({ ok: true, payment });
  } catch (error: any) { return res.status(400).json({ ok: false, error: error?.message || "Zahlung konnte nicht gespeichert werden." }); }
});
router.post("/:projectKey/buchhaltung-live/cashbook", requirePermission("buchhaltung:*"), requireProjectMember("projectKey"), async (req, res) => {
  try {
    const { date, amount, direction, text, kostenstelle, account, contraAccount } = req.body || {};
    if (!date || !text || !Number.isFinite(toNumber(amount)) || toNumber(amount) <= 0 || !["IN", "OUT"].includes(String(direction))) return res.status(400).json({ ok: false, error: "Datum, Text, Betrag und Richtung sind Pflicht." });
    const project = await projectFor(req.params.projectKey); const root = await rootFor(project.id);
    const signed = String(direction) === "OUT" ? -Math.abs(toNumber(amount)) : Math.abs(toNumber(amount));
    const entry = await prisma.ledgerEntry.create({ data: { accountingId: root.id, date: isoDate(date), account: String(account || "1000"), contraAccount: String(contraAccount || "1590"), amount: signed, text: String(text), refType: "CASHBOOK", data: { kostenstelle: String(kostenstelle || "") } } });
    return res.status(201).json({ ok: true, entry });
  } catch (error: any) { return res.status(400).json({ ok: false, error: error?.message || "Kassenbuch konnte nicht gespeichert werden." }); }
});
export default router;
