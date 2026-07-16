/**
 * @file downloadActions.ts
 *
 * Simple filesystem helpers used in web download scenarios.
 * Provides directory listing and file existence checks with
 * Allure-compatible step wrappers.
 *
 * Authors: PlayQ Team
 * Version: v1.0.0
 */
import * as allure from "allure-js-commons";
import * as fs from "fs";
import * as path from "path";
import { request as playwrightRequest } from "playwright";
import type { Page, Locator } from "playwright";
import { vars, webLocResolver } from "../../../global";
import { waitForPageToLoad } from "./waitActions";
import { processScreenshot } from "./screenshotActions";

function isPlaywrightRunner() { return process.env.TEST_RUNNER === 'playwright'; }
const __allureAny_dl: any = allure as any;
if (typeof __allureAny_dl.step !== 'function') { __allureAny_dl.step = async (_n: string, f: any) => await f(); }

/**
 * Web: List Files -dir: {param}
 *
 * Lists files in the given directory.
 *
 * @param dirPath - Directory path
 * @returns Array of filenames or empty list if directory does not exist
 * @throws Error if `dirPath` is empty
 */
export async function listFiles(dirPath: string) {
  if (!dirPath) throw new Error("download.listFiles: 'dirPath' is required");
  const abs = path.resolve(dirPath);
  const stepName = `Web: List Files -dir: ${abs}`;
  const run = async () => fs.existsSync(abs) ? fs.readdirSync(abs) : [];
  if (isPlaywrightRunner()) { return __allureAny_dl.step(stepName, run); }
  return run();
}

/**
 * Web: Has File -dir: {param} -fileName: {param}
 *
 * Checks if a file exists in the directory listing.
 *
 * @param dirPath - Directory path
 * @param fileName - File name to check
 * @returns True if present; false otherwise
 * @throws Error if `dirPath` or `fileName` is empty
 */
export async function hasFile(dirPath: string, fileName: string) {
  if (!dirPath) throw new Error("download.hasFile: 'dirPath' is required");
  if (!fileName) throw new Error("download.hasFile: 'fileName' is required");
  const stepName = `Web: Has File -dir: ${path.resolve(dirPath)} -fileName: ${fileName}`;
  const run = async () => {
    const files = await listFiles(dirPath);
    return files.includes(fileName);
  };
  if (isPlaywrightRunner()) { return __allureAny_dl.step(stepName, run); }
  return run();
}

/**
 * Web: Download File -field: {param} -options: {param}
 *
 * Triggers a download by clicking the target element and saves it to a directory.
 *
 * @param page - Playwright Page instance
 * @param field - Button/link text, selector, or Locator to click (e.g., 'Download Text')
 * @param options - Optional JSON string or object:
 *  - pattern: [string] Locator pattern namespace (e.g., 'letcodesamples')
 *  - locatorCategory: [string] 'button' | 'link' (default 'button') used by webLocResolver
 *  - targetDir: [string] Directory to save file (default: PLAYQ_PROJECT_ROOT/_Temp/downloads)
 *  - fileName: [string] Override file name; default is suggested filename
 *  - actionTimeout: [number] Timeout for waits/clicks (default from config/testExecution)
 *  - screenshot, screenshotText, screenshotFullPage, screenshotBefore: screenshot options
 *
 * @returns Saved file absolute path
 */
