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
    setMeta('seeded_at', new Date().toISOString()); setMeta('data_model', DATA_MODEL);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
/* DATA_MODEL is bumped whenever the demo data structure changes. On start-up an older database gets fresh demo
   data (docs only) — user accounts, passwords and sessions are kept. */
const DATA_MODEL = '3';
function setMeta(k, v) { db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, v); }
function reseedDocs() {
  const D = buildSeed();
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM docs;');
    for (const [tbl, rows] of Object.entries(D)) { if (tbl === 'users') continue; for (const r of rows) q.put.run(tbl, String(r.id), JSON.stringify(r)); }
    for (const u of D.users) {
      if (!q.userByName.get(u.username)) {
        const nextId = (q.maxUserId.get().m || 0) + 1;
        const salt = crypto.randomBytes(16).toString('hex');
        const { password, ...profile } = u;
        profile.id = nextId;
        profile.active = true; profile.created_at = new Date().toISOString(); profile.last_login = null;
        q.putUser.run(nextId, u.username, salt, hashPw(SEED_PASSWORD || password, salt), JSON.stringify(profile));
      }
    }
    setMeta('data_model', DATA_MODEL); db.exec('COMMIT');
    if (typeof TABLES !== 'undefined') q.tables.all().forEach((x) => TABLES.add(x.tbl));
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
if (!db.prepare("SELECT v FROM meta WHERE k = 'seeded_at'").get()) { seed(); console.log('Database seeded.'); }
else if ((db.prepare("SELECT v FROM meta WHERE k = 'data_model'").get() || {}).v !== DATA_MODEL) { reseedDocs(); console.log(`Demo data upgraded to data model ${DATA_MODEL} (user accounts kept).`); }

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
const ROLE_RANK = { Employee: 1, Contractor: 1, Finance: 2, Supervisor: 2, Administrator: 3 };
const atLeast = (user, role) => (ROLE_RANK[user.role] || 0) >= ROLE_RANK[role];

const WR_STATUS = ['Requested', 'Reviewed but On Hold', 'Rejected', 'Approved', 'Assigned to Work Order', 'Issued and In Process', 'On Hold for Parts', 'On Hold for Access', 'On Hold for Labor', 'Not Handymen Work', 'Stopped', 'Cancelled', 'Completed', 'Closed', 'Contractor Completed'];
/* Permit-to-work lifecycle (mirrors the reference portal: Req → APP → AUT → I → CA → CP → Clo, with RI/WRI re-issue loop and Rej). */
const PTW_STATUS = ['Requested', 'Applied', 'Authorized', 'Issued', 'Re Issued', 'Waiting For Re Issuing', 'Completed By Applicant', 'Completed By Controller', 'Closed', 'Rejected'];
const PTW_NEXT = {
  'Requested': ['Applied', 'Rejected'],
  'Applied': ['Authorized', 'Rejected'],
  'Authorized': ['Issued', 'Rejected'],
  'Issued': ['Completed By Applicant', 'Waiting For Re Issuing'],
  'Re Issued': ['Completed By Applicant', 'Waiting For Re Issuing'],
  'Waiting For Re Issuing': ['Re Issued'],
  'Completed By Applicant': ['Completed By Controller'],
  'Completed By Controller': ['Closed'],
  'Closed': [], 'Rejected': []
};
/* who may move a permit into a status: applicant side vs. controller/authority side */
const PTW_APPLICANT_STEPS = new Set(['Applied', 'Completed By Applicant', 'Waiting For Re Issuing']);
const PTW_ISSUED = new Set(['Issued', 'Re Issued']);
const INCIDENT_AREAS = ['HS', 'ENV', 'SEC', 'F&I', 'INF'];
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
    /* Create PTW form: project (with an engineer), active site, building, description, department and division are required. */
    insert(r, u) {
      r.id = nextId('ptw', 'C-'); r.ptw_code = r.id; r.date_created = now(); r.status = 'Requested';
      r.created_by = u.username; r.applicant = r.applicant || u.name; r.applicant_username = r.applicant_username || u.username;
      r.priority = Number(r.priority || 1); r.communications = []; r.daily_endorsement_needed = r.daily_endorsement_needed || 'No';
      if (!r.__from_wrs) {
        required(r, ['project_code', 'site_id', 'bl_id', 'description', 'dp_id']);
        checkProject(r.project_code);
        const dp = get('departments', r.dp_id); if (!dp) fail('Unknown department: ' + r.dp_id);
        r.dv_id = r.dv_id || dp.dv_id; required(r, ['dv_id']);
      }
      delete r.__from_wrs;
      const s = site(r.site_id); if (s && s.status === 'In-Active') fail(`Site ${r.site_id} is inactive and cannot be used for new permits`);
      ptwDates(r); fillLocation(r);
      r.date_issued = null; r.date_end = null;
      r.history = []; pushHistory(r, 'Permit requested', u);
      return r;
    },
    /* plain edits: status changes must go through the transition action; dates stay consistent */
    update(p, x, u) {
      if ('status' in x && x.status !== p.status) fail('Use the permit workflow actions to change the status', 400);
      if (['Closed', 'Rejected'].includes(p.status) && !atLeast(u, 'Supervisor')) fail(`Permit ${p.id} is ${p.status}`, 403);
      for (const k of ['date_issued', 'ptw_code', 'created_by', 'history']) delete x[k];
      const r = { ...p, ...x };
      ptwDates(r); fillLocation(r);
      if (x.date_upto && x.date_upto !== p.date_upto) pushHistory(r, 'Validity changed to ' + String(x.date_upto).slice(0, 10), u);
      return r;
    }
  },
  other_resources: {
    /* RFE / other resources: one DEFAULT RFE per work request; done-flag and approval are independent */
    insert(r, u) {
      r.id = nextId('other_resources'); r.date_used = r.date_used || now(); r.status = 'Pending';
      r.is_done = false; r.date_approved = null; r.comments = []; r.created_by_name = u.name;
      required(r, ['wr_id', 'description']);
      if (!get('wr', r.wr_id)) fail('Unknown work request: ' + r.wr_id);
      if (r.resource_type === 'DEFAULT RFE' && all('other_resources').some((o) => String(o.wr_id) === String(r.wr_id) && o.resource_type === 'DEFAULT RFE'))
        fail('You cannot assign more than one DEFAULT RFE to one work request.', 409);
      return RULES.other_resources.calc(r);
    },
    update(p, x, u) {
      for (const k of ['status', 'date_approved', 'approved_by', 'is_done']) if (k in x && x[k] !== p[k]) fail('Use the RFE actions (Done / Approve / Reject) for ' + k, 400);
      if (x.resource_type === 'DEFAULT RFE' && p.resource_type !== 'DEFAULT RFE' && all('other_resources').some((o) => String(o.wr_id) === String(p.wr_id) && o.resource_type === 'DEFAULT RFE' && o.id !== p.id))
        fail('You cannot assign more than one DEFAULT RFE to one work request.', 409);
      return RULES.other_resources.calc({ ...p, ...x });
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
    insert(r, u) {
      r.id = nextId('incidents'); r.status = 'Draft'; r.recorded_by = u.username; r.reported_by = r.reported_by || u.name;
      r.incident_area = r.incident_area || 'HS';
      for (let i = 1; i <= 4; i++) { r['approver' + i] = null; r[`approver${i}_status`] = null; r[`approver${i}_comm`] = ''; r[`approver${i}_date`] = null; }
      r.date_approved = null; r.linked_sr_ids = r.linked_sr_ids || [];
      validateIncident(r); return r;
    },
    /* edit lock: only the recorder, and only before the approval chain has started */
    update(p, x, u) {
      if (!incidentEditable(p, u)) fail('This incident can no longer be edited (only the recorder can edit it before approval starts).', 403);
      for (const k of Object.keys(x)) if (/^approver|^status$|^date_approved$|^recorded_by$/.test(k)) delete x[k];
      const r = { ...p, ...x }; validateIncident(r); return r;
    },
    canDelete: (u, row) => incidentEditable(row, u)
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
  },
  /* ERP invoices: approving or marking paid is a finance/supervisor action */
  invoices: {
    update(p, x, u) {
      if ('status' in x && x.status !== p.status && ['Approved', 'Paid'].includes(x.status) && !atLeast(u, 'Finance') && !atLeast(u, 'Supervisor'))
        fail('Only finance can approve or pay invoices', 403);
      if ('paid' in x && x.paid && !p.paid && !atLeast(u, 'Finance') && !atLeast(u, 'Supervisor')) fail('Only finance can mark invoices paid', 403);
      return { ...p, ...x };
    }
  },
  /* Work Completion Certificate: status/approval changes only via the role-guarded actions (submit/approve/verify) */
  wcc: {
    update(p, x, u) {
      for (const k of ['status', 'engineer_approved_by', 'approved_by', 'finance_verified_by', 'verified_by', 'erp_ses_number', 'date_approved', 'date_verified', 'date_submitted']) {
        if (k in x && JSON.stringify(x[k]) !== JSON.stringify(p[k])) fail('Use the WCC actions (Submit / Approve / Verify) to change ' + k, 400);
      }
      return { ...p, ...x };
    }
  },
  /* Service request: enforce who may change what.
     - triage / dispatch / reject / assignment / priority / target  -> Supervisor (facilities engineer) only
     - cancel, rating and feedback                                   -> the requestor (own) or a Supervisor
     - other field edits (notes etc.) are open to any signed-in user */
  service_requests: {
    update(p, x, u) {
      const changed = (k) => k in x && JSON.stringify(x[k]) !== JSON.stringify(p[k]);
      const owns = p.requestor_username ? p.requestor_username === u.username : true;
      const ENGINEER_STATES = ['In Triage', 'Dispatched', 'Rejected'];
      const engineerFields = ['assigned_team', 'wr_id', 'priority', 'target_completion', 'dispatched_to'];
      if ((changed('status') && ENGINEER_STATES.includes(x.status)) || engineerFields.some(changed)) {
        if (!atLeast(u, 'Supervisor')) fail('Only a supervisor / facilities engineer can triage, dispatch or reject service requests', 403);
      }
      if (changed('status') && x.status === 'Cancelled' && !owns && !atLeast(u, 'Supervisor')) fail('You can only cancel your own service requests', 403);
      if ((changed('rating') || changed('satisfaction_rating') || changed('feedback') || changed('feedback_notes')) && !owns && !atLeast(u, 'Supervisor')) fail('You can only rate your own service requests', 403);
      return { ...p, ...x };
    }
  }
};
const READ_ONLY = new Set(['sites', 'buildings', 'floors', 'trades', 'work_teams', 'craftspersons', 'projects', 'departments', 'divisions']);

