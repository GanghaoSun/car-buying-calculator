(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CarCalcPdf = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PAGE_WIDTH = 595.28;
  const PAGE_HEIGHT = 841.89;
  const MARGIN_X = 46;
  const MARGIN_TOP = 54;
  const MARGIN_BOTTOM = 48;
  const LINE_HEIGHT = 17;
  const FONT_SIZE = 11;

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function money(value) {
    return num(value).toFixed(2) + ' 元';
  }

  function cleanText(value) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
  }

  function visualLength(text) {
    return Array.from(text).reduce(function (total, ch) {
      return total + (/[\u4e00-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1);
    }, 0);
  }

  function wrapText(text, maxVisualLength) {
    const source = cleanText(text);
    if (!source) return [''];
    const lines = [];
    source.split('\n').forEach(function (paragraph) {
      let line = '';
      Array.from(paragraph).forEach(function (ch) {
        if (visualLength(line + ch) > maxVisualLength && line) {
          lines.push(line);
          line = ch;
        } else {
          line += ch;
        }
      });
      lines.push(line);
    });
    return lines;
  }

  function utf16beHex(text) {
    let hex = '';
    for (const ch of cleanText(text)) {
      const code = ch.codePointAt(0);
      if (code <= 0xffff) {
        hex += code.toString(16).padStart(4, '0').toUpperCase();
      } else {
        const adjusted = code - 0x10000;
        const high = 0xd800 + (adjusted >> 10);
        const low = 0xdc00 + (adjusted & 0x3ff);
        hex += high.toString(16).padStart(4, '0').toUpperCase();
        hex += low.toString(16).padStart(4, '0').toUpperCase();
      }
    }
    return hex || '0020';
  }

  function pdfString(value) {
    return '(' + cleanText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')';
  }

  function detailText(items) {
    const list = Array.isArray(items) ? items : [];
    const parts = list.filter(function (item) { return num(item && item.amt) > 0; })
      .map(function (item) { return cleanText(item.name || '项目') + ' ' + money(item.amt); });
    return parts.length ? parts.join('；') : '未录入';
  }

  function reportRows(r) {
    const loanInfo = r.loanInfo || null;
    const rows = [
      ['车型与配置', r.quoteModelSpec || r.model || '未填写'],
      ['购车方式', r.paymentMethod === 'loan' ? '贷款购车' : '全款购车'],
      ['指导价', money(r.guidePrice)],
      ['开票价', money(r.invoicePrice)],
      ['购置税', money(r.tax) + '（' + cleanText(r.taxNote || '') + '）'],
      ['保险费用', money(r.insuranceExpense) + '（' + detailText(r.insuranceDetails) + '）'],
      ['其他费用', money(r.otherExpense != null ? r.otherExpense : Math.max(0, num(r.extraExpense) - num(r.insuranceExpense))) + '（' + detailText(r.expDetails) + '）'],
      [r.paymentMethod === 'loan' ? '首期需垫付' : '提车时需垫付', money(r.payNow)],
      ['已确认补贴', money(r.confirmedSubsidy)],
      ['待确认补贴', money(r.conditionalSubsidy)],
      [r.paymentMethod === 'loan' ? '贷款预计总成本' : '预计总支出', money(r.expectedFinalCost != null ? r.expectedFinalCost : r.finalCost)],
      ['赠品估值', money(r.giftValue)],
      ['综合等效支出', money((r.expectedFinalCost != null ? r.expectedFinalCost : r.finalCost) - num(r.giftValue))]
    ];
    if (loanInfo) {
      rows.splice(8, 0,
        ['金融机构与方案', r.loanPlanName || '未填写'],
        ['还款方式', loanInfo.repaymentMethod === 'equal-principal' ? '等额本金' : '等额本息'],
        ['首付金额', money(loanInfo.downPayment) + '（' + num(loanInfo.downPaymentRatio).toFixed(2) + '%）'],
        ['贷款本金', money(loanInfo.loanPrincipal)],
        ['贷款期数与名义利率', num(loanInfo.loanMonths) + ' 期，年化 ' + num(loanInfo.annualRate).toFixed(2) + '%'],
        ['首月月供', money(loanInfo.firstMonthlyPayment || loanInfo.monthlyPayment)],
        ['总利息', money(loanInfo.totalInterest)],
        ['金融附加费用', money(loanInfo.financeFees)],
        ['放弃的全款现金优惠', money(loanInfo.foregoneCashDiscount)],
        ['厂家贴息抵扣', '-' + money(loanInfo.appliedInterestSubsidy)],
        ['综合融资成本', money(loanInfo.netFinanceCost)],
        ['综合年化成本', Number.isFinite(loanInfo.effectiveAnnualRate) ? num(loanInfo.effectiveAnnualRate).toFixed(2) + '%' : '无法计算']
      );
    }
    return rows;
  }

  function buildLines(record) {
    const r = record || {};
    const lines = [];
    lines.push({ text: '购车报价报告', size: 18, gapAfter: 8 });
    lines.push({ text: '生成时间：' + new Date().toLocaleString('zh-CN'), size: 10 });
    lines.push({ text: '政策配置：' + (r.policyName || r.policyVersion || '未标注') + '；版本：' + (r.policyVersion || '未标注') + '；更新：' + (r.policyUpdatedAt || '未标注'), size: 10, gapAfter: 8 });
    lines.push({ text: '核心费用与报价口径', size: 14, gapBefore: 8 });
    reportRows(r).forEach(function (row) {
      wrapText(row[0] + '：' + row[1], 58).forEach(function (line) {
        lines.push({ text: line, size: FONT_SIZE });
      });
    });
    if (r.ownership) {
      lines.push({ text: r.ownership.years + ' 年持有成本', size: 14, gapBefore: 10 });
      [
        ['能源费用', r.ownership.energyCost],
        ['续保费用', r.ownership.renewalInsurance],
        ['保养费用', r.ownership.maintenanceCost],
        ['预计残值', -num(r.ownership.residualValue)],
        [r.ownership.years + ' 年总持有成本', r.ownership.totalCost]
      ].forEach(function (row) { lines.push({ text: row[0] + '：' + money(row[1]), size: FONT_SIZE }); });
    }
    const risks = Array.isArray(r.riskAlerts) ? r.riskAlerts : [];
    lines.push({ text: '风险提示', size: 14, gapBefore: 10 });
    if (risks.length) {
      risks.slice(0, 10).forEach(function (item, index) {
        wrapText((index + 1) + '. ' + cleanText(item.title || '提示') + '：' + cleanText(item.msg || ''), 58)
          .forEach(function (line) { lines.push({ text: line, size: FONT_SIZE }); });
      });
    } else {
      lines.push({ text: '未发现明显异常项；签合同前仍建议逐项核对发票金额、保险、补贴和金融条款。', size: FONT_SIZE });
    }
    lines.push({ text: '计算过程摘要', size: 14, gapBefore: 10 });
    cleanText(r.processText || '').split('\n').slice(0, 28).forEach(function (line) {
      wrapText(line, 62).forEach(function (wrapped) { lines.push({ text: wrapped, size: 9 }); });
    });
    lines.push({ text: '免责声明', size: 14, gapBefore: 10 });
    wrapText('本报告由购车费用全维度计算器在浏览器本地生成，仅用于预算估算和报价对比。购置税、以旧换新、地方补贴、保险和金融方案均以官方公告、当地细则、合同、发票和金融机构正式报价为准。', 58)
      .forEach(function (line) { lines.push({ text: line, size: 10 }); });
    return lines;
  }

  function paginate(lines) {
    const pages = [[]];
    let y = PAGE_HEIGHT - MARGIN_TOP;
    lines.forEach(function (item) {
      if (item.gapBefore) y -= item.gapBefore;
      const needed = LINE_HEIGHT + (item.gapAfter || 0);
      if (y - needed < MARGIN_BOTTOM) {
        pages.push([]);
        y = PAGE_HEIGHT - MARGIN_TOP;
      }
      pages[pages.length - 1].push(Object.assign({}, item, { y: y }));
      y -= LINE_HEIGHT + (item.gapAfter || 0);
    });
    return pages;
  }

  function contentStream(pageLines, pageIndex, pageCount, uniqueChars) {
    const commands = ['q', '1 1 1 rg', '0 0 ' + PAGE_WIDTH.toFixed(2) + ' ' + PAGE_HEIGHT.toFixed(2) + ' re f', 'Q'];
    pageLines.forEach(function (item) {
      const text = cleanText(item.text);
      Array.from(text).forEach(function (ch) { uniqueChars.add(ch); });
      commands.push('BT');
      commands.push('/F1 ' + (item.size || FONT_SIZE) + ' Tf');
      commands.push('0 0 0 rg');
      commands.push(MARGIN_X + ' ' + item.y.toFixed(2) + ' Td');
      commands.push('<' + utf16beHex(text) + '> Tj');
      commands.push('ET');
    });
    const footer = '第 ' + (pageIndex + 1) + ' / ' + pageCount + ' 页';
    Array.from(footer).forEach(function (ch) { uniqueChars.add(ch); });
    commands.push('BT /F1 9 Tf 0.35 0.39 0.47 rg ' + MARGIN_X + ' 28 Td <' + utf16beHex(footer) + '> Tj ET');
    return commands.join('\n');
  }

  function buildToUnicodeCMap(uniqueChars) {
    const chars = Array.from(uniqueChars).filter(Boolean);
    const blocks = [];
    for (let i = 0; i < chars.length; i += 100) {
      const batch = chars.slice(i, i + 100);
      blocks.push(batch.length + ' beginbfchar\n' + batch.map(function (ch) {
        const hex = utf16beHex(ch);
        return '<' + hex + '> <' + hex + '>';
      }).join('\n') + '\nendbfchar');
    }
    return [
      '/CIDInit /ProcSet findresource begin',
      '12 dict begin',
      'begincmap',
      '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
      '/CMapName /Adobe-Identity-UCS def',
      '/CMapType 2 def',
      '1 begincodespacerange',
      '<0000> <FFFF>',
      'endcodespacerange',
      blocks.join('\n'),
      'endcmap',
      'CMapName currentdict /CMap defineresource pop',
      'end',
      'end'
    ].join('\n');
  }

  function buildPdf(record) {
    const lines = buildLines(record);
    const pages = paginate(lines);
    const uniqueChars = new Set();
    const pageStreams = pages.map(function (pageLines, index) {
      return contentStream(pageLines, index, pages.length, uniqueChars);
    });
    const objects = [];
    function add(value) {
      objects.push(value);
      return objects.length;
    }
    const catalogId = add('<< /Type /Catalog /Pages 2 0 R >>');
    const pagesId = add('');
    const fontId = add('<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 5 0 R >>');
    const cidFontId = add('<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> >>');
    const cmap = buildToUnicodeCMap(uniqueChars);
    const cmapId = add('<< /Length ' + cmap.length + ' >>\nstream\n' + cmap + '\nendstream');
    const pageIds = [];
    pageStreams.forEach(function (stream) {
      const contentId = add('<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
      const pageId = add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_WIDTH.toFixed(2) + ' ' + PAGE_HEIGHT.toFixed(2) + '] /Resources << /Font << /F1 ' + fontId + ' 0 R >> >> /Contents ' + contentId + ' 0 R >>');
      pageIds.push(pageId);
    });
    objects[pagesId - 1] = '<< /Type /Pages /Kids [' + pageIds.map(function (id) { return id + ' 0 R'; }).join(' ') + '] /Count ' + pageIds.length + ' >>';
    void catalogId;
    void cidFontId;
    void cmapId;
    let body = '%PDF-1.7\n% car-buying-calculator\n';
    const offsets = [0];
    objects.forEach(function (object, index) {
      offsets.push(body.length);
      body += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
    });
    const xrefOffset = body.length;
    body += 'xref\n0 ' + (objects.length + 1) + '\n';
    body += '0000000000 65535 f \n';
    for (let i = 1; i <= objects.length; i += 1) {
      body += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    body += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R /Info << /Title ' + pdfString('Car buying quote report') + ' /Creator ' + pdfString('car-buying-calculator') + ' >> >>\n';
    body += 'startxref\n' + xrefOffset + '\n%%EOF';
    return body;
  }

  function buildReportPdfBlob(record) {
    return new Blob([buildPdf(record)], { type: 'application/pdf' });
  }

  return {
    buildLines: buildLines,
    buildPdf: buildPdf,
    buildReportPdfBlob: buildReportPdfBlob
  };
});
