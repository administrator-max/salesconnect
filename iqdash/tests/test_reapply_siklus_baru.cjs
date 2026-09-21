/* RE-APPLY = SIKLUS SUBMIT BARU, HANYA PRODUK YANG DIPILIH (tim, 21-Sep-2026)
 *
 * "Sales pilih Re-Apply → pilih produk → input tonase → submit ke CorpSec.
 *  Jangan ada pilihan 'tetap sama'. EMS: Sales hanya memilih GL Alloy 3.000
 *  MT, maka saat CorpSec confirm hanya GL Alloy 3.000 MT yang muncul. GI Alloy
 *  tidak boleh otomatis ikut muncul." Dan: "Revision tidak boleh double count
 *  dan Re-Apply harus menjadi cycle submission baru."
 *
 * YANG DIKUNCI (hubungan, bukan angka data hidup):
 *   A. Konfirmasi melahirkan TEPAT SATU siklus Submit #N baru berisi hanya
 *      produk yang diminta — tanpa Revision Request, tanpa placeholder Obtained.
 *   B. Total Submitted naik tepat sebesar MT itu, sekali. Konfirmasi ulang
 *      tidak menambah siklus kedua.
 *   C. Form status CorpSec menyasar siklus BARU itu (Submit #N → Obtained #N),
 *      bukan Obtained re-apply sebelumnya yang sudah terbit.
 *   D. Obtained tidak berubah sampai PERTEK-nya terbit; Available tetap
 *      obtained − utilisasi.
 *   E. Permintaan yang belum diputus = Re-Apply berjalan (Active Application),
 *      tapi belum menambah Submitted.
 *   F. Revision Request yang sudah tertaut ("→ Submit #3") tidak dihitung lagi.
 *   G. Drill Total Submitted = kartu, per company (termasuk re-apply proses).
 *   H. Notifikasi: pending → "Confirmed / In Process" + siklus tautannya.
 *
 * Run: node iqdash/tests/test_reapply_siklus_baru.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const JS = path.join(__dirname, '..', 'assets', 'js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

/* DOM tiruan yang MENGINGAT isinya per id — drill Total Submitted menulis
   ringkasan & kakinya ke elemen, dan dari situ angkanya dibaca kembali. */
const nodes = {};
const mk = () => ({ style: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  querySelectorAll: () => [], querySelector: () => null, appendChild(){}, setAttribute(){},
  addEventListener(){}, textContent: '', innerHTML: '', value: '' });
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map, isNaN, parseFloat, parseInt,
  RegExp, Boolean, Promise, setTimeout: () => 0, clearTimeout(){}, MT_LOCALE: 'en-US',
  localStorage: { getItem: () => null, setItem(){} },
  Chart: function () { return { destroy(){} }; },
  document: { getElementById: id => (nodes[id] = nodes[id] || mk()), querySelectorAll: () => [],
    querySelector: () => null, createElement: mk, addEventListener(){}, body: { appendChild(){} } },
});
ctx.window = ctx; ctx.globalThis = ctx;
['00-num.js', '01-data.js', '01a-quota-year.js', '02-period-filter.js', '03-kpis.js', '04-charts.js',
 '10-edit-form.js', '13-rev-mgmt.js', '24-notifications.js'].forEach(f => {
  try { vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }); }
  catch (e) { console.log('  (lewati ' + f + ': ' + e.message.slice(0, 70) + ')'); }
});
vm.runInContext(`
  PRODUCT_ALIASES = { 'GL BORON': 'GL ALLOY', 'GI BORON': 'GI ALLOY' };
  currentRole = 'CorpSec';
  var __simpan = 0;
  nsAfterDecision = function () { __simpan++; };      // jalur simpan tidak diuji di sini
`, ctx);
const run = s => vm.runInContext(s, ctx);
const set = (k, v) => { ctx[k] = v; };

/* Company tiruan berbentuk EMS: Submit #1 SHEET PILE, re-apply #1 GI ALLOY
   yang sudah terbit, lalu Sales meminta re-apply #2 GL ALLOY. */
