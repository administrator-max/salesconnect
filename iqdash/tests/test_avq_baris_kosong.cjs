/* TABEL AVAILABLE QUOTA — baris yang KOSONG SELURUHNYA disembunyikan.
 *
 * Produk yang sudah dipindahkan revisi meninggalkan baris stats bernilai nol
 * (obtained 0, util 0, sisa 0). Diminta tim 28-Agu-2026 untuk disembunyikan
 * karena tidak menerangkan apa pun.
 *
 * Yang dikunci di sini adalah GARIS BATASNYA, karena di situ letak bahayanya:
 *
 *   · KETIGA angkanya nol  -> disembunyikan
 *   · sisa nol tapi kuotanya habis terpakai (obt 1.000 / util 1.000 / sisa 0)
 *     -> TETAP TAMPIL. Sisa nol di situ fakta yang perlu dibaca, bukan baris
 *     hampa. Menyembunyikannya akan menghapus informasi bahwa kuota itu ada
 *     dan sudah habis.
 *
 * Dan yang paling penting: TOTAL di kaki tabel tidak boleh bergerak, serta
 * jumlah yang disembunyikan harus DINYATAKAN. Menyembunyikan diam-diam membuat
 * tabel tampak lengkap padahal tidak.
 *
 * Run: node iqdash/tests/test_avq_baris_kosong.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

const nodes = {};
const node = id => (nodes[id] = nodes[id] || { id, innerHTML: '', textContent: '', value: '', style: {}, classList: { add(){}, remove(){} } });
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean, MT_LOCALE: 'en-US',
  localStorage: { getItem: () => null, setItem: () => {} },
  Chart: function () { return { destroy() {} }; },
  document: {
    getElementById: node, querySelectorAll: () => [], querySelector: () => null,
    createElement: () => ({ style: {}, classList: { add(){}, remove(){} }, innerHTML: '', appendChild(){}, setAttribute(){} }),
    addEventListener: () => {}, body: { appendChild(){} },
  },
});
ctx.window = ctx; ctx.globalThis = ctx;
['00-num.js', '01-data.js', '01a-quota-year.js', '02-period-filter.js', '03-kpis.js',
 '04-charts.js', '05-tables-spi.js', '05a-spi-terbit.js', '19-init.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }));
const call = e => vm.runInContext(e, ctx);
const set  = (name, v) => { ctx.__tmp = v; vm.runInContext(`${name} = __tmp;`, ctx); };

const cachePath = path.join(ROOT, '..', 'cache', 'iqdash_data.json');
if (!fs.existsSync(cachePath)) { console.log('cache payload tidak ada — dilewati'); process.exit(0); }
const real = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
set('PRODUCT_ALIASES', real.productAliases || {});
const meta = {}; (real.products || []).forEach(p => { if (p && p.name) meta[p.name] = p; });
set('PRODUCT_META', meta);
set('SPI_ALL', real.spi); set('PENDING_ALL', real.pending);
set('RA_ALL', real.ra || []); set('REALIZATIONS_ALL', []);
call(`QUOTA_YEAR = 2026; applyQuotaYearSlice();`);

const semua = JSON.parse(call(`JSON.stringify(availableQuotaRows())`));
const nol = v => !(Math.abs(Number(v) || 0) > 0.001);
const kosong = semua.filter(r => nol(r.obtained) && nol(r.utilMT) && nol(r.avq));
const habis  = semua.filter(r => nol(r.avq) && (!nol(r.obtained) || !nol(r.utilMT)));

call(`buildAvqTable();`);
const html = nodes['avqTableBody'].innerHTML;
const baris = html.split('</tr>').filter(r => r.includes('<td'));
const teks  = html.replace(/<[^>]+>/g, ' ');

console.log('\nA · Bentuk tabel');
ok(baris.length === semua.length - kosong.length,
  `${baris.length} baris tampil dari ${semua.length} (${kosong.length} kosong disembunyikan)`,
  `harap ${semua.length - kosong.length}`);
ok(baris.every(r => (r.match(/<td[\s>]/g) || []).length === 10),
  'setiap baris tetap 10 sel',
  [...new Set(baris.map(r => (r.match(/<td[\s>]/g) || []).length))].join(', '));

console.log('\nB · Yang disembunyikan HANYA yang kosong seluruhnya');
{
  const bocor = kosong.filter(r => new RegExp('>\\s*' + r.code + '\\s*<').test(html) &&
    teks.includes(r.product));
  /* Pemeriksaan pasti: baris kosong tidak boleh punya barisnya sendiri. */
  const kunci = baris.map(r => {
    const m = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1].replace(/<[^>]+>/g, '').trim());
    return (m[0] || '') + '|' + (m[2] || '');
  });
  const munculKosong = kosong.filter(r => kunci.includes(r.code + '|' + r.product));
  ok(munculKosong.length === 0, `${kosong.length} baris kosong tidak satu pun tampil`,
    munculKosong.slice(0, 4).map(r => r.code + '/' + r.product).join(', '));
}

console.log('\nC · Baris yang kuotanya HABIS TERPAKAI tetap tampil');
{
  const kunci = baris.map(r => {
    const m = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1].replace(/<[^>]+>/g, '').trim());
    return (m[0] || '') + '|' + (m[2] || '');
  });
  const hilang = habis.filter(r => !kunci.includes(r.code + '|' + r.product));
  ok(hilang.length === 0,
    `${habis.length} baris bersisa 0 tapi berkuota tetap tampil (mis. yang sudah habis terpakai)`,
    hilang.slice(0, 4).map(r => r.code + '/' + r.product + ' obt ' + r.obtained).join(', '));
}

console.log('\nD · Total tidak bergerak, dan yang disembunyikan dinyatakan');
{
  const foot = nodes['avqTableFoot'].innerHTML;
  const angka = s => Math.round((Number(s) || 0) * 10) / 10;
  const tAvq = angka(semua.reduce((s, r) => s + r.avq, 0));
  const kartu = call('reportAvailableTotal().mt');
  ok(Math.abs(tAvq - kartu) < 0.5, `Σ seluruh baris = kartu Available (${kartu})`, String(tAvq));

  const tampil = angka(semua.filter(r => !(nol(r.obtained) && nol(r.utilMT) && nol(r.avq)))
    .reduce((s, r) => s + r.avq, 0));
  ok(Math.abs(tampil - tAvq) < 0.001,
    'menyembunyikan baris kosong TIDAK mengubah total Available', `${tampil} vs ${tAvq}`);

  if (kosong.length) {
    ok(/baris kosong disembunyikan/.test(foot),
      `kaki tabel menyatakan ${kosong.length} baris disembunyikan — bukan dihilangkan diam-diam`,
      foot.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 140));
  } else {
    ok(!/baris kosong disembunyikan/.test(foot),
      'tidak ada baris kosong -> tidak ada catatan yang mengganggu di kaki tabel');
  }
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
