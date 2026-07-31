import type { Request, Response, NextFunction } from "express";
import { verifyJwt } from "../lib/security/crypto";

export type AuthCtx = {
  sub: string;
  role: string;
  companyId: string | null;
  companyRole: string | null;
  mode?: string | null;
  device?: string | null;
  emailVerified?: boolean | null;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthCtx;
      user?: {
        id?: string;
        email?: string;
        role?: string;
        mode?: string;
        emailVerifiedAt?: string | null;
        emailVerified?: boolean;
      };
    }
  }
}

export function authJwt(req: Request, res: Response, next: NextFunction) {
  const devOn = (process.env.DEV_AUTH || "").toLowerCase() === "on";

  // ✅ DEV bypass: index.ts ha già settato req.user + req.auth
  if (devOn && (req as any)?.user?.id) {
    if (!req.auth) {
      req.auth = {
        sub: String((req as any).user.id || "dev-user"),
        role: String((req as any).user.role || "ADMIN"),
        companyId:
          String((req as any)?.auth?.company || process.env.DEV_COMPANY_ID || "").trim() || null,
        companyRole: String((req as any).user.role || "ADMIN"),
        mode: String((req as any).user.mode || "SERVER_SYNC"),
        device: "dev-device",
        emailVerified: true,
      };
    }
    return next();
  }

  const h = req.header("authorization");
  if (!h || !h.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Kein Token" });
  }

  try {
    const decoded: any = verifyJwt(h.slice(7));

    req.auth = {
      sub: String(decoded.sub || ""),
      role: String(decoded.role || decoded.companyRole || "USER"),
      companyId: decoded.companyId ?? decoded.company ?? null,
      companyRole: decoded.companyRole ?? decoded.role ?? null,
      mode: decoded.mode ?? null,
      device: decoded.device ?? null,
      emailVerified: decoded.emailVerified ?? null,
    };

    if (!req.auth.sub) {
      return res.status(401).json({ error: "Ungültiges Token" });
    }

    return next();
  } catch {
    return res.status(401).json({ error: "Ungültiges Token" });
  }
}

export const requireAuth = authJwt;

export function requireVerifiedEmail(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const devOn = (process.env.DEV_AUTH || "").toLowerCase() === "on";
  if (devOn && (req as any)?.user?.id) return next();

  const v =
    (req as any)?.auth?.emailVerified ??
    (req as any)?.user?.emailVerified ??
    ((req as any)?.user?.emailVerifiedAt ? true : undefined);

  if (v === true || v === undefined || v === null) return next();
  return res.status(403).json({ ok: false, error: "EMAIL_NOT_VERIFIED" });
}
