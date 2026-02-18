import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * BLOCK 4 – BAUSTELLE
 * ~80 Template
 * Fokus: Baustelleneinrichtung, Verkehrssicherung, Container, Logistik, Wasserhaltung,
 *        Provisorien, Reinigung, Absperrung, Beleuchtung, Beschilderung.
 *
 * Schema ALLINEATO a Block 1–3:
 * - recipeTemplate: key, title, unit, category
 * - recipeComponent: templateId, type, refKey, qtyFormula, sort
 * - type è STRING: "LABOR" | "MACHINE" | "MATERIAL" | "DISPOSAL" | "SURFACE"
 */

type TemplateDef = {
  key: string;
  title: string;
  unit: string;
  category: string;
  components: Array<{
    type: "LABOR" | "MACHINE" | "MATERIAL" | "DISPOSAL" | "SURFACE";
    refKey: string;
    qtyFormula: string;
  }>;
};

const T = "BAUSTELLE";

const baseTemplates: TemplateDef[] = [
  // =========================
  // BAUSTELLENEINRICHTUNG
  // =========================
  {
    key: "BA_EINRICHTUNG_PAUSCHAL",
    title: "Baustelleneinrichtung (pauschal)",
    unit: "pauschal",
    category: T,
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "6" },
      { type: "MACHINE", refKey: "MACHINE:TRANSPORTER", qtyFormula: "2" },
      { type: "MATERIAL", refKey: "MATERIAL:KLEINMATERIAL", qtyFormula: "1" },
    ],
  },
  {
    key: "BA_ABBAU_PAUSCHAL",
    title: "Baustellenabbau (pauschal)",
    unit: "pauschal",
    category: T,
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "4" },
      { type: "MACHINE", refKey: "MACHINE:TRANSPORTER", qtyFormula: "2" },
    ],
  },

  // =========================
  // VERKEHRSSICHERUNG / SPERRUNG
  // =========================
  {
    key: "BA_VERKEHRSSICHERUNG_TAG",
    title: "Verkehrssicherung (Tag)",
    unit: "tag",
    category: T,
    components: [
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "hours / 8" },
      { type: "MATERIAL", refKey: "MATERIAL:BAKEN_SCHILDER", qtyFormula: "1" },
      { type: "MACHINE", refKey: "MACHINE:TRANSPORTER", qtyFormula: "0.5" },
    ],
  },
  {
    key: "BA_VERKEHRSSICHERUNG_NACHT",
    title: "Verkehrssicherung (Nacht)",
    unit: "nacht",
    category: T,
    components: [
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "hours / 8" },
      { type: "MATERIAL", refKey: "MATERIAL:BAKEN_SCHILDER", qtyFormula: "1" },
      { type: "MATERIAL", refKey: "MATERIAL:WARNLEUCHTEN", qtyFormula: "1" },
      { type: "MACHINE", refKey: "MACHINE:TRANSPORTER", qtyFormula: "0.5" },
    ],
  },
  {
    key: "BA_SPERRE_VOLLSPERRUNG",
    title: "Vollsperrung einrichten",
    unit: "pauschal",
    category: T,
    components: [
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "3" },
      { type: "MATERIAL", refKey: "MATERIAL:BAKEN_SCHILDER", qtyFormula: "1.2" },
      { type: "MACHINE", refKey: "MACHINE:TRANSPORTER", qtyFormula: "1" },
    ],
  },
  {
    key: "BA_SPERRE_HALBSPERRUNG",
    title: "Halbseitige Sperrung einrichten",
    unit: "pauschal",
    category: T,
    components: [
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "2" },
      { type: "MATERIAL", refKey: "MATERIAL:BAKEN_SCHILDER", qtyFormula: "1" },
      { type: "MACHINE", refKey: "MACHINE:TRANSPORTER", qtyFormula: "1" },
    ],
  },

  // =========================
  // CONTAINER / WC / BAUBÜRO
  // =========================
  {
    key: "BA_CONTAINER_BAUBUERO_TAG",
    title: "Baucontainer (Baubüro) je Tag",
    unit: "tag",
    category: T,
    components: [{ type: "MATERIAL", refKey: "MATERIAL:CONTAINER_BAUBUERO", qtyFormula: "1" }],
  },
  {
    key: "BA_CONTAINER_LAGER_TAG",
    title: "Container (Lager) je Tag",
    unit: "tag",
    category: T,
    components: [{ type: "MATERIAL", refKey: "MATERIAL:CONTAINER_LAGER", qtyFormula: "1" }],
  },
  {
    key: "BA_WC_CONTAINER_TAG",
    title: "WC-Container je Tag",
    unit: "tag",
    category: T,
    components: [{ type: "MATERIAL", refKey: "MATERIAL:WC_CONTAINER", qtyFormula: "1" }],
  },

  // =========================
  // ZAUN / ABSCHIRMUNG
  // =========================
  {
    key: "BA_BAUZAUN_STELLEN",
    title: "Bauzaun stellen",
    unit: "m",
    category: T,
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "length / 25" },
      { type: "MATERIAL", refKey: "MATERIAL:BAUZAUN", qtyFormula: "length" },
    ],
  },
  {
    key: "BA_BAUZAUN_RUECKBAU",
    title: "Bauzaun rückbauen",
    unit: "m",
    category: T,
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "length / 35" },
      { type: "MACHINE", refKey: "MACHINE:TRANSPORTER", qtyFormula: "length / 200" },
    ],
  },

  // =========================
  // LOGISTIK / TRANSPORT
  // =========================
  {
    key: "BA_LOGISTIK_TAG",
    title: "Baustellenlogistik je Tag",
    unit: "tag",
    category: T,
    components: [
      { type: "MACHINE", refKey: "MACHINE:TRANSPORTER", qtyFormula: "1" },
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "1" },
    ],
  },
  {
    key: "BA_ANLIEFERUNG_PAUSCHAL",
    title: "Anlieferung / Abholung pauschal",
    unit: "pauschal",
    category: T,
    components: [
      { type: "MACHINE", refKey: "MACHINE:LKW", qtyFormula: "1" },
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "0.5" },
    ],
  },

  // =========================
  // WASSERHALTUNG / PUMPEN
  // =========================
  {
    key: "BA_WASSERHALTUNG_TAG",
    title: "Wasserhaltung je Tag",
    unit: "tag",
    category: T,
    components: [
      { type: "MACHINE", refKey: "MACHINE:PUMPE", qtyFormula: "1" },
      { type: "MATERIAL", refKey: "MATERIAL:SCHLAUCH", qtyFormula: "10" },
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "0.25" },
    ],
  },
  {
    key: "BA_PUMPENSUMPF_HERSTELLEN",
    title: "Pumpensumpf herstellen",
    unit: "stk",
    category: T,
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "1.5" },
      { type: "MACHINE", refKey: "MACHINE:MINIBAGGER", qtyFormula: "0.5" },
      { type: "DISPOSAL", refKey: "DISPOSAL:AUSHUB", qtyFormula: "0.6" },
    ],
  },

  // =========================
  // PROVISORIEN
  // =========================
  {
    key: "BA_PROVISORIUM_LEITUNG",
    title: "Provisorische Leitung herstellen",
    unit: "m",
    category: T,
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "length / 20" },
      { type: "MATERIAL", refKey: "MATERIAL:PROVISORIUM_LEITUNG", qtyFormula: "length" },
      { type: "MACHINE", refKey: "MACHINE:MINIBAGGER", qtyFormula: "length / 150" },
    ],
  },
  {
    key: "BA_PROVISORIUM_PLATTEN",
    title: "Baustellenüberfahrt / Platten-Provisorium",
    unit: "m2",
    category: T,
    components: [
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "area / 30" },
      { type: "MATERIAL", refKey: "MATERIAL:STAHLPLATTEN", qtyFormula: "area" },
      { type: "MACHINE", refKey: "MACHINE:KRAN_LKW", qtyFormula: "area / 120" },
    ],
  },

  // =========================
  // REINIGUNG / ENDREINIGUNG
  // =========================
  {
    key: "BA_REINIGUNG_TAG",
    title: "Reinigung Baustelle je Tag",
    unit: "tag",
    category: T,
    components: [
      { type: "LABOR", refKey: "LABOR:HILFSARBEITER", qtyFormula: "1" },
      { type: "MACHINE", refKey: "MACHINE:KEHRMASCHINE", qtyFormula: "0.5" },
    ],
  },
  {
    key: "BA_ENDREINIGUNG_PAUSCHAL",
    title: "Endreinigung pauschal",
    unit: "pauschal",
    category: T,
    components: [
      { type: "LABOR", refKey: "LABOR:HILFSARBEITER", qtyFormula: "2" },
      { type: "MACHINE", refKey: "MACHINE:KEHRMASCHINE", qtyFormula: "1" },
    ],
  },

  // =========================
  // BAUSTELLENBELEUCHTUNG / SICHERHEIT
  // =========================
  {
    key: "BA_BELEUCHTUNG_TAG",
    title: "Baustellenbeleuchtung je Tag",
    unit: "tag",
    category: T,
    components: [
      { type: "MATERIAL", refKey: "MATERIAL:BAUSTELLENBELEUCHTUNG", qtyFormula: "1" },
      { type: "LABOR", refKey: "LABOR:HILFSARBEITER", qtyFormula: "0.25" },
    ],
  },
  {
    key: "BA_WARNTECHNIK_TAG",
    title: "Warntechnik / Absicherung je Tag",
    unit: "tag",
    category: T,
    components: [
      { type: "MATERIAL", refKey: "MATERIAL:WARNLEUCHTEN", qtyFormula: "1" },
      { type: "MATERIAL", refKey: "MATERIAL:BAKEN_SCHILDER", qtyFormula: "1" },
    ],
  },
];

