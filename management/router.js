'use strict';
const express = require('express');
const gus = require('./gusClient');
const { requireAuth, requireManage } = require('./auth');
const configStore = require('./stores/configStore');
const groupsStore = require('./stores/groupsStore');
const fingerprintsStore = require('./stores/fingerprintsStore');
const overviewStore = require('./stores/overviewStore');

const KNOWN_ROLES = new Set(['owner', 'admin', 'moderator']);

function managementRouter() {
  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));

  /* ---------------- session (backed by GUS) ---------------- */

  router.post('/session/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    let result;
    try {
      result = await gus.login(username, password);
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }

    const { data, httpStatus } = result;
    if (data.status === 'invalid_app') {
      return res.status(500).json({ error: 'This server is not registered with GUS. Check GUS_APP_ID / GUS_APP_SECRET.' });
    }
    if (data.status === 'rate_limited') {
      res.set('Retry-After', String(data.retryAfterSeconds || 30));
      return res.status(429).json({ error: 'Too many attempts. Try again shortly.' });
    }
    if (data.status === 'bad') return res.status(401).json({ error: 'Incorrect username or password.' });
    if (data.status === 'disabled') return res.status(403).json({ error: 'This account has been disabled.' });
    if (data.status !== 'good' && data.status !== 'good_change_pw') {
      return res.status(httpStatus || 502).json({ error: 'Unexpected response from the authentication server.' });
    }
    if (!KNOWN_ROLES.has(data.user.role)) {
      return res.status(403).json({ error: 'Your GUS account role is not recognized by this application.' });
    }

    req.session.gusToken = data.token;
    req.session.user = data.user;
    req.session.validatedAt = Date.now();
    res.json({ profile: data.user, requirePasswordChange: data.status === 'good_change_pw', gusBaseUrl: (process.env.GUS_BASE_URL || '').replace(/\/+$/, '') });
  });

  router.get('/session', requireAuth(), (req, res) => {
    res.json({
      profile: req.session.user,
      requirePasswordChange: !!req.session.user.mustChangePassword,
      canManage: ['owner', 'admin'].includes(req.session.user.role),
      gusBaseUrl: (process.env.GUS_BASE_URL || '').replace(/\/+$/, ''),
    });
  });

  router.post('/session/logout', requireAuth(), async (req, res) => {
    try { await gus.logout(req.session.gusToken); } catch (err) { /* best-effort; still clear our own session */ }
    req.session.destroy(() => res.json({ ok: true }));
  });

  router.put('/account/password', requireAuth(), async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'newPassword and confirmPassword are required.' });
    }
    const { data, httpStatus } = await gus.changePassword(req.session.gusToken, currentPassword, newPassword, confirmPassword);
    if (data.status !== 'ok') {
      return res.status(httpStatus && httpStatus !== 200 ? httpStatus : 400).json({ error: data.error || 'Could not change password.' });
    }
    req.session.user = data.user;
    res.json({ ok: true, profile: data.user });
  });

  /* ---------------- everything below requires a signed-in admin ---------------- */
  router.use(requireAuth());

  router.get('/overview', async (req, res) => {
    try { res.json(await overviewStore.build()); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  /* ---- groups ---- */
  router.get('/groups', async (req, res) => {
    try { res.json(await groupsStore.list()); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.post('/groups', requireManage, async (req, res) => {
    try { res.json(await groupsStore.create(req.body?.name)); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });
  router.patch('/groups/:name', requireManage, async (req, res) => {
    try { res.json(await groupsStore.rename(req.params.name, req.body?.newName)); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });
  router.delete('/groups/:name', requireManage, async (req, res) => {
    try { await groupsStore.remove(req.params.name); res.json({ ok: true }); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });
  router.post('/groups/:name/domains', requireManage, async (req, res) => {
    try {
      const { domain, domains } = req.body || {};
      const result = Array.isArray(domains) ? await groupsStore.addDomains(req.params.name, domains) : await groupsStore.addDomain(req.params.name, domain);
      res.json(result);
    } catch (err) { res.status(400).json({ error: err.message }); }
  });
  router.delete('/groups/:name/domains/:domain', requireManage, async (req, res) => {
    try { res.json(await groupsStore.removeDomain(req.params.name, req.params.domain)); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });

  /* ---- fingerprints ---- */
  router.get('/fingerprints', async (req, res) => {
    try { res.json(await fingerprintsStore.list()); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.get('/fingerprints/:name/files', async (req, res) => {
    try { res.json(await fingerprintsStore.listFiles(req.params.name)); }
    catch (err) { res.status(404).json({ error: err.message }); }
  });
  router.post('/fingerprints', requireManage, async (req, res) => {
    try { res.json(await fingerprintsStore.createFromUrl(req.body?.name, req.body?.url)); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });
  router.delete('/fingerprints/:name', requireManage, async (req, res) => {
    try { await fingerprintsStore.remove(req.params.name); res.json({ ok: true }); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });

  /* ---- configuration ---- */
  router.get('/config', requireManage, (req, res) => res.json(configStore.getEditable()));
  router.put('/config', requireManage, async (req, res) => {
    try { res.json(await configStore.update(req.body || {})); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });

  return router;
}

module.exports = { managementRouter };
