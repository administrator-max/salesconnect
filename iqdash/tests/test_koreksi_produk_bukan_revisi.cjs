/* GANTI PRODUK SEBELUM PERTEK TERBIT = KOREKSI, BUKAN REVISI (05-Nov-2026).
 *
 * SGD & ADP 2027: CorpSec mengoreksi produk pengajuan 2027 di tabel produk form
 * Input Data. applyProductRenames() selalu menyuntik "Revision #N" + "Obtained
 * (Revision #N)" dan menandai company Under Revision — padahal PERTEK 2027
 * belum terbit, jadi tidak ada yang bisa direvisi (aturan induk no. 3).
 *
 *   A. PERTEK belum terbit → tidak ada siklus revisi, revType tidak berubah.
 *   B. Produk lama berpindah ke produk tujuan; bila tujuan (ejaan apa pun) sudah
 *      ada di siklus itu, MT DITAMBAHKAN (SGD: GL ALLOY 4.000 + SHEET PILE 2.000
 *      → SHEET PILE 6.000), total siklus tetap.
 *   C. PERTEK sudah terbit → perilaku revisi lama tetap (siklus revisi dibuat).
 * Data sintetis. Run: node iqdash/tests/test_koreksi_produk_bukan_revisi.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

function muat() {
  const ctx = {
    console, Object, Array, Number, String, Math, JSON, Date, Set,
    RA: [], MT_LOCALE: 'en-US',
    PRODUCT_ALIASES: { 'SHEETPILE': 'SHEET PILE', 'GI BORON': 'GI ALLOY', 'GL BORON': 'GL ALLOY' },
    document: { getElementById: () => null, querySelectorAll: () => [] },
  };
  ctx.canonicalProduct = p => (p && ctx.PRODUCT_ALIASES[p]) || p;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', '12-product-mt.js'), 'utf8'), ctx);
  return ctx;
}

{ // SGD 2027
  const ctx = muat();
  const co = { code: 'SGD', revType: 'none', products: ['GL ALLOY', 'SHEET PILE'],
    cycles: [{ type: 'Submit #1', mt: 6000, products: { 'GL ALLOY': 4000, 'SHEET PILE': 2000 }, submitDate: '09-Oct-26', releaseDate: '', pertekDate: '' }] };
  vm.runInContext('_pendingRenames["GL ALLOY"] = "SHEETPILE"', ctx);
  ctx.applyProductRenames(co);
  ok(co.cycles.length === 1, 'A. SGD: tidak ada siklus Revision/Obtained (Revision) baru', co.cycles.map(c => c.type).join());
  ok(co.revType === 'none' && !co.revStatus, 'A. SGD: tidak ditandai Under Revision', co.revType + ' / ' + co.revStatus);
  const p = co.cycles[0].products;
  ok(JSON.stringify(p) === JSON.stringify({ 'SHEET PILE': 6000 }), 'B. SGD: GL ALLOY 4.000 + SHEET PILE 2.000 → SHEET PILE 6.000', JSON.stringify(p));
  ok(co.cycles[0].mt === 6000, 'B. SGD: total siklus tetap 6.000');
  ok(JSON.stringify(co.products) === '["SHEET PILE"]', 'B. SGD: daftar produk satu baris', JSON.stringify(co.products));
}
{ // ADP 2027 — ejaan kembar
  const ctx = muat();
  const co = { code: 'ADP', revType: 'none', products: ['GI ALLOY'],
    cycles: [{ type: 'Submit #1', mt: 3000, products: { 'GI ALLOY': 3000 }, releaseDate: 'TBA' }] };
  vm.runInContext('_pendingRenames["GI ALLOY"] = "GI BORON"', ctx);
  ctx.applyProductRenames(co);
  ok(co.cycles.length === 1 && co.revType === 'none', 'A. ADP: tanpa siklus revisi', co.cycles.map(c => c.type).join());
  const tot = Object.values(co.cycles[0].products).reduce((a, b) => a + b, 0);
  ok(tot === 3000, 'B. ADP: total produk tetap 3.000', JSON.stringify(co.cycles[0].products));
}
{ // PERTEK sudah terbit → revisi
  const ctx = muat();
  const co = { code: 'X', revType: 'none', products: ['GL ALLOY'],
    cycles: [{ type: 'Submit #1', mt: 1000, products: { 'GL ALLOY': 1000 }, pertekDate: '19/01/2026', releaseDate: '19/01/2026' },
             { type: 'Obtained #1', mt: 1000, products: { 'GL ALLOY': 1000 } }] };
  vm.runInContext('_pendingRenames["GL ALLOY"] = "SHEET PILE"', ctx);
  ctx.applyProductRenames(co);
  ok(co.cycles.some(c => /^Revision #/.test(c.type)) && co.revType === 'active', 'C. PERTEK terbit: revisi tetap dibuat');
}
console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
