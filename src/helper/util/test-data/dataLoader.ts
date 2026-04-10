import fs from 'fs';
import path from 'path';
import * as XLSX from '@e965/xlsx';

/**
 * Reads test data from .json, .xlsx, or .csv
 *
 * @param file - Filename WITH extension, e.g., "login.json", "login.xlsx", "login.csv"
 * @param sheetName - (optional) Sheet name for Excel files
 */
export function getTestData(file: string, sheetName?: string): any[] {
  // Attempt to locate the project's test-data directory robustly.
  // Strategy:
  // 1. Starting at process.cwd(), walk upward looking for a folder that
  //    contains a package.json (project root) and a test-data subfolder.
  // 2. If found, use <foundRoot>/test-data/<file>.
  // 3. Otherwise, fallback to process.cwd()/test-data/<file> and report a clear ENOENT.

  function findProjectRootWithTestData(startDir: string): string | null {
    let current = path.resolve(startDir);
    const root = path.parse(current).root;
    while (true) {
      const pkg = path.join(current, 'package.json');
      const td = path.join(current, 'test-data');
      if (fs.existsSync(pkg) && fs.existsSync(td) && fs.statSync(td).isDirectory()) {
        return td;
      }
      if (current === root) break;
      current = path.dirname(current);
    }
    return null;
  }

  const start = process.cwd();
  const projectTestData = findProjectRootWithTestData(start);

  // If not found by walking upward, also check immediate subdirectories of the
  // current directory. This handles the common developer workspace layout where
  // the workspace root contains multiple project folders (e.g. PlayQ_PROJECT).
  let basePath: string;
  if (projectTestData) {
    basePath = projectTestData;
  } else {
    // scan one-level children for a project that contains package.json and test-data
    const children = fs.readdirSync(start, { withFileTypes: true });
    let found: string | null = null;
    for (const child of children) {
      if (!child.isDirectory()) continue;
      const candidate = path.join(start, child.name);
      const pkg = path.join(candidate, 'package.json');
      const td = path.join(candidate, 'test-data');
      try {
        if (fs.existsSync(pkg) && fs.existsSync(td) && fs.statSync(td).isDirectory()) {
          found = td;
          break;
        }
      } catch (e) {
        // ignore permission or stat errors on non-readable dirs
      }
    }
    basePath = found || path.resolve(process.cwd(), 'test-data');
  }

  const filePath = path.join(basePath, file);

  if (!fs.existsSync(filePath)) {
    throw new Error(`ENOENT: test data file not found: ${filePath}. Searched from ${start}`);
  }
  const ext = path.extname(file).toLowerCase();

  switch (ext) {
    case '.json': {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
    case '.xlsx': {
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { raw: false, defval: '' });

        // Try to parse booleans/numbers
        return rows.map(row => {
          const parsedRow: Record<string, any> = {};
          for (const key in row) {
            const value = row[key];
            if (value === 'true' || value === 'false') {
              parsedRow[key] = value === 'true';
            } else if (!isNaN(value) && value.trim() !== '') {
              parsedRow[key] = Number(value);
            } else {
              parsedRow[key] = value;
            }
          }
          return parsedRow;
        });
      // const workbook = XLSX.readFile(filePath);
      // const sheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
      // return XLSX.utils.sheet_to_json(sheet);
    }
    case '.csv': {
      const fileData = fs.readFileSync(filePath, 'utf-8');
      const worksheet = XLSX.read(fileData, { type: 'string' }).Sheets['Sheet1'];
      return XLSX.utils.sheet_to_json(worksheet);
    }
    default:
      throw new Error(`Unsupported file extension: ${ext}`);
  }
}

/**
 * Parses a single CSV line with RFC 4180 quote handling.
 * @param line - CSV line to parse
 * @returns Array of field values
 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const nextCh = line[i + 1];

    if (ch === '"') {
      if (inQuotes && nextCh === '"') {
        current += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

/**
 * Resolves a data file path with fallback strategy.
 * @param dataFile - Filename or relative path
 * @returns Absolute file path
 */
export function resolveDataPath(dataFile: string): string {
  if (!dataFile) return '';
  if (path.isAbsolute(dataFile)) return dataFile;

  const byCwd = path.resolve(process.cwd(), dataFile);
  if (fs.existsSync(byCwd)) return byCwd;

  const byTestData = path.resolve(process.cwd(), 'test-data', path.basename(dataFile));
  if (fs.existsSync(byTestData)) return byTestData;

  return byCwd;
}

