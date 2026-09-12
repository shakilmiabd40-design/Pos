// Client-side Excel/CSV import. Call only from "use client" components.
// Reads the first sheet and returns an array of row objects keyed by
// header name (whatever the first row's column headers are).
export async function importFromExcel(file: File): Promise<Record<string, any>[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}
