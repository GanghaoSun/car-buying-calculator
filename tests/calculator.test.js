const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../src/quote-engine.js');
const shareCodec = require('../src/share-codec.js');
const ocrAdapter = require('../src/ocr-adapter.js');
const evidenceStore = require('../src/local-evidence.js');
const pdfReport = require('../src/pdf-report.js');

const policy = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'policy.json'), 'utf8'));

function nearlyEqual(actual, expected, epsilon = 0.01) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be close to ${expected}`);
}

function calculate(input) {
  const outcome = engine.calculateQuote(input, policy);
  assert.deepEqual(outcome.errors, []);
  return outcome.result;
}

function testPolicyAndTax() {
  assert.equal(policy.name, '全国通用估算参数');
  assert.equal(engine.policyStatus(policy, '2026-07-10').level, 'valid');
  assert.equal(engine.policyStatus(policy, '2028-01-01').level, 'expired');

  const fuel = engine.calculatePurchaseTax(113000, 13, 'fuel', policy);
  nearlyEqual(fuel.exTaxPrice, 100000);
  nearlyEqual(fuel.tax, 10000);

  const nev = engine.calculatePurchaseTax(339000, 13, 'nev', policy);
  nearlyEqual(nev.exTaxPrice, 300000);
  nearlyEqual(nev.tax, 15000);
  nearlyEqual(nev.saving, 15000);
}

function testCostLayersAndSubsidyStates() {
  const result = calculate({
    guidePrice: 226000,
    vatRate: 13,
    carType: 'nev',
    nevType: 'bev',
    tradeIn: 'none',
    paymentMethod: 'full',
    mfrDetails: [{ name: '直接优惠', amt: 6000 }],
    insuranceDetails: [{ name: '交强险', amt: 950 }, { name: '商业险', amt: 5000 }],
    expDetails: [{ name: '上牌费', amt: 500 }],
    subDetails: [
      { name: '合同补贴', amt: 2000, status: 'confirmed' },
      { name: '地方待申请', amt: 3000, status: 'conditional' },
      { name: '销售承诺', amt: 1000, status: 'oral' }
    ],
    giftDetails: [{ name: '保养', amt: 2000 }]
  });
  nearlyEqual(result.invoicePrice, 220000);
  nearlyEqual(result.tax, 9734.513274336285);
  nearlyEqual(result.payNow, 236184.51327433628);
  nearlyEqual(result.confirmedSubsidy, 2000);
  nearlyEqual(result.conditionalSubsidy, 4000);
  nearlyEqual(result.confirmedFinalCost, 234184.51327433628);
  nearlyEqual(result.expectedFinalCost, 230184.51327433628);
  assert.ok(result.riskAlerts.some((item) => item.title === '存在待确认补贴'));
  assert.ok(result.riskAlerts.some((item) => item.title === '口头承诺不应视为确定优惠'));
}

function testLoanMethodsAndEarlySettlement() {
  const common = {
    invoicePrice: 200000,
    downPaymentMode: 'ratio',
    downPaymentRatio: 30,
    loanMonths: 36,
    annualRate: 4,
    financeFee: 2000,
    loanFeeDetails: [{ name: 'GPS', amt: 1000 }]
  };
  const equalPayment = engine.calculateLoan({ ...common, repaymentMethod: 'equal-payment' });
  const equalPrincipal = engine.calculateLoan({ ...common, repaymentMethod: 'equal-principal' });
  nearlyEqual(equalPayment.downPayment, 60000);
  nearlyEqual(equalPayment.loanPrincipal, 140000);
  nearlyEqual(equalPayment.firstMonthlyPayment, 4133.42, 0.1);
  assert.equal(equalPayment.schedule.length, 36);
  assert.ok(equalPrincipal.firstMonthlyPayment > equalPrincipal.lastMonthlyPayment);
  assert.ok(equalPrincipal.totalInterest < equalPayment.totalInterest);
  nearlyEqual(equalPayment.financeFees, 3000);
  assert.ok(equalPayment.effectiveAnnualRate > equalPayment.annualRate);

  const opportunityCost = engine.calculateLoan({ ...common, repaymentMethod: 'equal-payment', foregoneCashDiscount: 8000 });
  nearlyEqual(opportunityCost.netFinanceCost, opportunityCost.totalInterest + opportunityCost.financeFees + 8000);
  assert.equal(opportunityCost.foregoneCashDiscount, 8000);
  assert.ok(opportunityCost.effectiveAnnualRate > equalPayment.effectiveAnnualRate);

  const early = engine.calculateLoan({ ...common, repaymentMethod: 'equal-payment', earlySettlementMonth: 12, earlySettlementPenaltyRate: 1 });
  assert.ok(early.earlySettlement);
  assert.equal(early.earlySettlement.month, 12);
  assert.ok(early.earlySettlement.remainingPrincipal > 0);
  assert.ok(early.earlySettlement.interestSaved > 0);

  const subsidized = engine.calculateLoan({ ...common, repaymentMethod: 'equal-payment', manufacturerInterestSubsidy: 5000 });
  assert.equal(subsidized.appliedInterestSubsidy, 5000);
  nearlyEqual(subsidized.customerTotalRepayment, subsidized.totalRepayment - 5000);
  nearlyEqual(subsidized.netFinanceCost, subsidized.totalInterest + subsidized.financeFees - 5000);
}

function testLoanQuoteAndOwnership() {
  const result = calculate({
    guidePrice: 200000,
    vatRate: 13,
    carType: 'fuel',
    displacement: 'le2',
    tradeIn: 'none',
    paymentMethod: 'loan',
    insuranceDetails: [{ name: '保险', amt: 6000 }],
    expDetails: [{ name: '上牌', amt: 1000 }],
    subDetails: [{ name: '城市补贴', amt: 3000, status: 'conditional' }],
    loan: {
      downPaymentMode: 'amount',
      downPaymentAmount: 80000,
      loanMonths: 36,
      annualRate: 4,
      repaymentMethod: 'equal-principal',
      financeFee: 2000,
      earlySettlementMonth: 12,
      earlySettlementPenaltyRate: 1
    },
    ownership: {
      enabled: true,
      years: 3,
      annualMileage: 15000,
      energyCostPer100km: 65,
      annualInsurance: 5000,
      annualMaintenance: 1500,
      residualRate: 45
    }
  });
  assert.equal(result.loanInfo.repaymentMethod, 'equal-principal');
  assert.equal(result.loanComparison.length, 3);
  assert.ok(result.earlyExpectedFinalCost < result.expectedFinalCost);
  assert.ok(result.ownership);
  nearlyEqual(result.ownership.energyCost, 29250);
  nearlyEqual(result.ownership.renewalInsurance, 10000);
  nearlyEqual(result.ownership.maintenanceCost, 4500);
  nearlyEqual(result.ownership.residualValue, 90000);
  assert.equal(result.schemaVersion, '1.8.0');
  assert.ok(Array.isArray(result.cashflowTimeline));
  assert.equal(result.cashflowTimeline.filter(item => item.category === 'repayment').length, 36);
  assert.equal(result.cashflowSummary.interestSubsidy, 0);
}

function testSchemaAndShareHelpers() {
  const schema = require('../src/quote-schema.js');
  const old = schema.migrateRecord({ id: 12, guidePrice: 200000, invoicePrice: 190000, payNow: 200000, finalCost: 210000 }, 0);
  assert.equal(old.schemaVersion, '1.8.0');
  assert.equal(old.recordVersion, 3);
  assert.ok(Array.isArray(old.evidenceRefs));
  const payload = schema.buildSharePayload({ id: 1, guidePrice: 200000, processText: 'private', evidenceRefs: [{ id: 'e1' }] });
  assert.equal(payload.version, '1.8.0');
  assert.equal(payload.result.processText, undefined);
  assert.equal(payload.result.evidenceRefs, undefined);
}

function testCompletenessAndComparability() {
  const complete = engine.assessQuoteCompleteness({
    guidePrice: 220000,
    carType: 'nev',
    nevType: 'bev',
    paymentMethod: 'full',
    quoteModelSpec: '2026款 Max版 · 19英寸轮毂',
    insuranceDetails: [{ name: '交强险', amt: 950 }, { name: '三者险', amt: 1200 }],
    insuranceCoverageNote: '人保 · 三者300万 · 含车损',
    feeDisclosureConfirmed: true,
    subsidyTermsConfirmed: true,
    contractTermsNote: '订金可退条件、交付日期和赠品已写明'
  });
  assert.equal(complete.score, 100);
  assert.equal(complete.level, '完整');
  assert.deepEqual(complete.missing, []);

  const incomplete = engine.assessQuoteCompleteness({ guidePrice: 220000, carType: 'fuel', displacement: 'le2', paymentMethod: 'full' });
  assert.ok(incomplete.score < 60);
  assert.ok(incomplete.missing.includes('保险公司、险种与保额'));

  const base = {
    quoteModelSpec: '2026款 Max版', insuranceCoverageNote: '人保 · 三者300万',
    paymentMethod: 'loan', carType: 'nev', nevType: 'bev',
    loanPlanName: '厂家金融A', loanInfo: { loanMonths: 36, repaymentMethod: 'equal-payment', annualRate: 3.8 }
  };
  assert.equal(engine.assessComparability([base, { ...base }]).level, 'comparable');
  const mismatch = engine.assessComparability([base, { ...base, insuranceCoverageNote: '平安 · 三者200万' }]);
  assert.equal(mismatch.level, 'partial');
  assert.ok(mismatch.issues.some((item) => item.includes('保险')));
}

function testValidationAndPolicyTemplate() {
  const invalid = engine.calculateQuote({
    guidePrice: 100000,
    vatRate: -1,
    carType: 'fuel',
    displacement: 'le2',
    paymentMethod: 'full',
    expDetails: [{ name: '异常费用', amt: -100 }]
  }, policy);
  assert.ok(invalid.errors.some((message) => message.includes('增值税率')));
  assert.ok(invalid.errors.some((message) => message.includes('其他费用不能填写负数')));

  assert.equal(engine.validatePolicyProfile({ version: 'x' }).valid, false);
  assert.equal(engine.validatePolicyProfile(policy).valid, true);
}

function testPdfReportGenerator() {
  const result = calculate({
    guidePrice: 220000,
    vatRate: 13,
    carType: 'nev',
    nevType: 'bev',
    tradeIn: 'none',
    paymentMethod: 'loan',
    quoteModelSpec: '2026款 Max版',
    insuranceCoverageNote: '人保 · 三者300万',
    loanPlanName: '厂家金融',
    feeDisclosureConfirmed: true,
    cashDiscountConfirmed: true,
    contractTermsNote: '交付日期和赠品写入合同',
    insuranceDetails: [{ name: '交强险', amt: 950 }, { name: '商业险', amt: 5200 }],
    expDetails: [{ name: '上牌费', amt: 500 }],
    loan: {
      downPaymentMode: 'ratio',
      downPaymentRatio: 30,
      loanMonths: 36,
      annualRate: 4,
      repaymentMethod: 'equal-payment',
      financeFee: 2000,
      foregoneCashDiscount: 5000,
      manufacturerInterestSubsidy: 2000
    }
  });
  result.processText = '开票价 = 指导价 - 厂商优惠\nPDF 可检索中文文本校验';
  const pdf = pdfReport.buildPdf(result);
  assert.ok(pdf.startsWith('%PDF-'));
  assert.ok(pdf.includes('/ToUnicode'));
  assert.ok(pdf.includes('8D2D8F6662A54EF7'), 'PDF should include UTF-16BE searchable Chinese text mapping');
  assert.ok(pdf.length > 4000);
}

async function testShareCodecAndBrowserAdapters() {
  const payload = {
    app: 'car-buying-calculator',
    version: '1.8.0',
    result: { guidePrice: 240000, paymentMethod: 'loan', note: '中文分享校验' }
  };
  const encoded = await shareCodec.encode(payload);
  assert.ok(encoded.startsWith('gz.') || encoded.startsWith('raw.'));
  assert.deepEqual(await shareCodec.decode(encoded), payload);

  const fields = ocrAdapter.parseFields('厂家指导价 240000\n成交价 225000\n保险费用 5800\n贷款 36 期\n年化利率 3.8%');
  const values = Object.fromEntries(fields.map((item) => [item.key, item.value]));
  assert.equal(values.guidePrice, 240000);
  assert.equal(values.invoicePrice, 225000);
  assert.equal(values.insurance, 5800);
  assert.equal(values.loanMonths, 36);
  assert.equal(values.annualRate, 3.8);

  assert.equal(evidenceStore.supported(), false);
  assert.equal(ocrAdapter.scriptUrl, './vendor/tesseract/tesseract.min.js');
}

async function run() {
  testPolicyAndTax();
  testCostLayersAndSubsidyStates();
  testLoanMethodsAndEarlySettlement();
  testLoanQuoteAndOwnership();
  testSchemaAndShareHelpers();
  testCompletenessAndComparability();
  testValidationAndPolicyTemplate();
  testPdfReportGenerator();
  await testShareCodecAndBrowserAdapters();
  console.log('calculator engine tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
