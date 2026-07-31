import type { Request, Response, NextFunction } from "express";
export { requireAuth, requireVerifiedEmail, authJwt } from "./auth";
export type { AuthCtx } from "./auth";

export function requireEmailVerified(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const devOn = (process.env.DEV_AUTH || "").toLowerCase() === "on";
  if (devOn) return next();

  const verified =
    (req as any)?.auth?.emailVerified ??
    (req as any)?.user?.emailVerified ??
    ((req as any)?.user?.emailVerifiedAt ? true : undefined);

  if (verified === false) {
    return res.status(403).json({ ok: false, error: "EMAIL_NOT_VERIFIED" });
  }

  return next();
}

export function requireMode(..._modes: string[]) {
  return (_req: Request, _res: Response, next: NextFunction) => {
    return next();
  };
}
