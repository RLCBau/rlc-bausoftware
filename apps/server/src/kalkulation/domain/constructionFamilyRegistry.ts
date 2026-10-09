export type RlcConstructionFamilyId =
  | "ERDARBEITEN"
  | "KANALBAU"
  | "KABELBAU"
  | "STRASSENBAU"
  | "BETON_STAHLBETON"
  | "MAUERWERK"
  | "HOLZBAU"
  | "TROCKENBAU"
  | "DACH"
  | "FASSADE"
  | "ELEKTRO"
  | "SHK"
  | "LANDSCHAFTSBAU"
  | "ABBRUCH"
  | "SPEZIALTIEFBAU"
  | "ALLGEMEIN";

export type RlcConstructionFamily = {
  id: RlcConstructionFamilyId;
  label: string;
  trade: string;
  keywords: string[];
  technicalModule?: string;
};

export const RLC_CONSTRUCTION_FAMILIES: RlcConstructionFamily[] = [
  {
    id: "KANALBAU",
    label: "Kanal- und Abwasserbau",
    trade: "Tiefbau",
    keywords: [
      "kanal", "abwasser", "kanalrohr", "schacht", "haltung",
      "kanalrohrleitung", "rohrleitung", "dn300", "dn400"
    ],
    technicalModule: "trenchRules",
  },
  {
    id: "KABELBAU",
    label: "Kabel- und Leitungstiefbau",
    trade: "Tiefbau",
    keywords: [
      "kabelgraben", "kabelschutzrohr", "erdkabel",
      "stromkabel", "glasfaser", "lwl", "speedpipe"
    ],
    technicalModule: "trenchRules",
  },
  {
    id: "ERDARBEITEN",
    label: "Erdarbeiten",
    trade: "Tiefbau",
    keywords: [
      "aushub", "ausheben", "erdarbeiten", "auskofferung",
      "auffüllung", "verfüllung", "bodenaushub", "bodenabtrag",
      "rohrgraben", "graben ausheben",
      "leitungsgraben", "baugrube", "frostschutz",
      "schottertragschicht", "mineralgemisch",
      "kies", "schotter"
    ],
  },
  {
    id: "STRASSENBAU",
    label: "Straßen- und Oberflächenbau",
    trade: "Tiefbau",
    keywords: [
      "asphalt", "fahrbahn", "straße", "strasse",
      "tragschicht", "deckschicht", "pflaster", "bordstein"
    ],
  },
  {
    id: "SPEZIALTIEFBAU",
    label: "Spezialtiefbau",
    trade: "Tiefbau",
    keywords: [
      "bohrpfahl", "spundwand", "anker", "injektion",
      "hdd", "spülbohr", "grabenlos"
    ],
  },
  {
    id: "BETON_STAHLBETON",
    label: "Beton- und Stahlbetonbau",
    trade: "Hochbau",
    keywords: [
      "beton", "stahlbeton", "bewehrung",
      "schalung", "fundament", "bodenplatte"
    ],
  },
  {
    id: "MAUERWERK",
    label: "Mauerwerksbau",
    trade: "Hochbau",
    keywords: [
      "mauerwerk", "ziegel", "kalksandstein",
      "porenbeton", "mauer"
    ],
  },
  {
    id: "HOLZBAU",
    label: "Holzbau",
    trade: "Holzbau",
    keywords: [
      "holzbau", "holzrahmen", "holzdachstuhl", "dachstuhl",
      "balken", "sparren", "brettschichtholz", "bsh", "kvh"
    ],
  },
  {
    id: "TROCKENBAU",
    label: "Trockenbau",
    trade: "Ausbau",
    keywords: [
      "trockenbau", "gipskarton", "ständerwand",
      "staenderwand", "abhängdecke", "abhaengdecke"
    ],
  },
  {
    id: "DACH",
    label: "Dacharbeiten",
    trade: "Dach",
    keywords: [
      "dach", "dachdeckung", "dachziegel",
      "dachabdichtung", "dachrinne"
    ],
  },
  {
    id: "FASSADE",
    label: "Fassadenarbeiten",
    trade: "Fassade",
    keywords: [
      "fassade", "wdvs", "außenputz",
      "aussenputz", "fassadenbekleidung"
    ],
  },
  {
    id: "ELEKTRO",
    label: "Elektroinstallation",
    trade: "Elektro",
    keywords: [
      "elektroinstallation", "steckdose", "schalter",
      "verteiler", "beleuchtung", "leuchte", "leuchten",
      "kabelinstallation"
    ],
  },
  {
    id: "SHK",
    label: "Sanitär Heizung Klima",
    trade: "SHK",
    keywords: [
      "sanitär", "sanitaer", "heizung",
      "lüftung", "lueftung", "wärmepumpe", "waermepumpe",
      "trinkwasser", "trinkwasserleitung", "wasserleitung",
      "heizungsleitung", "heizkörper", "heizkoerper",
      "waschtisch", "wc", "armatur"
    ],
  },
  {
    id: "LANDSCHAFTSBAU",
    label: "Landschaftsbau",
    trade: "GaLaBau",
    keywords: [
      "landschaftsbau", "grünfläche", "gruenflaeche",
      "pflanzung", "rasen", "gartenbau"
    ],
  },
  {
    id: "ABBRUCH",
    label: "Abbruch und Rückbau",
    trade: "Abbruch",
    keywords: [
      "abbruch", "rückbau", "rueckbau",
      "demontage", "abbrechen"
    ],
  },
];

