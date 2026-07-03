// apps/server/src/middleware/audit.ts
import type { Request, Response, NextFunction } from "express";
import { writeAudit } from "../lib/auditLog";

function safePath(req: Request) {
  // originalUrl include query, baseUrl+path è più pulito
  const base = (req.baseUrl || "") + (req.path || "");
  return base || req.originalUrl || "";
}

export function auditTrail() {
  return (req: Request & { id?: string; auth?: any }, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on("finish", () => {
      try {
        const path = safePath(req);

        // ✅ logga solo API (non static /projects)
        if (!path.startsWith("/api")) return;

        // ✅ evita rumore (health, ecc.)
        if (path === "/api/health") return;

        // ✅ logga solo mutazioni + login
        const m = (req.method || "GET").toUpperCase();
        const isWrite = m !== "GET" && m !== "HEAD" && m !== "OPTIONS";
        const isLogin = path.startsWith("/api/auth") && m === "POST";

        if (!isWrite && !isLogin) return;

        const action = isLogin ? "LOGIN" : `${m} ${path}`;
        const durMs = Date.now() - start;

        void writeAudit({
          req,
          action,
          resource: path,
          meta: {
            requestId: req.id || null,
            status: res.statusCode,
            method: m,
            durationMs: durMs,
            ua: String(req.headers["user-agent"] || ""),
          },
        });
      } catch {
        // never break
      }
    });

    next();
  };
}
