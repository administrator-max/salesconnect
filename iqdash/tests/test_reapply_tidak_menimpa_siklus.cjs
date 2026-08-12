/* Pencatatan re-apply KETIGA tidak boleh menimpa catatan re-apply KEDUA.
 *
 * BUG-nya (ditemukan 2026-08-12 dari kasus CGK): ketiga penulis di
 * 13-rev-mgmt.js — rrApplyObtained(), rrSaveStatus(), rrMarkApproved() —
 * mencari siklus sasarannya dengan
 *
 *     (co.cycles||[]).find(c => /^obtained\s*#2/i.test(c.type) || …)
 *
 * yaitu SELALU "Obtained #2", berapa pun nomor pengajuan yang sedang dicatat.
 * Lalu `mt` dan `products`-nya ditimpa. Begitu sebuah company mengajukan
 * re-apply KETIGA, catatan re-apply KEDUA-nya HILANG.
 *
 * Yang terjadi pada CGK — master mencatat:
 *     Submit #2 2.200 (PERTEK Perubahan 17/04/26) → Obtained #2 220 MT GI ALLOY
 *                                                   (SPI Perubahan 29/04/26)
 *     Submit #3 3.000 (PERTEK Perubahan 2 07/08/26) → Obtained #3 300 MT GL ALLOY
 * sementara dashboard menyimpan SATU siklus "Obtained #2" berisi 300 MT
 * GL ALLOY tanpa tanggal. 220 MT GI ALLOY-nya lenyap dari cycles — tersisa
 * hanya di stats, dan itulah drift 220 MT yang tercium __auditObtained().
 *
 * Run: node iqdash/tests/test_reapply_tidak_menimpa_siklus.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const JS = path.join(__dirname, '..', 'assets', 'js');
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean,
  document: { getElementById: () => null, querySelectorAll: () => [] },
});
vm.runInContext(fs.readFileSync(path.join(JS, '13-rev-mgmt.js'), 'utf8'), ctx, { filename: '13-rev-mgmt.js' });
const call = e => vm.runInContext(e, ctx);

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

/* ── CGK persis seperti seharusnya SEBELUM re-apply #3 dicatat ────────── */
const cgk = () => ({
  code: 'CGK',
  cycles: [
    { type: 'Submit #1',   mt: 6000, products: { 'GI ALLOY': 6000 }, submitDate: '16/10/2025', releaseDate: '29/10/2025' },
    { type: 'Obtained #1', mt: 800,  products: { 'GI ALLOY': 800  }, submitDate: '30/10/2025', releaseDate: '07/11/2025' },
    { type: 'Submit #2',   mt: 2200, products: { 'GI ALLOY': 2200 }, submitDate: '25/02/2026', releaseDate: '17/04/2026' },
    { type: 'Obtained #2', mt: 220,  products: { 'GI ALLOY': 220  }, submitDate: '20/04/2026', releaseDate: '29/04/2026', spiDate: '29/04/2026' },
    { type: 'Submit #3',   mt: 3000, products: { 'GL ALLOY': 3000 }, submitDate: '30/06/2026', releaseDate: '07/08/2026' },
  ],
});

console.log('-- nomor siklus diturunkan dari pengajuan yang berjalan --');
ctx._co = cgk();
ok(call('rrObtainedTypeFor(this._co)') === 'Obtained #3',
   'Submit #3 aktif -> sasarannya "Obtained #3", BUKAN "Obtained #2"  <-- inti bug',
   `dapat "${call('rrObtainedTypeFor(this._co)')}"`);

console.log('\n-- mencatat obtained #3 tidak menyentuh obtained #2 --');
ctx._co = cgk();
call('this._cy = rrFindOrCreateObtained(this._co); this._cy.mt = 300; this._cy.products = { "GL ALLOY": 300 };');
const c2 = call('this._co.cycles.find(c => c.type === "Obtained #2")');
const c3 = call('this._co.cycles.find(c => c.type === "Obtained #3")');
ok(c2 && c2.mt === 220, 'Obtained #2 tetap 220 MT', `dapat ${c2 ? c2.mt : '(hilang)'}`);
ok(c2 && c2.products && c2.products['GI ALLOY'] === 220, 'Obtained #2 tetap GI ALLOY 220');
ok(c2 && c2.spiDate === '29/04/2026', 'tanggal SPI Perubahan 1 Obtained #2 utuh');
ok(c3 && c3.mt === 300, 'Obtained #3 baru dibuat berisi 300 MT', `dapat ${c3 ? c3.mt : '(tidak dibuat)'}`);
ok(c3 && c3.products && c3.products['GL ALLOY'] === 300, 'Obtained #3 berisi GL ALLOY 300');
ok(call('this._co.cycles.filter(c => /^obtained/i.test(c.type)).length') === 3,
   'ada 3 siklus obtained (#1, #2, #3) — bukan 2 yang saling menimpa');

