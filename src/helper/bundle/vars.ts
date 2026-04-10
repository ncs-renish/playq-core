import * as fs from "fs";
import * as path from "path";
import { evaluateFakerExpression } from "../faker/fakerResolver";

let importedVars: Record<string, string> = {};

const patternDirs = [
  path.resolve(process.env.PLAYQ_PROJECT_ROOT || process.cwd(), "resources/patterns"),
  path.resolve(process.env.PLAYQ_PROJECT_ROOT || process.cwd(), "extend/addons/pattern"),
];

const storedVars: Record<string, string> = {};
const loggedMissingKeys = new Set<string>();
const resolvingKeys = new Set<string>();
let runtimeDataRow: Record<string, any> | null = null;

function setRuntimeDataRow(row: Record<string, any> | null): void {
  runtimeDataRow = row;
  (globalThis as any).playqCurrentDataRowLive = row;
}

function finalizeValue(key: string, value: any): string {
  const strValue = value === undefined || value === null ? "" : String(value);
  if (!strValue.includes("#{")) return strValue;

  // Guard against recursive references like A -> #{B}, B -> #{A}
  if (resolvingKeys.has(key)) return strValue;

  resolvingKeys.add(key);
  try {
    return replaceVariables(strValue);
  } finally {
    resolvingKeys.delete(key);
  }
}

function getValue(key: string, ifEmpty?: boolean): string {
  if (!key) {
    console.warn("⚠️ Empty key provided to getValue");
    return ifEmpty ? "" : key;
  }
  key = key.trim();
  
  if (key.startsWith("env.")) {
    const envKey = key.slice(4);
    const envValue = process.env[envKey];
    if (!envValue) {
      return ifEmpty ? "" : key;
    }
    return finalizeValue(key, envValue);
  }

  if (key.startsWith("data.")) {
    const dataKey = key.slice(5);
    const activeRow = runtimeDataRow || (globalThis as any).playqCurrentDataRowLive || null;
    if (activeRow) {
      // Support both flat keys ("fName") and dot-path nested keys ("Page_1.Col_8")
      const segments = dataKey.split('.');
      let node: any = activeRow;
      for (const seg of segments) {
        if (node !== null && node !== undefined && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, seg)) {
          node = node[seg];
        } else {
          node = undefined;
          break;
        }
      }
      if (node !== undefined) {
        return finalizeValue(key, node);
      }
    }
    return ifEmpty ? "" : key;
  }

  if (key in storedVars) {
    if (ifEmpty && storedVars[key] === key) return "";
    return finalizeValue(key, storedVars[key]);
  }

  // Only log when this is not an existence check
  if (!ifEmpty && !loggedMissingKeys.has(key)) {
    console.warn(`⚠️ Variable not found for key: "${key}"`);
    loggedMissingKeys.add(key);
  }

  return ifEmpty ? "" : key;
}


function getConfigValue(key: string, ifEmpty?: boolean): string {
  // Support environment variable overrides using PLAYQ__ dotted path mapping.
  // Example: config.browser.browserType -> PLAYQ__browser__browserType
  const rawKey = key.trim();
  const envKey = 'PLAYQ__' + rawKey.replace(/\./g, '__');
  if (process.env[envKey]) return process.env[envKey] as string;

  const fullKey = 'config.' + rawKey;
  if (fullKey in storedVars) return storedVars[fullKey];

  if (!loggedMissingKeys.has(fullKey)) {
    loggedMissingKeys.add(fullKey);
    if (ifEmpty) return '';
  }
  return fullKey;
}

function setValue(key: string, value: string): void {
  storedVars[key] = value;
  if (key.startsWith("var.static.")) {
    updateVarStaticJson(key.slice(11), value);
  }
}

function updateVarStaticJson(key: string, value: string): void {
  const jsonFilePath = path.resolve(process.cwd(), "resources/var.static.json");
  
  let data: Record<string, string> = {};
  
  // Read existing file if it exists
  if (fs.existsSync(jsonFilePath)) {
    try {
      const fileContent = fs.readFileSync(jsonFilePath, "utf-8");
      data = JSON.parse(fileContent);
      console.log(`📖 Existing data:`, data); // Debug log
    } catch (error) {
      console.warn(`Warning: Could not parse existing var.static.json:`, error.message);
      data = {};
    }
  } else {
    console.log(`📝 Creating new var.static.json file`);
  }
  
  // Store old value for comparison
  const oldValue = data[key];
  
  // Update or add the key-value pair
  data[key] = value;
  
  console.log(`🔄 Updating key "${key}": "${oldValue}" → "${value}"`); // Debug log
  console.log(`📦 Final data:`, data); // Debug log
  
  // Ensure the directory exists
  const dir = path.dirname(jsonFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Write the updated data back to the file
  try {
    fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2), "utf-8");
    
    if (oldValue !== undefined) {
      console.log(`✅ Updated var.static.json: ${key} = ${value} (was: ${oldValue})`);
    } else {
      console.log(`✅ Added to var.static.json: ${key} = ${value}`);
    }
  } catch (error) {
    console.error(`❌ Failed to write to var.static.json:`, error.message);
    throw error;
  }
}

