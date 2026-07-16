/**
 * @file cookieActions.ts
 *
 * Cookie management utilities for PlayQ web tests.
 * Supports setting, reading, and clearing cookies with reporting-friendly
 * step wrappers compatible with Playwright and Cucumber runners.
 *
 * Authors: PlayQ Team
 * Version: v1.0.0
 */
import * as allure from "allure-js-commons";
import type { Page } from "playwright";
import { vars } from "../../../global";

function isPlaywrightRunner() { return process.env.TEST_RUNNER === 'playwright'; }
const __allureAny_cookie: any = allure as any;
if (typeof __allureAny_cookie.step !== 'function') { __allureAny_cookie.step = async (_n: string, f: any) => await f(); }

function parseCookieOptions(options?: string | Record<string, any>) {
  if (!options) return {};
  if (typeof options !== 'string') return options;

  const raw = options.trim();
  const tryLoose = (input: string) => {
    try {
      return vars.parseLooseJson(input);
    } catch {
      return undefined;
    }
  };

  let parsed = tryLoose(raw);
  if (parsed !== undefined) return parsed;

  const wrappedByDouble = raw.startsWith('"') && raw.endsWith('"');
  const wrappedBySingle = raw.startsWith("'") && raw.endsWith("'");

  if (wrappedByDouble || wrappedBySingle) {
    const unwrapped = raw.slice(1, -1).trim();
    parsed = tryLoose(unwrapped);
    if (parsed !== undefined) return parsed;

    const normalized = unwrapped
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");
    parsed = tryLoose(normalized);
    if (parsed !== undefined) return parsed;
  }

  try {
    const jsonParsed = JSON.parse(raw);
    if (jsonParsed && typeof jsonParsed === 'object') return jsonParsed;
    if (typeof jsonParsed === 'string') {
      parsed = tryLoose(jsonParsed);
      if (parsed !== undefined) return parsed;

      const normalized = jsonParsed.replace(/\\"/g, '"');
      parsed = tryLoose(normalized);
      if (parsed !== undefined) return parsed;
    }
  } catch {
  }

  return vars.parseLooseJson(raw);
}

/**
 * Web: Set Cookie -name: {param} -value: {param} -options: {param}
 *
 * Adds a cookie for the current page URL.
 *
 * @param page - Playwright Page instance
 * @param name - Cookie name
 * @param value - Cookie value
 * @param options - Optional JSON string or object with cookie attributes:
 *  - domain, path, sameSite, secure, httpOnly, expires
 * @throws Error if page is not initialized or required params are missing
 */
export async function setCookie(page: Page, name: string, value: string, options?: string | Record<string, any>) {
  if (!page) throw new Error("Page not initialized");
  const options_json = parseCookieOptions(options);
  const stepName = `Web: Set Cookie -name: ${name}`;
  if (!name) throw new Error("Cookie.setCookie: 'name' is required");
  if (value === undefined || value === null) throw new Error("Cookie.setCookie: 'value' is required");
  const ctx = page.context();
  const cookie: any = { name, value };

  // Precedence: explicit url > domain/path > current page url
  const explicitUrl = options_json?.url;
  const explicitDomain = options_json?.domain;
  const explicitPath = options_json?.path;

  if (explicitUrl) {
    // When url is specified, do not include domain/path
    cookie.url = explicitUrl;
  } else if (explicitDomain || explicitPath) {
    // When domain/path are specified, construct a URL for reliability
    const pageUrl = new URL(page.url());
    const hostPart = explicitDomain || pageUrl.hostname;
    const pathPart = explicitPath || '/';
    const protocol = pageUrl.protocol;
    try {
      cookie.url = `${protocol}//${hostPart}${pathPart}`;
    } catch {
      // Fallback to domain/path if URL construction fails
      if (explicitDomain) cookie.domain = explicitDomain;
      cookie.path = explicitPath || '/';
    }
  } else {
    // Default to current page url if no domain/path/url provided
    cookie.url = page.url();
  }

  if (options_json?.sameSite) cookie.sameSite = options_json.sameSite;
  if (options_json?.secure !== undefined) cookie.secure = !!options_json.secure;
  if (options_json?.httpOnly !== undefined) cookie.httpOnly = !!options_json.httpOnly;
  if (typeof options_json?.expires === 'number') cookie.expires = options_json.expires;
  if (isPlaywrightRunner()) { await __allureAny_cookie.step(stepName, async () => { await ctx.addCookies([cookie]); }); }
  else { await ctx.addCookies([cookie]); }
}

/**
 * Web: Get Cookie -name: {param}
 *
 * Retrieves the value of a cookie by name.
 *
 * @param page - Playwright Page instance
 * @param name - Cookie name
 * @param options - Optional JSON string or object: { assert?: boolean }
 * @returns Cookie value or undefined
 * @throws Error if page is not initialized or when assert=true and cookie missing
 */
export async function getCookie(page: Page, name: string, options?: string | Record<string, any>) {
  if (!page) throw new Error("Page not initialized");
  const options_json = parseCookieOptions(options);
  const stepName = `Web: Get Cookie -name: ${name}`;
  const domainFilter = options_json?.domain ? String(options_json.domain).toLowerCase() : undefined;
  const pathFilter = options_json?.path ? String(options_json.path) : undefined;

  const normalizeDomain = (domain?: string) => (domain || '').toLowerCase().replace(/^\./, '');
  const domainMatches = (cookieDomain?: string, targetDomain?: string) => {
    if (!targetDomain) return true;
    const cookie = normalizeDomain(cookieDomain);
    const target = normalizeDomain(targetDomain);
    return cookie === target || cookie.endsWith(`.${target}`);
  };

  const cookieMatches = (cookie: any) => {
    if (!cookie || cookie.name !== name) return false;
    if (!domainMatches(cookie.domain, domainFilter)) return false;
    if (pathFilter && cookie.path !== pathFilter) return false;
    return true;
  };

  const run = async () => {
    const ctx = page.context();
    const scopedCookies = await ctx.cookies(page.url());
    let found = scopedCookies.find(cookieMatches);

    if (!found) {
      const allCookies = await ctx.cookies();
      found = allCookies.find(cookieMatches);
    }

    const val = found?.value;
    if (options_json?.assert === true && (val === undefined || val === null)) {
      throw new Error(`Cookie.getCookie: No cookie found with name '${name}'`);
    }
    return val;
  };
  if (isPlaywrightRunner()) { return __allureAny_cookie.step(stepName, run); }
  return run();
}

/**
 * Web: Delete Cookie -name: {param}
 *
 * Clears cookies. Note: Playwright API does not support deleting a single cookie directly; this clears all cookies in context.
 *
 * @param page - Playwright Page instance
 * @param name - Cookie name (for reporting only)
 * @throws Error if page is not initialized
 */
export async function deleteCookie(page: Page, name: string) {
  if (!page) throw new Error("Page not initialized");
  const stepName = `Web: Delete Cookie -name: ${name}`;
  const run = async () => {
    const ctx = page.context();
    await ctx.clearCookies();
  };
  if (isPlaywrightRunner()) { await __allureAny_cookie.step(stepName, run); } else { await run(); }
}

/**
 * Web: Clear Cookies
 *
 * Clears all cookies in the current browser context.
 *
 * @param page - Playwright Page instance
 * @throws Error if page is not initialized
 */
export async function clearCookies(page: Page) {
  if (!page) throw new Error("Page not initialized");
  const stepName = `Web: Clear Cookies`;
  const run = async () => { await page.context().clearCookies(); };
  if (isPlaywrightRunner()) { await __allureAny_cookie.step(stepName, run); } else { await run(); }
}
