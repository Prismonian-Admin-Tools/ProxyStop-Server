const args = process.argv.slice(2);
const scrape = require('website-scraper');

if (args.length < 1) {
  console.error('Usage: node fingerprintMaker.js <website URL To Clone>');
  process.exit(1);
}

const options = {
  urls: [args[0]],
  directory: './downloaded-website', // Where files will save
  recursive: true,
  maxRecursiveDepth: 3, // How deep to follow links
  requestConcurrency: 5 // Avoid overwhelming the server
};
//TODO: Parse config.json for these options instead of hardcoding them.

scrape(options).then((result) => {
  console.log(`Website cloned successfully: ${websiteUrl}`);
}).catch((error) => {
  console.error(`Error cloning website: ${error}`);
});
