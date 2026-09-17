'use strict';
const fs = require('fs');
const path = require('path');

const BLOCKLIST_PATH = path.join(__dirname, '..', '..', 'blocklist.json');

function readSitesFromDisk() {
  if (!fs.existsSync(BLOCKLIST_PATH)) return [];
  const raw = JSON.parse(fs.readFileSync(BLOCKLIST_PATH, 'utf-8'));
  return Array.isArray(raw.sites) ? raw.sites : [];
}

async function writeSitesToDisk(sites) {
  await fs.promises.writeFile(BLOCKLIST_PATH, `${JSON.stringify({ sites }, null, 4)}\n`, 'utf-8');
}

// In-memory copy so add() (called on the hot request path whenever a match
// is found) never has to hit disk to check membership. Writes are queued
// and serialized so concurrent matches can't race each other's read-modify-write.
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
  // Recover from a prior failed write so one bad write doesn't permanently
  // block every write queued after it.
  const result = pendingWrite.catch(() => {}).then(() => writeSitesToDisk(snapshot));
  pendingWrite = result;
  result.catch((error) => {
    console.error(`Failed to persist blocklist: ${error.message}`);
  });
  return result;
}

function add(site) {
  const sites = loadCache();
  if (sites.has(site)) return Promise.resolve();
  sites.add(site);
  return persist();
}

async function list() {
  return Array.from(loadCache());
}

async function remove(site) {
  const sites = loadCache();
  if (!sites.has(site)) throw new Error(`"${site}" is not on the blocklist.`);
  sites.delete(site);
  await persist();
}

module.exports = { add, list, remove, BLOCKLIST_PATH };
