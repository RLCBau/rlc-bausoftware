// apps/web/src/utils/excel.ts
import * as XLSX from "xlsx";

export interface ExportColumn<T extends Record<string, unknown>> {
  key: keyof T;
  header: string;
}

function normalizeCell(value: unknown): string | number | boolean {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  if (typeof value === "boolean") return value;
  return String(value);
}

function buildColumnWidths<T extends Record<string, unknown>>(
  columns: ExportColumn<T>[],
  rows: T[]
): { wch: number }[] {
  return columns.map((col) => {
    const headerLen = String(col.header).length;
    const maxRowLen = rows.reduce((max, row) => {
      const value = normalizeCell(row[col.key]);
      return Math.max(max, String(value).length);
    }, 0);

    return { wch: Math.min(Math.max(headerLen, maxRowLen, 10), 40) };
  });
}

export function exportToXlsx<T extends Record<string, unknown>>(
  fileName: string,
  columns: ExportColumn<T>[],
  rows: T[],
  sheetName = "Aufmass"
) {
  const data: Array<Array<string | number | boolean>> = [
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((c) => normalizeCell(row[c.key]))),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = buildColumnWidths(columns, rows);

  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const safeFileName = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  XLSX.writeFile(wb, safeFileName);
}





