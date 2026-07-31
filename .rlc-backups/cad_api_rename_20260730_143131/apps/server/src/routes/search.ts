import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requirePermission } from "../middleware/rbac";
import { z } from "zod";
import { validate } from "../middleware/validation";

const router = Router();
const qSchema = z.object({ q: z.string().min(2) });

router.get("/lv-items", requirePermission("project:read"), validate(qSchema,"query"), async (req, res) => {
  const q = String((req.query as any).q);
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id","lvId","position","kurztext","langtext"
    FROM "LVItem"
    WHERE unaccent("kurztext" || ' ' || coalesce("langtext",''))
    ILIKE unaccent('%'||$1||'%')
    LIMIT 100
  `, q);
  res.json({ ok:true, rows });
});

export default router;
