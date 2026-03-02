import Papa from 'papaparse';
import * as XLSX from 'xlsx';

/**
 * Parse a CSV or Excel file entirely client-side.
 * Returns { headers, rows, columnMeta, totalRows, headerRowIndex, rawRowCount }
 */
export async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'csv') {
    return parseCSV(file);
  } else if (['xlsx', 'xls'].includes(ext)) {
    const names = await getExcelSheetNames(file);
    return parseExcelSheet(file, names[0]);
  }
  throw new Error(`Unsupported file type: .${ext}`);
}

export function getExcelSheetNames(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { bookSheets: true });
        resolve(wb.SheetNames);
      } catch (err) {
        reject(new Error('Could not read this Excel file. It may be corrupted or password-protected.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read the file. Please try again.'));
    reader.readAsArrayBuffer(file);
  });
}

export function parseExcelSheet(file, sheetName) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, {
          cellText: true,
          cellDates: true,
          sheetStubs: true,
        });
        const ws = wb.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        resolve(detectAndCleanData(rawRows));
      } catch (err) {
        reject(new Error('Could not parse this sheet. The data format may be unsupported.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read the file. Please try again.'));
    reader.readAsArrayBuffer(file);
  });
}

function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      dynamicTyping: false,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        try {
          resolve(detectAndCleanData(results.data));
        } catch (err) {
          reject(new Error('Could not parse this CSV file. Please check the file format.'));
        }
      },
      error: () => reject(new Error('Failed to read the CSV file. Please try again.')),
    });
  });
}

function detectAndCleanData(rawRows) {
  if (!rawRows || rawRows.length < 2) {
    throw new Error('The file appears to be empty or has too few rows to analyse.');
  }

  const headerRowIndex = findHeaderRow(rawRows);
  const headerRow = rawRows[headerRowIndex];

  const headers = headerRow.map((h, i) => {
    const val = String(h ?? '').trim();
    return val || `Column ${i + 1}`;
  });

  // Deduplicate header names
  const seen = {};
  const uniqueHeaders = headers.map((h) => {
    if (seen[h]) {
      seen[h]++;
      return `${h} (${seen[h]})`;
    }
    seen[h] = 1;
    return h;
  });

  const dataRows = rawRows.slice(headerRowIndex + 1);

  const rows = dataRows
    .filter((row) => row.some((cell) => cell !== '' && cell != null))
    .map((row) => {
      const obj = {};
      uniqueHeaders.forEach((header, i) => {
        obj[header] = row[i] !== undefined ? row[i] : null;
      });
      return obj;
    });

  const columnMeta = analyzeColumns(uniqueHeaders, rows);

  return {
    headers: uniqueHeaders,
    rows,
    columnMeta,
    totalRows: rows.length,
    headerRowIndex,
    rawRowCount: rawRows.length,
  };
}

function findHeaderRow(rawRows) {
  for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
    const row = rawRows[i];
    if (!row || row.length < 2) continue;

    const nonEmpty = row.filter((c) => c !== '' && c != null);
    const fillRate = nonEmpty.length / Math.max(row.length, 1);
    const allStrings = nonEmpty.every(
      (c) => typeof c === 'string' && isNaN(cleanNumber(c))
    );

    if (fillRate > 0.5 && allStrings && nonEmpty.length >= 2) {
      return i;
    }
  }
  return 0;
}

export function cleanNumber(val) {
  if (val == null || val === '') return NaN;
  const s = String(val).trim();
  const cleaned = s
    .replace(/[$\u20AC\u00A3\u00A5\u20B9,\s]/g, '')
    .replace(/^\((.+)\)$/, '-$1')
    .replace(/%$/, '');
  const num = Number(cleaned);
  return num;
}

function isLikelyDate(val) {
  if (val instanceof Date) return true;
  const s = String(val).trim();
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(s)) return true;
  if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(s)) return true;
  if (/^\d{4}$/.test(s) && Number(s) > 1900 && Number(s) < 2100) return true;
  return false;
}

function analyzeColumns(headers, rows) {
  const meta = {};
  const sampleSize = Math.min(rows.length, 200);

  headers.forEach((header) => {
    const values = rows.slice(0, sampleSize).map((r) => r[header]);
    const nonNull = values.filter(
      (v) => v != null && v !== '' && String(v).toLowerCase() !== 'null' && v !== 'N/A' && v !== '-'
    );

    const numericCount = nonNull.filter((v) => !isNaN(cleanNumber(v))).length;
    const dateCount = nonNull.filter((v) => isLikelyDate(v)).length;
    const nonNullCount = Math.max(nonNull.length, 1);

    let detectedType = 'string';
    if (numericCount / nonNullCount > 0.8) detectedType = 'numeric';
    else if (dateCount / nonNullCount > 0.8) detectedType = 'date';

    let currency = null;
    if (detectedType === 'numeric') {
      const symbols = nonNull
        .map((v) => {
          const match = String(v).match(/^\s*([$\u20AC\u00A3\u00A5\u20B9])/);
          return match ? match[1] : null;
        })
        .filter(Boolean);
      if (symbols.length > nonNull.length * 0.3) {
        currency = symbols[0];
      }
    }

    const entry = {
      type: detectedType,
      nullCount: values.length - nonNull.length,
      uniqueCount: new Set(nonNull.map(String)).size,
      sampleValues: nonNull.slice(0, 5).map((v) => (v instanceof Date ? v.toISOString() : v)),
      currency,
    };

    if (detectedType === 'numeric') {
      const nums = nonNull.map(cleanNumber).filter((n) => !isNaN(n));
      if (nums.length > 0) {
        entry.min = Math.min(...nums);
        entry.max = Math.max(...nums);
        entry.mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      }
    }

    meta[header] = entry;
  });

  return meta;
}
