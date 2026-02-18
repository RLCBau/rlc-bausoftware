// apps/web/src/utils/excel.ts
import * as XLSX from 'xlsx';

export interface ExportColumn<T> {
  key: keyof T;
  header: string;
}

export function exportToXlsx<T extends Record<string, any>>(
  fileName: string,
  columns: ExportColumn<T>[],
  rows: T[]
) {
  const data = [
    columns.map(c => c.header),
    ...rows.map(r => columns.map(c => r[c.key] ?? '')),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Aufmass');
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}