/* ---------- helpers for the workflow rules ---------- */
function checkProject(code) {
  const pr = get('projects', code); if (!pr) fail('Unknown project: ' + code);
  if (!pr.engineer) fail('Project engineer is missing for the selected project. Please update project details.');
  return pr;
}
function ptwDates(r) {
  if (r.date_start && r.date_upto && r.date_upto < r.date_start) fail('Permit "valid until" date must be on or after the start date');
  if (r.date_end && r.date_start && r.date_end < r.date_start) fail('Permit end date must be on or after the start date');
}
const isOpenWr = (w) => !['Completed', 'Closed', 'Contractor Completed', 'Cancelled', 'Rejected'].includes(w.status);
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
function validateIncident(r) {
  required(r, ['incident_type', 'description', 'date_incident']);
  if (!INCIDENT_AREAS.includes(r.incident_area)) fail('Please select the incident area');
  if (!r.time_incident || !/^\d{2}:\d{2}$/.test(r.time_incident)) fail('Please select the time of the incident (HH:MM)');
  if (new Date(r.date_incident) > new Date()) fail('The incident date cannot be in the future');
  if (r.date_death && new Date(r.date_death) > new Date()) fail('The date of death cannot be in the future');
  if (r.incident_area === 'HS' && r.affected_person && (!r.injury_category || !r.injured_area)) fail('Please provide the injury category and injured area');
}
const approvers = (r) => [1, 2, 3, 4].map((i) => r['approver' + i]).filter(Boolean);
const incidentEditable = (r, u) => (r.recorded_by === u.username || atLeast(u, 'Administrator')) && ['Draft', 'Rejected'].includes(r.status); // a rejected incident goes back to the recorder for changes
/* SEC (security) incidents are visible only to the recorder, the assigned approvers and administrators */
const canSeeIncident = (r, u) => r.incident_area !== 'SEC' || r.recorded_by === u.username || approvers(r).includes(u.username) || atLeast(u, 'Administrator');
const VISIBLE = { incidents: canSeeIncident };
const visibleRows = (t, rows, u) => (VISIBLE[t] ? rows.filter((r) => VISIBLE[t](r, u)) : rows);

