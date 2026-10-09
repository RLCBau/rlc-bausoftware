import { prisma } from "../lib/prisma";

export async function ensureCompanyId(req: any): Promise<string> {
  const auth = req?.auth || {};
  const companyId = String(auth.companyId || auth.company || "").trim();
  if (companyId) {
    const found = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!found) throw new Error("AUTH_COMPANY_NOT_FOUND");
    return found.id;
  }
  if (process.env.NODE_ENV !== "production" && (process.env.DEV_AUTH || "").toLowerCase() === "on") {
    const devCompanyId = String(process.env.DEV_COMPANY_ID || "").trim();
    if (!devCompanyId) throw new Error("DEV_COMPANY_ID_REQUIRED");
    const found = await prisma.company.findUnique({ where: { id: devCompanyId }, select: { id: true } });
    if (found) return found.id;
  }
  throw new Error("COMPANY_REQUIRED");
}
