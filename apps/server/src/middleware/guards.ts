// apps/server/src/middleware/guards.ts
import type { Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

type Auth = {
  sub: string;
  role: string;
  companyId: string | null;
  companyRole: string | null;
  mode?: string | null;
  device?: string | null;
  emailVerified?: boolean | null;
  company?: string | null;
};

function getCompanyIdFromReq(req: Express.Request) {
  const cid =
    (req.auth as any)?.companyId ??
    (req.auth as any)?.company ??
    null;

  return cid ? String(cid) : "";
}

function isDevAuth() {
  return (process.env.DEV_AUTH || "").toLowerCase() === "on";
}

function withTimeout<T>(promise: Promise<T>, ms = 2000, label = "DB_TIMEOUT"): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(label)), ms)
    ),
  ]);
}

export async function requireCompany(
  req: Express.Request,
  res: Response,
  next: NextFunction
) {
  if (isDevAuth()) {
    const companyId = String(process.env.DEV_COMPANY_ID || "").trim();
    if (!companyId) {
      return res.status(500).json({ error: "DEV_COMPANY_ID fehlt (.env)" });
    }

    const role = String(process.env.DEV_ROLE || "ADMIN");

    const a: Auth = {
      sub: String(process.env.DEV_USER_ID || "dev-user"),
      role,
      companyId,
      company: companyId,
      companyRole: role,
    };

    req.auth = a;
    return next();
  }

  const companyId = getCompanyIdFromReq(req);
  if (!companyId) {
    return res.status(403).json({ error: "Keine Firma im Token" });
  }

  try {
    const exists = await withTimeout(
      prisma.company.findUnique({
        where: { id: String(companyId) },
        select: { id: true },
      }),
      2000,
      "DB_TIMEOUT_COMPANY"
    );

    if (!exists) {
      return res.status(403).json({ error: "Firma nicht gefunden" });
    }

    return next();
  } catch (e: any) {
    console.error("[guard:requireCompany]", e?.message || e);
    return res.status(503).json({
      error: "DB Fehler oder Timeout (Company Check)",
      code: e?.message || "COMPANY_CHECK_FAILED",
    });
  }
}

export function requireProjectMember(param: string = "id") {
  return async (
    req: Express.Request,
    res: Response,
    next: NextFunction
  ) => {
    if (isDevAuth()) return next();

    const projectId = String((req as any).params?.[param] || "");
    if (!projectId) {
      return res.status(400).json({ error: "ProjectId fehlt" });
    }

    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Auth fehlt" });
    }

    try {
      const member = await withTimeout(
        prisma.projectMember.findFirst({
          where: { projectId, userId },
          select: { id: true },
        }),
        2000,
        "DB_TIMEOUT_PROJECT_MEMBER"
      );

      if (!member && String(req.auth?.role || "").toUpperCase() !== "ADMIN") {
        return res.status(403).json({ error: "Nicht im Projekt" });
      }

      return next();
    } catch (e: any) {
      console.error("[guard:requireProjectMember]", e?.message || e);
      return res.status(503).json({
        error: "DB Fehler oder Timeout (Project Member Check)",
        code: e?.message || "PROJECT_MEMBER_CHECK_FAILED",
      });
    }
  };
}

export async function requireActiveSubscription(
  req: Express.Request,
  res: Response,
  next: NextFunction
) {
  if (isDevAuth()) return next();

  const companyId = getCompanyIdFromReq(req);
  if (!companyId) {
    return res.status(403).json({ error: "Keine Firma im Token" });
  }

  try {
    const sub = await withTimeout(
      prisma.companySubscription.findUnique({
        where: { companyId },
        select: {
          status: true,
          currentPeriodEnd: true,
          plan: true,
          seatsLimit: true,
        },
      }),
      2000,
      "DB_TIMEOUT_SUBSCRIPTION"
    );

    if (!sub) {
      return res
        .status(402)
        .json({ error: "Abo erforderlich", code: "SUB_REQUIRED" });
    }

    const now = new Date();
    const statusOk =
      sub.status === ("ACTIVE" as any) || sub.status === ("GRACE" as any);

    const periodOk =
      !sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() >= now.getTime();

    if (!statusOk || !periodOk) {
      return res.status(402).json({
        error: "Abo abgelaufen",
        code: "SUB_INACTIVE",
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd
          ? sub.currentPeriodEnd.toISOString()
          : null,
      });
    }

    (req as any).subscription = sub;
    return next();
  } catch (e: any) {
    console.error("[guard:requireActiveSubscription]", e?.message || e);
    return res.status(503).json({
      error: "DB Fehler oder Timeout (Subscription Check)",
      code: e?.message || "SUBSCRIPTION_CHECK_FAILED",
    });
  }
}

export async function requireCompanySeatAvailable(
  req: Express.Request,
  res: Response,
  next: NextFunction
) {
  if (isDevAuth()) return next();

  const companyId = getCompanyIdFromReq(req);
  if (!companyId) {
    return res.status(403).json({ error: "Keine Firma im Token" });
  }

  try {
    const sub = await withTimeout(
      prisma.companySubscription.findUnique({
        where: { companyId },
        select: { seatsLimit: true, status: true, currentPeriodEnd: true },
      }),
      2000,
      "DB_TIMEOUT_SEAT_SUBSCRIPTION"
    );

    if (!sub) {
      return res
        .status(402)
        .json({ error: "Abo erforderlich", code: "SUB_REQUIRED" });
    }

    const now = new Date();
    const statusOk =
      sub.status === ("ACTIVE" as any) || sub.status === ("GRACE" as any);

    const periodOk =
      !sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() >= now.getTime();

    if (!statusOk || !periodOk) {
      return res
        .status(402)
        .json({ error: "Abo abgelaufen", code: "SUB_INACTIVE" });
    }

    if (sub.seatsLimit == null) return next();

    const used = await withTimeout(
      prisma.user.count({
        where: { companyId },
      }),
      2000,
      "DB_TIMEOUT_SEAT_COUNT"
    );

    if (used >= sub.seatsLimit) {
      return res.status(409).json({
        error: "Seat limit erreicht",
        code: "SEAT_LIMIT",
        used,
        limit: sub.seatsLimit,
      });
    }

    return next();
  } catch (e: any) {
    console.error("[guard:requireCompanySeatAvailable]", e?.message || e);
    return res.status(503).json({
      error: "DB Fehler oder Timeout (Seat Check)",
      code: e?.message || "SEAT_CHECK_FAILED",
    });
  }
}
