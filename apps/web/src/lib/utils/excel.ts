/* apps/web/src/lib/utils/excel.ts */
import * as XLSX from "xlsx";

export type Column<T> = { header: string; key: keyof T };
export function exportToXlsx<T extends object>(fileName: string, rows: T[], columns: Column<T>[]) {
  const data = [ columns.map(c => String(c.header)) ];
  for (const r of rows) data.push(columns.map(c => (r[c.key] as any) ?? ""));
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Aufmass");
  XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}
