/* Sumber utilisasi: LOT (input Sales) vs RINCIAN SIKLUS (master).
 *
 * Keputusan pemilik data 2026-08-07: input Sales jadi sumbernya. Diterapkan
 * PER PRODUK dan hanya bila lot produk itu LENGKAP — setiap lot ber-MT punya
 * `utilDate`, dan jumlahnya sama dengan total per siklus dari master.
 *
 * Kenapa bersyarat, bukan borongan: saat aturan dibuat, 32 produk belum punya
 * lot sama sekali dan 4 lot yang ada masih separuh jalan (HKG 250 dari 1.000;
 * JKT 100 dari 400; IKM 2.000 dari 2.300; SPA 400 dari 401). Menukar sumber
 * secara borongan akan MENGHILANGKAN 1.351 MT seketika.
 *
 * Percobaan pertama memakai lotUtilDate() sebagai syarat dan langsung
 * menggeser 650 MT keluar dari H1 (12.525 -> 11.875), karena cadangan
 * pibDate/etaJKT ikut dianggap sah. Keduanya tanggal KEDATANGAN — memakainya
 * sebagai tanggal pemakaian persis kekeliruan yang kolom utilDate dibuat untuk
 * memperbaiki. Syaratnya kini WAJIB `utilDate`.
 *
 * Run: node iqdash/tests/test_util_source_lot_vs_master.cjs
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

const pf = require(path.join(__dirname, '..', 'assets', 'js', '02-period-filter.js'));
const { PERIOD, scopedUtilByProd } = pf;

let pass = 0, fail = 0;
const eq = (a, e, nama) => {
  if (a === e) { pass++; console.log(`  ok   ${nama}`); }
  else { fail++; console.log(`FAIL   ${nama} — dapat ${a}, harusnya ${e}`); }
};
/* Tanggal dibangun dari komponen LOKAL, bukan new Date('YYYY-MM-DD').
   Bentuk string itu dibaca sebagai UTC, sehingga di WIB (UTC+7) awal periode
   bergeser 7 jam ke depan dan tanggal pertama bulan itu ikut tersingkir —
   pDate() mengembalikan tengah malam LOKAL. Versi pertama tes ini memakainya
   dan tiga kasus gagal palsu. */
const setP = (f, t) => {
  const lokal = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  PERIOD.from = lokal(f); PERIOD.to = lokal(t); PERIOD.active = !!(f || t);
};
const jml = co => Object.values(scopedUtilByProd(co)).reduce((s, v) => s + v, 0);

/* Master: 1.000 MT dipakai pada SATU tanggal, 01/12/2025. */
const uc = [{ cycle: 'Utilization #1', product: 'GI ALLOY', mt: 1000, date: '01/12/2025' }];
const dasar = { code: 'UJI', utilCycles: uc, utilizationByProd: { 'GI ALLOY': 1000 } };

const LENGKAP = { ...dasar, shipments: { 'GI BORON': [
  { utilMT: 600, utilDate: '10 Jan 26' }, { utilMT: 400, utilDate: '20 Feb 26' } ] } };
const BELUM = { ...dasar, shipments: { 'GI BORON': [ { utilMT: 600, utilDate: '10 Jan 26' } ] } };
const TANPA_TGL = { ...dasar, shipments: { 'GI BORON': [ { utilMT: 1000, pibDate: '05/03/2026' } ] } };
const SEBAGIAN_TGL = { ...dasar, shipments: { 'GI BORON': [
  { utilMT: 600, utilDate: '10 Jan 26' }, { utilMT: 400 } ] } };   // satu lot tanpa tanggal

console.log('-- lot LENGKAP (semua bertanggal, jumlah pas) -> LOT yang menang --');
setP('2025-12-01', '2025-12-31'); eq(jml(LENGKAP), 0,    'Des 2025 kosong — master bilang Des, lot bilang Jan/Feb');
setP('2026-01-01', '2026-01-31'); eq(jml(LENGKAP), 600,  'Jan 2026 = 600 (lot pertama)');
setP('2026-02-01', '2026-02-28'); eq(jml(LENGKAP), 400,  'Feb 2026 = 400 (lot kedua)');
setP(null, null);                 eq(jml(LENGKAP), 1000, 'All Time tetap 1.000 — tidak ada yang hilang');

console.log('\n-- lot BELUM lengkap (600 dari 1.000) -> MASTER yang menang --');
setP('2025-12-01', '2025-12-31'); eq(jml(BELUM), 1000, 'Des 2025 = 1.000 (dari master)');
setP('2026-01-01', '2026-01-31'); eq(jml(BELUM), 0,    'Jan 2026 = 0 — lot separuh TIDAK boleh dipakai');
setP(null, null);                 eq(jml(BELUM), 1000, 'All Time tetap 1.000');

console.log('\n-- lot tanpa utilDate (hanya PIB) -> MASTER yang menang --');
/* Inilah regresi yang sempat terjadi: PIB/ETA adalah tanggal KEDATANGAN. */
setP('2025-12-01', '2025-12-31'); eq(jml(TANPA_TGL), 1000, 'Des 2025 = 1.000 — PIB tidak melayakkan lot');
setP('2026-03-01', '2026-03-31'); eq(jml(TANPA_TGL), 0,    'Mar 2026 = 0 — tanggal PIB tidak dipakai');

console.log('\n-- satu lot bertanggal, satu tidak -> MASTER yang menang --');
setP('2025-12-01', '2025-12-31'); eq(jml(SEBAGIAN_TGL), 1000, 'cukup SATU lot tanpa tanggal untuk membatalkan peralihan');
setP('2026-01-01', '2026-01-31'); eq(jml(SEBAGIAN_TGL), 0,    'Jan 2026 = 0');

console.log('\n-- sifat partisi tetap utuh pada kasus lot lengkap --');
setP('2026-01-01', '2026-01-31'); const jan = jml(LENGKAP);
setP('2026-02-01', '2026-02-28'); const feb = jml(LENGKAP);
setP(null, null);                 const semua = jml(LENGKAP);
eq(jan + feb, semua, 'Jan + Feb = All Time (1.000)');

setP(null, null);
console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
