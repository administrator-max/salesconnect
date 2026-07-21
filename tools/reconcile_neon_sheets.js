#!/usr/bin/env node
/**
 * Neon <-> Google Sheets RECONCILIATION (READ-ONLY) for SalesConnect.
 *
 * This script NEVER writes to Neon or Sheets. It reads both sides for the CIL &
 * TaskFlow modules, rebuilds the canonical "what Neon would look like in Sheets"
 * rows using the SAME transform as tools/migrate_neon_to_sheets.js, then diffs
 * that against the ACTUAL Sheets tabs and reports:
 *
 *   • matched & equal      — row present on both sides, identical
 *   • matched but differs   — same key, different content (someone edited Sheets)
 *   • Neon-only (missing)   — in Neon but NOT in Sheets  → backfill CANDIDATE (needs approval)
 *   • Sheets-only (extra)   — in Sheets but NOT in Neon   → new SalesConnect edits (KEEP & FLAG)
 *
 * Context: Sheets is the live source of truth; Neon is a frozen snapshot. So we
 * EXPECT Sheets ⊇ Neon (no Neon-only rows). Any Neon-only row is a surprise worth
 * a look. Sheets-only rows are normal and are only listed, never touched.
 *
 * WHERE TO RUN: a machine WITH network to Neon + Google (NOT the Cowork sandbox).
 * Run from INSIDE salesconnect/ so it can read ../cil/.env, ../taskflow/.env and
 * ./secure/service_account.json.
 *
 * REQUIREMENTS:  Node >= 18 (built-in fetch + crypto),  npm install pg
 *
 * RUN:
 *   node tools/reconcile_neon_sheets.js                 # full report -> reports/reconcile_<ts>.md
 *   node tools/reconcile_neon_sheets.js --samples 50    # show up to 50 ids per bucket (default 25)
 *   node tools/reconcile_neon_sheets.js --stdout        # also dump the report to stdout
 *
 * It is inherently idempotent and safe to re-run (read-only).
 */

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let Client;
try { ({ Client } = require('pg')); }
catch { console.error('Missing dependency. Run:  npm install pg'); process.exit(1); }

// ── CONFIG ────────────────────────────────────────────────────────────────
const ROOT            = path.resolve(__dirname, '..');
const SERVICE_ACCOUNT = path.join(ROOT, 'secure', 'service_account.json');
const CIL_SHEET       = '1TYDed6FlNbDQDa1zrqQr989myZO9C50GJqdM1pIPIsg';
const TASKFLOW_SHEET  = '1U5J4T9jNcKji--VDpJOFkgs2VMLm6wLAtdr8mtL-164';
const CIL_ENV         = path.join(ROOT, '..', 'cil', '.env');
const TASKFLOW_ENV    = path.join(ROOT, '..', 'taskflow', '.env');
const REPORT_DIR      = path.join(ROOT, 'reports');

