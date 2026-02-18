// apps/server/src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/* Deutsch: Log-Level aus ENV ableiten (Fallback auf bestehende Liste) */
function resolvePrismaLog(): any {
  const env = process.env.PRISMA_LOG?.trim();
  if (!env) return ["query", "info", "warn", "error"];
  return env.split(",").map((s) => s.trim());
}

/* Deutsch: Option für hübsches Fehlerformat in Dev */
const errorFormat = process.env.NODE_ENV === "production" ? "minimal" : "pretty";

/* Prisma-Client erstellen */
export const prisma =
  global.prisma ||
  new PrismaClient({
    log: resolvePrismaLog(),
    errorFormat,
  });

/* Soft-Delete per Document */
prisma.$use(async (params, next) => {
  if (params.model === "Document") {
    if (params.action === "delete") {
      params.action = "update";
      params.args["data"] = { deletedAt: new Date() };
    }
    if (params.action === "deleteMany") {
      params.action = "updateMany";
      if (!params.args.data) params.args.data = {};
      params.args.data.deletedAt = new Date();
    }
  }
  return next(params);
});

/* Slow Query Logger (solo dev) */
const SLOW_MS = Number(process.env.SLOW_QUERY_MS || 300);
if (process.env.NODE_ENV !== "production") {
  (prisma as any).$on("query", (e: any) => {
    const ms = Number(e.duration);
    if (ms >= SLOW_MS) console.warn(`⚠️  Langsame Query (${ms}ms): ${e.query}`);
  });
}

/**
 * ✅ DEV SEED (non-breaking):
 * - ensure Company exists
 * - ensure CompanySubscription ACTIVE (MAX_UNLIMITED)
 * - ensure ADMIN user linked to company (via User.companyId)
 * - ensure CompanyMember exists (seat) with ProjectRole=ADMIN
 */
async function ensureDevSubscriptionAndAdmin() {
  const devOn = (process.env.DEV_AUTH || "").toLowerCase() === "on";
  if (!devOn) return;

  const companyId = String(process.env.DEV_COMPANY_ID || "").trim();
  if (!companyId) return;

  // admin email preferita: ADMIN_BYPASS_EMAILS (prima), fallback dev@rlc.local
  const adminEmailRaw = String(process.env.ADMIN_BYPASS_EMAILS || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const adminEmail = adminEmailRaw || "dev@rlc.local";

  // UserRole (app-level) nel tuo schema sembra: "admin" | "user"
  const devRoleRaw = String(process.env.DEV_ROLE || "admin").trim();
  const devUserRole =
    devRoleRaw.toLowerCase() === "admin" || devRoleRaw.toUpperCase() === "ADMIN"
      ? ("admin" as any)
      : ("user" as any);

  // ProjectRole (company member) nel tuo schema: "ADMIN" | "MITARBEITER" | ...
  const devCompanyRoleRaw = String(process.env.DEV_COMPANY_ROLE || "ADMIN").trim();
  const devCompanyRole = devCompanyRoleRaw.toUpperCase();

  // opzionale: ID utente fisso
  const devUserId = String(process.env.DEV_USER_ID || "").trim();

  const now = Date.now();
  const start = new Date(now - 24 * 3600 * 1000);
  const end = new Date(now + 365 * 24 * 3600 * 1000);

  const SUB_STATUS_ACTIVE = "ACTIVE" as any;
  const SUB_PLAN_MAX = "MAX_UNLIMITED" as any;

  try {
    // 1) ensure company exists
    const safeCode = ("DEV_" + companyId.slice(0, 8)).toUpperCase();
    await prisma.company.upsert({
      where: { id: companyId },
      update: {},
      create: { id: companyId, name: "DEV COMPANY", code: safeCode } as any,
    });

    // 2) ensure subscription ACTIVE
    await prisma.companySubscription.upsert({
      where: { companyId },
      update: {
        status: SUB_STATUS_ACTIVE,
        plan: SUB_PLAN_MAX,
        seatsLimit: null,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        lastVerifiedAt: new Date(),
      } as any,
      create: {
        companyId,
        status: SUB_STATUS_ACTIVE,
        plan: SUB_PLAN_MAX,
        seatsLimit: null,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        lastVerifiedAt: new Date(),
      } as any,
    });

    // 3) ensure ADMIN user exists + linked to company
    const user = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        companyId,
        role: devUserRole,
        emailVerifiedAt: new Date(),
        name: "DEV ADMIN",
      } as any,
      create: {
        ...(devUserId ? { id: devUserId } : {}),
        email: adminEmail,
        password: "DEV_BYPASS", // con DEV_AUTH=on non viene usata
        role: devUserRole,
        companyId,
        emailVerifiedAt: new Date(),
        name: "DEV ADMIN",
      } as any,
      select: { id: true, email: true, role: true },
    });

    // 4) ensure CompanyMember seat exists (companyId+userId unique)
    const member = await prisma.companyMember.upsert({
      where: { companyId_userId: { companyId, userId: user.id } } as any,
      update: { role: devCompanyRole as any, active: true } as any,
      create: {
        companyId,
        userId: user.id,
        role: devCompanyRole as any,
        active: true,
      } as any,
      select: { id: true, role: true, active: true },
    });

    console.log(
      `🏢 DEV admin ready: ${user.email} (userId=${user.id}) role=${String(user.role)} companyRole=${String(
        member.role
      )}`
    );
  } catch (e: any) {
    console.warn("⚠️ DEV seed (subscription/admin) skipped:", e?.message || e);
  }
}

// esegui una sola volta in dev (senza bloccare startup)
if (process.env.NODE_ENV !== "production") {
  void ensureDevSubscriptionAndAdmin();
}

/* Graceful Shutdown */
async function gracefulShutdown(signal: string) {
  try {
    console.log(`\n${signal} empfangen. Prisma trennt Verbindung ...`);
    await prisma.$disconnect();
  } catch (e) {
    console.error("Fehler beim Disconnect:", e);
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma;
