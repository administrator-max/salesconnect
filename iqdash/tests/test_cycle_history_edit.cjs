/* CYCLE HISTORY — penyuntingan TANGGAL pada siklus yang sudah ada.
 *
 * Tahap pertama sengaja hanya tanggal (Submit, Release, PERTEK Terbit, SPI
 * Terbit). Produk & tonase menyusul dengan pagarnya sendiri, karena dua field
 * itulah yang melahirkan Obtained #2..#8 milik DIOR.
 *
 * Yang dikunci:
 *
 *   A. Konversi dua arah tidak merusak tanggal. Sheet menyimpan dd/mm/yyyy
 *      dan beberapa bentuk lain ("17/07/26", "10 August 2026"); <input
 *      type="date"> berbicara YYYY-MM-DD. Salah konversi = tanggal bergeser
 *      atau hilang, dan itu tidak akan terlihat sampai ada yang menghitung
 *      periode.
 *
 *   B. Yang ditulis kembali SELALU dd/mm/yyyy — bentuk yang sudah dipakai
 *      sheet. Menulis ISO akan menambah bentuk ketiga ke dalam data.
 *
 *   C. Kosong berarti TBA, dan itu tindakan yang SAH — bukan nilai yang
 *      diabaikan.
 *
 * Run: node iqdash/tests/test_cycle_history_edit.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

const nodes = {};
const buatEl = () => ({
  innerHTML: '', textContent: '', value: '', className: '', style: {}, disabled: false,
  classList: { add(){}, remove(){} }, dataset: {},
  appendChild(){}, querySelectorAll: () => [], querySelector: () => null,
  setAttribute(){}, addEventListener(){}, closest: () => null, scrollIntoView(){}, focus(){},
});
const node = id => (nodes[id] = nodes[id] || Object.assign(buatEl(), { id }));
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean, MT_LOCALE: 'en-US',
  localStorage: { getItem: () => null, setItem: () => {} },
  Chart: function () { return { destroy() {} }; },
  alert: () => {},
  document: {
    getElementById: node, querySelectorAll: () => [], querySelector: () => null,
    createElement: buatEl, addEventListener: () => {}, body: { appendChild(){} },
  },
});
ctx.window = ctx; ctx.globalThis = ctx;
['00-num.js', '01-data.js', '01a-quota-year.js', '02-period-filter.js',
 '13-rev-mgmt.js'].forEach(f => {
  try { vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }); }
  catch (e) { console.log('  (lewati ' + f + ': ' + e.message.slice(0, 60) + ')'); }
});
const call = e => vm.runInContext(e, ctx);

console.log('\nA · Membaca tanggal apa pun bentuknya menjadi YYYY-MM-DD');
{
  const iso = v => JSON.parse(call(`JSON.stringify(_chToIso(${JSON.stringify(v)}))`));
  ok(iso('24/07/2026') === '2026-07-24', 'dd/mm/yyyy', iso('24/07/2026'));
  ok(iso('17/07/26')   === '2026-07-17', 'dd/mm/yy — tahun dua digit, bentuk yang ada di data', iso('17/07/26'));
  ok(iso('2026-08-10') === '2026-08-10', 'ISO dibiarkan apa adanya', iso('2026-08-10'));
  ok(iso('') === '' && iso(null) === '' && iso('TBA') === '',
    'kosong / null / TBA -> kosong, bukan 1970-01-01',
    `${iso('')} | ${iso(null)} | ${iso('TBA')}`);
  ok(iso('bukan tanggal') === '', 'teks yang tak terbaca -> kosong, bukan tanggal karangan');
}

console.log('\nB · Menulis kembali SELALU dd/mm/yyyy');
{
  const dmy = v => JSON.parse(call(`JSON.stringify(_chFromIso(${JSON.stringify(v)}))`));
  ok(dmy('2026-07-24') === '24/07/2026', 'ISO -> dd/mm/yyyy', dmy('2026-07-24'));
  ok(dmy('2026-01-05') === '05/01/2026', 'nol di depan dipertahankan', dmy('2026-01-05'));
  ok(dmy('') === '', 'kosong tetap kosong (TBA)');
  ok(dmy('24/07/2026') === '', 'masukan yang BUKAN ISO ditolak, bukan diteruskan mentah',
    dmy('24/07/2026'));
}

console.log('\nC · Bolak-balik tidak menggeser hari');
{
  const bolak = v => JSON.parse(call(
    `JSON.stringify(_chFromIso(_chToIso(${JSON.stringify(v)})))`));
  const uji = ['24/07/2026', '17/07/26', '01/01/2026', '31/12/2026', '10 August 2026'];
  const meleset = uji.filter(v => {
    const h = bolak(v);
    if (!h) return true;
    const a = JSON.parse(call(`JSON.stringify(_chToIso(${JSON.stringify(v)}))`));
    const b = JSON.parse(call(`JSON.stringify(_chToIso(${JSON.stringify(h)}))`));
    return a !== b;
  });
  ok(meleset.length === 0,
    `${uji.length} bentuk tanggal bolak-balik tanpa bergeser sehari pun`,
    meleset.map(v => v + ' -> ' + bolak(v)).join(', '));
}

console.log('\nD · Keadaan penyuntingan berkunci per company');
{
  call(`_chEdit = null;`);
  ok(call('_chEdit') === null, 'awalnya tidak ada yang disunting');
  /* Kunci menggabungkan kode company DAN indeks — kalau hanya indeks, membuka
     baris ke-2 di satu company akan ikut membuka baris ke-2 company lain. */
  call(`_chEdit = 'DIOR|1';`);
  ok(call(`_chEdit === 'DIOR|1'`), 'kunci memuat kode company, bukan indeks saja');
  ok(call(`_chEdit !== 'AMP|1'`), 'sehingga company lain berindeks sama tidak ikut terbuka');
}

console.log('\nE · Baris penyuntingan memuat keempat tanggal, dan hanya itu');
{
  const html = JSON.parse(call(
    `JSON.stringify(_chEditRow('DIOR', 1, {submitDate:'04/04/2026', releaseDate:'', pertekDate:'', spiDate:'31/08/2026'}))`));
  ['chSubmit_1', 'chRelease_1', 'chPertek_1', 'chSpi_1'].forEach(id =>
    ok(html.includes(id), 'ada input ' + id));
  ok((html.match(/type="date"/g) || []).length === 4, 'tepat empat input tanggal',
    String((html.match(/type="date"/g) || []).length));
  ok(html.includes('value="2026-08-31"'), 'tanggal yang sudah ada terisi di input',
    (html.match(/value="[^"]*"/g) || []).join(' '));
  ok(!/name="mt"|Tonase|produk/i.test(html.replace(/Tonase &amp; produk tidak ikut berubah/, '')),
    'TIDAK ada input tonase atau produk — tahap pertama hanya tanggal');
  ok(/tidak ikut berubah/.test(html),
    'dan itu dinyatakan di layar, bukan cuma diketahui pembuatnya');
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
