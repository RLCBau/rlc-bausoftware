// apps/server/src/middleware/guards.ts
import type { Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

/**
 * ⚠️ IMPORTANTE
 * - NON importiamo Request da express
 * - usiamo Express.Request globale (augmentato da express.d.ts)
 */

type Auth = {
  sub: string;
  role?: string;
  company?: string;
};

function getCompanyIdFromReq(req: Express.Request) {
  const cid = req.auth?.company;
  return cid ? String(cid) : "";
}

export async function requireCompany(
  req: Express.Request,
  res: Response,
  next: NextFunction
) {
  // 🔓 DEV BYPASS
  if ((process.env.DEV_AUTH || "").toLowerCase() === "on") {
    const companyId = String(process.env.DEV_COMPANY_ID || "").trim();
    if (!companyId) {
      return res.status(500).json({ error: "DEV_COMPANY_ID fehlt (.env)" });
    }

    const a: Auth = {
      sub: String(process.env.DEV_USER_ID || "dev-user"),
      role: String(process.env.DEV_ROLE || "ADMIN"),
      company: companyId,
    };

    req.auth = a; // ✅ sub garantito
    return next();
  }

  if (!req.auth?.company) {
    return res.status(403).json({ error: "Keine Firma im Token" });
  }

  // 🔍 Verifica reale DB
  try {
    const exists = await prisma.company.findUnique({
      where: { id: String(req.auth.company) },
      select: { id: true },
    });

    if (!exists) {
      return res.status(403).json({ error: "Firma nicht gefunden" });
    }
  } catch {
    return res.status(500).json({ error: "DB Fehler (Company Check)" });
  }

  next();
}

export function requireProjectMember(param: string = "id") {
  return async (
    req: Express.Request,
    res: Response,
    next: NextFunction
  ) => {
    // 🔓 DEV bypass
    if ((process.env.DEV_AUTH || "").toLowerCase() === "on") return next();

    const projectId = String((req as any).params?.[param] || "");
    if (!projectId) {
      return res.status(400).json({ error: "ProjectId fehlt" });
    }

    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Auth fehlt" });
    }

    const member = await prisma.projectMember.findFirst({
      where: { projectId, userId },
      select: { id: true },
    });

    // 👑 ADMIN bypass
    if (!member && String(req.auth?.role || "").toUpperCase() !== "ADMIN") {
      return res.status(403).json({ error: "Nicht im Projekt" });
    }

    next();
  };
}

/**
 * ✅ BLOCCO TOTALE:
 * Richiede che la company abbia una subscription ACTIVE (o GRACE) valida.
 * Se non valida -> 402 (Payment Required) e l'app deve mostrare Paywall.
 */
export async function requireActiveSubscription(
  req: Express.Request,
  res: Response,
  next: NextFunction
) {
  // 🔓 DEV BYPASS
  if ((process.env.DEV_AUTH || "").toLowerCase() === "on") return next();

  const companyId = getCompanyIdFromReq(req);
  if (!companyId) return res.status(403).json({ error: "Keine Firma im Token" });

  try {
    const sub = await prisma.companySubscription.findUnique({
      where: { companyId },
      select: {
        status: true,
        currentPeriodEnd: true,
        plan: true,
        seatsLimit: true,
      },
    });

    // Nessuna subscription => bloccato
    if (!sub) {
      return res.status(402).json({ error: "Abo erforderlich", code: "SUB_REQUIRED" });
    }

    const now = new Date();
    const statusOk = sub.status === ("ACTIVE" as any) || sub.status === ("GRACE" as any);
    const periodOk =
      !sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() >= now.getTime();

    if (!statusOk || !periodOk) {
      return res.status(402).json({
        error: "Abo abgelaufen",
        code: "SUB_INACTIVE",
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
      });
    }

    // opzionale: attach info al req per uso successivo
    (req as any).subscription = sub;

    return next();
  } catch {
    return res.status(500).json({ error: "DB Fehler (Subscription Check)" });
  }
}

/**
 * ✅ Seat-limit:
 * Da usare SOLO su endpoint che aggiungono utenti (invite/join).
 * Se piano è unlimited (seatsLimit null) => sempre ok.
 * Se limite raggiunto => 409 e l'app propone upgrade o rimozione utente.
 */
export async function requireCompanySeatAvailable(
  req: Express.Request,
  res: Response,
  next: NextFunction
) {
  // 🔓 DEV BYPASS
  if ((process.env.DEV_AUTH || "").toLowerCase() === "on") return next();

  const companyId = getCompanyIdFromReq(req);
  if (!companyId) return res.status(403).json({ error: "Keine Firma im Token" });

  try {
    const sub = await prisma.companySubscription.findUnique({
      where: { companyId },
      select: { seatsLimit: true, status: true, currentPeriodEnd: true },
    });

    if (!sub) {
      return res.status(402).json({ error: "Abo erforderlich", code: "SUB_REQUIRED" });
    }

    const now = new Date();
    const statusOk = sub.status === ("ACTIVE" as any) || sub.status === ("GRACE" as any);
    const periodOk =
      !sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() >= now.getTime();

    if (!statusOk || !periodOk) {
      return res.status(402).json({ error: "Abo abgelaufen", code: "SUB_INACTIVE" });
    }

    // Unlimited
    if (sub.seatsLimit == null) return next();

    // ✅ FIX: nel tuo schema non esiste CompanyMember → contiamo User collegati alla company
    // Se non hai "active" su User, togli quel filtro.
    const used = await prisma.user.count({
      where: { companyId },
    });

    if (used >= sub.seatsLimit) {
      return res.status(409).json({
        error: "Seat limit erreicht",
        code: "SEAT_LIMIT",
        used,
        limit: sub.seatsLimit,
      });
    }

    return next();
  } catch {
    return res.status(500).json({ error: "DB Fehler (Seat Check)" });
  }
}
