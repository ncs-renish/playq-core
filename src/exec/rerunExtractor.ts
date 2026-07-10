/**
 * Rerun Extractor - Identify failed tests from reports and prepare for rerun
 */

import fs from 'fs';
import path from 'path';

export interface FailedTest {
  name: string;
  type: 'playwright' | 'cucumber';
  identifier: string; // grep pattern for playwright, tag for cucumber
}

/**
 * Extract failed tests from Blob report (Playwright)
 */
export function extractFailedPlaywrightTests(blobReportDir: string): FailedTest[] {
  const failed: FailedTest[] = [];

  try {
    // Ensure the directory exists before attempting to read reports
    if (!fs.existsSync(blobReportDir) || !fs.statSync(blobReportDir).isDirectory()) {
      return failed;
    }

    // Look for all JSONL report shards, e.g. report.jsonl, report-1.jsonl, report-2.jsonl, etc.
    const entries = fs.readdirSync(blobReportDir);
    const reportFiles = entries.filter(name => /^report.*\.jsonl$/i.test(name));

    if (reportFiles.length === 0) {
      return failed;
    }

    reportFiles.forEach(reportFileName => {
      const reportFilePath = path.join(blobReportDir, reportFileName);
      if (!fs.existsSync(reportFilePath)) {
        return;
      }

      const content = fs.readFileSync(reportFilePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      lines.forEach(line => {
        try {
          const json = JSON.parse(line);
          // Check for failed tests
          if (json && (json.status === 'failed' || json.ok === false)) {
            failed.push({
              name: json.title || json.name || 'Unknown',
              type: 'playwright',
              identifier: json.title || json.name || ''
            });
          }
        } catch (e) {
          // Skip invalid JSON
        }
      });
    });

    if (failed.length > 0) {
      console.log(`✅ Found ${failed.length} failed Playwright test(s) to rerun`);
    }
  } catch (err) {
    console.warn('⚠️ Error extracting failed Playwright tests:', err);
  }

  return failed;
}

/**
 * Extract failed tests from junit XML results file (fallback when blob reports don't exist)
 */
export function extractFailedTestsFromJunit(junitFile: string): FailedTest[] {
  const failed: FailedTest[] = [];

  try {
    // SAFEGUARD: Verify file exists and was recently modified
    // This prevents picking up old junit files from previous test runs
    if (!fs.existsSync(junitFile)) {
      return failed;
    }
    
    const stats = fs.statSync(junitFile);
    const fileAgeMs = Date.now() - stats.mtimeMs;
    const fileAgeMinutes = Math.round(fileAgeMs / 60000);
    
    // Only use junit file if it was modified within the last 30 minutes
    // This ensures we're reading results from the current test run, not old ones
    // (Allows for long-running test suites)
    if (fileAgeMs > 30 * 60 * 1000) {
      console.warn(`⚠️  Skipping stale junit file (modified ${fileAgeMinutes} minutes ago, >30min threshold)`);
      console.warn(`   Run fresh tests first to generate current failure reports.`);
      return failed;
    }
    
    const content = fs.readFileSync(junitFile, 'utf-8');
    
    // Parse failure elements: <failure message="fill.spec.ts:15:13 Fill alias: fill" type="FAILURE">
    const failureMatch = content.match(/<failure\s+message="([^"]+)"/g);
    
    if (failureMatch && failureMatch.length > 0) {
      failureMatch.forEach((match, idx) => {
        // Extract message like "fill.spec.ts:15:13 Fill alias: fill"
        const messageMatch = match.match(/message="([^"]+)"/);
        if (messageMatch) {
          const fullMessage = messageMatch[1];
          // Extract test name from message (part after the last space)
          const parts = fullMessage.split(/\s+/);
          if (parts.length > 1) {
            const testName = parts.slice(1).join(' ');
            if (process.env.PLAYQ_DEBUG === 'true') {
              console.log(`     [${idx + 1}] Test name: "${testName}"`);
            }
            failed.push({
              name: testName,
              type: 'playwright',
              identifier: testName
            });
          }
        }
      });
    }
  } catch (err) {
    console.warn('⚠️ Error extracting failed tests from junit:', err);
  }

  return failed;
}

