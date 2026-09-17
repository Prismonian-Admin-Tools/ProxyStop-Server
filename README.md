# ProxyStop Server

ProxyStop is a tool for network administrators of primarily schools to stop students from accessing restricted content via a proxy unblocker.

## Fingerprints:

ProxyStop fingerprints generic proxy websites.

## Management console

A browser-based admin console lives at `/manage`, styled to match
[GUS (Global Admin Account System)](https://github.com/Prismonian-Admin-Tools/Global-Admin-Account-System)
and authenticated through it — there are no local ProxyStop accounts.

- **Dashboard** — fingerprint/blocklist counts, server status, and recently flagged sites.
- **Fingerprints** — list, inspect, delete, and create new fingerprints by scraping a source URL.
- **Blocklist** — view and prune the sites ProxyStop has automatically blocklisted (`blocklist.json`); every request the comparison engine confirms as a match is added here.
- **Configuration** (owner/admin only) — edit `config.json`'s server, fingerprint-detection, reports, scraper, and management-server settings.

GUS's three global roles decide access here: `owner`/`admin` can make
changes everywhere above; `moderator` gets read-only access to everything
except Configuration.

### Setup

1. Register ProxyStop as an app with your GUS instance (from the GUS repo):
   ```bash
   node scripts/gus-cli.js apps create proxystop --name "ProxyStop"
   ```
   This prints an `appId` and a secret **once** — save it immediately.
2. Copy `.env.example` to `.env` and fill in `GUS_BASE_URL`, `GUS_APP_ID`,
   `GUS_APP_SECRET`, and a random `SESSION_SECRET`.
3. `npm install && npm start`, then sign in at `http://<host>:<port>/manage`
   with your GUS username and password.

Set `app.managementServer.enabled` to `false` in `config.json` to take the
console offline entirely (`/manage` then responds `403` to everyone).

