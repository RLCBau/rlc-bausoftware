import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

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
        appRole: true,
      },
    });

    if (!user || String(user.appRole || "").toUpperCase() !== "PLATFORM_ADMIN") {
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
          invites: {
            orderBy: {
              createdAt: "desc",
            },
          },
          projects: {
            orderBy: {
              createdAt: "desc",
            },
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              client: true,
              place: true,
              createdAt: true,
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

      if (req.body?.aiMarketMonthlyIncluded !== undefined) {
        data.aiMarketMonthlyIncluded = Math.max(
          0,
          Math.floor(Number(req.body.aiMarketMonthlyIncluded) || 0)
        );
      }

      if (req.body?.aiMarketCreditsPurchased !== undefined) {
        data.aiMarketCreditsPurchased = Math.max(
          0,
          Math.floor(Number(req.body.aiMarketCreditsPurchased) || 0)
        );
      }

      const addAiMarketCredits = req.body?.addAiMarketCredits !== undefined
        ? Math.max(0, Math.floor(Number(req.body.addAiMarketCredits) || 0))
        : 0;

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

      const finalSubscription = addAiMarketCredits > 0
        ? await prisma.companySubscription.update({
            where: { companyId },
            data: { aiMarketCreditsPurchased: { increment: addAiMarketCredits } },
          })
        : subscription;

      return res.json({
        ok: true,
        subscription: finalSubscription,
      });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: e?.message || "SUBSCRIPTION_UPDATE_FAILED",
      });
    }
  }
);



/**
 * GET /api/platform/admin/companies/:companyId/ai-market-overview
 */
r.get(
  "/companies/:companyId/ai-market-overview",
  requireAuth,
  requirePlatformAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.params.companyId || "").trim();
      const monthKey = new Date().toISOString().slice(0, 7);
      const from = new Date(`${monthKey}-01T00:00:00.000Z`);
      const [summary, byModel, sub, orders, paidMonth, pendingOrders] = await Promise.all([
        prisma.aiMarketReviewUsage.aggregate({
          where: { companyId, createdAt: { gte: from } },
          _sum: { creditsUsed: true, inputTokens: true, outputTokens: true, totalTokens: true, webSearchCalls: true, estimatedCostUsd: true },
          _count: { _all: true },
        }),
        prisma.aiMarketReviewUsage.groupBy({
          by: ["provider", "model"],
          where: { companyId, createdAt: { gte: from } },
          _sum: { creditsUsed: true, inputTokens: true, outputTokens: true, totalTokens: true, webSearchCalls: true, estimatedCostUsd: true },
          _count: { _all: true },
        }),
        prisma.companySubscription.findUnique({ where: { companyId } }),
        prisma.aiMarketCreditOrder.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 30 }),
        prisma.aiMarketCreditOrder.aggregate({
          where: { companyId, status: "PAID", paidAt: { gte: from } },
          _sum: { priceCents: true, credits: true },
          _count: { _all: true },
        }),
        prisma.aiMarketCreditOrder.count({ where: { companyId, status: "PENDING" } }),
      ]);
      const included = Math.max(0, Number(sub?.aiMarketMonthlyIncluded || 0));
      const used = sub?.aiMarketMonthKey === monthKey ? Math.max(0, Number(sub?.aiMarketMonthlyUsed || 0)) : 0;
      const purchasedRemaining = Math.max(0, Number(sub?.aiMarketCreditsPurchased || 0));
      const includedRemaining = Math.max(0, included - used);
      return res.json({
        ok: true,
        monthKey,
        summary,
        byModel,
        orders,
        sales: {
          paidRevenueCentsMonth: Number(paidMonth._sum.priceCents || 0),
          paidCreditsMonth: Number(paidMonth._sum.credits || 0),
          paidOrdersMonth: Number(paidMonth._count._all || 0),
          pendingOrders: Number(pendingOrders || 0),
        },
        balance: { included, used, includedRemaining, purchasedRemaining, totalRemaining: includedRemaining + purchasedRemaining },
      });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || "AI_MARKET_OVERVIEW_FAILED" });
    }
  }
);

