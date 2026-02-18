import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

/**
 * DEV auth: inietta utente admin + companyId.
 * Passa SEMPRE i permessi ("project:read"/"project:write") e, se serve, crea/ricicla la Company.
 */
export async function devAuth(req: Request, _res: Response, next: NextFunction) {
  if (process.env.DEV_AUTH !== "on") return next();

  // trova o crea company di default e salva l'ID in env (una volta)
  if (!process.env.DEV_COMPANY_ID) {
    const existing = await prisma.company.findFirst();
    const c = existing ?? (await prisma.company.create({
      data: { name: process.env.COMPANY_NAME || "RLC Tiefbau KG", slug: "rlc-tiefbau-kg" }
    }));
    process.env.DEV_COMPANY_ID = c.id;
    console.log("🏢 DEV company:", c.name, c.id);
  }

  const companyId = process.env.DEV_COMPANY_ID!;
  const user: any = (req as any).user ?? {};
  user.id = user.id || "dev-user";
  user.roles = ["admin"];

  // compatibilità: Set E array, così qualsiasi guard passa
  const permsSet = new Set<string>(["*", "project:read", "project:write"]);
  user.perms = permsSet;
  user.permissions = Array.from(permsSet);

  (req as any).user = user;
  (req as any).companyId = companyId;

  next();
}
