// import { chromium, firefox, webkit } from "playwright";
// import type { LaunchOptions } from "playwright";
// import * as vars from "../bundle/vars";

// const headlessConfig = vars.getConfigValue('browser.headless');
// // const options = {
// //     headless: headlessConfig === 'false' ? false : true
// // };

// export const invokeBrowser = () => {
//     const browserType = vars.getConfigValue('browser.browserType') || "chromium";
//       const options = { headless: isHeadless };
//     switch (browserType) {
//         case "chromium":
//             return chromium.launch(options);
//         case "firefox":
//             return firefox.launch(options);
//         case "webkit":
//             return webkit.launch(options);
//         default:
//             throw new Error("Please set the proper browser!")
//     }

// }


import { chromium, firefox, webkit } from "playwright";
import * as vars from "../bundle/vars";
import { buildCloudWsEndpoint, isCloudEnabled, loadResolvedCloudConfig } from "./cloudBrowserManager";
 
export const invokeBrowser = () => {
  const browserType = vars.getConfigValue('browser.browserType') || 'chromium';
  const browserLib = browserType === "firefox" ? firefox : browserType === "webkit" ? webkit : chromium;

  if (isCloudEnabled()) {
    // Preload to validate provider config early and provide clearer diagnostics.
    loadResolvedCloudConfig();
    const wsEndpoint = buildCloudWsEndpoint(browserType);
    return browserLib.connect(wsEndpoint);
  }

  const headlessConfig = vars.getConfigValue('browser.headless');
  const isHeadless = String(headlessConfig).toLowerCase() === 'false' ? false : true;
  const maximizeConfig = vars.getConfigValue('browser.maximize');
  const isMaximize = String(maximizeConfig).toLowerCase() === 'true';

  const baseOptions: any = { headless: isHeadless };
  if (isMaximize && !isHeadless) {
    baseOptions.args = ['--start-maximized'];
  }
 
  switch (browserType) {
    case "chromium":
      return chromium.launch(baseOptions);
    case "firefox":
      return firefox.launch(baseOptions);
    case "webkit":
      return webkit.launch(baseOptions);
    default:
      throw new Error("Please set the proper browser!")
  }
 
}