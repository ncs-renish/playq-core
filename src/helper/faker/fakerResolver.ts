import { faker as coreFaker } from './customFaker';

export function evaluateFakerExpression(expr: string): any {
  const m = expr.match(/^faker((?:\.[a-zA-Z0-9_]+)+)\((.*)\)$/);
  if (!m) {
    throw new Error(`Invalid faker expression: ${expr}`);
  }

  return evaluateFakerFromParts(m[1], m[2]);
}

export function replaceFakerPlaceholders(input: string): any {
  if (!input || typeof input !== 'string') return input;

  const trimmed = input.trim();
  const wrapped = trimmed.match(/^#\{(faker(?:\.[a-zA-Z0-9_]+)+\((.*)\))\}$/);
  if (wrapped) {
    return evaluateFakerExpression(wrapped[1]);
  }

  const full = trimmed.match(/^faker((?:\.[a-zA-Z0-9_]+)+)\((.*)\)$/);
  if (full) {
    return evaluateFakerExpression(`faker${full[1]}(${full[2]})`);
  }

  return input.replace(/#\{faker((?:\.[a-zA-Z0-9_]+)+)\((.*?)\)\}/g, (_m, pathPart, argsRaw) => {
    try {
      const val = evaluateFakerFromParts(pathPart, argsRaw);
      return String(val);
    } catch (e) {
      console.warn(`⚠️ Failed to evaluate faker placeholder: #{faker${pathPart}(${argsRaw})}`, e);
      return _m;
    }
  });
}

function evaluateFakerFromParts(pathPart: string, argsRaw: string): any {
  const path = pathPart.replace(/^\./, '');
  const parts = path.split('.');
  const ctx: any = (globalThis as any).faker || coreFaker;

  let fn: any = ctx;
  for (const p of parts) {
    fn = fn?.[p];
  }

  if (typeof fn !== 'function') {
    throw new Error(`Resolved faker path is not a function: faker.${path}`);
  }

  const args = parseFakerArgs(argsRaw);
  return fn(...args);
}

function parseFakerArgs(argsRaw: string): any[] {
  const trimmed = (argsRaw || '').trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('{')) {
    const normalized = trimmed
      .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
      .replace(/'/g, '"');
    try {
      return [JSON.parse(normalized)];
    } catch {
      throw new Error(`Failed to parse faker argument object: ${argsRaw}`);
    }
  }

  return splitArgs(trimmed).map((a) => {
    const v = a.trim();
    if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true';
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return v.replace(/^("|')(.*)\1$/, '$2');
  });
}

function splitArgs(s: string): string[] {
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === quote && s[i - 1] !== '\\') {
        quote = null;
      }
      buf += ch;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch as any;
      buf += ch;
      continue;
    }

    if (ch === '{' || ch === '[' || ch === '(') depth++;
    if (ch === '}' || ch === ']' || ch === ')') depth--;

    if (ch === ',' && depth === 0) {
      out.push(buf);
      buf = '';
      continue;
    }

    buf += ch;
  }

  if (buf) out.push(buf);
  return out;
}
