/* REALISASI: satu perusahaan bisa punya BEBERAPA GELOMBANG kedatangan.
 *
 * `ra_records` menyimpan satu baris per gelombang, bukan per perusahaan.
 * getRA() sengaja memulangkan gelombang TERBARU saja. Setiap permukaan yang
 * memakainya sebagai "realisasi perusahaan" karena itu membuang gelombang
 * lainnya — dan `raTotals()` sudah ada persis untuk itu, dengan docblock yang
 * menyebut permukaan-permukaan ini.
 *
 * Ditemukan audit 2026-08-14, dua tempat:
 *   · baris TOTAL + bar footer "All Companies" membaca 13.531,494 MT terhadap
 *     kartu Total Realized 15.438,208 (AMP kehilangan 399,178 · SGD 1.507,536)
 *   · drill Realized menulis "Companies 26" — itu jumlah BARIS RA — terhadap
 *     kartu yang membukanya: 24 perusahaan
 *
 * Run: node iqdash/tests/test_realized_gelombang_ganda.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const JS  = path.join(__dirname, '..', 'assets', 'js');
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean,
  MT_LOCALE: 'en-US',
  document: { getElementById: () => null, querySelectorAll: () => [] },
});
ctx.window = ctx;
['01-data.js', '02-period-filter.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }));
const call = e => vm.runInContext(e, ctx);

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

/* ── Fixture: bentuk produksi. AMP & SGD dua gelombang, sisanya satu. ───── */
const RA = [
  { code: 'ADP', product: 'GL ALLOY', berat: 246.684, obtained: 350,  realPct: 0.704811, cargoArrived: true, arrivalDate: '2026-03-01' },
  { code: 'AMP', product: 'GL ALLOY', berat: 399.178, obtained: 800,  realPct: 0.9989,   cargoArrived: true, arrivalDate: '2026-01-15' },
  { code: 'AMP', product: 'GL ALLOY', berat: 399.942, obtained: 800,  realPct: 0,        cargoArrived: true, arrivalDate: '2026-04-27' },
  { code: 'SGD', product: 'SHEET PILE', berat: 1507.536, obtained: 2000, realPct: 0.998049, cargoArrived: true, arrivalDate: '2026-02-10' },
  { code: 'SGD', product: 'SHEET PILE', berat: 488.562,  obtained: 2000, realPct: 0,        cargoArrived: true, arrivalDate: '2026-04-24' },
];
const SPI = ['ADP', 'AMP', 'SGD'].map(code => ({
  code, obtained: 0, revType: 'none', products: [], cycles: [],
  utilizationByProd: {}, availableByProd: {},
}));
ctx.SPI = SPI; ctx.PENDING = []; ctx.RA = RA;
call('SPI = this.SPI; PENDING = this.PENDING; RA = this.RA; PRODUCT_ALIASES = {};');

const TOTAL = 246.684 + 399.178 + 399.942 + 1507.536 + 488.562;   // 3.041,902

console.log('-- raTotals(): agregat lintas gelombang --');
const amp = call('raTotals("AMP")'), sgd = call('raTotals("SGD")'), adp = call('raTotals("ADP")');
ok(amp.count === 2 && amp.multi === true, 'AMP terbaca 2 gelombang', JSON.stringify({count: amp.count}));
ok(Math.abs(amp.berat - 799.12) < 0.001, 'AMP realisasi = 399,178 + 399,942 = 799,12', String(amp.berat));
ok(Math.abs(sgd.berat - 1996.098) < 0.001, 'SGD realisasi = 1.507,536 + 488,562 = 1.996,098', String(sgd.berat));
ok(adp.count === 1 && Math.abs(adp.berat - 246.684) < 0.001, 'company satu gelombang tidak berubah');

console.log('\n-- getRA() memang HANYA satu gelombang — itu jebakannya --');
ok(call('getRA("AMP")').berat === 399.942, 'getRA(AMP) memulangkan gelombang terbaru saja (399,942)');
ok(Math.abs(call('getRA("AMP")').berat - amp.berat) > 1,
   'memakai getRA() sebagai realisasi perusahaan MENGHILANGKAN tonase');

console.log('\n-- total: satu sumber, bukan penjumlahan per baris --');
const kanonik = call('reportRealizedTotal()');
ok(Math.abs(kanonik.mt - TOTAL) < 0.001, `reportRealizedTotal() = ${TOTAL}`, JSON.stringify(kanonik));
ok(kanonik.companies === 3, 'menghitung PERUSAHAAN (3), bukan baris RA (5)', String(kanonik.companies));

/* Cara lama yang bikin bug: satu baris per company lewat getRA(). */
const caraLama = ['ADP','AMP','SGD'].reduce((s,c) => s + (call(`getRA(${JSON.stringify(c)})`).berat || 0), 0);
ok(Math.abs(kanonik.mt - caraLama) > 1000,
   `cara lama (getRA per company) memang meleset jauh: ${caraLama.toFixed(3)} vs ${kanonik.mt.toFixed(3)}`);
const viaTotals = ['ADP','AMP','SGD'].reduce((s,c) => s + call(`raTotals(${JSON.stringify(c)})`).berat, 0);
ok(Math.abs(viaTotals - kanonik.mt) < 0.001, 'lewat raTotals() jumlahnya kembali sama dengan kartu');

