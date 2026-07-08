const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const POLICY = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'policy.json'), 'utf8'));

function nearlyEqual(actual, expected, epsilon = 0.01) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be close to ${expected}`);
}

function purchaseTax(invoicePrice, vatRate, carType) {
  const exTaxPrice = invoicePrice / (1 + vatRate / 100);
  const rawTax = exTaxPrice * POLICY.purchaseTax.rate;
  if (carType !== 'nev') return { exTaxPrice, tax: rawTax, saving: 0 };
  const reduction = Math.min(exTaxPrice * POLICY.purchaseTax.nevDiscount.rate, POLICY.purchaseTax.nevDiscount.cap);
  return { exTaxPrice, tax: rawTax - reduction, saving: reduction };
}

function equalPayment(principal, annualRate, months) {
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) return principal / months;
  const factor = Math.pow(1 + monthlyRate, months);
  return principal * monthlyRate * factor / (factor - 1);
}

function tradeInSubsidy(invoicePrice, mode, carType, displacement) {
  const group = POLICY.tradeIn[mode];
  const rule = carType === 'nev' ? group.nev : (displacement === 'le2' ? group.fuelLe2 : null);
  return rule ? Math.min(Math.ceil(invoicePrice * rule.rate), rule.cap) : 0;
}

function resolveDownPayment(invoicePrice, downPaymentMode, downPaymentRatio, downPaymentAmount) {
  if (downPaymentMode === 'amount') {
    return {
      downPayment: downPaymentAmount,
      downPaymentRatio: downPaymentAmount / invoicePrice * 100
    };
  }
  return {
    downPayment: invoicePrice * downPaymentRatio / 100,
    downPaymentRatio
  };
}

function loanQuote({ invoicePrice, tax, extraExpense, otherSubsidy, nationalSubsidy, downPaymentMode = 'ratio', downPaymentRatio = 0, downPaymentAmount = 0, annualRate, months, financeFee }) {
  const resolved = resolveDownPayment(invoicePrice, downPaymentMode, downPaymentRatio, downPaymentAmount);
  const downPayment = resolved.downPayment;
  const principal = invoicePrice - downPayment;
  const monthlyPayment = equalPayment(principal, annualRate, months);
  const totalRepayment = monthlyPayment * months;
  const totalInterest = totalRepayment - principal;
  const payNow = downPayment + tax + extraExpense + financeFee;
  const finalCost = downPayment + totalRepayment + tax + extraExpense + financeFee - nationalSubsidy - otherSubsidy;
  return { downPayment, downPaymentRatio: resolved.downPaymentRatio, principal, monthlyPayment, totalRepayment, totalInterest, payNow, finalCost };
}

function expenseQuote({ invoicePrice, tax, insuranceExpense, otherExpense, nationalSubsidy, otherSubsidy }) {
  const extraExpense = insuranceExpense + otherExpense;
  const payNow = invoicePrice + tax + extraExpense;
  const finalCost = payNow - nationalSubsidy - otherSubsidy;
  return { extraExpense, payNow, finalCost };
}

function riskAlerts({ invoicePrice, insuranceExpense, otherExpense, otherSubsidy, giftValue, carType, tradeIn, nationalSubsidy, loanInfo }) {
  const alerts = [];
  const loanExtra = loanInfo ? loanInfo.totalInterest + loanInfo.financeFee : 0;
  if (insuranceExpense <= 0) alerts.push('保险费用可能漏填');
  if (invoicePrice > 0 && insuranceExpense / invoicePrice > 0.08) alerts.push('保险费用占比较高');
  if (invoicePrice > 0 && otherExpense / invoicePrice > 0.05) alerts.push('其他费用占比较高');
  if (loanInfo && invoicePrice > 0 && loanExtra / invoicePrice > 0.08) alerts.push('贷款附加成本较高');
  if (otherSubsidy > 0) alerts.push('后返补贴需确认到账条件');
  if (giftValue > 0) alerts.push('赠品估值不等于现金优惠');
  if (carType === 'nev') alerts.push('新能源资格需按官方目录核验');
  if (tradeIn !== 'none' && nationalSubsidy > 0) alerts.push('以旧换新补贴已计入');
  return alerts;
}

function run() {
  assert.equal(POLICY.version, '2026-2027-public-estimate');
  assert.equal(POLICY.vat.defaultRate, 13);
  assert.equal(POLICY.purchaseTax.nevDiscount.cap, 15000);

  const fuel = purchaseTax(113000, 13, 'fuel');
  nearlyEqual(fuel.exTaxPrice, 100000);
  nearlyEqual(fuel.tax, 10000);

  const nevBelowCap = purchaseTax(226000, 13, 'nev');
  nearlyEqual(nevBelowCap.exTaxPrice, 200000);
  nearlyEqual(nevBelowCap.tax, 10000);
  nearlyEqual(nevBelowCap.saving, 10000);

  const nevAtCap = purchaseTax(339000, 13, 'nev');
  nearlyEqual(nevAtCap.exTaxPrice, 300000);
  nearlyEqual(nevAtCap.tax, 15000);
  nearlyEqual(nevAtCap.saving, 15000);

  assert.equal(tradeInSubsidy(220000, 'scrap', 'nev'), 20000);
  assert.equal(tradeInSubsidy(120000, 'swap', 'fuel', 'le2'), 7200);
  assert.equal(tradeInSubsidy(180000, 'swap', 'fuel', 'gt2'), 0);

  nearlyEqual(equalPayment(120000, 0, 24), 5000);
  const monthly = equalPayment(140000, 4, 36);
  nearlyEqual(monthly, 4133.42, 0.1);

  const loan = loanQuote({
    invoicePrice: 200000,
    tax: 10000,
    extraExpense: 7000,
    otherSubsidy: 3000,
    nationalSubsidy: 12000,
    downPaymentRatio: 30,
    annualRate: 4,
    months: 36,
    financeFee: 2000
  });
  nearlyEqual(loan.downPayment, 60000);
  nearlyEqual(loan.principal, 140000);
  nearlyEqual(loan.payNow, 79000);
  nearlyEqual(loan.finalCost, loan.downPayment + loan.totalRepayment + 10000 + 7000 + 2000 - 12000 - 3000);
  assert.ok(loan.totalInterest > 0);

  const amountModeLoan = loanQuote({
    invoicePrice: 200000,
    tax: 10000,
    extraExpense: 7000,
    otherSubsidy: 3000,
    nationalSubsidy: 12000,
    downPaymentMode: 'amount',
    downPaymentAmount: 80000,
    annualRate: 4,
    months: 36,
    financeFee: 2000
  });
  nearlyEqual(amountModeLoan.downPayment, 80000);
  nearlyEqual(amountModeLoan.downPaymentRatio, 40);
  nearlyEqual(amountModeLoan.principal, 120000);

  const expense = expenseQuote({
    invoicePrice: 200000,
    tax: 10000,
    insuranceExpense: 6500,
    otherExpense: 1500,
    nationalSubsidy: 12000,
    otherSubsidy: 3000
  });
  nearlyEqual(expense.extraExpense, 8000);
  nearlyEqual(expense.payNow, 218000);
  nearlyEqual(expense.finalCost, 203000);

  const risks = riskAlerts({
    invoicePrice: 200000,
    insuranceExpense: 0,
    otherExpense: 12000,
    otherSubsidy: 3000,
    giftValue: 2000,
    carType: 'nev',
    tradeIn: 'scrap',
    nationalSubsidy: 12000,
    loanInfo: { totalInterest: 15000, financeFee: 3000 }
  });
  assert.ok(risks.includes('保险费用可能漏填'));
  assert.ok(risks.includes('其他费用占比较高'));
  assert.ok(risks.includes('贷款附加成本较高'));
  assert.ok(risks.includes('新能源资格需按官方目录核验'));

  console.log('calculator tests passed');
}

run();
