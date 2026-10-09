import type { RlcConstructionFamilyId } from "../domain/constructionFamilyRegistry";

export type RlcGeneratedLvValidationIssue = {
  rowIndex: number;
  posNr?: string;
  kurztext: string;
  code: "SOURCE_SUPPORT_WEAK";
  severity: "review";
  reason: string;
};

export type RlcGeneratedLvValidationResult<T> = {
  rows: T[];
  issues: RlcGeneratedLvValidationIssue[];
};

function normalize(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((x) => x.length >= 4);
}

function hasSourceSupport(source: string, rowText: string): boolean {
  const sourceTokens = new Set(tokens(source));
  const rowTokens = tokens(rowText);

  if (!rowTokens.length) return false;

  return rowTokens.some((token) => sourceTokens.has(token));
}

export function validateGeneratedLvRows<T extends {
  posNr?: string;
  kurztext?: string;
  langtext?: string;
}>(
  sourceText: string,
  rows: T[],
  _families: RlcConstructionFamilyId[]
): RlcGeneratedLvValidationResult<T> {
  const issues: RlcGeneratedLvValidationIssue[] = [];

  rows.forEach((row, rowIndex) => {
    const kurztext = String(row.kurztext || "").trim();
    const rowText = `${kurztext} ${String(row.langtext || "")}`;

    if (!hasSourceSupport(sourceText, rowText)) {
      issues.push({
        rowIndex,
        posNr: row.posNr,
        kurztext,
        code: "SOURCE_SUPPORT_WEAK",
        severity: "review",
        reason:
          "Die generierte Leistung hat keine ausreichend direkte sprachliche Stütze in der Projektbeschreibung.",
      });
    }
  });

  return {
    rows,
    issues,
  };
}
