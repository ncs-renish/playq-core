import fs from 'fs';

import * as path from 'path';

// Use PLAYQ_RESULTS_DIR if set (from pretest), otherwise default to test-results
const RESULTS_DIR = process.env.PLAYQ_RESULTS_DIR || 'test-results';
const inputPath = path.join(RESULTS_DIR, 'cucumber-report.json');
const outputPath = path.join(RESULTS_DIR, 'cucumber-report-custom.json');

function extractReplacements(embeddings: any[]): Record<string, string> {
  const replacements: Record<string, string> = {};
  embeddings?.forEach(embed => {
    const data = embed?.data;
    const match = data?.match(/Replaced: \|\\?"(.*?)\\?"\|-with-\|(.*?)\|/);
    if (match) {
      const original = match[1];
      const replaced = match[2];
      replacements[original] = replaced;
    }
  });
  return replacements;
}

function updateStepName(step: any) {
  const replacements = extractReplacements(step.embeddings || []);
  for (const [original, replaced] of Object.entries(replacements)) {
    const quotedOriginal = `"${original}"`;
    const quotedReplaced = `"${replaced}"`;
    step.name = step.name.replace(quotedOriginal, quotedReplaced);
  }
}

function processReport() {
  const raw = fs.readFileSync(inputPath, 'utf-8');
  if (!raw || !raw.trim()) {
    console.warn("⚠️ customiseReport: Empty or invalid JSON input. Skipping processing.");
    return;
  }
  const report = JSON.parse(raw);

  for (const feature of report) {
    for (const scenario of feature.elements || []) {
      for (const step of scenario.steps || []) {
        updateStepName(step);
        // Check for soft assertion failures in embeddings
        if (
          Array.isArray(step.embeddings) &&
          step.embeddings.some(
            (embed: any) =>
              typeof embed.data === "string" &&
              embed.data.includes("Soft Assertion: [Failed]")
          )
        ) {
          if (!step.result) step.result = {};
          step.result.status = "failed";
        }
      }
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`✅ Updated report written to ${outputPath}`);
}

processReport();