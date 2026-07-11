const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const JSZip = require('jszip');

async function closeNotice(page) {
  const button = page.locator('.modal-overlay.show .btn-close-modal');
  if (await button.count()) await button.first().click();
}

async function chooseRadio(page, selector) {
  await page.locator(selector).evaluate(function (element) {
    element.checked = true;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function fillQuote(page, options = {}) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '购车费用全维度计算器' })).toBeVisible();
  await page.locator('#guidePrice').fill(options.guidePrice || '220000');
  await page.locator('#quoteModelSpec').fill(options.modelSpec || '2026款 Max版 · 19英寸轮毂');
  await chooseRadio(page, '#typeEV');
  await expect(page.locator('#nevSubGroup')).toBeVisible();
  await chooseRadio(page, '#nevBEV');
  await page.locator('.ins-amt').nth(0).fill('950');
  await page.locator('.ins-amt').nth(2).fill('2800');
  await page.locator('.ins-amt').nth(3).fill('1350');
  await page.locator('#insuranceCoverageNote').fill('人保 · 三者300万 · 含车损和医保外用药');
  await page.locator('#feeDisclosureConfirmed').check();
  await page.locator('#contractTermsNote').fill('订金可退条件、交付日期、车架号和赠品交付均写入合同');
  if (options.loan) {
    await chooseRadio(page, '#payLoan');
    await page.locator('#loanPlanName').fill('厂家金融 36期标准贷');
    await page.locator('#financeFee').fill('2000');
    await page.locator('#foregoneCashDiscount').fill('5000');
    await page.locator('.loan-fee-amt').first().fill('1000');
    await page.locator('#cashDiscountConfirmed').check();
  }
}

async function calculate(page) {
  await page.getByRole('button', { name: /立即计算/ }).click();
  await expect(page.locator('#page2')).toHaveClass(/active/);
  await expect(page.locator('#sumFinal')).not.toHaveText('—');
}

async function saveCurrentQuote(page, dealership, model) {
  await page.getByRole('button', { name: /保存报价记录/ }).click();
  await page.locator('#saveDealership').fill(dealership);
  await page.locator('#saveModel').fill(model);
  await page.locator('#saveModal .btn-save').click();
  await expect(page.locator('#modalOverlay')).toHaveClass(/show/);
  await closeNotice(page);
}

test('贷款录入会显示综合年化和报价完整度', async ({ page }) => {
  await fillQuote(page, { loan: true });
  await calculate(page);
  await expect(page.locator('#qualityScore')).toHaveText('100分');
  await expect(page.locator('#qualityLabel')).toHaveText('完整');
  await expect(page.locator('#rFinanceFeeNote')).toContainText('放弃全款优惠 5000.00 元');
  await expect(page.locator('#rEffectiveApr')).toHaveText(/\d+\.\d{2}%/);
  const effectiveApr = Number((await page.locator('#rEffectiveApr').textContent()).replace('%', ''));
  expect(effectiveApr).toBeGreaterThan(4);
  await expect(page.locator('#offlineCapabilityCard')).toContainText('OCR/二维码已本地化');
});

test('保存、复制、对比以及 JSON 导入导出形成闭环', async ({ page }) => {
  await fillQuote(page, { loan: true });
  await calculate(page);
  await saveCurrentQuote(page, '城东4S店', '测试车型 Max版');
  await page.locator('#tab4').click();
  await expect(page.locator('.record-card')).toHaveCount(1);

  await page.locator('.rc-copy-btn').click();
  await expect(page.locator('#modalOverlay')).toContainText('已复制报价输入');
  await closeNotice(page);
  await page.locator('.mfr-amt').first().fill('4000');
  await calculate(page);
  await saveCurrentQuote(page, '城西4S店', '测试车型 Max版');
  await page.locator('#tab4').click();
  await expect(page.locator('.record-card')).toHaveCount(2);

  await page.locator('.rc-compare-btn').nth(0).click();
  await page.locator('.rc-compare-btn').nth(1).click();
  await expect(page.locator('#selectedCompareCard')).toBeVisible();
  await expect(page.locator('#selectedCompareHelp')).toContainText('关键口径一致');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /导出JSON/ }).click();
  const download = await downloadPromise;
  const jsonPath = await download.path();
  expect(jsonPath).toBeTruthy();

  await page.locator('#clearAllBtn').click();
  await page.locator('#confirmOkBtn').click();
  await expect(page.locator('.record-card')).toHaveCount(0);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /导入JSON/ }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(jsonPath);
  await expect(page.locator('#modalOverlay')).toContainText('已导入 2 条报价记录');
  await closeNotice(page);
  await expect(page.locator('.record-card')).toHaveCount(2);
});