// 🔁 Expand per arrivare a ~80 template
// 16 base * 5 = 80
const expandedTemplates: TemplateDef[] = [];
for (let i = 0; i < 5; i++) {
  for (const t of baseTemplates) {
    expandedTemplates.push({
      ...t,
      key: `${t.key}_V${i + 1}`,
      title: `${t.title} (Variante ${i + 1})`,
    });
  }
}

async function main() {
  console.log("[seed] kalkulation templates – Block 4 (Baustelle)");

  let templatesUpserted = 0;
  let componentsUpserted = 0;

  for (const t of expandedTemplates) {
    const tpl = await prisma.recipeTemplate.upsert({
      where: { key: t.key },
      update: {
        title: t.title,
        unit: t.unit,
        category: t.category,
      },
      create: {
        key: t.key,
        title: t.title,
        unit: t.unit,
        category: t.category,
      },
    });

    templatesUpserted++;

    // Components: delete & recreate (idempotente)
    await prisma.recipeComponent.deleteMany({ where: { templateId: tpl.id } });

    for (let i = 0; i < t.components.length; i++) {
      const c = t.components[i];
      await prisma.recipeComponent.create({
        data: {
          templateId: tpl.id,
          type: c.type,
          refKey: c.refKey,
          qtyFormula: c.qtyFormula,
          sort: i,
        },
      });
      componentsUpserted++;
    }
  }

  console.log("[seed] done", {
    templates: templatesUpserted,
    components: componentsUpserted,
  });
}

main()
  .catch((e) => {
    console.error("[seed] error", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
