const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const configPath = path.join(__dirname, '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const fingerprintsDirectory = path.resolve(
  __dirname,
  '..',
  config.app?.Fingerprints?.db?.foldername || 'fingerprints'
);
const minimumConfidence = Number(
  config.app?.Fingerprints?.db?.minimumConfidence ?? 70
);
const fingerprintReloadIntervalMs = Number(
  config.app?.Fingerprints?.db?.reloadInterval ?? 60000
);

const RESULT_CACHE_MAX_ENTRIES = 5000;
const RESULT_CACHE_TTL_MS = 10 * 60 * 1000;

function normalizeUrl(url) {
  if (!url) {
    throw new Error('No URL was provided for comparison.');
  }

  const trimmedUrl = url.trim();

  if (/^https?:\/\//i.test(trimmedUrl)) {
    return trimmedUrl;
  }

  return `https://${trimmedUrl}`;
}

function getTokens(input) {
  return String(input || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function tokenSetOf(input) {
  return new Set(getTokens(input));
}

// Iterates the smaller set so the cost scales with min(|a|, |b|) instead of
// always walking the target's tokens.
function diceScoreFromSets(leftSet, rightSet) {
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }

  const [smaller, larger] = leftSet.size <= rightSet.size ? [leftSet, rightSet] : [rightSet, leftSet];
  let intersection = 0;
  for (const token of smaller) {
    if (larger.has(token)) intersection++;
  }

  if (intersection === 0) {
    return 0;
  }

  return (2 * intersection) / (leftSet.size + rightSet.size);
}

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'ProxyStop-Server/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status} for ${url}`);
  }

  return response.text();
}

function extractScriptSources(html) {
  const scriptRegex = /<script[^>]*src=["']([^"']+)["'][^>]*>/gi;
  const matches = [...html.matchAll(scriptRegex)];

  return matches
    .map((match) => match[1])
    .filter((src) => Boolean(src));
}

async function collectUrlScripts(url) {
  const pageHtml = await fetchText(url);
  const scriptSources = extractScriptSources(pageHtml);

  if (scriptSources.length === 0) {
    return [];
  }

  const scripts = await Promise.all(
    scriptSources.map(async (src) => {
      try {
        const resolvedUrl = new URL(src, url).toString();
        const scriptText = await fetchText(resolvedUrl);
        return scriptText;
      } catch (error) {
        return '';
      }
    })
  );

  return scripts.filter((scriptText) => scriptText && scriptText.trim().length > 0);
}

async function gatherJavaScriptFiles(directory) {
  const entries = await fs.promises.readdir(directory, {
    withFileTypes: true
  });

  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      const nestedFiles = await gatherJavaScriptFiles(entryPath);
      files.push(...nestedFiles);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.js')) {
      const content = await fs.promises.readFile(entryPath, 'utf-8');
      files.push({ path: entryPath, content });
    }
  }

  return files;
}

async function loadFingerprintsFromDisk() {
  if (!fs.existsSync(fingerprintsDirectory)) {
    return [];
  }

  const entries = await fs.promises.readdir(fingerprintsDirectory, {
    withFileTypes: true
  });

  const fingerprintDirectories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const fingerprints = [];

  for (const folderName of fingerprintDirectories) {
    const fingerprintPath = path.join(fingerprintsDirectory, folderName);
    const files = await gatherJavaScriptFiles(fingerprintPath);

    if (files.length === 0) {
      continue;
    }

    const content = files.map((file) => file.content).join('\n');

    fingerprints.push({
      name: folderName,
      tokenSet: tokenSetOf(content)
    });
  }

  return fingerprints;
}

// The fingerprint DB rarely changes, so it's loaded once and kept in memory
// (with token sets precomputed) instead of re-reading and re-tokenizing
// every file on every comparison. It's refreshed lazily, at most once every
// `reloadInterval` ms, and can be forced immediately via
// invalidateFingerprintCache() when the management panel edits fingerprints.
let fingerprintCache = { entries: [], loadedAt: 0 };
let fingerprintLoadPromise = null;

async function getFingerprintEntries() {
  const isStale = Date.now() - fingerprintCache.loadedAt >= fingerprintReloadIntervalMs;

  if (!isStale) {
    return fingerprintCache.entries;
  }

  if (!fingerprintLoadPromise) {
    fingerprintLoadPromise = loadFingerprintsFromDisk()
      .then((entries) => {
        fingerprintCache = { entries, loadedAt: Date.now() };
        return entries;
      })
      .finally(() => {
        fingerprintLoadPromise = null;
      });
  }

  return fingerprintLoadPromise;
}

function invalidateFingerprintCache() {
  fingerprintCache = { entries: [], loadedAt: 0 };
}

// Repeat lookups for the same site (very common for a filtering proxy) are
// served from this cache instead of re-fetching and re-comparing.
const resultCache = new Map();

function getCachedResult(key) {
  const entry = resultCache.get(key);
  if (!entry) return undefined;

  if (Date.now() > entry.expiresAt) {
    resultCache.delete(key);
    return undefined;
  }

  // Bump recency for the LRU eviction below.
  resultCache.delete(key);
  resultCache.set(key, entry);
  return entry.result;
}

function setCachedResult(key, result) {
  resultCache.delete(key);
  resultCache.set(key, { result, expiresAt: Date.now() + RESULT_CACHE_TTL_MS });

  if (resultCache.size > RESULT_CACHE_MAX_ENTRIES) {
    const oldestKey = resultCache.keys().next().value;
    resultCache.delete(oldestKey);
  }
}

async function comparison(url) {
  let normalizedUrl;
  try {
    normalizedUrl = normalizeUrl(url);
  } catch (error) {
    console.error(`Comparison failed for ${url}: ${error.message}`);
    return false;
  }

  const cachedResult = getCachedResult(normalizedUrl);
  if (cachedResult !== undefined) {
    return cachedResult;
  }

  try {
    const targetScripts = await collectUrlScripts(normalizedUrl);
    const targetScriptText = targetScripts.join('\n');

    if (!targetScriptText.trim()) {
      setCachedResult(normalizedUrl, false);
      return false;
    }

    const fingerprints = await getFingerprintEntries();

    if (fingerprints.length === 0) {
      return false;
    }

    const targetTokenSet = tokenSetOf(targetScriptText);
    let bestScore = 0;

    for (const fingerprint of fingerprints) {
      const score = diceScoreFromSets(targetTokenSet, fingerprint.tokenSet) * 100;

      if (score > bestScore) {
        bestScore = score;
      }
    }

    const isMatch = bestScore >= minimumConfidence;
    setCachedResult(normalizedUrl, isMatch);
    return isMatch;
  } catch (error) {
    console.error(`Comparison failed for ${url}: ${error.message}`);
    return false;
  }
}

if (require.main === module) {
  if (args.length < 1) {
    console.error('Usage: node processor.js <URL>');
    process.exit(1);
  }

  comparison(args[0]).then((result) => {
    console.log(result ? 'true' : 'false');
  }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { comparison, invalidateFingerprintCache };
