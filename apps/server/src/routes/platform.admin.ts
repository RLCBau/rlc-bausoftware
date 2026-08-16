import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { isAdminBypassEmail } from "../lib/license";

const r = Router();

async function requirePlatformAdmin(req: any, res: any, next: any) {
  try {
    const userId = String(req?.auth?.sub || "").trim();

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user?.email || !isAdminBypassEmail(user.email)) {
      return res.status(403).json({
        ok: false,
        error: "PLATFORM_ADMIN_REQUIRED",
      });
    }

    req.platformAdmin = {
      userId: user.id,
      email: user.email,
    };

    return next();
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: e?.message || "ADMIN_CHECK_FAILED",
    });
  }
}

/**
 * GET /api/platform/admin/companies
 */
r.get(
  "/companies",
  requireAuth,
  requirePlatformAdmin,
  async (_req: any, res) => {
    try {
      const companies = await prisma.company.findMany({
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          code: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          createdAt: true,
          updatedAt: true,

          subscription: {
            select: {
              status: true,
              plan: true,
              webSeatsPurchased: true,
              mobileSeatsPurchased: true,
              cloudEnabled: true,
              currentPeriodStart: true,
              currentPeriodEnd: true,
              updatedAt: true,
            },
          },

          _count: {
            select: {
              members: true,
              users: true,
              projects: true,
              mobileLicenses: true,
            },
          },
        },
      });

      return res.json({
        ok: true,
        companies: companies.map((company: any) => ({
          ...company,
          createdAt: company.createdAt.toISOString(),
          updatedAt: company.updatedAt.toISOString(),
          subscription: company.subscription
            ? {
                ...company.subscription,
                currentPeriodStart:
                  company.subscription.currentPeriodStart?.toISOString() || null,
                currentPeriodEnd:
                  company.subscription.currentPeriodEnd?.toISOString() || null,
                updatedAt:
                  company.subscription.updatedAt?.toISOString() || null,
              }
            : null,
        })),
      });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: e?.message || "COMPANIES_LOAD_FAILED",
      });
    }
  }
);

/**
 * GET /api/platform/admin/companies/:companyId
 */
r.get(
  "/companies/:companyId",
  requireAuth,
  requirePlatformAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.params.companyId || "").trim();

      const company = await prisma.company.findUnique({
        where: { id: companyId },
        include: {
          subscription: true,
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                  createdAt: true,
                },
              },
            },
          },
          mobileLicenses: {
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      });

      if (!company) {
        return res.status(404).json({
          ok: false,
          error: "COMPANY_NOT_FOUND",
        });
      }

      return res.json({
        ok: true,
        company,
      });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: e?.message || "COMPANY_LOAD_FAILED",
      });
    }
  }
);

/**
 * PATCH /api/platform/admin/companies/:companyId/subscription
 */
r.patch(
  "/companies/:companyId/subscription",
  requireAuth,
  requirePlatformAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.params.companyId || "").trim();

      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });

      if (!company) {
        return res.status(404).json({
          ok: false,
          error: "COMPANY_NOT_FOUND",
        });
      }

      const data: any = {};

      if (req.body?.status !== undefined) {
        const status = String(req.body.status).toUpperCase();

        if (!["ACTIVE", "GRACE", "EXPIRED"].includes(status)) {
          return res.status(400).json({
            ok: false,
            error: "INVALID_STATUS",
          });
        }

        data.status = status;
      }

      if (req.body?.plan !== undefined) {
        const plan = String(req.body.plan).toUpperCase();

        if (!["BASIC_5", "PRO_20", "MAX_UNLIMITED"].includes(plan)) {
          return res.status(400).json({
            ok: false,
            error: "INVALID_PLAN",
          });
        }

        data.plan = plan;
      }

      if (req.body?.webSeatsPurchased !== undefined) {
        data.webSeatsPurchased = Math.max(
          0,
          Number(req.body.webSeatsPurchased) || 0
        );
      }

      if (req.body?.mobileSeatsPurchased !== undefined) {
        data.mobileSeatsPurchased = Math.max(
          0,
          Number(req.body.mobileSeatsPurchased) || 0
        );
      }

      if (typeof req.body?.cloudEnabled === "boolean") {
        data.cloudEnabled = req.body.cloudEnabled;
      }

      if (req.body?.currentPeriodEnd !== undefined) {
        data.currentPeriodEnd = req.body.currentPeriodEnd
          ? new Date(req.body.currentPeriodEnd)
          : null;
      }

      const subscription = await prisma.companySubscription.upsert({
        where: {
          companyId,
        },
        create: {
          companyId,
          ...data,
        },
        update: data,
      });

      return res.json({
        ok: true,
        subscription,
      });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: e?.message || "SUBSCRIPTION_UPDATE_FAILED",
      });
    }
  }
);

export default r;
