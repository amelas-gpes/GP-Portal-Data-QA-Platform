// Slice-based CSV parser. The previous implementation walked the text one
// character at a time and grew each field with `field += char`, which at
// 150MB+ allocates hundreds of millions of intermediate strings and dominates
// import time through GC pressure. This version scans for delimiters with
// charCodeAt and materializes each field with a single slice; quoted fields
// take a slower path only when they actually contain escaped quotes.

const QUOTE = 34; // "
const COMMA = 44; // ,
const LF = 10; // \n
const CR = 13; // \r

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  const length = text.length;
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let sawField = false;

  const pushRow = () => {
    // Skip fully-blank lines unconditionally. Previously the first row was kept
    // even when empty, so a CSV beginning with a blank line produced [''] as row 0,
    // which the importer then treated as the header — making every required column
    // "missing" and importing all-null data. This mirrors the Excel path's
    // blankrows:false behavior.
    for (let cell = 0; cell < row.length; cell += 1) {
      if (row[cell].length > 0) {
        rows.push(row);
        break;
      }
    }
    row = [];
  };

  while (index < length) {
    const code = text.charCodeAt(index);

    if (code === QUOTE) {
      // Quoted field: find the closing quote, handling doubled quotes.
      index += 1;
      let start = index;
      let value = '';
      let plain = true;
      for (;;) {
        const quote = text.indexOf('"', index);
        if (quote === -1) throw new Error('CSV import has an unclosed quoted field.');
        if (text.charCodeAt(quote + 1) === QUOTE) {
          // Escaped quote: accumulate the run including one quote, continue.
          value += text.slice(start, quote + 1);
          plain = false;
          index = quote + 2;
          start = index;
          continue;
        }
        row.push(plain ? text.slice(start, quote) : value + text.slice(start, quote));
        sawField = true;
        index = quote + 1;
        break;
      }
      // After a closing quote the next char should be a delimiter; fall through
      // so the delimiter handling below consumes it.
      continue;
    }

    if (code === COMMA) {
      if (!sawField) row.push('');
      sawField = false;
      index += 1;
      continue;
    }

    if (code === LF || code === CR) {
      if (!sawField && row.length > 0) row.push('');
      sawField = false;
      pushRow();
      index += 1;
      if (code === CR && text.charCodeAt(index) === LF) index += 1;
      continue;
    }

    // Unquoted field: single scan to the next delimiter, one slice.
    let cursor = index;
    while (cursor < length) {
      const c = text.charCodeAt(cursor);
      if (c === COMMA || c === LF || c === CR) break;
      cursor += 1;
    }
    row.push(text.slice(index, cursor));
    sawField = true;
    index = cursor;
  }

  if (sawField || row.length > 0) {
    if (!sawField) row.push('');
    pushRow();
  }
  return rows;
}
