export type VorlageLayout =
  | "BRIEF"
  | "CHECKLISTE"
  | "FORMULAR"
  | "NACHWEIS"
  | "PLAN"
  | "PROTOKOLL"
  | "REGISTER"
  | "BERICHT"
  | "VERTRAG"
  | "UNTERWEISUNG";

export type VorlageBlueprint = {
  categoryKey: string;
  title: string;
  layout: VorlageLayout;
  fields: string[];
  columns: string[];
  checks: string[];
  resultLabel: string;
  signers: string[];
};

export type CompactBlueprint = readonly [
  title: string,
  layout: VorlageLayout,
  fields: string,
  columns: string,
  checks: string,
  resultLabel?: string,
  signers?: string,
];

function parts(value: string): string[] {
  return value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function categoryBlueprints(
  categoryKey: string,
  rows: readonly CompactBlueprint[]
): VorlageBlueprint[] {
  return rows.map(
    ([title, layout, fields, columns, checks, resultLabel, signers]) => ({
      categoryKey,
      title,
      layout,
      fields: parts(fields),
      columns: parts(columns),
      checks: parts(checks),
      resultLabel: resultLabel?.trim() || "Ergebnis / Festlegung",
      signers: parts(signers || "Aufgestellt durch|Geprüft / freigegeben durch"),
    })
  );
}
