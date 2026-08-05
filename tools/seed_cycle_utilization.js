#!/usr/bin/env node
/**
 * Isi tab `cycle_utilization` (dibuat bila belum ada) dari berkas JSON hasil
 * ekstraksi master. Utilisasi PER SIKLUS PER PRODUK, masing-masing dengan
 * tanggalnya sendiri.
 *
 * Kenapa tab baru, bukan kolom tambahan di `cycle_products`:
 * setiap PATCH /api/company/:code/cycles menulis ULANG seluruh baris
 * cycle_products milik company itu dengan id baru
 * (iq_build_cycles_replacement), dan pembangunnya hanya membaca `products`.
 * Utilisasi yang dititipkan di sana akan terhapus diam-diam pada edit cycle
 * berikutnya. Tab terpisah berkunci (company_code, cycle_type, product)
 * selamat dari penulisan ulang itu.
 *
 *   node tools/seed_cycle_utilization.js <file.json> [--apply]
 *
 * Tanpa --apply hanya menampilkan rencana. RAW selalu dipakai supaya tanggal
 * tetap teks (lihat CLAUDE.md).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SA_PATH = path.join(ROOT, 'secure', 'service_account.json');
const SHEET_ID = '1t4MbpWLaQIe_NfMjb38gMtNTm27WPXLwpUq0THGMYd0';
const TAB = 'cycle_utilization';
const HEADER = ['id', 'company_code', 'cycle_type', 'product', 'util_mt', 'util_date', 'source_program'];

const src = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!src) { console.error('pakai: node tools/seed_cycle_utilization.js <file.json> [--apply]'); process.exit(1); }

const b64url = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function token(sa) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now,
  }));
  const input = `${head}.${claim}`;
  const sig = crypto.createSign('RSA-SHA256').update(input).sign(sa.private_key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${input}.${b64url(sig)}` }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('gagal ambil token: ' + JSON.stringify(j));
  return j.access_token;
}
const api = async (tok, url, opt = {}) => {
  const res = await fetch(url, { ...opt, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : {};
};

(async () => {
  const baris = JSON.parse(fs.readFileSync(src, 'utf8'));
  console.log(`sumber: ${path.basename(src)} — ${baris.length} baris, ${baris.reduce((s, x) => s + x.mt, 0)} MT`);

  const values = [HEADER, ...baris.map((x, i) => [
    String(i + 1), x.code, x.cycle, x.product, String(x.mt), x.date, 'B',
  ])];
  console.log(`akan menulis ${values.length - 1} baris ke tab "${TAB}"`);
  console.log('contoh:', JSON.stringify(values[1]), JSON.stringify(values[2]));
  if (!APPLY) { console.log('\n(uji coba — tambahkan --apply untuk benar-benar menulis)'); return; }

  const sa = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'));
  const tok = await token(sa);

  const meta = await api(tok, `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`);
  const ada = (meta.sheets || []).some(s => s.properties.title === TAB);
  if (!ada) {
    console.log(`tab "${TAB}" belum ada — dibuat`);
    await api(tok, `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title: TAB } } }] }),
    });
  } else {
    console.log(`tab "${TAB}" sudah ada — isinya dikosongkan dulu`);
    await api(tok, `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(TAB)}:clear`, { method: 'POST', body: '{}' });
  }

  await api(tok, `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(TAB)}!A1?valueInputOption=RAW`, {
    method: 'PUT', body: JSON.stringify({ values }),
  });
  console.log('selesai ditulis.');

  const balik = await api(tok, `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(TAB)}`);
  const n = (balik.values || []).length - 1;
  const jum = (balik.values || []).slice(1).reduce((s, r) => s + (parseFloat(r[4]) || 0), 0);
  console.log(`verifikasi baca-balik: ${n} baris, ${jum} MT`);
})().catch(e => { console.error('GAGAL:', e.message); process.exit(1); });
