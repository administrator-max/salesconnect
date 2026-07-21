#!/usr/bin/env node
/**
 * READ-ONLY backup of all SalesConnect spreadsheets.
 * Dumps every tab (values) of all 5 sheets to backups/<ts>/<module>/<tab>.json
 * plus a manifest. Never writes to Sheets. Run before any structural change.
 *
 *   node tools/backup_sheets.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SERVICE_ACCOUNT = path.join(ROOT, 'secure', 'service_account.json');
const SHEETS = {
  cil:        '1TYDed6FlNbDQDa1zrqQr989myZO9C50GJqdM1pIPIsg',
  taskflow:   '1U5J4T9jNcKji--VDpJOFkgs2VMLm6wLAtdr8mtL-164',
  costcore:   '1yDWF5Q3YarCWqvXGCXY0lSk0kCdP-6VrqiL2FfvD3rU',
  scot:       '1km206j-uletsz9uNLwWC0dymRuy3fPnBuTDTMyeMbSM',
  salespulse: '1kSLpY3KAg71fc8tB3zlNh4nigJBb3mc4yhfRfqhDfC4',
};

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now,
  }));
  const input = `${header}.${claim}`;
  const sig = crypto.createSign('RSA-SHA256').update(input).sign(sa.private_key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${input}.${b64url(sig)}` }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('OAuth failed: ' + JSON.stringify(j));
  return j.access_token;
}
const SB = (id) => `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`;
async function api(token, url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const txt = await res.text();
  const j = txt ? JSON.parse(txt) : {};
  if (!res.ok) throw new Error(`Sheets ${res.status}: ${(j.error && j.error.message) || txt}`);
  return j;
}

(async () => {
  const sa = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
  const token = await getAccessToken(sa);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(ROOT, 'backups', stamp);
  const manifest = { generated: new Date().toISOString(), sheets: {} };

  for (const [mod, id] of Object.entries(SHEETS)) {
    const meta = await api(token, `${SB(id)}?fields=sheets.properties(title)`);
    const tabs = (meta.sheets || []).map((s) => s.properties.title);
    const dir = path.join(base, mod);
    fs.mkdirSync(dir, { recursive: true });
    manifest.sheets[mod] = { id, tabs: {} };
    for (const tab of tabs) {
      const v = await api(token, `${SB(id)}/values/${encodeURIComponent(tab)}?majorDimension=ROWS`);
      const values = v.values || [];
      fs.writeFileSync(path.join(dir, tab.replace(/[\\/:*?"<>|]/g, '_') + '.json'), JSON.stringify(values, null, 2));
      manifest.sheets[mod].tabs[tab] = Math.max(0, values.length - 1);
      console.log(`  ${mod}/${tab}: ${Math.max(0, values.length - 1)} row(s)`);
    }
  }
  fs.writeFileSync(path.join(base, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\n✅ Backup written: ${path.relative(ROOT, base)}`);
})().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
