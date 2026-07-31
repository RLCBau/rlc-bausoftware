import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requirePermission } from "../middleware/rbac";
import { requireProjectMember } from "../middleware/guards";
import { z } from "zod";
import { validate } from "../middleware/validation";

const router = Router({ mergeParams: true });

router.get("/:projectId/aufmass/sets", requirePermission("aufmass:*"), requireProjectMember("projectId"), async (req, res) => {
  const rows = await prisma.measurementSet.findMany({ where:{ projectId: String(req.params.projectId) }, orderBy:{ createdAt:"desc" } });
  res.json({ ok:true, rows });
});

const setSchema = z.object({ title: z.string().min(1) });
router.post("/:projectId/aufmass/sets", requirePermission("aufmass:*"), requireProjectMember("projectId"), validate(setSchema), async (req, res) => {
  const set = await prisma.measurementSet.create({ data: { projectId: String(req.params.projectId), title: req.body.title } });
  res.status(201).json({ ok:true, set });
});

const rowSchema = z.object({ setId: z.string().uuid(), lvItemId: z.string().uuid().optional(), source: z.enum(["CAD","PDF","FOTO","MANUAL"]), formula: z.string().optional(), quantity: z.number().nonnegative(), unit: z.string().min(1), context: z.any().optional() });
router.post("/:projectId/aufmass/rows", requirePermission("aufmass:*"), requireProjectMember("projectId"), validate(rowSchema), async (req, res) => {
  const r = await prisma.measurementRow.create({ data: req.body });
  res.status(201).json({ ok:true, row: r });
});

export default router;
