export type ExternalKnowledgeSourceType =
  | "norm"
  | "index"
  | "manufacturer"
  | "public_law"
  | "technical_sheet"
  | "price_index"
  | "market_reference";

export type ExternalKnowledgeItem = {
  id: string;
  sourceType: ExternalKnowledgeSourceType;
  sourceName: string;
  sourceUrl?: string;
  title: string;
  family: string;
  keywords: string[];
  unit?: string;
  minEp?: number;
  avgEp?: number;
  maxEp?: number;
  confidence: number;
  validFrom?: string;
  validTo?: string;
  region?: string;
  notes?: string;
};

export type ExternalKnowledgeMatch = ExternalKnowledgeItem & {
  score: number;
};

function norm(v: any): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[ä]/g, "ae")
    .replace(/[ö]/g, "oe")
    .replace(/[ü]/g, "ue")
    .replace(/[ß]/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

export const RLC_EXTERNAL_KNOWLEDGE_V1: ExternalKnowledgeItem[] = [
  {
    id: "ext-fgsv-pflaster-oberbau-v1",
    sourceType: "norm",
    sourceName: "FGSV/ZTV Pflasterbau Kontext",
    title: "Pflasterflächen benötigen tragfähigen Oberbau, Bettung, Fugen und Verdichtung",
    family: "pflaster",
    keywords: ["pflaster", "betonpflaster", "natursteinpflaster", "bettung", "fuge", "verdichten"],
    unit: "m2",
    confidence: 0.74,
    notes: "Technischer Kontext für Urkalkulation, kein kopierter Marktpreis."
  },
  {
    id: "ext-kanal-rohrgraben-v1",
    sourceType: "technical_sheet",
    sourceName: "RLC Tiefbau Standardwissen",
    title: "Rohrgraben benötigt Aushub, Bettung, Verfüllung, Verdichtung und Entsorgung",
    family: "rohrgraben",
    keywords: ["rohrgraben", "kanalgraben", "aushub", "bettung", "verfuellung", "verdichtung"],
    unit: "m",
    confidence: 0.78,
    notes: "Technischer Kontext für Leistungsaufbau."
  },
  {
    id: "ext-kabelschutzrohr-v1",
    sourceType: "manufacturer",
    sourceName: "Allgemeine Herstellerlogik Kabelschutzrohre",
    title: "Kabelschutzrohr-Positionen hängen stark von DN, Material, Grabentiefe und Oberfläche ab",
    family: "kabelschutzrohr",
    keywords: ["kabelschutzrohr", "schutzrohr", "dn", "pe-hd", "strom", "telekom", "glasfaser"],
    unit: "m",
    confidence: 0.72,
    notes: "Hilft der KI bei Kontextbewertung, nicht als Preisanker."
  }
];

export function findExternalKnowledgeMatches(input: {
  text?: string;
  kurztext?: string;
  langtext?: string;
  unit?: string;
  family?: string;
  limit?: number;
}): ExternalKnowledgeMatch[] {
  const hay = norm(`${input.text || ""} ${input.kurztext || ""} ${input.langtext || ""} ${input.family || ""}`);
  const unit = norm(input.unit);
  const limit = Math.max(1, Math.min(10, Number(input.limit || 5)));

  const matches = RLC_EXTERNAL_KNOWLEDGE_V1.map((item) => {
    let score = 0;
    const family = norm(item.family);
    if (family && hay.includes(family)) score += 35;
    for (const kw of item.keywords) {
      if (hay.includes(norm(kw))) score += 12;
    }
    if (item.unit && unit && norm(item.unit) === unit) score += 10;
    score += Math.round(item.confidence * 10);
    return { ...item, score };
  })
    .filter((x) => x.score >= 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return matches;
}
