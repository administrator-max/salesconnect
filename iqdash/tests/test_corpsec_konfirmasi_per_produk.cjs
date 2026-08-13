/* Konfirmasi CorpSec harus SATU BARIS PER PRODUK TUJUAN.
 *
 * BUG-nya (dilaporkan tim 2026-08-13): Sales merevisi SATU produk asal menjadi
 * BEBERAPA produk tujuan — IKM: Sheet Pile 1.750 MT →
 *   CRC ALLOY 500 · GL ALLOY 1.355 · GL CARBON 120 · PPGL CARBON 600
 * Panel CorpSec hanya menampilkan SATU kolom konfirmasi berisi 500 MT (MT
 * target PERTAMA), sehingga tiga target lainnya tidak bisa dikonfirmasi sama
 * sekali — dan totalnya salah: 500, bukan 2.575.
 *
 * Sebabnya `salesRevRequest[produkAsal]` cuma punya satu `confirmedMT` untuk
 * berapa pun jumlah targetnya.
 *
 * Run: node iqdash/tests/test_corpsec_konfirmasi_per_produk.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const JS = path.join(__dirname, '..', 'assets', 'js');
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean,
  MT_LOCALE: 'en-US',
  currentRole: 'CorpSec',
  document: { getElementById: () => null, querySelectorAll: () => [] },
  getObtainedByProd: () => ({ 'SHEET PILE': 1750 }),
  todayStd: () => '13-Aug-26',
});
vm.runInContext(fs.readFileSync(path.join(JS, '13-rev-mgmt.js'), 'utf8'), ctx, { filename: '13-rev-mgmt.js' });
const call = e => vm.runInContext(e, ctx);

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

/* ── Bentuk request IKM persis seperti yang diajukan Sales ─────────────── */
const buatIKM = () => ({
  code: 'IKM', obtained: 8000, cycles: [], revFrom: [], revTo: [],
  salesRevRequest: {
    'SHEET PILE': {
      requested: true, revisionType: 'Revision', requestedMT: 1750,
      targetProducts: [
        { product: 'CRC ALLOY',   mt: 500  },
        { product: 'GL ALLOY',    mt: 1355 },
        { product: 'GL CARBON',   mt: 120  },
        { product: 'PPGL CARBON', mt: 600  },
      ],
      note: '', status: 'pending',
    },
  },
});

console.log('-- satu baris konfirmasi PER produk tujuan --');
ctx._co = buatIKM();
let st = call("rrTargetState(this._co.salesRevRequest['SHEET PILE'], 'SHEET PILE')");
ok(st.length === 4, 'Sales kirim 4 produk -> CorpSec dapat 4 baris  <-- inti bug', `dapat ${st.length}`);
ok(st.map(s => s.product).join(', ') === 'CRC ALLOY, GL ALLOY, GL CARBON, PPGL CARBON',
   'nama produknya sama persis dengan request Sales', st.map(s => s.product).join(', '));
ok(st.map(s => s.mt).join(',') === '500,1355,120,600',
   'qty-nya sama persis dengan request Sales', st.map(s => s.mt).join(','));
ok(st.every(s => s.status === 'pending'), 'semuanya mulai dari status menunggu');

console.log('\n-- konfirmasi satu target tidak menyentuh target lain --');
ctx._co = buatIKM();
call(`(function(){
  const req = this._co.salesRevRequest['SHEET PILE'];
  const st = rrTargetState(req, 'SHEET PILE');
  st[1].status = 'confirmed';            // GL ALLOY saja
  rrSyncReqStatus(req, 'SHEET PILE', st);
  rrRebuildFromConfirmed(this._co, 'SHEET PILE', req);
}).call(this)`);
let req = call("this._co.salesRevRequest['SHEET PILE']");
ok(req.confirmedTargets.length === 4, 'keempat target tetap tersimpan');
ok(req.confirmedTargets[1].status === 'confirmed' && req.confirmedTargets[0].status === 'pending',
   'hanya GL ALLOY yang confirmed; CRC ALLOY tetap menunggu');
ok(req.status === 'pending', 'status request masih menunggu selama ada target yang belum diputus');
ok(req.confirmedMT === 1355, 'confirmedMT = 1.355 (hanya yang disetujui)', `dapat ${req.confirmedMT}`);

console.log('\n-- konfirmasi SEMUA target --');
ctx._co = buatIKM();
call(`(function(){
  const req = this._co.salesRevRequest['SHEET PILE'];
  const st = rrTargetState(req, 'SHEET PILE');
  st.forEach(s => { s.status = 'confirmed'; });
  rrSyncReqStatus(req, 'SHEET PILE', st);
  rrRebuildFromConfirmed(this._co, 'SHEET PILE', req);
}).call(this)`);
req = call("this._co.salesRevRequest['SHEET PILE']");
ok(req.status === 'confirmed', 'status request jadi confirmed');
ok(req.confirmedMT === 2575, 'confirmedMT = 500+1355+120+600 = 2.575  <-- dulu 500',
   `dapat ${req.confirmedMT}`);
