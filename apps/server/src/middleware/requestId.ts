import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = req.header("x-request-id") || randomUUID();
  (req as any).rid = id;
  res.setHeader("x-request-id", id);
  next();
}
