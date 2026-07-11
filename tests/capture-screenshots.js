const { chromium } = require('@playwright/test');
const { spawn } = require('node:child_process');
const path = require('node:path');

const baseURL = 'http://127.0.0.1:4173';
const output = path.resolve(__dirname, '..', 'docs', 'screenshots');

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch (error) {}
    await new Promise(function (resolve) { setTimeout(resolve, 250); });
  }
  throw new Error('截图服务器启动超时。');
}

async function chooseRadio(page, selector) {
  await page.locator(selector).evaluate(function (element) {
    element.checked = true;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function settle(page) {
  await page.waitForTimeout(600);
  await page.evaluate(function () {
    if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
  });
}

async function fillLoanQuote(page) {
  await page.locator('#guidePrice').fill('229800');
  await page.locator('#quoteModelSpec').fill('2026款 Max版 · 19英寸轮毂 · 黑色内饰');
  await chooseRadio(page, '#payLoan');
  await page.locator('#loanPlanName').fill('厂家金融 36期标准贷');
  await page.locator('#financeFee').fill('2000');
  await page.locator('#foregoneCashDiscount').fill('5000');
  await page.locator('.loan-fee-amt').first().fill('1000');
  await page.locator('#cashDiscountConfirmed').check();
  await chooseRadio(page, '#typeEV');
  await chooseRadio(page, '#nevBEV');
  await page.locator('.ins-amt').nth(0).fill('950');
  await page.locator('.ins-amt').nth(2).fill('2800');
  await page.locator('.ins-amt').nth(3).fill('1350');
  await page.locator('#insuranceCoverageNote').fill('人保 · 三者300万 · 含车损和医保外用药');
  await page.locator('.mfr-amt').first().fill('8000');
  await page.locator('.mfr-amt').first().locator('xpath=ancestor::div[contains(@class,"dyn-row")]').locator('.row-name').fill('厂家现金优惠');
  await page.locator('.exp-amt').first().fill('500');
  await page.locator('#feeDisclosureConfirmed').check();
  await page.locator('#contractTermsNote').fill('订金可退条件、交付日期、车架号和赠品交付均写入合同');
}

async function saveQuote(page, dealership) {
  await page.getByRole('button', { name: /保存报价记录/ }).click();
  await page.locator('#saveDealership').fill(dealership);
  await page.locator('#saveModel').fill('示例车型 Max版');
  await page.locator('#saveModal .btn-save').click();
  await page.locator('#modalOverlay .btn-close-modal').click();
}

async function main() {
  let server = null;
  try {
    await fetch(baseURL);
  } catch (error) {
    server = spawn(process.execPath, [path.resolve(__dirname, 'static-server.js')], { stdio: 'ignore' });
  }
  await waitForServer();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto(baseURL);
    await fillLoanQuote(page);
    await page.locator('#offlineCapabilityCard').scrollIntoViewIfNeeded();
    await settle(page);
    await page.screenshot({ path: path.join(output, 'input-form.png'), fullPage: false });

    await page.getByRole('button', { name: /立即计算/ }).click();
    await page.locator('#page2').waitFor({ state: 'visible' });
    await page.waitForFunction(function () { return document.querySelector('#tab2').classList.contains('active'); });
    await page.evaluate(function () { window.scrollTo(0, 0); });
    await settle(page);
    await page.screenshot({ path: path.join(output, 'quote-completeness.png'), fullPage: false });
    await settle(page);
    await page.locator('#cashflowCard').screenshot({ path: path.join(output, 'loan-cashflow.png') });
    await saveQuote(page, '城东示例4S店');

    await page.locator('#tab1').click();
    await page.locator('.mfr-amt').first().fill('12000');
    await page.getByRole('button', { name: /立即计算/ }).click();
    await saveQuote(page, '城西示例4S店');
    await page.locator('#tab4').click();
    await page.locator('.rc-compare-btn').nth(0).click();
    await page.locator('.rc-compare-btn').nth(1).click();
    await page.evaluate(function () { window.scrollTo(0, 0); });
    await settle(page);
    await page.screenshot({ path: path.join(output, 'records-compare.png'), fullPage: true });

    await page.locator('#tab1').click();
    await page.locator('#themeToggle').click();
    await page.evaluate(function () { window.scrollTo(0, 0); });
    await settle(page);
    await page.screenshot({ path: path.join(output, 'light-theme.png'), fullPage: false });
    await context.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    const mobilePage = await mobile.newPage();
    await mobilePage.goto(baseURL);
    await fillLoanQuote(mobilePage);
    await mobilePage.evaluate(function () { window.scrollTo(0, 0); });
    await settle(mobilePage);
    await mobilePage.screenshot({ path: path.join(output, 'mobile-input.png'), fullPage: false });
    await mobilePage.getByRole('button', { name: /立即计算/ }).click();
    await mobilePage.waitForFunction(function () { return document.querySelector('#tab2').classList.contains('active'); });
    await mobilePage.evaluate(function () { window.scrollTo(0, 0); });
    await settle(mobilePage);
    await mobilePage.screenshot({ path: path.join(output, 'mobile-result.png'), fullPage: false });
    await mobile.close();
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  process.stdout.write('README screenshots refreshed\n');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
