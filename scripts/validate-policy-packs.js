const fs = require('node:fs');
const path = require('node:path');
const engine = require('../src/quote-engine.js');

const root = path.resolve(__dirname, '..');
const files = [
  path.join(root, 'data', 'policy.json')
];
const packsDir = path.join(root, 'data', 'policy-packs');

if (fs.existsSync(packsDir)) {
  fs.readdirSync(packsDir)
    .filter((name) => name.endsWith('.json'))
    .forEach((name) => files.push(path.join(packsDir, name)));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function validateOfficialSources(profile, file) {
  if (!Array.isArray(profile.sources) || profile.sources.length === 0) {
    throw new Error(`${file} 缺少 sources 官方来源列表。`);
  }
  profile.sources.forEach((source, index) => {
    if (!source || !source.name || !source.url) {
      throw new Error(`${file} sources[${index}] 缺少 name 或 url。`);
    }
    if (!/^https:\/\/[^ ]+\.[^ ]+/.test(source.url)) {
      throw new Error(`${file} sources[${index}] 不是有效 HTTPS 官方入口：${source.url}`);
    }
    if (/example\./i.test(source.url)) {
      throw new Error(`${file} sources[${index}] 仍是示例 URL，不能作为已核验政策包发布。`);
    }
  });
}

function validateDateOrder(profile, file) {
  const from = new Date(profile.effectiveFrom);
  const to = new Date(profile.effectiveTo);
  const verified = new Date(profile.lastVerifiedAt || profile.updatedAt);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    throw new Error(`${file} 有效期不是有效日期。`);
  }
  if (from > to) throw new Error(`${file} effectiveFrom 晚于 effectiveTo。`);
  if (!Number.isFinite(verified.getTime())) throw new Error(`${file} lastVerifiedAt/updatedAt 不是有效日期。`);
}

function validateFile(file) {
  const profile = readJson(file);
  const result = engine.validatePolicyProfile(profile);
  if (!result.valid) throw new Error(`${file} ${result.message}`);
  validateOfficialSources(profile, file);
  validateDateOrder(profile, file);
  return profile.name;
}

const validated = files.map(validateFile);
process.stdout.write(`policy packs validated: ${validated.join(', ')}\n`);
