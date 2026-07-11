(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CarCalcOCR = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCRIPT_URL = './vendor/tesseract/tesseract.min.js';
  const WORKER_URL = './vendor/tesseract/worker.min.js';
  const CORE_URL = './vendor/tesseract-core';
  const LANG_URL = './vendor/tesseract-lang';
  let loading = null;

  function loadRuntime() {
    if (typeof Tesseract !== 'undefined') return Promise.resolve(Tesseract);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = function () {
        if (typeof Tesseract !== 'undefined') resolve(Tesseract); else reject(new Error('OCR 运行库加载后不可用。'));
      };
      script.onerror = function () { reject(new Error('OCR 运行库加载失败。')); };
      document.head.appendChild(script);
    });
    return loading;
  }

  function extractAmount(text, patterns) {
    for (let i = 0; i < patterns.length; i += 1) {
      const match = text.match(patterns[i]);
      if (match && Number.isFinite(Number(match[1]))) return Number(match[1].replace(/,/g, ''));
    }
    return null;
  }

  function parseFields(text) {
    const rules = [
      { key: 'guidePrice', label: '指导价', patterns: [/指导价[^\d]{0,12}([\d,]+(?:\.\d+)?)/i, /厂家指导价[^\d]{0,12}([\d,]+(?:\.\d+)?)/i] },
      { key: 'invoicePrice', label: '开票价', patterns: [/开票价[^\d]{0,12}([\d,]+(?:\.\d+)?)/i, /成交价[^\d]{0,12}([\d,]+(?:\.\d+)?)/i] },
      { key: 'mfrSubsidy', label: '厂商优惠', patterns: [/厂商优惠[^\d]{0,12}([\d,]+(?:\.\d+)?)/i, /现金优惠[^\d]{0,12}([\d,]+(?:\.\d+)?)/i] },
      { key: 'tax', label: '购置税', patterns: [/购置税[^\d]{0,12}([\d,]+(?:\.\d+)?)/i] },
      { key: 'insurance', label: '保险费用', patterns: [/保险(?:费用)?[^\d]{0,12}([\d,]+(?:\.\d+)?)/i] },
      { key: 'financeFee', label: '金融服务费', patterns: [/金融(?:服务)?费[^\d]{0,12}([\d,]+(?:\.\d+)?)/i] },
      { key: 'loanMonths', label: '贷款期数', patterns: [/贷款[^\d]{0,12}(\d{1,2})\s*期/i, /(\d{1,2})\s*期/].map(function (item) { return item; }) },
      { key: 'annualRate', label: '年化利率', patterns: [/年化利率[^\d]{0,12}([\d.]+)\s*%?/i] }
    ];
    return rules.map(function (rule) {
      const value = extractAmount(text, rule.patterns);
      return { key: rule.key, label: rule.label, value: value, confidence: value === null ? '未识别' : '待人工确认' };
    });
  }

  async function recognize(file, onProgress) {
    if (!file) throw new Error('请选择一张报价单图片。');
    const runtime = await loadRuntime();
    const worker = await runtime.createWorker('chi_sim+eng', 1, {
      workerPath: WORKER_URL,
      corePath: CORE_URL,
      langPath: LANG_URL,
      logger: function (info) { if (onProgress) onProgress(info); }
    });
    try {
      const result = await worker.recognize(file);
      const text = result && result.data ? result.data.text : '';
      return { text: text, fields: parseFields(text) };
    } finally {
      await worker.terminate();
    }
  }

  return { recognize: recognize, parseFields: parseFields, scriptUrl: SCRIPT_URL, workerUrl: WORKER_URL, coreUrl: CORE_URL, langUrl: LANG_URL };
});
