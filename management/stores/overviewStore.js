'use strict';
const fs = require('fs');
const path = require('path');
const configStore = require('./configStore');
const groupsStore = require('./groupsStore');
const fingerprintsStore = require('./fingerprintsStore');

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
  const [groups, fingerprints] = await Promise.all([groupsStore.list(), fingerprintsStore.list()]);
  const reports = readReports();
  const domainCount = groups.reduce((sum, group) => sum + group.domainCount, 0);

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
    groups: { count: groups.length, domainCount },
    reports,
  };
}

module.exports = { build };
