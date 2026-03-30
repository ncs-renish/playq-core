import { vars, webLocResolver, webFixture, logFixture } from "../../global";
import { Given, When, Then } from "@cucumber/cucumber";
import { warn } from "winston";
import * as webActions from './webActions';

// webNavigation.ts

/**
 * Web: Click Button -field: {param} -options: TESTIGN COMMENTS
 */
Given("Web: Open browser -url: {param} -options: {param}", async function (url, options) {
  let page = webFixture.getCurrentPage();
  await webActions.openBrowser(page, url, options);
});

Given("Web: Navigate by path -relativePath: {param} -options: {param}", async function (relativePath, options) {
  let page = webFixture.getCurrentPage();
  await webActions.navigateByPath(page, relativePath, options);
});

// mouseActions.ts

Given("Web: Click button -field: {param} -options: {param}", async function (field, options) {
  let page = webFixture.getCurrentPage();
  await webActions.clickButton(page, field, options);
});

Given("Web: Click link -field: {param} -options: {param}", async function (field, options) {
  let page = webFixture.getCurrentPage();
  await webActions.clickLink(page, field, options);
});

Given("Web: Click -field: {param} -options: {param}", async function (field, options) {
  let page = webFixture.getCurrentPage();
  await webActions.click(page, field, options);
});

Given("Web: Click radio button -field: {param} -options: {param}", async function (field, options) {
  let page = webFixture.getCurrentPage();
  await webActions.clickRadioButton(page, field, options);
});

Given("Web: Click checkbox -field: {param} -options: {param}", async function (field, options) {
  let page = webFixture.getCurrentPage();
  await webActions.clickCheckbox(page, field, options);
});

Given("Web: Mouseover on link -field: {param} -options: {param}", async function (field, options) {
  let page = webFixture.getCurrentPage();
  await webActions.mouseoverOnLink(page, field, options);
});

Given("Web: Fill input -field: {param} -value: {param} -options: {param}", async function (field, value, options) {
  let page = webFixture.getCurrentPage();
  await webActions.input(page, field, value, options);
});

Given("Web: Fill -field: {param} -value: {param} -options: {param}", async function (field, value, options) {
  let page = webFixture.getCurrentPage();
  await webActions.fill(page, field, value, options);
});

// keyboardActions.ts
Given("Web: Type -field: {param} -value: {param} -options: {param}", async function (field, value, options) {
  let page = webFixture.getCurrentPage();
  await webActions.type(page, field, value, options);
});

// validationActions.ts
Given("Web: Verify header -text: {param} -options: {param}", async function (text, options) {
  let page = webFixture.getCurrentPage();
  await webActions.verifyHeaderText(page, text, options);
});

Given("Web: Verify page title -text: {param} -options: {param}", async function (text, options) {
  let page = webFixture.getCurrentPage();
  await webActions.verifyPageTitle(page, text, options);
});

// waitActions.ts
Given("Web: Wait for Input -field: {param} -state: {param} (enabled or disabled) -options: {param}", async function (field, state, options) {
  let page = webFixture.getCurrentPage();
  await webActions.waitForInputState(page, field, state, options);
});

Given("Web: Wait for Text at Location -field: {param} -text: {param} -options: {param}", async function (field, expectedText, options) {
  let page = webFixture.getCurrentPage();
  await webActions.waitForTextAtLocation(page, field, expectedText, options);
});

Given("Web: Click tab -field: {param} -options: {param}", async function (field, options) {
  let page = webFixture.getCurrentPage();
  await webActions.clickTab(page, field, options);
});

// formActions.ts
Given("Web: Select Dropdown -field: {param} -value: {param} -options: {param}", async function (field, value, options) {
  let page = webFixture.getCurrentPage();
  await webActions.selectDropdown(page, field, value, options);
});

Given("Web: Verify text on page -text: {param} -options: {param}", async function (text, options) {
  let page = webFixture.getCurrentPage();
  await webActions.verifyTextOnPage(page, text, options);
});

Given("Web: Dont See -text: {param} -options: {param}", async function (text, options) {
  let page = webFixture.getCurrentPage();
  // Implement via page content check since action helper is internal
  const opts = typeof options === 'string' ? vars.parseLooseJson(options) : (options || {});
  const content = await page.content();
  const present = content.includes(vars.replaceVariables(text));
  if (present) throw new Error(`Text '${text}' should not be visible`);
});

