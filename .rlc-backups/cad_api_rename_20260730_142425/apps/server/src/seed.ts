// apps/server/src/seed.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ---- Parametri (override via .env se vuoi) ----
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@rlc.local';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin1234'; // puoi sostituire con hash se usi bcrypt
  const COMPANY_CODE = process.env.SEED_COMPANY_CODE ?? 'RLC';
  const COMPANY_NAME = process.env.SEED_COMPANY_NAME ?? 'RLC Bausoftware';

  const PROJECT_CODE = process.env.SEED_PROJECT_CODE ?? 'TEST-001';
  const PROJECT_NAME = process.env.SEED_PROJECT_NAME ?? 'Projekt Demo';

  // ---- Company ----
  const company = await prisma.company.upsert({
    where: { code: COMPANY_CODE },
    update: { name: COMPANY_NAME },
    create: { code: COMPANY_CODE, name: COMPANY_NAME },
  });

  // ---- Admin user (associato all’azienda) ----
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      role: 'admin',
      companyId: company.id,
      // aggiorna password solo se definita in env
      ...(process.env.ADMIN_PASSWORD ? { password: ADMIN_PASSWORD } : {}),
    },
    create: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'admin',
      companyId: company.id,
    },
  });

  // ---- Progetto (unique: companyId + code) ----
  const project = await prisma.project.upsert({
    where: { code_companyId: { code: PROJECT_CODE, companyId: company.id } },
    update: { name: PROJECT_NAME },
    create: { code: PROJECT_CODE, name: PROJECT_NAME, companyId: company.id },
  });

  // ---- LV Items di esempio: inserisci solo se vuoto ----
  const existing = await prisma.lVItem.count({ where: { projectId: project.id } });
  if (existing === 0) {
    await prisma.lVItem.createMany({
      data: [
        {
          projectId: project.id,
          positionNumber: '01.001',
          shortText: 'Aushub Baugrube',
          unit: 'm³',
          quantity: 120,
          unitPrice: 18.5,
        },
        {
          projectId: project.id,
          positionNumber: '01.002',
          shortText: 'Abfuhr Erdreich',
          unit: 't',
          quantity: 80,
          unitPrice: 22.0,
        },
        {
          projectId: project.id,
          positionNumber: '02.010',
          shortText: 'Fundamentbeton C25/30',
          unit: 'm³',
          quantity: 35,
          unitPrice: 145.0,
        },
      ],
      skipDuplicates: true,
    });
  }

  console.log('✅ Seed OK', {
    company: { code: company.code, id: company.id },
    admin: { email: admin.email },
    project: { code: project.code, id: project.id },
    lvItemsSeeded: existing === 0,
  });
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