/* ---------- workflow actions: POST /api/act/:table/:id/:action  (id "_bulk" for multi-record actions) ----------
   each returns { row?, related?: { table: [rows] }, warnings?: [] } */
const ACTIONS = {
  ptw: {
    transition(p, b, u) {
      const to = b.to; oneOf(to, PTW_STATUS, 'permit status');
      if (!(PTW_NEXT[p.status] || []).includes(to)) fail(`A permit cannot move from "${p.status}" to "${to}"`, 409);
      const applicantSide = PTW_APPLICANT_STEPS.has(to);
      const isApplicant = p.applicant_username === u.username || p.created_by === u.username;
      if (applicantSide && !isApplicant && !atLeast(u, 'Supervisor')) fail('Only the permit applicant can do this', 403);
      if (!applicantSide && !atLeast(u, 'Supervisor')) fail(`Only a controller / authority (supervisor) can set "${to}"`, 403);
      if (to === 'Rejected' && !String(b.reason || '').trim()) fail('Please give a reason for rejecting the permit');
      const r = { ...p, status: to };
      if (PTW_ISSUED.has(to)) r.date_issued = now();
      if (to === 'Re Issued' && p.requested_date_upto) { r.date_upto = p.requested_date_upto; delete r.requested_date_upto; }
      if (to === 'Closed') { r.date_closed = now(); r.date_end = r.date_end || now(); }
      if (to === 'Rejected') r.reject_reason = b.reason;
      pushHistory(r, `Status: ${p.status} → ${to}${b.reason ? ' — ' + b.reason : ''}`, u);
      const related = all('wr').filter((w) => String(w.ptw_id) === String(p.id)).map((w) => put('wr', { ...w, ptw_status: to }));
      return { row: r, related: { wr: related } };
    },
    renew(p, b, u) {
      if (!PTW_ISSUED.has(p.status)) fail('Only an issued permit can be renewed', 409);
      if (!b.date_upto) fail('Please give the new "valid until" date');
      if (b.date_upto <= (p.date_upto || '')) fail('The new validity must be later than the current one');
      return ACTIONS.ptw.transition({ ...p, requested_date_upto: b.date_upto }, { to: 'Waiting For Re Issuing', reason: 'Renewal requested until ' + String(b.date_upto).slice(0, 10) }, u);
    },
    stop(p, b, u) {
      if (!atLeast(u, 'Supervisor')) fail('Only an authority (supervisor) can stop a permit', 403);
      if (!PTW_ISSUED.has(p.status)) fail('Only an issued permit can be stopped', 409);
      if (!String(b.reason || '').trim()) fail('Please give a reason for stopping the permit');
      const r = { ...p, date_end: now(), stop_reason: b.reason }; pushHistory(r, 'Permit stopped — ' + b.reason, u);
      return { row: r };
    },
    /* one permit for several work requests (Create PTW from the WR grids) */
    from_wrs(_, b, u) {
      const ids = Array.isArray(b.wr_ids) ? b.wr_ids : [];
      if (!ids.length) fail('Please select at least one work request');
      const wrs = ids.map((id) => get('wr', id) || fail('Unknown work request: ' + id));
      const bad = wrs.find((w) => /PTW-/.test(w.prob_type || '')); if (bad) fail(`Work request ${bad.id} is itself a permit/isolation request and cannot get a permit`);
      const has = wrs.find((w) => w.ptw_id); if (has) fail(`Work request ${has.id} already has permit ${has.ptw_id}`, 409);
      const first = wrs[0];
      const starts = wrs.map((w) => w.date_to_perform).filter(Boolean).sort();
      const r = RULES.ptw.insert({ __from_wrs: true, site_id: first.site_id, bl_id: first.bl_id, fl_id: first.fl_id, project_code: first.project_code || null,
        description: b.description || `Permit for work request${wrs.length > 1 ? 's' : ''} ${ids.join(', ')}`, work_team: first.work_team,
        date_start: starts[0] || now(), date_upto: b.date_upto || new Date(Date.now() + 7 * 864e5).toISOString(), work_type: b.work_type || 'Cold Work' }, u);
      r.created_by = u.username; r.created_at = now(); put('ptw', r); audit(u, 'insert', 'ptw', r.id, { from_wrs: ids });
      const related = wrs.map((w) => put('wr', { ...w, ptw_id: r.id, ptw_status: r.status }));
      return { row: r, related: { ptw: [r], wr: related }, created: true };
    }
  },
  wr: {
    /* Issue selected WRs (Assigned to Work Order → Issued and In Process). Soft gate: permit missing / not issued needs confirm:true */
    issue(_, b, u) {
      const ids = Array.isArray(b.wr_ids) ? b.wr_ids : [];
      if (!ids.length) fail('Please select at least one work request');
      const wrs = ids.map((id) => get('wr', id) || fail('Unknown work request: ' + id));
      const notReady = wrs.find((w) => w.status !== 'Assigned to Work Order'); if (notReady) fail(`Work request ${notReady.id} is "${notReady.status}"; only "Assigned to Work Order" can be issued`, 409);
      const warnings = [];
      if (wrs.some((w) => !w.ptw_id)) warnings.push('PTW is not created for one of the requests.');
      if (wrs.some((w) => w.ptw_id && !PTW_ISSUED.has((get('ptw', w.ptw_id) || {}).status))) warnings.push('PTW is not issued for one of the work requests.');
      if (warnings.length && b.confirm !== true) { const e = new HttpError(409, warnings.join(' ') + ' Confirm to continue.'); e.warnings = warnings; throw e; }
      const related = wrs.map((w) => { const r = { ...w, status: 'Issued and In Process', date_issued: now() }; pushHistory(r, 'Status: Assigned to Work Order → Issued and In Process', u); r.updated_by = u.username; r.updated_at = now(); audit(u, 'issue', 'wr', w.id, { warnings }); return put('wr', r); });
      return { related: { wr: related }, warnings };
    }
  },
  other_resources: {
    done(p, b, u) { if (p.is_done) fail('Already marked done', 409); const r = { ...p, is_done: true, date_done: now(), done_by: u.name }; return { row: r }; },
    approve(p, b, u) {
      if (!atLeast(u, 'Supervisor')) fail('Only a supervisor can approve estimations', 403);
      if (p.status !== 'Pending') fail(`This estimation is already ${p.status}`, 409);
      return { row: { ...p, status: 'Approved', date_approved: now(), approved_by: u.name, variation: b.variation === true || !!p.variation } };
    },
    reject(p, b, u) {
      if (!atLeast(u, 'Supervisor')) fail('Only a supervisor can reject estimations', 403);
      if (p.status !== 'Pending') fail(`This estimation is already ${p.status}`, 409);
      if (!String(b.comment || '').trim()) fail('Please give a comment for the rejection');
      const r = { ...p, status: 'Rejected', approved_by: u.name, comments: [...(p.comments || []), { date: now(), by: u.name, text: b.comment }] };
      return { row: r };
    },
    comment(p, b, u) { if (!String(b.comment || '').trim()) fail('Comment is empty'); return { row: { ...p, comments: [...(p.comments || []), { date: now(), by: u.name, text: b.comment }] } }; }
  },
  iso: {
    /* completion guard: earlier ISO/De-ISO requests on the same permit, and the linked isolation WR, must be finished first */
    complete(p, b, u) {
      if (p.status === 'Completed') fail('Already completed', 409);
      const earlier = all('iso').filter((o) => o.id !== p.id && p.ptw_id && String(o.ptw_id) === String(p.ptw_id) && o.status !== 'Completed' && String(o.date_requested) < String(p.date_requested));
      if (earlier.length) fail('Please complete the previous ISO/De-ISO requests first (' + earlier.map((o) => o.id).join(', ') + ').', 409);
      const w = p.wr_id && get('wr', p.wr_id);
      if (w && w.prep_wr_id) { const prep = get('wr', w.prep_wr_id); if (prep && isOpenWr(prep)) fail(`Please complete the corresponding isolation work request #${prep.id} first.`, 409); }
      const r = { ...p, status: 'Completed', date_completed: now(), completed_by: u.name };
      return { row: r };
    }
  },
  incidents: {
    submit(p, b, u) {
      if (!incidentEditable(p, u)) fail('Only the recorder can send this incident for approval, and only once', 403);
      const list = (Array.isArray(b.approvers) ? b.approvers : []).map((x) => String(x || '').trim());
      if (!list[0]) fail('Please select approver 1');
      const chosen = list.filter(Boolean);
      if (new Set(chosen).size !== chosen.length) fail('Approvers must be different people');
      if (chosen.includes(p.recorded_by)) fail('The recorder cannot approve their own incident');
      chosen.forEach((x) => { if (!q.userByName.get(x)) fail('Unknown approver: ' + x); });
      const r = { ...p, status: 'Submitted' };
      for (let i = 1; i <= 4; i++) { r['approver' + i] = list[i - 1] || null; r[`approver${i}_status`] = list[i - 1] ? 'Submitted' : null; r[`approver${i}_comm`] = ''; r[`approver${i}_date`] = null; }
      return { row: r };
    },
    approve(p, b, u) { return ACTIONS.incidents._decide(p, b, u, 'Approved'); },
    reject(p, b, u) { if (!String(b.comment || '').trim()) fail('Please provide a comment for the rejection'); return ACTIONS.incidents._decide(p, b, u, 'Rejected'); },
    _decide(p, b, u, decision) {
      if (p.status !== 'Submitted') fail(`This incident is ${p.status}`, 409);
      // approvers decide in order: the current one is the first still "Submitted"
      const i = [1, 2, 3, 4].find((k) => p['approver' + k] && p[`approver${k}_status`] === 'Submitted');
      if (!i) fail('No approval is pending', 409);
      if (p['approver' + i] !== u.username && !atLeast(u, 'Administrator')) fail('It is not your turn to approve this incident', 403);
      const r = { ...p, [`approver${i}_status`]: decision, [`approver${i}_comm`]: String(b.comment || ''), [`approver${i}_date`]: now() };
      if (decision === 'Rejected') r.status = 'Rejected';
      else if (![1, 2, 3, 4].some((k) => r['approver' + k] && r[`approver${k}_status`] !== 'Approved')) { r.status = 'Approved'; r.date_approved = now(); }
      return { row: r };
    }
  },
  service_requests: {
    triage(p, b, u) {
      if (!atLeast(u, 'Supervisor')) fail('Only a supervisor/engineer can triage requests', 403);
      const r = { ...p, status: 'In Triage', priority: b.priority || p.priority || '2', dispatched_to: b.dispatched_to || 'SONU Contracting Services' };
      return { row: r };
    },
    dispatch(p, b, u) {
      if (!atLeast(u, 'Supervisor')) fail('Only a supervisor/engineer can dispatch requests', 403);
      const r = { ...p, status: 'Dispatched', dispatched_to: b.dispatched_to || 'SONU Contracting Services', target_completion: b.target_completion || p.target_completion };
      return { row: r };
    },
    complete(p, b, u) {
      const r = { ...p, status: 'Completed', date_completed: now() };
      return { row: r };
    },
    rate(p, b, u) {
      if (p.requestor_username && p.requestor_username !== u.username && !atLeast(u, 'Supervisor')) fail('You can only rate your own service requests', 403);
      const rating = Number(b.rating);
      if (!rating || rating < 1 || rating > 5) fail('Rating must be between 1 and 5 stars');
      const r = { ...p, rating, feedback: String(b.feedback || '').trim() };
      return { row: r };
    }
  },
  wcc: {
    submit(p, b, u) {
      if (p.status !== 'Draft') fail('Only draft WCCs can be submitted', 409);
      const r = { ...p, status: 'Submitted', submitted_by: u.name, date_submitted: now() };
      return { row: r };
    },
    approve(p, b, u) {
      if (!atLeast(u, 'Supervisor')) fail('Only a supervisor/engineer can approve WCCs', 403);
      if (p.status !== 'Submitted') fail('Only submitted WCCs can be approved', 409);
      const r = { ...p, status: 'Approved by Engineer', engineer_approved_by: u.name, approved_by: u.name, date_approved: now() };
      return { row: r };
    },
    verify(p, b, u) {
      if (!atLeast(u, 'Finance') && !atLeast(u, 'Supervisor')) fail('Only finance can verify WCCs for ERP payment', 403);
      if (p.status !== 'Approved by Engineer') fail('Only engineer-approved WCCs can be verified', 409);
      const ses = b.erp_ses_number || 'SES-' + (840000 + (numPart(p.id) || 0));
      const r = { ...p, status: 'Verified by Finance', finance_verified_by: u.name, verified_by: u.name, date_verified: now(), erp_ses_number: ses };
      return { row: r };
    }
  },
  desk_bookings: {
    cancel(p, b, u) {
      if (p.booked_by_username !== u.username && !atLeast(u, 'Supervisor')) fail('You can only cancel your own bookings', 403);
      const r = { ...p, status: 'Cancelled' };
      return { row: r };
    }
  }
};

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
    for (const t of TABLES) tables[t] = visibleRows(t, all(t), user);
    tables.users = db.prepare('SELECT id, username, profile FROM users').all().map((u) => ({ id: u.id, username: u.username, ...JSON.parse(u.profile) }));
    return send(res, 200, { user: publicUser(user), tables });
  }

  if (p === '/api/reset' && m === 'POST') {
    if (!atLeast(user, 'Administrator')) fail('Only an administrator can reset the demo data.', 403);
    reseedDocs(); audit(user, 'reset'); return send(res, 200, { ok: true }); // demo data only; user accounts are kept
  }
  if (p === '/api/audit' && m === 'GET') {
    if (!atLeast(user, 'Supervisor')) fail('Not permitted', 403);
    return send(res, 200, q.auditList.all().map((a) => ({ ...a, detail: a.detail ? JSON.parse(a.detail) : null })));
  }

  /* workflow actions: POST /api/act/:table/:id/:action (id "_bulk" for multi-record actions) */
  const am = p.match(/^\/api\/act\/([a-z_]+)\/([^/]+)\/([a-z_]+)$/);
  if (am && m === 'POST') {
    const [, t, rawId, name] = am; const id = decodeURIComponent(rawId);
    const fn = ACTIONS[t] && !name.startsWith('_') && ACTIONS[t][name];
    if (!fn) fail('Unknown action: ' + t + '/' + name, 404);
    const body = await readBody(req);
    let prev = null;
    if (id !== '_bulk') { prev = get(t, id); if (!prev || !visibleRows(t, [prev], user).length) fail('Not found', 404); }
    const out = fn.call(ACTIONS[t], prev, body || {}, user) || {};
    if (out.row && !out.created) {
      const row = { ...out.row, id: prev.id, updated_by: user.username, updated_at: now() }; put(t, row); out.row = row;
      audit(user, name, t, prev.id, Object.fromEntries(Object.keys(row).filter((k) => !['history', 'updated_at', 'updated_by'].includes(k) && JSON.stringify(prev[k]) !== JSON.stringify(row[k])).map((k) => [k, { from: prev[k], to: row[k] }])));
    }
    return send(res, 200, { row: out.row || null, related: out.related || {}, warnings: out.warnings || [] });
  }

  const tm = p.match(/^\/api\/t\/([a-z_]+)(?:\/([^/]+))?$/);
  if (tm) {
    const [, t, rawId] = tm; const id = rawId && decodeURIComponent(rawId);
    if (t === 'users' || !TABLES.has(t)) fail('Unknown table: ' + t, 404);
    const rule = RULES[t] || {};
    if (m === 'GET') {
      if (!id) return send(res, 200, visibleRows(t, all(t), user));
      const row = get(t, id); if (!row || !visibleRows(t, [row], user).length) fail('Not found', 404); return send(res, 200, row);
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
      const prev = get(t, id); if (!prev || !visibleRows(t, [prev], user).length) fail('Not found', 404);
      const patch = sanitize(await readBody(req));
      const row = rule.update ? rule.update(prev, patch, user) : { ...prev, ...patch };
      row.id = prev.id; row.updated_by = user.username; row.updated_at = now();
      put(t, row);
      const changed = Object.fromEntries(Object.keys(patch).filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(row[k])).map((k) => [k, { from: prev[k], to: row[k] }]));
      audit(user, 'update', t, id, changed);
      return send(res, 200, row);
    }
    if (m === 'DELETE' && id) {
      const prev = get(t, id); if (!prev || !visibleRows(t, [prev], user).length) fail('Not found', 404);
      const allowed = rule.canDelete ? rule.canDelete(user, prev) : atLeast(user, 'Administrator');
      if (!allowed) fail('You are not allowed to delete this record', 403);
      q.del.run(t, String(id)); audit(user, 'delete', t, id, prev);
      return send(res, 200, { ok: true });
    }
  }
  fail('Not found', 404);
}

