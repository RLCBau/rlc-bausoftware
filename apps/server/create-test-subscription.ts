import { prisma } from "./src/lib/prisma";

const companyId = "4fdd084a-f544-4c37-a5e6-0d922acef28d";

async function main() {
  const sub = await prisma.companySubscription.upsert({
    where: { companyId },
    update: {
      status: "ACTIVE",
      plan: "MAX_UNLIMITED",
      webSeatsPurchased: 10,
      mobileSeatsPurchased: 10,
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      lastVerifiedAt: new Date(),
    },
    create: {
      companyId,
      status: "ACTIVE",
      plan: "MAX_UNLIMITED",
      webSeatsPurchased: 10,
      mobileSeatsPurchased: 10,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      lastVerifiedAt: new Date(),
    },
  });

  console.log("SUBSCRIPTION_READY:", sub.companyId, sub.status, sub.plan, sub.currentPeriodEnd);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
