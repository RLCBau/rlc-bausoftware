import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireVerifiedEmail } from "../middleware/auth";
import {
  requireActiveSubscription,
  requireCloudEnabled,
  requireCompany,
} from "../middleware/guards";

const router = Router();

router.use(
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  requireActiveSubscription,
  requireCloudEnabled
);

router.get("/me", async (req: any, res) => {
  try {
    const companyId = String(
      req?.auth?.companyId || req?.auth?.company || ""
    ).trim();

    const [company, subscription, members, projects, submissions] =
      await Promise.all([
        prisma.company.findUnique({
          where: { id: companyId },
          select: { id: true, name: true, code: true },
        }),
        prisma.companySubscription.findUnique({
          where: { companyId },
          select: {
            cloudEnabled: true,
            status: true,
            webSeatsPurchased: true,
            mobileSeatsPurchased: true,
          },
        }),
        prisma.companyMember.findMany({
          where: { companyId, active: true },
          select: {
            id: true,
            userId: true,
            role: true,
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        }),
        prisma.project.findMany({
          where: { companyId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            code: true,
            name: true,
            client: true,
            place: true,
            status: true,
            createdAt: true,
          },
        }),
        prisma.projectSubmission.findMany({
          where: { companyId },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: {
            id: true,
            source: true,
            kind: true,
            title: true,
            meta: true,
            createdAt: true,
            project: {
              select: { id: true, code: true, name: true },
            },
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        }),
      ]);

    if (!company || !subscription?.cloudEnabled) {
      return res.status(403).json({
        ok: false,
        error: "Cloud ist für diese Firma nicht aktiviert",
        code: "CLOUD_NOT_ENABLED",
      });
    }

    return res.json({
      ok: true,
      company,
      subscription,
      currentUserId: String(req.auth?.sub || ""),
      members,
      projects,
      submissions,
    });
  } catch (error: any) {
    console.error("GET /api/cloud/me error:", error?.message || error);
    return res.status(500).json({
      ok: false,
      error: "Cloud-Daten konnten nicht geladen werden",
    });
  }
});

export default router;