Given("Web: Verify text at location -field: {param} -value: {param} -options: {param}", async function (field, expectedText, options) {
  let page = webFixture.getCurrentPage();
  await webActions.verifyTextAtLocation(page, field, expectedText, options);
});

Given("Web: Verify input field is present -field: {param} -options: {param}", async function (field, options) {
  let page = webFixture.getCurrentPage();
  await webActions.verifyInputFieldPresent(page, field, options);
});

Given("Web: Verify input field value -field: {param} -value: {param} -options: {param}", async function (field, expectedValue, options) {
  let page = webFixture.getCurrentPage();
  await webActions.verifyInputFieldValue(page, field, expectedValue, options);
});

Given("Web: Verify Tab field Present -field: {param} -options: {param}", async function (field, options) {
  let page = webFixture.getCurrentPage();
  await webActions.verifyTabField(page, field, options);
});

Given("Web: Verify toast text contains -text: {param} -options: {param}", async function (text, options) {
  let page = webFixture.getCurrentPage();
  await webActions.verifyToastTextContains(page, text, options);
});

Given("Web: Wait for URL -url: {param} -options: {param}", async function (url, options) {
  let page = webFixture.getCurrentPage();
  await webActions.waitForUrl(page, url, options);
});

Given("Web: Wait for Page Load -timeout: {int}", async function (timeout) {
  let page = webFixture.getCurrentPage();
  await webActions.waitForPageToLoad(page, timeout);
});

Given("Web: Wait For Enabled -field: {param} -timeout: {int} -options: {param}", async function (field, timeout, options) {
  let page = webFixture.getCurrentPage();
  const opts = typeof options === 'string' ? vars.parseLooseJson(options) : (options || {});
  const locator = await webLocResolver(opts?.fieldType || 'input', field, page, opts?.pattern, opts?.actionTimeout);
  await webActions.waitForEnabled(locator as any, timeout);
});

Given("Web: Press Key -key: {param} -options: {param}", async function (key, options) {
  let page = webFixture.getCurrentPage();
  await webActions.pressKey(page, key, options);
});

Given("Web: Wait for displayed -field: {param} -options: {param}", async function (field, options) {
  let page = webFixture.getCurrentPage();
  await webActions.waitForDisplayed(page, field, options);
});

Given("Web: Wait for disappear -field: {param} -options: {param}", async function (field, options) {
  let page = webFixture.getCurrentPage();
  await webActions.waitForDisappear(page, field, options);
});

Given("Web: Wait for Header -header: {param} -text: {param} -options: {param}", async function (header, headerText, options) {
  let page = webFixture.getCurrentPage();
  await webActions.waitForHeader(page, header, headerText, options);
});

Given("Web: Select Dropdown by Index -field: {param} -index: {int} -options: {param}", async function (field, index, options) {
  let page = webFixture.getCurrentPage();
  await webActions.selectDropdownByIndex(page, field, index, options);
});

Given("Web: Verify locked input field value -field: {param} -value: {param} -options: {param}", async function (field, expectedValue, options) {
  let page = webFixture.getCurrentPage();
  await webActions.verifyLockedInputFieldValue(page, field, expectedValue, options);
});

// screenshotActions.ts
Given("Web: Take Screenshot -options: {param}", async function (options) {
  let page = webFixture.getCurrentPage();
  await webActions.takeScreenshot(page, options);
});

Given("Web: Verify field is locked -field: {param} -options: {param}", async function (field, options) {
  let page = webFixture.getCurrentPage();
  await webActions.verifyFieldIsLocked(page, field, options);
});

Given("Web: Verify field is mandatory -field: {param} -options: {param}", async function (field, options) {
  let page = webFixture.getCurrentPage();
  await webActions.verifyFieldIsMandatory(page, field, options);
});

Given("Web: Verify field is secured -field: {param} -options: {param}", async function (field, options) {
  let page = webFixture.getCurrentPage();
  await webActions.verifyFieldIsSecured(page, field, options);
});

Given("Web: Verify select field value -field: {param} -value: {param} -options: {param}", async function (field, expectedValue, options) {
  let page = webFixture.getCurrentPage();
  await webActions.verifySelectDropdownValue(page, field, expectedValue, options);
});

Given("Web: Verify select list does not have given value -field: {param} -value: {param} -options: {param}", async function (field, excludedValue, options) {
  let page = webFixture.getCurrentPage();
  await webActions.verifySelectListNotHaveGivenValue(page, field, excludedValue, options);
});