r.post(
  "/companies/:companyId/ai-market-orders/:orderId/confirm",
  requireAuth,
  requirePlatformAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.params.companyId || "").trim();
      const orderId = String(req.params.orderId || "").trim();
      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.aiMarketCreditOrder.findFirst({ where: { id: orderId, companyId } });
        if (!order) throw new Error("ORDER_NOT_FOUND");
        if (order.status === "PAID" && order.creditedAt) return order;
        if (order.status !== "PENDING") throw new Error("ORDER_NOT_PENDING");
        await tx.companySubscription.upsert({
          where: { companyId },
          create: { companyId, status: "ACTIVE", plan: "MAX_UNLIMITED", aiMarketCreditsPurchased: order.credits },
          update: { aiMarketCreditsPurchased: { increment: order.credits } },
        });
        return tx.aiMarketCreditOrder.update({
          where: { id: order.id },
          data: { status: "PAID", paidAt: new Date(), creditedAt: new Date() },
        });
      });
      return res.json({ ok: true, order: result });
    } catch (e: any) {
      const msg = e?.message || "AI_MARKET_ORDER_CONFIRM_FAILED";
      return res.status(msg === "ORDER_NOT_FOUND" ? 404 : 400).json({ ok: false, error: msg });
    }
  }
);

r.post(
  "/companies/:companyId/ai-market-orders/:orderId/cancel",
  requireAuth,
  requirePlatformAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.params.companyId || "").trim();
      const orderId = String(req.params.orderId || "").trim();
      const order = await prisma.aiMarketCreditOrder.findFirst({ where: { id: orderId, companyId } });
      if (!order) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
      if (order.status !== "PENDING") return res.status(400).json({ ok: false, error: "ORDER_NOT_PENDING" });
      const updated = await prisma.aiMarketCreditOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
      return res.json({ ok: true, order: updated });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || "AI_MARKET_ORDER_CANCEL_FAILED" });
    }
  }
);

function makePlatformInviteCode() {
  const a = crypto.randomBytes(2).toString("hex").toUpperCase();
  const b = crypto.randomBytes(2).toString("hex").toUpperCase();
  const c = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `RLC-${a}-${b}-${c}`;
}

function makePlatformMobileCode(role: string) {
  const prefix = String(role || "MITARBEITER")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 4) || "MOB";

  const a = crypto.randomBytes(2).toString("hex").toUpperCase();
  const b = crypto.randomBytes(2).toString("hex").toUpperCase();

  return `RLC-M-${prefix}-${a}-${b}`;
}

/**
 * POST /api/platform/admin/companies
 */
r.post(
  "/companies",
  requireAuth,
  requirePlatformAdmin,
  async (req: any, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const code = String(req.body?.code || "").trim().toUpperCase();

      if (!name || !code) {
        return res.status(400).json({
          ok: false,
          error: "NAME_AND_CODE_REQUIRED",
        });
      }

      const existing = await prisma.company.findUnique({
        where: { code },
        select: { id: true },
      });

      if (existing) {
        return res.status(409).json({
          ok: false,
          error: "COMPANY_CODE_EXISTS",
        });
      }

      const company = await prisma.company.create({
        data: {
          name,
          code,
          email: req.body?.email
            ? String(req.body.email).trim().toLowerCase()
            : null,
          phone: req.body?.phone ? String(req.body.phone).trim() : null,
          address: req.body?.address ? String(req.body.address).trim() : null,
          subscription: {
            create: {
              status: "ACTIVE",
              plan: "MAX_UNLIMITED",
              webSeatsPurchased: Math.max(
                0,
                Number(req.body?.webSeatsPurchased) || 0
              ),
              mobileSeatsPurchased: Math.max(
                0,
                Number(req.body?.mobileSeatsPurchased) || 0
              ),
              cloudEnabled: Boolean(req.body?.cloudEnabled),
            },
          },
        },
        include: {
          subscription: true,
        },
      });

      return res.json({
        ok: true,
        company,
      });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: e?.message || "COMPANY_CREATE_FAILED",
      });
    }
  }
);

