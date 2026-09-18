# ProxyStop Server

ProxyStop is a tool for network administrators of primarily schools to stop students from accessing restricted content via a proxy unblocker.

## Fingerprints:

ProxyStop fingerprints generic proxy websites.

## Management console

A browser-based admin console lives at `/manage`, styled to match
[Passport](https://github.com/Prismonian-Admin-Tools/Global-Admin-Account-System)
(formerly GUS) and authenticated through it — there are no local
ProxyStop accounts. Env vars and code still say `GUS_*`/`gus` for
backward compatibility; it's the same service under its new name.

- **Dashboard** — fingerprint/blocklist counts, server status, and recently flagged sites.
- **Fingerprints** — list, inspect, delete, and create new fingerprints by scraping a source URL.
- **Configuration** (manage-capable ranks only) — edit `config.json`'s server, fingerprint-detection, reports, scraper, and management-server settings.

Passport replaced its three fixed roles with **ranks** — four built-ins,
plus any custom rank a sysadmin creates. ProxyStop maps them to two
buckets of its own:

| Rank | Can manage? |
|---|---|
| `trustedInstaller` (Provider), `systemAdministrator` (Sysadmin), `elevatedStaff` (ElevatedAdmins) | Yes — full access above |
| `staff` (StaffUsers), any custom rank ProxyStop doesn't recognize | No — read-only everywhere except Configuration, which is hidden |

An unrecognized rank name is never rejected at login — Passport already
vouches for the account — it just defaults to read-only, so a sysadmin
creating a custom rank later can't accidentally lock people out of
signing in. The pre-rank names (`owner`/`admin`) are still accepted too,
for accounts on an older Passport deployment.

ProxyStop also supports Passport's MFA challenge step
(`good_mfa_required` → a code-entry screen → `/api/v1/login/mfa`) and
its per-app access control (a sysadmin can block one specific user from
ProxyStop without disabling their account or the whole app — surfaces
here as "This account has been blocked from ProxyStop"). Both are opt-in
on Passport's side and dormant until a sysadmin turns them on for this
app.

### Setup

1. Register ProxyStop as an app with your Passport instance (from the
   Passport repo):
   ```bash
   node scripts/gus-cli.js apps create proxystop --name "ProxyStop"
   ```
   This prints an `appId` and a secret **once** — save it immediately.
   Leave `--auth-method` unset (defaults to `gam`, the username/password +
   token contract ProxyStop actually speaks).
2. Copy `.env.example` to `.env` and fill in `GUS_BASE_URL`, `GUS_APP_ID`,
   `GUS_APP_SECRET`, and a random `SESSION_SECRET`.
3. `npm install && npm start`, then sign in at `http://<host>:<port>/manage`
   with your Passport username and password.

Set `app.managementServer.enabled` to `false` in `config.json` to take the
console offline entirely (`/manage` then responds `403` to everyone).