// formActions.ts (upload)
Given("Web: Upload file at -field: {param} with filename: {param} -options: {param}", async function (fieldName, fileName, options) {
  let page = webFixture.getCurrentPage();
  await webActions.uploadFile(page, fieldName, fileName, options);
});

// elementReaderActions.ts
Given("Web: Store input value in variable -field: {param} -variableName: {param} -options: {param}", async function (field, variableName, options) {
  let page = webFixture.getCurrentPage();
  await webActions.storeElementTextInVariable(page, field, variableName, options);
});

// mouseActions.ts (additional)
Given("Web: Drag and Drop -source: {param} -target: {param} -options: {param}", async function (source, target, options) {
  let page = webFixture.getCurrentPage();
  await webActions.dragAndDrop(page, source, target, options);
});

// cookieActions.ts
Given(/^Web: Set Cookie -name: (.+?) -value: (.+?)(?: -options: (.+))?$/, async function (name, value, options) {
  let page = webFixture.getCurrentPage();
  const normalizeQuoted = (input: any) => {
    if (typeof input !== 'string') return input;
    const trimmed = input.trim();
    const isWrappedDouble = trimmed.startsWith('"') && trimmed.endsWith('"');
    const isWrappedSingle = trimmed.startsWith("'") && trimmed.endsWith("'");
    return (isWrappedDouble || isWrappedSingle) ? trimmed.slice(1, -1) : trimmed;
  };

  const normalizedName = normalizeQuoted(name);
  const normalizedValue = normalizeQuoted(value);
  const normalizedOptions = normalizeQuoted(options);

  await webActions.setCookie(page, normalizedName, normalizedValue, normalizedOptions);
});

Given("Web: Get Cookie -name: {param} -options: {param}", async function (name, options) {
  let page = webFixture.getCurrentPage();
  const val = await webActions.getCookie(page, name, options);
});

Given("Web: Get Cookie -name: {param} -storeTo: {param}", async function (name, varName) {
  let page = webFixture.getCurrentPage();
  const val = await webActions.getCookie(page, name);
  vars.setValue(varName, String(val ?? ''));
});

Given("Web: Delete Cookie -name: {param}", async function (name) {
  let page = webFixture.getCurrentPage();
  await webActions.deleteCookie(page, name);
});

Given("Web: Clear Cookies", async function () {
  let page = webFixture.getCurrentPage();
  await webActions.clearCookies(page);
});

// localStorageActions.ts
Given("Web: LocalStorage Set -key: {param} -value: {param}", async function (key, value) {
  let page = webFixture.getCurrentPage();
  await webActions.localStorageSet(page, key, value);
});

Given("Web: LocalStorage Get -key: {param} -storeTo: {param}", async function (key, varName) {
  let page = webFixture.getCurrentPage();
  const val = await webActions.localStorageGet(page, key);
  vars.setValue(varName, String(val ?? ''));
});

Given("Web: LocalStorage Remove -key: {param}", async function (key) {
  let page = webFixture.getCurrentPage();
  await webActions.localStorageRemove(page, key);
});

Given("Web: LocalStorage Clear", async function () {
  let page = webFixture.getCurrentPage();
  await webActions.localStorageClear(page);
});

// iframeActions.ts
Given("Web: Switch to Frame -field: {param} -options: {param}", async function (field, options) {
  let page = webFixture.getCurrentPage();
  await webActions.switchToFrame(page, field, options);
});

Given("Web: Switch to Main Content", async function () {
  let page = webFixture.getCurrentPage();
  await webActions.switchToMainContent(page);
});

// screenshotActions.ts (full)
Given("Web: Take Full Screenshot -options: {param}", async function (options) {
  let page = webFixture.getCurrentPage();
  await webActions.takeFullScreenshot(page, options);
});

// javascriptActions.ts
Given("Web: Execute Script -code: {param}", async function (code) {
  let page = webFixture.getCurrentPage();
  await webActions.executeScript(page, (script: any) => eval(Array.isArray(script) ? script[0] : script), [code]);
});

// validationActions.ts helpers
Given("Web: Count Elements -field: {param} -storeTo: {param} -options: {param}", async function (field, varName, options) {
  let page = webFixture.getCurrentPage();
  const opts = typeof options === 'string' ? vars.parseLooseJson(options) : (options || {});
  const locator = await webLocResolver(opts?.fieldType || '', field, page, opts?.pattern, opts?.actionTimeout);
  const count = await (locator as any).count?.() ?? 0;
  vars.setValue(varName, String(count));
});

