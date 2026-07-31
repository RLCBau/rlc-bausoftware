import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const status = err.statusCode || err.status || 500;
  const problem = {
    type: "about:blank",
    title: status >= 500 ? "Interner Fehler" : "Fehlerhafte Anfrage",
    status,
    detail: err.message || "Unbekannter Fehler",
    instance: req.originalUrl
  };
  logger.error({ rid: (req as any).rid, err }, "error");
  res.status(status).header("Content-Type","application/problem+json").json(problem);
}
