'use strict';
const fs = require('fs');
const path = require('path');

const WHITELIST_PATH = path.join(__dirname, '..', '..', 'whitelist.json');
const NAME_PATTERN = /^[A-Za-z0-9 _-]{1,64}$/;
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

function readFromDisk() {
  if (!fs.existsSync(WHITELIST_PATH)) return { groups: {} };
  const raw = JSON.parse(fs.readFileSync(WHITELIST_PATH, 'utf-8'));
  const groups = {};
  for (const [name, domains] of Object.entries(raw.groups || {})) {
    // Older files store each domain as its own single-element array
    // ([["a.com"], ["b.com"]]) — flatten that down to plain strings.
    groups[name] = (domains || []).map((entry) => (Array.isArray(entry) ? entry[0] : entry)).filter(Boolean);
  }
  return { groups };
}

async function writeToDisk(data) {
  await fs.promises.writeFile(WHITELIST_PATH, `${JSON.stringify(data, null, 4)}\n`, 'utf-8');
}

function assertName(name) {
  if (!name || !NAME_PATTERN.test(name)) {
    throw new Error('Group name must be 1-64 letters, numbers, spaces, - or _.');
  }
}

function normalizeDomain(domain) {
  const trimmed = String(domain || '').trim().toLowerCase();
  if (!DOMAIN_PATTERN.test(trimmed)) throw new Error(`"${domain}" is not a valid domain name.`);
  return trimmed;
}

async function list() {
  const { groups } = readFromDisk();
  return Object.entries(groups).map(([name, domains]) => ({ name, domains, domainCount: domains.length }));
}

async function create(name) {
  assertName(name);
  const data = readFromDisk();
  if (data.groups[name]) throw new Error(`Group "${name}" already exists.`);
  data.groups[name] = [];
  await writeToDisk(data);
  return { name, domains: [] };
}

async function rename(name, newName) {
  assertName(newName);
  const data = readFromDisk();
  if (!data.groups[name]) throw new Error(`Group "${name}" does not exist.`);
  if (newName !== name && data.groups[newName]) throw new Error(`Group "${newName}" already exists.`);
  const domains = data.groups[name];
  delete data.groups[name];
  data.groups[newName] = domains;
  await writeToDisk(data);
  return { name: newName, domains };
}

async function remove(name) {
  const data = readFromDisk();
  if (!data.groups[name]) throw new Error(`Group "${name}" does not exist.`);
  delete data.groups[name];
  await writeToDisk(data);
}

async function addDomain(name, domain) {
  const clean = normalizeDomain(domain);
  const data = readFromDisk();
  if (!data.groups[name]) throw new Error(`Group "${name}" does not exist.`);
  if (!data.groups[name].includes(clean)) data.groups[name].push(clean);
  await writeToDisk(data);
  return { name, domains: data.groups[name] };
}

async function addDomains(name, domains) {
  const data = readFromDisk();
  if (!data.groups[name]) throw new Error(`Group "${name}" does not exist.`);
  const clean = domains.map(normalizeDomain);
  for (const domain of clean) {
    if (!data.groups[name].includes(domain)) data.groups[name].push(domain);
  }
  await writeToDisk(data);
  return { name, domains: data.groups[name] };
}

async function removeDomain(name, domain) {
  const data = readFromDisk();
  if (!data.groups[name]) throw new Error(`Group "${name}" does not exist.`);
  data.groups[name] = data.groups[name].filter((d) => d !== domain);
  await writeToDisk(data);
  return { name, domains: data.groups[name] };
}

module.exports = { list, create, rename, remove, addDomain, addDomains, removeDomain };
