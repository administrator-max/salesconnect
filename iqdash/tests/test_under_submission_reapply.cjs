/* RE-APPLY YANG SUDAH DIKONFIRMASI = "Under Submission", bukan "Completed".
 *
 * Dilaporkan tim 10-Sep-2026: "Perusahaan berikut sedang Re-Apply / Submit #3,
 * seperti SJH, sehingga harus masuk ke tab Under Submission: BBB, LCP, KJK."
 *
 * Sebabnya outstandingStage() melewati siklus "Revision Request — X" sama
 * sekali (ia bukan pasangan Submit/Obtained dan tidak bernomor). SJH kebetulan
 * lolos karena punya Submit #2 dengan Obtained #2 yang belum terbit; BBB, LCP,
 * dan KJK tidak punya pasangan menggantung sama sekali, jadi terbaca Completed
 * padahal justru sedang paling sibuk.
 *
 * YANG DIKUNCI — tiga pagar yang mencegah salah tuduh, semuanya berasal dari
 * data hidup yang benar-benar ada, bukan karangan:
 *
 *   A. Re-Apply dikonfirmasi + belum ada Obtained baru -> Under Submission.
 *   B. TANGGAL menentukan. Obtained LAMA tidak boleh menutup permintaan BARU
 *      (BBB: Obtained #2 terbit 26/06/2026, permintaan dikonfirmasi 10-Sep-26).
 *      Sebaliknya Obtained yang terbit SESUDAH konfirmasi memang menutupnya
 *      (LCP: permintaan 21-May-26 ditutup Obtained #2 terbit 16/07/2026).
 *   C. revType 'complete' tetap Completed. DIOR dan SMS mencatat penerbitan
 *      perubahannya di status siklus permintaan, bukan sebagai Obtained baru.
 *      DIOR pernah diminta khusus supaya terbaca Completed.
 *   D. Delta NEGATIF berarti kuotanya sudah benar-benar dipindahkan, bukan
 *      sekadar diminta -> bukan permohonan berjalan.
 *   E. Golongannya ikut revisionType: Re-Apply -> 'reapply', selain itu
 *      'active' (Revision). Keduanya sama-sama Under Submission, tapi strip
 *      Active Application tidak boleh menyebut perubahan sebagai penambahan.
 *   F. Permintaan tanpa tanggal konfirmasi tidak ditebak.
 *
 * Run: node iqdash/tests/test_under_submission_reapply.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

const node = () => ({ style: {}, classList: { add(){}, remove(){}, toggle(){} },
  querySelectorAll: () => [], querySelector: () => null, appendChild(){}, textContent: '', innerHTML: '' });
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean, MT_LOCALE: 'en-US',
  localStorage: { getItem: () => null, setItem: () => {} },
  Chart: function () { return { destroy() {} }; },
  document: { getElementById: node, querySelectorAll: () => [], querySelector: () => null,
    createElement: node, addEventListener: () => {}, body: { appendChild(){} } },
});
ctx.window = ctx; ctx.globalThis = ctx;
['00-num.js', '01-data.js', '01a-quota-year.js', '02-period-filter.js', '04-charts.js']
  .forEach(f => { try { vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }); }
                  catch (e) { console.log('  (lewati ' + f + ': ' + e.message.slice(0, 60) + ')'); } });
ctx.__t = { 'GL BORON': 'GL ALLOY', 'GI BORON': 'GI ALLOY' };
vm.runInContext('PRODUCT_ALIASES = __t;', ctx);

const tahap  = co => { ctx.__co = co; return vm.runInContext('outstandingStage(__co)', ctx); };
const proses = co => { ctx.__co = co; return vm.runInContext('processStatus(__co).key', ctx); };

const cyc = (type, mt, o) => Object.assign({ type, mt, products: {} }, o || {});
const reApply = { requested: true, status: 'confirmed', revisionType: 'Re-Apply', requestedMT: 3000 };

/* BBB seperti di master 10-Sep-2026: Submit #1 tuntas, dua Obtained terbit,
   lalu Re-Apply 3.000 dikonfirmasi dan belum terbit. */
const bbb = (o = {}) => ({
  code: 'BBB', obtained: 1100, revType: o.revType || 'active',
  salesRevRequest: o.srr !== undefined ? o.srr : { 'GL ALLOY': reApply },
  cycles: [
    cyc('Submit #1', 6000, { submitDate: '21/10/2025', releaseDate: '11/11/2025', pertekDate: '11/11/2025' }),
    cyc('Obtained #1', 400, { submitDate: '03/12/2025', releaseDate: '15/01/2026', spiDate: '15/01/2026' }),
    cyc('Obtained #2', 700, { submitDate: '17/04/2026', releaseDate: '26/06/2026', spiDate: '26/06/2026' }),
    cyc('Revision Request — GL ALLOY', 3000, {
      submitDate: o.tanpaTanggal ? '' : '10-Sep-26',
      releaseDate: o.tanpaTanggal ? '' : '10-Sep-26',
      products: o.delta ? { 'GL ALLOY': -3000 } : { 'GL ALLOY': 3000 } }),
  ],
  utilizationByProd: {}, availableByProd: {}, products: [],
});

