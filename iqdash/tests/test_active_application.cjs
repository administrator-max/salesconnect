/* Active Application harus memuat SETIAP perusahaan yang permohonannya masih
 * berjalan — empat golongan: New Submission · Revision · Re-Apply · PERTEK
 * Pending.
 *
 * BUG-nya (dilaporkan tim 2026-08-13): IKM berstatus "Submit" di SPI/PERTEK —
 * jelas sedang berproses — tapi tidak muncul di Active Revisions, sementara
 * DIOR dan GIS muncul.
 *
 * Sebabnya dua fungsi saling bertentangan untuk IKM:
 *   hasOutstandingCycle(IKM) -> true   (Obtained #2 belum bertanggal)
 *   outstandingStage(IKM)    -> null   (tidak ada Submit #2 pasangannya)
 * revisionStatus() memakai outstandingStage, jadi IKM tergolong 'completed'
 * dan hilang dari daftar. IKM juga punya dua Sales Revision Request yang belum
 * diputus CorpSec — permohonan berjalan yang tidak dilihat sama sekali.
 *
 * Run: node iqdash/tests/test_active_application.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const JS = path.join(__dirname, '..', 'assets', 'js');
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean,
  MT_LOCALE: 'en-US',
  document: { getElementById: () => null, querySelectorAll: () => [] },
});
['01-data.js', '02-period-filter.js', '04-charts.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }));
const call = e => vm.runInContext(e, ctx);

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

const cyc = (type, mt, o) => Object.assign({ type, mt, products: {} }, o || {});

/* ── Fixture: bentuk yang sebenarnya di produksi ───────────────────────── */
const SPI = [
  /* IKM — inti laporan. Obtained #2 tanpa tanggal & tanpa Submit #2, plus dua
     Sales Revision Request yang belum diputus CorpSec. */
  { code: 'IKM', obtained: 8000, revType: 'active', revStatus: 'Submit',
    cycles: [
      cyc('Submit #1', 16100, { submitDate: '30/04/2026', releaseDate: '30/06/2026', pertekDate: '30/06/2026' }),
      cyc('Obtained #1', 8000, { submitDate: '30/06/2026', releaseDate: '08/07/2026', spiDate: '08/07/2026' }),
      cyc('Revision Request — GI ALLOY', 4150, { submitDate: '13-Aug-26', releaseDate: '13-Aug-26' }),
      cyc('Obtained #2', 8000, {}),
    ],
    salesRevRequest: {
      'SEAMLESS PIPE': { requested: true, requestedMT: 1275, status: 'pending' },
      'SHEET PILE':    { requested: true, requestedMT: 1750, status: 'pending' },
    },
    utilizationByProd: {}, availableByProd: {}, products: [] },

  /* DIOR — revisi berjalan, PERTEK Perubahan belum terbit. */
  { code: 'DIOR', obtained: 100, revType: 'active',
    cycles: [
      cyc('Submit #1', 6000, { submitDate: '01/06/2026', releaseDate: '20/07/2026', pertekDate: '20/07/2026' }),
      cyc('Obtained #1', 100, {}),
    ],
    utilizationByProd: {}, availableByProd: {}, products: [] },

  /* GKL — Re-Apply: Submit #2 sudah PERTEK, Obtained #2 SPI masih TBA. */
  { code: 'GKL', obtained: 3000, revType: 'active',
    cycles: [
      cyc('Submit #1', 10000, { submitDate: '15/10/2025', releaseDate: '11/11/2025', pertekDate: '11/11/2025' }),
      cyc('Obtained #1', 2400, { submitDate: '26/11/2025', releaseDate: '24/12/2025', spiDate: '24/12/2025' }),
      cyc('Submit #2', 3000, { submitDate: '14/07/2026', releaseDate: '31/07/2026', pertekDate: '31/07/2026' }),
      cyc('Obtained #2', 600, {}),
    ],
    utilizationByProd: {}, availableByProd: {}, products: [] },

  /* TUNTAS — semua siklus lengkap tanggalnya. Tidak boleh muncul. */
  { code: 'DONE', obtained: 500, revType: 'none',
    cycles: [
      cyc('Submit #1', 5000, { submitDate: '01/01/2026', releaseDate: '01/02/2026', pertekDate: '01/02/2026' }),
      cyc('Obtained #1', 500, { submitDate: '05/02/2026', releaseDate: '10/02/2026', spiDate: '10/02/2026' }),
    ],
    utilizationByProd: {}, availableByProd: {}, products: [] },
];

/* BARU — belum pernah obtained sama sekali (hidup di PENDING). */
const PENDING = [
  { code: 'BARU', obtained: 0, revType: 'none',
    cycles: [ cyc('Submit #1', 3000, { submitDate: '01/08/2026' }) ],
    utilizationByProd: {}, availableByProd: {}, products: [] },
];