/**
 * Extract failed tests from Cucumber report
 */
export function extractFailedCucumberTests(cucumberReportFile: string): FailedTest[] {
  const failed: FailedTest[] = [];

  try {
    if (!fs.existsSync(cucumberReportFile)) {
      return failed;
    }

    // SAFEGUARD: Verify report file was recently modified
    // This prevents picking up old cucumber reports from previous test runs
    const stats = fs.statSync(cucumberReportFile);
    const fileAgeMs = Date.now() - stats.mtimeMs;
    const fileAgeMinutes = Math.round(fileAgeMs / 60000);
    
    // Only use report if it was modified within the last 30 minutes
    // This ensures we're reading results from the current test run, not old ones
    // (Allows for long-running test suites)
    if (fileAgeMs > 30 * 60 * 1000) {
      console.warn(`⚠️  Skipping stale Cucumber report (modified ${fileAgeMinutes} minutes ago, >30min threshold)`);
      console.warn(`   Run fresh tests first to generate current failure reports.`);
      return failed;
    }

    const content = fs.readFileSync(cucumberReportFile, 'utf-8');
    const json = JSON.parse(content);
    const features = Array.isArray(json) ? json : [json];

    features.forEach(feature => {
      if (feature.elements) {
        feature.elements.forEach((scenario: any) => {
          // Check if scenario failed
          const hasFailed = scenario.steps?.some((step: any) => step.result?.status === 'failed');
          if (hasFailed || scenario.status === 'failed') {
            // For rerun, extract feature URI in format: path/to/feature.feature:line
            // This is the format expected by cucumber-js rerun plugin
            // IMPORTANT: Normalize to forward slashes for cross-platform compatibility
            const featureUri = (feature.uri || feature.name || 'unknown').replace(/\\/g, '/');
            const line = scenario.line || 0;
            const rerunIdentifier = `${featureUri}:${line}`;
            
            failed.push({
              name: `${feature.name}::${scenario.name}`,
              type: 'cucumber',
              identifier: rerunIdentifier // Feature URI:line format for cucumber rerun
            });
          }
        });
      }
    });
  } catch (err) {
    console.warn('⚠️ Error extracting failed Cucumber tests:', err);
  }

  return failed;
}

/**
 * Extract failed tests from Allure results
 */
