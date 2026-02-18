// apps/server/src/middleware/requireAuth.ts
import type { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

type Mode = "NUR_APP" | "SERVER_SYNC";

type JwtPayload = {
  sub: string;
  email?: string;
  role?: string;
  mode?: Mode;
  emailVerifiedAt?: string | null;
  emailVerified?: boolean;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        role?: string;
        mode?: Mode;
        emailVerifiedAt?: string | null;
        emailVerified?: boolean;
      };
    }
  }
}

function jwtSecret() {
  return process.env.JWT_SECRET || "dev_secret_change_me";
}

function getBearerToken(req: any) {
  const h = String(req.headers?.authorization || "");
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

/** ✅ Require JWT auth (compatibile con DEV_AUTH che setta req.user) */
export function requireAuth(req: any, res: Response, next: NextFunction) {
  // ✅ se DEV_AUTH ha già settato req.user, lascia passare
  if (req.user?.id) return next();

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: "NO_TOKEN" });

  try {
    const decoded = jwt.verify(token, jwtSecret()) as JwtPayload;

    if (!decoded?.sub) {
      return res.status(401).json({ ok: false, error: "BAD_TOKEN" });
    }

    req.user = {
      id: String(decoded.sub),
      email: decoded.email ? String(decoded.email) : undefined,
      role: decoded.role ? String(decoded.role) : undefined,
      mode: decoded.mode || "NUR_APP",
      emailVerifiedAt:
        decoded.emailVerifiedAt === null || decoded.emailVerifiedAt === undefined
          ? null
          : String(decoded.emailVerifiedAt),
      emailVerified: !!decoded.emailVerified,
    };

    return next();
  } catch {
    return res.status(401).json({ ok: false, error: "BAD_TOKEN" });
  }
}

/** ✅ Blocca funzioni se l’utente non è nel mode richiesto */
export function requireMode(mode: Mode) {
  return (req: any, res: Response, next: NextFunction) => {
    const m = String(req.user?.mode || "NUR_APP") as Mode;
    if (m !== mode) return res.status(403).json({ ok: false, error: "MODE_BLOCKED" });
    return next();
  };
}

/** ✅ Blocca tutto finché non è verificata l’email */
export function requireEmailVerified(req: any, res: Response, next: NextFunction) {
  const ok = !!req.user?.emailVerified || !!req.user?.emailVerifiedAt;
  if (!ok) return res.status(403).json({ ok: false, error: "EMAIL_NOT_VERIFIED" });
  return next();
}

/** ✅ (Opzionale) RBAC semplice */
export function requireRole(...roles: string[]) {
  const want = roles.map((x) => String(x).toUpperCase());
  return (req: any, res: Response, next: NextFunction) => {
    const r = String(req.user?.role || "").toUpperCase();
    if (!r || !want.includes(r))
      return res.status(403).json({ ok: false, error: "ROLE_BLOCKED" });
    return next();
  };
}
