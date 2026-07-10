const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../src/quote-engine.js');

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

  const early = engine.calculateLoan({ ...common, repaymentMethod: 'equal-payment', earlySettlementMonth: 12, earlySettlementPenaltyRate: 1 });
  assert.ok(early.earlySettlement);
  assert.equal(early.earlySettlement.month, 12);
  assert.ok(early.earlySettlement.remainingPrincipal > 0);
  assert.ok(early.earlySettlement.interestSaved > 0);
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

function run() {
  testPolicyAndTax();
  testCostLayersAndSubsidyStates();
  testLoanMethodsAndEarlySettlement();
  testLoanQuoteAndOwnership();
  testValidationAndPolicyTemplate();
  console.log('calculator engine tests passed');
}

run();
