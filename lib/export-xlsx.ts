// Client-side Excel export. Call only from "use client" components.
export async function exportToExcel(filename: string, rows: Record<string, any>[], sheetName = "Sheet1") {
  if (!rows || rows.length === 0) {
    alert("Nothing to export.");
    return;
  }
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