/**
 * Retrieves a specific row from a data file using metadata.
 * Used by Cucumber hooks to load row data after Examples preprocessing.
 *
 * @param meta - Metadata object with _DATAFILE, _DATASHEET, _DATAROW
 * @returns Row object keyed by column names, or null if not found
 *
 * @example
 * const row = getRowByMeta({
 *   _DATAFILE: 'test-data/users.xlsx',
 *   _DATASHEET: 'Sheet1',
 *   _DATAROW: '2'
 * });
 */
export function getRowByMeta(meta: Record<string, string>): Record<string, any> | null {
  const dataFile = (meta._DATAFILE || '').trim();
  const dataSheet = (meta._DATASHEET || '').trim();
  const dataRowNum = Number((meta._DATAROW || '').trim());
  if (!dataFile) return null;

  const fullPath = resolveDataPath(dataFile);
  if (!fs.existsSync(fullPath)) {
    console.warn(`⚠️ [DataRowLive] Data file not found: ${fullPath}`);
    return null;
  }

  const ext = path.extname(fullPath).toLowerCase();

  if (ext === '.csv') {
    const lines = fs
      .readFileSync(fullPath, 'utf-8')
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '');
    if (!lines.length || !Number.isFinite(dataRowNum) || dataRowNum < 2) return null;

    const headers = parseCsvLine(lines[0]);
    const rowLine = lines[dataRowNum - 1];
    if (!rowLine) return null;

    const values = parseCsvLine(rowLine);
    const row: Record<string, any> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? '';
    });
    return row;
  }

  if (ext === '.xlsx' || ext === '.xls') {
    const wb = XLSX.readFile(fullPath);
    const sheetName = dataSheet || wb.SheetNames[0];
    if (!sheetName || !wb.Sheets[sheetName]) return null;

    const pickRowFromSheet = (targetSheet: string): Record<string, any> | null => {
      if (!targetSheet || !wb.Sheets[targetSheet]) return null;
      const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[targetSheet], { defval: '' }) as Record<string, any>[];
      let pickedRow = sheetRows.find((r) => typeof r.__rowNum__ === 'number' && r.__rowNum__ + 1 === dataRowNum);
      if (!pickedRow && Number.isFinite(dataRowNum) && dataRowNum >= 2) {
        // Fallback to data-row index (row 2 => index 0)
        pickedRow = sheetRows[dataRowNum - 2];
      }
      return pickedRow || null;
    };

    const picked = pickRowFromSheet(sheetName);
    if (!picked) return null;

    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(picked)) {
      if (!k.startsWith('__')) cleaned[k] = v;
    }

    // XLSX-only linked sheet expansion:
    // If _LINK exists in selected row, treat values as sheet names in the same workbook.
    // Special value `_all` means read from all workbook sheets (except source sheet).
    const linkRaw = (cleaned._LINK ?? '').toString().trim();
    if (linkRaw) {
      const tokens = linkRaw
        .split(/[;,|]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const useAll = tokens.some((t) => t.toLowerCase() === '_all');
      const linkedSheets: string[] = useAll
        ? wb.SheetNames.filter((s) => s !== sheetName)
        : Array.from(new Set(tokens));

      for (const linkedSheet of linkedSheets) {
        const linkedRow = pickRowFromSheet(linkedSheet);
        if (!linkedRow) continue;

        const linkedCleaned: Record<string, any> = {};
        for (const [k, v] of Object.entries(linkedRow)) {
          if (!k.startsWith('__') && k !== '_LINK') linkedCleaned[k] = v;
        }

        cleaned[linkedSheet] = linkedCleaned;
      }
    }

    return cleaned;
  }

  if (ext === '.json') {
    const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    if (Array.isArray(parsed)) {
      if (Number.isFinite(dataRowNum) && dataRowNum >= 1) {
        // Prefer direct 1-based index for JSON arrays; fallback to data-row style index.
        return parsed[dataRowNum - 1] ?? parsed[dataRowNum - 2] ?? null;
      }
      return parsed[0] ?? null;
    }
    if (parsed && typeof parsed === 'object') return parsed;
  }

  return null;
}