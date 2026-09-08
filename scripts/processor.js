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

function diceCoefficient(left, right) {
  const leftTokens = getTokens(left);
  const rightTokens = getTokens(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;

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

async function loadFingerprints() {
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
      content
    });
  }

  return fingerprints;
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

async function comparison(url) {
  try {
    const normalizedUrl = normalizeUrl(url);
    const targetScripts = await collectUrlScripts(normalizedUrl);
    const targetScriptText = targetScripts.join('\n');

    if (!targetScriptText.trim()) {
      return false;
    }

    const fingerprints = await loadFingerprints();

    if (fingerprints.length === 0) {
      return false;
    }

    let bestScore = 0;

    for (const fingerprint of fingerprints) {
      const score = diceCoefficient(targetScriptText, fingerprint.content) * 100;

      if (score > bestScore) {
        bestScore = score;
      }
    }

    return bestScore >= minimumConfidence;
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

module.exports = { comparison };