function replaceVariables(input: any): string {
  if (typeof input !== "string") input = input.toString();
  return input.replace(/\#\{([^}]+)\}/g, (_, varName) => {
    if (varName.startsWith("pwd.")) {
      const encryptedValue = varName.replace(/^pwd\./, "");
      try {
        const crypto = require("../util/utilities/cryptoUtil");
        return crypto.decrypt(encryptedValue);
      } catch (error) {
        console.warn('Warning: Could not decrypt pwd value:', error.message);
        return varName;
      }
    } else if (varName.startsWith("enc.")) {
      const encryptedValue = varName.replace(/^enc\./, "");
      try {
        const crypto = require("../util/utilities/cryptoUtil");
        return crypto.decrypt(encryptedValue);
      } catch (error) {
        console.warn('Warning: Could not decrypt enc value:', error.message);
        return varName;
      }
    }
    
    if (varName.startsWith("faker.")) {
      try {
        const fakerVal = evaluateFakerExpression(varName);
        if (fakerVal === undefined || fakerVal === null) return "";
        return typeof fakerVal === "object" ? JSON.stringify(fakerVal) : String(fakerVal);
      } catch (error: any) {
        console.warn(`Warning: Could not evaluate faker value '${varName}':`, error?.message || error);
        return varName;
      }
    }

    if (varName.endsWith(".(toNumber)")) {
      const baseVar = varName.replace(".(toNumber)", "");
      const value = getValue(baseVar);
      return value !== undefined && value !== null && value !== ""
        ? Number(value)
        : "";
    }
    return getValue(varName);
  });
}

function debugVars() {
  console.log("📦 Static Vars:", storedVars);
}

function flattenConfig(obj: any, prefix = "config"): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const key in obj) {
    const fullKey = `${prefix}.${key}`;
    if (typeof obj[key] === "object" && obj[key] !== null && !Array.isArray(obj[key])) {
      Object.assign(entries, flattenConfig(obj[key], fullKey));
    } else if (Array.isArray(obj[key])) {
      entries[fullKey] = obj[key].join(";");
    } else {
      entries[fullKey] = String(obj[key]);
    }
  }
  return entries;
}

function loadPatternEntries() {
  const files: string[] = [];
  for (const dir of patternDirs) {
    if (fs.existsSync(dir)) {
      try {
        const dirFiles = fs
          .readdirSync(dir)
          .filter((file) => {
            const isTS = file.endsWith(".pattern.ts");
            const isAddonDir = dir.includes("extend/addons/pattern");
            if (!isTS) return false;
            if (isAddonDir) return file.startsWith("_");
            return !file.startsWith("_");
          })
          .map((file) => path.join(dir, file));
        files.push(...dirFiles);
      } catch (error) {
        console.warn(`Warning: Could not read pattern directory ${dir}:`, error.message);
      }
    }
  }

  for (const file of files) {
    try {
      const fileName = path.basename(file, ".pattern.ts");
      if (!/^[a-zA-Z0-9_]+$/.test(fileName)) {
        console.warn(`❌ Invalid pattern file name "${fileName}". Only alphanumeric characters and underscores are allowed.`);
        continue;
      }
      
      delete require.cache[require.resolve(file)];
      const patternModule = require(file);
      const exported = patternModule[fileName] || patternModule.default?.[fileName];
      
      if (!exported) {
        console.warn(`❌ Exported const '${fileName}' not found in: ${file}`);
        continue;
      }
      
      const flattened = flattenConfig(exported, `pattern.${fileName}`);
      Object.assign(storedVars, flattened);
    } catch (error) {
      console.warn(`Warning: Could not load pattern file ${file}:`, error.message);
    }
  }
}

function loadFileEntries(file: string, constName: string, prefix?: string) {
  console.log(`🔍 Loading file: ${file} with constName: ${constName} and prefix: ${prefix}`);
  
  const absPath = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  
  if (!fs.existsSync(absPath)) {
    throw new Error(`❌ Load file not found: ${absPath}`);
  }
  
  const ext = path.extname(absPath);
  let data: any;

  if (ext === ".ts" || ext === ".js") {
    delete require.cache[require.resolve(absPath)];
    const module = require(absPath);
    data = module[constName] || (module.default && module.default[constName]) || module.default || module;
    
    if (!data) {
      throw new Error(`❌ Exported const '${constName}' not found in: ${file}`);
    }
  } else if (ext === ".json") {
    data = JSON.parse(fs.readFileSync(absPath, "utf-8"));
  } else {
    throw new Error(`❌ Unsupported file extension: ${ext}`);
  }

  const flat = flattenConfig(data, prefix || "");
  Object.assign(storedVars, flat);
}