// webNavigation.ts (tab management)
Given("Web: Refresh Page -options: {param}", async function (options) {
  let page = webFixture.getCurrentPage();
  await webActions.refreshPage(page, options);
});

Given("Web: Switch Tab -index: {int} -options: {param}", async function (index, options) {
  let page = webFixture.getCurrentPage();
  await webActions.switchTab(page, index, options);
});

Given("Web: Close Tab -options: {param}", async function (options) {
  let page = webFixture.getCurrentPage();
  await webActions.closeTab(page, options);
});

// webNavigation.ts (open new tab)
Given("Web: Open New Tab -url: {param} -options: {param}", async function (url, options) {
  let page = webFixture.getCurrentPage();
  const newPage = await webActions.openNewTab(page, url, options);
  // Make the newly opened tab the current page for subsequent steps
  webFixture.setPlaywrightPage(newPage);
});

// mouseActions.ts (scrolling)
Given("Web: Scroll To -x: {int} -y: {int} -options: {param}", async function (x, y, options) {
  let page = webFixture.getCurrentPage();
  await webActions.scrollTo(page, x, y, options);
});

Given("Web: Scroll Up -amount: {int} -options: {param}", async function (amount, options) {
  let page = webFixture.getCurrentPage();
  await webActions.scrollUp(page, amount, options);
});

Given("Web: Scroll Down -amount: {int} -options: {param}", async function (amount, options) {
  let page = webFixture.getCurrentPage();
  await webActions.scrollDown(page, amount, options);
});

// keyboardActions.ts (convenience)
Given("Web: Press Enter -options: {param}", async function (options) {
  let page = webFixture.getCurrentPage();
  await webActions.pressEnter(page, options);
});

Given("Web: Press Tab -options: {param}", async function (options) {
  let page = webFixture.getCurrentPage();
  await webActions.pressTab(page, options);
});

// elementReaderActions.ts (store to vars)
Given("Web: Get Text -field: {param} -storeTo: {param} -options: {param}", async function (field, varName, options) {
  let page = webFixture.getCurrentPage();
  const val = await webActions.getText(page, field, options);
  vars.setValue(varName, typeof val === 'string' ? val : String(val ?? ''));
});

Given("Web: Get Value -field: {param} -storeTo: {param} -options: {param}", async function (field, varName, options) {
  let page = webFixture.getCurrentPage();
  const val = await webActions.getValue(page, field, options);
  vars.setValue(varName, typeof val === 'string' ? val : String(val ?? ''));
});

Given("Web: Get Attribute -field: {param} -name: {param} -storeTo: {param} -options: {param}", async function (field, name, varName, options) {
  let page = webFixture.getCurrentPage();
  const val = await webActions.getAttribute(page, field, name, options);
  vars.setValue(varName, typeof val === 'string' ? val : String(val ?? ''));
});

Given("Web: Has Class -field: {param} -className: {param} -storeTo: {param} -options: {param}", async function (field, className, varName, options) {
  let page = webFixture.getCurrentPage();
  const has = await webActions.hasClass(page, field, className, options);
  vars.setValue(varName, String(!!has));
});

Given("Web: Get HTML -field: {param} -storeTo: {param} -options: {param}", async function (field, varName, options) {
  let page = webFixture.getCurrentPage();
  const html = await webActions.getHtml(page, field, options);
  vars.setValue(varName, typeof html === 'string' ? html : String(html ?? ''));
});

// alertActions.ts
Given("Web: Accept Alert -options: {param}", async function (options) {
  let page = webFixture.getCurrentPage();
  await webActions.acceptAlert(page, options);
});

Given("Web: Dismiss Alert -options: {param}", async function (options) {
  let page = webFixture.getCurrentPage();
  await webActions.dismissAlert(page, options);
});

Given("Web: Fill Alert -text: {param} -options: {param}", async function (text, options) {
  let page = webFixture.getCurrentPage();
  await webActions.fillAlert(page, text, options);
});

Given("Web: See Alert Text -expected: {param} -options: {param}", async function (expected, options) {
  let page = webFixture.getCurrentPage();
  await webActions.seeAlertText(page, expected, options);
});

Given("Web: Click button and Accept Alert -field: {param} -options: {param}", async function (field, options) {
  let page = webFixture.getCurrentPage();
  await Promise.all([
    webActions.acceptAlert(page, options),
    webActions.clickButton(page, field, options),
  ]);
});

