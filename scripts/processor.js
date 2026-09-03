const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);

const configPath = path.join(__dirname, '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

if (args.length < 2) {
  console.error('Usage: node fingerprintMaker.js <website URL To Clone> <fingerprint name>');
  process.exit(1);
}

if (args[1] === '.' || args[1] === '..' || path.basename(args[1]) !== args[1]) {
  console.error('Fingerprint name must be a single directory name');
  process.exit(1);
}

const outputDirectory = path.resolve(__dirname, '..', config.app.Fingerprints.db.foldername, args[1]);

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

async function main() {
  const { default: scrape } = await import('website-scraper');

  await fs.promises.rm(outputDirectory, { recursive: true, force: true });

  await scrape({
    urls: [args[0]],
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
    throw new Error('The website does not contain any .js files');
  }

  console.log(`Saved ${javascriptFileCount} JavaScript file(s) from ${args[0]}`);
}

main().catch((error) => {
  console.error(`Error creating fingerprint: ${error.message}`);
  process.exitCode = 1;
});