function resolveModulePath(basePath: string): string {
  const candidates = [".ts", ".js", ".mjs", ".cjs", ".json"];
  for (const ext of candidates) {
    const candidate = basePath + ext;
    if (fs.existsSync(candidate)) return candidate;
  }
  return basePath; // fall back to base (may still resolve via require paths)
}

function parseLooseJson(str: string): Record<string, any> {
  if (!str || str.trim() === "" || str.trim() === '""') return {};

  const needsBraces = !str.trim().startsWith("{") || !str.trim().endsWith("}");
  let wrappedStr = needsBraces ? `{${str}}` : str;

  try {
    const locatorRegex = /(["']?locator["']?\s*:\s*)(xpath=[^,\}\n\r]+|css=[^,\}\n\r]+|chain=[^,\}\n\r]+)/g;
    const locatorPlaceholders: string[] = [];
    
    let maskedStr = wrappedStr.replace(locatorRegex, (match, p1, p2) => {
      locatorPlaceholders.push(`"${p2.trim()}"`);
      return `${p1}__LOCATOR_PLACEHOLDER_${locatorPlaceholders.length - 1}__`;
    });

    // Convert single-quoted values to double-quoted
    maskedStr = maskedStr.replace(/:\s*'((?:[^']|\\')*)'/g, (match, p1) => {
      return `: "${p1}"`;
    });

    // Convert single-quoted keys to double-quoted keys: 'key' -> "key"
    maskedStr = maskedStr.replace(/([{,]\s*)'([a-zA-Z0-9_]+)'\s*:/g, '$1"$2":');

    let normalized = maskedStr
      .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
      .replace(/:\s*True\b/g, ": true")
      .replace(/:\s*False\b/g, ": false")
      .replace(/:\s*None\b/g, ": null")
      .replace(/,(\s*[}\]])/g, "$1");

    locatorPlaceholders.forEach((value, index) => {
      normalized = normalized.replace(`__LOCATOR_PLACEHOLDER_${index}__`, value);
    });

    return JSON.parse(normalized);
  } catch (err) {
    throw new Error(`❌ Failed to parse options string: "${str}". Error: ${err.message}`);
  }
}

function loadDefaults() {
  try {
    // defaultEntries sits next to this file; load it relatively to avoid env/path issues
    const { default: defaultEntries } = require('./defaultEntries');
    
    if (Array.isArray(defaultEntries)) {
      defaultEntries.forEach((item) => {
        let value = getValue('env.' + item.name, true) ? getValue('env.' + item.name) : (getValue(item.name, true) ? getValue(item.name) : item.value);
        setValue(item.name, value);
      });
    }
  } catch (error) {
    console.warn('Warning: Could not load default entries:', error.message);
  }
}

function initVars(vars?: Record<string, string>) {
  try {
    // Load config with error handling
    let configEntries = {};
    try {
      const importConfigBase = path.resolve(process.env.PLAYQ_PROJECT_ROOT, 'resources/config');
      const importConfigPath = resolveModulePath(importConfigBase);
      console.log('🔎 [core] Requiring config from:', importConfigPath);
      const configModule = require(importConfigPath);
      configEntries = configModule.config || configModule.default || {};
    } catch (error) {
      console.warn('Warning: Could not load config file, using empty config');
    }

    // Load static variables preferring resources/var.static.json
    let variablesEntries = {};
    const varStaticPath = path.resolve(process.env.PLAYQ_PROJECT_ROOT, 'resources/var.static.json');
    if (fs.existsSync(varStaticPath)) {
      try {
        console.log('🔎 [core] Loading var.static.json:', varStaticPath);
        const fileContent = fs.readFileSync(varStaticPath, 'utf-8');
        variablesEntries = JSON.parse(fileContent) || {};
      } catch (error) {
        console.warn('Warning: Could not parse var.static.json, using empty variables:', (error as any).message);
      }
    } else {
      // Fallback to legacy resources/variable module if present
      try {
        const importVariableBase = path.resolve(process.env.PLAYQ_PROJECT_ROOT, 'resources/variable');
        const importVariablePath = resolveModulePath(importVariableBase);
        console.log('🔎 [core] Requiring legacy variable module from:', importVariablePath);
        const variableModule = require(importVariablePath);
        variablesEntries = variableModule.var_static || variableModule.default || {};
      } catch (error) {
        console.warn('Warning: Could not load variable file (var.static.json or legacy module), using empty variables');
      }
    }

    if (vars) {
      Object.assign(storedVars, vars);
    }
    
    Object.assign(storedVars, flattenConfig(variablesEntries, "var.static"));
    Object.assign(storedVars, flattenConfig(configEntries, "config"));
    loadPatternEntries();
    loadDefaults();
  } catch (error) {
    console.error('Error initializing vars:', error.message);
  }
}

export {
  getValue,
  getConfigValue,
  setValue,
  setRuntimeDataRow,
  replaceVariables,
  debugVars,
  parseLooseJson,
  loadFileEntries,
  initVars
};



