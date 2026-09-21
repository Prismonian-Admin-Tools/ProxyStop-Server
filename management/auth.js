'use strict';
const gus = require('./gusClient');

// Passport (formerly GUS) replaced its three fixed global roles with
// ranks: four built-ins, plus any custom rank a sysadmin creates with its
// own capability set. Passport only ever hands us the rank NAME on the
// user profile — never its capabilities — because "what a rank can
// actually do inside a given app is that app's own business" (Passport's
// own README). So this is ProxyStop's own opinion of each KNOWN rank; an
// unrecognized name (a custom rank, or a future built-in) defaults to
// view-only rather than being rejected outright — a sysadmin can still
// sign everyone in, ProxyStop just can't assume a stranger's rank means
// "trusted with edits." The pre-rank role names are kept too, in case an
// older Passport deployment (or a not-yet-migrated account) still uses them.
const MANAGE_RANKS = new Set([
  'trustedInstaller', // Provider — hardcoded full access on the Passport side
  'systemAdministrator', // Sysadmin — replaces the old "owner"
  'elevatedStaff', // ElevatedAdmins — replaces the old "admin"
  'owner', 'admin', // pre-rank role names, kept for compatibility
]);
// Configuration is more sensitive than the rest of the manage-capable
// surface (it edits config.json directly, including the switch that can
// lock everyone out of /manage), so it's scoped tighter — Provider and
// Sysadmin only, not ElevatedAdmins.
const CONFIGURE_RANKS = new Set([
  'trustedInstaller', // Provider
  'systemAdministrator', // Sysadmin — replaces the old "owner"
  'owner', // pre-rank role name, kept for compatibility
]);
const REVALIDATE_INTERVAL_MS = 60_000;

function canManage(rank) {
  return MANAGE_RANKS.has(rank);
}

function canConfigure(rank) {
  return CONFIGURE_RANKS.has(rank);
}

/**
 * Mirrors Passport's own session model: we hold a token Passport issued
 * us for this admin, and periodically re-check it with Passport's
 * /validate endpoint so a disable or rank change on that side takes
 * effect here without the admin needing to sign out and back in.
 */
function requireAuth() {
  return async (req, res, next) => {
    if (!req.session || !req.session.gusToken || !req.session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const staleness = Date.now() - (req.session.validatedAt || 0);
    if (staleness < REVALIDATE_INTERVAL_MS) return next();

    try {
      const { data } = await gus.validate(req.session.gusToken);
      if (!data.valid) {
        return req.session.destroy(() => res.status(401).json({ error: 'Your session has expired.' }));
      }
      req.session.user = data.user;
      req.session.validatedAt = Date.now();
      next();
    } catch (err) {
      res.status(502).json({ error: 'Could not reach the authentication server.' });
    }
  };
}

function requireManage(req, res, next) {
  if (!canManage(req.session.user.role)) {
    return res.status(403).json({ error: 'Your rank does not permit making changes.' });
  }
  next();
}

function requireConfigure(req, res, next) {
  if (!canConfigure(req.session.user.role)) {
    return res.status(403).json({ error: 'Only Providers and Sysadmins may access Configuration.' });
  }
  next();
}

module.exports = { requireAuth, requireManage, requireConfigure, canManage, canConfigure, MANAGE_RANKS, CONFIGURE_RANKS };
