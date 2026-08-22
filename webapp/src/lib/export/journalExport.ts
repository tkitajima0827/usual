import ExcelJS from "exceljs";

export interface JournalExportRow {
  date: Date;
  debitAccount: string;
  debitSubAccount: string | null;
  debitAmount: number;
  creditAccount: string;
  creditSubAccount: string | null;
  creditAmount: number;
  memo: string;
}

// MFクラウド会計の仕訳インポートCSVの標準的な列構成
// (借方/貸方それぞれ 勘定科目・補助科目・部門・税区分・金額 を持つ形式)。
export const JOURNAL_HEADERS = [
  "取引日",
  "借方勘定科目",
  "借方補助科目",
  "借方部門",
  "借方税区分",
  "借方金額",
  "貸方勘定科目",
  "貸方補助科目",
  "貸方部門",
  "貸方税区分",
  "貸方金額",
  "摘要",
  "仕訳メモ",
];

function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

function toRowValues(row: JournalExportRow): (string | number)[] {
  return [
    formatDate(row.date),
    row.debitAccount,
    row.debitSubAccount ?? "",
    "",
    "対象外",
    row.debitAmount,
    row.creditAccount,
    row.creditSubAccount ?? "",
    "",
    "対象外",
    row.creditAmount,
    row.memo,
    "",
  ];
}

export function buildJournalCsv(rows: JournalExportRow[]): string {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [JOURNAL_HEADERS.map(escape).join(",")];
  for (const row of rows) {
    lines.push(toRowValues(row).map(escape).join(","));
  }
  // MF会計インポートはShift_JISを要求されることが多いためBOM付きUTF-8で出力し、
  // 文字化けする場合はExcel形式(.xlsx)の利用を案内する。
  return "﻿" + lines.join("\r\n");
}

export async function buildJournalXlsx(rows: JournalExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("仕訳");
  sheet.addRow(JOURNAL_HEADERS);
  for (const row of rows) {
    sheet.addRow(toRowValues(row));
  }
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((col) => {
    col.width = 16;
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
