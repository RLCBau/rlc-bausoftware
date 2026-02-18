// apps/server/src/routes/whoami.ts
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";

const r = Router();

r.get("/", requireAuth, async (req: any, res) => {
  try {
    const companyId = req?.auth?.company ? String(req.auth.company) : null;

    // default
    let subscriptionActive = false;
    let plan: string | null = null;
    let seatsLimit: number | null = null;
    let currentPeriodEnd: string | null = null;
    let usedSeats: number | null = null;

    if (companyId) {
      const sub = await prisma.companySubscription.findUnique({
        where: { companyId },
        select: {
          status: true,
          plan: true,
          seatsLimit: true,
          currentPeriodEnd: true,
        },
      });

      if (sub) {
        const now = new Date();
        const statusOk = sub.status === "ACTIVE" || sub.status === "GRACE";
        const periodOk =
          !sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() >= now.getTime();

        subscriptionActive = statusOk && periodOk;
        plan = sub.plan;
        seatsLimit = sub.seatsLimit ?? null;
        currentPeriodEnd = sub.currentPeriodEnd
          ? sub.currentPeriodEnd.toISOString()
          : null;

        // count seats only if limited (optional but useful)
        if (seatsLimit != null) {
          // ✅ FIX: CompanyMember non esiste nello schema → conta gli User della company
          // Se "active" non esiste su User, rimuovi la condizione.
          usedSeats = await prisma.user.count({
            where: { companyId },
          });
        } else {
          usedSeats = null; // unlimited => non serve
        }
      } else {
        // no subscription row
        subscriptionActive = false;
      }
    }

    res.json({
      ok: true,
      user: req.user,
      auth: {
        sub: req?.auth?.sub ?? null,
        role: req?.auth?.role ?? null,
        company: companyId,
      },
      subscription: {
        active: subscriptionActive,
        plan,
        seatsLimit,
        usedSeats,
        currentPeriodEnd,
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "whoami failed" });
  }
});

export default r;
