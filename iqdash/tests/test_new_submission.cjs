/* NEW SUBMISSION — perusahaan yang belum punya historical data.
 *
 * Diminta tim 2026-08-14, kasus SUJU: panel "Revision Request ke CorpSec"
 * dibangun dari produk yang SUDAH obtained, jadi perusahaan tanpa riwayat
 * berhenti di "No products found." dan tidak punya jalan masuk sama sekali.
 *
 * Alur yang harus jalan:
 *   New Company → Sales Input Product & MT → Konfirmasi CorpSec
 *     → Status: Submit → Active Application: New Submission → Total Submitted
 *
 * Yang diuji di sini bukan tampilannya, melainkan bahwa konfirmasi CorpSec
 * benar-benar menggerakkan angka: siklus Submit #N lahir, reportSubmittedTotal()
 * ikut naik, dan activeApplicationStage() menaruhnya di golongan 'new'.
 *
 * Run: node iqdash/tests/test_new_submission.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const JS  = path.join(__dirname, '..', 'assets', 'js');
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean,
  MT_LOCALE: 'en-US',
  currentRole: 'CorpSec',
  ROLE_PERMISSIONS: { CorpSec: ['corpsecRevConfirm', 'salesRevReq'] },
  /* Tanpa DOM: nsConfirm() membaca input qty lewat getElementById dan jatuh ke
     qty yang DIMINTA Sales bila tidak ketemu — persis jalur "klik ✓ tanpa
     mengubah angkanya". */
  document: { getElementById: () => null, querySelectorAll: () => [] },
  g: () => null,          // pembungkus getElementById milik dashboard
});
ctx.globalThis = ctx;
['01-data.js', '02-period-filter.js', '04-charts.js', '13-rev-mgmt.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }));
const call = e => vm.runInContext(e, ctx);

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

const cyc = (type, mt, o) => Object.assign({ type, mt, products: {} }, o || {});

/* ── Fixture ───────────────────────────────────────────────────────────────
   SUJU persis seperti di produksi: tanpa cycles, tanpa products, obtained 0.
   LAMA sebagai pembanding — angkanya tidak boleh bergeser sedikit pun. */
const SPI = [
  { code: 'SUJU', obtained: 0, submit1: 0, revType: 'none', revStatus: '',
    products: [], cycles: [], salesRevRequest: {},
    utilizationByProd: {}, availableByProd: {} },

  { code: 'LAMA', obtained: 500, revType: 'none',
    products: ['GI ALLOY'],
    cycles: [
      cyc('Submit #1', 5000, { submitDate: '01/02/2026', releaseDate: '01/03/2026', pertekDate: '01/03/2026' }),
      cyc('Obtained #1', 500, { submitDate: '05/03/2026', releaseDate: '10/03/2026', spiDate: '10/03/2026' }),
    ],
    utilizationByProd: {}, availableByProd: {} },
];
ctx.SPI = SPI; ctx.PENDING = []; ctx.RA = [];
call('SPI = this.SPI; PENDING = this.PENDING; RA = this.RA; PRODUCT_ALIASES = { "GI BORON": "GI ALLOY" };');
ctx._suju = SPI[0];

const submittedAwal = call('reportSubmittedTotal()');
ok(submittedAwal.mt === 5000, `garis dasar Total Submitted = 5.000 MT`, JSON.stringify(submittedAwal));

/* ── 1. Sales mengajukan: dua produk, belum diputus CorpSec ─────────────── */
console.log('\n-- Sales input produk & MT (belum dikonfirmasi) --');
call(`this._suju.newSubmission = {
  products: [{ product: 'GI ALLOY', mt: 2000 }, { product: 'SEAMLESS PIPE', mt: 1000 }],
  note: 'pengajuan awal', status: 'pending', requestedBy: 'Sales', requestedDate: '14-Aug-26',
};`);

ok(call('nsRequest(this._suju)') !== null, 'nsRequest() mengenali pengajuan Sales');
const st0 = call('nsTargetState(this._suju.newSubmission)');
ok(st0.length === 2 && st0[0].product === 'GI ALLOY' && st0[0].requested === 2000 && st0[0].status === 'pending',
   'nsTargetState(): satu baris per produk, qty & status persis dari Sales', JSON.stringify(st0));
ok(call('reportSubmittedTotal()').mt === 5000,
   'pengajuan yang BELUM dikonfirmasi tidak menyentuh Total Submitted');
ok(call('activeApplicationStage(this._suju)') === null,
   'belum dikonfirmasi -> belum masuk Active Application');
ok((SPI[0].cycles || []).length === 0, 'belum ada siklus yang ditulis');

/* ── 2. CorpSec mengonfirmasi keduanya ──────────────────────────────────── */
console.log('\n-- CorpSec konfirmasi -> Submit --');
call('nsConfirm("SUJU")');

const cy = SPI[0].cycles;
ok(cy.length === 1, 'tepat SATU siklus dibuat', JSON.stringify(cy.map(c => c.type)));
ok(cy[0].type === 'Submit #1', 'tipenya Submit #1 (perusahaan baru, belum ada Submit lain)', cy[0].type);
ok(cy[0].mt === 3000, 'MT siklus = 2.000 + 1.000', String(cy[0].mt));
ok(cy[0].products['GI ALLOY'] === 2000 && cy[0].products['SEAMLESS PIPE'] === 1000,
   'rincian per produk persis seperti yang diajukan Sales', JSON.stringify(cy[0].products));
ok(cy[0].submitDate && cy[0].submitDate !== 'TBA', 'Submit MOI bertanggal — tanpa ini periode manapun melewatkannya');
ok(cy[0].releaseDate === 'TBA', 'PERTEK masih TBA — memang belum terbit');
ok(!cy[0]._fromRevReq, 'BUKAN artefak revision-request — reportSubmittedTotal() melewati yang bertanda itu');
ok(SPI[0].revStatus === 'Submit', 'status perusahaan menjadi "Submit"', SPI[0].revStatus);
ok(SPI[0].newSubmission.status === 'confirmed', 'status request menjadi confirmed');
ok(SPI[0].newSubmission.confirmedMT === 3000, 'confirmedMT = 3.000', String(SPI[0].newSubmission.confirmedMT));
ok(SPI[0].newSubmission.cycleType === 'Submit #1', 'siklus yang dikelola tercatat di request');
ok(SPI[0].products.includes('GI ALLOY') && SPI[0].products.includes('SEAMLESS PIPE'),
   'daftar produk perusahaan ikut terisi', JSON.stringify(SPI[0].products));

/* ── 3. Angka dashboard ikut bergerak ───────────────────────────────────── */
console.log('\n-- Total Submitted & Active Application --');
const sub1 = call('reportSubmittedTotal()');
ok(sub1.mt === 8000, 'Total Submitted 5.000 -> 8.000 MT', JSON.stringify(sub1));
ok(sub1.companies === 2, 'SUJU ikut terhitung sebagai perusahaan yang submit', String(sub1.companies));
ok(call('activeApplicationStage(this._suju)') === 'new',
   'Active Application: SUJU -> New Submission',
   JSON.stringify(call('activeApplicationStage(this._suju)')));
const AA = call('activeApplications()');
ok(AA.new.some(c => c.code === 'SUJU'), 'muncul di golongan New Submission', JSON.stringify(AA.new.map(c => c.code)));
ok(!AA.active.concat(AA.reapply, AA.revpending).some(c => c.code === 'SUJU'),
   'tidak dobel di golongan lain');
ok(call('isUnconfigured(this._suju)') === false,
   'tidak lagi berlabel "Belum Dikonfigurasi"');
/* Badge tabel HARUS sepakat dengan Active Application. revisionStatus() memulangkan
   'clean' untuk revType 'none', jadi tanpa cabang khusus barisnya jatuh ke
   fallback "✅ SPI Issued" — untuk perusahaan yang belum punya SPI sama sekali. */
ok(/New Submission/.test(call('statusBadge(this._suju)')),
   'badge tabel = New Submission, bukan "SPI Issued"', call('statusBadge(this._suju)'));
ok(!/SPI Issued/.test(call('statusBadge(this._suju)')), 'tidak mengaku punya SPI');
ok(/SPI Issued/.test(call('statusBadge(this.SPI[1])')),
   'perusahaan yang siklusnya tuntas tetap "SPI Issued"', call('statusBadge(this.SPI[1])'));
ok(call('scopedSubmittedByProd(this._suju)')['GI ALLOY'] === 2000,
   'submitted per produk terbaca (All Time)', JSON.stringify(call('scopedSubmittedByProd(this._suju)')));

/* Obtained belum ada — jangan sampai pengajuan terhitung sebagai kuota. */
ok(call('canonicalObtained(this._suju)') === 0, 'obtained TETAP 0 — submit bukan kuota');
ok(call('reportObtainedTotal()').mt === 500, 'Total Obtained tidak bergeser', JSON.stringify(call('reportObtainedTotal()')));
ok(call('reportAvailableTotal()').mt === call('reportAvailableTotal()').mt, 'Available tetap terhitung tanpa error');

/* ── 4. Filter periode ──────────────────────────────────────────────────── */
console.log('\n-- filter periode --');
const tgl = SPI[0].cycles[0].submitDate;                     // dd-MMM-yy hari ini
ctx._tgl = tgl;
call(`(function(){
  const d = pDate(this._tgl);
  PERIOD.active = true; PERIOD.from = new Date(d.getFullYear(), d.getMonth(), 1);
  PERIOD.to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
}).call(this);`);
ok(call('reportSubmittedTotal()').mt === 3000,
   'periode yang memuat tanggal submit -> hanya SUJU 3.000 MT', JSON.stringify(call('reportSubmittedTotal()')));
ok(call('activeApplications()').new.some(c => c.code === 'SUJU'),
   'SUJU tetap New Submission di dalam periodenya');
call('PERIOD.active = true; PERIOD.from = new Date(2026,0,1); PERIOD.to = new Date(2026,5,30);');
ok(call('reportSubmittedTotal()').mt === 5000,
   'H1 2026 (di luar tanggal submit) -> SUJU tidak ikut', JSON.stringify(call('reportSubmittedTotal()')));
call('PERIOD.active = false; PERIOD.from = null; PERIOD.to = null;');

/* ── 5. Konfirmasi ulang tidak menggandakan siklus ──────────────────────── */
console.log('\n-- idempoten & konfirmasi per produk --');
call('nsConfirm("SUJU")');
ok(SPI[0].cycles.filter(c => /^submit #1$/i.test(c.type)).length === 1,
   'konfirmasi kedua tidak menggandakan Submit #1',
   JSON.stringify(SPI[0].cycles.map(c => c.type)));
ok(call('reportSubmittedTotal()').mt === 8000, 'Total Submitted tetap 8.000 MT');

/* Batalkan SATU produk saja — yang lain tidak boleh ikut hilang. */
call('nsBatal("SUJU", 1)');
ok(SPI[0].cycles[0].mt === 2000, 'batal 1 produk -> siklus tinggal 2.000 MT', String(SPI[0].cycles[0].mt));
ok(!SPI[0].cycles[0].products['SEAMLESS PIPE'], 'produk yang dibatalkan hilang dari rincian',
   JSON.stringify(SPI[0].cycles[0].products));
ok(SPI[0].cycles[0].products['GI ALLOY'] === 2000, 'produk yang dikonfirmasi tetap utuh');
ok(call('reportSubmittedTotal()').mt === 7000, 'Total Submitted ikut turun', JSON.stringify(call('reportSubmittedTotal()')));
ok(call('activeApplicationStage(this._suju)') === 'new', 'masih New Submission');

/* Batalkan sisanya — kembali seperti semula. */
call('nsBatal("SUJU")');
ok(SPI[0].cycles.length === 0, 'semua dibatalkan -> siklus dihapus', JSON.stringify(SPI[0].cycles));
ok(call('reportSubmittedTotal()').mt === 5000, 'Total Submitted kembali ke garis dasar');
ok(call('activeApplicationStage(this._suju)') === null, 'keluar dari Active Application');
ok(SPI[0].revStatus === '', 'status "Submit" dicabut', JSON.stringify(SPI[0].revStatus));
ok(SPI[0].newSubmission.status === 'rejected', 'status request menjadi rejected');

/* ── 6. Nomor siklus menambah, tidak menimpa ────────────────────────────── */
console.log('\n-- perusahaan yang SUDAH punya Submit #1 --');
ctx._lama = SPI[1];
call(`this._lama.newSubmission = {
  products: [{ product: 'SHEET PILE', mt: 750 }], status: 'pending',
};`);
call('nsConfirm("LAMA")');
ok(SPI[1].cycles.some(c => c.type === 'Submit #2'), 'siklus baru = Submit #2, bukan menimpa Submit #1',
   JSON.stringify(SPI[1].cycles.map(c => c.type)));
ok(SPI[1].cycles.find(c => c.type === 'Submit #1').mt === 5000, 'Submit #1 lama utuh');
ok(call('reportSubmittedTotal()').mt === 5750, 'Total Submitted 5.000 -> 5.750', JSON.stringify(call('reportSubmittedTotal()')));
call('nsBatal("LAMA")');

/* ── 7. Nama produk dikanonikkan ────────────────────────────────────────── */
console.log('\n-- penamaan produk --');
call(`this._suju.newSubmission = {
  products: [{ product: 'GI BORON', mt: 100 }], status: 'pending',
};`);
call('nsConfirm("SUJU")');
ok(SPI[0].cycles[0].products['GI ALLOY'] === 100 && !SPI[0].cycles[0].products['GI BORON'],
   'GI BORON ditulis sebagai GI ALLOY di siklus', JSON.stringify(SPI[0].cycles[0].products));
call('nsBatal("SUJU")');

/* ── 8. Struktur: satu jalan masuk, satu kanal simpan ───────────────────── */
console.log('\n-- struktur --');
const kode = f => fs.readFileSync(path.join(JS, f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
const k11 = kode('11-shipment.js'), k13 = kode('13-rev-mgmt.js'),
      k16 = kode('16-storage.js'),  k01 = kode('01-data.js');

ok(/buildNewSubmissionForm\(co, wrap\)/.test(k11),
   'panel Sales tanpa obtained diarahkan ke formulir New Submission, bukan "No products found."');
/* Jalan buntu lama hanya boleh hilang dari panel revisi. buildReapplyTable()
   masih boleh memakainya — target re-apply memang tidak ada artinya sebelum ada
   obtained. */
ok(!/No products found\./.test(k11.slice(k11.indexOf('function buildRevisionRequestTable'))),
   'jalan buntu lama hilang dari panel Revision Request');
ok(/addNewSubProduct/.test(k11) && /\+ Add Product/.test(k11), 'tombol + Add Product ada');
ok(/selectableProducts\(\)/.test(k11.slice(k11.indexOf('function buildNewSubmissionForm'), k11.indexOf('function buildRevisionRequestTable'))),
   'daftar produknya dari MASTER PRODUK, bukan dari kepemilikan perusahaan');
ok(/collectNewSubmissionData\(co_live\)/.test(k13), 'saveEdit() ikut membaca formulir New Submission');
ok(/patchCyclesToServer/.test(k13.slice(k13.indexOf('function nsAfterDecision'))),
   'siklus ikut dikirim ke server — patchToServer tidak membawa cycles');
ok(/_newSubmission\s*=\s*co\.newSubmission/.test(k16), '16-storage.js menitipkan newSubmission di amplop rev_note');
ok(/env\._newSubmission/.test(k01), '01-data.js membongkarnya kembali saat load');
ok(/rrSyncReqStatus/.test(k13.slice(k13.indexOf('function nsConfirm'))),
   'status request diturunkan mesin yang sama dengan konfirmasi revisi (rrSyncReqStatus)');

console.log(`\n${fail === 0 ? '✔ SEMUA LULUS' : '✖ GAGAL'}  —  lulus ${pass}, gagal ${fail}`);
process.exit(fail ? 1 : 0);
