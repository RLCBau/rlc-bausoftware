export const guaranteeTypes = ["Vertragserfüllung", "Gewährleistung", "Vorauszahlung", "Sonstige"] as const;
export const guaranteeStatuses = ["Entwurf", "Aktiv", "Freigabe beantragt", "Zurückgegeben", "Archiviert"] as const;
export const certificateTypes = ["Freistellungsbescheinigung", "Unbedenklichkeitsbescheinigung", "Versicherung", "Gewerbeanmeldung", "Qualifikation", "Sonstige"] as const;
export const certificateStatuses = ["Ungeprüft", "Geprüft", "Abgelehnt", "Archiviert"] as const;
export class InputError extends Error {}
function text(v: unknown, name: string, max: number, required = false): string {
  if (v != null && typeof v !== "string") throw new InputError(name + ": Text erwartet.");
  const s = String(v ?? "").trim();
  if ((required && !s) || s.length > max) throw new InputError(name + ": ungültige Länge.");
  return s;
}
function date(v: unknown, name: string): Date | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new InputError(name + ": Datum erwartet.");
  const d = new Date(v + "T00:00:00.000Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new InputError(name + ": ungültiges Datum.");
  return d;
}
function choice(v: unknown, values: readonly string[], name: string): string {
  if (typeof v !== "string" || !values.includes(v)) throw new InputError(name + ": ungültiger Wert.");
  return v;
}
export function input(kind: "guarantees" | "certificates", b: any) {
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new InputError("Ungültige Eingabe.");
  const common = {
    title: text(b.title, "Bezeichnung", 250, true),
    contractId: text(b.contractId, "Vertrag", 100) || null,
    documentId: text(b.documentId, "Dokument", 100) || null,
    notes: text(b.notes, "Bemerkung", 5000) || null,
    validFrom: date(b.validFrom, "Gültig ab"),
    validUntil: date(b.validUntil, "Gültig bis"),
  };
  if (common.validFrom && common.validUntil && common.validUntil < common.validFrom) throw new InputError("Enddatum liegt vor dem Beginn.");
  if (kind === "certificates") {
    if (!common.contractId) throw new InputError("Liefer- oder Nachunternehmervertrag erforderlich.");
    return { ...common, ...(Object.prototype.hasOwnProperty.call(b,"supplierPartyId") ? {supplierPartyId:text(b.supplierPartyId,"Lieferant",100)||null} : {}), issuer: text(b.issuer, "Aussteller", 250), type: choice(b.type, certificateTypes, "Nachweisart"),
      status: choice(b.status, certificateStatuses, "Status") };
  }
  const amount = b.amount;
  if (typeof amount !== "string" && typeof amount !== "number") throw new InputError("Betrag fehlt.");
  if (!/^\d{1,12}([.,]\d{1,2})?$/.test(String(amount))) throw new InputError("Betrag muss positiv sein und höchstens zwei Nachkommastellen haben.");
  return { ...common, issuer: text(b.issuer, "Bürge", 250, true), number: text(b.number, "Bürgschaftsnummer", 100, true),
    amount: String(amount).replace(",", "."), type: choice(b.type, guaranteeTypes, "Bürgschaftsart"),
    status: choice(b.status, guaranteeStatuses, "Status") };
}
export function transition(kind: "guarantees" | "certificates", before: string, after: string) {
  if (before === after) return;
  const rules: Record<string, string[]> = kind === "guarantees" ? {
    "Entwurf": ["Aktiv", "Archiviert"], "Aktiv": ["Freigabe beantragt", "Archiviert"],
    "Freigabe beantragt": ["Aktiv", "Zurückgegeben"], "Zurückgegeben": ["Archiviert"], "Archiviert": [],
  } : { "Ungeprüft": ["Geprüft", "Abgelehnt", "Archiviert"], "Geprüft": ["Ungeprüft", "Abgelehnt", "Archiviert"],
    "Abgelehnt": ["Ungeprüft", "Archiviert"], "Archiviert": [] };
  if (!rules[before]?.includes(after)) throw new InputError("Dieser Statuswechsel ist nicht zulässig.");
}
export function expiryStatus(validUntil: Date | string | null, now = new Date()) {
  if (!validUntil) return "Ohne Frist";
  const day = new Date(now.toISOString().slice(0, 10) + "T00:00:00.000Z");
  const end = new Date(validUntil);
  const days = Math.floor((end.getTime() - day.getTime()) / 86400000);
  return days < 0 ? "Abgelaufen" : days <= 30 ? "Fällig in 30 Tagen" : "Gültig";
}
