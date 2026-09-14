'use strict';
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');

// Whitelisted config fields the management API is allowed to read/write,
// with the type each is coerced to. Anything not listed here is left
// untouched on disk — the admin panel can never write arbitrary JSON.
const FIELD_TYPES = {
  'Host.port': 'number',
  'Host.host': 'string',
  'app.Fingerprints.db.foldername': 'string',
  'app.Fingerprints.db.reloadInterval': 'number',
  'app.Fingerprints.db.minimumConfidence': 'number',
  'app.Fingerprints.Params.fingerprint-method': 'string',
  'app.Fingerprints.ReportsParams.blankContents': 'string',
  'app.Fingerprints.ReportsParams.entryFormat': 'string',
  'app.Fingerprints.ReportsParams.reportExpiry': 'boolean',
  'app.Scraper.recursive': 'boolean',
  'app.Scraper.maxDepth': 'number',
  'app.Scraper.maxPages': 'number',
  'app.managementServer.enabled': 'boolean',
};

function getAtPath(obj, dottedPath) {
  return dottedPath.split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj);
}

function setAtPath(obj, dottedPath, value) {
  const keys = dottedPath.split('.');
  let node = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof node[keys[i]] !== 'object' || node[keys[i]] === null) node[keys[i]] = {};
    node = node[keys[i]];
  }
  node[keys[keys.length - 1]] = value;
}

function coerce(dottedPath, rawValue) {
  const type = FIELD_TYPES[dottedPath];
  if (type === 'number') {
    const num = Number(rawValue);
    if (!Number.isFinite(num)) throw new Error(`${dottedPath} must be a number`);
    return num;
  }
  if (type === 'boolean') return Boolean(rawValue);
  return String(rawValue);
}

function readFromDisk() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

let cached = readFromDisk();

function get() {
  return cached;
}

function getEditable() {
  const out = {};
  for (const dottedPath of Object.keys(FIELD_TYPES)) setAtPath(out, dottedPath, getAtPath(cached, dottedPath));
  return out;
}

async function update(patch) {
  const next = JSON.parse(JSON.stringify(cached));
  for (const dottedPath of Object.keys(FIELD_TYPES)) {
    const value = getAtPath(patch, dottedPath);
    if (value === undefined) continue;
    setAtPath(next, dottedPath, coerce(dottedPath, value));
  }
  await fs.promises.writeFile(CONFIG_PATH, `${JSON.stringify(next, null, 4)}\n`, 'utf-8');
  cached = next;
  return getEditable();
}

function reload() {
  cached = readFromDisk();
  return cached;
}

module.exports = { get, getEditable, update, reload, CONFIG_PATH };