console.log('\n-- memanggil dua kali tidak menggandakan siklus --');
call('rrFindOrCreateObtained(this._co); rrFindOrCreateObtained(this._co);');
ok(call('this._co.cycles.filter(c => c.type === "Obtained #3").length') === 1,
   'Obtained #3 tetap satu, bukan bertambah tiap klik');

console.log('\n-- company yang baru re-apply PERTAMA tetap dapat Obtained #2 --');
ctx._co2 = { code: 'X', cycles: [
  { type: 'Submit #1',   mt: 1000, products: {}, submitDate: '01/01/2026', releaseDate: '01/02/2026' },
  { type: 'Obtained #1', mt: 500,  products: {}, submitDate: '05/02/2026', releaseDate: '10/02/2026' },
  { type: 'Submit #2',   mt: 800,  products: {}, submitDate: '01/06/2026', releaseDate: '01/07/2026' },
]};
ok(call('rrObtainedTypeFor(this._co2)') === 'Obtained #2',
   'Submit #2 aktif -> "Obtained #2" (perilaku lama yang benar tetap jalan)',
   `dapat "${call('rrObtainedTypeFor(this._co2)')}"`);

console.log('\n-- siklus Revision #N dipetakan ke "Obtained (Revision #N)" --');
ctx._co3 = { code: 'Y', cycles: [
  { type: 'Submit #1',    mt: 1000, products: {}, submitDate: '01/01/2026', releaseDate: '01/02/2026' },
  { type: 'Obtained #1',  mt: 500,  products: {}, submitDate: '05/02/2026', releaseDate: '10/02/2026' },
  { type: 'Revision #2',  mt: 300,  products: {}, submitDate: '01/06/2026', releaseDate: '01/07/2026' },
]};
ok(call('rrObtainedTypeFor(this._co3)') === 'Obtained (Revision #2)',
   'Revision #2 -> "Obtained (Revision #2)"',
   `dapat "${call('rrObtainedTypeFor(this._co3)')}"`);

console.log('\n-- tanpa pengajuan terbaca: ambil nomor berikutnya, jangan timpa --');
ctx._co4 = { code: 'Z', cycles: [
  { type: 'Obtained #1', mt: 100, products: {} },
  { type: 'Obtained #2', mt: 200, products: {} },
]};
ok(call('rrObtainedTypeFor(this._co4)') === 'Obtained #3',
   'obtained tertinggi #2 -> berikutnya #3',
   `dapat "${call('rrObtainedTypeFor(this._co4)')}"`);

console.log('\n-- struktur: tidak ada penulis yang mematok "Obtained #2" lagi --');
const src = fs.readFileSync(path.join(JS, '13-rev-mgmt.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
['rrApplyObtained', 'rrSaveStatus', 'rrMarkApproved'].forEach(fn => {
  const m = new RegExp('function\\s+' + fn + '\\s*\\([^)]*\\)\\s*\\{').exec(src);
  if (!m) { ok(false, `${fn}() ditemukan`); return; }
  let i = m.index + m[0].length, d = 1;
  while (i < src.length && d > 0) { const ch = src[i]; if (ch === '{') d++; else if (ch === '}') d--; i++; }
  const b = src.slice(m.index, i);
  ok(/rrFindOrCreateObtained\s*\(/.test(b), `${fn}() memakai rrFindOrCreateObtained()`);
  ok(!/\^obtained\\s\*#2/.test(b), `${fn}() tidak mematok /^obtained #2/ lagi`);
});

console.log(`\n${fail === 0 ? '✔ SEMUA LULUS' : '✖ GAGAL'}  —  lulus ${pass}, gagal ${fail}`);
process.exit(fail ? 1 : 0);