console.log('\nA · BBB — Re-Apply dikonfirmasi, kuota belum terbit');
{
  ok(tahap(bbb()) === 'reapply', 'outstandingStage = reapply', JSON.stringify(tahap(bbb())));
  ok(proses(bbb()) === 'under', 'masuk tab Under Submission', proses(bbb()));
}

console.log('\nB · Tanggal menentukan — Obtained lama tidak menutup permintaan baru');
{
  /* Obtained #2 terbit 26/06/2026, permintaan dikonfirmasi 10-Sep-26. */
  ok(proses(bbb()) === 'under',
    'Obtained yang lebih TUA dari konfirmasi tidak menutupnya', proses(bbb()));

  /* Kebalikannya: LCP, permintaan 21-May-26 ditutup Obtained terbit 16/07/2026. */
  const lcp = {
    code: 'LCP', obtained: 3275, revType: 'active',
    salesRevRequest: { 'GL BORON': { requested: true, status: 'confirmed', revisionType: 'Re-Apply' } },
    cycles: [
      cyc('Submit #1', 6000, { submitDate: '23/10/2025', releaseDate: '18/11/2025', pertekDate: '18/11/2025' }),
      cyc('Obtained #1', 275, { submitDate: '21/11/2025', releaseDate: '16/12/2025', spiDate: '16/12/2025' }),
      cyc('Submit #2', 2725, { submitDate: '21/05/2026', releaseDate: '18/06/2026', pertekDate: '18/06/2026' }),
      cyc('Revision Request — GL BORON', 2725, { submitDate: '21-May-26', releaseDate: '21-May-26',
        products: { 'GL BORON': 2725 } }),
      cyc('Obtained #2', 3000, { releaseDate: '16/07/2026', spiDate: '16/07/2026' }),
    ],
    utilizationByProd: {}, availableByProd: {}, products: [],
  };
  ok(tahap(lcp) === null && proses(lcp) === 'completed',
    'Obtained yang terbit SESUDAH konfirmasi memang menutupnya',
    JSON.stringify([tahap(lcp), proses(lcp)]));
}

console.log('\nC · revType "complete" tetap Completed (DIOR, SMS)');
{
  const d = bbb({ revType: 'complete' });
  ok(tahap(d) === null && proses(d) === 'completed',
    'perubahan yang penerbitannya dicatat di status, bukan siklus baru',
    JSON.stringify([tahap(d), proses(d)]));
}

console.log('\nD · Delta negatif = kuota sudah dipindahkan, bukan permohonan');
{
  const d = bbb({ delta: true });
  ok(tahap(d) === null, 'siklus permintaan berdelta negatif tidak dihitung berjalan',
    JSON.stringify(tahap(d)));
}

console.log('\nE · Golongan mengikuti revisionType');
{
  ok(tahap(bbb()) === 'reapply', 'bertanda Re-Apply -> reapply');
  const revisi = bbb({ srr: { 'GL ALLOY': { requested: true, status: 'confirmed' } } });
  ok(tahap(revisi) === 'active', 'tanpa tanda Re-Apply -> active (Revision)', JSON.stringify(tahap(revisi)));
  ok(proses(revisi) === 'under', 'keduanya tetap Under Submission', proses(revisi));
}

console.log('\nF · Tanpa tanggal konfirmasi, jangan menebak');
{
  const d = bbb({ tanpaTanggal: true });
  ok(tahap(d) === null, 'siklus permintaan tanpa tanggal dilewati', JSON.stringify(tahap(d)));
}

console.log('\nG · Yang sudah tuntas tidak ikut tergeser');
{
  const tuntas = {
    code: 'DONE', obtained: 500, revType: 'none',
    cycles: [
      cyc('Submit #1', 5000, { submitDate: '01/01/2026', releaseDate: '01/02/2026', pertekDate: '01/02/2026' }),
      cyc('Obtained #1', 500, { submitDate: '05/02/2026', releaseDate: '10/02/2026', spiDate: '10/02/2026' }),
    ],
    utilizationByProd: {}, availableByProd: {}, products: [],
  };
  ok(tahap(tuntas) === null && proses(tuntas) === 'completed',
    'company tanpa Revision Request tetap Completed', JSON.stringify([tahap(tuntas), proses(tuntas)]));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
