import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export function setEtag(res: Response, payload: any) {
  const etag = crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex");
  res.setHeader("ETag", etag);
  return etag;
}

export function requireIfMatch(req: Request, res: Response, next: NextFunction) {
  const hdr = req.header("if-match");
  if (!hdr) return res.status(428).json({ error: "If-Match Header erforderlich" });
  (req as any).ifMatch = hdr;
  next();
}
