const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);

const configPath = path.join(__dirname, '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

if (args.length < 1) {
  console.error('Usage: node processor.js <URL>');
};

function comparison(url) {

};