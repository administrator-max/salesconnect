/* RENDER — tabel "PERTEK & SPI Terbit" dan kolom Validity Date di Available Quota.
 *
 * Uji ini menjawab satu pertanyaan yang tidak dijawab uji logika mana pun:
 * apakah jumlah SEL setiap baris sama dengan jumlah KOLOM di header?
 *
 * Tabel yang selnya bergeser satu kolom tetap terlihat rapi di layar — angkanya
 * hanya berdiri di bawah judul yang salah. Itu kelas kegagalan yang paling
 * berbahaya di dashboard ini: bukan angka yang keliru, melainkan angka benar
 * yang dibaca sebagai hal lain. Menambah kolom Validity Date ke tabel yang sudah
 * ada persis memicu risiko itu, termasuk pada baris TOTAL di kaki tabel yang
 * memakai colspan.
 *
 * Run: node iqdash/tests/test_spi_terbit_render.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');
const HTML = fs.readFileSync(path.join(ROOT, 'assets', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

/* ── DOM tiruan seadanya ───────────────────────────────────────────────────
   Cukup untuk menampung innerHTML yang dirakit para builder. Tidak berpura-pura
   jadi peramban: yang diuji di sini bentuk HTML-nya, bukan tata letaknya. */
const nodes = {};
function node(id) {
  if (!nodes[id]) nodes[id] = { id, innerHTML: '', textContent: '', value: '', style: {}, classList: { add(){}, remove(){} } };
  return nodes[id];
}
const doc = {
  getElementById: id => node(id),
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: () => ({ style: {}, classList: { add(){}, remove(){} }, innerHTML: '', appendChild(){}, setAttribute(){} }),
  addEventListener: () => {},
  body: { appendChild(){} },
};

