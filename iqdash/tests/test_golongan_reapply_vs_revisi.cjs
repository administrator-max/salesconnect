/* ACTIVE APPLICATIONS — Re-Apply vs Revision dibaca dari TANDANYA, bukan dari
 * bentuk siklusnya.
 *
 * Diminta pemilik data 15-Sep-2026, lengkap dengan daftar yang benar:
 * EMS, LCP, BBB, SJH, KJK, PPGL, AADC, GAS. Dua company salah golongan dan
 * satu tidak seharusnya ada di daftar sama sekali.
 *
 * SEBABNYA golongan diambil dari outstandingStage(), yang menjawab pertanyaan
 * LAIN: "tahap mana yang menggantung". Akibatnya:
 *
 *   BBB  seluruh pasangan Submit/Obtained-nya sudah lengkap, jadi tidak ada
 *        yang menggantung, dan pagar revType 'complete' menutup jalur
 *        re-apply. Tersisa hasOutstandingCycle() yang memulangkan 'active'
 *        generik. revType 'complete' itu soal revisi LAMANYA; re-apply
 *        BARU-nya tetap berjalan.
 *   EMS  permintaan Re-Apply-nya belum diputus CorpSec, jadi belum punya
 *        siklus Revision Request. Cabang "belum diputus" memulangkan 'active'
 *        tanpa melihat revisionType.
 *   DIOR SPI Perubahan-nya sudah terbit, tapi Obtained #1 lamanya tidak
 *        bertanggal sehingga hasOutstandingCycle() terus berkata "menggantung"
 *        dan DIOR menetap di Revision selamanya.
 *
 * YANG DIKUNCI:
 *   A. Re-Apply yang sudah dikonfirmasi tapi kuotanya belum terbit -> reapply.
 *   B. Re-Apply yang BELUM diputus CorpSec -> reapply juga (kasus EMS).
 *   C. revType 'complete' TIDAK memblokir re-apply baru (kasus BBB).
 *   D. Revisi yang sudah terbit keluar dari daftar (kasus DIOR).
 *   E. Permintaan bertanda Revision tetap 'active', bukan reapply (IKM).
 *   F. Permintaan yang DITOLAK tidak menghidupkan apa pun.
 *   G. Belum pernah punya obtained -> 'new', bukan 'reapply'.
 *   H. Golongan TIDAK menyentuh angka: canonicalSubmitted tidak berubah.
 *
 * Run: node iqdash/tests/test_golongan_reapply_vs_revisi.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

const node = () => ({ style: {}, classList: { add(){}, remove(){}, toggle(){} },
  querySelectorAll: () => [], querySelector: () => null, appendChild(){}, textContent: '' });
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

const golongan = co => { ctx.__co = co; return vm.runInContext('activeApplicationStage(__co)', ctx); };
const submitted = co => { ctx.__co = co; return vm.runInContext('canonicalSubmitted(__co)', ctx); };

const cyc = (type, mt, o) => Object.assign({ type, mt, products: {} }, o || {});
const REQ = (mt, tgl, prod) => cyc('Revision Request — ' + prod, mt,
  { submitDate: tgl, releaseDate: tgl, products: { [prod]: mt } });
const lengkap = (tgl) => ({ releaseDate: tgl, spiDate: tgl });

console.log('\nA · Re-Apply dikonfirmasi, kuota belum terbit -> reapply');
{
  const kjk = { code: 'KJK', revType: 'active',
    salesRevRequest: { 'GL ALLOY': { requested: true, status: 'confirmed', revisionType: 'Re-Apply' } },
    cycles: [
      cyc('Submit #1', 6000, { submitDate: '15/10/2025', ...lengkap('11/11/2025') }),
      cyc('Obtained #1', 950, lengkap('31/12/2025')),
      cyc('Submit #2', 3000, { submitDate: '20/04/2026', ...lengkap('03/06/2026') }),
      cyc('Obtained #2', 450, lengkap('04/06/2026')),
      REQ(3000, '10-Sep-26', 'GL ALLOY'),
    ] };
  ok(golongan(kjk) === 'reapply', 'KJK -> reapply', JSON.stringify(golongan(kjk)));
}

console.log('\nB · Re-Apply BELUM diputus CorpSec -> reapply juga (EMS)');
{
  /* Belum ada siklus Revision Request sama sekali; tandanya cuma di
     salesRevRequest. Dulu memulangkan 'active'. */
  const ems = { code: 'EMS', revType: 'complete',
    salesRevRequest: {
      'SHEETPILE': { requested: true, status: 'rejected' },
      'GI ALLOY':  { requested: true, status: null, revisionType: 'Re-Apply' },
    },
    cycles: [
      cyc('Submit #1', 3000, { submitDate: '01/01/2026', ...lengkap('01/02/2026') }),
      cyc('Obtained #1', 500, lengkap('05/02/2026')),
    ] };
  ok(golongan(ems) === 'reapply', 'EMS -> reapply, bukan active', JSON.stringify(golongan(ems)));
}

