import type { Browser, BrowserContext, Page, Frame } from "playwright";
import { Logger } from "winston";
import { invokeBrowser } from "../browsers/browserManager";
import * as vars from "../bundle/vars";
import * as path from "path";
// Inline runner detection to avoid external alias dependency
function isPlaywrightRunner() { return process.env.TEST_RUNNER === 'playwright'; }


const pages = new Map<string, Page>();
const frames = new Map<string, Frame>();
let currentPage: Page | undefined;
let currentFrame: Frame | undefined;
let logger: Logger;
let currentPageName = "main";
let browser: Browser;
let context: BrowserContext;
let _world: any = null;
let smartIQData: any[] = [];


export const webFixture = {
  pages,
  frames,
  async launchBrowser() {
    browser = await invokeBrowser();
  },
  async newContext(options?: Parameters<Browser["newContext"]>[0]) {
    if (!options) {
      options = {
        recordVideo: {
          dir: path.join(process.env.PLAYQ_RESULTS_DIR || 'test-results', 'videos'),
        },
      };
    }

    const shouldMaximize = vars.getConfigValue('browser.maximize');
    const isMaximize = String(shouldMaximize).toLowerCase() === 'true';
    const headlessConfig = vars.getConfigValue('browser.headless');
    const isHeadless = String(headlessConfig).toLowerCase() !== 'false';

    // Matrix for cucumber contexts:
    // headed + maximize true  => viewport null (real window size)
    // headless + maximize true => deterministic fallback
    // maximize false => keep configured viewport behavior (applied in newPage)
    if (isMaximize && !isHeadless) {
      (options as any).viewport = null;
    } else if (isMaximize && isHeadless) {
      (options as any).viewport = { width: 1920, height: 1080 };
    }

    context = await browser.newContext(options);
    return context;
  },
  async newPage(name = "main") {
    const page = await context.newPage();
    pages.set(name, page);
    currentPage = page;
    currentPageName = name;

    // Align with Playwright spec config behavior:
    // - If browser.maximize=true: ignore browser.viewport and force 1920x1080
    // - Else: use custom viewport with normal defaults (1480x720)
    const shouldMaximize = vars.getConfigValue('browser.maximize');
    const isMaximize = String(shouldMaximize).toLowerCase() === 'true';

    const headlessConfig = vars.getConfigValue('browser.headless');
    const isHeadless = String(headlessConfig).toLowerCase() !== 'false';

    if (isMaximize && !isHeadless) {
      // Headed maximize uses viewport:null from context; no per-page override.
      console.log('✅ Viewport using browser window size (headed maximize mode)');
      return page;
    }

    if (isMaximize && isHeadless) {
      try {
        await page.setViewportSize({ width: 1920, height: 1080 });
        console.log('✅ Viewport set to 1920x1080 (headless maximize mode)');
      } catch (err: any) {
        console.warn(`⚠️ Failed to set viewport: ${err.message}`);
      }
      return page;
    }

    const rawViewport = vars.getConfigValue('browser.viewport');
    const rawWidth = Number(vars.getConfigValue('browser.viewport.width', true));
    const rawHeight = Number(vars.getConfigValue('browser.viewport.height', true));

    let parsedViewport: any = null;
    if (typeof rawViewport === 'object' && rawViewport) {
      parsedViewport = rawViewport;
    } else if (typeof rawViewport === 'string' && rawViewport.trim() && !rawViewport.startsWith('config.')) {
      try {
        parsedViewport = JSON.parse(rawViewport);
      } catch {
        // Ignore parse issues and fallback to flattened keys/defaults.
      }
    }

    const defaultWidth = 1480;
    const defaultHeight = 720;

    const width = Number(parsedViewport?.width ?? rawWidth);
    const height = Number(parsedViewport?.height ?? rawHeight);

    const resolvedWidth = Number.isFinite(width) && width > 0 ? width : defaultWidth;
    const resolvedHeight = Number.isFinite(height) && height > 0 ? height : defaultHeight;

    try {
      await page.setViewportSize({ width: resolvedWidth, height: resolvedHeight });
      console.log(`✅ Viewport set to ${resolvedWidth}x${resolvedHeight}`);
    } catch (err: any) {
      console.warn(`⚠️ Failed to set viewport: ${err.message}`);
    }
    
    return page;
  },
  getBrowser() {
    return browser;
  },
  getContext() {
    return context;
  },
  getCurrentPage(): Page | undefined {
    return currentPage;
  },
  setCurrentPage(name: string) {
    currentPage = pages.get(name);
    currentPageName = name;
  },
  async closeContext() {
    if (context) {
      await context.close();
    }
  },
  async closeAll() {
    try {
      if (context) {
        // Close all pages explicitly
        const allPages = context.pages();
        for (const page of allPages) {
          try {
            // If tracing is on, stop and save
            if (context.tracing && context.tracing.stop) {
              await context.tracing.stop({ path: path.join(process.env.PLAYQ_RESULTS_DIR || 'test-results', 'trace', 'trace.zip') });
            }
            await page.close();
          } catch (err) {
            // Swallow errors silently
          }
        }
        await context.close();
      }
      if (browser) {
        await browser.close();
      }
    } catch (err) {
      // Swallow errors silently
    }
  },
  setWorld(world: any) {
    _world = world;
  },
  getWorld(): any {
    if (isPlaywrightRunner()) {
      console.warn('⚠️ Skipping getWorld() in Playwright Runner');
      return null;
    }
    if (!_world) {
      throw new Error("❌ Cucumber World context not set. Did you forget to call webFixture.setWorld(this) in your step?");
    }
    return _world;
  },
  // other frame helpers remain the same
   setPlaywrightPage(page: Page) {  // ✅ Added this method!
    console.log('✅ Playwright page set in webFixture');
    currentPage = page;
  },
  // SmartIQ Imeplementation
  getSmartIQData(): any[] {
    return smartIQData;
  },
  
  setSmartIQData(data: any[]) {
    smartIQData = data;
  }
};


