import { InputError } from "./officeAddons";

export function planningDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new InputError("Datum muss YYYY-MM-DD entsprechen.");
  const date = new Date(value + "T12:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new InputError("Ungültiges Kalenderdatum.");
  return value;
}
export function planningRange(from: unknown, to: unknown) {
  const start = planningDate(from), end = planningDate(to);
  if (start > end) throw new InputError("Das Enddatum liegt vor dem Startdatum.");
  return { gte: new Date(start + "T00:00:00.000Z"), lte: new Date(end + "T23:59:59.999Z") };
}
export function planningHours(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== "number" && typeof value !== "string") throw new InputError("Ungültige Stunden.");
  const text = String(value).trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new InputError("Ungültige Stunden.");
  const hours = Number(text);
  if (!Number.isFinite(hours) || hours < 0 || hours > 24) throw new InputError("Stunden müssen zwischen 0 und 24 liegen.");
  return hours;
}
export function planningNotes(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > 5000) throw new InputError("Notizen dürfen höchstens 5000 Zeichen enthalten.");
  return value.trim() || null;
}
