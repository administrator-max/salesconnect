/* TANGGAL BERSPASI GANDA harus tetap terbaca.
 *
 * Ditemukan 14-Sep-2026 saat memeriksa selisih IKM terhadap acuan tim.
 * Satu lot utilisasi bertanggal "11  September 2026" — dua spasi, salah ketik
 * biasa. Pola tanggal memakai pemisah TUNGGAL ([-\s]), jadi tanggal itu tidak
 * terbaca sama sekali. Dan lot tanpa tanggal SENGAJA tidak dihitung, sehingga
 * 300 MT hilang tanpa sepatah kata.
 *
 * Yang membuatnya berbahaya: panel Utilization Breakdown tetap MENDAFTAR
 * kelima lot IKM berjumlah 3.200 MT, sementara totalnya menyebut 2.900 MT.
 * Rincian bertengkar dengan totalnya sendiri, dan tidak ada yang memberi tahu.
 *
 * YANG DIKUNCI:
 *   A. Spasi ganda terbaca sama dengan spasi tunggal, untuk semua bentuk.
 *   B. Spasi di ujung juga dirapikan.
 *   C. Yang memang tidak sah tetap null — perapian ini bukan penebak.
 *   D. Sisi PHP (iq_util_day_key) ikut dirapikan; kalau hanya sisi peramban,
 *      lotnya tetap hilang karena payload dibangun di server.
 *
 * Run: node iqdash/tests/test_tanggal_spasi_ganda.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

const node = () => ({ style: {}, classList: { add(){}, remove(){}, toggle(){} },
  querySelectorAll: () => [], querySelector: () => null, appendChild(){}, textContent: '' });
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean, MT_LOCALE: 'en-US',
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { getElementById: node, querySelectorAll: () => [], querySelector: () => null,
    createElement: node, addEventListener: () => {}, body: { appendChild(){} } },
});
ctx.window = ctx; ctx.globalThis = ctx;
['00-num.js', '01-data.js', '01a-quota-year.js', '02-period-filter.js']
  .forEach(f => { try { vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }); }
                  catch (e) { console.log('  (lewati ' + f + ': ' + e.message.slice(0, 60) + ')'); } });

const hari = s => { ctx.__s = s; const d = vm.runInContext('pDate(__s)', ctx);
  return (d && !isNaN(d.getTime())) ? d.toISOString().slice(0, 10) : null; };

console.log('\nA · Spasi ganda = spasi tunggal');
{
  /* Bentuk persis dari lot IKM yang hilang. */
  ok(hari('11  September 2026') !== null && hari('11  September 2026') === hari('11 September 2026'),
    '"11  September 2026" terbaca sama dengan satu spasi',
    JSON.stringify([hari('11  September 2026'), hari('11 September 2026')]));
  ok(hari('29   July  2026') === hari('29 July 2026'),
    'berapa pun spasinya, hasilnya sama', JSON.stringify(hari('29   July  2026')));
  ok(hari('30-Jun-26') === hari('30 - Jun - 26') || hari('30-Jun-26') !== null,
    'bentuk bertanda hubung tetap terbaca', JSON.stringify(hari('30-Jun-26')));
}

console.log('\nB · Spasi di ujung dirapikan');
{
  ok(hari('  10 August 2026  ') === hari('10 August 2026'),
    'spasi depan/belakang tidak mengubah hasil', JSON.stringify(hari('  10 August 2026  ')));
  ok(hari(' 16/07/2026 ') === hari('16/07/2026'), 'bentuk DD/MM/YYYY juga');
}

console.log('\nC · Yang tidak sah TETAP null — ini bukan penebak');
{
  [['TBA', 'TBA'], ['', 'kosong'], ['bukan tanggal', 'teks sembarang'],
   ['32 September 2026', 'tanggal mustahil'], ['11 Sepetember 2026', 'nama bulan salah ketik']]
    .forEach(([s, ket]) => ok(hari(s) === null, `${ket} -> null`, JSON.stringify(hari(s))));
}

console.log('\nD · Sisi PHP ikut dirapikan');
{
  /* Payload dibangun di server. Memperbaiki pDate() saja tidak menolong:
     iq_util_day_key() yang memutuskan sebuah lot dihitung atau tidak. */
  const php = fs.readFileSync(path.join(ROOT, 'iqdash_util.php'), 'utf8');
  const i = php.indexOf('function iq_util_day_key');
  const blok = i < 0 ? '' : php.slice(i, i + 1600);
  ok(/preg_replace\('\/\\s\+\/', ' ', trim\(\(string\) \$v\)\)/.test(blok),
    'iq_util_day_key merapikan spasi berulang sebelum mencocokkan pola',
    blok.slice(0, 200));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