/**
 * PATCH /api/platform/admin/companies/:companyId
 */
r.patch(
  "/companies/:companyId",
  requireAuth,
  requirePlatformAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.params.companyId || "").trim();

      const existing = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });

      if (!existing) {
        return res.status(404).json({
          ok: false,
          error: "COMPANY_NOT_FOUND",
        });
      }

      const data: any = {};

      if (req.body?.name !== undefined) {
        data.name = String(req.body.name || "").trim();
      }

      if (req.body?.code !== undefined) {
        data.code = String(req.body.code || "").trim().toUpperCase();
      }

      if (req.body?.email !== undefined) {
        data.email = req.body.email
          ? String(req.body.email).trim().toLowerCase()
          : null;
      }

      if (req.body?.phone !== undefined) {
        data.phone = req.body.phone
          ? String(req.body.phone).trim()
          : null;
      }

      if (req.body?.address !== undefined) {
        data.address = req.body.address
          ? String(req.body.address).trim()
          : null;
      }

      const company = await prisma.company.update({
        where: { id: companyId },
        data,
      });

      return res.json({
        ok: true,
        company,
      });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: e?.message || "COMPANY_UPDATE_FAILED",
      });
    }
  }
);

/**
 * POST /api/platform/admin/companies/:companyId/invites
 * Codice Web / Mitarbeiter
 */
r.post(
  "/companies/:companyId/invites",
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

      const role = String(req.body?.role || "MITARBEITER").toUpperCase();
      const ttlDays = Math.max(1, Math.min(Number(req.body?.ttlDays) || 30, 365));
      const maxUses = Math.max(1, Math.min(Number(req.body?.maxUses) || 1, 100));

      let code = makePlatformInviteCode();

      for (let i = 0; i < 10; i += 1) {
        const exists = await prisma.companyInvite.findUnique({
          where: { code },
          select: { id: true },
        });

        if (!exists) break;
        code = makePlatformInviteCode();
      }

      const invite = await prisma.companyInvite.create({
        data: {
          companyId,
          email: req.body?.email
            ? String(req.body.email).trim().toLowerCase()
            : null,
          role: role as any,
          code,
          maxUses,
          usedCount: 0,
          isActive: true,
          expiresAt: new Date(Date.now() + ttlDays * 86400000),
          createdByUserId: req.platformAdmin?.userId || null,
        },
      });

      return res.json({
        ok: true,
        invite,
      });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: e?.message || "INVITE_CREATE_FAILED",
      });
    }
  }
);

/**
 * PATCH /api/platform/admin/companies/:companyId/invites/:inviteId
 */
r.patch(
  "/companies/:companyId/invites/:inviteId",
  requireAuth,
  requirePlatformAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.params.companyId || "").trim();
      const inviteId = String(req.params.inviteId || "").trim();

      const invite = await prisma.companyInvite.findFirst({
        where: {
          id: inviteId,
          companyId,
        },
      });

      if (!invite) {
        return res.status(404).json({
          ok: false,
          error: "INVITE_NOT_FOUND",
        });
      }

      const data: any = {};

      if (typeof req.body?.isActive === "boolean") {
        data.isActive = req.body.isActive;
      }

      if (req.body?.expiresAt !== undefined) {
        data.expiresAt = req.body.expiresAt
          ? new Date(req.body.expiresAt)
          : invite.expiresAt;
      }

      const updated = await prisma.companyInvite.update({
        where: { id: inviteId },
        data,
      });

      return res.json({
        ok: true,
        invite: updated,
      });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: e?.message || "INVITE_UPDATE_FAILED",
      });
    }
  }
);

