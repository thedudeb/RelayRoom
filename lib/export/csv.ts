export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]) {
  const header = columns.map(escapeCsvCell).join(",");
  const body = rows.map((row) => columns.map((column) => escapeCsvCell(row[column])).join(","));
  return [header, ...body].join("\r\n");
}

export function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8"
    }
  });
}

function escapeCsvCell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const raw = value instanceof Date ? value.toISOString() : String(value);
  const spreadsheetSafe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${spreadsheetSafe.replace(/"/g, '""')}"`;
}
