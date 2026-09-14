const fs = require('node:fs');
const path = require('node:path');

const configPath = path.join(__dirname, '..', 'config.json');

function fingerprintsDirectory() {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return path.resolve(__dirname, '..', config.app?.Fingerprints?.db?.foldername || 'fingerprints');
}

async function removeNonJavaScriptFiles(directory) {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  let javascriptFileCount = 0;

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      javascriptFileCount += await removeNonJavaScriptFiles(entryPath);
      const remainingEntries = await fs.promises.readdir(entryPath);
      if (remainingEntries.length === 0) {
        await fs.promises.rmdir(entryPath);
      }
      continue;
    }

    if (path.extname(entry.name).toLowerCase() === '.js') {
      javascriptFileCount += 1;
    } else {
      await fs.promises.unlink(entryPath);
    }
  }

  return javascriptFileCount;
}

/**
 * Scrapes `url`, keeps only the .js files it finds, and stores them under
 * the configured fingerprints folder as a new fingerprint named `name`.
 * Shared by the CLI below and the management server's "new fingerprint"
 * action.
 */
async function createFingerprint(url, name) {
  if (!url) {
    throw new Error('A source URL is required.');
  }
  if (!name || name === '.' || name === '..' || path.basename(name) !== name) {
    throw new Error('Fingerprint name must be a single directory name.');
  }

  const outputDirectory = path.resolve(fingerprintsDirectory(), name);
  const { default: scrape } = await import('website-scraper');

  await fs.promises.rm(outputDirectory, { recursive: true, force: true });

  await scrape({
    urls: [url],
    directory: outputDirectory,
    sources: [{ selector: 'script', attr: 'src' }],
    recursive: false,
    request: {
      timeout: {
        request: 15000
      }
    },
    requestConcurrency: 5
  });

  const javascriptFileCount = await removeNonJavaScriptFiles(outputDirectory);
  if (javascriptFileCount === 0) {
    await fs.promises.rm(outputDirectory, { recursive: true, force: true });
    throw new Error('The website does not contain any .js files.');
  }

  return { name, fileCount: javascriptFileCount };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node fingerprintMaker.js <website URL To Clone> <fingerprint name>');
    process.exit(1);
  }

  const result = await createFingerprint(args[0], args[1]);
  console.log(`Saved ${result.fileCount} JavaScript file(s) from ${args[0]}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error creating fingerprint: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createFingerprint };
