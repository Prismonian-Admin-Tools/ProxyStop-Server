# ProxyStop Server

ProxyStop is a tool for network administrators of primarily schools to stop students from accessing restricted content via a proxy unblocker.

## Fingerprints:

ProxyStop fingerprints generic proxy websites.

## Management console

A browser-based admin console lives at `/manage`, styled to match
[GUS (Global Admin Account System)](https://github.com/Prismonian-Admin-Tools/Global-Admin-Account-System)
and authenticated through it — there are no local ProxyStop accounts.

- **Dashboard** — fingerprint/group/domain counts, server status, and recently flagged sites.
- **Groups** — create/rename/delete whitelist groups and add or remove domains (`whitelist.json`).
- **Fingerprints** — list, inspect, delete, and create new fingerprints by scraping a source URL.
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

### Client groups

The groups managed on the Groups page classify ProxyStop's actual
clients — the students, staff, and admins on the network — not arbitrary
domain categories. `whitelist.json` ships with six default groups:

| Group | Who | Intended behavior |
|---|---|---|
| `Sysadmin` | District system administrators, usually with backend access | Highest rank — no other group's settings can override a Sysadmin's |
| `ElevatedStaff` | IT workers | Can sign into the management console and manage groups |
| `StaffUsers` | Teachers | Behaves like `StudentUsers`, but a `Sysadmin` can modify its settings |
| `StudentUsers` | The default group for newly enrolled students | Some sites can be unblocked |
| `HighschoolStudent` | Students at schools that grant more freedom | Some sites can be unblocked |
| `EduOnly` | Special placement, assigned by `ElevatedStaff` | Every fingerprinted site stays blocked |

None of this is enforced yet — the six groups exist as defaults, but
nothing currently ties group membership to fingerprint blocking or to who
can sign into `/manage` (that's still governed entirely by GUS's
owner/admin/moderator roles, per above). This table records the intended
design for when that wiring is built.