export async function downloadFile(
  page: Page,
  field: string | Locator,
  options?: string | Record<string, any>
) {
  if (!page) throw new Error("Page not initialized");
  const options_json = typeof options === 'string' ? vars.parseLooseJson(options) : options || {};
  const {
    pattern,
    locatorCategory = 'button',
    targetDir,
    fileName,
    actionTimeout = Number(vars.getConfigValue("testExecution.actionTimeout")) || 60000,
    screenshot = false,
    screenshotText = "",
    screenshotFullPage = true,
    screenshotBefore = false,
  } = options_json || {};

  const resolvedField = typeof field === 'string' ? vars.replaceVariables(field) : field;
  const stepName = `Web: Download File -field: ${typeof resolvedField === 'string' ? resolvedField : '<locator>'}`;

  const run = async () => {
    await waitForPageToLoad(page, actionTimeout);
    const perAttemptTimeout = Math.max(3000, Math.min(10000, Math.floor(actionTimeout / 3)));
    const root = (targetDir ? path.resolve(targetDir) : path.join(process.env.PLAYQ_PROJECT_ROOT || process.cwd(), '_Temp', 'downloads'));
    if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });

    const resolveHrefFromLocator = async (locator: Locator): Promise<string | null> => {
      const direct = await locator.getAttribute('href', { timeout: 1000 }).catch(() => null);
      if (direct) return new URL(direct, page.url()).toString();
      const nested = await locator.locator('a[href]').first().getAttribute('href', { timeout: 1000 }).catch(() => null);
      if (nested) return new URL(nested, page.url()).toString();
      return null;
    };

    const saveFromUrl = async (fileUrl: string): Promise<string> => {
      let response;
      let body: Buffer | undefined;
      let retryWithFallback = false;

      try {
        response = await page.request.get(fileUrl, { timeout: actionTimeout });
        if (!response.ok()) {
          throw new Error(`downloadFile: failed to fetch '${fileUrl}' (status ${response.status()})`);
        }
        // Read body immediately while response context is still valid
        try {
          body = await response.body();
        } catch (bodyErr: any) {
          const msg = String(bodyErr?.message || bodyErr || '');
          if (/disposed|closed/i.test(msg)) {
            // Fallback to alternative method
            retryWithFallback = true;
          } else {
            throw bodyErr;
          }
        }
      } catch (err: any) {
        const msg = String(err?.message || err || '');
        if (/unable to get local issuer certificate|self signed certificate|certificate/i.test(msg)) {
          retryWithFallback = true;
        } else if (/disposed|closed/i.test(msg)) {
          retryWithFallback = true;
        } else {
          throw err;
        }
      }

      // Retry with standalone playwright request context if page.request failed
      if (retryWithFallback && !body) {
        const insecureRequest = await playwrightRequest.newContext({ 
          ignoreHTTPSErrors: true,
          timeout: actionTimeout
        });
        try {
          response = await insecureRequest.get(fileUrl, { timeout: actionTimeout });
          if (!response.ok()) {
            throw new Error(`downloadFile: failed to fetch '${fileUrl}' (status ${response.status()})`);
          }
          // Read body immediately
          body = await response.body().catch((err: any) => {
            throw new Error(`Failed to read response body: ${err?.message || err}`);
          });
        } finally {
          await insecureRequest.dispose();
        }
      }
      
      if (!body) {
        throw new Error(`downloadFile: No response body received from '${fileUrl}'`);
      }
      
      const pathname = new URL(fileUrl).pathname;
      const urlName = decodeURIComponent(path.basename(pathname)) || 'download.bin';
      const finalName = fileName || urlName;
      const savePath = path.join(root, finalName);
      fs.writeFileSync(savePath, body);
      return savePath;
    };

    const clickTargets: Array<{ name: string; locator: Locator }> = [];
    if (typeof resolvedField === 'string') {
      const categories = Array.from(new Set([
        locatorCategory,
        locatorCategory === 'button' ? 'link' : 'button'
      ]));

      for (const category of categories) {
        const loc = await webLocResolver(category, resolvedField, page, pattern, actionTimeout);
        if (loc) clickTargets.push({ name: `pattern:${category}`, locator: loc });
      }

      clickTargets.push({
        name: 'role:link(exact)',
        locator: page.getByRole('link', { name: resolvedField, exact: true }).first()
      });
      clickTargets.push({
        name: 'role:link(partial)',
        locator: page.getByRole('link', { name: resolvedField }).first()
      });
    } else {
      clickTargets.push({ name: 'provided-locator', locator: resolvedField });
    }

    await processScreenshot(page, screenshotBefore, screenshotText, screenshotFullPage);
    const hrefCandidates = Array.from(new Set((await Promise.all(clickTargets.map(async (attempt) => resolveHrefFromLocator(attempt.locator)))).filter(Boolean) as string[]));
    let lastError: any;

    for (const href of hrefCandidates) {
      try {
        const saved = await saveFromUrl(href);
        await processScreenshot(page, screenshot, screenshotText, screenshotFullPage);
        return saved;
      } catch (e) {
        lastError = e;
        console.log(`⚠️ Direct href download failed: ${href}`);
      }
    }

    let download: any;
    for (const attempt of clickTargets) {
      try {
        [download] = await Promise.all([
          page.waitForEvent('download', { timeout: perAttemptTimeout }),
          attempt.locator.click({ timeout: perAttemptTimeout })
        ]);
        if (download) break;
      } catch (e) {
        lastError = e;
        console.log(`⚠️ Download attempt failed using ${attempt.name}`);
      }
    }

    if (!download) {
      for (const href of hrefCandidates) {
        try {
          const saved = await saveFromUrl(href);
          await processScreenshot(page, screenshot, screenshotText, screenshotFullPage);
          return saved;
        } catch (e) {
          lastError = e;
          console.log(`⚠️ Download href fallback failed: ${href}`);
        }
      }
      throw lastError || new Error(`downloadFile: Unable to trigger download for field '${String(resolvedField)}'`);
    }

    const suggested = download.suggestedFilename();
    const finalName = fileName || suggested;
    const savePath = path.join(root, finalName);
    await download.saveAs(savePath);

    await processScreenshot(page, screenshot, screenshotText, screenshotFullPage);
    return savePath;
  };

  if (isPlaywrightRunner()) { return __allureAny_dl.step(stepName, run); }
  return run();
}
