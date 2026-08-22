import ExcelJS from "exceljs";
import Papa from "papaparse";

/** アップロードされたファイルを行×列の生の値の配列に変換する。 */
export async function readRowsFromFile(
  fileName: string,
  buffer: Buffer,
): Promise<unknown[][]> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) {
    return readRowsFromCsv(buffer);
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return readRowsFromXlsx(buffer);
  }
  throw new Error("対応していないファイル形式です（.xlsx / .csv のみ対応）");
}

async function readRowsFromXlsx(buffer: Buffer): Promise<unknown[][]> {
  const workbook = new ExcelJS.Workbook();
  // exceljsの型定義がグローバルBufferをArrayBuffer拡張で再宣言しているため、
  // 新しいNode.jsの型(Buffer<ArrayBufferLike>)とは構造的に噛み合わない。実行時には問題ないためキャストする。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values = row.values as unknown[];
    // ExcelJS's row.values is 1-indexed with index 0 empty; normalize to 0-indexed.
    rows.push(values.slice(1));
  });
  return rows;
}

function readRowsFromCsv(buffer: Buffer): unknown[][] {
  // SBI証券のCSVはShift_JISで出力されることが多いが、
  // ここではUTF-8を優先しつつ文字化けが疑われる場合はShift_JISとして再デコードする。
  let text = buffer.toString("utf-8");
  if (text.includes("�")) {
    text = decodeShiftJis(buffer);
  }
  const result = Papa.parse<string[]>(text, { skipEmptyLines: false });
  return result.data;
}

function decodeShiftJis(buffer: Buffer): string {
  try {
    const decoder = new TextDecoder("shift-jis" as never);
    return decoder.decode(buffer);
  } catch {
    return buffer.toString("utf-8");
  }
}
