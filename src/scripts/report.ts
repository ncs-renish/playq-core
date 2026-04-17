/**
 * PlayQ Report Opener
 * Opens the HTML report for a given run from the test-results/runs/ history.
 *
 * Usage (invoked via bin/playq.js):
 *   npx playq report                         — Last completed run
 *   npx playq report -1                      — One run before last completed
 *   npx playq report -3                      — Three runs before last completed
 *   npx playq report run-20260416-203859     — Specific run ID
 *   npx playq report <partial>               — Suffix/fuzzy match (e.g., "203859")
 *   npx playq report --list                  — List all runs
 *   npx playq report --type cucumber|playwright — Override report type
 *   npx playq report --help                  — Show help
 *
 * TODO (v0.4.0): Allure report support (requires generation step)
 * TODO (v0.4.0): cucumber-multi per-scenario report support
 */

import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type RunStatus = 'running' | 'completed' | 'failed';
type RunType = 'bdd' | 'spec';

type RunMeta = {
  runId: string;
  runDir: string;
  startedAt: string;
  completedAt?: string;
  status: RunStatus;
  runType: RunType;
  isRerun: boolean;
  rerunCount?: number;
};

type ReportType = 'cucumber' | 'playwright' | 'allure';

// ─────────────────────────────────────────────────────────────────────────────
// Help Text
// ─────────────────────────────────────────────────────────────────────────────

const HELP_TEXT = `
PlayQ CLI - report
Opens the HTML test report for a given run.

Usage:
  npx playq report [selector] [options]

Selectors:
  (none)                     Last completed run (default)
  -N                         N runs before the last completed (e.g., -1, -3)
  run-YYYYMMDD-HHMMSS        Exact run ID
  <partial>                  Suffix match (e.g., "203859" matches "run-20260416-203859")

Options:
  --type cucumber|playwright  Override report type (default: auto from run metadata)
  --list  | -l                List all available runs with status and offsets
  --help  | -h                Show this help message

Examples:
  npx playq report                          # Last completed run
  npx playq report -1                       # One run before last
  npx playq report -3                       # Three runs before last
  npx playq report run-20260416-203859      # Specific run by full ID
  npx playq report 203859                   # Partial/suffix match
  npx playq report --list                   # Show all runs
  npx playq report --type cucumber          # Force cucumber report
  npx playq report -1 --type playwright     # Combine selector + type override

Report locations (per run folder):
  Playwright : test-results/runs/<runId>/playwright-report/index.html
  Cucumber   : test-results/runs/<runId>/cucumber-report.html

Notes:
  - Only completed runs are targeted by default selectors.
  - Use the full run ID to open incomplete/failed runs.
  - Allure report support is planned for v0.4.0.
`;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    if (!existsSync(filePath)) return fallback;
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function resolveAbsoluteRunDir(runMeta: RunMeta, testResultsRoot: string): string {
  const { runDir } = runMeta;
  if (path.isAbsolute(runDir)) return runDir;
  return path.resolve(testResultsRoot, runDir);
}

function getReportPath(runMeta: RunMeta, testResultsRoot: string, typeOverride?: string): string {
  const runDir = resolveAbsoluteRunDir(runMeta, testResultsRoot);
  const reportType: ReportType = (typeOverride as ReportType) || (runMeta.runType === 'bdd' ? 'cucumber' : 'playwright');

  if (reportType === 'allure') {
    // TODO (v0.4.0): Allure support (requires `allure generate` to be run first)
    console.error('❌ Allure report opening is not yet supported. Coming in v0.4.0.');
    process.exit(1);
  }

  if (reportType === 'cucumber') {
    return path.join(runDir, 'cucumber-report.html');
  }

  // playwright (default for spec runs)
  return path.join(runDir, 'playwright-report', 'index.html');
}

function openFile(filePath: string): void {
  let cmd: string;
  let args: string[];

  if (process.platform === 'darwin') {
    cmd = 'open';
    args = [filePath];
  } else if (process.platform === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', filePath];
  } else {
    cmd = 'xdg-open';
    args = [filePath];
  }

  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.error) {
    console.error(`❌ Failed to open report: ${result.error.message}`);
    process.exit(1);
  }
}

function formatRunLine(run: RunMeta, index: number, total: number): string {
  const completedRuns = /* filled below */ [] as number[]; // placeholder, rebuilt in list()
  void completedRuns;
  const offsetFromEnd = total - 1 - index;
  const offsetLabel = offsetFromEnd === 0 ? '(last) ' : `(-${offsetFromEnd})   `;
  const statusIcon = run.status === 'completed' ? '✅' : run.status === 'failed' ? '❌' : '🔄';
  const typeLabel = run.runType === 'bdd' ? 'cucumber  ' : 'playwright';
  const date = new Date(run.startedAt).toLocaleString();
  return `  ${statusIcon}  ${run.runId}   ${typeLabel}   ${date}   ${offsetLabel}`;
}

function listRuns(sorted: RunMeta[]): void {
  console.log('\n📋  PlayQ Run History\n');
  console.log('       Run ID                      Type        Started                       Offset');
  console.log('  ───────────────────────────────────────────────────────────────────────────────────');
  sorted.forEach((run, i) => {
    console.log(formatRunLine(run, i, sorted.length));
  });
  console.log();
  console.log('  Tip: npx playq report -1  (open previous run)');
  console.log('       npx playq report run-20260416-203859  (open specific run)');
  console.log();
}

