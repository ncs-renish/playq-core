// dataTest.ts
import { test } from '@playwright/test';
import { getTestData } from './dataLoader';
import * as vars from '../../bundle/vars';
import { replaceFakerPlaceholders } from '../../faker/fakerResolver';

type DataSource<T> = T[] | {
  file: string;
  filter?: string;
  sheet?: string;
  testType?: string;
  suffix?: string; // Optional suffix for test name
};

export function dataTest<T extends Record<string, any>>(
  label: string,
  dataSource: T[] | { file: string; filter?: string; sheet?: string ; testType?: string; suffix?: string },
  callback: (args: { row: T; page?: any }) => Promise<void>
) {
  let dataset: T[] = [];
  const { testType = "UI", suffix = ""} = typeof dataSource === "object" && !Array.isArray(dataSource) ? dataSource : {};

  if (Array.isArray(dataSource)) {
    dataset = applyRowReplacements(dataSource as any);
  } else {
    let { file, filter, sheet } = dataSource;
    file = vars.replaceVariables(file);
    sheet = (sheet) ? vars.replaceVariables(sheet) : undefined;
    filter = vars.replaceVariables(filter);
    const raw = getTestData(file, sheet);
    // Expand faker/variable placeholders within each row before filtering/scheduling tests
    const preprocessed = applyRowReplacements(raw as any);
    dataset = filter
      ? (preprocessed as T[]).filter(row => {
          try {
            // Create a scoped function where row keys are destructured
            const fn = new Function("row", `
              const { ${Object.keys(row).join(", ")} } = row;
              return ${filter};
            `);
            return fn(row);
          } catch (err) {
            console.warn(`⚠️ Filter failed: ${filter}`, err);
            return false;
          }
        })
      : (preprocessed as T[]);
  }
  
  test.describe(label, () => {
    dataset.forEach((row, index) => {
      vars.setValue('playq.iteration.count',`${index + 1}`);
      const name = `${label} ${vars.replaceVariables(replaceIterationDataVars(suffix,row))} [-${index + 1}-]`;
      if (testType.toUpperCase() === "API") {
        test(name, async () => {
          test.info().annotations.push({ type: "tag", description: label });
          vars.setRuntimeDataRow(row as Record<string, any>);
          try {
            await callback({ row });
          } finally {
            vars.setRuntimeDataRow(null);
          }
        });
      } else {
        test(name, async ({ page }) => {
          test.info().annotations.push({ type: "tag", description: label });
          vars.setRuntimeDataRow(row as Record<string, any>);
          try {
            await callback({ row, page });
          } finally {
            vars.setRuntimeDataRow(null);
          }
        });
      }
    });
  });
}

// ----------------- helpers -----------------
function applyRowReplacements<T extends Record<string, any>>(rows: T[]): T[] {
  return rows.map((row) => {
    const out: Record<string, any> = { ...row };
    for (const k of Object.keys(out)) {
      const v = out[k];
      if (typeof v === 'string') {
        // First, evaluate any faker placeholders
        const withFaker = replaceFakerPlaceholders(v);
        // Then, apply generic variable replacements
        out[k] = typeof withFaker === 'string' ? vars.replaceVariables(withFaker) : withFaker;
      }
    }
    return out as T;
  });
}

/**
 * Replaces all #{playq.iteration.data.KEY} in the input string with the value from the row object.
 * @param input The string containing placeholders.
 * @param row The row object with data.
 * @returns The string with placeholders replaced.
 */
 function replaceIterationDataVars(input: string, row: Record<string, any>): string {
  return input.replace(/#\{playq\.iteration\.data\.([a-zA-Z0-9_]+)\}/g, (_, key) => {
    return row[key] !== undefined ? String(row[key]) : '';
  });
}