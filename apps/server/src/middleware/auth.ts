// apps/server/src/middleware/auth.ts
import type { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

type Mode = "NUR_APP" | "SERVER_SYNC";

type JwtPayload = {
  sub: string;
  email?: string;
  role?: string;
  mode?: Mode;
  emailVerifiedAt?: string | null;
  emailVerified?: boolean;

  companyId?: string | null;
  companyRole?: string | null;
  company?: string | null; // compat (alcune routes usano auth.company)
};

declare global {
  namespace Express {
    /**
     * ✅ Tipizza "user" nel modo corretto:
     * non su Request.user (che può essere già dichiarato altrove),
     * ma su Express.User (che è l'interfaccia pensata per req.user).
     */
    interface User {
      id: string;
      email?: string;
      role?: string;
      mode?: Mode;
      emailVerifiedAt?: string | null;
      emailVerified?: boolean;

      companyId?: string | null;
      companyRole?: string | null;
    }

    interface Request {
      auth?: JwtPayload | any;
    }
  }
}

function jwtSecret() {
  return process.env.JWT_SECRET || "dev_secret_change_me";
}

function bearerToken(req: Request) {
  const h = String(req.headers.authorization || "");
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim();
}

function isDevAuthOn() {
  return String(process.env.DEV_AUTH || "").toLowerCase() === "on";
}

async function resolveDevCompanyId(): Promise<string | null> {
  const wanted = String(process.env.DEV_COMPANY_ID || "").trim();
  if (wanted) {
    const found = await prisma.company.findUnique({
      where: { id: wanted },
      select: { id: true },
    });
    if (found?.id) return found.id;
  }

  const first = await prisma.company.findFirst({ select: { id: true } });
  return first?.id || null;
}

function devRole() {
  return String(process.env.DEV_ROLE || "ADMIN").toUpperCase();
}

function devEmail() {
  const raw = String(process.env.ADMIN_BYPASS_EMAILS || "dev@local").trim();
  const first = raw.split(",")[0]?.trim();
  return first || "dev@local";
}

async function applyDevAuth(req: Request) {
  const companyId = await resolveDevCompanyId();

  const payload: JwtPayload = {
    sub: "dev-user",
    email: devEmail(),
    role: devRole(),
    mode: "SERVER_SYNC",
    emailVerifiedAt: new Date().toISOString(),
    emailVerified: true,
    companyId,
    companyRole: devRole(),
    company: companyId, // compat
  };

  req.auth = payload;

  // ✅ req.user esiste (Express.User). Non tipizziamo Request.user qui.
  (req as any).user = {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    mode: payload.mode,
    emailVerifiedAt: payload.emailVerifiedAt ?? null,
    emailVerified: true,
    companyId: payload.companyId ?? null,
    companyRole: payload.companyRole ?? null,
  } satisfies Express.User;
}

/**
 * optionalAuth
 * - se c'è token lo valida e popola req.auth / req.user
 * - se non c'è token → next()
 * - DEV_AUTH=on → popola comunque
 */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  try {
    if (isDevAuthOn()) {
      await applyDevAuth(req);
      return next();
    }

    const t = bearerToken(req);
    if (!t) return next();

    const decoded = jwt.verify(t, jwtSecret()) as JwtPayload;

    req.auth = decoded;
    (req as any).user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      mode: decoded.mode,
      emailVerifiedAt: decoded.emailVerifiedAt ?? null,
      emailVerified: !!decoded.emailVerifiedAt || !!decoded.emailVerified,
      companyId: decoded.companyId ?? (decoded as any).company ?? null,
      companyRole: decoded.companyRole ?? null,
    } satisfies Express.User;

    return next();
  } catch (_e) {
    req.auth = undefined;
    (req as any).user = undefined;
    return next();
  }
};

/**
 * requireAuth
 * - richiede token valido
 * - DEV_AUTH=on → bypass totale
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    if (isDevAuthOn()) {
      await applyDevAuth(req);
      return next();
    }

    const t = bearerToken(req);
    if (!t) return res.status(401).json({ ok: false, error: "NO_TOKEN" });

    const decoded = jwt.verify(t, jwtSecret()) as JwtPayload;

    req.auth = decoded;
    (req as any).user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      mode: decoded.mode,
      emailVerifiedAt: decoded.emailVerifiedAt ?? null,
      emailVerified: !!decoded.emailVerifiedAt || !!decoded.emailVerified,
      companyId: decoded.companyId ?? (decoded as any).company ?? null,
      companyRole: decoded.companyRole ?? null,
    } satisfies Express.User;

    return next();
  } catch (_e: any) {
    return res.status(401).json({ ok: false, error: "BAD_TOKEN" });
  }
};

/**
 * requireVerifiedEmail
 * - DEV_AUTH=on → passa
 */
export const requireVerifiedEmail: RequestHandler = async (req, res, next) => {
  try {
    if (isDevAuthOn()) return next();

    const userId = String((req as any).user?.id || req.auth?.sub || "");
    if (!userId) return res.status(401).json({ ok: false, error: "NO_AUTH" });

    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true },
    });

    if (!u?.emailVerifiedAt) {
      return res.status(403).json({ ok: false, error: "EMAIL_NOT_VERIFIED" });
    }

    return next();
  } catch (_e) {
    return res.status(500).json({ ok: false, error: "VERIFY_CHECK_FAILED" });
  }
};
