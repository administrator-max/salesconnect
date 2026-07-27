#!/usr/bin/env node
/**
 * Verify cfg_trucking_rates + cfg_pbm_rates in the sheet rebuild TRK_BB/TRK_CT/PBM_MAP
 * EXACTLY as hardcoded in costcore/index.php. READ-ONLY. Run from salesconnect/.
 *   node tools/verify_trucking_rates.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SA = path.join(ROOT, 'secure', 'costcore_service_account.json');
const SID = '1yDWF5Q3YarCWqvXGCXY0lSk0kCdP-6VrqiL2FfvD3rU';

// ── extract the hardcoded const objects from costcore/index.php (no eval) ──
const src = fs.readFileSync(path.join(ROOT, 'costcore', 'index.php'), 'utf8');
function toJson(lit) { return JSON.parse(lit.replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":')); }
function grab(name, re) {
  const m = src.match(re);
  if (!m) throw new Error('cannot find ' + name);
  return toJson(m[1]);
}
const TRK_BB = grab('TRK_BB', /const TRK_BB\s*=\s*(\{[\s\S]*?\n\});/);
const TRK_CT = grab('TRK_CT', /const TRK_CT\s*=\s*(\{[\s\S]*?\n\});/);
const PBM_MAP = grab('PBM_MAP', /const PBM_MAP\s*=\s*(\{[^}]*\})/);

// ── auth + read sheet ──
const b64 = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function token(sa) {
  const now = Math.floor(Date.now() / 1000);
  const inp = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now }));
  const sig = crypto.createSign('RSA-SHA256').update(inp).sign(sa.private_key);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: inp + '.' + b64(sig) }) });
  return (await r.json()).access_token;
}
async function rows(tk, tab) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${encodeURIComponent(tab)}`,
    { headers: { Authorization: 'Bearer ' + tk } });
  const v = (await r.json()).values || [];
  const hdr = v[0]; return v.slice(1).map(row => Object.fromEntries(hdr.map((h, i) => [h, row[i] ?? ''])));
}

(async () => {
  const tk = await token(JSON.parse(fs.readFileSync(SA, 'utf8')));
  const tr = await rows(tk, 'cfg_trucking_rates');
  const pr = await rows(tk, 'cfg_pbm_rates');
  const bb = {}, ct = {}, pbm = {};
  tr.forEach(r => {
    if (r.bb_r !== '') bb[r.destination] = { r: Number(r.bb_r), rt: Number(r.bb_rt) };
    if (r.ct_f20 !== '') ct[r.destination] = { f20: Number(r.ct_f20), f40: Number(r.ct_f40), cb: Number(r.ct_cb) };
  });
  pr.forEach(r => { pbm[r.ship_type] = Number(r.pbm); });

  let fails = 0;
  // order-insensitive: sort keys before comparing (rate values are what matter, not key order)
  const norm = (o) => JSON.stringify(Object.keys(o).sort().reduce((a, k) => (a[k] = o[k], a), {}));
  const cmp = (a, b, name) => { if (norm(a) !== norm(b)) { fails++; console.log('VALUE MISMATCH ' + name + '\n  src :', norm(a), '\n  cfg :', norm(b)); } };
  cmp(TRK_BB, bb, 'TRK_BB'); cmp(TRK_CT, ct, 'TRK_CT'); cmp(PBM_MAP, pbm, 'PBM_MAP');
  console.log(`TRK_BB: ${Object.keys(bb).length} dest · TRK_CT: ${Object.keys(ct).length} · PBM: ${Object.keys(pbm).length}`);
  console.log(fails ? `${fails} MISMATCH` : 'OK: config rebuilds all rate tables EXACTLY');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
