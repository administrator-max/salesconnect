#!/usr/bin/env node
/**
 * Neon (Postgres) -> Google Sheets migration for SalesConnect.
 *
 * It (1) creates the required tabs + header rows in both spreadsheets and
 * (2) copies ALL data from the two Neon databases, transforming the relational
 * shape into the flat Sheets schema the PHP app expects.
 *
 * WHERE TO RUN: your own computer — NOT the Cowork sandbox (that has no network
 * to Neon or Google). Run it from INSIDE the salesconnect/ folder so it can read
 * ../cil/.env, ../taskflow/.env and ./secure/service_account.json.
 *
 * REQUIREMENTS:
 *   Node.js >= 18   (uses built-in fetch + crypto)
 *   npm install pg
 *
 * RUN:
 *   node tools/migrate_neon_to_sheets.js
 *
 * NOTE: each tab is REPLACED (cleared, then rewritten). Running setup.php is not
 * needed if you migrate — this script also creates the tabs. Safe to re-run.
 */

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let Client;
try { ({ Client } = require('pg')); }
catch { console.error('Missing dependency. Run:  npm install pg'); process.exit(1); }

// ── CONFIG ────────────────────────────────────────────────────────────────
const ROOT            = path.resolve(__dirname, '..');            // salesconnect/
const SERVICE_ACCOUNT = path.join(ROOT, 'secure', 'service_account.json');
const CIL_SHEET       = '1TYDed6FlNbDQDa1zrqQr989myZO9C50GJqdM1pIPIsg';
const TASKFLOW_SHEET  = '1U5J4T9jNcKji--VDpJOFkgs2VMLm6wLAtdr8mtL-164';
const CIL_ENV         = path.join(ROOT, '..', 'cil', '.env');
const TASKFLOW_ENV    = path.join(ROOT, '..', 'taskflow', '.env');
// ────────────────────────────────────────────────────────────────────────────

function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function neonConnString(env) {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.PGHOST) {
    const u = encodeURIComponent(env.PGUSER || '');
    const p = encodeURIComponent(env.PGPASSWORD || '');
    const port = env.PGPORT || 5432;
    return `postgresql://${u}:${p}@${env.PGHOST}:${port}/${env.PGDATABASE || 'neondb'}?sslmode=require`;
  }
  return null;
}

