import { unzipSync } from 'fflate';

export type LargeXlsxTable = {
  headerRowNumber: number;
  sheetName: string;
  table: unknown[][];
};

type WorkbookSheet = {
  name: string;
  path: string;
};

const XML_DECODER = new TextDecoder('utf-8');
const WORKSHEET_CHUNK_SIZE = 1_000_000;

export function readLargeXlsxTable(buffer: ArrayBuffer): LargeXlsxTable {
  const bytes = new Uint8Array(buffer);
  const metadataFiles = unzipSync(bytes, {
    filter: (file) =>
      file.name === 'xl/workbook.xml' ||
      file.name === 'xl/_rels/workbook.xml.rels' ||
      file.name === 'xl/sharedStrings.xml',
  });
  const workbookXml = decodeZipEntry(metadataFiles, 'xl/workbook.xml');
  const relsXml = decodeZipEntry(metadataFiles, 'xl/_rels/workbook.xml.rels');
  const sheets = workbookSheets(workbookXml, relsXml);
  const selectedSheet = selectWorkbookSheet(sheets);
  const worksheetFiles = unzipSync(bytes, {
    filter: (file) => file.name === selectedSheet.path,
  });
  const sheetBytes = worksheetFiles[selectedSheet.path];
  if (!sheetBytes) throw new Error(`The worksheet "${selectedSheet.name}" could not be read.`);
  const sharedStrings = parseSharedStrings(metadataFiles['xl/sharedStrings.xml']);
  const table = parseWorksheetRows(sheetBytes, sharedStrings);
  const headerIndex = table.findIndex((row) => likelyHeaderRow(row));
  return {
    headerRowNumber: headerIndex >= 0 ? headerIndex + 1 : 1,
    sheetName: selectedSheet.name,
    table: headerIndex > 0 ? table.slice(headerIndex) : table,
  };
}

function decodeZipEntry(files: Record<string, Uint8Array>, path: string): string {
  const bytes = files[path];
  if (!bytes) throw new Error(`The Excel workbook is missing ${path}.`);
  return XML_DECODER.decode(bytes);
}

function workbookSheets(workbookXml: string, relsXml: string): WorkbookSheet[] {
  const targetsByRid = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = parseAttributes(match[1] ?? '');
    const id = attrs.Id;
    const target = attrs.Target;
    if (!id || !target) continue;
    targetsByRid.set(id, normalizeWorkbookTarget(target));
  }

  const sheets: WorkbookSheet[] = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = parseAttributes(match[1] ?? '');
    const name = attrs.name;
    const rid = attrs['r:id'];
    const path = rid ? targetsByRid.get(rid) : null;
    if (name && path) sheets.push({ name: decodeXml(name), path });
  }
  return sheets;
}

function normalizeWorkbookTarget(target: string): string {
  const normalized = target.replace(/\\/g, '/').replace(/^\//, '');
  return normalized.startsWith('xl/') ? normalized : `xl/${normalized}`;
}

function selectWorkbookSheet(sheets: WorkbookSheet[]): WorkbookSheet {
  if (!sheets.length) throw new Error('The Excel workbook does not contain any worksheets.');
  return sheets.find((sheet) => sheet.name.trim().toLowerCase() === 'data') ?? sheets[0];
}

function parseSharedStrings(bytes: Uint8Array | undefined): string[] {
  if (!bytes) return [];
  const xml = XML_DECODER.decode(bytes);
  return Array.from(xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)).map((match) => {
    const itemXml = match[1] ?? '';
    const textRuns = Array.from(itemXml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)).map((textMatch) => decodeXml(textMatch[1] ?? ''));
    return textRuns.join('');
  });
}

function parseWorksheetRows(sheetBytes: Uint8Array, sharedStrings: string[]): unknown[][] {
  const rows: unknown[][] = [];
  const decoder = new TextDecoder('utf-8');
  let carry = '';
  for (let offset = 0; offset < sheetBytes.length; offset += WORKSHEET_CHUNK_SIZE) {
    const end = Math.min(sheetBytes.length, offset + WORKSHEET_CHUNK_SIZE);
    carry += decoder.decode(sheetBytes.subarray(offset, end), { stream: end < sheetBytes.length });
    carry = consumeCompleteRows(carry, rows, sharedStrings, end >= sheetBytes.length);
  }
  return rows;
}

function consumeCompleteRows(xml: string, rows: unknown[][], sharedStrings: string[], final: boolean): string {
  let searchFrom = 0;
  while (true) {
    const rowStart = xml.indexOf('<row', searchFrom);
    if (rowStart < 0) break;
    const openEnd = xml.indexOf('>', rowStart);
    if (openEnd < 0) break;
    const selfClose = xml.charCodeAt(openEnd - 1) === 47;
    if (selfClose) {
      searchFrom = openEnd + 1;
      continue;
    }
    const rowEnd = xml.indexOf('</row>', openEnd);
    if (rowEnd < 0) break;
    rows.push(parseWorksheetRow(xml.slice(rowStart, rowEnd + 6), sharedStrings));
    searchFrom = rowEnd + 6;
  }
  return final ? '' : xml.slice(Math.max(0, searchFrom));
}

function parseWorksheetRow(rowXml: string, sharedStrings: string[]): unknown[] {
  const row: unknown[] = [];
  const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^/>]*)\/>/g;
  for (const match of rowXml.matchAll(cellPattern)) {
    const attrs = parseAttributes(match[1] ?? match[3] ?? '');
    const ref = attrs.r;
    if (!ref) continue;
    const columnIndex = columnIndexFromCellRef(ref);
    row[columnIndex] = cellValue(match[2] ?? '', attrs.t, sharedStrings);
  }
  return row;
}

function cellValue(cellXml: string, type: string | undefined, sharedStrings: string[]): unknown {
  if (type === 'inlineStr') {
    return Array.from(cellXml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)).map((match) => decodeXml(match[1] ?? '')).join('');
  }
  const valueMatch = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
  if (!valueMatch) return null;
  const rawValue = decodeXml(valueMatch[1] ?? '');
  if (type === 's') return sharedStrings[Number(rawValue)] ?? '';
  if (type === 'str' || type === 'b') return rawValue;
  const numeric = Number(rawValue);
  return Number.isFinite(numeric) ? numeric : rawValue;
}

function columnIndexFromCellRef(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0] ?? 'A';
  let index = 0;
  for (const letter of letters.toUpperCase()) {
    index = index * 26 + letter.charCodeAt(0) - 64;
  }
  return index - 1;
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function likelyHeaderRow(row: unknown[] | undefined): boolean {
  if (!row) return false;
  const headers = new Set(row.map((cell) => String(cell ?? '').trim()));
  const expected = ['Company Name', 'Investor No_', 'Investor Short Code', 'Posting Date', 'Actual Contributions', 'Actual Distributions'];
  return expected.filter((header) => headers.has(header)).length >= 4;
}