ctx.SPI = SPI; ctx.PENDING = PENDING; ctx.RA = [];
call('SPI = this.SPI; PENDING = this.PENDING; RA = this.RA;');

console.log('-- IKM wajib muncul  <-- inti laporan --');
ctx._ikm = SPI[0];
ok(call('hasOutstandingCycle(this._ikm)') === true, 'hasOutstandingCycle(IKM) = true (Obtained #2 tanpa tanggal)');
ok(call('outstandingStage(this._ikm)') === null, 'outstandingStage(IKM) = null — inilah celahnya');
ok(call('activeApplicationStage(this._ikm)') === 'active',
   'activeApplicationStage(IKM) = Revision — IKM MUNCUL',
   `dapat ${JSON.stringify(call('activeApplicationStage(this._ikm)'))}`);

console.log('\n-- golongan yang sudah benar tidak bergeser --');
ctx._dior = SPI[1]; ctx._gkl = SPI[2]; ctx._done = SPI[3]; ctx._baru = PENDING[0];
ok(call('activeApplicationStage(this._dior)') === 'active', 'DIOR tetap Revision');
ok(call('activeApplicationStage(this._gkl)') === 'reapply', 'GKL tetap Re-Apply');
ok(call('activeApplicationStage(this._done)') === null, 'perusahaan tuntas TIDAK muncul');

console.log('\n-- New Submission: belum punya obtained sama sekali --');
ok(call('activeApplicationStage(this._baru)') === 'new',
   'BARU (obtained 0) -> New Submission',
   `dapat ${JSON.stringify(call('activeApplicationStage(this._baru)'))}`);

console.log('\n-- activeApplications(): empat golongan, kolam SPI + PENDING --');
const AA = call('activeApplications()');
ok(Object.prototype.hasOwnProperty.call(AA, 'new') && AA.active && AA.reapply && AA.revpending,
   'keempat golongan ada: new · active · reapply · revpending');
ok(AA.new.map(c => c.code).join(',') === 'BARU', 'New Submission = BARU', JSON.stringify(AA.new.map(c=>c.code)));
ok(AA.active.map(c => c.code).join(',') === 'DIOR,IKM', 'Revision = DIOR + IKM', JSON.stringify(AA.active.map(c=>c.code)));
ok(AA.reapply.map(c => c.code).join(',') === 'GKL', 'Re-Apply = GKL', JSON.stringify(AA.reapply.map(c=>c.code)));
ok(AA.total === 4, 'total = 4 (DONE tidak ikut)', String(AA.total));
ok(!AA.new.concat(AA.active, AA.reapply, AA.revpending).some(c => c.code === 'DONE'),
   'DONE tidak muncul di golongan mana pun');

console.log('\n-- permintaan revisi Sales yang belum diputus = permohonan berjalan --');
ctx._tanpaReq = JSON.parse(JSON.stringify(SPI[0]));
call('this._tanpaReq.salesRevRequest = {}; this._tanpaReq.cycles = this._tanpaReq.cycles.filter(c => c.type !== "Obtained #2");');
ok(call('activeApplicationStage(this._tanpaReq)') === null,
   'tanpa request menunggu DAN tanpa siklus menggantung -> tidak muncul');
call('this._tanpaReq.salesRevRequest = { "SHEET PILE": { requested: true, status: "pending" } };');
ok(call('activeApplicationStage(this._tanpaReq)') === 'active',
   'satu request Sales yang belum diputus CorpSec -> Revision');
call('this._tanpaReq.salesRevRequest = { "SHEET PILE": { requested: true, status: "confirmed" } };');
ok(call('activeApplicationStage(this._tanpaReq)') === null,
   'request yang SUDAH dikonfirmasi tidak lagi dihitung berjalan');

console.log('\n-- struktur: satu sumber untuk kartu, strip, dan modal --');
const kode = f => fs.readFileSync(path.join(JS, f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
const k19 = kode('19-init.js'), k03 = kode('03-kpis.js');
ok(/activeApplications\s*\(/.test(k03), '03-kpis.js (kartu insight) memanggil activeApplications()');
ok(/activeApplications\s*\(/.test(k19), '19-init.js (strip + modal) memanggil activeApplications()');
ok((k19.match(/AA_GROUPS/g) || []).length >= 3, 'strip & modal memakai definisi golongan yang sama (AA_GROUPS)');
ok(!/revisionStatus\(d\)\s*===\s*'reapply'/.test(k19),
   '19-init.js tidak lagi menyusun kolamnya sendiri dari revisionStatus');
ok(!/revisionStatus\(d\)\s*===\s*'reapply'/.test(k03),
   '03-kpis.js tidak lagi menyusun kolamnya sendiri dari revisionStatus');

console.log(`\n${fail === 0 ? '✔ SEMUA LULUS' : '✖ GAGAL'}  —  lulus ${pass}, gagal ${fail}`);
process.exit(fail ? 1 : 0);
