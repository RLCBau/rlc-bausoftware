export type RlcPriceSourceQualityStatus =
  | "KI-Vorschlag"
  | "Geprüft"
  | "Freigegeben"
  | "Gesperrt"
  | "Nicht verwenden"
  | "";

function text(value: unknown): string {
  return String(value ?? "").trim();
}

export function rlcPriceSourceQualityStatus(row: any): RlcPriceSourceQualityStatus {
  const raw = text(
    row?.parameters?.qualityGateStatus ??
    row?.parameter?.qualityGateStatus ??
    row?.context?.qualityGateStatus
  );

  const normalized = raw.toLowerCase();

  if (normalized === "ki-vorschlag") return "KI-Vorschlag";
  if (normalized === "geprüft" || normalized === "geprueft") return "Geprüft";
  if (normalized === "freigegeben") return "Freigegeben";
  if (normalized === "gesperrt") return "Gesperrt";
  if (normalized === "nicht verwenden") return "Nicht verwenden";

  return "";
}

export function isRlcPriceSourceBlocked(row: any): boolean {
  const status = rlcPriceSourceQualityStatus(row);

  return status === "Gesperrt" || status === "Nicht verwenden";
}

export function filterUsableRlcPriceSources<T>(rows: T[]): T[] {
  return rows.filter((row) => !isRlcPriceSourceBlocked(row));
}
