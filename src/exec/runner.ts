import { spawnSync, execSync, spawn } from 'child_process';
import minimist from 'minimist';
import { loadEnv } from '../helper/bundle/env';
import { initRun, updateRunStatus } from '../scripts/pretest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { extractFailedTests, createCucumberRerunFile, createPlaywrightRerunFile } from './rerunExtractor';
// Note: remove stray invalid import; runner does not need faker

/**
 * Check if user wants to rerun failed tests from previous run
 * This happens when: npx playq test --rerun (no grep/tags)
 * Allows manual rerun of failures without re-running entire suite
 */
function handleManualFailedTestRerun(): void {
  // Only handle rerun if:
  // 1. --rerun flag is set (PLAYQ_RERUN env var)
  // 2. No new grep/tags specified (so we know to use failed test list)
  if (process.env.PLAYQ_RERUN !== 'true') {
    return; // Not a rerun attempt
  }

  if (process.env.PLAYQ_GREP || process.env.PLAYQ_TAGS) {
    return; // User specified new grep/tags, so this is a normal run with rerun support, not a pure rerun
  }

  const projectRoot = process.cwd();
  const failedTestsFile = path.join(projectRoot, '.playq-failed-tests.json');

  if (!fs.existsSync(failedTestsFile)) {
    console.log('❌ No previous failures found to rerun');
    console.log('   Run tests first: npx playq test --grep "pattern"');
    process.exit(1);
  }

  // Load and execute rerun
  try {
    const failedData = JSON.parse(fs.readFileSync(failedTestsFile, 'utf-8'));
    console.log(`\n⏬ Rerunning ${failedData.count} failed test(s) from previous run\n`);

    // PRESERVE BLOB REPORTS: Copy current blob-report to blob-report_full before rerun
    // This ensures we have the original results for merging later
    const testResultsDir = path.join(projectRoot, 'test-results');
    const blobReportDir = path.join(testResultsDir, 'blob-report');
    const blobReportFullDir = path.join(testResultsDir, 'blob-report_full');
    
    if (fs.existsSync(blobReportDir)) {
      try {
        // Remove old blob-report_full if it exists
        if (fs.existsSync(blobReportFullDir)) {
          fs.rmSync(blobReportFullDir, { recursive: true, force: true });
        }
        // Copy blob-report to blob-report_full
        fs.cpSync(blobReportDir, blobReportFullDir, { recursive: true, force: true });
        console.log('💾 Preserved original blob report → blob-report_full/');
      } catch (err) {
        console.warn('⚠️ Failed to preserve blob reports:', (err as any)?.message);
      }
    }

    // Set marker so cleanup is skipped (preserve original results)
    process.env.PLAYQ_IS_RERUN = 'true';
    process.env.TEST_RUNNER = failedData.runner;
    process.env.PLAYQ_RUNNER = failedData.runner;

    if (failedData.runner === 'cucumber') {
      rerunCucumberFailed();
    } else {
      rerunPlaywrightFailed(failedData.tests);
    }
  } catch (err) {
    console.error('❌ Failed to parse failed tests file:', (err as any)?.message);
    process.exit(1);
  }
}

/**
 * Rerun failed Cucumber tests
 */
function rerunCucumberFailed(): void {
  const projectRoot = process.cwd();
  const rerunFile = path.join(projectRoot, '@rerun.txt');

  if (!fs.existsSync(rerunFile)) {
    console.error('❌ Rerun file not found:', rerunFile);
    process.exit(1);
  }

  process.env.PLAYQ_NO_INIT_VARS = '1';
  loadEnv();
  delete (process.env as any).PLAYQ_NO_INIT_VARS;

  const cucumberArgs = [
    'cucumber-js',
    '--config', 'cucumber.js',
    '--profile', 'default',
    '@rerun.txt'
  ];

  console.log(`🎭 Rerunning Cucumber: npx ${cucumberArgs.join(' ')}\n`);

  // Ensure env vars are set for the spawned process
  const childEnv = { ...process.env };
  childEnv.PLAYQ_IS_RERUN = 'true';  // Signal to preprocessing to use @rerun.txt only
  childEnv.PLAYQ_PROJECT_ROOT = projectRoot;  // Ensure project root is known

  const result = spawnSync('npx', cucumberArgs, {
    stdio: 'inherit',
    env: childEnv,
    shell: true
  });

  const exitCode = result.status ?? 1;
  console.log(`\n📊 Rerun completed with exit code: ${exitCode}`);
  console.log(`💡 To merge reports, run: npx playq merge-reports --runner cucumber\n`);
  saveFailedTestsIfAny(exitCode);
}

