'use strict';
const express = require('express');
const gus = require('./gusClient');
const { requireAuth, requireManage, requireConfigure, canManage, canConfigure } = require('./auth');
const configStore = require('./stores/configStore');
const fingerprintsStore = require('./stores/fingerprintsStore');
const overviewStore = require('./stores/overviewStore');
const blocklistStore = require('./stores/blocklistStore');
const whitelistStore = require('./stores/whitelistStore');

function gusBaseUrl() {
  return (process.env.GUS_BASE_URL || '').replace(/\/+$/, '');
}

function managementRouter() {
  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));

  /* ---------------- session (backed by Passport, formerly GUS) ---------------- */

  // Shared tail for a completed login, whether it cleared on the first
  // call or after an MFA challenge — establishes our own session from
  // Passport's token/profile and responds the same shape either way.
  function establishSession(req, res, data) {
    req.session.gusToken = data.token;
    req.session.user = data.user;
    req.session.validatedAt = Date.now();
    delete req.session.pendingMfaTicket;
    res.json({
      profile: data.user,
      requirePasswordChange: data.status === 'good_change_pw',
      canManage: canManage(data.user.role),
      canConfigure: canConfigure(data.user.role),
      gusBaseUrl: gusBaseUrl(),
    });
  }

  // Statuses shared between /login and the /login/mfa tail — a blocked
  // or disabled account can surface at either point.
  function handleCommonFailure(res, data, httpStatus) {
    if (data.status === 'rate_limited') {
      res.set('Retry-After', String(data.retryAfterSeconds || 30));
      res.status(429).json({ error: 'Too many attempts. Try again shortly.' });
      return true;
    }
    if (data.status === 'bad') { res.status(401).json({ error: 'Incorrect username or password.' }); return true; }
    if (data.status === 'disabled') { res.status(403).json({ error: 'This account has been disabled.' }); return true; }
    if (data.status === 'good-no-access') {
      res.status(403).json({ error: 'This account has been blocked from ProxyStop. Contact a system administrator.' });
      return true;
    }
    if (data.status === 'invalid_request') { res.status(401).json({ error: data.error || 'That code is incorrect or has expired.' }); return true; }
    return false;
  }

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
      return res.status(500).json({ error: 'This server is not registered with Passport. Check GUS_APP_ID / GUS_APP_SECRET.' });
    }
    if (handleCommonFailure(res, data, httpStatus)) return;
    if (data.status === 'good_mfa_required') {
      req.session.pendingMfaTicket = data.mfaTicket;
      return res.json({ mfaRequired: true });
    }
    if (data.status !== 'good' && data.status !== 'good_change_pw') {
      return res.status(httpStatus || 502).json({ error: 'Unexpected response from the authentication server.' });
    }

    establishSession(req, res, data);
  });

  // Completes a good_mfa_required challenge. Dormant until a sysadmin
  // opts ProxyStop into MFA challenges on the Passport side — see
  // gusClient.js's loginMfa.
  router.post('/session/login/mfa', async (req, res) => {
    const { code } = req.body || {};
    const mfaTicket = req.session && req.session.pendingMfaTicket;
    if (!mfaTicket) return res.status(400).json({ error: 'No sign-in is waiting for a code — start over.' });
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'A verification code is required.' });
    }

    let result;
    try {
      result = await gus.loginMfa(mfaTicket, code);
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }

    const { data, httpStatus } = result;
    if (handleCommonFailure(res, data, httpStatus)) return;
    if (data.status !== 'good' && data.status !== 'good_change_pw') {
      return res.status(httpStatus || 502).json({ error: 'Unexpected response from the authentication server.' });
    }

    establishSession(req, res, data);
  });

  router.get('/session', requireAuth(), (req, res) => {
    res.json({
      profile: req.session.user,
      requirePasswordChange: !!req.session.user.mustChangePassword,
      canManage: canManage(req.session.user.role),
      canConfigure: canConfigure(req.session.user.role),
      gusBaseUrl: gusBaseUrl(),
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
    // A successful change revokes every token this account holds, across
    // every app — including the one this very request used — and issues a
    // fresh one. Losing this line means the next request 401s the admin
    // right after they change their password.
    req.session.gusToken = data.token;
    req.session.user = data.user;
    res.json({ ok: true, profile: data.user });
  });

  /* ---------------- everything below requires a signed-in admin ---------------- */
  router.use(requireAuth());

  router.get('/overview', async (req, res) => {
    try { res.json(await overviewStore.build()); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  /* ---- blocklist ---- */
  router.get('/blocklist', async (req, res) => {
    try { res.json(await blocklistStore.list()); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.delete('/blocklist/:site', requireManage, async (req, res) => {
    try { await blocklistStore.remove(req.params.site); res.json({ ok: true }); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });

  /* ---- whitelist ---- */
  router.get('/whitelist', async (req, res) => {
    try { res.json(await whitelistStore.list()); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.post('/whitelist', requireManage, async (req, res) => {
    try { await whitelistStore.add(req.body?.site); res.json({ ok: true }); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });
  router.delete('/whitelist/:site', requireManage, async (req, res) => {
    try { await whitelistStore.remove(req.params.site); res.json({ ok: true }); }
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
  router.get('/config', requireConfigure, (req, res) => res.json(configStore.getEditable()));
  router.put('/config', requireConfigure, async (req, res) => {
    try { res.json(await configStore.update(req.body || {})); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });

  return router;
}

module.exports = { managementRouter };
