/**
 * Report Merger - Consolidates all report formats after rerun
 * Supports: Blob reports (Playwright), Allure reports, Cucumber JSON reports
 */

import fs from 'fs';
import path from 'path';

/**
 * Merge blob reports (Playwright test results)
 */
export function mergeBlobReports(initialDir: string, rerunDir: string, outputDir: string): void {
  try {
    // Look for blob report files with pattern matching (report.jsonl, report-1.jsonl, report-2.jsonl, etc.)
    const collectedFiles: string[] = [];
    
    // Collect from initial dir
    if (fs.existsSync(initialDir)) {
      const entries = fs.readdirSync(initialDir);
      const blobFiles = entries.filter(name => /^report.*\.jsonl$/i.test(name));
      blobFiles.forEach(file => collectedFiles.push(path.join(initialDir, file)));
    }
    
    // Collect from rerun dir if different
    if (rerunDir !== initialDir && fs.existsSync(rerunDir)) {
      const entries = fs.readdirSync(rerunDir);
      const blobFiles = entries.filter(name => /^report.*\.jsonl$/i.test(name));
      blobFiles.forEach(file => collectedFiles.push(path.join(rerunDir, file)));
    }

    if (collectedFiles.length === 0) {
      console.log('⚠️ No blob reports found to merge');
      return;
    }

    let mergedLines: any[] = [];
    const testTitleMap: Map<string, any> = new Map();

    // Read all collected blob files
    collectedFiles.forEach(reportFile => {
      try {
        const content = fs.readFileSync(reportFile, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        lines.forEach(line => {
          try {
            const json = JSON.parse(line);
            // Use test title as unique key
            if (json.title) {
              testTitleMap.set(json.title, { 
                ...json, 
                source: reportFile.includes(rerunDir) ? 'rerun' : 'initial',
                ok: json.ok ?? testTitleMap.get(json.title)?.ok 
              });
            } else {
              mergedLines.push(json);
            }
          } catch (e) {
            console.warn('⚠️ Skipping invalid JSON line in blob report');
          }
        });
      } catch (e) {
        console.warn(`⚠️ Could not read blob report ${reportFile}:`, e);
      }
    });

    // Convert map back to array
    mergedLines = Array.from(testTitleMap.values()).concat(mergedLines);

    // Write merged report
    fs.mkdirSync(outputDir, { recursive: true });
    const mergedContent = mergedLines.map(json => JSON.stringify(json)).join('\n');
    const mergedReportPath = path.join(outputDir, 'report-merged.jsonl');
    fs.writeFileSync(mergedReportPath, mergedContent, 'utf-8');

    console.log(`✅ Blob reports merged: ${mergedReportPath}`);
  } catch (err) {
    console.error('❌ Error merging blob reports:', err);
  }
}

/**
 * Merge Allure reports (test results)
 */
export function mergeAllureReports(initialDir: string, rerunDir: string, outputDir: string): void {
  try {
    const initialResults = path.join(initialDir, '*.json');
    const rerunResults = path.join(rerunDir, '*.json');

    const allureResultsDir = path.join(outputDir, 'allure-results-merged');
    fs.mkdirSync(allureResultsDir, { recursive: true });

    // Collect all JSON result files
    const resultFiles: any[] = [];
    const resultMap: Map<string, any> = new Map();

    // Process initial results
    if (fs.existsSync(initialDir)) {
      const files = fs.readdirSync(initialDir).filter(f => f.endsWith('-result.json'));
      files.forEach(file => {
        const filePath = path.join(initialDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const json = JSON.parse(content);
          if (json.uuid) {
            resultMap.set(json.uuid, { ...json, source: 'initial' });
          }
        } catch (e) {
          console.warn(`⚠️ Skipping invalid Allure result: ${file}`);
        }
      });
    }

    // Process rerun results - override with latest status
    if (fs.existsSync(rerunDir)) {
      const files = fs.readdirSync(rerunDir).filter(f => f.endsWith('-result.json'));
      files.forEach(file => {
        const filePath = path.join(rerunDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const json = JSON.parse(content);
          if (json.uuid) {
            const existing = resultMap.get(json.uuid);
            resultMap.set(json.uuid, { 
              ...json, 
              source: 'rerun',
              previousStatus: existing?.status,
              retried: !!existing
            });
          }
        } catch (e) {
          console.warn(`⚠️ Skipping invalid Allure result: ${file}`);
        }
      });
    }

    // Write merged results
    let fileIndex = 0;
    resultMap.forEach((result, uuid) => {
      const filename = path.join(allureResultsDir, `${uuid}-result.json`);
      fs.writeFileSync(filename, JSON.stringify(result, null, 2), 'utf-8');
      fileIndex++;
    });

    console.log(`✅ Allure reports merged: ${allureResultsDir} (${fileIndex} results)`);
  } catch (err) {
    console.error('❌ Error merging Allure reports:', err);
  }
}

/**
 * Merge Cucumber JSON reports
 */
export function mergeCucumberReports(initialFile: string, rerunFile: string, outputDir: string): void {
  try {
    const mergedFile = path.join(outputDir, 'cucumber-merged.json');
    const scenarios: Map<string, any> = new Map();

    // Read initial report
    if (fs.existsSync(initialFile)) {
      try {
        const content = fs.readFileSync(initialFile, 'utf-8');
        const json = JSON.parse(content);
        const features = Array.isArray(json) ? json : [json];
        
        features.forEach(feature => {
          if (feature.elements) {
            feature.elements.forEach((scenario: any) => {
              const key = `${feature.name}::${scenario.name}`;
              scenarios.set(key, { ...scenario, source: 'initial', feature });
            });
          }
        });
      } catch (e) {
        console.warn('⚠️ Skipping invalid initial Cucumber report');
      }
    }

    // Read rerun report and override scenarios
    if (fs.existsSync(rerunFile)) {
      try {
        const content = fs.readFileSync(rerunFile, 'utf-8');
        const json = JSON.parse(content);
        const features = Array.isArray(json) ? json : [json];
        
        features.forEach(feature => {
          if (feature.elements) {
            feature.elements.forEach((scenario: any) => {
              const key = `${feature.name}::${scenario.name}`;
              const existing = scenarios.get(key);
              scenarios.set(key, { 
                ...scenario, 
                source: 'rerun',
                previousSteps: existing?.steps,
                previousStatus: existing?.status,
                retried: !!existing,
                feature
              });
            });
          }
        });
      } catch (e) {
        console.warn('⚠️ Skipping invalid rerun Cucumber report');
      }
    }

    // Reconstruct feature structure with merged scenarios
    const mergedFeatures: any[] = [];
    const featuresMap: Map<string, any> = new Map();

    scenarios.forEach((scenario, key) => {
      const feature = scenario.feature;
      if (!featuresMap.has(feature.name)) {
        featuresMap.set(feature.name, { ...feature, elements: [] });
      }
      const featureData = featuresMap.get(feature.name);
      const cleanScenario = { ...scenario };
      delete cleanScenario.feature;
      featureData.elements.push(cleanScenario);
    });

    featuresMap.forEach(feature => mergedFeatures.push(feature));

    // Write merged report
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(mergedFile, JSON.stringify(mergedFeatures, null, 2), 'utf-8');

    console.log(`✅ Cucumber reports merged: ${mergedFile}`);
  } catch (err) {
    console.error('❌ Error merging Cucumber reports:', err);
  }
}

/**
 * Merge all available report formats
 */
export function mergeAllReports(
  initialReportDir: string,
  rerunReportDir: string,
  outputDir: string,
  runner: 'playwright' | 'cucumber' | 'both' = 'both'
): void {
  console.log(`📊 Starting report merge (runner: ${runner})...`);

  // Merge Blob Reports (Playwright)
  if (runner === 'playwright' || runner === 'both') {
    const blobInitial = path.join(initialReportDir, 'blob-report');
    const blobRerun = path.join(rerunReportDir, 'blob-report');
    if (fs.existsSync(blobInitial) || fs.existsSync(blobRerun)) {
      mergeBlobReports(blobInitial, blobRerun, outputDir);
    }
  }

  // Merge Allure Reports
  const allureInitial = path.join(initialReportDir, 'allure-results');
  const allureRerun = path.join(rerunReportDir, 'allure-results');
  if (fs.existsSync(allureInitial) || fs.existsSync(allureRerun)) {
    mergeAllureReports(allureInitial, allureRerun, outputDir);
  }

  // Merge Cucumber Reports
  if (runner === 'cucumber' || runner === 'both') {
    const cucumberInitial = path.join(initialReportDir, 'cucumber-report', 'cucumber-report.json');
    const cucumberRerun = path.join(rerunReportDir, 'cucumber-report', 'cucumber-report.json');
    if (fs.existsSync(cucumberInitial) || fs.existsSync(cucumberRerun)) {
      mergeCucumberReports(cucumberInitial, cucumberRerun, outputDir);
    }
  }

  console.log(`✅ All reports merged successfully in: ${outputDir}`);
}
