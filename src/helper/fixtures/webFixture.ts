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
    context = await browser.newContext(options);
    return context;
  },
  async newPage(name = "main") {
    const page = await context.newPage();
    pages.set(name, page);
    currentPage = page;
    currentPageName = name;
    
    // Apply maximize option if configured
    const shouldMaximize = vars.getConfigValue('browser.maximize');
    if (shouldMaximize || (typeof shouldMaximize === 'string' && shouldMaximize.toLowerCase() === 'true')) {
      let viewportConfig: any = vars.getConfigValue('browser.viewport') || { width: 1920, height: 1080 };
      
      // If viewportConfig is a JSON string, parse it
      if (typeof viewportConfig === 'string') {
        try {
          viewportConfig = JSON.parse(viewportConfig);
        } catch (err: any) {
          console.warn(`⚠️ Failed to parse viewport config: ${err.message}. Using defaults.`);
          viewportConfig = { width: 1920, height: 1080 };
        }
      }
      
      const { width = 1920, height = 1080 } = viewportConfig;
      try {
        await page.setViewportSize({ width, height });
        console.log(`✅ Viewport maximized to ${width}x${height}`);
      } catch (err: any) {
        console.warn(`⚠️ Failed to maximize viewport: ${err.message}`);
      }
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