/**
 * Rerun failed Playwright tests
 */
function rerunPlaywrightFailed(failedTests: any[]): void {
  process.env.PLAYQ_NO_INIT_VARS = '1';
  loadEnv();
  delete (process.env as any).PLAYQ_NO_INIT_VARS;

  // Build grep pattern from failed test names (identifier for pattern matching)
  const patterns = failedTests
    .filter((t: any) => typeof t === 'object' && (t.identifier || t.name))
    .map((t: any) => (t.identifier || t.name || '').toString())
    .filter((p: string) => p.trim().length > 0);

  if (patterns.length === 0) {
    console.error('❌ No test titles found in failed tests list');
    process.exit(1);
  }

  // Escape special regex chars and join with OR operator
  const grepPattern = patterns
    .map((p: string) => p.replace(/[.+*?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  const command = `npx playwright test --config=playq/config/playwright/playwright.config.js --grep="${grepPattern}"${
    process.env.PLAYQ_PROJECT ? ` --project="${process.env.PLAYQ_PROJECT}"` : ''
  }`;

  const childEnv = { ...process.env } as any;
  childEnv.PLAYQ_IS_RERUN = 'true';
  const preload = '-r ts-node/register';
  childEnv.NODE_OPTIONS = childEnv.NODE_OPTIONS
    ? `${childEnv.NODE_OPTIONS} ${preload}`
    : preload;
  if (!childEnv.PLAYQ_CORE_ROOT) childEnv.PLAYQ_CORE_ROOT = path.resolve(__dirname, '..');
  if (!childEnv.PLAYQ_PROJECT_ROOT) childEnv.PLAYQ_PROJECT_ROOT = process.cwd();

  const projectTsConfig = path.resolve(process.cwd(), 'tsconfig.json');
  childEnv.TS_NODE_PROJECT = projectTsConfig;
  childEnv.TS_NODE_TRANSPILE_ONLY = childEnv.TS_NODE_TRANSPILE_ONLY || 'true';

  console.log(`🎭 Rerunning Playwright: ${command.substring(0, 80)}...\n`);

  const result = spawnSync(command, {
    stdio: 'inherit',
    shell: true,
    env: childEnv
  });

  const exitCode = result.status ?? 1;
  console.log(`\n📊 Rerun completed with exit code: ${exitCode}`);
  console.log(`💡 To merge reports, run: npx playq merge-reports --open\n`);
  saveFailedTestsIfAny(exitCode);
}

// cleanupTestResults() removed — run directory initialisation is now handled by initRun() from pretest.ts

// loadEnv();
// console.log('  - Runner (PLAYQ_ENV):', process.env.PLAYQ_ENV );
// console.log('  - Runner (PLAYQ_RUNNER):', process.env.PLAYQ_RUNNER );
// console.log('  - Runner (PLAYQ_GREP):', process.env.PLAYQ_GREP );
// console.log('  - Runner (PLAYQ_TAGS):', process.env.PLAYQ_TAGS );
// console.log('  - Runner (PLAYQ_PROJECT):', process.env.PLAYQ_PROJECT );
// console.log('  - Env (RUNNER - cc_card_type):', process.env['cc_card_type']);
// console.log('  - Env (RUNNER - config.testExecution.timeout):', process.env['config.testExecution.timeout'] );

// Check if user wants to rerun previously failed tests
handleManualFailedTestRerun();

if (process.env.PLAYQ_RUNNER && process.env.PLAYQ_RUNNER === 'cucumber') {
  // Allow vars to initialize in the cucumber child process (do NOT set PLAYQ_NO_INIT_VARS here)
  // Ensure legacy TEST_RUNNER flag used by helper code is set
  process.env.TEST_RUNNER = 'cucumber';
  
  // PRESERVE CLI-SET ENVIRONMENT VARIABLES BEFORE loadEnv() potentially overwrites them
  const cliTags = process.env.PLAYQ_TAGS;
  const cliGrep = process.env.PLAYQ_GREP;
  const cliEnv = process.env.PLAYQ_ENV;
  const cliProject = process.env.PLAYQ_PROJECT;
  
  // Provide a default browser type if none supplied via config/env
  if (!process.env['PLAYQ__browser__browserType'] && !process.env['browser.browserType']) {
    process.env.PLAYQ__browser__browserType = 'chromium';
  }
  loadEnv();
  
  // RESTORE CLI-SET ENV VARS after loadEnv() in case they were lost
  if (cliTags) process.env.PLAYQ_TAGS = cliTags;
  if (cliGrep) process.env.PLAYQ_GREP = cliGrep;
  if (cliEnv && !process.env.PLAYQ_ENV) process.env.PLAYQ_ENV = cliEnv;
  if (cliProject && !process.env.PLAYQ_PROJECT) process.env.PLAYQ_PROJECT = cliProject;
  
  // Initialise timestamped run directory (sets PLAYQ_RESULTS_DIR)
  initRun();

  const cucumberArgs = [
    'cucumber-js',
    '--config',
    'cucumber.js',
    '--profile',
    'default',
  ];
  
  // Add tags if present (from CLI or environment)
  const tagsToUse = process.env.PLAYQ_TAGS || cliTags;
  if (tagsToUse) {
    cucumberArgs.push('--tags', tagsToUse);
    if (process.env.PLAYQ_DEBUG === 'true') {
      console.log(`🔍 [DEBUG] Using tags: ${tagsToUse}`);
    }
  } else if (process.env.PLAYQ_DEBUG === 'true') {
    console.log(`🔍 [DEBUG] No tags specified - running all scenarios`);
  }

  console.log(`🎭 Running Cucumber: npx ${cucumberArgs.join(' ')}`);
  
  const run = spawn('npx', cucumberArgs, {
    stdio: 'inherit',
    env: { ...process.env },
    shell: true,
  });

  run.on('close', (code, signal) => {
    const exitCode = code ?? (signal ? 1 : 0);
    updateRunStatus(exitCode);
    // Always save failed tests for potential manual rerun
    saveFailedTestsIfAny(exitCode);
  });
} else {
  if (process.env.PLAYQ_RUN_CONFIG) {
    // Dynamically import the run_config object from the specified run config file
    // Look for run config in the user's project root
    const runConfigPath = path.resolve(process.cwd(), `resources/run-configs/${process.env.PLAYQ_RUN_CONFIG}.run`);
    const runConfig = require(runConfigPath).default;
    console.log('🌐 Running with runConfig:', JSON.stringify(runConfig));
    
    let overallExitCode = 0;
    
    // Initialise timestamped run directory ONCE before all iterations (sets PLAYQ_RESULTS_DIR)
    initRun();
    
    for (const cfg of runConfig.runs) {
      console.log(`    - Running test with grep: ${cfg.PLAYQ_GREP}, env: ${cfg.PLAYQ_ENV}`);
      Object.keys(cfg).forEach(key => {
        if (key.trim() == 'PLAYQ_RUNNER') throw new Error('PLAYQ_RUNNER is not allowed in run configs');
        process.env[key] = cfg[key];
        console.log(`Setting ${key} = ${cfg[key]}`);
      });
  process.env.PLAYQ_NO_INIT_VARS = '1';
  loadEnv();
      const command = `npx playwright test --config=playq/config/playwright/playwright.config.js${process.env.PLAYQ_GREP ? ` --grep="${process.env.PLAYQ_GREP}"` : ''
        }${process.env.PLAYQ_PROJECT ? ` --project="${process.env.PLAYQ_PROJECT}"` : ''}`;

  const childEnv = { ...process.env } as any;
      // Ensure child initializes vars by removing the parent-side guard
      delete childEnv.PLAYQ_NO_INIT_VARS;
      // Prevent playwright.config.ts from running pretest again
      childEnv.PLAYQ_PRETEST_LOADED = '1';
  const preload = '-r ts-node/register';
      childEnv.NODE_OPTIONS = childEnv.NODE_OPTIONS
        ? `${childEnv.NODE_OPTIONS} ${preload}`
        : preload;
      // Ensure core and project roots propagate to child
      if (!childEnv.PLAYQ_CORE_ROOT) childEnv.PLAYQ_CORE_ROOT = path.resolve(__dirname, '..');
      if (!childEnv.PLAYQ_PROJECT_ROOT) childEnv.PLAYQ_PROJECT_ROOT = process.cwd();
      // Point ts-node to the project's tsconfig for path aliases
      const projectTsConfig = path.resolve(process.cwd(), 'tsconfig.json');
      childEnv.TS_NODE_PROJECT = projectTsConfig;
      childEnv.TS_NODE_TRANSPILE_ONLY = childEnv.TS_NODE_TRANSPILE_ONLY || 'true';
      const result = spawnSync(command, {
        stdio: 'inherit',
        shell: true,
        env: childEnv,
      });
      
      // Capture exit code from this run (handle signal terminations and spawn errors)
      let exitCode: number;
      if (result.error) {
        console.error(`❌ Spawn error in iteration: ${result.error.message}`);
        exitCode = 1;
      } else {
        exitCode = result.status ?? (result.signal ? 1 : 0);
      }
      if (exitCode !== 0) {
        overallExitCode = exitCode;
      }

    }

    // Always save failed tests for potential manual rerun
    saveFailedTestsIfAny(overallExitCode);
    updateRunStatus(overallExitCode);
  } else {
  process.env.PLAYQ_NO_INIT_VARS = '1';
  loadEnv();
  
  // Initialise timestamped run directory (sets PLAYQ_RESULTS_DIR)
  initRun();

  const command = `npx playwright test --config=playq/config/playwright/playwright.config.js${process.env.PLAYQ_GREP ? ` --grep="${process.env.PLAYQ_GREP}"` : ''
      }${process.env.PLAYQ_PROJECT ? ` --project="${process.env.PLAYQ_PROJECT}"` : ''}`;

  const childEnv = { ...process.env } as any;
    // Ensure child initializes vars by removing the parent-side guard
    delete childEnv.PLAYQ_NO_INIT_VARS;
    // Prevent playwright.config.ts from running pretest again — run directory already
    // initialised above via initRun() and PLAYQ_RESULTS_DIR is already set.
    childEnv.PLAYQ_PRETEST_LOADED = '1';
  const preload = '-r ts-node/register';
    childEnv.NODE_OPTIONS = childEnv.NODE_OPTIONS
      ? `${childEnv.NODE_OPTIONS} ${preload}`
      : preload;
    // Ensure core and project roots propagate to child
    if (!childEnv.PLAYQ_CORE_ROOT) childEnv.PLAYQ_CORE_ROOT = path.resolve(__dirname, '..');
    if (!childEnv.PLAYQ_PROJECT_ROOT) childEnv.PLAYQ_PROJECT_ROOT = process.cwd();
    // Point ts-node to the project's tsconfig for path aliases
    const projectTsConfig = path.resolve(process.cwd(), 'tsconfig.json');
    childEnv.TS_NODE_PROJECT = projectTsConfig;
    childEnv.TS_NODE_TRANSPILE_ONLY = childEnv.TS_NODE_TRANSPILE_ONLY || 'true';
    const result = spawnSync(command, {
      stdio: 'inherit',
      shell: true,
      env: childEnv,
    });

    // Always save failed tests for potential manual rerun
    console.log(`\n📋 Test execution completed with exit code: ${result.status ?? 1}`);
    const pwExitCode = result.status ?? 1;
    updateRunStatus(pwExitCode);
    saveFailedTestsIfAny(pwExitCode);
  }

}

/**
 * Save failed tests from the current test run for potential manual rerun
 * Creates both .playq-failed-tests.json (for npx playq rerun) and @rerun.txt/.playwright-rerun (for direct cucumber-js/playwright-cli)
 */
function saveFailedTestsIfAny(exitCode: number): void {
  const debug = process.env.PLAYQ_DEBUG === 'true';
  if (debug) console.log(`🔍 [DEBUG] saveFailedTestsIfAny called with exit code: ${exitCode}`);
  const projectRoot = process.cwd();
  const runner = (process.env.PLAYQ_RUNNER || 'playwright') as 'playwright' | 'cucumber';
  const reportDir = path.join(projectRoot, 'test-results');
  const failedTestsFile = path.join(projectRoot, '.playq-failed-tests.json');

  try {
    // Extract failed tests from reports
    if (debug) console.log(`🔍 [DEBUG] Extracting failed tests from: ${reportDir}`);
    const failedTests = extractFailedTests(reportDir, runner);
    if (debug) console.log(`🔍 [DEBUG] Found ${failedTests.length} failed tests`);

    if (failedTests.length > 0) {
      // Save failed tests metadata to .playq-failed-tests.json
      const failureData = {
        runner,
        timestamp: new Date().toISOString(),
        exitCode,
        count: failedTests.length,
        tests: failedTests
      };

      fs.writeFileSync(failedTestsFile, JSON.stringify(failureData, null, 2));
      console.log(`\n💾 Saved ${failedTests.length} failed test(s) to ${failedTestsFile}`);

      // Create rerun files for direct test runner invocation
      if (runner === 'cucumber') {
        const cucumberRerunFile = path.join(projectRoot, '@rerun.txt');
        createCucumberRerunFile(failedTests, cucumberRerunFile);
        console.log(`   Created ${cucumberRerunFile} (for direct cucumber-js invocation)`);
      }
      if (runner === 'playwright') {
        const playwrightRerunFile = path.join(projectRoot, '.playwright-rerun');
        createPlaywrightRerunFile(failedTests, playwrightRerunFile);
        console.log(`   Created ${playwrightRerunFile} (for direct playwright invocation)`);
      }

      console.log(`   Run 'npx playq rerun' to rerun only failed tests`);
      console.log(`\n💡 To merge reports, run: npx playq merge-reports\n`);
    } else if (fs.existsSync(failedTestsFile)) {
      // Clean up old failure file if all tests passed
      fs.unlinkSync(failedTestsFile);
      // Also clean up old rerun files
      const cucumberRerunFile = path.join(projectRoot, '@rerun.txt');
      const playwrightRerunFile = path.join(projectRoot, '.playwright-rerun');
      if (fs.existsSync(cucumberRerunFile)) fs.unlinkSync(cucumberRerunFile);
      if (fs.existsSync(playwrightRerunFile)) fs.unlinkSync(playwrightRerunFile);
      console.log('✅ All tests passed - removed old failure files');
    }
    
    // Always show merge command reminder (for both pass and fail cases)
    if (exitCode === 0) {
      console.log(`\n💡 To merge/view reports, run: npx playq merge-reports --open\n`);
    }
  } catch (err) {
    console.log('⚠️ Could not save failed tests:', (err as any)?.message || err);
  }

  process.exit(exitCode);
}

// NOTE: Manual rerun handler was removed because it was never invoked in this module,
// which made the rerun-orchestration path dead code. The rerun workflow is instead
// triggered by the npx playq rerun command which is handled by src/scripts/rerun.ts

// console.log('  - Runner (PLAYQ_ENV):', process.env.PLAYQ_ENV );
// console.log('  - Runner (PLAYQ_RUNNER):', process.env.PLAYQ_RUNNER );
// console.log('  - Runner (PLAYQ_GREP):', process.env.PLAYQ_GREP );
// console.log('  - Runner (PLAYQ_TAGS):', process.env.PLAYQ_TAGS );
// console.log('  - Runner (PLAYQ_PROJECT):', process.env.PLAYQ_PROJECT );
// console.log('  - Env (RUNNER - cc_card_type):', process.env.cc_card_type );


// let runner = 'playwright';
// let env = '';
// let grep = '';
// let tags = '';
// let prj = '';
// console.log('🌐 os.platform():', os.platform());

// // Use minimist for all platforms for consistency
// const args = minimist(process.argv.slice(2));

// // Try npm_config_* first (for npm script context), then fall back to minimist
// grep = process.env.npm_config_grep || args.grep || '';
// env = process.env.npm_config_env || args.env || '';
// tags = process.env.npm_config_tags || args.tags || '';
// prj = process.env.npm_config_project || args.project || '';
// runner = ['cucumber', 'bdd', 'cuke'].includes(
//   (process.env.npm_config_runner || args.runner || '').toLowerCase()
// )
//   ? 'cucumber'
//   : 'playwright';

// console.log('🌐 grep:', grep);
// console.log('🌐 env:', env);
// console.log('🌐 tags:', tags);
// console.log('🌐 prj:', prj);
// console.log('🌐 runner:', runner);

// // Debug information
// console.log('🔍 Debug - process.argv:', process.argv);
// console.log('🔍 Debug - minimist args:', args);
// console.log('🔍 Debug - npm_config_env:', process.env.npm_config_env);
// console.log('🔍 Debug - npm_config_grep:', process.env.npm_config_grep);

// process.env.TS_NODE_PROJECT = './tsconfig.json';
// require('tsconfig-paths').register();

// console.log('🌐 Running tests with args:', process.argv);
// console.log(process.platform);
// console.log(process.env.npm_config_env);

// process.env.TEST_RUNNER = runner;
// if (tags) process.env.TAGS = tags;
// if (grep) process.env.GREP = grep;
// if (prj) process.env.PROJECT = prj;

// if (env) {
//   process.env.RUN_ENV = env;
//   loadEnv(env);
// }

// if (runner === 'cucumber') {
//   execSync('npm run pretest:cucumber', { stdio: 'inherit' });

//   const cucumberArgs = [
//     'cucumber-js',
//     '--config',
//     'cucumber.js',
//     '--profile',
//     'default',
//   ];
//   if (tags) cucumberArgs.push('--tags', tags);

//   console.log(`🚀 Running Cucumber with args: ${cucumberArgs.join(' ')}`);
//   console.log('📦 Final Cucumber command:', `npx ${cucumberArgs.join(' ')}`);

//   const run = spawn('npx', cucumberArgs, {
//     stdio: 'inherit',
//     env: { ...process.env, RUN_ENV: env, PROJECT: prj },

//     shell: true,
//   });

//   run.on('close', (code) => {
//     execSync('npm run posttest:cucumber', { stdio: 'inherit' });
//     process.exit(code);
//   });
// } else if (runner === 'playwright') {
//   try {
//     execSync('npm run pretest:playwright', { stdio: 'inherit' });
//   } catch (error) {
//     console.log(
//       '⚠️  Pre-test cleanup had some issues, but continuing with tests...'
//     );
//   }

//   const command = `npx playwright test --config=config/playwright/playwright.config.ts${
//     grep ? ` --grep='${grep}'` : ''
//   }${prj ? ` --project=${prj}` : ''}`;

//   const result = spawnSync(command, {
//     stdio: 'inherit',
//     shell: true,
//     env: { ...process.env, RUN_ENV: env, PROJECT: prj },
//   });

//   try {
//     execSync('npm run posttest:playwright', { stdio: 'inherit' });
//   } catch (error) {
//     console.log(
//       '⚠️  Post-test reporting had some issues, but test execution completed.'
//     );
//   }

//   process.exit(result.status || 0);
// } else {
//   console.error(`❌ Unknown runner: ${runner}`);
//   process.exit(1);
// }
