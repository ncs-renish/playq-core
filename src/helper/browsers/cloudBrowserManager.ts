import fs from "fs";
import path from "path";
import * as vars from "../bundle/vars";

type AnyRecord = Record<string, any>;

let cachedResolvedCloudConfig: AnyRecord | null = null;

function resolveModulePath(basePath: string): string {
  const candidates = [".ts", ".js", ".mjs", ".cjs", ".json"];
  for (const ext of candidates) {
    const candidate = basePath + ext;
    if (fs.existsSync(candidate)) return candidate;
  }
  return basePath;
}

function safeRequire(modulePath: string): AnyRecord {
  delete require.cache[require.resolve(modulePath)];
  const mod = require(modulePath);
  return mod?.provider || mod?.default || mod || {};
}

function deepMerge(base: AnyRecord, override: AnyRecord): AnyRecord {
  if (!override || typeof override !== "object") return base || {};
  if (!base || typeof base !== "object") return override;
  if (Array.isArray(base) || Array.isArray(override)) return override;

  const output: AnyRecord = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = output[key];
    const overrideVal = override[key];
    output[key] =
      baseVal &&
      overrideVal &&
      typeof baseVal === "object" &&
      typeof overrideVal === "object" &&
      !Array.isArray(baseVal) &&
      !Array.isArray(overrideVal)
        ? deepMerge(baseVal, overrideVal)
        : overrideVal;
  }
  return output;
}

function getProjectRoot(): string {
  return process.env.PLAYQ_PROJECT_ROOT || process.cwd();
}

function loadProjectConfig(): AnyRecord {
  try {
    const configBase = path.resolve(getProjectRoot(), "resources/config");
    const configPath = resolveModulePath(configBase);
    const configModule = safeRequire(configPath);
    return configModule?.config || configModule || {};
  } catch {
    return {};
  }
}

function getCloudProviderName(baseCloudConfig?: AnyRecord): string {
  const envProvider = vars.getConfigValue("cloud.provider", true)?.trim();
  if (envProvider) return envProvider;
  if (baseCloudConfig?.provider) return String(baseCloudConfig.provider);
  return "browserstack";
}

function loadProviderDefaults(provider: string): AnyRecord {
  const providersDir = path.resolve(getProjectRoot(), "resources/providers");
  const providerBasePath = path.join(providersDir, `${provider}.provider`);
  const providerPath = resolveModulePath(providerBasePath);
  if (!fs.existsSync(providerPath)) {
    throw new Error(
      `Provider config not found for \"${provider}\". Expected: resources/providers/${provider}.provider.(ts|js|json)`
    );
  }
  return safeRequire(providerPath);
}

function mapBrowserStackCapabilities(browserType: string, cloudConfig: AnyRecord): AnyRecord {
  const providerConfig = cloudConfig.providerConfig || {};
  const session = cloudConfig.session || {};
  const caps = providerConfig.capabilities || {};

  const browserName = caps.browserName || browserType;
  const mapped: AnyRecord = {
    browser: browserName,
    browserName,
    browserVersion: caps.browserVersion || "latest",
    os: caps.os,
    osVersion: caps.osVersion,
    buildName: session.build,
    projectName: session.project,
    name: session.name,
    "browserstack.debug": caps.debug,
    "browserstack.console": caps.consoleLogs,
    "browserstack.networkLogs": caps.networkLogs,
    "browserstack.local": providerConfig?.local?.enabled,
    "browserstack.localIdentifier": providerConfig?.local?.identifier,
  };

  // Merge raw capability fields last so users can explicitly override mapped defaults.
  return { ...mapped, ...caps };
}

export function isCloudEnabled(): boolean {
  const fromEnvOrConfig = vars.getConfigValue("cloud.enable", true);
  if (!fromEnvOrConfig) return false;
  return String(fromEnvOrConfig).toLowerCase() === "true";
}

export function loadResolvedCloudConfig(forceReload = false): AnyRecord {
  if (cachedResolvedCloudConfig && !forceReload) {
    return cachedResolvedCloudConfig;
  }

  const config = loadProjectConfig();
  const cloud = config.cloud || {};
  const providerName = getCloudProviderName(cloud);

  if (!isCloudEnabled()) {
    cachedResolvedCloudConfig = { ...cloud, provider: providerName, providerConfig: {} };
    return cachedResolvedCloudConfig;
  }

  const providerDefaults = loadProviderDefaults(providerName);
  const providerOverrides = (cloud.providers && cloud.providers[providerName]) || cloud.providerConfig || {};
  const providerConfig = deepMerge(providerDefaults, providerOverrides);

  cachedResolvedCloudConfig = {
    ...cloud,
    provider: providerName,
    providerConfig,
  };
  return cachedResolvedCloudConfig;
}

function decryptIfEncrypted(value: string): string {
  if (value.startsWith("pwd.") || value.startsWith("enc.")) {
    const encryptedValue = value.replace(/^(pwd|enc)\./, "");
    try {
      const cryptoUtil = require("../util/utilities/cryptoUtil");
      return cryptoUtil.decrypt(encryptedValue);
    } catch (error: any) {
      throw new Error(`[PlayQ Cloud] Failed to decrypt credential: ${error?.message || error}`);
    }
  }
  return value;
}

export function buildCloudWsEndpoint(browserType: string): string {
  const cloudConfig = loadResolvedCloudConfig();
  const provider = String(cloudConfig.provider || "browserstack").toLowerCase();

  if (provider !== "browserstack") {
    throw new Error(`Unsupported cloud provider: ${provider}. Currently supported: browserstack`);
  }

  const auth = cloudConfig?.providerConfig?.auth || {};
  const userEnvName = auth.usernameEnv || "BS_USERNAME";
  const keyEnvName = auth.accessKeyEnv || "BS_ACCESS_KEY";
  const rawUsername = process.env[userEnvName];
  const rawAccessKey = process.env[keyEnvName];

  if (!rawUsername || !rawAccessKey) {
    throw new Error(
      `Missing BrowserStack credentials. Set ${userEnvName} and ${keyEnvName} in environment.`
    );
  }

  const username = decryptIfEncrypted(rawUsername);
  const accessKey = decryptIfEncrypted(rawAccessKey);

  const caps = mapBrowserStackCapabilities(browserType, cloudConfig);
  caps["browserstack.username"] = username;
  caps["browserstack.accessKey"] = accessKey;

  return `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify(caps))}`;
}

export function getCloudConnectionTimeoutMs(defaultTimeout = 120000): number {
  const timeout = vars.getConfigValue("cloud.connection.timeoutMs", true);
  const parsed = Number(timeout);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultTimeout;
}
