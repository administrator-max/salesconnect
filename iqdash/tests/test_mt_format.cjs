/* Regression tests for the MT number format bug.
 *
 * Bug (2026-07-27, company IKM): display called toLocaleString() with NO locale
 * argument, so on an id-ID browser it rendered "4.150". The user typed back what
 * they saw — "2.000", meaning 2000 — but every parser here strips only commas
 * and fmtThousandInline treats "." as a decimal point, so 2000 was stored as 2.
 * Silently, with no error. See logs/fix-ikm-utilization_2026-07-27_log.md.
 *
 * Fix: lock the module to the en-US convention (comma = thousands, dot =
 * decimal) everywhere, and refuse to guess at ambiguous input instead of
 * truncating it.
 *
 * Run: node iqdash/tests/test_mt_format.cjs
 */
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

const JS_DIR = join(__dirname, '..', 'assets', 'js');
const { parseMT, mtAmbiguous, fmtNum, MT_LOCALE } = require(join(JS_DIR, '00-num.js'));

let pass = 0, fail = 0;
const ok = (cond, name) => { cond ? pass++ : (fail++, console.log(`  ✖ ${name}`)); };
const eq = (actual, expected, name) => {
  const good = Object.is(actual, expected);
  if (!good) console.log(`  ✖ ${name}\n      harap: ${JSON.stringify(expected)}  dapat: ${JSON.stringify(actual)}`);
  good ? pass++ : fail++;
};

console.log('── parseMT: format en-US yang sah ──');
eq(parseMT('2000'),     2000,    "parseMT('2000')");
eq(parseMT('2,000'),    2000,    "parseMT('2,000')");
eq(parseMT('16,100'),   16100,   "parseMT('16,100')");
eq(parseMT('1,234.56'), 1234.56, "parseMT('1,234.56')");
eq(parseMT('2.5'),      2.5,     "parseMT('2.5') — 1 desimal sah");
eq(parseMT('2.50'),     2.5,     "parseMT('2.50') — 2 desimal sah");
eq(parseMT('0'),        0,       "parseMT('0')");

console.log('── parseMT: input ambigu WAJIB ditolak (inti bug) ──');
eq(parseMT('2.000'),     null, "parseMT('2.000') — kasus IKM, JANGAN jadi 2");
eq(parseMT('16.100'),    null, "parseMT('16.100') — JANGAN jadi 16.1");
eq(parseMT('4.150'),     null, "parseMT('4.150') — JANGAN jadi 4.15");
eq(parseMT('363.612'),   null, "parseMT('363.612') — 3 desimal, tak tertampung");
eq(parseMT('1.234.567'), null, "parseMT('1.234.567') — ribuan gaya Indonesia");

console.log('── parseMT: input tidak valid ──');
eq(parseMT(''),        null, "parseMT('')");
eq(parseMT('   '),     null, "parseMT('   ')");
eq(parseMT('abc'),     null, "parseMT('abc')");
eq(parseMT(null),      null, 'parseMT(null)');
eq(parseMT(undefined), null, 'parseMT(undefined)');

console.log('── mtAmbiguous ──');
eq(mtAmbiguous('2.000'), true,  "mtAmbiguous('2.000')");
eq(mtAmbiguous('2.00'),  false, "mtAmbiguous('2.00')");
eq(mtAmbiguous('2.0'),   false, "mtAmbiguous('2.0')");
eq(mtAmbiguous('2,000'), false, "mtAmbiguous('2,000')");
eq(mtAmbiguous('2000'),  false, "mtAmbiguous('2000')");
eq(mtAmbiguous(''),      false, "mtAmbiguous('')");

console.log('── fmtNum: tampilan tidak boleh ikut locale browser ──');
eq(MT_LOCALE, 'en-US', 'MT_LOCALE terkunci');
eq(fmtNum(4150), '4,150', 'fmtNum(4150)');
eq(fmtNum(2000), '2,000', 'fmtNum(2000)');
eq(fmtNum(0),    '0',     'fmtNum(0)');
eq(fmtNum(2.5),  '2.5',   'fmtNum(2.5)');

console.log('── round-trip: tampilkan lalu ketik ulang harus kembali ke nilai semula ──');
for (const v of [2000, 4150, 16100, 250, 1, 1234.5]) {
  eq(parseMT(fmtNum(v)), v, `round-trip ${v}`);
}

console.log('── struktural: tidak boleh ada toLocaleString() tanpa locale ──');
/* Blank out comments while preserving line numbers, so prose describing the bug
   (which necessarily spells the offending call) is not counted as code. */
const stripComments = src => src
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));

/* DUA bentuk, bukan satu.
     toLocaleString()                 — tanpa argumen
     toLocaleString(undefined, {...}) — argumen locale-nya undefined
   Keduanya sama-sama mengikuti locale BROWSER. Pemeriksaan ini semula hanya
   mengenali bentuk pertama, sehingga bentuk kedua bertahan diam-diam di enam
   tempat (rincian realisasi di drawer: volume, nilai USD, harga satuan; total
   volume & tabel pada import realisasi; dan dua gauge). Ditemukan 2026-08-05
   saat menelusuri hal lain — bukan oleh tes ini, yang justru seharusnya
   menangkapnya. */
const offenders = [];
for (const f of readdirSync(JS_DIR).filter(f => f.endsWith('.js'))) {
  stripComments(readFileSync(join(JS_DIR, f), 'utf8')).split('\n').forEach((line, i) => {
    if (/toLocaleString\(\s*\)/.test(line)) offenders.push(`${f}:${i + 1} (tanpa argumen)`);
    if (/toLocaleString\(\s*undefined\b/.test(line)) offenders.push(`${f}:${i + 1} (undefined)`);
  });
}
ok(offenders.length === 0,
  `toLocaleString tanpa locale eksplisit masih ada di ${offenders.length} baris: ` +
  `${offenders.slice(0, 8).join(', ')}${offenders.length > 8 ? ' …' : ''}`);

console.log(`\n${fail === 0 ? '✔ SEMUA LULUS' : '✖ GAGAL'}  —  lulus ${pass}, gagal ${fail}`);
process.exit(fail === 0 ? 0 : 1);