test('完整备份恢复证据，并可导出非空长图', async ({ page }) => {
  await fillQuote(page);
  await calculate(page);
  const evidenceChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /添加报价单\/合同照片/ }).click();
  const evidenceChooser = await evidenceChooserPromise;
  await evidenceChooser.setFiles({
    name: '报价单.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  });
  await expect(page.locator('#modalOverlay')).toContainText('证据已保存');
  await closeNotice(page);
  await expect(page.locator('#evidenceList .evidence-item')).toHaveCount(1);

  const imageDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /导出长图/ }).click();
  const imageDownload = await imageDownloadPromise;
  const imagePath = await imageDownload.path();
  const imageStat = await fs.stat(imagePath);
  expect(imageStat.size).toBeGreaterThan(5000);
  await closeNotice(page);

  await saveCurrentQuote(page, '带证据4S店', '测试车型 Max版');
  await page.locator('#tab4').click();
  const backupDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /完整备份/ }).click();
  const backupDownload = await backupDownloadPromise;
  const backupPath = await backupDownload.path();
  const zip = await JSZip.loadAsync(await fs.readFile(backupPath));
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  expect(manifest.recordCount).toBe(1);
  expect(manifest.evidenceCount).toBe(1);
  await closeNotice(page);

  await page.locator('#clearAllBtn').click();
  await page.locator('#confirmOkBtn').click();
  await expect(page.locator('.record-card')).toHaveCount(0);
  const backupChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /恢复备份/ }).click();
  const backupChooser = await backupChooserPromise;
  await backupChooser.setFiles(backupPath);
  await expect(page.locator('#confirmModal')).toContainText('1 条报价、1 份证据');
  await page.locator('#confirmOkBtn').click();
  await expect(page.locator('#modalOverlay')).toContainText('备份恢复完成');
  await closeNotice(page);
  await expect(page.locator('.record-card')).toHaveCount(1);
  await page.locator('.rc-detail-btn').click();
  await expect(page.locator('#detailModal')).toContainText('本地证据（1）');
});

test('PWA 可离线重载且页面不依赖外部静态资源', async ({ page, context }) => {
  test.setTimeout(120_000);
  const externalRequests = [];
  page.on('request', function (request) {
    if (!request.url().startsWith('http://127.0.0.1:4173')) externalRequests.push(request.url());
  });
  await page.goto('/');
  await page.evaluate(async function () { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(function () { return page.evaluate(function () { return Boolean(navigator.serviceWorker.controller); }); }).toBe(true);
  await expect(page.locator('#pwaStatus')).toContainText('离线缓存已接管');
  expect(externalRequests).toEqual([]);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '购车费用全维度计算器' })).toBeVisible();
  await expect(page.locator('#runtimeStatus')).toContainText('离线');
  const quoteImage = await page.evaluate(function () {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111111';
    ctx.font = '64px Microsoft YaHei';
    ctx.fillText('厂家指导价 220000', 80, 130);
    ctx.fillText('成交价 210000', 80, 250);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const ocrChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /识别报价单/ }).click();
  const ocrChooser = await ocrChooserPromise;
  await ocrChooser.setFiles({ name: '离线OCR测试.png', mimeType: 'image/png', buffer: Buffer.from(quoteImage, 'base64') });
  await expect(page.locator('#modalTitle')).toContainText('请确认 OCR 结果', { timeout: 90_000 });
  await expect(page.locator('.ocr-fields .ocr-field')).toHaveCount(8);
  await expect(page.locator('.ocr-text')).toBeVisible();
  await context.setOffline(false);
});

test('手机尺寸、主题、键盘计算和 Escape 关闭弹窗可用', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fillQuote(page);
  const beforeTheme = await page.locator('html').getAttribute('data-theme');
  await page.locator('#themeToggle').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', beforeTheme);
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#page2')).toHaveClass(/active/);
  const overflow = await page.evaluate(function () { return document.documentElement.scrollWidth - window.innerWidth; });
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: /查看计算过程/ }).click();
  await expect(page.locator('#processModal')).toHaveClass(/show/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#processModal')).not.toHaveClass(/show/);
  await page.screenshot({ path: testInfo.outputPath('mobile-result.png'), fullPage: true });
});
