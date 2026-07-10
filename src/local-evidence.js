(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CarCalcEvidence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DB_NAME = 'car-calc-evidence-db';
  const DB_VERSION = 1;
  const STORE_NAME = 'evidence';

  function supported() {
    return typeof indexedDB !== 'undefined';
  }

  function openDb() {
    if (!supported()) return Promise.reject(new Error('当前浏览器不支持本地证据存储。'));
    return new Promise(function (resolve, reject) {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('quoteId', 'quoteId', { unique: false });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('无法打开本地证据存储。')); };
    });
  }

  function digest(file) {
    if (!file || !file.arrayBuffer || !globalThis.crypto || !crypto.subtle) return Promise.resolve('');
    return file.arrayBuffer().then(function (buffer) {
      return crypto.subtle.digest('SHA-256', buffer);
    }).then(function (hash) {
      return Array.from(new Uint8Array(hash)).map(function (item) { return item.toString(16).padStart(2, '0'); }).join('');
    }).catch(function () { return ''; });
  }

  function add(quoteId, file, options) {
    const settings = options || {};
    if (!file) return Promise.reject(new Error('没有可保存的文件。'));
    return Promise.all([openDb(), digest(file)]).then(function (values) {
      const db = values[0];
      const hash = values[1];
      const item = {
        id: (typeof CarCalcSchema !== 'undefined' && CarCalcSchema.makeId ? CarCalcSchema.makeId('evidence') : 'evidence-' + Date.now() + '-' + Math.random().toString(36).slice(2)),
        quoteId: String(quoteId || ''),
        name: String(file.name || '本地证据'),
        type: String(file.type || 'application/octet-stream'),
        size: Number(file.size || 0),
        kind: String(settings.kind || 'quote'),
        note: String(settings.note || ''),
        addedAt: new Date().toISOString(),
        hash: hash,
        blob: file
      };
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(item);
        tx.oncomplete = function () { db.close(); resolve(summarize(item)); };
        tx.onerror = function () { db.close(); reject(tx.error || new Error('证据保存失败。')); };
      });
    });
  }

  function summarize(item) {
    return {
      id: item.id,
      quoteId: item.quoteId,
      name: item.name,
      type: item.type,
      size: item.size,
      kind: item.kind,
      note: item.note,
      addedAt: item.addedAt,
      hash: item.hash || ''
    };
  }

  function list(quoteId) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).index('quoteId').getAll(String(quoteId || ''));
        request.onsuccess = function () { db.close(); resolve(request.result.map(summarize)); };
        request.onerror = function () { db.close(); reject(request.error); };
      });
    });
  }

  function get(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
        request.onsuccess = function () { db.close(); resolve(request.result || null); };
        request.onerror = function () { db.close(); reject(request.error); };
      });
    });
  }

  function remove(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = function () { db.close(); resolve(true); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    });
  }

  function removeQuote(quoteId) {
    return list(quoteId).then(function (items) {
      return Promise.all(items.map(function (item) { return remove(item.id); }));
    });
  }

  function toObjectUrl(item) {
    if (!item || !item.blob || typeof URL === 'undefined' || !URL.createObjectURL) return '';
    return URL.createObjectURL(item.blob);
  }

  return {
    supported: supported,
    add: add,
    list: list,
    get: get,
    remove: remove,
    removeQuote: removeQuote,
    toObjectUrl: toObjectUrl
  };
});
