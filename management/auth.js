'use strict';
const gus = require('./gusClient');

// GUS's three global roles. This app decides for itself what each bucket
// can do here (per GUS's own README: "What each role can actually do
// inside a given app is that app's own business") — owners and admins can
// change configuration, groups, and fingerprints; moderators get read-only
// access to everything but Configuration.
const MANAGE_ROLES = new Set(['owner', 'admin']);
const REVALIDATE_INTERVAL_MS = 60_000;

/**
 * Mirrors GUS's own session model: we hold a token GUS issued us for this
 * admin, and periodically re-check it with GUS's /validate endpoint so a
 * disable or role change on the GUS side takes effect here without the
 * admin needing to sign out and back in.
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
  if (!MANAGE_ROLES.has(req.session.user.role)) {
    return res.status(403).json({ error: 'Your role does not permit making changes.' });
  }
  next();
}

module.exports = { requireAuth, requireManage, MANAGE_ROLES };
