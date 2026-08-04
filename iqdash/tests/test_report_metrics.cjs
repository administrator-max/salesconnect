/* Definisi PERIODE untuk kelima ukuran laporan — dipatok sesuai spesifikasi
 * pemilik data (2026-08-04):
 *
 *   Submit    -> kolom Submission: Submit MOI / Submit MOI Perubahan
 *   Obtain    -> kolom Release   : PERTEK / PERTEK Perubahan
 *   Utilized  -> baris Status    : Utilization (date)
 *   Realized  -> file REALISASI IMPORT, kolom Volume (per tanggal PIB)
 *   Available -> Obtain - Utilized
 *
 * Tes ini menjaga tiga hal yang dulu salah dan MENYEBABKAN hasil filter tidak
 * pernah sama dengan hitungan manual dari master:
 *   1. Utilized hanya dibaca dari lot, sehingga produk yang utilisasinya
 *      datang dari master (hampir semuanya) menyumbang 0 di periode apa pun.
 *   2. Obtain bersandar pada tanggal SPI, bukan PERTEK.
 *   3. Available = obtained SEPANJANG WAKTU dikurangi utilisasi PERIODE.
 *
 * Run: node iqdash/tests/test_report_metrics.cjs
 */
const path = require('path');
globalThis._MONTH_NAME_MAP = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  mei: 5, agu: 8, agust: 8, agustus: 8, okt: 10, oktober: 10, des: 12, desember: 12,
};
// Dipakai lintas file di browser; di Node harus disediakan sebagai global.
globalThis.PRODUCT_ALIASES = { 'GI BORON': 'GI ALLOY', 'GL BORON': 'GL ALLOY' };
globalThis.canonicalProduct = p => (p && globalThis.PRODUCT_ALIASES[p]) || p;
globalThis.getPertekTerbitForObtained = function (obt, all) {
  const m = String(obt.type || '').match(/^Obtained\s+(?:\(Revision\s+)?#?(\d+)/i);
  if (!m) return null;
  const paired = all.find(c => c !== obt && new RegExp(`^submit\\s*#?${m[1]}\\b`, 'i').test(c.type || ''));
  return paired ? M.pDate(paired.releaseDate) : null;
};
globalThis._isObtainedTerbit = function (c, all) {
  if (/^obtained\s*#?1\b/i.test(c.type || '')) return true;
  const rd = String(c.releaseDate || '').trim();
  if (rd && !/^(TBA|null|undefined|—)$/i.test(rd)) return true;
  const sd = String(c.spiDate || '').trim(), pd = String(c.pertekDate || '').trim();
  if ((sd && !/^TBA$/i.test(sd)) || (pd && !/^TBA$/i.test(pd))) return true;
  return Array.isArray(all) ? !!globalThis.getPertekTerbitForObtained(c, all) : false;
};

const M = require(path.join(__dirname, '..', 'assets', 'js', '02-period-filter.js'));
const { PERIOD, pDate, scopedUtilByProd, scopedUtilTotal, scopedAvailByProd, scopedObtainedByProd } = M;
globalThis.pDate = pDate;
globalThis.inPd = M.inPd;

let pass = 0, fail = 0;
const eq = (a, b, m) => {
  const good = Object.is(a, b);
  if (!good) console.log(`  x ${m}\n      harap: ${JSON.stringify(b)}  dapat: ${JSON.stringify(a)}`);
  good ? pass++ : fail++;
};
const setPeriod = (from, to) => {
  PERIOD.active = !!from;
  PERIOD.from = from ? new Date(from + 'T00:00:00') : null;
  PERIOD.to = to ? new Date(to + 'T23:59:59') : null;
};

/* GNG — bentuk yang paling umum di produksi: utilisasi ADA di stats, tapi
   TIDAK ada lot bertanggal. Tanggalnya hanya hidup di etaByProd. */
const GNG = {
  code: 'GNG',
  utilizationByProd: { 'GL ALLOY': 400 },
  availableByProd:   { 'GL ALLOY': 200 },
  etaByProd:         { 'GL BORON': '28/04/2026' },   // nama legacy, sengaja
  shipments:         { 'GL BORON': [{ lotNo: '1', utilMT: 0, etaJKT: '', pibDate: '' }] },
  cycles: [
    { type: 'Submit #1',   mt: 6000, products: { 'GL BORON': 6000 }, submitDate: '14/10/2025', releaseDate: '29/10/2025' },
    { type: 'Obtained #1', mt: 250,  products: { 'GL BORON': 250 },  submitDate: '30/10/2025', releaseDate: '07/11/2025' },
    { type: 'Submit #3',   mt: 3000, products: { 'GL BORON': 3000 }, submitDate: '30/06/2026', releaseDate: '06/07/2026' },
    { type: 'Obtained #3', mt: 200,  products: { 'GL BORON': 200 },  submitDate: '06/07/2026', releaseDate: '22/07/2026' },
  ],
};

console.log('-- Utilized: tanggal per-produk (etaByProd) dipakai saat lot tak bertanggal --');
setPeriod('2026-04-01', '2026-04-30');
eq(scopedUtilTotal(GNG), 400, 'April 2026 memuat 28/04 -> seluruh 400 MT masuk');
setPeriod('2026-05-01', '2026-05-31');
eq(scopedUtilTotal(GNG), 0, 'Mei 2026 tidak memuat 28/04 -> 0 MT');
setPeriod('2026-04-01', '2026-04-30');
eq(scopedUtilByProd(GNG)['GL ALLOY'], 400, 'hasil di-key seperti utilizationByProd (GL ALLOY), bukan nama lot');

console.log('-- Obtain: bersandar pada PERTEK, bukan SPI --');
setPeriod('2026-07-01', '2026-07-31');
// PERTEK Submit #3 = 06/07/2026 (dalam periode); SPI Obtained #3 = 22/07 juga Juli.
eq(scopedObtainedByProd(GNG)['GL ALLOY'], 200, 'Obtained #3 masuk Juli lewat PERTEK 06/07');
setPeriod('2026-06-01', '2026-06-30');
eq(scopedObtainedByProd(GNG)['GL ALLOY'] || 0, 0, 'Juni tidak memuat PERTEK 06/07 -> 0');

/* GKL — PERTEK Perubahan sudah terbit tapi SPI masih TBA. Master
   MENGHITUNGNYA; sebelum perbaikan ini dashboard tidak. */
const GKL = {
  code: 'GKL',
  utilizationByProd: { 'GL ALLOY': 0 }, availableByProd: { 'GL ALLOY': 600 },
  etaByProd: {}, shipments: {},
  cycles: [
    { type: 'Submit #2',   mt: 3000, products: { 'GL BORON': 3000 }, submitDate: '14/07/2026', releaseDate: '31/07/2026' },
    { type: 'Obtained #2', mt: 600,  products: { 'GL BORON': 600 },  submitDate: '03/08/2026', releaseDate: '', spiDate: '', pertekDate: '' },
  ],
};
setPeriod('2026-07-01', '2026-07-31');
eq(scopedObtainedByProd(GKL)['GL ALLOY'], 600,
   'SPI masih TBA tapi PERTEK Perubahan 31/07 terbit -> 600 MT dihitung di Juli (seperti master)');

console.log('-- Available = Obtain - Utilized, keduanya di periode yang SAMA --');
setPeriod('2026-07-01', '2026-07-31');
// Juli: obtained 200 (PERTEK 06/07), utilisasi 0 (tanggalnya 28/04)
eq(scopedAvailByProd(GNG)['GL ALLOY'], 200, 'Juli: 200 obtained - 0 utilisasi = 200');
setPeriod('2026-04-01', '2026-04-30');
// April: obtained 0, utilisasi 400 -> tidak boleh negatif
eq(scopedAvailByProd(GNG)['GL ALLOY'], 0, 'April: 0 obtained - 400 utilisasi -> dijepit ke 0, bukan negatif');

console.log('-- All Time tidak berubah perilakunya --');
setPeriod(null, null);
eq(scopedUtilTotal(GNG), undefined === GNG.utilizationMT ? 0 : (GNG.utilizationMT || 0),
   'All Time membaca co.utilizationMT apa adanya');
eq(scopedAvailByProd(GNG)['GL ALLOY'], 200, 'All Time membaca co.availableByProd apa adanya');

console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
