const { PrismaClient } = require('@prisma/client');
const { hash } = require('argon2');

const prisma = new PrismaClient();

async function main() {
  // Admin anlegen (oder holen)
  const password = await hash('rlc123');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@rlc.local' },
    update: {},
    create: { email: 'admin@rlc.local', name: 'Admin', password, role: 'ADMIN' },
  });

  // Demo-Projekt + Mitgliedschaft
  const proj = await prisma.project.create({
    data: { name: 'Testprojekt', siteNo: 'BAU-0001', createdBy: admin.id },
  });

  await prisma.membership.upsert({
    where: { userId_projectId: { userId: admin.id, projectId: proj.id } },
    update: {},
    create: { userId: admin.id, projectId: proj.id, role: 'ADMIN' },
  });

  console.log('✅ Seed fertig');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
