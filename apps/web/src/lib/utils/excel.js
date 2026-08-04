/* apps/web/src/lib/utils/excel.ts */
import * as XLSX from "xlsx";
function normalizeCell(value) {
    if (value == null)
        return "";
    if (value instanceof Date)
        return value.toISOString();
    if (typeof value === "number")
        return Number.isFinite(value) ? value : "";
    if (typeof value === "boolean")
        return value;
    return String(value);
}
function buildColumnWidths(rows, columns) {
    return columns.map((col) => {
        const headerLen = String(col.header).length;
        const maxRowLen = rows.reduce((max, row) => {
            const cell = normalizeCell(row[col.key]);
            return Math.max(max, String(cell).length);
        }, 0);
        return { wch: Math.min(Math.max(headerLen, maxRowLen, 10), 40) };
    });
}
export function exportToXlsx(fileName, rows, columns, sheetName = "Aufmass") {
    const data = [
        columns.map((c) => String(c.header)),
    ];
    for (const row of rows) {
        data.push(columns.map((c) => normalizeCell(row[c.key])));
    }
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = buildColumnWidths(rows, columns);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const safeFileName = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
    XLSX.writeFile(wb, safeFileName);
}
