'use strict';
const fs = require('fs');
const path = require('path');
const configStore = require('./configStore');
const fingerprintsStore = require('./fingerprintsStore');
const blocklistStore = require('./blocklistStore');

const REPORTS_PATH = path.join(__dirname, '..', '..', 'reports.txt');

function readReports() {
  if (!fs.existsSync(REPORTS_PATH)) return { total: 0, recent: [] };
  const lines = fs.readFileSync(REPORTS_PATH, 'utf-8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^website reports list$/i.test(line) && !/^-+$/.test(line));
  return { total: lines.length, recent: lines.slice(-10).reverse() };
}

async function build() {
  const config = configStore.get();
  const [fingerprints, blocklist] = await Promise.all([fingerprintsStore.list(), blocklistStore.list()]);
  const reports = readReports();

  return {
    server: {
      host: config.Host?.host,
      port: config.Host?.port,
      uptimeSeconds: Math.round(process.uptime()),
      managementServerEnabled: !!config.app?.managementServer?.enabled,
    },
    fingerprints: {
      count: fingerprints.length,
      minimumConfidence: config.app?.Fingerprints?.db?.minimumConfidence ?? null,
    },
    blocklist: { count: blocklist.length },
    reports,
  };
}

module.exports = { build };
