/* Regression test: the FIRST DAY of a custom range must be inside the range.
 *
 * THE BUG (dilaporkan 2026-07-30: "kenapa bulan Juni saat difilter tidak keluar?")
 * onCustomDate() mixed two different parsing rules inside one function:
 *
 *     PERIOD.from = new Date(f);               // "2026-06-01"           -> UTC
 *     PERIOD.to   = new Date(t + 'T23:59:59'); // "2026-06-30T23:59:59"  -> LOCAL
 *
 * A date-ONLY ISO string is parsed as UTC midnight by ECMAScript; the same
 * string with a time component and no zone is parsed as LOCAL. So in WIB
 * (UTC+7) the range began at 07:00 on the from-day, while every record date
 * comes from pDate()'s `new Date(y, m-1, d)` — local midnight. A record dated
 * exactly ON the from-day sat 7 hours BEFORE the start and was dropped:
 * filtering 01–30 Jun lost everything dated 1 June.
 *
 * The asymmetry made it invisible: only the START boundary was wrong, so the
 * range looked "almost right" and the loss read as missing data rather than a
 * filter bug.
 *
 * These tests are written in terms of the from-day being INCLUSIVE, which is
 * what the UI promises ("Dari (From)"), and they fail for any non-zero UTC
 * offset if the parsing is not local.
 *
 * Run: node iqdash/tests/test_period_boundary.cjs
 */
const path = require('path');
globalThis._MONTH_NAME_MAP = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  mei: 5, agu: 8, agust: 8, agustus: 8, okt: 10, oktober: 10,
  des: 12, desember: 12,
  januari: 1, februari: 2, maret: 3, juni: 6, juli: 7,
};
const M = require(path.join(__dirname, '..', 'assets', 'js', '02-period-filter.js'));
const { PERIOD, PRESETS, pDate, inPd, pfParseInputDate, pfFormatInputDate } = M;

let pass = 0, fail = 0;
const eq = (a, b, m) => {
  const good = Object.is(a, b);
  if (!good) console.log(`  ✖ ${m}\n      harap: ${JSON.stringify(b)}  dapat: ${JSON.stringify(a)}`);
  good ? pass++ : fail++;
};

const offsetMin = new Date().getTimezoneOffset();
console.log(`(zona waktu mesin: UTC${offsetMin <= 0 ? '+' : '-'}${Math.abs(offsetMin) / 60})`);

/* Terapkan rentang persis seperti onCustomDate() melakukannya. */
function setRange(from, to) {
  PERIOD.from   = pfParseInputDate(from, false);
  PERIOD.to     = pfParseInputDate(to, true);
  PERIOD.active = true;
}

/* ── Inti bug: hari pertama rentang harus IKUT ───────────────────────── */
console.log('-- hari pertama rentang harus ikut terfilter --');
setRange('2026-06-01', '2026-06-30');
eq(inPd(pDate('01/06/2026')), true,  '1 Juni ikut saat filter 01–30 Juni  <-- inti bug');
eq(inPd(pDate('02/06/2026')), true,  '2 Juni ikut');
eq(inPd(pDate('15/06/2026')), true,  '15 Juni ikut');
eq(inPd(pDate('30/06/2026')), true,  '30 Juni (hari terakhir) ikut');

/* ── Batas harus tetap rapat: sehari di luar tidak boleh bocor ───────── */
console.log('-- batas tetap rapat --');
eq(inPd(pDate('31/05/2026')), false, '31 Mei TIDAK ikut (sehari sebelum from)');
eq(inPd(pDate('01/07/2026')), false, '1 Juli TIDAK ikut (sehari setelah to)');

/* ── Bukan cuma Juni — berlaku untuk hari pertama bulan mana pun ─────── */
console.log('-- berlaku untuk semua bulan, bukan hanya Juni --');
[['2026-01-01', '01/01/2026'], ['2026-05-01', '01/05/2026'],
 ['2026-07-01', '01/07/2026'], ['2026-12-01', '01/12/2026']].forEach(([from, rec]) => {
  setRange(from, from.slice(0, 8) + '28');
  eq(inPd(pDate(rec)), true, `hari pertama ikut untuk rentang mulai ${from}`);
});

/* ── Rentang satu hari harus memuat hari itu sendiri ─────────────────── */
console.log('-- rentang satu hari --');
setRange('2026-06-15', '2026-06-15');
eq(inPd(pDate('15/06/2026')), true,  '15–15 Juni memuat 15 Juni');
eq(inPd(pDate('14/06/2026')), false, '15–15 Juni tidak memuat 14 Juni');
eq(inPd(pDate('16/06/2026')), false, '15–15 Juni tidak memuat 16 Juni');

/* ── Hanya "from" diisi (to kosong) ──────────────────────────────────── */
console.log('-- hanya from yang diisi --');
PERIOD.from = pfParseInputDate('2026-06-01', false);
PERIOD.to   = pfParseInputDate('', true);
PERIOD.active = true;
eq(PERIOD.to, null, 'to kosong -> null');
eq(inPd(pDate('01/06/2026')), true, '1 Juni ikut saat hanya from yang diisi');

/* ── pfFormatInputDate: tidak boleh mundur sehari ────────────────────── */
// toISOString().slice(0,10) mengubah ke UTC dulu, sehingga tanggal lokal
// tengah malam di WIB kembali sebagai hari SEBELUMNYA.
console.log('-- pfFormatInputDate (dipakai applyPreset) --');
eq(pfFormatInputDate(new Date(2026, 3, 1)),  '2026-04-01', '1 Apr lokal -> "2026-04-01", bukan mundur ke 31 Mar');
eq(pfFormatInputDate(new Date(2026, 0, 1)),  '2026-01-01', '1 Jan lokal -> "2026-01-01"');
eq(pfFormatInputDate(new Date(2026, 11, 31)), '2026-12-31', '31 Des lokal -> "2026-12-31"');
eq(pfFormatInputDate(null), '', 'null -> string kosong');

/* ── Round-trip preset: format lalu urai kembali harus stabil ────────── */
console.log('-- round-trip preset Q2 2026 --');
const q2 = PRESETS.q226;
const backFrom = pfParseInputDate(pfFormatInputDate(q2.from), false);
eq(backFrom.getMonth(), 3,  'Q2 dimulai April setelah format+urai ulang');
eq(backFrom.getDate(),  1,  'Q2 dimulai tanggal 1');
PERIOD.from = backFrom;
PERIOD.to   = pfParseInputDate(pfFormatInputDate(q2.to), true);
PERIOD.active = true;
eq(inPd(pDate('01/04/2026')), true, '1 April ikut dalam Q2');
eq(inPd(pDate('30/06/2026')), true, '30 Juni ikut dalam Q2');
eq(inPd(pDate('31/03/2026')), false, '31 Maret tidak ikut dalam Q2');

console.log(`\n${fail === 0 ? '✔ SEMUA LULUS' : '✖ GAGAL'}  —  lulus ${pass}, gagal ${fail}`);
process.exit(fail === 0 ? 0 : 1);
