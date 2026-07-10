(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CarCalcQR = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js';
  let loading = null;

  function load() {
    if (rootQRCode()) return Promise.resolve(rootQRCode());
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = function () {
        const api = rootQRCode();
        if (api) resolve(api); else reject(new Error('二维码运行库加载后不可用。'));
      };
      script.onerror = function () { reject(new Error('二维码运行库加载失败，请检查网络后重试。')); };
      document.head.appendChild(script);
    });
    return loading;
  }

  function rootQRCode() {
    return typeof QRCode !== 'undefined' ? QRCode : null;
  }

  async function toDataUrl(text, options) {
    const api = await load();
    return api.toDataURL(text, Object.assign({ errorCorrectionLevel: 'M', margin: 2, width: 320 }, options || {}));
  }

  return { load: load, toDataUrl: toDataUrl, scriptUrl: SCRIPT_URL };
});