const emsLike = () => ({
  code: 'EMSX', revType: 'complete', products: ['SHEET PILE', 'GI ALLOY'],
  utilizationMT: 2100, utilizationByProd: { 'SHEET PILE': 1600, 'GI ALLOY': 500 },
  availableByProd: { 'SHEET PILE': 0, 'GI ALLOY': 0 },
  salesRevRequest: {},
  cycles: [
    { type: 'Submit #1', mt: 8000, products: { 'SHEET PILE': 8000 }, submitDate: '15/10/2025', releaseDate: '29/10/2025', pertekDate: '29/10/2025' },
    { type: 'Obtained #1', mt: 1600, products: { 'SHEET PILE': 1600 }, releaseDate: '07/11/2025', spiDate: '07/11/2025' },
    { type: 'Submit #2', mt: 3000, products: { 'GI ALLOY': 3000 }, submitDate: '07/04/2026', releaseDate: '11/05/2026', pertekDate: '11/05/2026' },
    { type: 'Obtained #2', mt: 500, products: { 'GI ALLOY': 500 }, releaseDate: '18/05/2026', spiDate: '18/05/2026' },
  ],
  reapplyRequests: [{ id: 'RA1', products: [{ product: 'GL ALLOY', mt: 3000 }],
    confirmedTargets: [{ product: 'GL ALLOY', mt: null, status: 'pending' }], status: 'pending',
    requestedBy: 'Putri (Sales)', requestedDate: '20-Sep-26' }],
});

console.log('\nE · permintaan belum diputus: Re-Apply berjalan, Submitted belum naik');
set('__co', emsLike());
run('SPI = [__co]; PENDING = [];');
ok(run('adaReapplyBerjalan(__co)') === true, 'adaReapplyBerjalan = true');
ok(run('activeApplicationStage(__co)') === 'reapply', 'Active Application: Re-Apply', run('activeApplicationStage(__co)'));
ok(run('canonicalSubmitted(__co)') === 11000, 'Submitted tetap 11.000 sebelum dikonfirmasi', String(run('canonicalSubmitted(__co)')));
{
  const n = run('notifItems()').filter(x => x.code === 'EMSX');
  ok(n.length === 1 && n[0].type === 'Re-Apply' && n[0].status.key === 'pending',
    'notifikasi: 1 baris Re-Apply, Pending', JSON.stringify(n.map(x => [x.type, x.status.key])));
  ok(n[0] && n[0].product === 'GL ALLOY' && n[0].mt === 3000 && n[0].by === 'Putri (Sales)',
    'kolom Product / MT / Requested by terisi dari permintaan', JSON.stringify(n[0]));
}

