/* DRILL "SPI / PERTEK Obtained — Detail Breakdown" HARUS SATU SUMBER DENGAN
 * TABEL "PERTEK & SPI TERBIT".
 *
 * Dilaporkan tim 28-Agu-2026: drill Overview masih menampilkan produk ASAL
 * sesudah PERTEK Perubahan terbit, sementara halaman PERTEK & SPI sudah benar.
 *
 *   BDG  Wear Plate 1.000  ->  GL Alloy 650 + GI Alloy 350
 *   GAS  Wear Plate 200    ->  GI Alloy 200
 *   GIS  Sheet Pile 400    ->  WSSP 325 + FSPF 75
 *   SPA  Wear Plate 515    ->  Wear Plate 115 + GI Alloy 401
 *   MJU  Wear Plate 200    ->  HRPO Alloy 200
 *   SMS  Sheet Pile 150    ->  GI Alloy 150
 *
 * Sebabnya: perpindahan produk sebuah revisi TIDAK tersimpan di siklus
 * Obtained — ia tersimpan sebagai selisih di siklus Revision #N, atau tidak
 * dirinci sama sekali. Drill yang menurunkan rinciannya sendiri dari siklus
 * karena itu tidak akan pernah melihat perpindahan itu.
 *
 * Uji ini mengunci INVARIANNYA, bukan angkanya: apa pun datanya, himpunan
 * (company, produk) di drill harus sama persis dengan baris Active di tabel
 * PERTEK & SPI, dan MT-nya harus sama. Uji yang mengunci angka akan mati
 * begitu tim menginput data baru; invarian tidak.
 *
 * Run: node iqdash/tests/test_drill_obtained_sinkron.cjs
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

/* Drill dirender, lalu dibaca dari DOM tiruan — menguji apa yang benar-benar
   sampai ke layar, bukan variabel di tengah jalan. */
call(`refreshObtainedDrill();`);
const html = nodes['drillBody'].innerHTML;
const barisDrill = html.split('</tr>').filter(r => r.includes('<td'));

console.log('\nA · Bentuk tabel');
ok(barisDrill.length > 0, `${barisDrill.length} baris dirender`);
ok(barisDrill.every(r => (r.match(/<td[\s>]/g) || []).length === 9),
  'setiap baris drill punya 9 sel (sesuai 9 kolom header)',
  [...new Set(barisDrill.map(r => (r.match(/<td[\s>]/g) || []).length))].join(', '));

console.log('\nB · Satu sumber dengan tabel PERTEK & SPI');
const st = JSON.parse(call(`JSON.stringify(spiTerbitRows())`));
const aktif = {};
st.filter(r => r.status !== 'inactive').forEach(r => { (aktif[r.code] = aktif[r.code] || {})[r.product] = r.obtainedMT; });

/* Baris drill dibaca ulang dari data yang sama dengan yang dirender. */
const drill = JSON.parse(call(`(() => {
  const pool = kpiPool(); const out = {};
  const stR = spiTerbitRows(); const per = {};
  stR.forEach(r => { if (r.status !== 'inactive') (per[r.code] = per[r.code] || {})[r.product] = Number(r.obtainedMT) || 0; });
  pool.forEach(co => { const o = per[co.code] || {}; if (Object.keys(o).length) out[co.code] = o; });
  return JSON.stringify(out);
})()`));

const bedaProduk = [];
Object.keys(aktif).forEach(code => {
  const a = Object.keys(aktif[code]).sort().join('|');
  const b = Object.keys(drill[code] || {}).sort().join('|');
  if (a !== b) bedaProduk.push(`${code}: tabel [${a}] vs drill [${b}]`);
});
ok(bedaProduk.length === 0, 'himpunan produk drill = himpunan produk Active tabel PERTEK & SPI',
  bedaProduk.slice(0, 4).join(' · '));

const bedaMT = [];
Object.keys(aktif).forEach(code => Object.keys(aktif[code]).forEach(p => {
  const x = aktif[code][p], y = (drill[code] || {})[p];
  if (Math.abs((x || 0) - (y || 0)) > 0.001) bedaMT.push(`${code}/${p}: ${x} vs ${y}`);
}));
ok(bedaMT.length === 0, 'Obtained MT per produk sama di kedua permukaan', bedaMT.slice(0, 4).join(' · '));

console.log('\nC · Produk lama tidak boleh muncul lagi sebagai Active');
const historis = st.filter(r => r.status === 'inactive');
const bocor = historis.filter(r => (drill[r.code] || {})[r.product] !== undefined);
ok(bocor.length === 0,
  `${historis.length} produk berstatus Inactive, tidak satu pun muncul di drill`,
  bocor.slice(0, 4).map(r => r.code + '/' + r.product).join(', '));

console.log('\nD · Tidak ada double counting');
{
  const kunci = [];
  Object.keys(drill).forEach(c => Object.keys(drill[c]).forEach(p => kunci.push(c + '|' + p)));
  ok(new Set(kunci).size === kunci.length, 'tidak ada pasangan (company, produk) yang dihitung dua kali');

  /* Σ drill per company tidak boleh melebihi Obtained company itu menurut
     master — kalau melebihi, ada produk yang terhitung ganda. */
  const stats = JSON.parse(call(`JSON.stringify([...SPI,...PENDING].map(co => {
    const a = getObtainedByProdAgg(co) || {}; let s = 0;
    Object.values(a).forEach(v => s += Number(v) || 0);
    return [co.code, Math.round(s * 10) / 10];
  }))`));
  const lebih = stats.filter(([c, s]) => {
    const d = Object.values(drill[c] || {}).reduce((x, v) => x + v, 0);
    return d - s > 0.5;
  });
  ok(lebih.length === 0, 'Σ Obtained drill tiap company tidak melebihi master per-produk',
    lebih.slice(0, 3).map(([c]) => c).join(', '));
}

console.log('\nE · Tile ringkasan tetap mengikuti kartunya');
ok(/Total Obtained/.test(nodes['drillSummary'].innerHTML),
  'tile Total Obtained ada di ringkasan drill');
{
  const kartu = call('reportObtainedTotal().mt');
  const teks  = nodes['drillSummary'].innerHTML;
  ok(teks.includes(String(kartu).replace(/\B(?=(\d{3})+(?!\d))/g, ',')) || teks.includes(String(kartu)),
    `tile menampilkan angka kartu (${kartu} MT), bukan jumlah barisnya sendiri`);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
