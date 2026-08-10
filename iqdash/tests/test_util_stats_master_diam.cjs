/* Produk yang rincian siklus (master) TIDAK sebut sama sekali.
 *
 * Sebelum 2026-08-10 aturan "rincian siklus yang berlaku" tanpa sengaja
 * berlaku PER COMPANY: begitu satu produk punya siklus, produk lain milik
 * company yang sama yang tidak disebut siklus mana pun ikut dinolkan — padahal
 * yang mencatat pemakaiannya cuma kolom stats. IKM SEAMLESS PIPE 275 MT hilang
 * persis begitu (utilisasi 2.300, seharusnya 2.575), dan 275 MT kuota terpakai
 * malah ditawarkan lagi sebagai tersedia.
 *
 * Pasangan sisi-server: iqdash/tests/test_util_stats_master_diam.php
 *
 * Run: node iqdash/tests/test_util_stats_master_diam.cjs
 */
const path = require('path');

globalThis._MONTH_NAME_MAP = {
  jan:1, january:1, feb:2, february:2, mar:3, march:3, apr:4, april:4,
  may:5, jun:6, june:6, jul:7, july:7, aug:8, august:8, sep:9, sept:9,
  september:9, oct:10, october:10, nov:11, november:11, dec:12, december:12,
  mei:5, agu:8, agust:8, agustus:8, okt:10, oktober:10, des:12, desember:12,
};
globalThis.PRODUCT_ALIASES = { 'GI BORON': 'GI ALLOY', 'GL BORON': 'GL ALLOY' };
globalThis.canonicalProduct = p => (p && globalThis.PRODUCT_ALIASES[p]) || p;
globalThis.SPI = [];
globalThis.PENDING = [];

const { PERIOD, scopedUtilByProd } = require(path.join(__dirname, '..', 'assets', 'js', '02-period-filter.js'));

let pass = 0, fail = 0;
const eq = (a, e, nama) => {
  if (a === e) { pass++; console.log(`  ok   ${nama}`); }
  else { fail++; console.log(`FAIL   ${nama} — dapat ${a}, harusnya ${e}`); }
};
const setP = (f, t) => {
  const lokal = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  PERIOD.from = lokal(f); PERIOD.to = lokal(t); PERIOD.active = !!(f || t);
};
const jml = co => Object.values(scopedUtilByProd(co)).reduce((s, v) => s + v, 0);

/* IKM sebagaimana dikirim server SESUDAH iq_sync_util_with_cycles(): master
   memecah GI ALLOY per siklus, tapi diam soal SEAMLESS PIPE — 275 MT-nya hanya
   ada di kolom stats. (All Time memang dibaca verbatim dari payload ini; yang
   diuji di sini irisan PERIODE-nya.) */
const IKM = {
  code: 'IKM',
  utilCycles: [{ cycle: 'Utilization #1', product: 'GI ALLOY', mt: 2300, date: '24/07/2026' }],
  utilizationByProd: { 'GI ALLOY': 2300, 'SEAMLESS PIPE': 275, 'SHEET PILE': 0 },
  availableByProd:   { 'GI ALLOY': 1850, 'SEAMLESS PIPE': 1825, 'SHEET PILE': 1750 },
  shipments: {},
  etaByProd: {},
};

console.log('-- All Time: verbatim dari payload server --');
setP(null, null);
eq(jml(IKM), 2575, 'All Time = 2.575 (2.300 siklus + 275 stats)');

console.log('\n-- tanpa tanggal, ia tidak bisa ditempatkan di periode mana pun --');
setP('2026-07-01', '2026-07-31');
eq(jml(IKM), 2300, 'Juli 2026 = 2.300 saja — 275 tak bertanggal, tidak ditebak');

console.log('\n-- bila etaByProd terisi, irisan periode ikut benar --');
const IKM2 = { ...IKM, etaByProd: { 'SEAMLESS PIPE': '10/07/2026' } };
setP('2026-07-01', '2026-07-31'); eq(jml(IKM2), 2575, 'Juli 2026 = 2.575');
eq(scopedUtilByProd(IKM2)['SEAMLESS PIPE'], 275, 'muncul di bawah ejaan stats-nya sendiri');
setP('2026-06-01', '2026-06-30'); eq(jml(IKM2), 0,    'Juni 2026 = 0 — keduanya di luar');
setP(null, null);                 eq(jml(IKM2), 2575, 'sifat partisi: Juli = All Time');

console.log('\n-- produk yang siklusnya bicara TIDAK dihitung dua kali --');
const DOBEL = {
  code: 'UJI',
  utilCycles: [{ cycle: 'Utilization #1', product: 'GL ALLOY', mt: 350, date: '02/12/2025' }],
  utilizationByProd: { 'GL ALLOY': 350 },
  shipments: {},
  etaByProd: { 'GL ALLOY': '02/12/2025' },
};
setP('2025-12-01', '2025-12-31'); eq(jml(DOBEL), 350, 'Des 2025 = 350, bukan 700');

console.log('\n-- ejaan alias: stats `GL BORON`, siklus `GL ALLOY` -> tetap satu produk --');
const ALIAS = {
  code: 'UJI2',
  utilCycles: [{ cycle: 'Utilization #1', product: 'GL ALLOY', mt: 350, date: '02/12/2025' }],
  utilizationByProd: { 'GL BORON': 350 },
  shipments: {},
  etaByProd: { 'GL BORON': '02/12/2025' },
};
setP('2025-12-01', '2025-12-31'); eq(jml(ALIAS), 350, 'Des 2025 = 350, bukan 700');

console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
