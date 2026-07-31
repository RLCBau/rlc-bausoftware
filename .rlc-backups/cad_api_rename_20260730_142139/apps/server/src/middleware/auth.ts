import type { Request, Response, NextFunction } from "express";
import { verifyJwt } from "../lib/security/crypto";

export type AuthCtx = {
  sub: string;
  email?: string;
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
  // RLC_DEV_PROJECT_LIST_PUBLIC_V1
  // Solo sviluppo locale: GET /api/projects senza token
  // ammesso solo da browser localhost/127.0.0.1.
  // Da dominio pubblico o curl senza Origin resta protetto.
  const origin = String(req.headers.origin || "");
  const isLocalDevOrigin =
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:");

  if (
    req.method === "GET" &&
    isLocalDevOrigin &&
    (
      req.originalUrl === "/api/projects" ||
      req.originalUrl.startsWith("/api/projects?") ||
      /^\/api\/projects\/[^/]+\/lv(?:\?|$)/.test(req.originalUrl)
    )
  ) {
    req.auth = {
      sub: "dev-user",
      role: "ADMIN",
      companyId: process.env.DEV_COMPANY_ID || "dev-company",
      companyRole: "ADMIN",
      mode: "SERVER_SYNC",
      device: "dev-browser",
      email: "dev@rlc.local",
      emailVerified: true,
    };

    (req as any).user = {
      id: "dev-user",
      email: "dev@rlc.local",
      role: "ADMIN",
      mode: "SERVER_SYNC",
      emailVerified: true,
      emailVerifiedAt: new Date().toISOString(),
    };

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
