// src/helper/loc/locatorResolver.ts
import type { Page, Locator } from "playwright";
import * as vars from "../bundle/vars";
import * as path from "path";
import * as fs from "fs";
// Access project-provided engines dynamically at call time to avoid module init ordering issues
function getEngines(): any { return (globalThis as any).engines || {}; }
// import { smartAI} from "@project/engines/smartAi/smartAiEngine";




export async function webLocResolver(
    type: string,
    selector: string,
    pageArg: Page,
    overridePattern?: string,
    timeout?: number,
    smartAiRefresh: 'before' | 'after' | '' = ''
  ): Promise<Locator> {
    console.log(`🔍 Resolving locator: ${selector}`);
    const page = pageArg
    const isPlaywrightPrefixed = selector.startsWith("xpath=") || selector.startsWith("xpath =") || selector.startsWith("css=") || selector.startsWith("css =");
    if (isPlaywrightPrefixed) {
      // const rawSelector = selector.replace(/^xpath=|^css=|^xpath =|^xpath=\\|^xpath =\\|^css =/, "");
      // Normalize escaped forward slashes first, then remove prefix
      const rawSelector = selector
        .replace(/^xpath=\\|^xpath =\\/, "xpath=") // normalize `xpath=\` to `xpath=`
        .replace(/^xpath=|^xpath =|^css=|^css =/, "") // remove the actual prefix
        .replace(/\\\//g, "/"); // replace escaped slashes with normal ones
      console.log("📍 Detected Playwright-prefixed selector. Returning raw locator.");
      return page.locator(rawSelector);
    }

    const isPlaywrightChainedPrefixed = selector.startsWith("chain=") || selector.startsWith("chain =");
    if (isPlaywrightChainedPrefixed) {
      const rawSelector = selector.replace(/^chain=|^chain =/, "");
      console.log("📍 Detected Playwright-prefixed chained selector. Returning raw locator.");
      return page.locator(rawSelector);
    }

    const isXPath =
      selector.trim().startsWith("//") || selector.trim().startsWith("(");
    const isCSS =
      selector.includes(">") ||
      selector.startsWith(".") ||
      selector.includes("#");
    const isChained = selector.includes(">>");
    const isResourceLocator = selector.startsWith("loc.");

    if ((isXPath || isCSS || isChained) && !isResourceLocator) {
      console.log("📍 Detected XPath/CSS/Chained. Returning locator directly.");
      return page.locator(selector);
    }

    if (isResourceLocator) {
      const parts = selector.split(".");
      if (parts.length < 3) {
        throw new Error(
          `❌ Invalid locator format: "${selector}". Expected format: loc.(ts|json).<page>.<field>`
        );
      }

      const [, locType, pageName, fieldName] = parts;
        if (selector.startsWith("loc.json.")) {
        const [, , fileName, pageName, fieldName] = selector.split(".");
        // Resolve JSON locator path using PLAYQ_PROJECT_ROOT instead of alias
        const projectRoot = process.env.PLAYQ_PROJECT_ROOT || process.cwd();
        const jsonLocatorPath = path.resolve(projectRoot, `resources/locators/json/${fileName}.json`);
        
        if (!fs.existsSync(jsonLocatorPath)) {
          throw new Error(
            `❌ JSON locator file not found: ${jsonLocatorPath}`
          );
        }
        
        try {
          const jsonContent = fs.readFileSync(jsonLocatorPath, 'utf-8');
          const jsonLocatorMap = JSON.parse(jsonContent);
          const pageObj = jsonLocatorMap?.[pageName];
          if (!pageObj)
            throw new Error(
              `❌ Page "${pageName}" not found in ${fileName}.json`
            );
          const locatorString = pageObj[fieldName];
          if (!locatorString)
            throw new Error(
              `❌ Field "${fieldName}" not found in ${fileName}.json[${pageName}]`
            );
          console.log(
            `🧩 Resolved locator string from loc.json.${fileName}.${pageName}.${fieldName} -> ${locatorString}`
          );
          return page.locator(await vars.replaceVariables(locatorString));
        } catch (err: any) {
          throw new Error(
            `❌ Failed to resolve JSON locator from ${fileName}.json: ${err.message}`
          );
        }
      }

      if (selector.startsWith("loc.ts.")) {
        const [, , fileName, pageName, fieldName] = selector.split(".");
        // First try globalThis.loc if available
        const globalLoc = (globalThis as any).loc;
        if (globalLoc?.[fileName]?.[pageName]?.[fieldName]) {
          // console.log(`✅ Found locator in globalThis.loc for loc.ts.${fileName}.${pageName}.${fieldName}`);
          return globalLoc[fileName][pageName][fieldName](page);
        }
      }

      if (selector.startsWith("loc.")) {
        const [, fileName, pageName, fieldName] = selector.split(".");
        
        // First try globalThis.loc if available
        const globalLoc = (globalThis as any).loc;
        if (globalLoc?.[fileName]?.[pageName]?.[fieldName]) {
          // console.log(`✅ Found locator in globalThis.loc for loc.ts.${fileName}.${pageName}.${fieldName}`);
          return globalLoc[fileName][pageName][fieldName](page);
        }
      }


      throw new Error(
        `❌ Unknown locator source type "${locType}". Use loc. or locator.`
      );
    }
   if (overridePattern && overridePattern.toLowerCase() === '-no-check-') {
      console.log("📍 '-no-check-' detected. Skipping locator resolution.");
      return undefined as any; // or even better, throw a custom signal or null to trigger fallback
    }
    
    // SmartAI (guard if engine missing)
    const isSmartAiEnabled = String(vars.getConfigValue('smartAi.enable')).toLowerCase().trim() === 'true';
    if (isSmartAiEnabled) {
      const smartAiEngine = getEngines()?.smartAi;
      if (typeof smartAiEngine === 'function') {
        return await smartAiEngine(page, type, selector, smartAiRefresh);
      } else {
        console.warn('⚠️ SmartAI enabled but engines.smartAi not available/function. Falling back.');
      }
    }
   
    // Fallback to locatorPattern (locPattern)
    const isPatternEnabled = String(vars.getConfigValue('patternIq.enable')).toLowerCase().trim() === 'true';
    console.log('PatternIQ enabled?', isPatternEnabled);
    if (isPatternEnabled) {
      const eng = getEngines();
      try { console.log('PatternIQ engines keys:', Object.keys(eng || {})); } catch {}
      const patternEngine = eng?.patternIq || (eng && (eng as any).engines && (eng as any).engines.patternIq);
      if (typeof patternEngine === 'function') {
        return await patternEngine(page, type, selector, overridePattern, timeout);
      } else {
        console.warn('⚠️ PatternIQ enabled but engines.patternIq not available/function. Falling back to default locator.');
      }
    }

    // Fallback to default locator
    return page.locator(selector);
  }

