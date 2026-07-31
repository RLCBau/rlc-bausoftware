// apps/server/src/lib/auditLog.ts
import type { Request } from "express";
import { prisma } from "./prisma";

type AnyAuth = {
  sub?: string;
  companyId?: string | null;
};

function firstIp(xff: string) {
  return xff.split(",")[0]?.trim() || "";
}

export function getClientIp(req: Request): string {
  const xff = String(req.headers["x-forwarded-for"] || "");
  if (xff) return firstIp(xff);
  const xrip = String(req.headers["x-real-ip"] || "");
  if (xrip) return xrip.trim();
  // fallback (express)
  return (req.ip || "").toString();
}

export async function writeAudit(params: {
  req: Request & { auth?: AnyAuth; id?: string };
  action: string;
  resource?: string | null;
  meta?: any;
}) {
  const { req, action } = params;
  const resource = params.resource ?? null;

  try {
    const auth = (req as any).auth as AnyAuth | undefined;

    const userId = auth?.sub ? String(auth.sub) : null;
    const companyId =
      auth?.companyId !== undefined && auth?.companyId !== null
        ? String(auth.companyId)
        : null;

    const ip = getClientIp(req);
    const meta = params.meta ?? {};

    await prisma.auditLog.create({
      data: {
        userId,
        companyId,
        ip: ip || null,
        action,
        resource,
        meta,
      } as any,
    });
  } catch (e: any) {
    // Audit must never break API
    console.warn("⚠️ auditLog write failed:", e?.message || e);
  }
}
