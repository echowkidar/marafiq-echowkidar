# SONU Facilities Portal

A contractor-facing facilities-management portal under the **SONU** brand. It covers work requests, permits to work (E-PTW), RFE / estimations, preventive maintenance, facility inspections, and health & safety incidents.
Its structure and workflow were modelled on an ARCHIBUS-based portal. See [evidence/README.md](evidence/README.md) for how that system was analysed, including with REA.

All data is fictional.

## Run
Requires Node.js 22.5 or newer, which includes `node:sqlite`. No `npm install` is needed.
```bash
node server/server.js
```
Then open http://localhost:5173. On first start the server creates `data/sonu.db` (SQLite) and fills it with seed data.

## Deploy with Portainer + Cloudflare Tunnel
1. **Portainer → Stacks → Add stack → Repository**
   - Repository URL: this GitHub repo. Reference: `refs/heads/main`. Compose path: `docker-compose.yml`
   - **Environment variables:**
     - `SEED_PASSWORD` (required): the password for all demo accounts, at least 8 characters with letters and digits.
     - `SONU_PORT` (optional): the host port. Default is `8090`.
   - Deploy. Portainer builds the image from the `Dockerfile`. Data is kept in the `sonu-data` volume.
2. **Cloudflare Zero Trust → Networks → Tunnels → your existing tunnel → Public Hostname → Add**
   - Choose a subdomain, e.g. `sonu.yourdomain.com`.
   - Service: `HTTP` → `localhost:8090` if cloudflared runs on the host.
   - If cloudflared runs as a container, use the `networks:` block in `docker-compose.yml` instead and point the service at `http://sonu-portal:5173`.
3. Open the hostname and sign in as `admin` with your `SEED_PASSWORD`. Then use **Administration → User Accounts** to set individual passwords or create real users.

Notes:
- The container runs as a non-root user, has a health check at `/api/health`, and needs no npm packages.
- `TRUST_PROXY=1` (already set in compose) makes the server use Cloudflare's client IP for login rate limiting and set `Secure` cookies over HTTPS.
- To start again with fresh data, remove the `sonu-data` volume or use **Reset Demo Data** as admin. Reset uses `SEED_PASSWORD` again.

## Demo accounts (fictional, local only)
These passwords apply when you run locally without `SEED_PASSWORD`.
| Username | Password | Role | Can also |
|---|---|---|---|
| contractor | Sonu@123 | Contractor | — |
| supervisor | Sonu@123 | Supervisor | Approve or reject estimations and inspections, reject or close WRs, view the Activity Log |
| admin | Sonu@123 | Administrator | Everything above, plus Reset Demo Data and editing reference data |

## Administration module (Administrator only)
The **Administration** menu appears in the sidebar and in the user menu for administrators only. The server enforces this too: `/api/admin/*` returns 403 for everyone else.
- **Admin Dashboard:** users, sessions, record counts, database size, uptime, activity for the last 7 days, users by role.
- **User Accounts:** create users, edit profile and role, reset passwords, activate or deactivate accounts, end sessions. Passwords need at least 8 characters with letters and digits. Deactivating a user signs them out immediately. You cannot demote yourself, and at least one active administrator must remain.
- **Active Sessions:** who is signed in, with IP, browser and last activity. You can end anyone's session except your own.
- **Activity Log:** every sign-in and every insert, update and delete, with field-level changes. Supervisors can see it too.
- **Reference Data:** add, edit and delete Sites, Buildings, Floors, Trades, Work Teams and Craftspersons. Duplicate codes are rejected, and a record cannot be deleted while other records use it.
- **Every user:** User menu → **Change Password**. This needs the current password and signs out your other sessions.

## Architecture
```
browser (index.html / app.html)                 server/server.js  (Node, no dependencies)
  js/app.js        shell, menu, router           ├─ static files (only index/app.html, css/, js/, assets/)
  js/components.js grid/form/tabs/charts  ──►    ├─ /api/auth/*   login (scrypt hash, HttpOnly cookie, rate-limit), logout, me
  js/views.js      66 page configs        REST   ├─ /api/bootstrap  all tables for the signed-in user
  js/data.js       DB client (API cache)  JSON   ├─ /api/t/:table[/:id]  GET / POST / PATCH / DELETE
                                                 ├─ business rules: ids, defaults, validation, status history,
                                                 │   cost calc, role permissions, booking clashes, WR↔PTW sync
                                                 ├─ /api/audit  activity log (every write)   /api/reset (admin)
                                                 └─ SQLite data/sonu.db  (docs, users, sessions, audit)
```

## Files
| File | Purpose |
|---|---|
| `server/server.js` | Backend: API, auth, business rules, audit log, static file serving |
| `js/data.js` | `buildSeed()` (deterministic fictional data, also used by the server) and the browser `DB` API client |
| `js/menu.js` | Navigation tree: Module → Process → Task |
| `js/components.js` | UI engine. The header comment documents the view-config contract |
| `js/views.js` | Every page as a config (`SONU_VIEWS`) |
| `js/app.js` | Sidebar drawers, search, favorites, user menu, router (`#/v/<view>`), home dashboard |
| `css/sonu.css` | Design tokens and components (light and dark) |
| `evidence/` | Analysis of the reference portal. The screenshots and REA dumps are git-ignored because they contain real data |

Third-party libraries come from cdnjs: Leaflet 1.9.4 for the map and Chart.js 4.4.1 for charts. Map tiles come from © OpenStreetMap.
