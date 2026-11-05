/* STATUS QUOTA YEAR 2027 — SATU SUMBER UNTUK SEMUA PERMUKAAN
 *
 * Dilaporkan tim 05-Nov-2026: di 2027 tab PERTEK & SPI berkata "Completed"
 * untuk semua company, padahal PERTEK 2027 belum terbit. Perbaikan pertama
 * hanya mengubah tabel itu, lalu badge (All Companies/drawer) berkata
 * "New Submission" dan kotak ringkasan "Under Revision" untuk company yang sama
 * — Putri harus bolak-balik. Yang dikunci di sini:
 *
 *   A. Irisan 2027 tanpa PERTEK → Under Submission di processStatus DAN badge.
 *      Ada PERTEK, SPI belum → Pending di keduanya.
 *   B. Company yang HANYA punya pengajuan 2027 (SUJU, section "SPI") ikut aturan A.
 *   C. Irisan 2026 tidak tersentuh: statusTahunLain() null.
 *
 * Run: node iqdash/tests/test_status_2027_satu_sumber.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const JS = path.join(__dirname, '..', 'assets', 'js');
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean,
  MT_LOCALE: 'en-US',
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { getElementById: () => null, querySelectorAll: () => [] },
});
['01-data.js', '01a-quota-year.js', '02-period-filter.js', '04-charts.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }));
const call = e => vm.runInContext(e, ctx);
const set  = (name, v) => { ctx.__tmp = v; vm.runInContext(`${name} = __tmp;`, ctx); };

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };
const cyc = (type, mt, o) => Object.assign({ type, mt, products: {} }, o || {});
const teks = h => String(h || '').replace(/<[^>]+>/g, '').trim();

const FIX = [
  /* Punya SPI 2026, mengajukan 2027, PERTEK 2027 belum terbit (AADC). */
  { code: 'AADC', section: 'SPI', group: 'CD', revType: 'none', products: ['GL ALLOY'], obtained: 3000,
    cycles: [
      cyc('Submit #1', 3000, { products: { 'GL ALLOY': 3000 }, pertekDate: '10/11/2025', quotaYear: 2026 }),
      cyc('Obtained #1', 3000, { products: { 'GL ALLOY': 3000 }, pertekDate: '10/11/2025', spiDate: '05/01/2026', quotaYear: 2026 }),
      cyc('Submit #2', 3000, { products: { 'GL ALLOY': 3000 }, quotaYear: 2027 }),
    ] },
  /* PERTEK 2027 sudah terbit, SPI belum. */
  { code: 'KJK', section: 'SPI', group: 'AB', revType: 'none', products: ['GI ALLOY'], obtained: 300,
    cycles: [
      cyc('Submit #1', 300, { products: { 'GI ALLOY': 300 }, pertekDate: '10/11/2025', quotaYear: 2026 }),
      cyc('Obtained #1', 300, { products: { 'GI ALLOY': 300 }, pertekDate: '10/11/2025', spiDate: '05/01/2026', quotaYear: 2026 }),
      cyc('Submit #2', 6000, { products: { 'GI ALLOY': 6000 }, quotaYear: 2027 }),
      cyc('Obtained #2', 1000, { products: { 'GI ALLOY': 1000 }, pertekDate: '01/11/2026', quotaYear: 2027 }),
    ] },
  /* Hanya punya pengajuan 2027, section tetap "SPI". */
  { code: 'SUJU', section: 'SPI', group: 'AB', revType: 'none', products: ['GL ALLOY'], obtained: 0,
    cycles: [ cyc('Submit #1', 3000, { products: { 'GL ALLOY': 3000 }, quotaYear: 2027 }) ] },
];

const iris = (code, y) => { set('__co', FIX.find(c => c.code === code)); return call(`sliceCompanyToYear(__co, ${y})`); };
const status = co => { set('__c', co); return { proses: call('processStatus(__c)').label, badge: teks(call('statusBadge(__c)')), thn: call('statusTahunLain(__c)') }; };

console.log('A. 2027 tanpa PERTEK / dengan PERTEK');
let s = status(iris('AADC', 2027));
ok(/Under Submission/.test(s.proses), 'AADC 2027: tabel Under Submission', s.proses);
ok(/Under Submission/.test(s.badge), 'AADC 2027: badge Under Submission (bukan New Submission)', s.badge);
s = status(iris('KJK', 2027));
ok(/Pending/.test(s.proses), 'KJK 2027 PERTEK terbit: tabel Pending', s.proses);
ok(/PENDING/.test(s.badge), 'KJK 2027 PERTEK terbit: badge PENDING', s.badge);

console.log('B. Company hanya 2027');
s = status(iris('SUJU', 2027));
ok(/Under Submission/.test(s.proses) && /Under Submission/.test(s.badge), 'SUJU: tabel & badge Under Submission', JSON.stringify(s));

console.log('C. 2026 tidak tersentuh');
s = status(iris('AADC', 2026));
ok(s.thn === null, 'AADC 2026: aturan 2027 tidak berlaku', JSON.stringify(s.thn));
ok(!/Under Submission/.test(s.proses), 'AADC 2026: tetap Completed', s.proses);

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