function normalizeFamilyText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsKeyword(text: string, keyword: string): boolean {
  const normalizedKeyword = normalizeFamilyText(keyword);
  if (!normalizedKeyword) return false;

  const tokens = text.split(" ");

  // Mehrwort-Begriffe exakt als Phrase.
  if (normalizedKeyword.includes(" ")) {
    return (` ${text} `).includes(` ${normalizedKeyword} `);
  }

  // Deutsche Komposita unterstützen:
  // kanal -> Abwasserkanal
  // holzrahmen -> Holzrahmenwand
  // kanalrohr -> Kanalrohrverlegung
  //
  // Kurze Kürzel nur exakt matchen, damit z.B. "bsh" oder "lwl"
  // keine zufälligen Teiltreffer erzeugen.
  /*
   * Fachlich mehrdeutige Begriffe dürfen nicht über Komposita-Suffixe
   * matchen. Beispiel:
   * Kanalbau "Haltung" darf "Aufrechterhaltung" nicht als Kanal-Haltung
   * klassifizieren.
   */
  const exactOnlyKeywords = new Set([
    "haltung",
  ]);

  if (exactOnlyKeywords.has(normalizedKeyword)) {
    return tokens.some((token) => token === normalizedKeyword);
  }

  return tokens.some((token) =>
    normalizedKeyword.length <= 3
      ? token === normalizedKeyword
      : token === normalizedKeyword ||
        token.startsWith(normalizedKeyword) ||
        token.endsWith(normalizedKeyword)
  );
}

export function detectRlcConstructionFamilies(
  input: string
): RlcConstructionFamily[] {
  const text = normalizeFamilyText(input);

  const matches = RLC_CONSTRUCTION_FAMILIES
    .map((family, familyIndex) => {
      const matchedKeywords = family.keywords.filter((keyword) =>
        containsKeyword(text, keyword)
      );

      /*
       * Tätigkeitsfamilien haben Vorrang vor dem bearbeiteten Material.
       * Beispiel:
       * "Ziegelmauerwerk abbrechen" ist ABBRUCH, nicht MAUERWERK.
       *
       * Der Bonus bleibt zentral im Family Registry und wird nicht
       * gewerkspezifisch in die Recipe Engine eingebaut.
       */
      const dominantActionBonus =
        family.id === "ABBRUCH" &&
        matchedKeywords.some((keyword) =>
          ["abbruch", "rückbau", "rueckbau", "demontage", "abbrechen"]
            .includes(normalizeFamilyText(keyword))
        )
          ? 100
          : 0;

      return {
        family,
        familyIndex,
        score: matchedKeywords.length + dominantActionBonus,
      };
    })
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.familyIndex - b.familyIndex
    );

  return matches.map((x) => x.family);
}

export function detectPrimaryRlcConstructionFamily(
  input: string
): RlcConstructionFamily {
  return (
    detectRlcConstructionFamilies(input)[0] || {
      id: "ALLGEMEIN",
      label: "Allgemeine Bauleistung",
      trade: "Allgemein",
      keywords: [],
    }
  );
}
