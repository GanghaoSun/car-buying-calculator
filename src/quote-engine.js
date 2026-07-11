(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CarCalcEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CURRENT_SCHEMA_VERSION = '1.8.0';
  const DEFAULT_SUBSIDY_STATUS = 'conditional';
  const REPAYMENT_METHODS = new Set(['equal-payment', 'equal-principal']);

  function num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
  }

  function sum(items) {
    return (items || []).reduce(function (total, item) {
      return total + num(item && item.amt);
    }, 0);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeDetails(items, options) {
    const settings = options || {};
    return (Array.isArray(items) ? items : []).map(function (item) {
      const amount = num(item && item.amt);
      return {
        name: String((item && item.name) || settings.defaultName || '项目').trim() || (settings.defaultName || '项目'),
        amt: amount,
        status: item && item.status ? String(item.status) : (settings.defaultStatus || DEFAULT_SUBSIDY_STATUS),
        timing: item && item.timing ? String(item.timing) : (settings.defaultTiming || 'post-delivery'),
        condition: String((item && item.condition) || '').trim(),
        evidence: item && item.evidence ? String(item.evidence) : 'none'
      };
    });
  }

  function normalizeQuote(input) {
    const source = input || {};
    const loan = source.loan || source.loanInfo || {};
    const ownership = source.ownership || {};
    return {
      guidePrice: num(source.guidePrice),
      vatRate: num(source.vatRate, 13),
      carType: source.carType || '',
      nevType: source.nevType || '',
      displacement: source.displacement || '',
      tradeIn: source.tradeIn || 'none',
      oldCarType: source.oldCarType || '',
      oldCarDate: source.oldCarDate || '',
      owned1Year: source.owned1Year || '',
      paymentMethod: source.paymentMethod === 'loan' ? 'loan' : 'full',
      quoteModelSpec: String(source.quoteModelSpec || '').trim(),
      insuranceCoverageNote: String(source.insuranceCoverageNote || '').trim(),
      loanPlanName: String(source.loanPlanName || '').trim(),
      contractTermsNote: String(source.contractTermsNote || '').trim(),
      feeDisclosureConfirmed: Boolean(source.feeDisclosureConfirmed),
      subsidyTermsConfirmed: Boolean(source.subsidyTermsConfirmed),
      cashDiscountConfirmed: Boolean(source.cashDiscountConfirmed),
      mfrDetails: normalizeDetails(source.mfrDetails, { defaultName: '厂商优惠', defaultStatus: 'confirmed', defaultTiming: 'invoice' }),
      insuranceDetails: normalizeDetails(source.insuranceDetails, { defaultName: '保险项目', defaultStatus: 'confirmed', defaultTiming: 'delivery' }),
      expDetails: normalizeDetails(source.expDetails, { defaultName: '其他费用', defaultStatus: 'confirmed', defaultTiming: 'delivery' }),
      subDetails: normalizeDetails(source.subDetails, { defaultName: '其他补贴', defaultStatus: DEFAULT_SUBSIDY_STATUS, defaultTiming: 'post-delivery' }),
      giftDetails: normalizeDetails(source.giftDetails, { defaultName: '赠品', defaultStatus: 'conditional', defaultTiming: 'post-delivery' }),
      loanFeeDetails: normalizeDetails(source.loanFeeDetails, { defaultName: '金融附加费', defaultStatus: 'confirmed', defaultTiming: 'delivery' }),
      loan: {
        downPaymentMode: loan.downPaymentMode === 'amount' ? 'amount' : 'ratio',
        downPaymentRatio: num(loan.downPaymentRatio),
        downPaymentAmount: num(loan.downPaymentAmount),
        loanMonths: Math.floor(num(loan.loanMonths)),
        annualRate: num(loan.annualRate),
        repaymentMethod: REPAYMENT_METHODS.has(loan.repaymentMethod) ? loan.repaymentMethod : 'equal-payment',
        financeFee: num(loan.financeFee),
        foregoneCashDiscount: num(loan.foregoneCashDiscount),
        manufacturerInterestSubsidy: num(loan.manufacturerInterestSubsidy || loan.interestSubsidy),
        earlySettlementMonth: Math.floor(num(loan.earlySettlementMonth)),
        earlySettlementPenaltyRate: num(loan.earlySettlementPenaltyRate)
      },
      ownership: {
        enabled: Boolean(ownership.enabled),
        years: Math.floor(num(ownership.years, 3)),
        annualMileage: num(ownership.annualMileage),
        energyCostPer100km: num(ownership.energyCostPer100km),
        annualInsurance: num(ownership.annualInsurance),
        annualMaintenance: num(ownership.annualMaintenance),
        residualRate: num(ownership.residualRate)
      }
    };
  }

  function validateQuote(input, policy) {
    const q = normalizeQuote(input);
    const errors = [];
    const negativeGroups = [
      ['厂商优惠', q.mfrDetails],
      ['保险费用', q.insuranceDetails],
      ['其他费用', q.expDetails],
      ['其他补贴', q.subDetails],
      ['赠品估值', q.giftDetails],
      ['金融附加费', q.loanFeeDetails]
    ];

    if (q.guidePrice <= 0) errors.push('请输入大于 0 的新车官方指导价。');
    if (q.vatRate < 0 || q.vatRate > 20) errors.push('增值税率应在 0% 到 20% 之间。');
    if (!q.carType) errors.push('请选择车辆类型。');
    if (q.carType === 'nev' && !q.nevType) errors.push('请选择新能源细分类别。');
    if (q.carType === 'fuel' && !q.displacement) errors.push('请选择燃油车发动机排量。');
    negativeGroups.forEach(function (group) {
      if (group[1].some(function (item) { return item.amt < 0; })) errors.push(group[0] + '不能填写负数。');
    });
    if (q.paymentMethod === 'loan') {
      if (q.loan.loanMonths <= 0) errors.push('请选择有效的贷款期数。');
      if (q.loan.annualRate < 0 || q.loan.annualRate > 30) errors.push('年化利率应在 0% 到 30% 之间。');
      if (q.loan.financeFee < 0) errors.push('金融服务费不能为负数。');
      if (q.loan.foregoneCashDiscount < 0) errors.push('放弃的全款现金优惠不能为负数。');
      if (q.loan.manufacturerInterestSubsidy < 0) errors.push('厂家贴息金额不能为负数。');
      if (q.loan.earlySettlementMonth < 0) errors.push('提前结清期数不能为负数。');
      if (q.loan.earlySettlementPenaltyRate < 0 || q.loan.earlySettlementPenaltyRate > 100) errors.push('提前结清违约金比例应在 0% 到 100% 之间。');
      if (q.loan.downPaymentMode === 'ratio' && (q.loan.downPaymentRatio < 0 || q.loan.downPaymentRatio >= 100)) errors.push('贷款购车的首付比例应在 0% 到 99% 之间。');
      if (q.loan.downPaymentMode === 'amount' && q.loan.downPaymentAmount < 0) errors.push('首付金额不能为负数。');
    }
    if (q.tradeIn !== 'none' && !q.owned1Year) errors.push('请确认旧车是否在本人名下满 1 年。');
    if (q.tradeIn === 'scrap' && (!q.oldCarType || !q.oldCarDate)) errors.push('报废更新需要填写旧车类型和注册日期。');
    if (q.ownership.enabled) {
      if (![3, 5].includes(q.ownership.years)) errors.push('长期成本测算仅支持 3 年或 5 年。');
      if (q.ownership.annualMileage < 0 || q.ownership.energyCostPer100km < 0 || q.ownership.annualInsurance < 0 || q.ownership.annualMaintenance < 0) errors.push('长期成本测算中的金额和里程不能为负数。');
      if (q.ownership.residualRate < 0 || q.ownership.residualRate > 100) errors.push('预计残值比例应在 0% 到 100% 之间。');
    }
    if (policy && (!policy.purchaseTax || !policy.tradeIn)) errors.push('政策配置不完整，无法完成计算。');
    return { quote: q, errors: errors };
  }

  function calculatePurchaseTax(invoicePrice, vatRate, carType, policy) {
    const vatMultiplier = 1 + vatRate / 100;
    const exTaxPrice = invoicePrice / vatMultiplier;
    const rawTax = exTaxPrice * num(policy.purchaseTax.rate);
    if (carType !== 'nev') {
      return {
        exTaxPrice: exTaxPrice,
        rawTax: rawTax,
        tax: rawTax,
        saving: 0,
        cap: null,
        note: '燃油车全额（' + (num(policy.purchaseTax.rate) * 100).toFixed(0) + '%）'
      };
    }
    const discount = policy.purchaseTax.nevDiscount || {};
    const cap = num(discount.cap);
    const reduction = Math.min(exTaxPrice * num(discount.rate), cap);
    return {
      exTaxPrice: exTaxPrice,
      rawTax: rawTax,
      tax: Math.max(0, rawTax - reduction),
      saving: reduction,
      cap: cap,
      note: reduction >= cap
        ? '新能源减半，减免已达上限 ' + cap.toFixed(2) + ' 元'
        : '新能源减半（' + (num(discount.rate) * 100).toFixed(0) + '%），减免 ' + reduction.toFixed(2) + ' 元'
    };
  }

  function getTradeInRule(tradeIn, carType, displacement, policy) {
    const group = policy.tradeIn && policy.tradeIn[tradeIn];
    if (!group) return null;
    if (carType === 'nev') return group.nev || null;
    if (carType === 'fuel' && displacement === 'le2') return group.fuelLe2 || null;
    return null;
  }

  function calculateTradeInSubsidy(invoicePrice, rule) {
    if (!rule) return 0;
    return Math.min(Math.ceil(invoicePrice * num(rule.rate)), num(rule.cap));
  }

  function calculateNationalSubsidy(q, invoicePrice, policy) {
    const alerts = [];
    if (q.tradeIn === 'none') return { amount: 0, note: '未参与以旧换新', alerts: alerts };
    let eligible = true;
    let note = '';
    if (q.owned1Year === 'no') {
      eligible = false;
      alerts.push({ type: 'danger', msg: '旧车未在本人名下满 1 年，不满足国补条件。' });
    }
    if (q.tradeIn === 'scrap') {
      const deadlines = (policy.tradeIn && policy.tradeIn.oldCarDeadline) || {};
      if (!q.oldCarType || !q.oldCarDate) {
        eligible = false;
        alerts.push({ type: 'warn', msg: '报废更新需填写旧车类型和注册时间。' });
      } else {
        const registeredAt = new Date(q.oldCarDate);
        const deadline = new Date(deadlines[q.oldCarType]);
        const names = { gas: '汽油车', diesel: '柴油车', nev: '新能源车' };
        if (!Number.isFinite(deadline.getTime()) || registeredAt > deadline) {
          eligible = false;
          alerts.push({ type: 'danger', msg: '旧车注册时间不符合要求，请以当地以旧换新细则和正式审核为准。' });
        }
        if (!eligible && names[q.oldCarType]) note = names[q.oldCarType] + '旧车资格未通过当前估算口径';
      }
    }
    if (!eligible) return { amount: 0, note: note || '不满足以旧换新国补条件', alerts: alerts };
    const rule = getTradeInRule(q.tradeIn, q.carType, q.displacement, policy);
    if (!rule) {
      alerts.push({ type: 'warn', msg: '当前车辆类别不适用本配置中的以旧换新国补规则。' });
      return { amount: 0, note: '当前车辆类别不适用本配置规则', alerts: alerts };
    }
    const amount = calculateTradeInSubsidy(invoicePrice, rule);
    const raw = invoicePrice * num(rule.rate);
    note = rule.label + '：开票价 × ' + (num(rule.rate) * 100).toFixed(0) + '% = ' + raw.toFixed(2) + ' 元' + (raw > num(rule.cap) ? '，封顶 ' + num(rule.cap).toFixed(2) + ' 元' : '');
    alerts.push({ type: 'success', msg: '满足当前估算口径，可预计申请 ' + amount.toFixed(2) + ' 元以旧换新补贴。最终以审核结果为准。' });
    return { amount: amount, note: note, alerts: alerts };
  }

  function calculatePaymentSchedule(principal, annualRate, months, repaymentMethod) {
    const totalPrincipal = Math.max(0, num(principal));
    const totalMonths = Math.max(0, Math.floor(num(months)));
    const monthlyRate = Math.max(0, num(annualRate)) / 100 / 12;
    const method = REPAYMENT_METHODS.has(repaymentMethod) ? repaymentMethod : 'equal-payment';
    if (totalPrincipal <= 0 || totalMonths <= 0) return [];
    const schedule = [];
    let remaining = totalPrincipal;
    let fixedPayment = 0;
    if (method === 'equal-payment') {
      fixedPayment = monthlyRate === 0
        ? totalPrincipal / totalMonths
        : totalPrincipal * monthlyRate * Math.pow(1 + monthlyRate, totalMonths) / (Math.pow(1 + monthlyRate, totalMonths) - 1);
    }
    const principalPerMonth = totalPrincipal / totalMonths;
    for (let month = 1; month <= totalMonths; month += 1) {
      const beginning = remaining;
      const interest = beginning * monthlyRate;
      let principalPaid;
      let payment;
      if (method === 'equal-principal') {
        principalPaid = month === totalMonths ? beginning : Math.min(principalPerMonth, beginning);
        payment = principalPaid + interest;
      } else {
        payment = fixedPayment;
        principalPaid = month === totalMonths ? beginning : Math.min(Math.max(0, payment - interest), beginning);
        payment = principalPaid + interest;
      }
      remaining = Math.max(0, beginning - principalPaid);
      schedule.push({ month: month, beginning: beginning, payment: payment, principal: principalPaid, interest: interest, remaining: remaining });
    }
    return schedule;
  }

  function calculateEffectiveAnnualRate(principal, schedule, upfrontCost, upfrontBenefit) {
    const payments = Array.isArray(schedule) ? schedule : [];
    const netProceeds = num(principal) - Math.max(0, num(upfrontCost)) + Math.max(0, num(upfrontBenefit));
    if (netProceeds <= 0 || !payments.length) return null;
    function presentValue(monthlyRate) {
      return payments.reduce(function (total, item) {
        return total + num(item.payment) / Math.pow(1 + monthlyRate, num(item.month));
      }, 0);
    }
    if (presentValue(0) <= netProceeds) return 0;
    let low = 0;
    let high = 0.01;
    while (presentValue(high) > netProceeds && high < 10) high *= 2;
    if (high >= 10 && presentValue(high) > netProceeds) return null;
    for (let i = 0; i < 100; i += 1) {
      const mid = (low + high) / 2;
      if (presentValue(mid) > netProceeds) low = mid; else high = mid;
    }
    return (Math.pow(1 + (low + high) / 2, 12) - 1) * 100;
  }

  function calculateLoan(input) {
    const loan = input || {};
    const invoicePrice = num(loan.invoicePrice);
    const downPaymentMode = loan.downPaymentMode === 'amount' ? 'amount' : 'ratio';
    const downPayment = downPaymentMode === 'amount'
      ? num(loan.downPaymentAmount)
      : invoicePrice * num(loan.downPaymentRatio) / 100;
    const downPaymentRatio = invoicePrice > 0 ? downPayment / invoicePrice * 100 : 0;
    const principal = Math.max(0, invoicePrice - downPayment);
    const repaymentMethod = REPAYMENT_METHODS.has(loan.repaymentMethod) ? loan.repaymentMethod : 'equal-payment';
    const schedule = calculatePaymentSchedule(principal, loan.annualRate, loan.loanMonths, repaymentMethod);
    const totalRepayment = schedule.reduce(function (total, item) { return total + item.payment; }, 0);
    const totalInterest = schedule.reduce(function (total, item) { return total + item.interest; }, 0);
    const manufacturerInterestSubsidy = Math.max(0, num(loan.manufacturerInterestSubsidy));
    const appliedInterestSubsidy = Math.min(manufacturerInterestSubsidy, totalInterest);
    const customerTotalRepayment = Math.max(0, totalRepayment - appliedInterestSubsidy);
    const financeFees = Math.max(0, num(loan.financeFee)) + sum(loan.loanFeeDetails);
    const foregoneCashDiscount = Math.max(0, num(loan.foregoneCashDiscount));
    const effectiveAnnualRate = calculateEffectiveAnnualRate(
      principal,
      schedule,
      financeFees + foregoneCashDiscount,
      appliedInterestSubsidy
    );
    const earlyMonth = Math.floor(num(loan.earlySettlementMonth));
    const penaltyRate = Math.max(0, num(loan.earlySettlementPenaltyRate));
    let earlySettlement = null;
    if (earlyMonth > 0 && earlyMonth < schedule.length) {
      const paidBefore = schedule.slice(0, earlyMonth).reduce(function (total, item) { return total + item.payment; }, 0);
      const paidBeforeInterest = schedule.slice(0, earlyMonth).reduce(function (total, item) { return total + item.interest; }, 0);
      const balance = schedule[earlyMonth - 1].remaining;
      const penalty = balance * penaltyRate / 100;
      const settlementRepayment = paidBefore + balance + penalty;
      const appliedBefore = Math.min(appliedInterestSubsidy, paidBeforeInterest);
      earlySettlement = {
        month: earlyMonth,
        paidBefore: paidBefore,
        remainingPrincipal: balance,
        penaltyRate: penaltyRate,
        penalty: penalty,
        settlementRepayment: settlementRepayment,
        appliedInterestSubsidy: appliedBefore,
        customerSettlementRepayment: Math.max(0, settlementRepayment - appliedBefore),
        interestSaved: Math.max(0, totalRepayment - paidBefore - balance),
        customerSavings: Math.max(0, customerTotalRepayment - Math.max(0, settlementRepayment - appliedBefore))
      };
    }
    const firstPayment = schedule.length ? schedule[0].payment : 0;
    const lastPayment = schedule.length ? schedule[schedule.length - 1].payment : 0;
    return {
      downPaymentMode: downPaymentMode,
      downPayment: downPayment,
      downPaymentRatio: downPaymentRatio,
      loanPrincipal: principal,
      loanMonths: Math.floor(num(loan.loanMonths)),
      annualRate: num(loan.annualRate),
      repaymentMethod: repaymentMethod,
      monthlyPayment: firstPayment,
      firstMonthlyPayment: firstPayment,
      lastMonthlyPayment: lastPayment,
      totalRepayment: totalRepayment,
      customerTotalRepayment: customerTotalRepayment,
      totalInterest: totalInterest,
      financeFee: Math.max(0, num(loan.financeFee)),
      financeFees: financeFees,
      foregoneCashDiscount: foregoneCashDiscount,
      manufacturerInterestSubsidy: manufacturerInterestSubsidy,
      appliedInterestSubsidy: appliedInterestSubsidy,
      netFinanceCost: Math.max(0, totalInterest + financeFees + foregoneCashDiscount - appliedInterestSubsidy),
      comprehensiveFinanceCost: Math.max(0, totalInterest + financeFees + foregoneCashDiscount - appliedInterestSubsidy),
      effectiveAnnualRate: effectiveAnnualRate,
      loanFeeDetails: normalizeDetails(loan.loanFeeDetails, { defaultName: '金融附加费', defaultStatus: 'confirmed', defaultTiming: 'delivery' }).filter(function (item) { return item.amt > 0; }),
      earlySettlement: earlySettlement,
      schedule: schedule
    };
  }

  function buildCashflowTimeline(input) {
    const options = input || {};
    const loan = options.loanInfo;
    if (!loan) {
      return [{ month: 0, label: '提车日全款', category: 'delivery', amount: num(options.payNow), principal: num(options.payNow), interest: 0, remaining: 0 }];
    }
    const timeline = [{
      month: 0,
      label: '提车日首期垫付',
      category: 'delivery',
      amount: num(options.payNow),
      principal: num(loan.downPayment),
      interest: 0,
      remaining: num(loan.loanPrincipal)
    }];
    if (loan.appliedInterestSubsidy > 0) {
      timeline.push({
        month: 0,
        label: '厂家贴息抵扣',
        category: 'subsidy',
        amount: -num(loan.appliedInterestSubsidy),
        principal: 0,
        interest: -num(loan.appliedInterestSubsidy),
        remaining: num(loan.loanPrincipal)
      });
    }
    (loan.schedule || []).forEach(function (item) {
      timeline.push({
        month: item.month,
        label: '第 ' + item.month + ' 期月供',
        category: 'repayment',
        amount: item.payment,
        principal: item.principal,
        interest: item.interest,
        remaining: item.remaining
      });
    });
    return timeline;
  }

  function calculateOwnership(input) {
    const ownership = input.ownership || {};
    if (!ownership.enabled) return null;
    const years = Math.floor(num(ownership.years, 3));
    const annualMileage = num(ownership.annualMileage);
    const energyCostPer100km = num(ownership.energyCostPer100km);
    const annualInsurance = num(ownership.annualInsurance);
    const annualMaintenance = num(ownership.annualMaintenance);
    const residualRate = num(ownership.residualRate);
    const baseCost = num(input.baseCost);
    const invoicePrice = num(input.invoicePrice);
    const energyCost = annualMileage / 100 * energyCostPer100km * years;
    const renewalInsurance = annualInsurance * Math.max(0, years - 1);
    const maintenanceCost = annualMaintenance * years;
    const residualValue = invoicePrice * residualRate / 100;
    const totalCost = baseCost + energyCost + renewalInsurance + maintenanceCost - residualValue;
    return {
      years: years,
      annualMileage: annualMileage,
      energyCostPer100km: energyCostPer100km,
      annualInsurance: annualInsurance,
      annualMaintenance: annualMaintenance,
      residualRate: residualRate,
      baseCost: baseCost,
      energyCost: energyCost,
      renewalInsurance: renewalInsurance,
      maintenanceCost: maintenanceCost,
      residualValue: residualValue,
      totalCost: totalCost,
      annualAverageCost: years > 0 ? totalCost / years : 0
    };
  }

  function buildLoanComparison(input) {
    const options = input || {};
    const tax = num(options.tax);
    const extraExpense = num(options.extraExpense);
    const confirmedSubsidy = num(options.confirmedSubsidy);
    const conditionalSubsidy = num(options.conditionalSubsidy);
    const cashGross = num(options.invoicePrice) + tax + extraExpense;
    const cash = {
      id: 'full',
      label: '全款购车',
      repaymentMethod: '',
      payNow: cashGross,
      totalInterest: 0,
      financeFees: 0,
      foregoneCashDiscount: 0,
      interestSubsidy: 0,
      effectiveAnnualRate: null,
      expectedCost: cashGross - confirmedSubsidy - conditionalSubsidy
    };
    const common = options.loan || {};
    const methods = ['equal-payment', 'equal-principal'];
    const scenarios = methods.map(function (repaymentMethod) {
      const loan = calculateLoan(Object.assign({}, common, { repaymentMethod: repaymentMethod }));
      const gross = loan.downPayment + loan.customerTotalRepayment + tax + extraExpense + loan.financeFees + loan.foregoneCashDiscount;
      return {
        id: repaymentMethod,
        label: repaymentMethod === 'equal-principal' ? '等额本金' : '等额本息',
        repaymentMethod: repaymentMethod,
        payNow: loan.downPayment + tax + extraExpense + loan.financeFees,
        totalInterest: loan.totalInterest,
        financeFees: loan.financeFees,
        foregoneCashDiscount: loan.foregoneCashDiscount,
        interestSubsidy: loan.appliedInterestSubsidy,
        netFinanceCost: loan.netFinanceCost,
        effectiveAnnualRate: loan.effectiveAnnualRate,
        expectedCost: gross - confirmedSubsidy - conditionalSubsidy,
        firstMonthlyPayment: loan.firstMonthlyPayment,
        lastMonthlyPayment: loan.lastMonthlyPayment
      };
    });
    return [cash].concat(scenarios);
  }

  function buildRiskAlerts(result) {
    const alerts = [];
    const insuranceExpense = num(result.insuranceExpense);
    const otherExpense = num(result.otherExpense);
    const loanInfo = result.loanInfo;
    const loanExtra = loanInfo ? num(loanInfo.netFinanceCost) : 0;
    if (insuranceExpense <= 0) {
      alerts.push({ type: 'warn', title: '保险费用可能漏填', msg: '当前保险费用为 0 元。实际购车通常至少涉及交强险，商业险的险种、保额和保险公司报价也应单独核对。' });
    } else if (result.invoicePrice > 0 && insuranceExpense / result.invoicePrice > 0.08) {
      alerts.push({ type: 'warn', title: '保险费用占比较高', msg: '保险费用超过开票价的 8%。建议核对保额、险种和是否被捆绑销售。' });
    }
    if (otherExpense > 0 && result.invoicePrice > 0 && otherExpense / result.invoicePrice > 0.05) {
      alerts.push({ type: 'warn', title: '其他费用占比较高', msg: '上牌、精品包、服务费等超过开票价的 5%。请销售逐项写清金额、服务内容和是否可取消。' });
    }
    if (loanInfo && loanExtra > 0 && result.invoicePrice > 0 && loanExtra / result.invoicePrice > 0.08) {
      alerts.push({ type: 'warn', title: '贷款附加成本较高', msg: '总利息与金融附加费用合计超过开票价的 8%。建议比较全款、银行贷款和厂商金融。' });
    }
    if (loanInfo && loanInfo.financeFees > 0) {
      alerts.push({ type: 'info', title: '金融费用需写入合同', msg: '金融服务费及附加费用已纳入总成本。请确认是否开票、能否取消，以及是否与利率重复收费。' });
    }
    if (loanInfo && loanInfo.foregoneCashDiscount > 0) {
      alerts.push({ type: 'warn', title: '贷款方案减少了全款优惠', msg: '已将放弃的全款现金优惠计入综合融资成本和综合年化。请让销售分别提供同口径的全款价与贷款价。' });
    }
    if (loanInfo && loanInfo.manufacturerInterestSubsidy > 0) {
      alerts.push({ type: 'info', title: '厂家贴息需要核对合同', msg: '厂家贴息已按不超过实际利息的金额抵扣预算，但贴息承担方、适用期数、提前结清是否失效，必须以金融合同为准。' });
    }
    if (result.mfrSubsidy > 0 && result.guidePrice > 0 && result.mfrSubsidy / result.guidePrice > 0.15) {
      alerts.push({ type: 'info', title: '确认优惠是否直接减开发票', msg: '厂商优惠占指导价比例较高。请确认它是直接减少开票价，还是附条件的后返优惠。' });
    }
    if (result.conditionalSubsidy > 0) {
      alerts.push({ type: 'warn', title: '存在待确认补贴', msg: '预计总支出已扣除待申请或口头承诺补贴。请核对申请窗口、到账条件、上牌地和责任方。' });
    }
    if ((result.subDetails || []).some(function (item) { return item.status === 'oral'; })) {
      alerts.push({ type: 'danger', title: '口头承诺不应视为确定优惠', msg: '存在仅记录为销售口头承诺的补贴。建议写入合同或补充协议后再计入决策。' });
    }
    if (result.giftValue > 0) {
      alerts.push({ type: 'info', title: '赠品估值不等于现金优惠', msg: '赠品只用于横向比较综合性价比，不能直接视为少付现金。' });
    }
    if (result.carType === 'nev') {
      alerts.push({ type: 'info', title: '新能源资格需按官方目录核验', msg: '新能源购置税优惠是否适用取决于车辆是否进入官方目录；插混或增程车型还应核验最新技术门槛。' });
    }
    if (result.policyStatus && result.policyStatus.level !== 'valid') {
      alerts.push({ type: 'warn', title: '政策配置需要复核', msg: result.policyStatus.message });
    }
    if (!alerts.length) alerts.push({ type: 'success', title: '未发现明显异常项', msg: '当前报价结构较清晰。签合同前仍建议逐项核对发票金额、保险、补贴到账方式和赠品交付条件。' });
    return alerts;
  }

  function assessQuoteCompleteness(input) {
    const q = normalizeQuote(input);
    const checks = [];
    function add(ok, points, label) {
      checks.push({ ok: Boolean(ok), points: points, label: label });
    }
    add(q.quoteModelSpec, 15, '车型年款、配置与选装');
    add(q.guidePrice > 0, 15, '指导价和价格口径');
    add(sum(q.insuranceDetails) > 0, 10, '保险金额明细');
    add(q.insuranceCoverageNote, 10, '保险公司、险种与保额');
    add(q.feeDisclosureConfirmed, 10, '收费项目已逐项确认');
    const hasConditionalSubsidy = q.tradeIn !== 'none' || q.subDetails.some(function (item) { return item.amt > 0 && item.status !== 'confirmed'; });
    add(!hasConditionalSubsidy || q.subsidyTermsConfirmed, 10, '补贴到账条件、期限与责任方');
    add(q.contractTermsNote, 10, '订金、交付和退款等合同条款');
    if (q.paymentMethod === 'loan') {
      add(q.loan.loanMonths > 0 && q.loan.annualRate >= 0, 10, '贷款期数与名义利率');
      add(q.loanPlanName && q.cashDiscountConfirmed, 10, '金融机构、方案名与全款优惠差额');
    } else {
      add(true, 20, '全款付款条件');
    }
    const score = checks.reduce(function (total, item) { return total + (item.ok ? item.points : 0); }, 0);
    const missing = checks.filter(function (item) { return !item.ok; }).map(function (item) { return item.label; });
    const level = score >= 90 ? '完整' : score >= 75 ? '较完整' : score >= 60 ? '待补充' : '缺项较多';
    const tone = score >= 90 ? 'success' : score >= 75 ? 'info' : score >= 60 ? 'warn' : 'danger';
    return { score: score, level: level, tone: tone, missing: missing, checks: checks };
  }

  function assessComparability(records) {
    const list = Array.isArray(records) ? records.filter(Boolean) : [];
    if (list.length < 2) return { level: 'insufficient', label: '至少选择两条报价', issues: [] };
    const issues = [];
    function valuesFor(key, fallback) {
      return new Set(list.map(function (item) { return String(item[key] || fallback || '').trim().toLowerCase(); }));
    }
    const modelValues = valuesFor('quoteModelSpec');
    if (modelValues.has('')) issues.push('有报价未填写车型年款、配置或选装，无法确认车型口径一致');
    else if (modelValues.size > 1) issues.push('车型年款、配置或选装不同');
    const insuranceValues = valuesFor('insuranceCoverageNote');
    if (insuranceValues.has('')) issues.push('有报价未填写保险公司、险种或保额');
    else if (insuranceValues.size > 1) issues.push('保险公司、险种或保额口径不同');
    if (valuesFor('paymentMethod', 'full').size > 1) issues.push('同时选择了全款与贷款报价');
    const loans = list.filter(function (item) { return item.paymentMethod === 'loan'; });
    if (loans.length > 1) {
      const terms = new Set(loans.map(function (item) {
        const loan = item.loanInfo || {};
        return [item.loanPlanName || '', loan.loanMonths || 0, loan.repaymentMethod || '', Number(loan.annualRate || 0).toFixed(4)].join('|');
      }));
      if (terms.size > 1) issues.push('贷款机构、方案、期数、还款方式或名义利率不同');
    }
    const carTypes = new Set(list.map(function (item) { return [item.carType || '', item.nevType || '', item.displacement || ''].join('|'); }));
    if (carTypes.size > 1) issues.push('车辆动力类型或排量税费口径不同');
    return issues.length
      ? { level: 'partial', label: '部分项目不可直接比较', issues: issues }
      : { level: 'comparable', label: '关键口径一致', issues: [] };
  }

  function policyStatus(policy, now) {
    const current = now ? new Date(now) : new Date();
    const from = policy && policy.effectiveFrom ? new Date(policy.effectiveFrom) : null;
    const to = policy && policy.effectiveTo ? new Date(policy.effectiveTo) : null;
    if (to && Number.isFinite(to.getTime()) && current > new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59)) {
      return { level: 'expired', message: '当前政策配置已超过标注有效期，请导入已核验的最新政策包后再使用。' };
    }
    if (from && Number.isFinite(from.getTime()) && current < from) {
      return { level: 'future', message: '当前政策配置尚未到标注生效日期，请核对购车时间和政策版本。' };
    }
    return { level: 'valid', message: '政策配置处于标注有效期内，仍请以官方公告和当地细则为准。' };
  }

  function calculateQuote(input, policy) {
    const checked = validateQuote(input, policy);
    if (checked.errors.length) return { errors: checked.errors, result: null };
    const q = checked.quote;
    const mfrSubsidy = sum(q.mfrDetails);
    const insuranceExpense = sum(q.insuranceDetails);
    const otherExpense = sum(q.expDetails);
    const extraExpense = insuranceExpense + otherExpense;
    const otherSubsidy = sum(q.subDetails);
    const giftValue = sum(q.giftDetails);
    const invoicePrice = q.guidePrice - mfrSubsidy;
    if (invoicePrice <= 0) return { errors: ['开票价格不能为零或负数，请检查指导价和厂商优惠。'], result: null };
    if (q.paymentMethod === 'loan' && q.loan.downPaymentMode === 'amount' && q.loan.downPaymentAmount >= invoicePrice) {
      return { errors: ['首付金额应小于开票价格；一次性付清请选择全款购车。'], result: null };
    }
    const taxResult = calculatePurchaseTax(invoicePrice, q.vatRate, q.carType, policy);
    const national = calculateNationalSubsidy(q, invoicePrice, policy);
    const loanInput = Object.assign({}, q.loan, { invoicePrice: invoicePrice, loanFeeDetails: q.loanFeeDetails });
    const loanInfo = q.paymentMethod === 'loan' ? calculateLoan(loanInput) : null;
    const cashGrossCost = loanInfo
      ? loanInfo.downPayment + loanInfo.customerTotalRepayment + taxResult.tax + extraExpense + loanInfo.financeFees
      : invoicePrice + taxResult.tax + extraExpense;
    const grossCost = cashGrossCost + (loanInfo ? loanInfo.foregoneCashDiscount : 0);
    const payNow = loanInfo
      ? loanInfo.downPayment + taxResult.tax + extraExpense + loanInfo.financeFees
      : invoicePrice + taxResult.tax + extraExpense;
    const confirmedOtherSubsidy = q.subDetails.filter(function (item) { return item.status === 'confirmed'; });
    const conditionalOtherSubsidy = q.subDetails.filter(function (item) { return item.status !== 'confirmed'; });
    const confirmedSubsidy = sum(confirmedOtherSubsidy);
    const conditionalSubsidy = national.amount + sum(conditionalOtherSubsidy);
    const confirmedFinalCost = grossCost - confirmedSubsidy;
    const expectedFinalCost = confirmedFinalCost - conditionalSubsidy;
    const earlyGrossCost = loanInfo && loanInfo.earlySettlement
      ? loanInfo.downPayment + loanInfo.earlySettlement.customerSettlementRepayment + taxResult.tax + extraExpense + loanInfo.financeFees + loanInfo.foregoneCashDiscount
      : null;
    const result = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      guidePrice: q.guidePrice,
      vatRate: q.vatRate,
      mfrSubsidy: mfrSubsidy,
      insuranceExpense: insuranceExpense,
      otherExpense: otherExpense,
      extraExpense: extraExpense,
      otherSubsidy: otherSubsidy,
      confirmedOtherSubsidy: confirmedSubsidy,
      conditionalOtherSubsidy: sum(conditionalOtherSubsidy),
      confirmedSubsidy: confirmedSubsidy,
      conditionalSubsidy: conditionalSubsidy,
      giftValue: giftValue,
      invoicePrice: invoicePrice,
      exTaxPrice: taxResult.exTaxPrice,
      rawTax: taxResult.rawTax,
      tax: taxResult.tax,
      taxNote: taxResult.note,
      taxSaving: taxResult.saving,
      nationalSubsidy: national.amount,
      nationalNote: national.note,
      nationalAlerts: national.alerts,
      payNow: payNow,
      grossCost: grossCost,
      cashGrossCost: cashGrossCost,
      confirmedFinalCost: confirmedFinalCost,
      expectedFinalCost: expectedFinalCost,
      finalCost: expectedFinalCost,
      earlyGrossCost: earlyGrossCost,
      earlyExpectedFinalCost: earlyGrossCost === null ? null : earlyGrossCost - confirmedSubsidy - conditionalSubsidy,
      totalSavings: mfrSubsidy + taxResult.saving + national.amount + otherSubsidy,
      paymentMethod: q.paymentMethod,
      loanInfo: loanInfo,
      carType: q.carType,
      nevType: q.nevType,
      displacement: q.displacement,
      tradeIn: q.tradeIn,
      oldCarType: q.oldCarType,
      oldCarDate: q.oldCarDate,
      owned1Year: q.owned1Year,
      quoteModelSpec: q.quoteModelSpec,
      insuranceCoverageNote: q.insuranceCoverageNote,
      loanPlanName: q.loanPlanName,
      contractTermsNote: q.contractTermsNote,
      feeDisclosureConfirmed: q.feeDisclosureConfirmed,
      subsidyTermsConfirmed: q.subsidyTermsConfirmed,
      cashDiscountConfirmed: q.cashDiscountConfirmed,
      insuranceDetails: q.insuranceDetails.filter(function (item) { return item.amt > 0; }),
      expDetails: q.expDetails.filter(function (item) { return item.amt > 0; }),
      subDetails: q.subDetails.filter(function (item) { return item.amt > 0; }),
      giftDetails: q.giftDetails.filter(function (item) { return item.amt > 0; }),
      mfrDetails: q.mfrDetails.filter(function (item) { return item.amt > 0; }),
      loanFeeDetails: q.loanFeeDetails.filter(function (item) { return item.amt > 0; }),
      policyVersion: policy.version || '',
      policyUpdatedAt: policy.updatedAt || '',
      policyName: policy.name || '全国通用估算参数',
      policyStatus: policyStatus(policy),
      calcTime: new Date().toISOString()
    };
    result.completeness = assessQuoteCompleteness(q);
    if (loanInfo) {
      result.manufacturerInterestSubsidy = loanInfo.manufacturerInterestSubsidy;
      result.appliedInterestSubsidy = loanInfo.appliedInterestSubsidy;
      result.cashflowTimeline = buildCashflowTimeline({ loanInfo: loanInfo, payNow: payNow });
      result.cashflowSummary = {
        delivery: payNow,
        regularRepayment: loanInfo.customerTotalRepayment,
        interestSubsidy: loanInfo.appliedInterestSubsidy,
        regularTotal: payNow + loanInfo.customerTotalRepayment,
        earlySettlementTotal: loanInfo.earlySettlement
          ? payNow + loanInfo.earlySettlement.customerSettlementRepayment
          : null
      };
      result.totalSavings += loanInfo.appliedInterestSubsidy;
    } else {
      result.manufacturerInterestSubsidy = 0;
      result.appliedInterestSubsidy = 0;
      result.cashflowTimeline = buildCashflowTimeline({ payNow: payNow });
      result.cashflowSummary = { delivery: payNow, regularRepayment: 0, interestSubsidy: 0, regularTotal: payNow, earlySettlementTotal: null };
    }
    if (q.ownership.enabled) {
      result.ownership = calculateOwnership({ ownership: q.ownership, baseCost: expectedFinalCost, invoicePrice: invoicePrice });
    } else {
      result.ownership = null;
    }
    result.loanComparison = loanInfo ? buildLoanComparison({
      invoicePrice: invoicePrice,
      tax: taxResult.tax,
      extraExpense: extraExpense,
      confirmedSubsidy: confirmedSubsidy,
      conditionalSubsidy: conditionalSubsidy,
      loan: loanInput
    }) : [];
    result.riskAlerts = buildRiskAlerts(result);
    return { errors: [], result: result };
  }

  function validatePolicyProfile(profile) {
    if (!profile || typeof profile !== 'object') return { valid: false, message: '政策文件不是有效 JSON 对象。' };
    if (!profile.version || !profile.name || !profile.effectiveFrom || !profile.effectiveTo) return { valid: false, message: '政策包缺少名称、版本或有效期。' };
    if (!profile.purchaseTax || !profile.tradeIn) return { valid: false, message: '政策包缺少购置税或以旧换新配置。' };
    return { valid: true, message: '' };
  }

  return {
    clone: clone,
    normalizeQuote: normalizeQuote,
    validateQuote: validateQuote,
    calculatePurchaseTax: calculatePurchaseTax,
    calculateTradeInSubsidy: calculateTradeInSubsidy,
    calculatePaymentSchedule: calculatePaymentSchedule,
    calculateEffectiveAnnualRate: calculateEffectiveAnnualRate,
    calculateLoan: calculateLoan,
    buildCashflowTimeline: buildCashflowTimeline,
    calculateOwnership: calculateOwnership,
    calculateQuote: calculateQuote,
    buildRiskAlerts: buildRiskAlerts,
    assessQuoteCompleteness: assessQuoteCompleteness,
    assessComparability: assessComparability,
    policyStatus: policyStatus,
    validatePolicyProfile: validatePolicyProfile
  };
});