console.log('\n-- realPct = Σ berat perusahaan ÷ obtained --');
/* Bukan tafsiran: company dua-gelombang menyimpan persentase SE-PERUSAHAAN
   pada salah satu barisnya, dan turunan ini menghasilkan angka yang sama. */
const pct = (c, obt) => call(`raTotals(${JSON.stringify(c)})`).berat / obt;
ok(Math.abs(pct('AMP', 800) - 0.9989) < 0.0005, 'AMP: 799,12 / 800 = 0,9989 — sama dengan realPct tersimpan');
ok(Math.abs(pct('SGD', 2000) - 0.998049) < 0.0005, 'SGD: 1.996,098 / 2.000 = 0,998049 — sama dengan tersimpan');
ok(Math.abs(pct('ADP', 350) - 0.704811) < 0.0005, 'ADP satu gelombang: turunannya juga sama');

console.log('\n-- struktur: permukaan tidak boleh menjumlah berat sendiri --');
const kode = f => fs.readFileSync(path.join(JS, f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
const k07 = kode('07-tables-main.js'), k03 = kode('03-kpis.js');
ok(/raTotals\(/.test(k07), '07-tables-main.js memakai raTotals() untuk realisasi per baris');
ok(!/const tReal\s*=\s*rows\.reduce/.test(k07) && !/const tR\s*=\s*rows\.reduce\(\(s,d\)\s*=>\s*s\+\(d\.berat/.test(k07),
   'baris TOTAL & bar footer tidak lagi menjumlah d.berat sendiri');
ok((k07.match(/reportRealizedTotal\(\)/g) || []).length >= 2,
   'keduanya memanggil reportRealizedTotal()');
/* Drill Realized dibuka DARI kartu, jadi tile ringkasnya harus MEMANGGIL angka
   kartu — bukan menjumlah barisnya sendiri. Dulu kartu memakai baris PIB
   (gerbang pib_date) sementara drill memakai ra_records (gerbang arrivalDate):
   Juni 2026 membaca 2.069,08 / 5 company terhadap 2.275,372 / 9. */
const drill = k03.slice(k03.indexOf('function refreshRealizedDrill'),
                        k03.indexOf('function refreshRealizedDrill') + 4200);
ok(/const _kanon\s*=\s*reportRealizedTotal\(\)/.test(drill),
   'drill Realized memanggil reportRealizedTotal() untuk ringkasannya');
ok(/totalRealized\s*=\s*_kanon\.mt/.test(drill) && /nCompanies\s*=\s*_kanon\.companies/.test(drill),
   'MT dan jumlah perusahaan diambil dari sumber kanonik');
ok(!/\['Companies',\s*rows\.length/.test(k03),
   'kartu "Companies" pada drill tidak lagi memakai rows.length');
ok(/REALIZATIONS\.forEach/.test(drill) && /inPd\(pDate\(r\.pib_date\)\)/.test(drill),
   'barisnya diringkas dari baris PIB dengan gerbang pib_date — sama dengan kartu');
ok(/raTotals\(/.test(drill), 'cabang cadangannya memakai raTotals(), bukan satu baris per gelombang');

/* ── Tabel All Companies: satu basis, bukan dua ─────────────────────────
   Barisnya memakai d.submit1 / d.obtained — keduanya SEPANJANG WAKTU — di atas
   daftar company yang sudah difilter periode, jadi baris TOTAL berbeda dari
   kartu di SETIAP periode (H1 2026: Submit 236.945 vs 74.945). Dan kolamnya
   lebih sempit dari kolam kartu Utilized, sehingga company yang kargonya
   mendarat di jendela tapi siklusnya di luar tidak punya baris sama sekali
   (Feb 2026: SGD 2.000 MT). */
console.log('\n-- tabel All Companies: satu basis dengan kartunya --');
const k07b = kode('07-tables-main.js');
ok(/scopedSubmittedTotal\(d\)/.test(k07b),
   'Submit per baris diiris periode lewat scopedSubmittedTotal()');
ok(/canonicalObtainedFiltered\(d\)/.test(k07b),
   'Obtained per baris diiris periode lewat canonicalObtainedFiltered()');
ok(/realizedByCompany\(\)/.test(k07b),
   'Realisasi per baris lewat realizedByCompany() — pasangan per-company dari kartu');
ok(/utilizationPool\(filteredSPI\(\)\)/.test(k07b),
   'kolam tabel = kolam kartu Utilized, bukan hanya company ber-siklus di periode');

const k02b = kode('02-period-filter.js');
ok(/function scopedSubmittedTotal/.test(k02b) && /function realizedByCompany/.test(k02b),
   'kedua pasangan per-company hidup di lapisan kanonik, bukan di permukaannya');
/* scopedSubmittedTotal harus memakai gerbang yang SAMA dengan reportSubmittedTotal. */
const sst = k02b.slice(k02b.indexOf('function scopedSubmittedTotal'),
                       k02b.indexOf('function scopedSubmittedTotal') + 900);
ok(/\^submit\\s\*#\\d/.test(sst) && /_fromRevReq/.test(sst) && /inPd\(pDate\(c\.submitDate\)\)/.test(sst),
   'aturannya sama persis: Submit #N saja · dedup · lewati _fromRevReq · gerbang Submit MOI');

console.log(`\n${fail === 0 ? '✔ SEMUA LULUS' : '✖ GAGAL'}  —  lulus ${pass}, gagal ${fail}`);
process.exit(fail ? 1 : 0);
