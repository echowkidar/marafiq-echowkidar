/* SONU backend — dependency-free Node server (Node >= 22.5, uses built-in node:sqlite).
 *
 *   node server/server.js [port]
 *
 * - Serves the static front-end (index.html, app.html, css/, js/, assets/ only).
 * - SQLite database at data/sonu.db (created + seeded on first run from js/data.js buildSeed()).
 * - Auth: scrypt-hashed passwords, HttpOnly session cookie, login rate limiting.
 * - REST API (all JSON, all require a session except /api/auth/login):
 *     POST /api/auth/login {username,password,project}   POST /api/auth/logout   GET /api/auth/me
 *     GET  /api/bootstrap                       -> { user, tables:{...} }
 *     GET  /api/t/:table            GET /api/t/:table/:id
 *     POST /api/t/:table            PATCH /api/t/:table/:id     DELETE /api/t/:table/:id
 *     POST /api/reset  (Administrator)          GET /api/audit (Supervisor/Administrator)
 *     GET  /api/health
 * - Business rules (ids, defaults, validation, status history, cost calculation, permissions)
 *   are enforced server-side in RULES below; every write is recorded in the audit table.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { buildSeed } = require('../js/data.js');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || process.env.PORT) || 5173;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
/* Behind a reverse proxy / Cloudflare Tunnel: trust CF-Connecting-IP / X-Forwarded-* headers */
const TRUST_PROXY = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY || '');
/* Password given to the seeded demo accounts on first start (set this for any internet-facing install) */
const SEED_PASSWORD = process.env.SEED_PASSWORD || '';
if (process.env.SEED_PASSWORD !== undefined && (SEED_PASSWORD.length < 8 || !/[A-Za-z]/.test(SEED_PASSWORD) || !/\d/.test(SEED_PASSWORD))) {
  console.error('SEED_PASSWORD must be at least 8 characters with letters and digits.'); process.exit(1);
}
const clientIp = (req) => (TRUST_PROXY && (req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim())) || req.socket.remoteAddress;
const isHttps = (req) => (TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').startsWith('https')) || /^(1|true|yes)$/i.test(process.env.COOKIE_SECURE || '');
const SESSION_HOURS = 12;
fs.mkdirSync(DATA_DIR, { recursive: true });

/* ============================== database ============================== */
const db = new DatabaseSync(path.join(DATA_DIR, 'sonu.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS docs (tbl TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (tbl, id));
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, salt TEXT NOT NULL, hash TEXT NOT NULL, profile TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, username TEXT, action TEXT NOT NULL, tbl TEXT, rec_id TEXT, detail TEXT);
  CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
`);
/* migrate sessions table (added admin session tracking) */
{
  const cols = db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
  for (const [c, type] of [['created', 'INTEGER'], ['last_seen', 'INTEGER'], ['ip', 'TEXT'], ['ua', 'TEXT']]) if (!cols.includes(c)) db.exec(`ALTER TABLE sessions ADD COLUMN ${c} ${type}`);
}
const STARTED_AT = new Date();
const q = {
  all: db.prepare('SELECT data FROM docs WHERE tbl = ?'),
  get: db.prepare('SELECT data FROM docs WHERE tbl = ? AND id = ?'),
  put: db.prepare('INSERT INTO docs (tbl, id, data) VALUES (?, ?, ?) ON CONFLICT(tbl, id) DO UPDATE SET data = excluded.data'),
  del: db.prepare('DELETE FROM docs WHERE tbl = ? AND id = ?'),
  ids: db.prepare('SELECT id FROM docs WHERE tbl = ?'),
  tables: db.prepare('SELECT DISTINCT tbl FROM docs'),
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  putUser: db.prepare('INSERT INTO users (id, username, salt, hash, profile) VALUES (?, ?, ?, ?, ?)'),
  newSession: db.prepare('INSERT INTO sessions (token, user_id, expires, created, last_seen, ip, ua) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  session: db.prepare('SELECT * FROM sessions WHERE token = ? AND expires > ?'),
  touchSession: db.prepare('UPDATE sessions SET last_seen = ? WHERE token = ?'),
  delSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  delUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  liveSessions: db.prepare('SELECT * FROM sessions WHERE expires > ? ORDER BY last_seen DESC'),
  allUsers: db.prepare('SELECT * FROM users ORDER BY id'),
  setProfile: db.prepare('UPDATE users SET profile = ? WHERE id = ?'),
  setPassword: db.prepare('UPDATE users SET salt = ?, hash = ? WHERE id = ?'),
  maxUserId: db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM users'),
  auditSince: db.prepare("SELECT substr(ts, 1, 10) AS day, COUNT(*) AS count FROM audit WHERE ts >= ? GROUP BY day ORDER BY day"),
  auditByAction: db.prepare('SELECT action, COUNT(*) AS n FROM audit GROUP BY action'),
  tableCounts: db.prepare('SELECT tbl, COUNT(*) AS n FROM docs GROUP BY tbl'),
  purgeSessions: db.prepare('DELETE FROM sessions WHERE expires <= ?'),
  audit: db.prepare('INSERT INTO audit (ts, username, action, tbl, rec_id, detail) VALUES (?, ?, ?, ?, ?, ?)'),
  auditList: db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 2000')
};

const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 64).toString('hex');

function seed() {
  const D = buildSeed();
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM docs; DELETE FROM users; DELETE FROM sessions;');
    for (const [tbl, rows] of Object.entries(D)) {
      if (tbl === 'users') continue;
      for (const r of rows) q.put.run(tbl, String(r.id), JSON.stringify(r));
    }
    for (const u of D.users) {
      const salt = crypto.randomBytes(16).toString('hex');
      const { password, ...profile } = u;
      profile.active = true; profile.created_at = new Date().toISOString(); profile.last_login = null;
      q.putUser.run(u.id, u.username, salt, hashPw(SEED_PASSWORD || password, salt), JSON.stringify(profile));
    }
    if (!SEED_PASSWORD) console.warn('WARNING: demo accounts use the public default password. Set SEED_PASSWORD before exposing this server.');
    db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run('seeded_at', new Date().toISOString());
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
if (!db.prepare("SELECT v FROM meta WHERE k = 'seeded_at'").get()) { seed(); console.log('Database seeded.'); }

const TABLES = new Set(q.tables.all().map((r) => r.tbl));
const all = (t) => q.all.all(t).map((r) => JSON.parse(r.data));
const get = (t, id) => { const r = q.get.get(t, String(id)); return r ? JSON.parse(r.data) : null; };
const put = (t, row) => { q.put.run(t, String(row.id), JSON.stringify(row)); TABLES.add(t); return row; };
const audit = (user, action, tbl, id, detail) => q.audit.run(new Date().toISOString(), user ? user.username : null, action, tbl || null, id == null ? null : String(id), detail ? JSON.stringify(detail).slice(0, 2000) : null);

/* ============================== business rules ============================== */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (msg, status = 400) => { throw new HttpError(status, msg); };
const now = () => new Date().toISOString();
const numPart = (id) => { const m = String(id).match(/(\d+)$/); return m ? parseInt(m[1], 10) : NaN; };
const BASE = { wr: 3374175, other_resources: 400000, incidents: 10001, ptw: 831572 };
function nextId(t, prefix = '') {
  const nums = q.ids.all(t).map((r) => numPart(r.id)).filter(Number.isFinite);
  return prefix + ((nums.length ? Math.max(...nums) : (BASE[t] || 1) - 1) + 1);
}
const ROLE_RANK = { Contractor: 1, Supervisor: 2, Administrator: 3 };
const atLeast = (user, role) => (ROLE_RANK[user.role] || 0) >= ROLE_RANK[role];

const WR_STATUS = ['Requested', 'Reviewed but On Hold', 'Rejected', 'Approved', 'Assigned to Work Order', 'Issued and In Process', 'On Hold for Parts', 'On Hold for Access', 'On Hold for Labor', 'Not Handymen Work', 'Stopped', 'Cancelled', 'Completed', 'Closed', 'Contractor Completed'];
const PTW_STATUS = ['Requested', 'Authorized', 'Issued', 'Re Issued', 'Waiting For Re Issuing', 'Completed By Applicant', 'Completed By Controller', 'Closed', 'Rejected', 'Stopped by Authority'];
const required = (row, fields) => { const miss = fields.filter((f) => row[f] == null || row[f] === ''); if (miss.length) fail('Missing required field(s): ' + miss.join(', ')); };
const oneOf = (v, list, label) => { if (v != null && v !== '' && !list.includes(v)) fail(`Invalid ${label}: ${v}`); };
const site = (id) => (id ? get('sites', id) : null);
const bld = (id) => (id ? get('buildings', id) : null);
function fillLocation(row) {
  if (row.site_id && !site(row.site_id)) fail('Unknown site code: ' + row.site_id);
  if (row.bl_id) { const b = bld(row.bl_id); if (!b) fail('Unknown building code: ' + row.bl_id); row.bl_name = row.bl_name || b.name; row.site_id = row.site_id || b.site_id; }
  if (row.site_id && 'site_name' in row === false) row.site_name = site(row.site_id).name;
}
const pushHistory = (row, action, user) => { row.history = Array.isArray(row.history) ? row.history : []; row.history.push({ date: now(), action, by: user.name }); };

/* Each rule: insert(row, user) -> row ; update(prev, patch, user) -> merged row ; canDelete(user,row) */
const RULES = {
  wr: {
    insert(r, u) {
      r.id = nextId('wr'); r.date_requested = r.date_requested || now(); r.status = r.status || 'Requested';
      r.requestor = r.requestor || u.name; r.requestor_username = r.requestor_username || u.username;
      r.wr_type = r.wr_type || 'On Demand'; r.priority = Number(r.priority || 3);
      required(r, ['description']); fillLocation(r); return r;
    },
    update(p, x, u) {
      const r = { ...p, ...x };
      oneOf(r.status, WR_STATUS, 'work request status');
      if (r.priority != null && (r.priority < 1 || r.priority > 5)) fail('Priority must be 1–5');
      if (x.status && x.status !== p.status) {
        if (['Closed', 'Rejected', 'Cancelled'].includes(p.status) && !atLeast(u, 'Supervisor')) fail(`Work request ${p.id} is ${p.status} and can only be reopened by a supervisor`, 403);
        if (['Rejected', 'Closed'].includes(x.status) && !atLeast(u, 'Supervisor')) fail(`Only a supervisor can set status "${x.status}"`, 403);
        if (x.status === 'Contractor Completed' && !r.date_contractor_completed) r.date_contractor_completed = now();
        if (x.status === 'Completed' && !r.date_completed) r.date_completed = now();
        if (x.status === 'Issued and In Process' && !r.date_issued) r.date_issued = now();
        if (x.status === 'Assigned to Work Order' && !r.date_assigned) r.date_assigned = now();
        pushHistory(r, `Status: ${p.status} → ${x.status}`, u);
      }
      if (r.est_cost != null && r.est_cost < 0) fail('Estimated cost cannot be negative');
      fillLocation(r); return r;
    }
  },
  ptw: {
    insert(r, u) {
      r.id = nextId('ptw', 'C-'); r.date_created = now(); r.status = r.status || 'Requested';
      r.applicant = r.applicant || u.name; r.applicant_username = r.applicant_username || u.username;
      r.communications = r.communications || [];
      required(r, ['site_id', 'description']);
      if (r.wr_id && !get('wr', r.wr_id)) fail('Unknown work request: ' + r.wr_id);
      if (r.date_start && r.date_end && r.date_end < r.date_start) fail('Permit end date must be after start date');
      fillLocation(r); r.history = []; pushHistory(r, 'Permit requested', u);
      if (r.wr_id) { const w = get('wr', r.wr_id); put('wr', { ...w, ptw_id: r.id, ptw_status: r.status }); }
      return r;
    },
    update(p, x, u) {
      const r = { ...p, ...x };
      oneOf(r.status, PTW_STATUS, 'permit status');
      if (r.date_start && r.date_end && r.date_end < r.date_start) fail('Permit end date must be after start date');
      if (x.status && x.status !== p.status) {
        if (p.status === 'Closed' && !atLeast(u, 'Supervisor')) fail(`Permit ${p.id} is closed`, 403);
        if (x.status === 'Closed') r.date_closed = now();
        if (['Issued', 'Re Issued'].includes(x.status) && !r.date_issued) r.date_issued = now();
        if (x.status === 'Stopped by Authority') r.stopped = true;
        pushHistory(r, `Status: ${p.status} → ${x.status}`, u);
        if (r.wr_id) { const w = get('wr', r.wr_id); if (w) put('wr', { ...w, ptw_status: x.status }); }
      } else if (x.date_end && x.date_end !== p.date_end) pushHistory(r, 'Validity changed to ' + x.date_end.slice(0, 10), u);
      fillLocation(r); return r;
    }
  },
  other_resources: {
    insert(r, u) {
      r.id = nextId('other_resources'); r.date_used = r.date_used || now(); r.status = r.status || 'Pending';
      r.rfe_pending = r.rfe_pending ?? true; r.comments = r.comments || [];
      if (r.wr_id && !get('wr', r.wr_id)) fail('Unknown work request: ' + r.wr_id);
      required(r, ['wr_id', 'description']);
      return RULES.other_resources.calc(r);
    },
    update(p, x, u) {
      const r = RULES.other_resources.calc({ ...p, ...x });
      if (x.status && x.status !== p.status && ['Approved', 'Rejected'].includes(x.status)) {
        if (!atLeast(u, 'Supervisor')) fail('Only a supervisor can approve or reject estimations', 403);
        r.approved_by = u.name; r.date_approved = now(); r.rfe_pending = false;
      }
      return r;
    },
    calc(r) {
      const qty = Number(r.qty_estimated), rate = Number(r.unit_cost);
      if (qty < 0 || rate < 0) fail('Quantity and unit cost must be positive');
      if (Number.isFinite(qty) && Number.isFinite(rate) && r.unit_cost !== undefined) r.cost_estimated = Math.round(qty * rate * 100) / 100;
      return r;
    }
  },
  rfe_lines: { insert(r) { r.amount = Math.round(Number(r.qty || 0) * Number(r.unit_rate || 0) * 100) / 100; return r; }, update(p, x) { const r = { ...p, ...x }; r.amount = Math.round(Number(r.qty || 0) * Number(r.unit_rate || 0) * 100) / 100; return r; } },
  labor: {
    insert(r) { required(r, ['wr_id', 'date']); RULES.labor.check(r); return r; },
    update(p, x) { const r = { ...p, ...x }; RULES.labor.check(r); return r; },
    check(r) { const s = Number(r.hours_straight || 0), o = Number(r.hours_overtime || 0); if (s < 0 || o < 0 || s + o > 24) fail('Daily hours must be between 0 and 24'); if (r.wr_id && !get('wr', r.wr_id)) fail('Unknown work request: ' + r.wr_id); }
  },
  incidents: {
    insert(r, u) { r.id = nextId('incidents'); r.status = r.status || 'Reported'; r.reported_by = r.reported_by || u.name; r.date_incident = r.date_incident || now(); required(r, ['incident_type', 'description']); return r; }
  },
  incident_actions: {
    update(p, x) { const r = { ...p, ...x }; if (x.status === 'Completed' && !r.date_completed) r.date_completed = now(); return r; }
  },
  surveys: {
    update(p, x, u) {
      const r = { ...p, ...x };
      if (r.rating != null && (r.rating < 1 || r.rating > 5)) fail('Rating must be between 1 and 5');
      if (p.requestor !== u.username && !atLeast(u, 'Supervisor')) fail('You can only answer your own surveys', 403);
      return r;
    }
  },
  inspections: {
    insert(r, u) { r.date_requested = r.date_requested || now(); r.status = r.status || 'Requested'; r.inspector = r.inspector || u.name; fillLocation(r); return r; },
    update(p, x, u) {
      const r = { ...p, ...x };
      if (x.status && ['Approved', 'Rejected'].includes(x.status) && x.status !== p.status && !atLeast(u, 'Supervisor')) fail('Only a supervisor can approve or reject inspection items', 403);
      return r;
    }
  },
  error_docs: { canDelete: () => true },
  bookings: {
    insert(r, u) {
      r.booked_by = r.booked_by || u.name; required(r, ['room', 'date', 'start', 'end']);
      if (r.end <= r.start) fail('End time must be after start time');
      const clash = all('bookings').find((b) => b.room === r.room && String(b.date).slice(0, 10) === String(r.date).slice(0, 10) && b.start < r.end && r.start < b.end);
      if (clash) fail(`${r.room} is already booked ${clash.start}–${clash.end} that day`, 409);
      return r;
    },
    canDelete: (u, row) => row.booked_by === u.name || atLeast(u, 'Supervisor')
  }
};
const READ_ONLY = new Set(['sites', 'buildings', 'floors', 'trades', 'work_teams', 'craftspersons']);

/* ============================== http helpers ============================== */
const send = (res, status, body, headers = {}) => {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': typeof body === 'object' && !Buffer.isBuffer(body) ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(data);
};
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 1e6) { reject(new HttpError(413, 'Request too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(new HttpError(400, 'Invalid JSON')); } });
    req.on('error', reject);
  });
}
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
function currentUser(req) {
  const tok = cookies(req).sonu_sid; if (!tok) return null;
  const s = q.session.get(tok, Date.now()); if (!s) return null;
  const u = q.userById.get(s.user_id); if (!u) return null;
  const profile = JSON.parse(u.profile);
  if (profile.active === false) { q.delSession.run(tok); return null; }
  if (!s.last_seen || Date.now() - s.last_seen > 30e3) q.touchSession.run(Date.now(), tok);
  return { id: u.id, username: u.username, ...profile, token: tok };
}
const publicUser = (u) => { const { token, ...rest } = u; return rest; };
const sidOf = (token) => crypto.createHash('sha256').update(token).digest('hex').slice(0, 12);
const userRow = (u) => { const p = JSON.parse(u.profile); return { id: u.id, username: u.username, ...p, active: p.active !== false, last_login: p.last_login || null, created_at: p.created_at || null }; };
const checkPassword = (pw) => { if (typeof pw !== 'string' || pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) fail('Password must be at least 8 characters and contain letters and digits'); };
const setPassword = (id, pw) => { const salt = crypto.randomBytes(16).toString('hex'); q.setPassword.run(salt, hashPw(pw, salt), id); };
const activeAdmins = () => q.allUsers.all().map(userRow).filter((u) => u.role === 'Administrator' && u.active !== false);
const PROFILE_FIELDS = ['name', 'role', 'position', 'company', 'phone', 'email', 'bl_id', 'active'];

/* referential integrity for reference data deletes */
const REFS = {
  sites: [['buildings', 'site_id'], ['wr', 'site_id'], ['ptw', 'site_id']],
  buildings: [['floors', 'bl_id'], ['wr', 'bl_id'], ['ptw', 'bl_id'], ['equipment', 'bl_id']],
  trades: [['craftspersons', 'trade'], ['work_teams', 'trade'], ['wr', 'prob_type']],
  work_teams: [['craftspersons', 'work_team'], ['wr', 'work_team']],
  craftspersons: [['labor', 'cf_id']]
};
function assertUnreferenced(t, id) {
  for (const [rt, f] of REFS[t] || []) { const n = all(rt).filter((r) => String(r[f]) === String(id)).length; if (n) fail(`Cannot delete ${id}: it is used by ${n} ${rt} record(s)`, 409); }
}
const REF_RULES = {
  sites: (r) => { required(r, ['id', 'name', 'city']); },
  buildings: (r) => { required(r, ['id', 'name', 'site_id']); const s = site(r.site_id); if (!s) fail('Unknown site code: ' + r.site_id); r.city = r.city || s.city; },
  floors: (r) => { required(r, ['id', 'bl_id', 'fl_id']); if (!bld(r.bl_id)) fail('Unknown building code: ' + r.bl_id); },
  trades: (r) => required(r, ['id', 'name']),
  work_teams: (r) => { required(r, ['id', 'name']); if (r.trade && !get('trades', r.trade)) fail('Unknown trade: ' + r.trade); },
  craftspersons: (r) => { required(r, ['id', 'name', 'trade']); if (!get('trades', r.trade)) fail('Unknown trade: ' + r.trade); if (r.work_team && !get('work_teams', r.work_team)) fail('Unknown work team: ' + r.work_team); }
};
for (const [t, check] of Object.entries(REF_RULES)) RULES[t] = Object.assign({}, RULES[t], {
  insert(r) { if (r.__id == null || r.__id === '') fail('Code (id) is required'); r.id = String(r.__id).trim().toUpperCase(); delete r.__id; if (!/^[A-Z0-9._-]{1,32}$/.test(r.id)) fail('Code may only contain letters, digits, . _ -'); check(r); return r; },
  update(p, x) { const r = { ...p, ...x }; check(r); return r; },
  canDelete(u, row) { if (!atLeast(u, 'Administrator')) return false; assertUnreferenced(t, row.id); return true; }
});

/* admin API (Administrator only) — mirrors ARCHIBUS AdminService/SecurityService user + session management */
async function adminApi(req, res, p, m, user) {
  if (!atLeast(user, 'Administrator')) fail('Administrator access required', 403);
  if (p === '/api/admin/stats' && m === 'GET') {
    const users = q.allUsers.all().map(userRow); const byRole = {};
    users.forEach((u) => (byRole[u.role] = (byRole[u.role] || 0) + 1));
    const since = new Date(Date.now() - 6 * 864e5); since.setHours(0, 0, 0, 0);
    const days = Object.fromEntries(q.auditSince.all(since.toISOString()).map((r) => [r.day, r.count]));
    const last7days = []; for (let i = 6; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); last7days.push({ day: d, count: days[d] || 0 }); }
    let bytes = 0; for (const f of ['sonu.db', 'sonu.db-wal']) { try { bytes += fs.statSync(path.join(DATA_DIR, f)).size; } catch (e) {} }
    return send(res, 200, {
      users: { total: users.length, active: users.filter((u) => u.active !== false).length, byRole },
      sessions: { active: q.liveSessions.all(Date.now()).length },
      tables: Object.fromEntries(q.tableCounts.all().map((r) => [r.tbl, r.n])),
      audit: { last7days, byAction: Object.fromEntries(q.auditByAction.all().map((r) => [r.action, r.n])) },
      db: { bytes }, server: { started_at: STARTED_AT.toISOString(), uptime_s: Math.round(process.uptime()), node: process.version }
    });
  }
  if (p === '/api/admin/users' && m === 'GET') return send(res, 200, q.allUsers.all().map(userRow));
  if (p === '/api/admin/users' && m === 'POST') {
    const b = await readBody(req);
    const username = String(b.username || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) fail('Username must be 3–32 characters: a-z, 0-9, . _ -');
    if (q.userByName.get(username)) fail('Username already exists', 409);
    checkPassword(b.password); required(b, ['name', 'role']); oneOf(b.role, Object.keys(ROLE_RANK), 'role');
    if (b.bl_id && !bld(b.bl_id)) fail('Unknown building code: ' + b.bl_id);
    const id = q.maxUserId.get().m + 1;
    const profile = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, b[f] ?? ''])); profile.active = true; profile.created_at = now(); profile.last_login = null;
    const salt = crypto.randomBytes(16).toString('hex');
    q.putUser.run(id, username, salt, hashPw(b.password, salt), JSON.stringify(profile));
    audit(user, 'user_create', 'users', id, { username, role: profile.role });
    return send(res, 201, { id, username, ...profile });
  }
  let mm = p.match(/^\/api\/admin\/users\/(\d+)(\/password|\/terminate-sessions)?$/);
  if (mm) {
    const target = q.userById.get(Number(mm[1])); if (!target) fail('User not found', 404);
    const prof = JSON.parse(target.profile);
    if (!mm[2] && m === 'PATCH') {
      const b = await readBody(req); const next = { ...prof };
      for (const f of PROFILE_FIELDS) if (f in b) next[f] = f === 'active' ? b[f] === true || b[f] === 'true' || b[f] === 'Yes' : b[f];
      oneOf(next.role, Object.keys(ROLE_RANK), 'role');
      if (next.bl_id && !bld(next.bl_id)) fail('Unknown building code: ' + next.bl_id);
      const losesAdmin = prof.role === 'Administrator' && prof.active !== false && (next.role !== 'Administrator' || next.active === false);
      if (losesAdmin && target.id === user.id) fail('You cannot remove your own administrator access', 400);
      if (losesAdmin && activeAdmins().length <= 1) fail('At least one active administrator must remain', 400);
      q.setProfile.run(JSON.stringify(next), target.id);
      if (next.active === false) q.delUserSessions.run(target.id);
      audit(user, 'user_update', 'users', target.id, Object.fromEntries(PROFILE_FIELDS.filter((f) => prof[f] !== next[f]).map((f) => [f, { from: prof[f], to: next[f] }])));
      return send(res, 200, { id: target.id, username: target.username, ...next });
    }
    if (mm[2] === '/password' && m === 'POST') {
      const b = await readBody(req); checkPassword(b.password); setPassword(target.id, b.password);
      if (target.id !== user.id) q.delUserSessions.run(target.id);
      audit(user, 'password_reset', 'users', target.id, { username: target.username });
      return send(res, 200, { ok: true });
    }
    if (mm[2] === '/terminate-sessions' && m === 'POST') {
      const live = q.liveSessions.all(Date.now()).filter((s) => s.user_id === target.id && s.token !== user.token);
      live.forEach((s) => q.delSession.run(s.token));
      audit(user, 'sessions_terminate', 'users', target.id, { count: live.length });
      return send(res, 200, { ok: true, terminated: live.length });
    }
  }
  if (p === '/api/admin/sessions' && m === 'GET') {
    const users = Object.fromEntries(q.allUsers.all().map((u) => [u.id, userRow(u)]));
    return send(res, 200, q.liveSessions.all(Date.now()).map((s) => ({
      sid: sidOf(s.token), user_id: s.user_id, username: users[s.user_id]?.username, name: users[s.user_id]?.name, role: users[s.user_id]?.role,
      created: s.created ? new Date(s.created).toISOString() : null, last_seen: s.last_seen ? new Date(s.last_seen).toISOString() : null,
      expires: new Date(s.expires).toISOString(), ip: s.ip, user_agent: s.ua, current: s.token === user.token
    })));
  }
  mm = p.match(/^\/api\/admin\/sessions\/([0-9a-f]{12})$/);
  if (mm && m === 'DELETE') {
    const s = q.liveSessions.all(Date.now()).find((x) => sidOf(x.token) === mm[1]); if (!s) fail('Session not found', 404);
    if (s.token === user.token) fail('Use Sign Out to end your own session', 400);
    q.delSession.run(s.token); audit(user, 'session_terminate', 'sessions', mm[1], { user_id: s.user_id });
    return send(res, 200, { ok: true });
  }
  fail('Not found', 404);
}
/* strip client-controlled meta fields; reference tables may supply their code as the id (passed on as __id) */
const sanitize = (obj, keepId) => {
  const o = { ...(obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {}) };
  const id = o.id; delete o.id;
  for (const k of Object.keys(o)) if (k.startsWith('__') || ['created_by', 'created_at', 'updated_by', 'updated_at'].includes(k)) delete o[k];
  if (keepId && id != null) o.__id = id;
  return o;
};

/* login rate limiting: 10 attempts / 10 min per IP */
const attempts = new Map();
function rateLimited(ip) {
  const t = Date.now(); const a = (attempts.get(ip) || []).filter((x) => t - x < 600e3);
  attempts.set(ip, a); return a.length >= 10;
}

/* ============================== API ============================== */
async function api(req, res, url) {
  const p = url.pathname.replace(/\/+$/, '');
  const m = req.method;

  if (p === '/api/health') return send(res, 200, { ok: true, time: now() });

  if (p === '/api/auth/login' && m === 'POST') {
    const ip = clientIp(req);
    if (rateLimited(ip)) fail('Too many sign-in attempts. Try again in a few minutes.', 429);
    const { username, password, project } = await readBody(req);
    const u = username && q.userByName.get(String(username));
    const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(password || '', u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
    if (!ok) { attempts.get(ip).push(Date.now()); audit({ username: String(username || '') }, 'login_failed'); fail('Invalid username or password.', 401); }
    const profile = JSON.parse(u.profile);
    if (profile.active === false) { audit({ username: u.username }, 'login_blocked'); fail('This account is disabled. Contact your administrator.', 403); }
    profile.last_login = now(); q.setProfile.run(JSON.stringify(profile), u.id);
    q.purgeSessions.run(Date.now());
    const token = crypto.randomBytes(32).toString('hex');
    q.newSession.run(token, u.id, Date.now() + SESSION_HOURS * 3600e3, Date.now(), Date.now(), ip, String(req.headers['user-agent'] || '').slice(0, 300));
    const user = { id: u.id, username: u.username, ...profile, project: project || 'SONU' };
    audit(user, 'login');
    return send(res, 200, { user }, { 'Set-Cookie': `sonu_sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_HOURS * 3600}${isHttps(req) ? '; Secure' : ''}` });
  }

  const user = currentUser(req);
  if (!user) fail('Not signed in', 401);

  if (p === '/api/auth/logout' && m === 'POST') { q.delSession.run(user.token); audit(user, 'logout'); return send(res, 200, { ok: true }, { 'Set-Cookie': 'sonu_sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' }); }
  if (p === '/api/auth/me') return send(res, 200, { user: publicUser(user) });
  if (p === '/api/auth/password' && m === 'POST') {
    const { current, password } = await readBody(req);
    const u = q.userById.get(user.id);
    if (!crypto.timingSafeEqual(Buffer.from(hashPw(current || '', u.salt), 'hex'), Buffer.from(u.hash, 'hex'))) fail('Current password is incorrect', 400);
    checkPassword(password); setPassword(user.id, password);
    q.liveSessions.all(Date.now()).filter((s) => s.user_id === user.id && s.token !== user.token).forEach((s) => q.delSession.run(s.token));
    audit(user, 'password_change', 'users', user.id); return send(res, 200, { ok: true });
  }
  if (p.startsWith('/api/admin/')) return adminApi(req, res, p, m, user);

  if (p === '/api/bootstrap' && m === 'GET') {
    const tables = {};
    for (const t of TABLES) tables[t] = all(t);
    tables.users = db.prepare('SELECT id, username, profile FROM users').all().map((u) => ({ id: u.id, username: u.username, ...JSON.parse(u.profile) }));
    return send(res, 200, { user: publicUser(user), tables });
  }

  if (p === '/api/reset' && m === 'POST') {
    if (!atLeast(user, 'Administrator')) fail('Only an administrator can reset the demo data.', 403);
    seed(); audit(user, 'reset'); return send(res, 200, { ok: true });
  }
  if (p === '/api/audit' && m === 'GET') {
    if (!atLeast(user, 'Supervisor')) fail('Not permitted', 403);
    return send(res, 200, q.auditList.all().map((a) => ({ ...a, detail: a.detail ? JSON.parse(a.detail) : null })));
  }

  const tm = p.match(/^\/api\/t\/([a-z_]+)(?:\/([^/]+))?$/);
  if (tm) {
    const [, t, rawId] = tm; const id = rawId && decodeURIComponent(rawId);
    if (t === 'users' || !TABLES.has(t)) fail('Unknown table: ' + t, 404);
    const rule = RULES[t] || {};
    if (m === 'GET') {
      if (!id) return send(res, 200, all(t));
      const row = get(t, id); if (!row) fail('Not found', 404); return send(res, 200, row);
    }
    if (READ_ONLY.has(t) && !atLeast(user, 'Administrator')) fail(`${t} is reference data and is read-only`, 403);
    if (m === 'POST' && !id) {
      let row = sanitize(await readBody(req), READ_ONLY.has(t));
      row = rule.insert ? rule.insert(row, user) : row;
      delete row.__id;
      if (row.id == null) row.id = nextId(t);
      if (get(t, row.id)) fail('Duplicate id ' + row.id, 409);
      row.created_by = user.username; row.created_at = now();
      put(t, row); audit(user, 'insert', t, row.id, row);
      return send(res, 201, row);
    }
    if (m === 'PATCH' && id) {
      const prev = get(t, id); if (!prev) fail('Not found', 404);
      const patch = sanitize(await readBody(req));
      const row = rule.update ? rule.update(prev, patch, user) : { ...prev, ...patch };
      row.id = prev.id; row.updated_by = user.username; row.updated_at = now();
      put(t, row);
      const changed = Object.fromEntries(Object.keys(patch).filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(row[k])).map((k) => [k, { from: prev[k], to: row[k] }]));
      audit(user, 'update', t, id, changed);
      return send(res, 200, row);
    }
    if (m === 'DELETE' && id) {
      const prev = get(t, id); if (!prev) fail('Not found', 404);
      const allowed = rule.canDelete ? rule.canDelete(user, prev) : atLeast(user, 'Administrator');
      if (!allowed) fail('You are not allowed to delete this record', 403);
      q.del.run(t, String(id)); audit(user, 'delete', t, id, prev);
      return send(res, 200, { ok: true });
    }
  }
  fail('Not found', 404);
}

/* ============================== static ============================== */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json' };
const PUBLIC = [/^\/(index|app)\.html$/, /^\/css\/[\w.-]+\.css$/, /^\/js\/[\w.-]+\.js$/, /^\/assets\/[\w.-]+$/];
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  if (!PUBLIC.some((r) => r.test(p))) return send(res, 404, 'Not found');
  const f = path.join(ROOT, p);
  fs.readFile(f, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    res.writeHead(200, { 'Content-Type': (TYPES[path.extname(f)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      if (['POST', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) fail('Cross-origin request blocked', 403);
      await api(req, res, url);
    } else serveStatic(req, res, url);
  } catch (e) {
    if (e instanceof HttpError) send(res, e.status, { error: e.message });
    else { console.error(e); send(res, 500, { error: 'Server error' }); }
  }
});
server.listen(PORT, () => console.log(`SONU running at http://localhost:${PORT}${TRUST_PROXY ? ' (behind proxy)' : ''}`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { server.close(); try { db.close(); } catch (e) {} process.exit(0); });
