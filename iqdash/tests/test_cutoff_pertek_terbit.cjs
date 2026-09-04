/* KUOTA MASUK AVAILABLE SEJAK PERTEK TERBIT — bukan sejak SPI terbit.
 *
 * Diminta tim 04-Sep-2026, tiga gejala dengan tiga sebab berbeda:
 *
 *   1. AMP Obtained #2 (200 MT GL ALLOY) tidak terlihat di satu pun permukaan
 *      per-produk. Sebabnya getCycleBreakdown() memanggil _isObtainedTerbit(c)
 *      TANPA allCycles, sehingga cabang terakhir aturan itu — "pakai PERTEK
 *      Terbit dari Submit pasangannya" — tidak pernah bisa dijalankan.
 *
 *   2. Walau siklusnya lolos, angkanya tetap tidak muncul karena
 *      getObtainedByProdAgg() memakai company_product_stats yang TERTINGGAL,
 *      dan cadangannya hanya menyala kalau stats sama sekali kosong.
 *
 *   3. SNSD terbaca "⏳ Pending" walau SPI-nya terbit, karena processStatus()
 *      memutus pada kolom `section` dan tidak pernah melihat SPI-nya.
 *
 * YANG DIKUNCI — arah yang menahan sama pentingnya dengan arah yang memperbaiki:
 *
 *   A. Obtained yang PERTEK-nya terbit dihitung walau SPI-nya belum.
 *   B. Obtained tanpa PERTEK MAUPUN SPI TIDAK dihitung. Tanpa syarat ini,
 *      placeholder Obtained yang dibuat form Revision Management ikut masuk
 *      Available Quota — kuota yang belum diberikan siapa pun.
 *   C. Stats yang tertinggal ditambal SELISIHNYA saja, dari siklus TERBARU.
 *   D. Stats yang LEBIH BESAR dari siklus tidak disentuh — itu perbedaan data
 *      yang harus tetap terlihat di __auditObtained(), bukan ditambal diam-diam.
 *   E. Company berrevisi tidak boleh kehilangan split post-revisinya. Ini yang
 *      paling mudah rusak: mengambil max(stats, siklus) per produk akan
 *      menghidupkan kembali produk SEBELUM revisi.
 *   F. section='PENDING' + SPI terbit -> Completed; tanpa SPI -> tetap Pending.
 *
 * Run: node iqdash/tests/test_cutoff_pertek_terbit.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

const buatEl = () => ({ innerHTML: '', textContent: '', value: '', style: {},
  classList: { add(){}, remove(){}, contains: () => false }, appendChild(){},
  querySelectorAll: () => [], querySelector: () => null, setAttribute(){}, addEventListener(){},
  getContext: () => ({}) });
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean, MT_LOCALE: 'en-US',
  localStorage: { getItem: () => null, setItem: () => {} },
  Chart: function () { return { destroy() {} }; },
  document: { getElementById: buatEl, querySelectorAll: () => [], querySelector: () => null,
    createElement: buatEl, addEventListener: () => {}, body: { appendChild(){} } },
});
ctx.window = ctx; ctx.globalThis = ctx;
['00-num.js', '01-data.js', '01a-quota-year.js', '02-period-filter.js']
  .forEach(f => { try { vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }); }
                  catch (e) { console.log('  (lewati ' + f + ': ' + e.message.slice(0, 60) + ')'); } });
const set = (nama, v) => { ctx.__t = v; vm.runInContext(`${nama} = __t;`, ctx); };
const panggil = (fn, arg) => { ctx.__a = arg; return vm.runInContext(`${fn}(__a)`, ctx); };
set('PRODUCT_ALIASES', { 'GL BORON': 'GL ALLOY', 'GI BORON': 'GI ALLOY' });
set('PERIOD', { active: false });

/* AMP: Obtained #2 tanpa tanggal apa pun, tapi Submit #2 PERTEK terbit. */
const amp = (opsi = {}) => ({
  code: 'AMP', section: 'SPI', products: ['GL ALLOY', 'PPGL CARBON'],
  utilizationByProd: { 'GL ALLOY': 400, 'PPGL CARBON': 400 },
  availableByProd:   { 'GL ALLOY': 0,   'PPGL CARBON': 0 },
  cycles: [
    { type: 'Submit #1', mt: 7000, products: { 'PPGL CARBON': 1000, 'GL ALLOY': 6000 },
      pertekDate: '23/10/2025', releaseDate: '23/10/2025', spiDate: '' },
    { type: 'Obtained #1', mt: 800, products: { 'GL ALLOY': 400, 'PPGL CARBON': 400 },
      pertekDate: '', releaseDate: '27/11/2025', spiDate: '27/11/2025' },
    { type: 'Submit #2', mt: 2600, products: { 'GL ALLOY': 2600 },
      pertekDate: opsi.tanpaPertek ? '' : '02/09/2026',
      releaseDate: opsi.tanpaPertek ? null : '02/09/2026', spiDate: '' },
    { type: 'Obtained #2', mt: 200, products: { 'GL ALLOY': 200 },
      pertekDate: '', releaseDate: null, spiDate: '', _fromRevReq: true },
  ],
});