console.log('\nA · konfirmasi = SATU Submit #3 baru, hanya GL ALLOY');
run(`(() => { const r = raFind(__co, 'RA1'); r.submitDate = '24/08/2026';
  const st = nsTargetState(r); st[0].status = 'confirmed'; st[0].mt = 3000;
  r.confirmedDate = '21-Sep-26'; r.confirmedBy = 'Maya (CorpSec)';
  rrSyncReqStatus(r, null, st); raRebuildFromConfirmed(__co, r); })()`);
{
  const cy = run('__co.cycles');
  const s3 = cy.filter(c => c.type === 'Submit #3');
  ok(s3.length === 1, 'tepat satu siklus Submit #3', JSON.stringify(cy.map(c => c.type)));
  ok(s3[0] && JSON.stringify(Object.keys(s3[0].products)) === '["GL ALLOY"]' && s3[0].mt === 3000,
    'isinya HANYA GL ALLOY 3.000 — GI ALLOY tidak ikut', JSON.stringify(s3[0] && s3[0].products));
  ok(s3[0] && s3[0].submitDate === '24/08/2026', 'tanggal submit dari CorpSec', s3[0] && s3[0].submitDate);
  ok(s3[0] && /Menunggu PERTEK Perubahan #2 Terbit/.test(s3[0].status), 'status "Menunggu PERTEK Perubahan #2 Terbit"', s3[0] && s3[0].status);
  ok(!cy.some(c => /^revision request/i.test(c.type)), 'tidak ada siklus Revision Request');
  ok(cy.filter(c => /^obtained/i.test(c.type)).length === 2, 'tidak ada placeholder Obtained baru');
  ok(run('raFind(__co,"RA1").cycleType') === 'Submit #3', 'permintaan tertaut ke Submit #3');
}

console.log('\nB · Submitted naik sekali, konfirmasi ulang tidak menggandakan');
ok(run('canonicalSubmitted(__co)') === 14000, 'Submitted = 8.000 + 3.000 + 3.000 = 14.000', String(run('canonicalSubmitted(__co)')));
run(`raRebuildFromConfirmed(__co, raFind(__co, 'RA1'))`);
ok(run('__co.cycles.filter(c => c.type === "Submit #3").length') === 1, 'konfirmasi ulang: tetap satu Submit #3');
ok(run('canonicalSubmitted(__co)') === 14000, 'Submitted tetap 14.000');
ok(run('pendingReapplyMT(__co)') === 0, 'tidak ada re-apply "tanpa siklus" yang ikut dijumlah lagi');

console.log('\nC · form CorpSec menyasar siklus BARU');
ok(run('(rrGetActiveCycle(__co) || {}).type') === 'Submit #3', 'siklus aktif = Submit #3', run('(rrGetActiveCycle(__co) || {}).type'));
ok(run('rrObtainedTypeFor(__co)') === 'Obtained #3', 'Obtained sasaran = Obtained #3, bukan #2', run('rrObtainedTypeFor(__co)'));
ok(run('activeApplicationStage(__co)') === 'reapply', 'masih Re-Apply sampai PERTEK terbit');

console.log('\nD · Obtained & Available tidak bergerak sampai PERTEK terbit');
ok(run('canonicalObtained(__co)') === 2100, 'Obtained = 1.600 + 500', String(run('canonicalObtained(__co)')));
ok(run('cumulativeAvailable(__co)') === 0, 'Available = obtained − utilisasi = 0');

console.log('\nH · notifikasi ikut berubah dari data yang sama');
{
  const n = run('notifItems()').filter(x => x.code === 'EMSX')[0];
  ok(n && n.status.key === 'process' && /Confirmed \/ In Process/.test(n.status.text) && /Submit #3/.test(n.status.text),
    'status: Confirmed / In Process · Submit #3', n && n.status.text);
}

console.log('\nF · Revision Request yang sudah tertaut tidak dihitung lagi');
{
  set('__lk', { code: 'LK', revType: 'active',
    salesRevRequest: { 'GL ALLOY': { requested: true, status: 'confirmed', revisionType: 'Re-Apply' } },
    cycles: [
      { type: 'Submit #1', mt: 6000, products: { 'GL ALLOY': 6000 }, submitDate: '01/01/2026', releaseDate: '01/02/2026', pertekDate: '01/02/2026' },
      { type: 'Revision Request — GL ALLOY', mt: 3000, products: { 'GL ALLOY': 3000 }, submitDate: '21-Sep-26', releaseDate: '21-Sep-26',
        status: '✅ Dikonfirmasi · → Submit #2' },
      { type: 'Submit #2', mt: 3000, products: { 'GL ALLOY': 3000 }, submitDate: '14/09/2026' },
    ] });
  ok(run('canonicalSubmitted(__lk)') === 9000, 'Submit #2 lebih tua dari konfirmasi, tapi tetap 9.000 (bukan 12.000)', String(run('canonicalSubmitted(__lk)')));
}

console.log('\nG · drill Total Submitted = kartu, per company');
{
  const a = emsLike();
  a.code = 'AX';
  a.cycles.push({ type: 'Revision Request — GL ALLOY', mt: 3000, products: { 'GL ALLOY': 3000 },
    submitDate: '17-Sep-26', releaseDate: '17-Sep-26', status: '✅ Dikonfirmasi' });
  a.salesRevRequest = { 'GL ALLOY': { requested: true, status: 'confirmed', revisionType: 'Re-Apply' } };
  a.reapplyRequests = [];
  set('__a', a);
  run('SPI = [__co, __a]; PENDING = []; SPI_ALL = SPI; PENDING_ALL = [];');
  const kartu = run('reportSubmittedTotal().mt');
  run('refreshSubmitDrill()');
  const kaki = (nodes.submitDrillFooter || {}).textContent || '';
  const m = kaki.match(/Grand total ([\d,]+) MT/);
  const drill = m ? Number(m[1].replace(/,/g, '')) : NaN;
  ok(drill === kartu, `Σ drill ${drill} = kartu ${kartu} (re-apply proses ikut)`, kaki);
}

console.log(`\n${fail ? '✘' : '✔'} ${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