/* ============================== static ============================== */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const PUBLIC = [/^\/(index|app)\.html$/,/^\/css\/[\w.-]+\.css$/, /^\/js\/[\w.-]+\.js$/, /^\/assets\/[\w.-]+$/];
/* Cache busting: every css/js/assets reference in HTML, CSS and JS responses gets ?v=<content hash>,
   so a deploy can never be mixed with stale copies held by browsers or Cloudflare. Versioned requests
   are cached for a year (immutable); unversioned ones and HTML are always revalidated. */
const versions = new Map(); // abs path -> { mtimeMs, size, v }
function versionOf(rel) {
  const f = path.join(ROOT, rel);
  try {
    const st = fs.statSync(f); const c = versions.get(f);
    if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) return c.v;
    const v = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 10);
    versions.set(f, { mtimeMs: st.mtimeMs, size: st.size, v }); return v;
  } catch (e) { return null; }
}
function stampRefs(text, baseDir) {
  const stamp = (ref) => { const rel = ref[0] === '/' ? path.posix.normalize(ref) : path.posix.normalize(path.posix.join(baseDir, ref)); const v = versionOf(rel); return v ? `${ref}?v=${v}` : ref; };
  return text
    .replace(/((?:href|src)=["'])((?:\.\.\/|\/)?(?:css|js|assets)\/[\w./-]+?)(?:\?v=[\w.-]*)?(["'])/g, (m, a, ref, b) => a + stamp(ref) + b)
    .replace(/(url\(["']?)((?:\.\.\/|\/)?(?:css|js|assets)\/[\w./-]+?)(?:\?v=[\w.-]*)?(["']?\))/g, (m, a, ref, b) => a + stamp(ref) + b);
}
function redirect(res, loc) { res.writeHead(301, { Location: loc, 'Cache-Control': 'no-cache' }); res.end(); }
function serveStatic(req, res, url) {
  let p;
  try { p = decodeURIComponent(url.pathname); } catch (e) { return send(res, 400, 'Bad request'); }
  if (p === '/index.html') return redirect(res, '/' + url.search);
  if (p === '/app.html') return redirect(res, '/app' + url.search);
  if (p === '/' || p === '/login') p = '/index.html';
  else if (p === '/app' || p.startsWith('/app/')) p = '/app.html';
  if (!PUBLIC.some((r) => r.test(p))) return send(res, 404, 'Not found');
  const f = path.join(ROOT, p); const ext = path.extname(f);
  fs.readFile(f, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    let body = data;
    // CSS url()s resolve against the stylesheet; HTML/JS strings resolve against the page (site root)
    if (['.html', '.css', '.js'].includes(ext)) body = stampRefs(data.toString('utf8'), ext === '.css' ? path.posix.dirname(p) : '/');
    const versioned = url.searchParams.has('v') && ext !== '.html';
    res.writeHead(200, {
      'Content-Type': (TYPES[ext] || 'application/octet-stream') + '; charset=utf-8',
      'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    res.end(body);
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
    if (e instanceof HttpError) send(res, e.status, e.warnings ? { error: e.message, warnings: e.warnings } : { error: e.message });
    else { console.error(e); send(res, 500, { error: 'Server error' }); }
  }
});
server.listen(PORT, () => console.log(`SONU running at http://localhost:${PORT}${TRUST_PROXY ? ' (behind proxy)' : ''}`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { server.close(); try { db.close(); } catch (e) {} process.exit(0); });
