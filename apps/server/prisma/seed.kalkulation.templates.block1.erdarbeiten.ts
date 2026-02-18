import "dotenv/config";
import { PrismaClient, RecipeComponentType } from "@prisma/client";

const prisma = new PrismaClient();

type Tpl = {
  key: string;
  title: string;
  category: string;
  unit: string;
  components: {
    type: RecipeComponentType;
    refKey: string;
    qtyFormula: string;
  }[];
};

const ERDARBEITEN_TEMPLATES: Tpl[] = [
  // ===== AUSHUB / GRABEN (1–25) =====
  ...[
    "STANDARD","TIEF","SEHR_TIEF","BREIT","SCHMAL","UNTER_VERKEHR",
    "UNTER_GEBAEUDE","GRUNDWASSER","PUMPEN","FELS","SCHWIERIGER_BODEN",
    "HANG","HANDARBEIT","MASCHINELL","NACHTARBEIT","ENGRAUM",
    "STADTGEBIET","LAENDLICH","PROVISORISCH","BAUSTELLENWECHSEL",
    "KURZSTRECKE","LANGSTRECKE","FROST","REGEN","NOTFALL"
  ].map((s) => ({
    key: `TB_GRABEN_AUSHUB_${s}`,
    title: `Graben Aushub ${s.replace(/_/g, " ")}`,
    category: "TIEFBAU/ERDARBEITEN",
    unit: "m3",
    components: baseComponents(),
  })),

  // ===== BAUGRUBE (26–40) =====
  ...[
    "STANDARD","RECHTECKIG","TIEF","SEHR_TIEF","UNTER_GEBAEUDE",
    "GRUNDWASSER","PUMPEN","HANDARBEIT","MASCHINELL",
    "VERKEHRSSICHERUNG","PROVISORISCH","BETONIERBEREIT",
    "SCHACHT","SONDERFORM","RUECKBAU"
  ].map((s) => ({
    key: `TB_BAUGRUBE_${s}`,
    title: `Baugrube ${s.replace(/_/g, " ")}`,
    category: "TIEFBAU/ERDARBEITEN",
    unit: "m3",
    components: baseComponents(),
  })),

  // ===== VERBAU (41–55) =====
  ...[
    "LEICHT","SCHWER","GLEITSCHIENE","SPUNDWAND","BERLINER",
    "KOMBINIERT","HANDSYSTEM","MASCHINELL","TIEF",
    "UNTER_GEBAEUDE","PROVISORISCH","SONDERLOESUNG",
    "ABBAU","UMSETZEN","MIETE"
  ].map((s) => ({
    key: `TB_VERBAU_${s}`,
    title: `Verbau ${s.replace(/_/g, " ")}`,
    category: "TIEFBAU/ERDARBEITEN",
    unit: "m2",
    components: baseComponents(),
  })),

  // ===== WIEDERVERFUELLUNG (56–70) =====
  ...[
    "AUSHUB","SAND","KIES","FROSTSCHUTZ","RECYCLING",
    "SCHICHTWEISE","VERDICHTET","HANDARBEIT","MASCHINELL",
    "UNTER_VERKEHR","SCHACHT","RINNE",
    "PROVISORISCH","ENDGUELTIG","FROSTSICHER"
  ].map((s) => ({
    key: `TB_WIEDERVERFUELLUNG_${s}`,
    title: `Wiederverfüllung ${s.replace(/_/g, " ")}`,
    category: "TIEFBAU/ERDARBEITEN",
    unit: "m3",
    components: baseComponents(),
  })),

  // ===== PLANUM / BODEN (71–80) =====
  ...[
    "PLANUM_HERSTELLEN","PLANUM_FEIN","PLANUM_MASCHINELL",
    "PLANUM_HANDARBEIT","PLANUM_VERKEHRSFLAECHE",
    "PLANUM_GEBAEUDE","BODENVERBESSERUNG","BODENAUSTAUSCH",
    "BODENSTABILISIERUNG","BODENVERDICHTUNG"
  ].map((s) => ({
    key: `TB_${s}`,
    title: s.replace(/_/g, " "),
    category: "TIEFBAU/ERDARBEITEN",
    unit: "m2",
    components: baseComponents(),
  })),
];

// ===== STANDARD COMPONENTS =====
function baseComponents() {
  return [
    {
      type: RecipeComponentType.LABOR,
      refKey: "LABOR:FACHARBEITER",
      qtyFormula: "params.volume_m3 * 0.15",
    },
    {
      type: RecipeComponentType.MACHINE,
      refKey: "MACHINE:BAGGER_8_14T",
      qtyFormula: "params.volume_m3 * 0.05",
    },
    {
      type: RecipeComponentType.MATERIAL,
      refKey: "MATERIAL:DIESEL",
      qtyFormula: "params.volume_m3 * 0.8",
    },
  ];
}

// ===== MAIN =====
async function main() {
  console.log("[seed] kalkulation templates – Block 1 (Erdarbeiten)");

  let tplCount = 0;
  let compCount = 0;

  for (const tpl of ERDARBEITEN_TEMPLATES) {
    const upserted = await prisma.recipeTemplate.upsert({
      where: { key: tpl.key },
      update: {
        title: tpl.title,
        category: tpl.category,
        unit: tpl.unit,
      },
      create: {
        key: tpl.key,
        title: tpl.title,
        category: tpl.category,
        unit: tpl.unit,
        tags: ["erdarbeiten", "tiefbau"],
      },
    });

    tplCount++;

    await prisma.recipeComponent.deleteMany({
      where: { templateId: upserted.id },
    });

    for (const c of tpl.components) {
      await prisma.recipeComponent.create({
        data: {
          templateId: upserted.id,
          type: c.type,
          refKey: c.refKey,
          qtyFormula: c.qtyFormula,
        },
      });
      compCount++;
    }
  }

  console.log("[seed] done", { templates: tplCount, components: compCount });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