console.log('\nC · revType "complete" tidak memblokir re-apply BARU (BBB)');
{
  const bbb = { code: 'BBB', revType: 'complete',
    salesRevRequest: {
      'GL BORON': { requested: true, status: 'confirmed' },
      'GL ALLOY': { requested: true, status: 'confirmed', revisionType: 'Re-Apply' },
    },
    cycles: [
      cyc('Submit #1', 6000, { submitDate: '21/10/2025', ...lengkap('11/11/2025') }),
      cyc('Obtained #1', 400, lengkap('15/01/2026')),
      cyc('Obtained #2', 300, lengkap('26/06/2026')),
      REQ(3000, '10-Sep-26', 'GL ALLOY'),
      cyc('Submit #2', 2300, { submitDate: '17/04/2026' }),
    ] };
  ok(golongan(bbb) === 'reapply', 'BBB -> reapply, bukan revision', JSON.stringify(golongan(bbb)));
}

console.log('\nD · Revisi yang SUDAH TERBIT keluar dari daftar (DIOR)');
{
  const dior = { code: 'DIOR', revType: 'complete',
    salesRevRequest: { 'BORDES ALLOY': { requested: true, status: 'confirmed', revisionType: 'Revision' } },
    cycles: [
      cyc('Submit #1', 6000, { submitDate: '05/11/2025', ...lengkap('20/07/2026') }),
      cyc('Obtained #1', 100, { products: { 'BORDES ALLOY': 100 } }),   // tanpa tanggal
      cyc('Revision Request — BORDES ALLOY', 100, { submitDate: '03-Sep-26', releaseDate: '03-Sep-26',
        products: { 'BORDES ALLOY': -100, 'GL ALLOY': 100 } }),
      cyc('Obtained #2', 0, lengkap('31/08/2026')),
    ] };
  ok(golongan(dior) === null,
    'DIOR tidak muncul di golongan mana pun', JSON.stringify(golongan(dior)));
}

console.log('\nE · Permintaan bertanda Revision tetap "active" (IKM)');
{
  const ikm = { code: 'IKM', revType: 'active',
    salesRevRequest: { 'GI ALLOY': { requested: true, status: 'confirmed' } },   // tanpa revisionType
    cycles: [
      cyc('Submit #1', 12250, { submitDate: '30/04/2026', ...lengkap('30/06/2026') }),
      cyc('Obtained #1', 4150, lengkap('08/07/2026')),
      REQ(4150, '13-Aug-26', 'GI ALLOY'),
      cyc('Obtained #2', 8000, {}),
    ] };
  ok(golongan(ikm) === 'active', 'IKM -> active (Revision), bukan reapply', JSON.stringify(golongan(ikm)));
}

console.log('\nF · Permintaan DITOLAK tidak menghidupkan apa pun');
{
  const tolak = { code: 'X', revType: 'complete',
    salesRevRequest: { 'GL ALLOY': { requested: true, status: 'rejected', revisionType: 'Re-Apply' } },
    cycles: [
      cyc('Submit #1', 6000, { submitDate: '01/01/2026', ...lengkap('01/02/2026') }),
      cyc('Obtained #1', 500, lengkap('05/02/2026')),
    ] };
  ok(golongan(tolak) === null, 'permintaan ditolak -> tidak muncul', JSON.stringify(golongan(tolak)));
}

console.log('\nG · Belum punya obtained -> "new", bukan "reapply"');
{
  const baru = { code: 'BARU', revType: 'active',
    salesRevRequest: { 'GL ALLOY': { requested: true, status: null, revisionType: 'Re-Apply' } },
    cycles: [cyc('Submit #1', 3000, { submitDate: '01/09/2026' })] };
  ok(golongan(baru) === 'new', 'obtained nol -> new', JSON.stringify(golongan(baru)));
}

console.log('\nH · Golongan TIDAK menyentuh angka');
{
  /* Pagar terhadap kekhawatiran nyata: mengubah aturan golongan tidak boleh
     menggeser Total Submitted. Diukur juga di data hidup 15-Sep-2026 dengan
     mengembalikan 04-charts.js versi lama — keempat total identik. */
  const bbb = { code: 'BBB', revType: 'complete',
    salesRevRequest: { 'GL ALLOY': { requested: true, status: 'confirmed', revisionType: 'Re-Apply' } },
    cycles: [
      cyc('Submit #1', 6000, { submitDate: '21/10/2025', ...lengkap('11/11/2025') }),
      cyc('Obtained #1', 400, lengkap('15/01/2026')),
      REQ(3000, '10-Sep-26', 'GL ALLOY'),
      cyc('Submit #2', 2300, { submitDate: '17/04/2026' }),
    ] };
  ok(submitted(bbb) === 11300,
    'Submitted BBB tetap 11.300 — 6.000 + 2.300 + 3.000', String(submitted(bbb)));
  const src = fs.readFileSync(path.join(JS, '04-charts.js'), 'utf8');
  ok(/pendingReapplyCyclesForSubmitted\(co\)\.length > 0/.test(src),
    'golongan memakai definisi yang SAMA dengan Total Submitted');
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
