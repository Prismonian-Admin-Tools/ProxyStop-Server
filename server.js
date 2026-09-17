require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('node:path');
const fs = require('node:fs');

const proc = require('./scripts/processor.js');
const configStore = require('./management/stores/configStore');
const blocklistStore = require('./management/stores/blocklistStore');
const { managementRouter } = require('./management/router');

const publicDirectory = path.join(__dirname, 'public');
const reportsPath = path.join(__dirname, 'reports.txt');

const app = express();

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/health', (req, res) => res.send('ok'));

// Below comment demonstrates the request format. Hope this helps :D
// Request format: proxystop.example.com/api/student?website=example.com?group=groupname
app.get('/api/*', async (req, res) => {
  const requestedUrl = req.query.url;
  const isMatch = await proc.comparison(requestedUrl);

  if (isMatch) {
    const config = configStore.get();
    const entryFormat = config.app?.Fingerprints?.ReportsParams?.entryFormat || '\n{url}';
    await fs.promises.appendFile(reportsPath, entryFormat.replace('{url}', requestedUrl), 'utf8');
    // Fire-and-forget: persists in the background so it never adds latency
    // to the response, and blocklistStore already logs its own failures.
    blocklistStore.add(requestedUrl);
    return res.type('text/plain').send('true');
  }

  res.type('text/plain').send('false');
});

app.use('/manage', (req, res, next) => {
  if (!configStore.get().app?.managementServer?.enabled) {
    return res.status(403).send('Management server is disabled. Please contact your system administrators if you believe this is a mistake.');
  }
  next();
});
app.use(
  '/manage',
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    name: 'proxystop.manage.sid',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 12, secure: 'auto' },
  })
);
app.use('/manage/api', managementRouter());
app.use('/manage', express.static(path.join(__dirname, 'management', 'public')));
app.get('/manage*', (req, res) => res.sendFile(path.join(__dirname, 'management', 'public', 'index.html')));

app.use(express.static(publicDirectory));

const { host, port } = configStore.get().Host;
app.listen(port, host, () => {
  console.log(`Application listening at http://${host}:${port}`);
});