// ─────────────────────────────────────────────────────────────────────────────
// Argument Parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(rawArgs: string[]): {
  positional: string | undefined;
  listFlag: boolean;
  helpFlag: boolean;
  typeOverride: string | undefined;
} {
  const helpFlag = rawArgs.includes('--help') || rawArgs.includes('-h');
  const listFlag = rawArgs.includes('--list') || rawArgs.includes('-l');

  let typeOverride: string | undefined;
  const typeIdx = rawArgs.findIndex(a => a === '--type');
  if (typeIdx !== -1 && rawArgs[typeIdx + 1] && !rawArgs[typeIdx + 1].startsWith('-')) {
    typeOverride = rawArgs[typeIdx + 1];
  }

  // Validate --type value if provided
  if (typeOverride && !['cucumber', 'playwright', 'allure'].includes(typeOverride)) {
    console.error(`❌ Invalid --type value: "${typeOverride}". Must be cucumber, playwright, or allure.`);
    process.exit(1);
  }

  // Named args to exclude from positional detection
  const namedSet = new Set(['--list', '-l', '--help', '-h', '--type']);
  if (typeOverride) namedSet.add(typeOverride);

  // First arg that isn't a named flag is the run selector
  const positional = rawArgs.find(a => !namedSet.has(a));

  return { positional, listFlag, helpFlag, typeOverride };
}

// ─────────────────────────────────────────────────────────────────────────────
// Run Selection
// ─────────────────────────────────────────────────────────────────────────────

function selectRun(positional: string | undefined, sorted: RunMeta[]): RunMeta {
  const completed = sorted.filter(r => r.status === 'completed');

  // Default: no selector → last completed
  if (!positional) {
    if (completed.length === 0) {
      console.error('❌ No completed runs found. Use --list to see all runs.');
      process.exit(1);
    }
    return completed[completed.length - 1];
  }

  // Offset: -1, -2, -3, etc. — count back through completed runs
  if (/^-\d+$/.test(positional)) {
    const offset = parseInt(positional.slice(1), 10);
    if (offset === 0) {
      console.error('❌ Offset must be -1 or lower. Use "npx playq report" (no offset) for the last run.');
      process.exit(1);
    }
    const targetIndex = completed.length - 1 - offset;
    if (targetIndex < 0) {
      console.error(`❌ No completed run found at offset ${positional}.`);
      console.error(`   Only ${completed.length} completed run(s) available. Use --list to see them.`);
      process.exit(1);
    }
    return completed[targetIndex];
  }

  // Run ID: exact match first
  const exactMatch = sorted.find(r => r.runId === positional);
  if (exactMatch) return exactMatch;

  // Suffix/partial match
  const suffixMatches = sorted.filter(r => r.runId.includes(positional));
  if (suffixMatches.length === 1) return suffixMatches[0];

  if (suffixMatches.length > 1) {
    console.error(`❌ Ambiguous run selector "${positional}". Matches:`);
    suffixMatches.forEach(r => console.error(`   - ${r.runId}`));
    console.error('   Use the full run ID to be specific.');
    process.exit(1);
  }

  console.error(`❌ Run "${positional}" not found.`);
  console.error('   Use --list to see available runs.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main(): void {
  // Args passed from bin/playq.js spawnSync: process.argv = [node, script.js, ...user-args]
  const rawArgs = process.argv.slice(2);

  const { positional, listFlag, helpFlag, typeOverride } = parseArgs(rawArgs);

  if (helpFlag) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Locate runs-index.json in the consumer project
  const projectRoot = process.env.PLAYQ_PROJECT_ROOT || process.cwd();
  const testResultsRoot = path.resolve(projectRoot, 'test-results');
  const runsIndexPath = path.resolve(testResultsRoot, 'runs-index.json');

  if (!existsSync(runsIndexPath)) {
    console.error('❌ No run history found at:', runsIndexPath);
    console.error('   Run tests first: npx playq test ...');
    process.exit(1);
  }

  const allRuns = readJsonSafe<RunMeta[]>(runsIndexPath, []);
  if (allRuns.length === 0) {
    console.error('❌ runs-index.json is empty. No runs recorded yet.');
    process.exit(1);
  }

  // Sort chronologically (oldest → newest)
  const sorted = [...allRuns].sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  if (listFlag) {
    listRuns(sorted);
    process.exit(0);
  }

  // Resolve the run to open
  const selectedRun = selectRun(positional, sorted);

  // Warn if not completed
  if (selectedRun.status !== 'completed') {
    console.warn(`⚠️  Run ${selectedRun.runId} has status: "${selectedRun.status}". Report may be incomplete or missing.`);
  }

  // Resolve report file path
  const reportPath = getReportPath(selectedRun, testResultsRoot, typeOverride);

  if (!existsSync(reportPath)) {
    const runDir = resolveAbsoluteRunDir(selectedRun, testResultsRoot);
    const typeLabel = typeOverride ?? (selectedRun.runType === 'bdd' ? 'cucumber' : 'playwright');
    console.error(`❌ ${typeLabel} report not found: ${reportPath}`);
    console.error(`   Run folder: ${runDir}`);
    if (!existsSync(runDir)) {
      console.error('   The run folder itself does not exist (may have been deleted).');
    } else if (typeOverride) {
      const autoType = selectedRun.runType === 'bdd' ? 'cucumber' : 'playwright';
      console.error(`   This run was a "${autoType}" run. Try without --type override.`);
    } else {
      console.error('   The test run may not have generated a report (check if the run completed normally).');
    }
    process.exit(1);
  }

  const typeLabel = typeOverride ?? (selectedRun.runType === 'bdd' ? 'cucumber' : 'playwright');
  console.log(`\n📊  Opening ${typeLabel} report`);
  console.log(`    Run   : ${selectedRun.runId}`);
  console.log(`    Status: ${selectedRun.status}`);
  console.log(`    Report: ${reportPath}\n`);

  openFile(reportPath);
}

main();
