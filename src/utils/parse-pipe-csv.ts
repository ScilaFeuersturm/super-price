import { parse } from "csv-parse/sync";

function detectDelimiter(headerLine: string): string {
  if (headerLine.includes("|")) return "|";
  if (headerLine.includes(";")) return ";";
  if (headerLine.includes(",")) return ",";
  return "|";
}

function sanitizeCsvContent(content: string): string {
  return content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function findHeaderStart(lines: string[]): number {
  return lines.findIndex((line) => {
    const normalized = line.trim().toLowerCase();

    return (
      normalized.includes("id_comercio") ||
      normalized.includes("id_sucursal") ||
      normalized.includes("id_producto")
    );
  });
}

export function parsePipeCsv<T>(content: string): T[] {
  const sanitized = sanitizeCsvContent(content);

  const lines = sanitized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^&#\d+;$/i.test(line))
    .filter((line) => !/^&#+\d+;$/i.test(line));

  const headerIndex = findHeaderStart(lines);

  if (headerIndex === -1) {
    throw new Error("No se encontró una fila de encabezado válida en el CSV");
  }

  const csvContent = lines.slice(headerIndex).join("\n");
  const firstLine = lines[headerIndex] ?? "";
  const delimiter = detectDelimiter(firstLine);

  return parse(csvContent, {
    columns: true,
    delimiter,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
    skip_records_with_error: true
  }) as T[];
}