Given("Web: Click button and Dismiss Alert -field: {param} -options: {param}", async function (field, options) {
  let page = webFixture.getCurrentPage();
  await Promise.all([
    webActions.dismissAlert(page, options),
    webActions.clickButton(page, field, options),
  ]);
});

Given("Web: Click button and Fill Alert -field: {param} -text: {param} -options: {param}", async function (field, text, options) {
  let page = webFixture.getCurrentPage();
  await Promise.all([
    webActions.fillAlert(page, text, options),
    webActions.clickButton(page, field, options),
  ]);
});

Given("Web: Click button and See Alert Text -field: {param} -expected: {param} -options: {param}", async function (field, expected, options) {
  let page = webFixture.getCurrentPage();
  await Promise.all([
    webActions.seeAlertText(page, expected, options),
    webActions.clickButton(page, field, options),
  ]);
});

// downloadActions.ts
Given("Web: List Files -dir: {param} -storeTo: {param}", async function (dir, varName) {
  const files = await webActions.listFiles(dir);
  vars.setValue(varName, JSON.stringify(files));
});

Given("Web: Has File -dir: {param} -fileName: {param} -storeTo: {param}", async function (dir, fileName, varName) {
  const has = await webActions.hasFile(dir, fileName);
  vars.setValue(varName, String(!!has));
});

Given("Web: Download File -field: {param} -options: {param}", async function (field, options) {
  let page = webFixture.getCurrentPage();
  await webActions.downloadFile(page, field, options);
});

Given("Web: Download File -field: {param} -options: {param} -storeTo: {param}", async function (field, options, varName) {
  let page = webFixture.getCurrentPage();
  const saved = await webActions.downloadFile(page, field, options);
  vars.setValue(varName, String(saved || ''));
});

// reportingActions.ts
Given("Web: Log Info -message: {param}", async function (message) {
  await webActions.logInfo(message);
});

Given("Web: Log Pass -message: {param}", async function (message) {
  await webActions.logPass(message);
});

Given("Web: Log Fail -message: {param}", async function (message) {
  await webActions.logFail(message);
});

Given("Web: Assert -condition: {param} -message: {param}", async function (condition, message) {
  const c = String(condition).toLowerCase().trim();
  const ok = c === 'true' || c === '1' || c === 'yes';
  await webActions.assertLog(ok, message);
});

// testDataActions.ts
Given("Web: Load Test Data JSON -file: {param} -storeTo: {param}", async function (filePath, varName) {
  const data = await webActions.loadFromJson(filePath);
  vars.setValue(varName, JSON.stringify(data));
});

Given("Web: Load Test Data CSV -file: {param} -storeTo: {param}", async function (filePath, varName) {
  const data = await webActions.loadFromCsv(filePath);
  vars.setValue(varName, JSON.stringify(data));
});

// formActions.ts (aliases)
Given("Web: Set -field: {param} -value: {param} -options: {param}", async function (field, value, options) {
  let page = webFixture.getCurrentPage();
  await webActions.set(page, field, value, options);
});

Given("Web: Enter -field: {param} -value: {param} -options: {param}", async function (field, value, options) {
  let page = webFixture.getCurrentPage();
  await webActions.enter(page, field, value, options);
});

// waitActions.ts (generic wait + condition)
Given("Web: Wait -ms: {int}", async function (ms) {
  await webActions.wait(ms);
});

Given("Web: Wait For Condition -code: {param} -options: {param}", async function (code, options) {
  let page = webFixture.getCurrentPage();
  // Evaluate predicate code in page context until true
  await webActions.waitForCondition(page, async (p) => {
    const result = await p.evaluate((c) => { try { return !!eval(c); } catch { return false; } }, code);
    return !!result;
  }, options);
});

// screenshotActions.ts (process + save to disk)
Given("Web: Process Screenshot -shouldTake: {param} -text: {param} -fullPage: {param}", async function (shouldTake, text, fullPage) {
  let page = webFixture.getCurrentPage();
  const take = String(shouldTake).toLowerCase() === 'true';
  const fp = String(fullPage).toLowerCase() !== 'false';
  await webActions.processScreenshot(page, take, text, fp);
});

Given("Web: Generate Sample Data -schema: {param} -storeTo: {param}", async function (schema, varName) {
  const schemaObj = typeof schema === 'string' ? vars.parseLooseJson(schema) : (schema || {});
  const data = await webActions.generateSampleData(schemaObj);
  vars.setValue(varName, JSON.stringify(data));
});