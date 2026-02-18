import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requirePermission } from "../middleware/rbac";
import { validate, qList } from "../middleware/validation";

const router = Router();

router.get("/", requirePermission("project:read"), validate(qList,"query"), async (req, res) => {
  const { page, pageSize, q } = req.query as any;
  const where: any = q ? { name: { contains: q, mode: "insensitive" } } : {};
  const [rows, total] = await Promise.all([
    prisma.party.findMany({ where, skip:(page-1)*pageSize, take: pageSize, orderBy:{ name:"asc" } }),
    prisma.party.count({ where })
  ]);
  res.json({ ok:true, page, pageSize, total, rows });
});

export default router;
