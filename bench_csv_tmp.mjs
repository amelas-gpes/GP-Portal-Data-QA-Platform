// Benchmark: current char-by-char parseCsvRows vs slice-based variant.
// Mirrors src/utils/csv.ts exactly for the "current" version.

function parseCsvRowsCurrent(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const pushRow = () => {
    row.push(field);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
    row = [];
    field = '';
  };

  while (index < text.length) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      pushRow();
    } else if (char === '\r') {
      pushRow();
      if (text[index + 1] === '\n') index += 1;
    } else {
      field += char;
    }
    index += 1;
  }

  if (inQuotes) throw new Error('CSV import has an unclosed quoted field.');
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

// Slice-based variant per the finding's described fix, kept byte-identical:
// fast path slices between delimiters; ANY quote (field-initial or mid-field)
// drops to the quote handler, appending segments.
const COMMA = 44, QUOTE = 34, CR = 13, LF = 10;
function parseCsvRowsSliced(text) {
  const rows = [];
  let row = [];
  let field = '';
  let hasField = false; // whether `field` holds accumulated quoted/segment content
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const len = text.length;

  const pushRow = () => {
    if (row.some((cell) => cell.length > 0)) rows.push(row);
    row = [];
  };

  let fieldStart = index;
  while (index < len) {
    const code = text.charCodeAt(index);
    if (code === COMMA) {
      row.push(hasField ? field + text.slice(fieldStart, index) : text.slice(fieldStart, index));
      field = '';
      hasField = false;
      index += 1;
      fieldStart = index;
    } else if (code === LF) {
      row.push(hasField ? field + text.slice(fieldStart, index) : text.slice(fieldStart, index));
      field = '';
      hasField = false;
      pushRow();
      index += 1;
      fieldStart = index;
    } else if (code === CR) {
      row.push(hasField ? field + text.slice(fieldStart, index) : text.slice(fieldStart, index));
      field = '';
      hasField = false;
      pushRow();
      index += 1;
      if (index < len && text.charCodeAt(index) === LF) index += 1;
      fieldStart = index;
    } else if (code === QUOTE) {
      // accumulate prefix before the quote (mid-field quote case)
      field += text.slice(fieldStart, index);
      hasField = true;
      index += 1;
      // inside quotes: scan with indexOf
      let segStart = index;
      for (;;) {
        const q = text.indexOf('"', index);
        if (q === -1) throw new Error('CSV import has an unclosed quoted field.');
        if (text.charCodeAt(q + 1) === QUOTE) {
          field += text.slice(segStart, q) + '"';
          index = q + 2;
          segStart = index;
        } else {
          field += text.slice(segStart, q);
          index = q + 1;
          break;
        }
      }
      fieldStart = index;
    } else {
      index += 1;
    }
  }

  if (fieldStart < len || hasField) {
    row.push(hasField ? field + text.slice(fieldStart, len) : text.slice(fieldStart, len));
  } else if (row.length > 0) {
    row.push('');
  }
  if (row.length > 0) pushRow();
  return rows;
}

// --- build a realistic 31k x 58 CSV (~11MB), GL-transactional shape, some quoted fields ---
function buildCsv(rowCount, colCount) {
  const headerCells = [];
  for (let c = 0; c < colCount; c++) headerCells.push(`Column Header ${c}`);
  const lines = ['﻿' + headerCells.join(',')];
  for (let r = 0; r < rowCount; r++) {
    const cells = [];
    for (let c = 0; c < colCount; c++) {
      if (c === 0) cells.push(`"Fund ${r % 7}, LP"`); // quoted with comma
      else if (c === 1) cells.push(`INV${(r % 900).toString().padStart(4, '0')}`);
      else if (c === 2) cells.push(`2025-0${(r % 9) + 1}-15`);
      else if (c % 11 === 3) cells.push(`"Investor ""${r % 50}"""`); // escaped quotes
      else if (c % 5 === 0) cells.push((-1 * ((r * c) % 100000) / 100).toFixed(2));
      else cells.push(`val_${r % 1000}_${c}`);
    }
    lines.push(cells.join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

const text = buildCsv(31000, 58);
console.log(`CSV size: ${(text.length / 1e6).toFixed(1)} MB chars, ${text.length} chars`);

// correctness check first
const a = parseCsvRowsCurrent(text);
const b = parseCsvRowsSliced(text);
if (a.length !== b.length) throw new Error(`row count mismatch ${a.length} vs ${b.length}`);
for (let i = 0; i < a.length; i++) {
  if (a[i].length !== b[i].length) throw new Error(`col count mismatch row ${i}`);
  for (let j = 0; j < a[i].length; j++) {
    if (a[i][j] !== b[i][j]) throw new Error(`cell mismatch [${i}][${j}]: ${JSON.stringify(a[i][j])} vs ${JSON.stringify(b[i][j])}`);
  }
}
// edge-case parity (mirrors src/test/qaWorkbench.test.ts:218-237 + mid-field quotes)
const cases = [
  '﻿Company Name,Investor Portal Display Name,Actual Contributions\r\n"Fund, I","Investor ""A""",-25\r\n',
  '\r\nCompany Name,Actual Contributions\r\n\r\nFund I,-25\r\n',
  '\n\n',
  'a"b,c"d,e\nf,g',         // mid-field quote
  '"ab"cd,e',                // content after closing quote
  'x,y,',                    // trailing comma -> trailing empty field
  'x,y',                     // no trailing newline
  'a,b\r\n,\r\n',            // all-empty row dropped
];
for (const c of cases) {
  const x = JSON.stringify(parseCsvRowsCurrent(c));
  const y = JSON.stringify(parseCsvRowsSliced(c));
  if (x !== y) throw new Error(`edge mismatch for ${JSON.stringify(c)}:\n  current=${x}\n  sliced =${y}`);
}
let threw1 = false, threw2 = false;
try { parseCsvRowsCurrent('Company Name,Investor\r\n"Fund I,Investor A'); } catch (e) { threw1 = /unclosed quoted field/.test(e.message); }
try { parseCsvRowsSliced('Company Name,Investor\r\n"Fund I,Investor A'); } catch (e) { threw2 = /unclosed quoted field/.test(e.message); }
if (!threw1 || !threw2) throw new Error('unclosed-quote error parity failed');
console.log('Correctness: identical output on 31k x 58 + edge cases + error parity.');

function bench(name, fn, text, iters) {
  // warmup
  fn(text);
  const times = [];
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    fn(text);
    times.push(performance.now() - t0);
  }
  times.sort((p, q) => p - q);
  const median = times[Math.floor(times.length / 2)];
  console.log(`${name}: median ${median.toFixed(0)}ms  (min ${times[0].toFixed(0)}, max ${times[times.length - 1].toFixed(0)})  n=${iters}`);
  return median;
}

const mCur = bench('current char-by-char', parseCsvRowsCurrent, text, 5);
const mNew = bench('slice-based        ', parseCsvRowsSliced, text, 5);
console.log(`Speedup at 31k rows: ${(mCur / mNew).toFixed(2)}x  (saves ${(mCur - mNew).toFixed(0)}ms)`);

// scale check ~150MB-ish: 431k rows
const big = buildCsv(431000, 58);
console.log(`\nBig CSV size: ${(big.length / 1e6).toFixed(1)} MB chars`);
const bCur = bench('current @431k', parseCsvRowsCurrent, big, 3);
const bNew = bench('sliced  @431k', parseCsvRowsSliced, big, 3);
console.log(`Speedup at 431k rows: ${(bCur / bNew).toFixed(2)}x  (saves ${((bCur - bNew) / 1000).toFixed(1)}s)`);
