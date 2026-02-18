// apps/server/src/routes/_util.company.ts
import { prisma } from "../lib/prisma.ts";

export async function ensureCompanyId(req: any): Promise<string> {
  const cid =
    req?.auth?.company ||
    process.env.DEV_COMPANY_ID ||
    "DEV_COMPANY";
  await prisma.company.upsert({
    where: { id: cid },
    update: {},
    create: { id: cid, name: "DEV COMPANY" },
  });
  return cid;
}
