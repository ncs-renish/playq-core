// // Replaced legacy '@playq' alias import with direct relative import from public globals
// import { config, vars } from "../global";

// // Loading D365 CRM pattern
// const d365CrmEnable = config?.addons?.d365Crm?.enable || vars.getConfigValue('addons.d365Crm.enable').toLowerCase().trim() === 'true';
// const d365CrmVersion = config?.addons?.d365Crm?.version || vars.getConfigValue('addons.d365Crm.version').toLowerCase().trim();
// // Updated: Look for D365 pattern in playq/addons/d365Crm/pattern/ (new path)
// if (d365CrmEnable && d365CrmVersion.startsWith("v")) vars.loadFileEntries(`playq/addons/d365Crm/pattern/d365CrmPattern_${d365CrmVersion}.ts`, "d365CrmLocPatterns", "pattern.d365crm");



import { config, vars } from "../global";
import path from "path";
import fs from "fs";
import { isCloudEnabled, loadResolvedCloudConfig } from "../helper/browsers/cloudBrowserManager";

// Use minimal addons.json for discovery, config for logic
const projectRoot = process.env.PLAYQ_PROJECT_ROOT || process.cwd();
const addonsJsonPath = path.join(projectRoot, "playq", "addons", "addons.json");
let addonList: Array<{ name: string; description: string }> = [];

try {
  const raw = fs.readFileSync(addonsJsonPath, "utf-8");
  addonList = JSON.parse(raw);
} catch (e) {
  console.warn("No addons.json found or failed to load:", e);
}

if (isCloudEnabled()) {
  try {
    const resolvedCloud = loadResolvedCloudConfig();
    const providerName = resolvedCloud?.provider || "browserstack";
    vars.setValue("config.cloud.resolvedProvider", String(providerName));
    console.log(`[PlayQ Cloud] Provider loaded: ${providerName}`);
  } catch (error: any) {
    throw new Error(`[PlayQ Cloud] Failed to load provider config: ${error?.message || error}`);
  }
}

for (const addon of addonList) {
    console.log("[PLAYQ DEBUG] Processing addon:", addon.name);
  const addonKey = addon.name;
  let configEntry = config?.addons?.[addonKey];
  let enabled = false;
  let version = "";
  // Debug: print configEntry and its type
  console.log(`[PLAYQ DEBUG] configEntry for ${addonKey}:`, configEntry, 'type:', typeof configEntry);
  console.log("[PLAYQ DEBUG] config object:", config);
  if (configEntry && typeof configEntry === 'object') {
    enabled = configEntry.enable === true || String(configEntry.enable).toLowerCase() === "true";
    version = configEntry.version || "";
    console.log(`[PLAYQ DEBUG] (object) enabled:`, enabled, 'version:', version);
  } else {
    // Use vars.getConfigValue for enable/version as string
    const enableStr = String(vars.getConfigValue(`addons.${addonKey}.enable`)).toLowerCase().trim();
    const versionStr = String(vars.getConfigValue(`addons.${addonKey}.version`)).toLowerCase().trim();
    enabled = enableStr === 'true';
    version = versionStr;
    console.log(`[PLAYQ DEBUG] (vars) enableStr:`, enableStr, 'versionStr:', versionStr);
  }

  console.log("[PLAYQ DEBUG] Before if condition addon:", enabled , " >> ", version);
  if (enabled && version.startsWith("v")) {
    console.log("[PLAYQ DEBUG] After if condition addon:", enabled , " >> ", version);
     try {
        vars.loadFileEntries(`playq/addons/${addonKey}/pattern/${addonKey}Pattern_${version}.ts`, `${addonKey}LocPatterns`, `pattern.${addonKey.toLowerCase()}`);
    } catch (e) {
        console.warn(`Pattern file for ${addonKey} not found or failed to load:`, e);
    }

    // Prefer .js if exists, else .ts
    // const basePatternPath = path.join(projectRoot, "playq", "addons", addonKey, "pattern", `${addonKey}Pattern_${version}`);
    // let patternPath = basePatternPath + ".js";
    // if (!fs.existsSync(patternPath)) {
    //   patternPath = basePatternPath + ".ts";
    // }
    // try {
    //   vars.loadFileEntries(patternPath, `${addonKey}LocPatterns`, `pattern.${addonKey.toLowerCase()}`);
    // } catch (e) {
    //   console.warn(`Pattern file for ${addonKey} not found or failed to load:`, e);
    // }
    // Optionally, perform other addon-specific initialization here
  }
}