const cyc = call("this._co.cycles.filter(c => /^Revision Request/.test(c.type))");
ok(cyc.length === 1, 'tepat satu siklus Revision Request (tidak menumpuk)');
ok(cyc[0] && cyc[0].mt === 2575, 'MT siklus = 2.575', cyc[0] ? String(cyc[0].mt) : '-');
ok(cyc[0] && Object.keys(cyc[0].products).length === 4,
   'siklus memuat KEEMPAT produk, bukan digabung jadi satu',
   cyc[0] ? JSON.stringify(cyc[0].products) : '-');
ok(cyc[0] && cyc[0].products['PPGL CARBON'] === 600, 'PPGL CARBON 600 MT ikut tercatat');
const revTo = call('this._co.revTo');
ok(revTo.length === 4, 'revTo berisi 4 produk tujuan', JSON.stringify(revTo.map(r => r.prod)));

console.log('\n-- batalkan satu target: yang lain tetap berdiri --');
call(`(function(){
  const req = this._co.salesRevRequest['SHEET PILE'];
  const st = rrTargetState(req, 'SHEET PILE');
  st[2].status = 'rejected';             // GL CARBON dibatalkan
  rrSyncReqStatus(req, 'SHEET PILE', st);
  rrRebuildFromConfirmed(this._co, 'SHEET PILE', req);
}).call(this)`);
req = call("this._co.salesRevRequest['SHEET PILE']");
ok(req.confirmedMT === 2455, 'confirmedMT turun jadi 2.455 (tanpa GL CARBON 120)', `dapat ${req.confirmedMT}`);
const cyc2 = call("this._co.cycles.filter(c => /^Revision Request/.test(c.type))");
ok(cyc2.length === 1 && !cyc2[0].products['GL CARBON'],
   'GL CARBON keluar dari siklus, tiga lainnya tetap');
ok(cyc2[0] && Object.keys(cyc2[0].products).length === 3, 'tinggal 3 produk di siklus');
ok(call('this._co.revTo').length === 3, 'revTo ikut turun jadi 3');

console.log('\n-- batalkan SEMUA target: siklus dibersihkan --');
call(`(function(){
  const req = this._co.salesRevRequest['SHEET PILE'];
  const st = rrTargetState(req, 'SHEET PILE');
  st.forEach(s => { s.status = 'rejected'; });
  rrSyncReqStatus(req, 'SHEET PILE', st);
  rrRebuildFromConfirmed(this._co, 'SHEET PILE', req);
}).call(this)`);
req = call("this._co.salesRevRequest['SHEET PILE']");
ok(req.status === 'rejected', 'status request jadi rejected');
ok(req.confirmedMT == null, 'confirmedMT dikosongkan');
ok(call("this._co.cycles.filter(c => /^Revision Request/.test(c.type))").length === 0,
   'siklus Revision Request dihapus');

console.log('\n-- bentuk lama tetap jalan (newProduct tunggal / tetap sama) --');
ctx._lama = { requested: true, newProduct: 'GL ALLOY', requestedMT: 300 };
let stL = call("rrTargetState(this._lama, 'SHEET PILE')");
ok(stL.length === 1 && stL[0].product === 'GL ALLOY' && stL[0].mt === 300,
   'request lama dengan newProduct -> satu target', JSON.stringify(stL));
ctx._sama = { requested: true, requestedMT: 250 };
let stS = call("rrTargetState(this._sama, 'SHEET PILE')");
ok(stS.length === 1 && stS[0].product === 'SHEET PILE' && stS[0].mt === 250,
   '"— Tetap sama —" -> target = produk asal', JSON.stringify(stS));

console.log('\n-- struktur: panel merender per target, bukan satu input --');
const src = fs.readFileSync(path.join(JS, '13-rev-mgmt.js'), 'utf8');
ok(/id="csconf-mt-\$\{pid\}-\$\{ti\}"/.test(src),
   'input konfirmasi ber-ID per target (csconf-mt-<pid>-<idx>)');
ok(/csConfirmRev\('\$\{prod\}','\$\{pid\}','\$\{code\}',\$\{ti\}\)/.test(src),
   'tombol Konfirmasi mengirim indeks target');
ok(/csBatalRev\('\$\{prod\}','\$\{pid\}','\$\{code\}',\$\{ti\}\)/.test(src),
   'tombol Batal mengirim indeks target');
ok(!/value="\$\{confMT\}"/.test(src),
   'tidak ada lagi satu input tunggal berisi confirmedMT gabungan');

console.log(`\n${fail === 0 ? '✔ SEMUA LULUS' : '✖ GAGAL'}  —  lulus ${pass}, gagal ${fail}`);
process.exit(fail ? 1 : 0);