console.log('\nA · PERTEK Terbit sudah cukup — SPI belum perlu');
{
  const co = amp();

  ctx.__a = co;
  const br = vm.runInContext('getCycleBreakdown(__a, "obtained")', ctx);
  ok(br.some(c => /obtained\s*#2/i.test(c.type)),
    'Obtained #2 masuk breakdown lewat PERTEK Submit #2 (02/09/2026), tanpa SPI',
    JSON.stringify(br.map(c => c.type)));
  ok(vm.runInContext('canonicalObtained(__a)', ctx) === 1000,
    'total obtained 1.000 MT (800 + 200)', String(vm.runInContext('canonicalObtained(__a)', ctx)));
}

console.log('\nB · Tanpa PERTEK maupun SPI, kuotanya TIDAK dihitung');
{
  ctx.__a = amp({ tanpaPertek: true });
  const br = vm.runInContext('getCycleBreakdown(__a, "obtained")', ctx);
  ok(!br.some(c => /obtained\s*#2/i.test(c.type)),
    'placeholder tanpa tanggal apa pun tetap gugur — bukan kuota yang diberikan',
    JSON.stringify(br.map(c => c.type)));
  ok(vm.runInContext('canonicalObtained(__a)', ctx) === 800,
    'totalnya tetap 800 MT', String(vm.runInContext('canonicalObtained(__a)', ctx)));
}

console.log('\nC · Stats yang tertinggal ditambal selisihnya, dari siklus terbaru');
{
  ctx.__a = amp();
  const agg = vm.runInContext('getObtainedByProdAgg(__a)', ctx);
  ok(Math.abs((agg['GL ALLOY'] || 0) - 600) < 0.01,
    'GL ALLOY 400 (stats) + 200 (Obtained #2) = 600', JSON.stringify(agg));
  ok(Math.abs((agg['PPGL CARBON'] || 0) - 400) < 0.01,
    'PPGL CARBON tetap 400 — tambahannya TIDAK dibagi rata ke produk lain', JSON.stringify(agg));
}

console.log('\nD · Stats yang LEBIH BESAR dari siklus tidak disentuh');
{
  /* SJH: stats 390, siklus 300. Selisih -90 sedang ditanyakan ke CorpSec dan
     harus tetap terlihat di __auditObtained(), bukan ditambal diam-diam. */
  ctx.__a = { code: 'SJH', section: 'SPI', products: ['GL ALLOY'],
    utilizationByProd: { 'GL ALLOY': 390 }, availableByProd: { 'GL ALLOY': 0 },
    cycles: [
      { type: 'Submit #1', mt: 6000, products: { 'GL ALLOY': 6000 }, pertekDate: '01/01/2026', releaseDate: '01/01/2026', spiDate: '' },
      { type: 'Obtained #1', mt: 300, products: { 'GL ALLOY': 300 }, pertekDate: '', releaseDate: '01/02/2026', spiDate: '01/02/2026' },
    ] };
  const agg = vm.runInContext('getObtainedByProdAgg(__a)', ctx);
  ok(Math.abs((agg['GL ALLOY'] || 0) - 390) < 0.01,
    'stats 390 dipertahankan apa adanya; selisih negatif tidak dipangkas', JSON.stringify(agg));
}

console.log('\nE · Company berrevisi tetap memakai split SESUDAH revisi');
{
  /* BDG: stats GL 650 + GI 350 (net sesudah revisi), siklus BORDES 1.000
     (produk sebelum revisi). Kalau penambalannya memakai max() per produk,
     BORDES 1.000 akan hidup lagi — kuota yang sudah tidak dimiliki siapa pun. */
  ctx.__a = { code: 'BDG', section: 'SPI', products: ['GL ALLOY', 'GI ALLOY'],
    utilizationByProd: { 'GL ALLOY': 650, 'GI ALLOY': 350 },
    availableByProd:   { 'GL ALLOY': 0,   'GI ALLOY': 0 },
    cycles: [
      { type: 'Submit #1', mt: 6000, products: { 'BORDES ALLOY': 6000 }, pertekDate: '22/12/2025', releaseDate: '22/12/2025', spiDate: '' },
      { type: 'Obtained #1', mt: 1000, products: { 'BORDES ALLOY': 1000 }, pertekDate: '', releaseDate: '13/01/2026', spiDate: '13/01/2026' },
      { type: 'Revision #2', mt: 0, products: { 'BORDES ALLOY': -350, 'GI ALLOY': 350 }, pertekDate: '22/06/2026', releaseDate: '22/06/2026', spiDate: '' },
    ] };
  const agg = vm.runInContext('getObtainedByProdAgg(__a)', ctx);
  ok(!('BORDES ALLOY' in agg),
    'BORDES ALLOY (produk sebelum revisi) TIDAK dihidupkan kembali', JSON.stringify(agg));
  ok(Math.abs((agg['GL ALLOY'] || 0) - 650) < 0.01 && Math.abs((agg['GI ALLOY'] || 0) - 350) < 0.01,
    'split sesudah revisi utuh: GL 650 · GI 350', JSON.stringify(agg));
}

console.log('\nF · section PENDING + SPI terbit -> Completed');
{
  const snsd = (spi) => ({ code: 'SNSD', section: 'PENDING', group: 'CD', products: ['GI ALLOY'],
    utilizationByProd: {}, availableByProd: {}, revType: 'complete',
    cycles: [
      { type: 'Submit #1', mt: 3000, products: { 'GI ALLOY': 3000 }, pertekDate: '04/08/2026', releaseDate: '04/08/2026', spiDate: '' },
      { type: 'Obtained #1', mt: 120, products: { 'GI ALLOY': 120 }, pertekDate: '', releaseDate: spi ? '07/08/2026' : null, spiDate: spi || '' },
    ] });
  ctx.__a = snsd('07/08/2026');
  const a = vm.runInContext('processStatus(__a)', ctx);
  ok(a.key === 'completed', 'SPI terbit 07/08/2026 -> Completed, walau section masih PENDING', JSON.stringify(a));

  ctx.__a = snsd('');
  const b = vm.runInContext('processStatus(__a)', ctx);
  ok(b.key !== 'completed',
    'tanpa SPI terbit, company PENDING TIDAK ikut terbaca Completed', JSON.stringify(b));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
