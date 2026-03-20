// Public entrypoint for @playq/core
// Re-export commonly used framework APIs

// Global aggregator (vars, fixtures, actions, utils, faker, etc.)
export * from './global';

// Lightweight config/env helpers for use in config files
export { loadEnv } from './helper/bundle/env';
export * as vars from './helper/bundle/vars';

// Optional: direct exports for key fixtures
export { webFixture } from './helper/fixtures/webFixture';
export { logFixture } from './helper/fixtures/logFixture';
export { webLocResolver } from './helper/fixtures/webLocFixture';
export { buildCloudWsEndpoint, getCloudConnectionTimeoutMs, isCloudEnabled, loadResolvedCloudConfig } from './helper/browsers/cloudBrowserManager';
import { getLocNamespace } from './helper/fixtures/locAggregate';
// Expose loc from global if already initialized (via alias import), else build a best-effort namespace
export const loc: any = (globalThis as any).loc || getLocNamespace();
