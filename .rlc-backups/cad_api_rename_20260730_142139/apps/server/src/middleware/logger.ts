import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

export function accessLog(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on("finish", () => {
    logger.info({ rid: (req as any).rid, m: req.method, u: req.originalUrl, s: res.statusCode, ms: Date.now()-start }, "http");
  });
  next();
}