export function extractFailedAllureTests(allureResultsDir: string): FailedTest[] {
  const failed: FailedTest[] = [];

  try {
    if (!fs.existsSync(allureResultsDir)) {
      return failed;
    }

    const files = fs.readdirSync(allureResultsDir).filter(f => f.endsWith('-result.json'));

    files.forEach(file => {
      try {
        const filePath = path.join(allureResultsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const json = JSON.parse(content);

        if (json.status === 'failed') {
          failed.push({
            name: json.name || 'Unknown',
            type: 'playwright', // Allure typically used with Playwright
            identifier: json.name || ''
          });
        }
      } catch (e) {
        // Skip invalid files
      }
    });
  } catch (err) {
    console.warn('⚠️ Error extracting failed Allure tests:', err);
  }

  return failed;
}

/**
 * Extract all failed tests from report directory
 * When runner='both', only extracts from actual most recent runners (prevents stale data)
 */
export function extractFailedTests(reportDir: string, runner: 'playwright' | 'cucumber' | 'both' = 'both'): FailedTest[] {
  const allFailed: FailedTest[] = [];
  const uniqueTests = new Map<string, FailedTest>();

  console.log(`🔍 Extracting failed tests from ${reportDir}...`);

  // Determine which runners actually produced recent reports (to avoid stale data with 'both')
  const getModTime = (filePath: string): number => {
    try {
      return fs.statSync(filePath).mtimeMs;
    } catch {
      return 0;
    }
  };
  
  const playwrightJunitTime = getModTime(path.join(reportDir, 'e2e-junit-results.xml'));
  const cucumberReportTime = getModTime(path.join(reportDir, 'cucumber-report', 'cucumber-report.json'));
  const bothRunners = runner === 'both';

  // **PRIMARY SOURCE**: Extract from junit results (most reliable, shows actual failures)
  if (runner === 'playwright' || (bothRunners && playwrightJunitTime > 0)) {
    const junitFile = path.join(reportDir, 'e2e-junit-results.xml');
    if (fs.existsSync(junitFile)) {
      console.log('  Extracting from junit results...');
      const failed = extractFailedTestsFromJunit(junitFile);
      failed.forEach(t => {
        if (t.type === 'playwright') uniqueTests.set(t.identifier, t);
      });
    }
  }

  // SECONDARY: Extract from Playwright blob reports (fallback when junit not found)
  if (runner === 'playwright' || (bothRunners && playwrightJunitTime > 0)) {
    const blobDir = path.join(reportDir, 'blob-report');
    if (fs.existsSync(blobDir)) {
      console.log('  Extracting from blob reports...');
      const failed = extractFailedPlaywrightTests(blobDir);
      // Only set blob-derived entries if not already present from junit (do not overwrite)
      failed.forEach(t => {
        if (!uniqueTests.has(t.identifier)) {
          uniqueTests.set(t.identifier, t);
        }
      });
    }
  }

  // Note: Skip Allure extraction because it marks retried tests as 'passed' even if they failed initially
  // Junit is more reliable for detecting actual failures with retries

  // Extract from Cucumber reports (only if Cucumber was the actual runner)
  if (runner === 'cucumber' || (bothRunners && cucumberReportTime > 0)) {
    const cucumberFile = path.join(reportDir, 'cucumber-report', 'cucumber-report.json');
    if (fs.existsSync(cucumberFile)) {
      const failed = extractFailedCucumberTests(cucumberFile);
      failed.forEach(t => uniqueTests.set(t.name, t));
    }
  }

  const result = Array.from(uniqueTests.values());
  console.log(`📋 Found ${result.length} failed tests to rerun`);

  return result;
}

/**
 * Create @rerun.txt file for Cucumber rerun
 */
export function createCucumberRerunFile(failedTests: FailedTest[], outputPath: string): void {
  try {
    const cucumberFailed = failedTests.filter(t => t.type === 'cucumber');
    // Extract feature:line format identifiers (not tags)
    // IMPORTANT: Normalize paths to forward slashes for cross-platform cucumber-js compatibility
    const rerunLines = cucumberFailed
      .map(t => t.identifier.replace(/\\/g, '/')) // Convert backslashes to forward slashes
      .filter((v, i, a) => a.indexOf(v) === i); // Deduplicate

    if (rerunLines.length === 0) {
      console.log('⚠️ No Cucumber scenarios found for rerun');
      return;
    }

    // Create rerun file with feature:line format (expected by cucumber-js rerun plugin)
    const content = rerunLines.join('\n');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content, 'utf-8');

    console.log(`✅ Cucumber rerun file created: ${outputPath}`)
  } catch (err) {
    console.error('❌ Error creating Cucumber rerun file:', err);
  }
}

/**
 * Create @rerun.txt file for Playwright rerun (using grep patterns)
 */
export function createPlaywrightRerunFile(failedTests: FailedTest[], outputPath: string): void {
  try {
    const playwrightFailed = failedTests.filter(t => t.type === 'playwright');
    const patterns = playwrightFailed
      .map(t => t.identifier)
      .filter((v, i, a) => a.indexOf(v) === i); // Deduplicate

    if (patterns.length === 0) {
      console.log('⚠️ No Playwright patterns found for rerun');
      return;
    }

    // Create rerun file with grep patterns (one per line)
    const content = patterns.join('\n');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content, 'utf-8');

    console.log(`✅ Playwright rerun file created with ${patterns.length} test pattern(s):`);
    patterns.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.substring(0, 70)}${p.length > 70 ? '...' : ''}`);
    });
  } catch (err) {
    console.error('❌ Error creating Playwright rerun file:', err);
  }
}
