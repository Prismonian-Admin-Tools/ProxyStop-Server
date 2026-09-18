'use strict';
const fs = require('fs');
const path = require('path');
const configStore = require('./configStore');

const NAME_PATTERN = /^[A-Za-z0-9 _-]{1,64}$/;

function fingerprintsDir() {
  const config = configStore.get();
  const folderName = config.app?.Fingerprints?.db?.foldername || 'fingerprints';
  return path.resolve(__dirname, '..', '..', folderName);
}

function resolveFingerprintPath(name) {
  if (!name || !NAME_PATTERN.test(name)) {
    throw new Error('Fingerprint name must be 1-64 letters, numbers, spaces, - or _.');
  }
  return path.join(fingerprintsDir(), name);
}

async function inspect(directory) {
  let count = 0;
  let bytes = 0;
  let latestMtime = 0;
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await inspect(entryPath);
      count += nested.count;
      bytes += nested.bytes;
      latestMtime = Math.max(latestMtime, nested.latestMtime);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.js')) {
      const stat = await fs.promises.stat(entryPath);
      count += 1;
      bytes += stat.size;
      latestMtime = Math.max(latestMtime, stat.mtimeMs);
    }
  }

  return { count, bytes, latestMtime };
}

async function list() {
  const dir = fingerprintsDir();
  if (!fs.existsSync(dir)) return [];
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  return Promise.all(names.map(async (name) => {
    const stats = await inspect(path.join(dir, name));
    return {
      name,
      fileCount: stats.count,
      totalBytes: stats.bytes,
      updatedAt: stats.latestMtime ? new Date(stats.latestMtime).toISOString() : null,
    };
  }));
}

async function listFiles(name) {
  const target = resolveFingerprintPath(name);
  if (!fs.existsSync(target)) throw new Error(`Fingerprint "${name}" does not exist.`);

  async function walk(directory, prefix) {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    let out = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        out = out.concat(await walk(path.join(directory, entry.name), `${prefix}${entry.name}/`));
      } else {
        out.push(`${prefix}${entry.name}`);
      }
    }
    return out;
  }

  return walk(target, '');
}

async function remove(name) {
  const target = resolveFingerprintPath(name);
  if (!fs.existsSync(target)) throw new Error(`Fingerprint "${name}" does not exist.`);
  await fs.promises.rm(target, { recursive: true, force: true });
  require('../../scripts/processor').invalidateFingerprintCache();
}

async function createFromUrl(name, url) {
  resolveFingerprintPath(name); // validates the name before we touch the network
  const { createFingerprint } = require('../../scripts/fingerprintMaker');
  const result = await createFingerprint(url, name);
  require('../../scripts/processor').invalidateFingerprintCache();
  return result;
}

module.exports = { list, listFiles, remove, createFromUrl, fingerprintsDir };
