export type MobileEmployeeIdentity = {
  employeeId: string;
  employeeName: string;
  userId: string;
  userName: string;
  key: string;
  label: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function first(...values: unknown[]): string {
  for (const value of values) {
    const current = text(value);
    if (current) return current;
  }
  return "";
}

export function resolveMobileEmployee(doc: Record<string, any>): MobileEmployeeIdentity {
  const submittedBy = doc?.submittedBy || doc?.sender || doc?.creator || {};
  const employee = doc?.employee || doc?.mitarbeiter || doc?.personal || {};

  const employeeId = first(
    submittedBy?.employeeId,
    submittedBy?.mitarbeiterId,
    employee?.id,
    employee?.employeeId,
    employee?.mitarbeiterId,
    doc?.employeeId,
    doc?.mitarbeiterId,
    doc?.personalId
  );

  const employeeName = first(
    submittedBy?.employeeName,
    submittedBy?.mitarbeiterName,
    employee?.name,
    employee?.fullName,
    employee?.displayName,
    doc?.employeeName,
    doc?.mitarbeiterName,
    doc?.mitarbeiter,
    doc?.employee
  );

  const userId = first(
    submittedBy?.userId,
    submittedBy?.id,
    doc?.submittedByUserId,
    doc?.createdByUserId,
    doc?.userId
  );

  const userName = first(
    submittedBy?.userName,
    submittedBy?.name,
    submittedBy?.displayName,
    doc?.submittedByName,
    doc?.createdByName,
    doc?.userName
  );

  const label = employeeName || userName || "Unbekannter Mitarbeiter";
  const key = employeeId || userId || `name:${label.toLocaleLowerCase("de-DE")}`;

  return { employeeId, employeeName, userId, userName, key, label };
}

export function groupByMobileEmployee<T extends Record<string, any>>(rows: T[]) {
  const groups = new Map<string, { identity: MobileEmployeeIdentity; rows: T[] }>();

  rows.forEach((row) => {
    const identity = resolveMobileEmployee(row);
    const current = groups.get(identity.key);
    if (current) current.rows.push(row);
    else groups.set(identity.key, { identity, rows: [row] });
  });

  return Array.from(groups.values()).sort((a, b) =>
    a.identity.label.localeCompare(b.identity.label, "de-DE")
  );
}
