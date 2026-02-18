import "dotenv/config";
import { PrismaClient, RecipeComponentType } from "@prisma/client";

const prisma = new PrismaClient();

type Tpl = {
  key: string;
  title: string;
  unit: string;
  category: string;
  components: {
    type: RecipeComponentType;
    refKey: string;
    qtyFormula: string;
  }[];
};

async function main() {
  console.log("[seed] kalkulation templates – Block 2 (Leitungsbau)");

  const templates: Tpl[] = [];

  /* ============================================================
     WASSERLEITUNGEN
     ============================================================ */
  const waterDN = [32, 40, 50, 63, 90, 110, 160, 200];
  for (const dn of waterDN) {
    templates.push({
      key: `WASSER_LEITUNG_DN${dn}_VERLEGEN`,
      title: `Wasserleitung DN ${dn} verlegen`,
      unit: "m",
      category: "LEITUNGSBAU_WASSER",
      components: [
        { type: "LABOR", refKey: "LABOR:FACHARBEITER", qtyFormula: "0.18" },
        { type: "MACHINE", refKey: "MACHINE:BAGGER_8_14T", qtyFormula: "0.12" },
        { type: "MATERIAL", refKey: `MATERIAL:ROHR_PEHD_DN${dn}`, qtyFormula: "1" },
      ],
    });
  }

  /* ============================================================
     KANAL – SCHMUTZ / REGEN
     ============================================================ */
  const kanalDN = [160, 200, 250, 300, 400];
  for (const dn of kanalDN) {
    templates.push({
      key: `KANAL_SCHMUTZ_DN${dn}_VERLEGEN`,
      title: `Schmutzwasserkanal DN ${dn} verlegen`,
      unit: "m",
      category: "LEITUNGSBAU_KANAL",
      components: [
        { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "0.35" },
        { type: "MACHINE", refKey: "MACHINE:BAGGER_14_22T", qtyFormula: "0.22" },
        { type: "MATERIAL", refKey: `MATERIAL:KANALROHR_PVC_DN${dn}`, qtyFormula: "1" },
        { type: "MATERIAL", refKey: "MATERIAL:DICHTUNG", qtyFormula: "1" },
      ],
    });
  }

  /* ============================================================
     GAS
     ============================================================ */
  const gasDN = [32, 50, 63, 90];
  for (const dn of gasDN) {
    templates.push({
      key: `GAS_LEITUNG_DN${dn}_VERLEGEN`,
      title: `Gasleitung DN ${dn} verlegen`,
      unit: "m",
      category: "LEITUNGSBAU_GAS",
      components: [
        { type: "LABOR", refKey: "LABOR:GAS_MONTEUR", qtyFormula: "0.25" },
        { type: "MACHINE", refKey: "MACHINE:BAGGER_8_14T", qtyFormula: "0.15" },
        { type: "MATERIAL", refKey: `MATERIAL:GASROHR_PE_DN${dn}`, qtyFormula: "1" },
      ],
    });
  }

  /* ============================================================
     STROM
     ============================================================ */
  const stromQuerschnitt = ["NYY-J_4x16", "NYY-J_4x25", "NYY-J_4x50"];
  for (const q of stromQuerschnitt) {
    templates.push({
      key: `STROM_KABEL_${q}_VERLEGEN`,
      title: `Stromkabel ${q} verlegen`,
      unit: "m",
      category: "LEITUNGSBAU_STROM",
      components: [
        { type: "LABOR", refKey: "LABOR:ELEKTRIKER", qtyFormula: "0.22" },
        { type: "MACHINE", refKey: "MACHINE:KABELZUG", qtyFormula: "0.08" },
        { type: "MATERIAL", refKey: `MATERIAL:KABEL_${q}`, qtyFormula: "1" },
      ],
    });
  }

  /* ============================================================
     TELEKOM / GLASFASER
     ============================================================ */
  const telekom = ["MICRODUCT_7", "MICRODUCT_10", "MICRODUCT_14"];
  for (const t of telekom) {
    templates.push({
      key: `TELEKOM_${t}_VERLEGEN`,
      title: `Telekom ${t} verlegen`,
      unit: "m",
      category: "LEITUNGSBAU_TELEKOM",
      components: [
        { type: "LABOR", refKey: "LABOR:MONTEUR", qtyFormula: "0.15" },
        { type: "MATERIAL", refKey: `MATERIAL:${t}`, qtyFormula: "1" },
      ],
    });
  }

  /* ============================================================
     SCHUTZROHRE
     ============================================================ */
  const schutzDN = [50, 75, 110, 160];
  for (const dn of schutzDN) {
    templates.push({
      key: `SCHUTZROHR_DN${dn}_VERLEGEN`,
      title: `Schutzrohr DN ${dn} verlegen`,
      unit: "m",
      category: "LEITUNGSBAU_SCHUTZROHR",
      components: [
        { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "0.12" },
        { type: "MATERIAL", refKey: `MATERIAL:SCHUTZROHR_DN${dn}`, qtyFormula: "1" },
      ],
    });
  }

  /* ============================================================
     SCHÄCHTE
     ============================================================ */
  const schaechte = [
    { key: "SCHACHT_KUNSTSTOFF_DN1000", title: "Kunststoffschacht DN 1000" },
    { key: "SCHACHT_BETON_DN1000", title: "Betonschacht DN 1000" },
  ];

  for (const s of schaechte) {
    templates.push({
      key: s.key,
      title: s.title,
      unit: "stk",
      category: "LEITUNGSBAU_SCHACHT",
      components: [
        { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "6" },
        { type: "MACHINE", refKey: "MACHINE:KRAN", qtyFormula: "1" },
        { type: "MATERIAL", refKey: `MATERIAL:${s.key}`, qtyFormula: "1" },
      ],
    });
  }

  /* ============================================================
     UPSERT
     ============================================================ */
  let templateCount = 0;
  let componentCount = 0;

  for (const tpl of templates) {
    const t = await prisma.recipeTemplate.upsert({
      where: { key: tpl.key },
      update: {
        title: tpl.title,
        unit: tpl.unit,
        category: tpl.category,
      },
      create: {
        key: tpl.key,
        title: tpl.title,
        unit: tpl.unit,
        category: tpl.category,
        tags: [],
      },
    });

    await prisma.recipeComponent.deleteMany({ where: { templateId: t.id } });

    for (const c of tpl.components) {
      await prisma.recipeComponent.create({
        data: {
          templateId: t.id,
          type: c.type,
          refKey: c.refKey,
          qtyFormula: c.qtyFormula,
        },
      });
      componentCount++;
    }

    templateCount++;
  }

  console.log("[seed] done", {
    templates: templateCount,
    components: componentCount,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
