import * as XLSX from "xlsx";

function sanitizeExcelValue(value: any): string | number | null {
  if (value === null || value === undefined) return "";

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return value;
}

function buildWorksheet(data: any[]): XLSX.WorkSheet {
  const sanitizedData = data.map((row) => {
    const sanitizedRow: Record<string, string | number | null> = {};
    for (const key of Object.keys(row)) {
      sanitizedRow[key] = sanitizeExcelValue(row[key]);
    }
    return sanitizedRow;
  });

  const worksheet = XLSX.utils.json_to_sheet(sanitizedData);

  const headers = Object.keys(sanitizedData[0] || {});
  worksheet["!cols"] = headers.map((header) => {
    const maxLength = Math.max(
      header.length,
      ...sanitizedData.map((row) => String(row[header] ?? "").length)
    );
    return { wch: Math.min(Math.max(maxLength + 2, 12), 50) };
  });

  return worksheet;
}

export function exportReportToExcel(data: any[], fileName: string) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("No data available to export.");
  }

  const worksheet = buildWorksheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Report");

  XLSX.writeFile(workbook, fileName);
}
