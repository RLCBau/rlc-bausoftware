// apps/server/src/seed.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Valori di default (puoi cambiarli o metterli in .env)
const COMPANY_CODE = process.env.SEED_COMPANY_CODE ?? 'RLC';
const COMPANY_NAME = process.env.SEED_COMPANY_NAME ?? 'RLC Bausoftware';

const PROJECT_CODE = process.env.SEED_PROJECT_CODE ?? 'DEMO';
const PROJECT_NAME = process.env.SEED_PROJECT_NAME ?? 'Progetto di esempio';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@rlc.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin1234';

async function main() {
  // 1) Company (upsert su code)
  const company = await prisma.company.upsert({
    where: { code: COMPANY_CODE },
    update: { name: COMPANY_NAME },
    create: { code: COMPANY_CODE, name: COMPANY_NAME },
  });

  // 2) Project (upsert su chiave composta code+companyId)
    const project = await prisma.project.upsert({
    where: { code_companyId: { code: PROJECT_CODE, companyId: company.id } },
    update: { name: PROJECT_NAME },
    create: {
      code: PROJECT_CODE,
      name: PROJECT_NAME,
      companyId: company.id,
    },
  });


  // 3) Admin user (upsert su email)
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { password: ADMIN_PASSWORD, role: 'admin' },
    create: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' },
  });

  // 4) Posizioni/LVItem – inserisci solo se il progetto è ancora vuoto
  const existingCount = await prisma.lVItem.count({
    where: { projectId: project.id },
  });

  if (existingCount === 0) {
    await prisma.lVItem.createMany({
      data: [
        {
          projectId: project.id,
          // Adatta i nomi dei campi se nel tuo schema si chiamano diverso:
          positionNumber: '01.001',
          shortText: 'Aushub Baugrube',
          unit: 't',
          unitPrice: 18.5,
          quantity: 120,
        },
        {
          projectId: project.id,
          positionNumber: '02.010',
          shortText: 'Fundamentbeton C25/30',
          unit: 'm³',
          unitPrice: 145.0,
          quantity: 35,
        },
      ],
      skipDuplicates: true,
    });
  }

  console.log('✅ Seed OK', {
    company: { id: company.id, code: company.code },
    project: { id: project.id, code: project.code },
    admin: ADMIN_EMAIL,
    insertedPositions: existingCount === 0 ? 2 : 0,
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


