import type { Request, Response, NextFunction } from "express";
import { verifyJwt } from "../lib/security/crypto";

export type AuthCtx = { sub: string; role: string; company: string; device?: string };
declare global { namespace Express { interface Request { auth?: AuthCtx } } }

export function authJwt(req: Request, res: Response, next: NextFunction) {
  const h = req.header("authorization");
  if (!h?.startsWith("Bearer ")) return res.status(401).json({ error: "Kein Token" });
  try {
    const decoded: any = verifyJwt(h.slice(7));
    req.auth = { sub: decoded.sub, role: decoded.role, company: decoded.company, device: decoded.device };
    return next();
  } catch (e: any) {
    return res.status(401).json({ error: "Ungültiges Token" });
  }
}