// ── Google auth: service-account JWT -> access token ────────────────────────
function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  }));
  const input = `${header}.${claim}`;
  const sig = crypto.createSign('RSA-SHA256').update(input).sign(sa.private_key);
  const assertion = `${input}.${b64url(sig)}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('OAuth failed: ' + JSON.stringify(j));
  return j.access_token;
}

// ── Sheets helpers ──────────────────────────────────────────────────────────
const SB = (id) => `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`;

async function sapi(token, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  const j = txt ? JSON.parse(txt) : {};
  if (!res.ok) throw new Error(`Sheets ${res.status}: ${(j.error && j.error.message) || txt}`);
  return j;
}

async function ensureTabs(token, id, tabs) {
  const meta = await sapi(token, 'GET', `${SB(id)}?fields=sheets.properties(title)`);
  const have = new Set((meta.sheets || []).map((s) => s.properties.title));
  const reqs = tabs.filter((t) => !have.has(t)).map((t) => ({ addSheet: { properties: { title: t } } }));
  if (reqs.length) await sapi(token, 'POST', `${SB(id)}:batchUpdate`, { requests: reqs });
}

async function writeTab(token, id, tab, header, rows) {
  await sapi(token, 'POST', `${SB(id)}/values/${encodeURIComponent(tab)}:clear`, {});
  await sapi(token, 'PUT',
    `${SB(id)}/values/${encodeURIComponent(tab)}!A1?valueInputOption=RAW`,
    { values: [header, ...rows] });
  console.log(`  ✓ ${tab}: ${rows.length} row(s)`);
}

// ── TaskFlow migration ──────────────────────────────────────────────────────
async function migrateTaskflow(token) {
  const conn = neonConnString(parseEnv(TASKFLOW_ENV));
  if (!conn) { console.log('TaskFlow: no Neon credentials found, skipped.'); return; }
  const db = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await db.connect();
  console.log('TaskFlow: connected to Neon');
  await ensureTabs(token, TASKFLOW_SHEET, ['staff', 'tasks']);

  const staff = (await db.query(
    `SELECT id, name, position,
            to_char(created_at,'YYYY-MM-DD HH24:MI:SS') created_at
     FROM staff ORDER BY created_at`)).rows;
  await writeTab(token, TASKFLOW_SHEET, 'staff',
    ['id', 'name', 'position', 'created_at'],
    staff.map((s) => [s.id, s.name, s.position, s.created_at || '']));

  const tasks = (await db.query(
    `SELECT id, title, description, from_staff_id, to_staff_id, status,
            to_char(proposed_deadline,'YYYY-MM-DD"T"HH24:MI') proposed_deadline,
            to_char(deadline,'YYYY-MM-DD"T"HH24:MI') deadline,
            deadline_revised, reject_reason, completion_note,
            to_char(created_at,'YYYY-MM-DD HH24:MI:SS') created_at,
            to_char(updated_at,'YYYY-MM-DD HH24:MI:SS') updated_at
     FROM tasks ORDER BY created_at`)).rows;
  await writeTab(token, TASKFLOW_SHEET, 'tasks',
    ['id', 'title', 'description', 'from', 'to', 'status', 'proposed_deadline',
     'deadline', 'deadline_revised', 'reject_reason', 'completion_note', 'created_at', 'updated_at'],
    tasks.map((t) => [
      t.id, t.title, t.description || '', t.from_staff_id, t.to_staff_id, t.status,
      t.proposed_deadline || '', t.deadline || '', t.deadline_revised ? 'TRUE' : 'FALSE',
      t.reject_reason || '', t.completion_note || '', t.created_at || '', t.updated_at || '',
    ]));
  await db.end();
}

// ── CIL migration ───────────────────────────────────────────────────────────
async function migrateCil(token) {
  const conn = neonConnString(parseEnv(CIL_ENV));
  if (!conn) { console.log('CIL: no Neon credentials found, skipped.'); return; }
  const db = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await db.connect();
  console.log('CIL: connected to Neon');
  await ensureTabs(token, CIL_SHEET,
    ['companies', 'salespeople', 'records', 'discussions', 'complaints', 'complaint_responses']);

  const companies = (await db.query(`SELECT id, name FROM companies ORDER BY name`)).rows;
  await writeTab(token, CIL_SHEET, 'companies', ['id', 'name'],
    companies.map((c) => [String(c.id), c.name]));

  const sales = (await db.query(`SELECT id, name FROM salespeople ORDER BY name`)).rows;
  await writeTab(token, CIL_SHEET, 'salespeople', ['id', 'name'],
    sales.map((s) => [String(s.id), s.name]));

  const recs = (await db.query(
    `SELECT cr.id, c.name company, sp.name sales_rep, cr.contact_person, cr.channel,
            to_char(cr.comm_date,'YYYY-MM-DD') comm_date,
            to_char(cr.comm_time,'HH24:MI') comm_time,
            cr.location, cr.urgent_follow_up, cr.follow_up_note,
            to_char(cr.follow_up_deadline,'YYYY-MM-DD') follow_up_deadline,
            to_char(cr.created_at,'YYYY-MM-DD HH24:MI:SS') created_at
     FROM communication_records cr
     JOIN companies   c  ON c.id  = cr.company_id
     JOIN salespeople sp ON sp.id = cr.sales_rep_id
     ORDER BY cr.comm_date`)).rows;

  const recRows = [];
  const discRows = [];
  for (const r of recs) {
    const parts = (await db.query(
      `SELECT participant_name FROM comm_participants WHERE comm_record_id=$1 ORDER BY sort_order`,
      [r.id])).rows.map((p) => p.participant_name);
    recRows.push([
      r.id, r.company, r.sales_rep, r.contact_person, r.channel,
      r.comm_date || '', r.comm_time || '', r.location || '',
      r.urgent_follow_up ? 'TRUE' : 'FALSE', r.follow_up_note || '', r.follow_up_deadline || '',
      JSON.stringify(parts), r.created_at || '', 'FALSE',
    ]);
    const discs = (await db.query(
      `SELECT id, topic FROM comm_discussions WHERE comm_record_id=$1 ORDER BY sort_order`,
      [r.id])).rows;
    let di = 0;
    for (const d of discs) {
      const pts = (await db.query(
        `SELECT point_text FROM discussion_points WHERE discussion_id=$1 ORDER BY sort_order`,
        [d.id])).rows.map((p) => p.point_text);
      if (pts.length === 0) {
        discRows.push([r.id, di, d.topic || '', 0, '']);
      } else {
        pts.forEach((pt, pi) => discRows.push([r.id, di, d.topic || '', pi, pt]));
      }
      di++;
    }
  }
  await writeTab(token, CIL_SHEET, 'records',
    ['id', 'company', 'sales_rep', 'contact_person', 'channel', 'date', 'time', 'location',
     'urgent_follow_up', 'follow_up_note', 'follow_up_deadline', 'participants', 'created_at', 'deleted'],
    recRows);
  await writeTab(token, CIL_SHEET, 'discussions',
    ['record_id', 'disc_order', 'topic', 'point_order', 'point'], discRows);

  const comps = (await db.query(
    `SELECT cpl.id, co.name company, sp.name assigned_to, cpl.contact_person, cpl.priority,
            cpl.status, cpl.detail,
            to_char(cpl.date_in,'YYYY-MM-DD') date_in,
            to_char(cpl.time_in,'HH24:MI') time_in,
            to_char(cpl.next_follow_up,'YYYY-MM-DD') next_follow_up,
            to_char(cpl.created_at,'YYYY-MM-DD HH24:MI:SS') created_at
     FROM complaints cpl
     JOIN companies   co ON co.id = cpl.company_id
     JOIN salespeople sp ON sp.id = cpl.assigned_to_id
     ORDER BY cpl.date_in`)).rows;
  await writeTab(token, CIL_SHEET, 'complaints',
    ['id', 'company', 'assigned_to', 'contact_person', 'priority', 'status', 'detail',
     'date_in', 'time_in', 'next_follow_up', 'created_at', 'deleted'],
    comps.map((c) => [
      c.id, c.company, c.assigned_to, c.contact_person, c.priority, c.status, c.detail,
      c.date_in || '', c.time_in || '', c.next_follow_up || '', c.created_at || '', 'FALSE',
    ]));

  const resp = (await db.query(
    `SELECT cr.id, cr.complaint_id, sp.name by_name,
            to_char(cr.response_date,'YYYY-MM-DD') rdate,
            to_char(cr.response_time,'HH24:MI') rtime,
            cr.note,
            to_char(cr.created_at,'YYYY-MM-DD HH24:MI:SS') created_at
     FROM complaint_responses cr
     JOIN salespeople sp ON sp.id = cr.responded_by_id
     ORDER BY cr.response_date`)).rows;
  await writeTab(token, CIL_SHEET, 'complaint_responses',
    ['id', 'complaint_id', 'by', 'date', 'time', 'note', 'created_at'],
    resp.map((r) => [
      r.id, r.complaint_id, r.by_name, r.rdate || '', r.rtime || '', r.note, r.created_at || '',
    ]));
  await db.end();
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  if (!fs.existsSync(SERVICE_ACCOUNT)) {
    throw new Error('Service account not found at ' + SERVICE_ACCOUNT);
  }
  const sa = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
  console.log('Service account:', sa.client_email);
  console.log('(Make sure BOTH spreadsheets are shared with this email as Editor.)\n');
  const token = await getAccessToken(sa);
  console.log('Google auth OK\n');

  console.log('── CIL ──');
  await migrateCil(token);
  console.log('\n── TaskFlow ──');
  await migrateTaskflow(token);

  console.log('\n✅ Migration complete. Reload SalesConnect to see the data.');
})().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
