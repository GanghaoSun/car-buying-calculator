(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CarCalcSchema = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CURRENT_SCHEMA_VERSION = '1.7.0';
  const CURRENT_RECORD_VERSION = 2;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makeId(prefix) {
    const now = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return (prefix || 'quote') + '-' + now + '-' + random;
  }

  function normalizeEvidenceRefs(value) {
    return (Array.isArray(value) ? value : []).map(function (item) {
      if (!item || typeof item !== 'object') return null;
      return {
        id: String(item.id || ''),
        name: String(item.name || '本地证据'),
        kind: String(item.kind || 'quote'),
        type: String(item.type || 'application/octet-stream'),
        size: Number(item.size || 0),
        addedAt: String(item.addedAt || '')
      };
    }).filter(Boolean);
  }

  function migrateRecord(input, index) {
    if (!input || typeof input !== 'object') return null;
    const record = clone(input);
    const originalVersion = String(record.schemaVersion || '1.0.0');
    record.recordVersion = CURRENT_RECORD_VERSION;
    record.schemaVersion = CURRENT_SCHEMA_VERSION;
    record.id = Number(record.id) || makeId('record');
    record.dealership = String(record.dealership || '导入记录');
    record.model = String(record.model || '');
    record.note = String(record.note || '');
    record.savedAt = String(record.savedAt || new Date().toLocaleString('zh-CN'));
    record.updatedAt = String(record.updatedAt || new Date().toISOString());
    record.sourceQuote = record.sourceQuote && typeof record.sourceQuote === 'object'
      ? record.sourceQuote
      : null;
    record.evidenceRefs = normalizeEvidenceRefs(record.evidenceRefs);
    record.migration = originalVersion === CURRENT_SCHEMA_VERSION
      ? (record.migration || null)
      : { from: originalVersion, migratedAt: new Date().toISOString(), index: Number(index || 0) };
    return record;
  }

  function buildSharePayload(result) {
    if (!result || typeof result !== 'object') return null;
    const payload = clone(result);
    delete payload.processText;
    delete payload.evidenceRefs;
    delete payload.migration;
    delete payload.savedAt;
    delete payload.updatedAt;
    delete payload.dealership;
    delete payload.model;
    delete payload.note;
    delete payload.id;
    return {
      app: 'car-buying-calculator',
      version: CURRENT_SCHEMA_VERSION,
      sharedAt: new Date().toISOString(),
      result: payload
    };
  }

  return {
    CURRENT_SCHEMA_VERSION: CURRENT_SCHEMA_VERSION,
    CURRENT_RECORD_VERSION: CURRENT_RECORD_VERSION,
    makeId: makeId,
    migrateRecord: migrateRecord,
    normalizeEvidenceRefs: normalizeEvidenceRefs,
    buildSharePayload: buildSharePayload
  };
});
