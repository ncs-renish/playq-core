import { loadEnv } from '../helper/bundle/env';
import path from 'path';
import { rmSync, existsSync, unlinkSync, readdirSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';

type ReportType = 'playwright' | 'cucumber' | 'allure' | 'cucumber-multi';

type RunMeta = {
  runId: string;
  runDir: string;
  startedAt: string;
  status: 'running' | 'completed' | 'failed';
  runType: 'bdd' | 'spec';
  reports: ReportType[];
  isRerun: boolean;
  rerunCount?: number;
};

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function makeRunId(d = new Date()): string {
  return `run-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    if (!existsSync(filePath)) return fallback;
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(value, null, 2), 'utf-8');
  renameSync(tmpPath, filePath);
}

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
}

function isLikelyLockError(err: any): boolean {
  const code = (err && err.code) || '';
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES';
}

function retryRename(oldPath: string, newPath: string, attempts = 5): void {
  let retries = attempts;
  while (retries > 0) {
    try {
      renameSync(oldPath, newPath);
      return;
    } catch (err) {
      retries--;
      if (!isLikelyLockError(err) || retries <= 0) {
        throw err;
      }
      const start = Date.now();
      while (Date.now() - start < 300) {
        // busy-wait between retries to keep this sync flow simple
      }
    }
  }
}

function directoryHasContent(dirPath: string): boolean {
  if (!existsSync(dirPath)) return false;
  try {
    return readdirSync(dirPath).length > 0;
  } catch {
    return false;
  }
}

function initRunDirectory(projectRoot: string, isActiveRerun: boolean): { runDir: string; runId: string } {
  const testResultsRoot = path.resolve(projectRoot, 'test-results');
  const runsRoot = path.resolve(testResultsRoot, 'runs');
  const latestRunMetaPath = path.resolve(testResultsRoot, 'current-run.json');
  const runIndexPath = path.resolve(testResultsRoot, 'runs-index.json');

  ensureDir(testResultsRoot);
  ensureDir(runsRoot);

  // Guard: if PLAYQ_RESULTS_DIR is already set to a valid directory, reuse it.
  // This prevents creating a second run folder when playwright.config.ts calls
  // pretest.ts in a subprocess after runner.ts has already initialised the run.
  const existingResultsDir = process.env.PLAYQ_RESULTS_DIR;
  if (existingResultsDir && existsSync(existingResultsDir)) {
    const runId = path.basename(existingResultsDir);
    console.log(`📁 [pretest] Reusing existing run directory: ${path.relative(testResultsRoot, existingResultsDir)}`);
    return { runDir: existingResultsDir, runId };
  }

  let currentMeta = readJsonSafe<RunMeta | null>(latestRunMetaPath, null);
  let runId = currentMeta?.runId;
  let runDir = currentMeta?.runDir;

  // Resolve relative path to absolute if reading from meta
  if (runDir && !path.isAbsolute(runDir)) {
    runDir = path.resolve(testResultsRoot, runDir);
  }

  // Determine run type from PLAYQ_RUNNER env var
  const runType: 'bdd' | 'spec' = process.env.PLAYQ_RUNNER === 'cucumber' ? 'bdd' : 'spec';

  // For fresh runs, always create a new timestamped run directory.
  if (!isActiveRerun || !runId || !runDir || !existsSync(runDir)) {
    runId = makeRunId();
    runDir = path.resolve(runsRoot, runId);
    ensureDir(runDir);
    const defaultReports: ReportType[] = runType === 'bdd' ? ['cucumber'] : ['playwright'];
    currentMeta = {
      runId,
      runDir: path.relative(testResultsRoot, runDir), // Store relative path
      startedAt: new Date().toISOString(),
      status: 'running',
      runType,
      reports: defaultReports,
      isRerun: false,
      rerunCount: 0
    };
  } else {
    // Rerun reuses the same run folder.
    const rerunMeta = currentMeta as RunMeta;
    rerunMeta.isRerun = true;
    rerunMeta.rerunCount = (rerunMeta.rerunCount || 0) + 1;
    rerunMeta.status = 'running';
    ensureDir(runDir);
  }

  const existingIndex = readJsonSafe<RunMeta[]>(runIndexPath, []);
  const withoutCurrent = existingIndex.filter(entry => entry.runId !== currentMeta!.runId);
  withoutCurrent.push(currentMeta!);

  writeJsonAtomic(latestRunMetaPath, currentMeta);
  writeJsonAtomic(runIndexPath, withoutCurrent);

  process.env.PLAYQ_RESULTS_DIR = runDir;
  console.log(`📁 [pretest] Using run directory: ${path.relative(projectRoot, runDir)}`);
  return { runDir, runId };
}

export function setupEnvironment() {
  loadEnv();

  // Only skip cleanup during ACTIVE rerun phase (PLAYQ_IS_RERUN set by tryAutomaticRerun)
  // Do NOT skip cleanup just because --rerun flag was used; the flag means "auto-rerun if failures"
  // Normal cleanup happens before first run, then blob-reports are preserved before actual rerun
  const isActiveRerun = process.env.PLAYQ_IS_RERUN === 'true';
  const projectRoot = process.env['PLAYQ_PROJECT_ROOT'] || process.cwd();
  const { runDir, runId } = initRunDirectory(projectRoot, isActiveRerun);

  // CRITICAL: Always log this to track environment variable propagation
  console.log(`🔍 [pretest] Environment check: PLAYQ_IS_RERUN="${process.env.PLAYQ_IS_RERUN}" (type: ${typeof process.env.PLAYQ_IS_RERUN}), isActiveRerun=${isActiveRerun}`);
  
  // Debug logging
  if (process.env.PLAYQ_DEBUG === 'true') {
    console.log(`🔍 [pretest] Active rerun check: PLAYQ_IS_RERUN=${process.env.PLAYQ_IS_RERUN}, isActiveRerun=${isActiveRerun}`);
  }

  // If NOT an active rerun, clean old test-results and rerun metadata
  // This ensures clean state for normal test runs and first run with --rerun
  if (!isActiveRerun) {
    console.log(`🧹 FRESH TEST RUN (${runId}): Cleaning rerun metadata (results are isolated per run folder)...`);
    
    // STEP 1: Remove rerun metadata files
    try {
      const rerunFiles = [
        path.resolve(projectRoot, '@rerun.txt'),           // Cucumber rerun file
        path.resolve(projectRoot, '.playwright-rerun'),    // Playwright rerun patterns
        path.resolve(projectRoot, '.playq-failed-tests.json')  // Failure metadata
      ];
      
      rerunFiles.forEach(file => {
        try {
          if (existsSync(file)) {
            unlinkSync(file);
            console.log(`  ✓ Removed: ${path.basename(file)}`);
          }
        } catch (err) {
          // Silently ignore if file doesn't exist
        }
      });
    } catch (err) {
      console.warn('Warning: Failed to cleanup rerun files', err);
    }

    // STEP 2: Prepare run directory only (do not delete test-results root)
    // Historical run folders stay under test-results/runs/* and are tracked by metadata files.
    try {
      if (!existsSync(runDir)) {
        ensureDir(runDir);
      }
      if (directoryHasContent(runDir)) {
        rmSync(runDir, { recursive: true, force: true });
        ensureDir(runDir);
      }
      console.log(`  ✓ Prepared clean run directory: ${runDir}`);
    } catch (err) {
      console.error('❌ ERROR: Failed to prepare run directory:', err);
      throw new Error('Critical: Cannot proceed with test run without preparing run directory');
    }
    
    console.log('✅ Cleanup complete - ready for fresh test run\n');
  } else {
    // ACTIVE RERUN PHASE: Preserve blob-reports but clean other artifacts for fresh rerun
    console.log(`ℹ️  ACTIVE RERUN (${runId}): Cleaning run artifacts in the same folder, preserving blob-reports...`);
    console.log(`🔍 [pretest] About to preserve blob-reports. Current run directory contents:`);
    try {
      const testResultsPath = runDir;
      if (existsSync(testResultsPath)) {
        const items = readdirSync(testResultsPath);
        items.forEach((item: string) => {
          console.log(`   - ${item}`);
        });
      }
    } catch (err) {
      console.log('   (Could not list contents)');
    }
    
    try {
      // Remove Allure results under run directory so merged report only shows rerun tests
      const allureResultsPath = path.resolve(runDir, 'allure-results');
      if (existsSync(allureResultsPath)) {
        rmSync(allureResultsPath, { recursive: true, force: true });
        console.log('  ✓ Removed: allure-results/');
      }
    } catch (err) {
      console.warn('  ⚠️  Could not clean allure-results:', err);
    }
    
    try {
      // Remove run subdirectories BUT PRESERVE blob-report folders (needed for Playwright merge)
      const testResultsPath = runDir;
      if (existsSync(testResultsPath)) {
        // These are safe to remove - they're reports/artifacts
        const safeToRemove = ['artifacts', 'cucumber-report.html', 'cucumber-report.json', 
                              'playwright-report', 'screenshots', 'traces', 'videos', 'scenarios',
                              'e2e-junit-results.xml', 'logs'];
        safeToRemove.forEach(sub => {
          const subPath = path.resolve(testResultsPath, sub);
          if (existsSync(subPath)) {
            try {
              rmSync(subPath, { recursive: true, force: true });
            } catch (err) {
              // Silently skip files that are locked (Windows issue)
              console.log(`  ⚠️  Could not remove ${sub} (file locked, skipping)`);
            }
          }
        });
        // CRITICAL: Do NOT remove blob-report* folders - they're needed for merge
        console.log('  ✓ Cleaned run directory (preserved blob-report folders for merge)');
        
        // VERIFY blob-report folders still exist
        console.log(`🔍 [pretest] After cleanup, test-results contents:`);
        const itemsAfter = readdirSync(testResultsPath);
        itemsAfter.forEach((item: string) => {
          console.log(`   - ${item}`);
        });
      }
    } catch (err) {
      console.warn('  ⚠️  Could not clean run directory:', err);
    }
    
    try {
      // CRITICAL: Remove _Temp/execution to force preprocessing only the rerun scenarios
      const tempExecutionPath = path.resolve(projectRoot, '_Temp/execution');
      if (existsSync(tempExecutionPath)) {
        rmSync(tempExecutionPath, { recursive: true, force: true });
        console.log('  ✓ Removed: _Temp/execution/ (forces fresh preprocessing)');
      }
    } catch (err) {
      console.warn('  ⚠️  Could not clean _Temp/execution:', err);
    }
    
    console.log('');
  }

  // If running in Cucumber mode, handle pre-processing
  if (process.env.PLAYQ_RUNNER === 'cucumber') {
    // Prefer compiled JS entry under dist/, fall back to TS entry under src/
    const jsEntry = path.resolve(projectRoot, 'dist', 'exec', 'preProcessEntry.js');
    const tsEntry = path.resolve(projectRoot, 'src', 'exec', 'preProcessEntry.ts');

    if (existsSync(jsEntry)) {
      require(jsEntry);
    } else if (existsSync(tsEntry)) {
      require(tsEntry);
    } else {
      throw new Error(
        `Unable to locate Cucumber pre-process entry. Tried:\n` +
        `  - ${jsEntry}\n` +
        `  - ${tsEntry}`
      );
    }
  }
  
  // General directory cleanup for temporary folders
  try {
    rmSync(path.resolve(projectRoot, '_Temp/sessions'), { recursive: true, force: true });
  } catch (err) {
    // Silently ignore
  }
  try {
    rmSync(path.resolve(projectRoot, '_Temp/smartAI'), { recursive: true, force: true });
  } catch (err) {
    // Silently ignore
  }
}

/**
 * Initialise the timestamped run directory without calling loadEnv().
 * Use this from runner.ts after loadEnv() has already been called.
 */
export function initRun(): void {
  const isActiveRerun = process.env.PLAYQ_IS_RERUN === 'true';
  const projectRoot = process.env['PLAYQ_PROJECT_ROOT'] || process.cwd();
  const { runDir } = initRunDirectory(projectRoot, isActiveRerun);
  if (process.env.PLAYQ_DEBUG === 'true') {
    console.log(`🔍 [runner] Run directory initialised: ${runDir}`);
  }
}

/**
 * Update the status of the current run in both current-run.json and runs-index.json.
 * Call this after the test process exits with the final exit code.
 */
export function updateRunStatus(exitCode: number): void {
  const projectRoot = process.env['PLAYQ_PROJECT_ROOT'] || process.cwd();
  const testResultsRoot = path.resolve(projectRoot, 'test-results');
  const latestRunMetaPath = path.resolve(testResultsRoot, 'current-run.json');
  const runIndexPath = path.resolve(testResultsRoot, 'runs-index.json');

  const currentMeta = readJsonSafe<RunMeta | null>(latestRunMetaPath, null);
  if (!currentMeta) return;

  currentMeta.status = exitCode === 0 ? 'completed' : 'failed';

  const existingIndex = readJsonSafe<RunMeta[]>(runIndexPath, []);
  const updated = existingIndex.map(entry =>
    entry.runId === currentMeta.runId ? { ...entry, status: currentMeta.status } : entry
  );

  writeJsonAtomic(latestRunMetaPath, currentMeta);
  writeJsonAtomic(runIndexPath, updated);
  console.log(`📋 [pretest] Run ${currentMeta.runId} marked as ${currentMeta.status}`);
}

// If called directly (not imported)
if (require.main === module) {
  setupEnvironment();
}
