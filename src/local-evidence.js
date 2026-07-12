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

  function digestBuffer(buffer) {
    if (!buffer || !globalThis.crypto || !crypto.subtle) return Promise.resolve('');
    return crypto.subtle.digest('SHA-256', buffer)
      .then(function (hash) {
        return Array.from(new Uint8Array(hash)).map(function (item) { return item.toString(16).padStart(2, '0'); }).join('');
      }).catch(function () { return ''; });
  }

  function readFileBuffer(file) {
    if (!file || !file.arrayBuffer) return Promise.reject(new Error('当前浏览器无法读取该证据文件。'));
    return file.arrayBuffer();
  }

  function hydrate(item) {
    if (!item) return null;
    const copy = Object.assign({}, item);
    if (!copy.blob && copy.data && typeof Blob !== 'undefined') {
      copy.blob = new Blob([copy.data], { type: copy.type || 'application/octet-stream' });
    }
    return copy;
  }

  function digest(file) {
    if (!file || !file.arrayBuffer || !globalThis.crypto || !crypto.subtle) return Promise.resolve('');
    return readFileBuffer(file).then(function (buffer) {
      return crypto.subtle.digest('SHA-256', buffer);
    }).then(function (hash) {
      return Array.from(new Uint8Array(hash)).map(function (item) { return item.toString(16).padStart(2, '0'); }).join('');
    }).catch(function () { return ''; });
  }

  function add(quoteId, file, options) {
    const settings = options || {};
    if (!file) return Promise.reject(new Error('没有可保存的文件。'));
    return Promise.all([openDb(), readFileBuffer(file)]).then(function (values) {
      const db = values[0];
      const buffer = values[1];
      return digestBuffer(buffer).then(function (hash) {
        const item = {
          id: (typeof CarCalcSchema !== 'undefined' && CarCalcSchema.makeId ? CarCalcSchema.makeId('evidence') : 'evidence-' + Date.now() + '-' + Math.random().toString(36).slice(2)),
          quoteId: String(quoteId || ''),
          name: String(file.name || '本地证据'),
          type: String(file.type || 'application/octet-stream'),
          size: Number(file.size || buffer.byteLength || 0),
          kind: String(settings.kind || 'quote'),
          note: String(settings.note || ''),
          addedAt: new Date().toISOString(),
          hash: hash,
          data: buffer
        };
        return new Promise(function (resolve, reject) {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put(item);
          tx.oncomplete = function () { db.close(); resolve(summarize(item)); };
          tx.onerror = function () { db.close(); reject(tx.error || new Error('证据保存失败。')); };
        });
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
        request.onsuccess = function () { db.close(); resolve(hydrate(request.result)); };
        request.onerror = function () { db.close(); reject(request.error); };
      });
    });
  }

  function all() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
        request.onsuccess = function () { db.close(); resolve((request.result || []).map(hydrate)); };
        request.onerror = function () { db.close(); reject(request.error); };
      });
    });
  }

  function put(item) {
    if (!item || !item.id || (!item.blob && !item.data)) return Promise.reject(new Error('备份证据数据不完整。'));
    const dataPromise = item.data ? Promise.resolve(item.data) : readFileBuffer(item.blob);
    return Promise.all([openDb(), dataPromise]).then(function (values) {
      const db = values[0];
      const data = values[1];
      const restored = {
        id: String(item.id),
        quoteId: String(item.quoteId || ''),
        name: String(item.name || '本地证据'),
        type: String(item.type || (item.blob && item.blob.type) || 'application/octet-stream'),
        size: Number(item.size || (item.blob && item.blob.size) || data.byteLength || 0),
        kind: String(item.kind || 'quote'),
        note: String(item.note || ''),
        addedAt: String(item.addedAt || new Date().toISOString()),
        hash: String(item.hash || ''),
        data: data
      };
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(restored);
        tx.oncomplete = function () { db.close(); resolve(summarize(restored)); };
        tx.onerror = function () { db.close(); reject(tx.error || new Error('证据恢复失败。')); };
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

  function clear() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = function () { db.close(); resolve(true); };
        tx.onerror = function () { db.close(); reject(tx.error || new Error('本地证据清理失败。')); };
      });
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
    all: all,
    put: put,
    remove: remove,
    removeQuote: removeQuote,
    clear: clear,
    toObjectUrl: toObjectUrl
  };
});
