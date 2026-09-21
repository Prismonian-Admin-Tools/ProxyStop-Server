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

- **Dashboard** — fingerprint/blocklist counts and recently flagged sites.
- **Fingerprints** — list, inspect, delete, and create new fingerprints by scraping a source URL.
- **Blocklist** — sites auto-blocklisted after a confirmed proxy match.
- **Whitelist** — sites exempted from fingerprint detection and blocklisting entirely, for known-good sites that would otherwise false-positive.
- **Configuration** (Provider/Sysadmin only) — edit `config.json`'s server, fingerprint-detection, reports, scraper, and management-server settings.

The console signs itself out after 10 minutes of inactivity.

Passport replaced its three fixed roles with **ranks** — four built-ins,
plus any custom rank a sysadmin creates. ProxyStop maps them to its own
access tiers:

| Rank | Can manage? | Can configure? |
|---|---|---|
| `trustedInstaller` (Provider), `systemAdministrator` (Sysadmin) | Yes | Yes |
| `elevatedStaff` (ElevatedAdmins) | Yes | No |
| `staff` (StaffUsers), any custom rank ProxyStop doesn't recognize | No — read-only everywhere except Configuration, which is hidden | No |

"Manage" covers editing the blocklist/whitelist and creating or deleting
fingerprints. "Configure" is narrower — it's the Configuration page,
which edits `config.json` directly (including the switch that can lock
everyone out of `/manage`), so it's restricted to Provider and Sysadmin
only.

An unrecognized rank name is never rejected at login — Passport already
vouches for the account — it just defaults to read-only, so a sysadmin
creating a custom rank later can't accidentally lock people out of
signing in. The pre-rank names (`owner`/`admin`) are still accepted too,
for accounts on an older Passport deployment (`owner` counts as
Sysadmin-equivalent, including for Configuration access; `admin` counts
as ElevatedAdmins-equivalent).

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