/**
 * POST /api/platform/admin/companies/:companyId/mobile-licenses
 */
r.post(
  "/companies/:companyId/mobile-licenses",
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

      const role = String(req.body?.role || "MITARBEITER").toUpperCase();

      let code = makePlatformMobileCode(role);

      for (let i = 0; i < 10; i += 1) {
        const exists = await prisma.mobileLicense.findUnique({
          where: { code },
          select: { id: true },
        });

        if (!exists) break;
        code = makePlatformMobileCode(role);
      }

      const license = await prisma.mobileLicense.create({
        data: {
          companyId,
          code,
          role,
          status: "FREE",
          employeeName: req.body?.employeeName
            ? String(req.body.employeeName).trim()
            : null,
          employeeEmail: req.body?.employeeEmail
            ? String(req.body.employeeEmail).trim().toLowerCase()
            : null,
          deviceName: req.body?.deviceName
            ? String(req.body.deviceName).trim()
            : null,
          expiresAt: req.body?.expiresAt
            ? new Date(req.body.expiresAt)
            : null,
          createdByUserId: req.platformAdmin?.userId || null,
        },
      });

      return res.json({
        ok: true,
        mobileLicense: license,
      });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: e?.message || "MOBILE_LICENSE_CREATE_FAILED",
      });
    }
  }
);

/**
 * PATCH /api/platform/admin/companies/:companyId/mobile-licenses/:licenseId
 */
r.patch(
  "/companies/:companyId/mobile-licenses/:licenseId",
  requireAuth,
  requirePlatformAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.params.companyId || "").trim();
      const licenseId = String(req.params.licenseId || "").trim();

      const license = await prisma.mobileLicense.findFirst({
        where: {
          id: licenseId,
          companyId,
        },
      });

      if (!license) {
        return res.status(404).json({
          ok: false,
          error: "MOBILE_LICENSE_NOT_FOUND",
        });
      }

      const data: any = {};

      if (req.body?.status !== undefined) {
        const status = String(req.body.status).toUpperCase();

        if (!["FREE", "ACTIVE", "BLOCKED"].includes(status)) {
          return res.status(400).json({
            ok: false,
            error: "INVALID_MOBILE_STATUS",
          });
        }

        data.status = status;
      }

      if (req.body?.employeeName !== undefined) {
        data.employeeName = req.body.employeeName || null;
      }

      if (req.body?.employeeEmail !== undefined) {
        data.employeeEmail = req.body.employeeEmail || null;
      }

      if (req.body?.deviceName !== undefined) {
        data.deviceName = req.body.deviceName || null;
      }

      if (req.body?.expiresAt !== undefined) {
        data.expiresAt = req.body.expiresAt
          ? new Date(req.body.expiresAt)
          : null;
      }

      const updated = await prisma.mobileLicense.update({
        where: { id: licenseId },
        data,
      });

      return res.json({
        ok: true,
        mobileLicense: updated,
      });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: e?.message || "MOBILE_LICENSE_UPDATE_FAILED",
      });
    }
  }
);

/**
 * DELETE /api/platform/admin/companies/:companyId/mobile-licenses/:licenseId
 */
r.delete(
  "/companies/:companyId/mobile-licenses/:licenseId",
  requireAuth,
  requirePlatformAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.params.companyId || "").trim();
      const licenseId = String(req.params.licenseId || "").trim();

      const deleted = await prisma.mobileLicense.deleteMany({
        where: {
          id: licenseId,
          companyId,
        },
      });

      if (!deleted.count) {
        return res.status(404).json({
          ok: false,
          error: "MOBILE_LICENSE_NOT_FOUND",
        });
      }

      return res.json({
        ok: true,
        deleted: deleted.count,
      });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: e?.message || "MOBILE_LICENSE_DELETE_FAILED",
      });
    }
  }
);

export default r;