async function createContextWithDefaults(scenarioName: string): Promise<BrowserContext> {
    const ctx = await browser.newContext({
      recordVideo: {
        dir: "test-results/videos",
      },
    });
  
    await ctx.tracing.start({
      name: scenarioName,
      title: scenarioName,
      sources: true,
      screenshots: true,
      snapshots: true,
    });
  
    return ctx;
  }

// import { Page, Frame } from "@playwright/test";
// import { Logger } from "winston";
// import { invokeBrowser } from "@helper/browsers/browserManager";


// const pages = new Map<string, Page>();
// const frames = new Map<string, Frame>();
// let currentPage: Page | undefined;
// let currentFrame: Frame | undefined;
// let logger: Logger;
// let currentPageName: string = "main";

// export const uiFixture = {
//     pages,
//     frames,
//     setPage(page: Page) {
//         pages.set(currentPageName, page);
//     },
//     setPageWithName(name: string, page: Page) {
//         pages.set(name, page);
//         currentPage = page;
//         currentPageName = name;
//     },
//     getPage(name: string): Page | undefined {
//         return pages.get(name);
//     },
//     setCurrentPage(name: string) {
//         currentPage = pages.get(name);
//         currentPageName = name;
//     },
//     getCurrentPage(): Page | undefined {
//         return currentPage;
//     },
//     getCurrentPageName(): string {
//         return currentPageName;
//     },
//     setFrame(name: string, frame: Frame) {
//         frames.set(name, frame);
//         currentFrame = frame;
//     },
//     getFrame(name: string): Frame | undefined {
//         return frames.get(name);
//     },
//     setCurrentFrame(name: string) {
//         currentFrame = frames.get(name);
//     },
//     getCurrentFrame(): Frame | undefined {
//         return currentFrame;
//     },
//     setLogger(log: Logger) {
//         logger = log;
//     },
//     getLogger(): Logger {
//         return logger;
//     }
// };









// import { Page } from "@playwright/test";
// import { Logger } from "winston";

// export const fixture = {
//     // @ts-ignore
//     page: undefined as Page,
//     logger: undefined as Logger
// }