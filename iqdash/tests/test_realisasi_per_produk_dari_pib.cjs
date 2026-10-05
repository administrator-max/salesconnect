/* REALISASI PER PRODUK — dari baris PIB, bukan taksiran porsi obtained.
 *
 * Tabel Utilization & Realization dulu membagi realisasi company ke produk
 * menurut porsi obtained (splitRealPd), padahal tiap baris PIB membawa produk/
 * HS-nya. BTS 05-Okt-2026: PIB 649867 = 188,993 MT Bordes, tabel menulis
 * Bordes 241,419 dan AS Steel 241,419 (AS Steel tak pernah direalisasikan).
 *
 * YANG DIKUNCI (hubungan, bukan angka tetap):
 *   A. realizedByCompanyProd(): Σ produk (+ __tanpa) = realizedByCompany() per company.
 *   B. splitRealPd(...) dengan angka PIB: Σ hasil = total company.
 *   C. Company yang SEMUA baris PIB-nya terpetakan ke produk yang ia pegang:
 *      hasil pembagian = angka PIB persis, per produk.
 *   D. Produk yang tidak punya baris PIB dan tidak ada sisa → 0, bukan taksiran.
 *   E. Berlaku juga saat periode dipilih.
 *
 * Run: node iqdash/tests/test_realisasi_per_produk_dari_pib.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT  = path.join(__dirname, '..');
const JS    = path.join(ROOT, 'assets', 'js');
const CACHE = path.join(ROOT, '..', 'cache');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

const dataPath = path.join(CACHE, 'iqdash_data.json');
const realPath = path.join(CACHE, '_api_realizations.json');
if (!fs.existsSync(dataPath) || !fs.existsSync(realPath)) {
  console.log('cache payload tidak ada — dilewati'); process.exit(0);
}

const nodes = {};
const mkEl = id => ({
  id, innerHTML: '', textContent: '', value: '', checked: false, style: {}, dataset: {},
  classList: { add(){}, remove(){}, toggle(){}, contains: () => false },
  appendChild(){}, removeChild(){}, insertAdjacentHTML(){}, remove(){},
  querySelectorAll: () => [], querySelector: () => null, closest: () => null,
  setAttribute(){}, getAttribute: () => null, removeAttribute(){}, addEventListener(){},
  getContext: () => ({ canvas: {}, clearRect(){}, save(){}, restore(){} }),
  children: [], scrollIntoView(){},
});
const node = id => (nodes[id] = nodes[id] || mkEl(id));
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Intl,
  isNaN, isFinite, parseFloat, parseInt, RegExp, Boolean, Error, Promise, Symbol,
  encodeURIComponent, decodeURIComponent,
  setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
  requestAnimationFrame: () => 0,
  localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
  sessionStorage: { getItem: () => null, setItem(){}, removeItem(){} },
  fetch: () => Promise.reject(new Error('tanpa jaringan')),
  Chart: function () { return { destroy(){}, update(){} }; },
  document: {
    getElementById: node, querySelectorAll: () => [], querySelector: () => null,
    createElement: mkEl, addEventListener: () => {},
    body: { appendChild(){}, classList: { add(){}, remove(){} } },
    documentElement: { style: {} },
  },
  navigator: { userAgent: 'node' }, location: { href: '', search: '' },
  alert(){}, confirm: () => true, prompt: () => null,
});
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.Chart.register = function(){};

const daftar = fs.readFileSync(path.join(ROOT, 'assets', 'index.html'), 'utf8')
  .split('\n').map(l => (l.match(/assets\/js\/([\w.-]+\.js)/) || [])[1]).filter(Boolean);
const sudah = new Set();
daftar.forEach(f => {
  if (sudah.has(f)) return; sudah.add(f);
  try { vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }); }
  catch (e) { /* sebagian berkas menyentuh API yang tidak ada di DOM tiruan */ }
});
const call = e => vm.runInContext(e, ctx);
const set  = (nama, v) => { ctx.__tmp = v; vm.runInContext(nama + ' = __tmp;', ctx); };

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const real = JSON.parse(fs.readFileSync(realPath, 'utf8'));
const dedup = a => { const s = new Set(); return (a || []).filter(c => { if (s.has(c.code)) return false; s.add(c.code); return true; }); };
set('SPI_ALL', dedup(data.spi)); set('PENDING_ALL', dedup(data.pending));
set('RA_ALL', data.ra || []);
set('REALIZATIONS_ALL', real.realizations || []);
const meta = {}; (data.products || []).forEach(p => { if (p && p.name) meta[p.name] = p; });
set('PRODUCT_META', meta); set('PRODUCT_ALIASES', data.productAliases || {});
try { set('COMPANY_DIRECTORY', data.companyDirectory || []); } catch (e) {}
call('QUOTA_YEAR = 2026; try { canonCyclesProducts(); } catch(e) {} applyQuotaYearSlice();');

if (!call('REALIZATIONS.length')) { console.log('cache realisasi kosong — dilewati'); process.exit(0); }

const hasil = () => JSON.parse(call(`JSON.stringify((() => {
  const tot = realizedByCompany(), pp = realizedByCompanyProd(), out = {};
  [...SPI, ...PENDING].forEach(co => {
    const t = tot[co.code] || 0; if (!t) return;
    const obt = getObtainedByProd(co);
    const pk = Object.keys(obt).filter(p => (obt[p] || 0) > 0);
    out[co.code] = { total: t, pib: pp[co.code] || {}, prods: pk.map(p => canonicalProduct(p)),
      split: splitRealPd(t, pk, co.realizationByProd || {}, obt, pp[co.code]) };
  });
  return out;
})())`));

function setPeriode(from, to, label) {
  ctx.__p = { from, to, label, active: !!(from || to) };
  call('PERIOD = { from: __p.from, to: __p.to, label: __p.label, active: __p.active }; FILTER_MODE = "both";');
}
const sum = o => Object.values(o).reduce((a, b) => a + (Number(b) || 0), 0);

[[null, null, 'All Time'],
 [new Date(2026, 0, 1), new Date(2026, 5, 30, 23, 59, 59), 'H1 2026'],
 [new Date(2026, 9, 1), new Date(2026, 9, 31, 23, 59, 59), 'Okt 2026']].forEach(([from, to, label]) => {
  setPeriode(from, to, label);
  const h = hasil();
  const codes = Object.keys(h);
  console.log(`\n── ${label}: ${codes.length} company bertransaksi`);
  const a = codes.filter(c => Math.abs(sum(h[c].pib) - h[c].total) > 0.001);
  ok(a.length === 0, 'A. Σ realisasi per produk (PIB) = realisasi company', a.join(', '));
  const b = codes.filter(c => Math.abs(sum(h[c].split) - h[c].total) > 0.001);
  ok(b.length === 0, 'B. Σ pembagian = total company', b.join(', '));
  const bersih = codes.filter(c => Object.keys(h[c].pib).every(p => h[c].prods.includes(p)));
  const c = bersih.filter(code => Object.entries(h[code].split).some(([p, v]) =>
    Math.abs(v - (h[code].pib[call(`canonicalProduct(${JSON.stringify(p)})`)] || 0)) > 0.001));
  ok(c.length === 0, `C. ${bersih.length} company terpetakan penuh: pembagian = angka PIB persis`, c.join(', '));
  const d = bersih.filter(code => Object.entries(h[code].split).some(([p, v]) =>
    !h[code].pib[call(`canonicalProduct(${JSON.stringify(p)})`)] && v > 0.001));
  ok(d.length === 0, 'D. produk tanpa baris PIB tidak diberi realisasi taksiran', d.join(', '));
});

console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
