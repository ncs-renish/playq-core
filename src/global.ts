import * as vars from './helper/bundle/vars';
import path from 'path';
import { webFixture } from './helper/fixtures/webFixture';
import { logFixture } from './helper/fixtures/logFixture';
import * as utils from './helper/util/utils';
import { faker } from './helper/faker/customFaker';
import { webLocResolver } from './helper/fixtures/webLocFixture';
import { getLocNamespace } from './helper/fixtures/locAggregate';
import * as comm from './helper/actions/commActions';
import * as web from './helper/actions/webActions';
import * as api from './helper/actions/apiActions';
import { dataTest } from './helper/util/test-data/dataTest';
import { getTestData, getRowByMeta, resolveDataPath, parseCsvLine } from './helper/util/test-data/dataLoader';

const addons: any = (() => {
  const root = process.env.PLAYQ_PROJECT_ROOT || process.cwd();
  const tryReq = (id: string) => { try { return require(id); } catch { return undefined; } };
  // Prefer absolute path in new layout, then new alias; no legacy fallbacks
  return (
    tryReq(require('path').join(root, 'playq', 'addons')) ||
    tryReq('@project/addons') ||
    undefined
  );
})();

const engines: any = (() => {
  const root = process.env.PLAYQ_PROJECT_ROOT || process.cwd();
  const tryReq = (id: string) => { try { return require(id); } catch { return undefined; } };
  const pathMod = require('path');
  // Start with index exports to bring in lazy wrappers (patternIq, smartAi)
  const merged: any = {};
  const idxAbs = tryReq(pathMod.join(root, 'playq', 'engines'));
  if (idxAbs) Object.assign(merged, idxAbs);
  const idxAlias = tryReq('@project/engines');
  if (idxAlias) Object.assign(merged, idxAlias);
  // Supplement with direct engines if missing
  const directPattern = [
    pathMod.join(root, 'playq', 'engines', 'patternIq', 'patternIqEngine'),
    '@project/engines/patternIq/patternIqEngine',
  ];
  for (const id of directPattern) {
    if (!merged.patternIq) {
      const mod = tryReq(id);
      if (mod) merged.patternIq = (mod as any).patternIq || (mod as any).default || mod;
    }
  }
  const directSmart = [
    pathMod.join(root, 'playq', 'engines', 'smartAi', 'smartAiEngine'),
    '@project/engines/smartAi/smartAiEngine',
  ];
  for (const id of directSmart) {
    if (!merged.smartAi) {
      const mod = tryReq(id);
      if (mod) merged.smartAi = (mod as any).smartAi || (mod as any).default || mod;
    }
  }
  return merged;
})();

const config: any = (() => {
  const pathMod = require('path');
  const root = process.env.PLAYQ_PROJECT_ROOT || process.cwd();
  const configBase = pathMod.join(root, 'resources', 'config');
  let resolvedPath = '';
  let configObj = {};
  try {
    // // Try .js first (for built/production), then .ts (for ts-node/dev)
    // if (require('fs').existsSync(configBase + '.js')) {
    //     resolvedPath = configBase + '.js';
    // } else if (require('fs').existsSync(configBase + '.ts')) {
    //     resolvedPath = configBase + '.ts';
    // }
    resolvedPath = configBase + '.ts';
    if (resolvedPath) {
      configObj = require(resolvedPath).config || {};
    }
  } catch {
    configObj = {};
  }
  return configObj;
})();





const testType = process.env.TEST_TYPE;
const allowedTypes = ['ui', 'api', 'mobile'] as const;

globalThis.runType = allowedTypes.includes(testType as any)
  ? (testType as typeof allowedTypes[number])
  : 'ui';

globalThis.vars = vars;
globalThis.webLocResolver = webLocResolver;
globalThis.uiFixture = webFixture;
globalThis.logFixture = logFixture;
globalThis.utils = utils;
globalThis.faker = faker;
globalThis.comm = comm;
globalThis.web = web;
globalThis.api = api;
globalThis.dataTest = dataTest;
// Data loader utilities for accessing test data files
globalThis.getTestData = getTestData;
globalThis.getRowByMeta = getRowByMeta;
globalThis.resolveDataPath = resolveDataPath;
globalThis.parseCsvLine = parseCsvLine;
// Build and expose 'loc' namespace; prefer folder auto-discovery to avoid requiring an index file
(() => {
  try {
    // First: dynamic aggregator scanning the project folder for *.loc.(ts|js)
    const locNs = getLocNamespace();
    if (locNs && Object.keys(locNs).length > 0) {
      (globalThis as any).loc = locNs;
      return;
    }
  } catch { }
  try {
    // Fallback: attempt to load the consumer's loc namespace via tsconfig-paths alias
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@resources/locators');
    const locNs = mod.default && typeof mod.default === 'object' ? { ...mod.default, ...mod } : mod;
    (globalThis as any).loc = locNs;
  } catch (e: any) {
    console.warn('⚠️ Unable to initialize loc namespace (no folder matches or alias module):', e?.message || e);
  }
})();
globalThis.addons = addons;
globalThis.engines = engines;

// Export a stable 'loc' binding for consumers: import { loc } from '@playq/core'
let loc: any;
try { loc = (globalThis as any).loc || getLocNamespace() || {}; } catch { loc = {}; }

export { vars, webLocResolver, webFixture, logFixture, utils, faker, comm, web, api, dataTest, addons, engines, config, loc, getTestData, getRowByMeta, resolveDataPath, parseCsvLine };