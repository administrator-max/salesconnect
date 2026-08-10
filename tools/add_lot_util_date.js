#!/usr/bin/env node
/**
 * Tambahkan kolom `util_date` ke tab `company_shipments` (IQ Dash).
 *
 * Kenapa: form Sales hanya punya "ETA JKT", dan tanggal itu DIPAKSA menjadi
 * pengganti tanggal utilisasi (`lotUtilDate()` membaca pib_date lalu eta_jkt).
 * Padahal ETA JKT adalah perkiraan barang TIBA, sedangkan utilisasi adalah saat
 * kuota DIPAKAI — dua peristiwa berbeda yang rutin berjarak berbulan-bulan
 * (HKG dipakai 8 Jul, ETA 15 Sep; IKM 24 Jul vs September). Dilaporkan tim
 * 2026-08-07: "pas gw input utilization ga ada tanggal utilize-nya".
 *
 * Kolom disisipkan TEPAT SETELAH `util_mt` supaya berdampingan dengan angkanya.
 * Nilai baris lama dibiarkan KOSONG — tidak ditebak dari eta_jkt, karena
 * menyalin tanggal kedatangan ke kolom pemakaian justru mengabadikan kekeliruan
 * yang sedang diperbaiki. Baris lama tetap jatuh ke fallback lama.
 *
 *   node tools/add_lot_util_date.js [--apply]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SID = '1t4MbpWLaQIe_NfMjb38gMtNTm27WPXLwpUq0THGMYd0';
const TAB = 'company_shipments';
const KOLOM_BARU = 'util_date';
const SESUDAH = 'util_mt';
const APPLY = process.argv.includes('--apply');

const b64 = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function token() {
  const sa = JSON.parse(fs.readFileSync(path.join(ROOT, 'secure', 'service_account.json'), 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const h = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const c = b64(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now,
  }));
  const sig = crypto.createSign('RSA-SHA256').update(`${h}.${c}`).sign(sa.private_key);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${h}.${c}.${b64(sig)}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('gagal ambil token: ' + JSON.stringify(j));
  return j.access_token;
}
const api = async (tok, url, opt = {}) => {
  const res = await fetch(url, { ...opt, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
  const t = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
};

(async () => {
  const tok = await token();
  const cur = await api(tok, `https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${TAB}`);
  const values = cur.values || [];
  if (!values.length) throw new Error('tab kosong');
  const header = values[0];

  if (header.includes(KOLOM_BARU)) {
    console.log(`kolom "${KOLOM_BARU}" sudah ada — tidak ada yang dikerjakan.`);
    return;
  }
  const at = header.indexOf(SESUDAH);
  if (at < 0) throw new Error(`kolom acuan "${SESUDAH}" tidak ditemukan`);
  const sisip = at + 1;

  const baru = values.map((row, i) => {
    const r = row.slice();
    while (r.length < header.length) r.push('');       // ratakan baris pendek
    r.splice(sisip, 0, i === 0 ? KOLOM_BARU : '');     // header vs sel kosong
    return r;
  });

  console.log(`menyisipkan "${KOLOM_BARU}" di posisi ${sisip} (sesudah "${SESUDAH}")`);
  console.log('header baru :', JSON.stringify(baru[0]));
  console.log('contoh baris:', JSON.stringify(baru[1]));
  console.log(`baris data  : ${baru.length - 1}`);
  if (!APPLY) { console.log('\n(uji coba — tambahkan --apply untuk menulis)'); return; }

  await api(tok, `https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${TAB}:clear`, { method: 'POST', body: '{}' });
  await api(tok, `https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${TAB}!A1?valueInputOption=RAW`, {
    method: 'PUT', body: JSON.stringify({ values: baru }),
  });
  const balik = await api(tok, `https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${TAB}`);
  const h2 = (balik.values || [])[0] || [];
  console.log('\nverifikasi baca-balik:');
  console.log('  header:', JSON.stringify(h2));
  console.log('  baris :', (balik.values || []).length - 1);
  console.log(h2.includes(KOLOM_BARU) ? '  OK — kolom terpasang.' : '  GAGAL — kolom tidak terlihat.');
})().catch(e => { console.error('GAGAL:', e.message); process.exit(1); });
