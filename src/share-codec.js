(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CarCalcShare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function bytesToBase64Url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function base64UrlToBytes(value) {
    const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(value || '').length + 3) % 4);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function encodeText(text) {
    return new TextEncoder().encode(text);
  }

  function decodeText(bytes) {
    return new TextDecoder().decode(bytes);
  }

  async function gzip(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function gunzip(bytes) {
    if (typeof DecompressionStream === 'undefined') return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function encode(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    const source = encodeText(text);
    const compressed = await gzip(source);
    if (compressed) return 'gz.' + bytesToBase64Url(compressed);
    return 'raw.' + bytesToBase64Url(source);
  }

  async function decode(value) {
    const raw = String(value || '');
    if (raw.indexOf('gz.') === 0) {
      const decompressed = await gunzip(base64UrlToBytes(raw.slice(3)));
      if (!decompressed) throw new Error('当前浏览器不支持解压分享数据');
      return JSON.parse(decodeText(decompressed));
    }
    if (raw.indexOf('raw.') === 0) return JSON.parse(decodeText(base64UrlToBytes(raw.slice(4))));
    return decodeLegacy(raw);
  }

  function decodeLegacy(value) {
    const binary = atob(value);
    const encoded = Array.prototype.map.call(binary, function (char) {
      return '%' + ('00' + char.charCodeAt(0).toString(16)).slice(-2);
    }).join('');
    return JSON.parse(decodeURIComponent(encoded));
  }

  return {
    encode: encode,
    decode: decode,
    decodeLegacy: decodeLegacy,
    bytesToBase64Url: bytesToBase64Url,
    base64UrlToBytes: base64UrlToBytes
  };
});