// ── args ────────────────────────────────────────────────────────────────────
const ARGV = process.argv.slice(2);
const SAMPLES = (() => {
  const i = ARGV.indexOf('--samples');
  const n = i >= 0 ? parseInt(ARGV[i + 1], 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 25;
})();
const ALSO_STDOUT = ARGV.includes('--stdout');

// ── env parsing ───────────────────────────────────────────────────────────
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

// ── Google auth (service-account JWT -> access token) ──────────────────────
function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    // read-only scope — this token cannot write even if we wanted it to
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  }));
  const input = `${header}.${claim}`;
  const sig = crypto.createSign('RSA-SHA256').update(input).sign(sa.private_key);
  const assertion = `${input}.${b64url(sig)}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('OAuth failed: ' + JSON.stringify(j));
  return j.access_token;
}
const SB = (id) => `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`;
async function sheetsGet(token, id, tab) {
  const url = `${SB(id)}/values/${encodeURIComponent(tab)}?majorDimension=ROWS`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const txt = await res.text();
  const j = txt ? JSON.parse(txt) : {};
  if (res.status === 400 && /Unable to parse range/.test(j.error?.message || '')) return null; // tab missing
  if (!res.ok) throw new Error(`Sheets ${res.status}: ${(j.error && j.error.message) || txt}`);
  return j.values || [];
}

// ── diff helpers ───────────────────────────────────────────────────────────
const S = (v) => (v === null || v === undefined ? '' : String(v));
/** Collision-free key/equality via JSON (avoids fragile delimiter chars). */
const rowKey = (cells) => JSON.stringify(cells);

/** Align a raw Sheets values[] (incl. header) to expectedHeader order, keyed by keyFn. */
function indexSheet(values, expectedHeader, keyFn) {
  const map = new Map();
  if (!values || values.length === 0) return { map, headerPresent: false };
  const sheetHeader = (values[0] || []).map((h) => S(h).trim());
  const colIdx = expectedHeader.map((name) => sheetHeader.indexOf(name));
  for (let r = 1; r < values.length; r++) {
    const raw = values[r] || [];
    if (raw.every((c) => S(c) === '')) continue; // skip blank row
    const cells = expectedHeader.map((_, i) => (colIdx[i] >= 0 ? S(raw[colIdx[i]]) : ''));
    map.set(keyFn(cells), cells);
  }
  return { map, headerPresent: true };
}
/** Index the canonical Neon-derived rows (already in expectedHeader order). */
function indexNeon(rows, keyFn) {
  const map = new Map();
  for (const r of rows) { const cells = r.map(S); map.set(keyFn(cells), cells); }
  return map;
}
function diffTab(name, expectedHeader, neonRows, sheetValues, keyFn) {
  const neon = indexNeon(neonRows, keyFn);
  const { map: sheet, headerPresent } = indexSheet(sheetValues, expectedHeader, keyFn);
  const bothEqual = [], bothDiff = [], neonOnly = [], sheetOnly = [];
  for (const [k, nCells] of neon) {
    if (!sheet.has(k)) { neonOnly.push(k); continue; }
    (rowKey(nCells) === rowKey(sheet.get(k)) ? bothEqual : bothDiff).push(k);
  }
  for (const k of sheet.keys()) if (!neon.has(k)) sheetOnly.push(k);
  return {
    name, headerPresent,
    neonCount: neon.size, sheetCount: sheet.size,
    bothEqual, bothDiff, neonOnly, sheetOnly,
  };
}

// ── Neon → canonical rows (mirrors migrate_neon_to_sheets.js exactly) ──────
async function neonCilTabs(env) {
  const conn = neonConnString(env);
  if (!conn) return null;
  const db = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const out = {};

  out.companies = {
    header: ['id', 'name'],
    key: (c) => c[0],
    rows: (await db.query(`SELECT id, name FROM companies ORDER BY name`)).rows
      .map((c) => [String(c.id), c.name]),
  };
  out.salespeople = {
    header: ['id', 'name'],
    key: (c) => c[0],
    rows: (await db.query(`SELECT id, name FROM salespeople ORDER BY name`)).rows
      .map((s) => [String(s.id), s.name]),
  };

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
  const recRows = [], discRows = [];
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
      if (pts.length === 0) discRows.push([r.id, String(di), d.topic || '', '0', '']);
      else pts.forEach((pt, pi) => discRows.push([r.id, String(di), d.topic || '', String(pi), pt]));
      di++;
    }
  }
  out.records = {
    header: ['id', 'company', 'sales_rep', 'contact_person', 'channel', 'date', 'time', 'location',
      'urgent_follow_up', 'follow_up_note', 'follow_up_deadline', 'participants', 'created_at', 'deleted'],
    key: (c) => c[0],
    rows: recRows,
  };
  out.discussions = {
    header: ['record_id', 'disc_order', 'topic', 'point_order', 'point'],
    key: (c) => JSON.stringify([c[0], c[1], c[3]]),
    rows: discRows,
  };

  out.complaints = {
    header: ['id', 'company', 'assigned_to', 'contact_person', 'priority', 'status', 'detail',
      'date_in', 'time_in', 'next_follow_up', 'created_at', 'deleted'],
    key: (c) => c[0],
    rows: (await db.query(
      `SELECT cpl.id, co.name company, sp.name assigned_to, cpl.contact_person, cpl.priority,
              cpl.status, cpl.detail,
              to_char(cpl.date_in,'YYYY-MM-DD') date_in,
              to_char(cpl.time_in,'HH24:MI') time_in,
              to_char(cpl.next_follow_up,'YYYY-MM-DD') next_follow_up,
              to_char(cpl.created_at,'YYYY-MM-DD HH24:MI:SS') created_at
       FROM complaints cpl
       JOIN companies   co ON co.id = cpl.company_id
       JOIN salespeople sp ON sp.id = cpl.assigned_to_id
       ORDER BY cpl.date_in`)).rows.map((c) => [
        c.id, c.company, c.assigned_to, c.contact_person, c.priority, c.status, c.detail,
        c.date_in || '', c.time_in || '', c.next_follow_up || '', c.created_at || '', 'FALSE',
      ]),
  };
  out.complaint_responses = {
    header: ['id', 'complaint_id', 'by', 'date', 'time', 'note', 'created_at'],
    key: (c) => c[0],
    rows: (await db.query(
      `SELECT cr.id, cr.complaint_id, sp.name by_name,
              to_char(cr.response_date,'YYYY-MM-DD') rdate,
              to_char(cr.response_time,'HH24:MI') rtime,
              cr.note,
              to_char(cr.created_at,'YYYY-MM-DD HH24:MI:SS') created_at
       FROM complaint_responses cr
       JOIN salespeople sp ON sp.id = cr.responded_by_id
       ORDER BY cr.response_date`)).rows.map((r) => [
        r.id, r.complaint_id, r.by_name, r.rdate || '', r.rtime || '', r.note, r.created_at || '',
      ]),
  };
  await db.end();
  return out;
}

async function neonTaskflowTabs(env) {
  const conn = neonConnString(env);
  if (!conn) return null;
  const db = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const out = {};
  out.staff = {
    header: ['id', 'name', 'position', 'created_at'],
    key: (c) => c[0],
    rows: (await db.query(
      `SELECT id, name, position, to_char(created_at,'YYYY-MM-DD HH24:MI:SS') created_at
       FROM staff ORDER BY created_at`)).rows.map((s) => [String(s.id), s.name, s.position, s.created_at || '']),
  };
  out.tasks = {
    header: ['id', 'title', 'description', 'from', 'to', 'status', 'proposed_deadline',
      'deadline', 'deadline_revised', 'reject_reason', 'completion_note', 'created_at', 'updated_at'],
    key: (c) => c[0],
    rows: (await db.query(
      `SELECT id, title, description, from_staff_id, to_staff_id, status,
              to_char(proposed_deadline,'YYYY-MM-DD"T"HH24:MI') proposed_deadline,
              to_char(deadline,'YYYY-MM-DD"T"HH24:MI') deadline,
              deadline_revised, reject_reason, completion_note,
              to_char(created_at,'YYYY-MM-DD HH24:MI:SS') created_at,
              to_char(updated_at,'YYYY-MM-DD HH24:MI:SS') updated_at
       FROM tasks ORDER BY created_at`)).rows.map((t) => [
        String(t.id), t.title, t.description || '', String(t.from_staff_id), String(t.to_staff_id), t.status,
        t.proposed_deadline || '', t.deadline || '', t.deadline_revised ? 'TRUE' : 'FALSE',
        t.reject_reason || '', t.completion_note || '', t.created_at || '', t.updated_at || '',
      ]),
  };
  await db.end();
  return out;
}

// ── report rendering ───────────────────────────────────────────────────────
function sampleList(arr) {
  if (arr.length === 0) return '—';
  const shown = arr.slice(0, SAMPLES).map((x) => '`' + x + '`').join(', ');
  return arr.length > SAMPLES ? `${shown}  …(+${arr.length - SAMPLES} more)` : shown;
}
function renderModule(title, sheetId, results) {
  const lines = [`## ${title}  (\`${sheetId}\`)`, ''];
  lines.push('| Tab | Neon | Sheets | Equal | Differ | Neon-only ⚠ | Sheets-only (kept) |');
  lines.push('|---|--:|--:|--:|--:|--:|--:|');
  for (const t of results) {
    const tab = t.headerPresent ? t.name : `${t.name} *(tab missing)*`;
    lines.push(`| ${tab} | ${t.neonCount} | ${t.sheetCount} | ${t.bothEqual.length} | ${t.bothDiff.length} | ${t.neonOnly.length} | ${t.sheetOnly.length} |`);
  }
  lines.push('');
  for (const t of results) {
    if (t.bothDiff.length || t.neonOnly.length || t.sheetOnly.length) {
      lines.push(`### ${t.name}`);
      if (t.neonOnly.length) lines.push(`- **Neon-only ⚠ (backfill candidates, needs approval):** ${sampleList(t.neonOnly)}`);
      if (t.bothDiff.length) lines.push(`- **Differs (same key, edited in Sheets):** ${sampleList(t.bothDiff)}`);
      if (t.sheetOnly.length) lines.push(`- **Sheets-only (new edits — KEEP & FLAG):** ${sampleList(t.sheetOnly)}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

// ── main ─────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(SERVICE_ACCOUNT)) throw new Error('Service account not found at ' + SERVICE_ACCOUNT);
  const sa = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
  console.log('READ-ONLY reconciliation. This script never writes to Neon or Sheets.');
  console.log('Service account:', sa.client_email, '\n');
  const token = await getAccessToken(sa);

  const sections = [];
  const totals = { neonOnly: 0, diff: 0, sheetOnly: 0 };

  // CIL
  const cilNeon = await neonCilTabs(parseEnv(CIL_ENV));
  if (!cilNeon) { console.log('CIL: no Neon credentials — skipped.'); }
  else {
    const results = [];
    for (const [tab, spec] of Object.entries(cilNeon)) {
      const values = await sheetsGet(token, CIL_SHEET, tab);
      const d = diffTab(tab, spec.header, spec.rows, values, spec.key);
      results.push(d);
      totals.neonOnly += d.neonOnly.length; totals.diff += d.bothDiff.length; totals.sheetOnly += d.sheetOnly.length;
      console.log(`CIL/${tab}: neon=${d.neonCount} sheets=${d.sheetCount} equal=${d.bothEqual.length} differ=${d.bothDiff.length} neon-only=${d.neonOnly.length} sheets-only=${d.sheetOnly.length}`);
    }
    sections.push(renderModule('CIL', CIL_SHEET, results));
  }

  // TaskFlow
  const tfNeon = await neonTaskflowTabs(parseEnv(TASKFLOW_ENV));
  if (!tfNeon) { console.log('TaskFlow: no Neon credentials — skipped.'); }
  else {
    const results = [];
    for (const [tab, spec] of Object.entries(tfNeon)) {
      const values = await sheetsGet(token, TASKFLOW_SHEET, tab);
      const d = diffTab(tab, spec.header, spec.rows, values, spec.key);
      results.push(d);
      totals.neonOnly += d.neonOnly.length; totals.diff += d.bothDiff.length; totals.sheetOnly += d.sheetOnly.length;
      console.log(`TaskFlow/${tab}: neon=${d.neonCount} sheets=${d.sheetCount} equal=${d.bothEqual.length} differ=${d.bothDiff.length} neon-only=${d.neonOnly.length} sheets-only=${d.sheetOnly.length}`);
    }
    sections.push(renderModule('TaskFlow', TASKFLOW_SHEET, results));
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const header = [
    '# Neon ↔ Sheets reconciliation (READ-ONLY)', '',
    `- Generated: ${new Date().toISOString()}`,
    '- Direction: Sheets is the live source of truth; Neon is a frozen snapshot.',
    '- **Expected:** every Neon row also in Sheets (0 Neon-only); Sheets-only rows are normal new edits.',
    '',
    '## Verdict',
    totals.neonOnly === 0
      ? '✅ **No Neon-only rows** — Sheets contains everything Neon has. No backfill needed.'
      : `⚠️ **${totals.neonOnly} Neon-only row(s)** found — these exist in Neon but not Sheets. Review the per-tab lists below; an insert-only backfill would need your approval.`,
    `- Rows differing (edited in Sheets since migration): **${totals.diff}**`,
    `- Sheets-only rows (kept & flagged, never touched): **${totals.sheetOnly}**`,
    '',
  ].join('\n');

  const report = header + '\n' + sections.join('\n\n') + '\n';
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const outFile = path.join(REPORT_DIR, `reconcile_${stamp}.md`);
  fs.writeFileSync(outFile, report);
  console.log(`\nReport written: ${path.relative(ROOT, outFile)}`);
  if (ALSO_STDOUT) console.log('\n' + report);
}

// Pure helpers exported for offline unit testing; main only runs when executed directly.
module.exports = { rowKey, indexSheet, indexNeon, diffTab, sampleList, renderModule };
if (require.main === module) {
  main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
}