const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean,
  MT_LOCALE: 'en-US',
  localStorage: { getItem: () => null, setItem: () => {} },
  document: doc,
  Chart: function () { return { destroy() {} }; },
  fetch: () => Promise.reject(new Error('tidak ada jaringan di uji ini')),
});
ctx.window = ctx;
ctx.globalThis = ctx;
['00-num.js', '01-data.js', '01a-quota-year.js', '02-period-filter.js', '03-kpis.js',
 '04-charts.js', '05a-spi-terbit.js', '19-init.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }));
const call = e => vm.runInContext(e, ctx);
const set  = (name, v) => { ctx.__tmp = v; vm.runInContext(`${name} = __tmp;`, ctx); };

/* ── Data nyata ───────────────────────────────────────────────────────────── */
const cachePath = path.join(ROOT, '..', 'cache', 'iqdash_data.json');
if (!fs.existsSync(cachePath)) {
  console.log('cache payload tidak ada — uji render dilewati');
  process.exit(0);
}
const real = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
set('PRODUCT_ALIASES', real.productAliases || {});
const meta = {};
(real.products || []).forEach(p => { if (p && p.name) meta[p.name] = p; });
set('PRODUCT_META', meta);
set('SPI_ALL', real.spi);
set('PENDING_ALL', real.pending);
set('RA_ALL', real.ra || []);
set('REALIZATIONS_ALL', []);
call(`QUOTA_YEAR = 2026; applyQuotaYearSlice();`);

/* ── Jumlah kolom header dari index.html ──────────────────────────────────── */
function headerCount(tbodyId) {
  const i = HTML.indexOf(`id="${tbodyId}"`);
  if (i < 0) return -1;
  const head = HTML.lastIndexOf('<thead', i);
  const headEnd = HTML.indexOf('</thead>', head);
  if (head < 0 || headEnd < 0) return -1;
  return (HTML.slice(head, headEnd).match(/<th[\s>]/g) || []).length;
}
const cellCount = html => (html.match(/<td[\s>]/g) || []).length;

/* ── A. PERTEK & SPI Terbit ───────────────────────────────────────────────── */
console.log('\nA · Tabel PERTEK & SPI Terbit');
const stCols = headerCount('spiTerbitBody');
ok(stCols === 12, `header punya 12 kolom persis seperti yang diminta tim (dapat ${stCols})`);

call(`buildSpiTerbitTable();`);
const stHtml = nodes['spiTerbitBody'].innerHTML;
ok(stHtml.length > 0, 'tabel terisi, bukan kosong');

const stRows = stHtml.split('</tr>').filter(r => r.includes('<td'));
ok(stRows.length > 0, `${stRows.length} baris dirender`);
const salah = stRows.map((r, i) => [i, cellCount(r)]).filter(([, n]) => n !== stCols);
ok(salah.length === 0, `setiap baris punya tepat ${stCols} sel`,
  salah.slice(0, 3).map(([i, n]) => `baris ${i} punya ${n}`).join(', '));

ok(/🟢 Active/.test(stHtml),   'lencana 🟢 Active muncul');
ok(/⚪ Inactive/.test(stHtml), 'lencana ⚪ Inactive muncul — SPI yang digantikan tetap tampil sebagai data historis');
ok(/31\/12\/2026|31-Dec-26/.test(stHtml), 'kolom Validity Date terisi 31 Desember');

/* Contoh acuan tim: PT GAS. */
const gasRows = stRows.filter(r => />GAS</.test(r));
ok(gasRows.length === 2, `PT GAS: 2 baris SPI (dapat ${gasRows.length})`);
ok(gasRows.some(r => /BORDES ALLOY/.test(r) && /Inactive/.test(r)),
  'PT GAS baris BORDES ALLOY bertanda Inactive');
ok(gasRows.some(r => /GI ALLOY|GI BORON/.test(r) && /Active/.test(r) && !/Inactive/.test(r)),
  'PT GAS baris produk baru bertanda Active');

const stFoot = nodes['spiTerbitFoot'].innerHTML;
ok(/tahun kuota/.test(stFoot) && /2026/.test(stFoot), 'kaki tabel menyebut tahun kuota yang sedang dipakai');
ok(/tidak ditampilkan|Submit \/ Obtained/.test(stFoot),
  'kaki tabel menjelaskan basis angkanya (dan menyatakan baris yang dilewati, kalau ada)');

/* ── B. Available Quota + Validity Date ───────────────────────────────────── */
console.log('\nB · Tabel Available Quota');
const avqCols = headerCount('avqTableBody');
ok(avqCols === 10, `header Available Quota jadi 10 kolom sesudah Validity Date ditambah (dapat ${avqCols})`);

call(`buildAvqTable();`);
const avqHtml = nodes['avqTableBody'].innerHTML;
ok(avqHtml.length > 0, 'tabel Available Quota terisi');
const avqRows = avqHtml.split('</tr>').filter(r => r.includes('<td'));
const avqSalah = avqRows.map((r, i) => [i, cellCount(r)]).filter(([, n]) => n !== avqCols);
ok(avqSalah.length === 0, `setiap baris Available Quota punya tepat ${avqCols} sel`,
  avqSalah.slice(0, 3).map(([i, n]) => `baris ${i} punya ${n}`).join(', '));

/* Baris TOTAL memakai colspan — kesalahannya tidak akan terlihat dari jumlah
   <td> saja, jadi colspan-nya ikut dihitung. */
const footHtml = nodes['avqTableFoot'].innerHTML;
const colspan = Number((footHtml.match(/colspan="(\d+)"/) || [])[1] || 0);
const footCells = cellCount(footHtml);
ok(colspan + (footCells - 1) === avqCols,
  `baris TOTAL menutupi tepat ${avqCols} kolom (colspan ${colspan} + ${footCells - 1} sel)`,
  `dapat ${colspan + (footCells - 1)}`);

ok(/31-Dec-26|31\/12\/2026|tanpa SPI aktif/.test(avqHtml),
  'kolom Validity Date di Available Quota terisi tanggal, atau ditandai bila tidak ada SPI aktif');

/* ── C. Tahun kosong ──────────────────────────────────────────────────────── */
console.log('\nC · Tahun 2027 (belum ada datanya)');
call(`QUOTA_YEAR = 2027; applyQuotaYearSlice(); buildSpiTerbitTable(); buildAvqTable();`);
const st27 = nodes['spiTerbitBody'].innerHTML;
ok(/Tidak ada SPI terbit untuk tahun kuota 2027/.test(st27),
  'tabel 2027 menjelaskan kenapa kosong, bukan menampilkan tabel hampa tanpa kata');
ok(!/🟢 Active/.test(st27), 'tidak ada satu pun baris 2026 yang bocor ke tampilan 2027');
ok(nodes['avqTableBody'].innerHTML.trim() === '', 'Available Quota 2027 kosong');

call(`renderQuotaYearUI();`);
ok(/Belum ada data kuota <strong>2027<\/strong>/.test(nodes['qyEmptyTxt'].innerHTML),
  'spanduk menyatakan nol-nya karena data belum ada, bukan karena kuota habis');
ok(nodes['qyEmptyBanner'].style.display === 'flex', 'spanduk itu benar-benar ditampilkan');

call(`QUOTA_YEAR = 2026; applyQuotaYearSlice(); renderQuotaYearUI();`);
ok(nodes['qyEmptyBanner'].style.display === 'none', '…dan disembunyikan lagi begitu kembali ke tahun yang berisi');

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
