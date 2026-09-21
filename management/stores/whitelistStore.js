'use strict';
const fs = require('fs');
const path = require('path');

const WHITELIST_PATH = path.join(__dirname, '..', '..', 'whitelist.json');

function readSitesFromDisk() {
  if (!fs.existsSync(WHITELIST_PATH)) return [];
  const raw = JSON.parse(fs.readFileSync(WHITELIST_PATH, 'utf-8'));
  return Array.isArray(raw.sites) ? raw.sites : [];
}

async function writeSitesToDisk(sites) {
  await fs.promises.writeFile(WHITELIST_PATH, `${JSON.stringify({ sites }, null, 4)}\n`, 'utf-8');
}

// Same in-memory-cache-plus-serialized-write shape as blocklistStore, since
// has() sits on the hot request path (checked before every fingerprint
// comparison) and writes only ever come from the admin panel.
let cachedSites = null;
let pendingWrite = Promise.resolve();

function loadCache() {
  if (!cachedSites) {
    cachedSites = new Set(readSitesFromDisk());
  }
  return cachedSites;
}

function persist() {
  const snapshot = Array.from(cachedSites);
  const result = pendingWrite.catch(() => {}).then(() => writeSitesToDisk(snapshot));
  pendingWrite = result;
  result.catch((error) => {
    console.error(`Failed to persist whitelist: ${error.message}`);
  });
  return result;
}

async function list() {
  return Array.from(loadCache());
}

function has(site) {
  return loadCache().has(site);
}

async function add(site) {
  if (!site || typeof site !== 'string') throw new Error('A site is required.');
  const sites = loadCache();
  if (sites.has(site)) throw new Error(`"${site}" is already on the whitelist.`);
  sites.add(site);
  await persist();
}

async function remove(site) {
  const sites = loadCache();
  if (!sites.has(site)) throw new Error(`"${site}" is not on the whitelist.`);
  sites.delete(site);
  await persist();
}

module.exports = { list, has, add, remove, WHITELIST_PATH };
