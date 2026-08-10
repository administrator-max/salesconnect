/**
 * test_util_date_not_wiped.cjs
 *
 * 10 Agustus 2026: tanggal utilisasi yang diisi atasan "hilang". Bukan sekali —
 * SELURUH tab `company_shipments` nol baris bertanggal, padahal tim sudah
 * mengisi berhari-hari.
 *
 * Sebabnya dua penyimpan menulis baris lot yang sama:
 *
 *   11-shipment.js  patchShipmentsToServer()  -> menyertakan utilDate  ✓
 *   16-storage.js   patchToServer()           -> TIDAK menyertakan     ✗
 *
 * Baris lot ditulis UTUH. Field yang tidak dikirim tertulis '' — jadi setiap
 * kali siapa pun menekan tombol Save utama, tanggal seluruh lot company itu
 * tersapu. Tanggalnya memang tersimpan; simpan berikutnya yang membunuhnya.
 * Itu sebabnya terlihat seperti "kadang hilang".
 *
 * Uji ini mengunci dua hal:
 *   1. payload Save utama MEMBAWA utilDate  (regresi yang sebenarnya)
 *   2. semua pembangun objek lot sepakat soal bentuknya
 *
 * Aturan absen-vs-kosong di sisi server diuji terpisah di
 * test_util_date_absent_preserves.php.
 *
 * Run: node iqdash/tests/test_util_date_not_wiped.cjs
 */
'use strict';

const fs   = require('fs');
const path = require('path');

let fail = 0;
const ok = (cond, label) => {
  console.log((cond ? 'ok   ' : 'FAIL ') + label);
  if (!cond) fail++;
};

const js = f => fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', f), 'utf8');

/** Potong tepat pembangun payload lot: dari `const shipPayload = {}` sampai
 *  penutup `.map(...)`-nya. Jendela sepanjang-n-karakter dulu kebablasan ke
 *  `const body = { shipments: ... }` dan mengira `shipments` field lot. */
const blokPayload = src => {
  const mulai   = src.indexOf('const shipPayload = {}');
  const petaAwal = src.indexOf('.map(', mulai);
  const selesai = src.indexOf('}));', petaAwal);
  return src.slice(petaAwal, selesai);
};

/* ── 1. Penyimpan utama harus mengirim utilDate ───────────────────────────── */

const storage = js('16-storage.js');
const blokStorage = blokPayload(storage);

ok(/utilDate:/.test(blokStorage),
   '16-storage.js: payload Save utama menyertakan utilDate');
ok(/utilMT:/.test(blokStorage) && /pibDate:/.test(blokStorage),
   '16-storage.js: blok yang diperiksa memang pembangun payload lot');

/* ── 2. Penyimpan lot Sales tetap membawanya ──────────────────────────────── */

const shipment = js('11-shipment.js');
const blokShip = blokPayload(shipment);
ok(/utilDate:/.test(blokShip),
   '11-shipment.js: patchShipmentsToServer menyertakan utilDate');

/* ── 3. Kedua payload sepakat soal daftar field ───────────────────────────── */

const fields = blok => (blok.match(/^\s*(\w+):/gm) || [])
  .map(s => s.trim().replace(':', ''))
  .filter(k => k !== 'shipPayload');

const fStorage = new Set(fields(blokStorage));
const fShip    = new Set(fields(blokShip));
const hilang   = [...fShip].filter(k => !fStorage.has(k));

ok(hilang.length === 0,
   'kedua payload membawa field yang sama' +
   (hilang.length ? ` — kurang di 16-storage.js: ${hilang.join(', ')}` : ''));

/* ── 4. Lot baru lahir dengan utilDate ────────────────────────────────────── */

const edit = js('10-edit-form.js');

[['11-shipment.js', shipment], ['10-edit-form.js', edit]].forEach(([nama, src]) => {
  const barisPush = (src.match(/shipments\[\w+\]\.push\(\{[^}]*\}\)/g) || []);
  barisPush.forEach((b, i) => {
    ok(/utilDate/.test(b),
       `${nama}: lot baru #${i + 1} punya utilDate sejak lahir`);
  });
  ok(barisPush.length > 0, `${nama}: ada pembuat lot baru yang diperiksa`);
});

/* ── 5. Pembangun lot sisi server sepakat ─────────────────────────────────── */

const dataPhp = fs.readFileSync(path.join(__dirname, '..', 'iqdash_data.php'), 'utf8');
const pembangun = dataPhp.match(/'lotNo'\s*=>/g) || [];
const punyaTgl  = dataPhp.match(/'utilDate'\s*=>/g) || [];

ok(pembangun.length > 0, `iqdash_data.php: ditemukan ${pembangun.length} pembangun lot`);
ok(punyaTgl.length === pembangun.length,
   `iqdash_data.php: SEMUA pembangun lot mengirim utilDate ` +
   `(${punyaTgl.length}/${pembangun.length})`);

/* ────────────────────────────────────────────────────────────────────────── */

console.log(fail === 0
  ? '\nSemua lolos.'
  : `\n${fail} GAGAL.`);
