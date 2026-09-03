/* STATUS COMPANY — Obtained yang DIGANTIKAN REVISI tidak boleh membuat
 * Submit-nya terlihat menggantung selamanya.
 *
 * DIOR: Obtained #1 (Bordes Alloy) ditahan ("Hold, waiting address changes"),
 * lalu revisi memindahkan kuotanya ke GL Alloy dan SPI terbit sebagai
 * Obtained #2. Obtained #1 tidak akan pernah bertanggal SPI, jadi Submit #1
 * selamanya terlihat menggantung dan DIOR terbaca "Under Revision" walau
 * kuotanya sudah diterima.
 *
 * YANG DIKUNCI — dan kenapa yang kedua sama pentingnya:
 *
 *   A. Obtained yang digantikan revisi DAN ada pengganti terbit -> selesai.
 *
 *   B. Obtained yang digantikan revisi TAPI TIDAK ADA pengganti terbit ->
 *      TETAP menggantung. Tanpa syarat ini, company yang revisinya dibatalkan
 *      dan tidak pernah menerima apa pun akan ikut terbaca selesai — kesalahan
 *      yang jauh lebih mahal daripada status yang terlalu hati-hati.
 *
 *   C. Obtained biasa yang belum terbit tetap menggantung.
 *
 *   D. Yang dipakai sebagai penanda "dipindahkan" adalah DELTA NEGATIF pada
 *      siklus revisi — penanda yang memang sudah dipakai BDG/MJU. Bukan tebakan
 *      dari nama siklus.
 *
 * Run: node iqdash/tests/test_status_obtained_digantikan.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

const nodes = {};
const buatEl = () => ({ innerHTML: '', textContent: '', value: '', style: {},
  classList: { add(){}, remove(){} }, appendChild(){}, querySelectorAll: () => [],
  querySelector: () => null, setAttribute(){}, addEventListener(){}, getContext: () => ({}) });
const node = id => (nodes[id] = nodes[id] || Object.assign(buatEl(), { id }));
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean, MT_LOCALE: 'en-US',
  localStorage: { getItem: () => null, setItem: () => {} },
  Chart: function () { return { destroy() {} }; },
  document: { getElementById: node, querySelectorAll: () => [], querySelector: () => null,
    createElement: buatEl, addEventListener: () => {}, body: { appendChild(){} } },
});
ctx.window = ctx; ctx.globalThis = ctx;
['00-num.js', '01-data.js', '01a-quota-year.js', '02-period-filter.js', '04-charts.js']
  .forEach(f => { try { vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }); }
                  catch (e) { console.log('  (lewati ' + f + ': ' + e.message.slice(0, 50) + ')'); } });
const call = e => vm.runInContext(e, ctx);
const set  = (name, v) => { ctx.__tmp = v; vm.runInContext(`${name} = __tmp;`, ctx); };
set('PRODUCT_ALIASES', { 'GL BORON': 'GL ALLOY', 'GI BORON': 'GI ALLOY' });

const stage = co => { ctx.__co = co; return vm.runInContext('outstandingStage(__co)', ctx); };

/* Bentuk DIOR: Submit #1 -> Obtained #1 (tertahan, tanpa SPI) -> revisi
   memindahkan produknya -> Obtained #2 terbit. */
const dior = (opsi = {}) => ({
  code: 'TST',
  cycles: [
    { type: 'Submit #1', mt: 6000, products: { 'BORDES ALLOY': 6000 },
      pertekDate: '20/07/2026', releaseDate: '20/07/2026', spiDate: '' },
    { type: 'Obtained #1', mt: 100, products: { 'BORDES ALLOY': 100 },
      pertekDate: '', releaseDate: null, spiDate: '' },
    { type: 'Revision Request — BORDES ALLOY', mt: 100,
      products: opsi.tanpaDelta ? { 'GL ALLOY': 100 } : { 'BORDES ALLOY': -100, 'GL ALLOY': 100 },
      pertekDate: '', releaseDate: '03-Sep-26', spiDate: '' },
    { type: 'Obtained #2', mt: 0, products: {},
      pertekDate: '', releaseDate: opsi.penggantiBelumTerbit ? null : '31/08/2026',
      spiDate: opsi.penggantiBelumTerbit ? '' : '31/08/2026' },
  ],
});

console.log('\nA · Digantikan revisi + pengganti TERBIT -> selesai');
ok(stage(dior()) === null,
  'Submit #1 tidak lagi menggantung — kuotanya diterima lewat Obtained #2',
  JSON.stringify(stage(dior())));

console.log('\nB · Digantikan revisi TAPI pengganti BELUM terbit -> tetap menggantung');
ok(stage(dior({ penggantiBelumTerbit: true })) !== null,
  'tanpa satu pun Obtained terbit, company TIDAK boleh terbaca selesai',
  JSON.stringify(stage(dior({ penggantiBelumTerbit: true }))));

console.log('\nC · Tanpa delta negatif, perilaku lama dipertahankan');
ok(stage(dior({ tanpaDelta: true })) !== null,
  'siklus revisi tanpa delta negatif bukan bukti perpindahan — tetap menggantung',
  JSON.stringify(stage(dior({ tanpaDelta: true }))));

console.log('\nD · Obtained biasa yang belum terbit tetap menggantung');
{
  const polos = { code: 'TST', cycles: [
    { type: 'Submit #1', mt: 1000, products: { 'GL ALLOY': 1000 }, pertekDate: '01/01/2026', releaseDate: '01/01/2026', spiDate: '' },
    { type: 'Obtained #1', mt: 100, products: { 'GL ALLOY': 100 }, pertekDate: '', releaseDate: null, spiDate: '' },
  ]};
  ok(stage(polos) !== null, 'tidak ada revisi sama sekali -> Submit #1 menggantung',
    JSON.stringify(stage(polos)));
}

console.log('\nE · Yang sudah terbit tetap selesai seperti sebelumnya');
{
  const beres = { code: 'TST', cycles: [
    { type: 'Submit #1', mt: 1000, products: { 'GL ALLOY': 1000 }, pertekDate: '01/01/2026', releaseDate: '01/01/2026', spiDate: '' },
    { type: 'Obtained #1', mt: 100, products: { 'GL ALLOY': 100 }, pertekDate: '', releaseDate: '05/02/2026', spiDate: '05/02/2026' },
  ]};
  ok(stage(beres) === null, 'Obtained #1 terbit -> selesai', JSON.stringify(stage(beres)));
}

console.log('\nF · Hanya SEBAGIAN produk dipindahkan -> belum selesai');
{
  const separuh = { code: 'TST', cycles: [
    { type: 'Submit #1', mt: 1000, products: { 'GL ALLOY': 600, 'GI ALLOY': 400 }, pertekDate: '01/01/2026', releaseDate: '01/01/2026', spiDate: '' },
    { type: 'Obtained #1', mt: 200, products: { 'GL ALLOY': 100, 'GI ALLOY': 100 }, pertekDate: '', releaseDate: null, spiDate: '' },
    { type: 'Revision #1', mt: 0, products: { 'GL ALLOY': -100, 'SHEET PILE': 100 }, pertekDate: '01/03/2026', releaseDate: '01/03/2026', spiDate: '' },
    { type: 'Obtained #2', mt: 0, products: {}, pertekDate: '', releaseDate: '01/04/2026', spiDate: '01/04/2026' },
  ]};
  ok(stage(separuh) !== null,
    'GI ALLOY tidak dipindahkan, jadi Obtained #1 belum tuntas — tetap menggantung',
    JSON.stringify(stage(separuh)));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
