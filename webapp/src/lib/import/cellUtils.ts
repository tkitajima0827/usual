// SBI証券のExcel/CSVエクスポートは日付・数値ともに表記ゆれが大きいため、
// 値の型を問わず可能な限り解釈するユーティリティ群。

const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30));

export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "text" in (value as Record<string, unknown>)) {
    // exceljs rich text / hyperlink cell
    return String((value as { text: unknown }).text ?? "");
  }
  return String(value).trim();
}

export function parseNumberCell(value: unknown): number {
  const raw = cellToString(value);
  if (!raw || raw === "--" || raw === "-" || raw === "－") return 0;
  const normalized = raw.replace(/,/g, "").replace(/円/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseNullableNumberCell(value: unknown): number | null {
  const raw = cellToString(value);
  if (!raw || raw === "--" || raw === "-" || raw === "－") return null;
  return parseNumberCell(value);
}

export function parseDateCell(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }

  if (typeof value === "number") {
    // Excel serial date (days since 1899-12-30)
    const ms = value * 24 * 60 * 60 * 1000;
    return new Date(EXCEL_EPOCH.getTime() + ms);
  }

  const raw = cellToString(value);
  if (!raw || raw === "--" || raw === "-") return null;

  // "2026/02/28" or "2026-02-28"
  let m = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  }

  // "2/2/2026" (M/D/YYYY) as emitted by some SBI/Google Sheets exports
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, mo, d, y] = m;
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
