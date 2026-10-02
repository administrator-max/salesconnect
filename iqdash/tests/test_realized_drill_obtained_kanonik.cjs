/* DRILL TOTAL REALIZED — kolom OBTAINED harus = canonicalObtained() per company.
 *
 * Pop-up "Total Realized — Breakdown" dulu membaca obtained dari
 * getRA(code).obtained: baris ra_records gelombang TERAKHIR, yang hanya memuat
 * obtained gelombang itu dan tidak ikut diperbarui saat Obtained #2/#3 terbit.
 * Diukur 02-Okt-2026: BDG 350 (resmi 1.000), BBB 400 (800), GNG 250 (600),
 * KJK 950 (1.700), EMS 1.600 (2.600) — Real. % sampai 230%.
 *
 * YANG DIKUNCI (hubungan, bukan angka tetap):
 *   A. Per baris: Obtained = canonicalObtained(company).
 *   B. Tile Obtained = Σ kolom Obtained.
 *   C. Real. % per baris = Realized / Obtained baris itu.
 *   D. Σ kolom Realized = kartu Total Realized (invarian lama, tetap berlaku).
 *   E. A berlaku juga saat periode dipilih (obtained sengaja kumulatif).
 *
 * Run: node iqdash/tests/test_realized_drill_obtained_kanonik.cjs
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

const bersih = s => String(s).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim();
const angka  = s => { const v = parseFloat(bersih(s).replace(/,/g, '')); return isNaN(v) ? 0 : v; };

/* Baris drill membawa kode company di onclick openDrawer('KODE'). */
function bacaDrill() {
  call('refreshRealizedDrill();');
  /* Dipotong per <tr, bukan dengan pola [^>]* — atribut onclick-nya memuat
     "=>" sehingga '>' pertama bukan akhir tag. */
  const html = nodes['realDrillBody'].innerHTML, rows = [];
  html.split(/<tr\b/).slice(1).forEach(seg => {
    const code = (seg.match(/openDrawer\('([^']+)'\)/) || [])[1];
    if (!code) return;
    const tds = []; const tdRe = /<td\b[^>]*>([\s\S]*?)<\/td>/g; let t;
    while ((t = tdRe.exec(seg))) tds.push(t[1]);
    rows.push({ code, obtained: angka(tds[3]), real: angka(tds[4]), pct: angka(tds[5]) });
  });
  const tile = (bersih(nodes['realDrillSummary'].innerHTML).match(/Obtained \(MT\)\s*([\d,.]+)/) || [])[1];
  return { rows, tileObt: tile ? parseFloat(tile.replace(/,/g, '')) : NaN };
}
function setPeriode(from, to, label) {
  ctx.__p = { from, to, label, active: !!(from || to) };
  call('PERIOD = { from: __p.from, to: __p.to, label: __p.label, active: __p.active }; FILTER_MODE = "both";');
}
const kanon = code => call(`(() => { const c = [...SPI, ...PENDING].find(x => x.code === ${JSON.stringify(code)}); return c ? canonicalObtained(c) : null; })()`);
const r3 = x => Math.round(x * 1000) / 1000;

const periode = [
  [null, null, 'All Time'],
  [new Date(2026, 0, 1), new Date(2026, 5, 30, 23, 59, 59), 'H1 2026'],
  [new Date(2026, 8, 1), new Date(2026, 8, 30, 23, 59, 59), 'Sep 2026'],
];
periode.forEach(([from, to, label]) => {
  setPeriode(from, to, label);
  const { rows, tileObt } = bacaDrill();
  console.log(`\n── ${label}: ${rows.length} baris`);
  const beda = rows.filter(r => { const k = kanon(r.code); return k == null || Math.abs(r.obtained - k) > 0.001; });
  ok(beda.length === 0, `A. Obtained tiap baris = canonicalObtained (${rows.length} company)`,
     beda.map(r => `${r.code} drill ${r.obtained} vs kanon ${kanon(r.code)}`).join('; '));
  const sigma = r3(rows.reduce((s, r) => s + r.obtained, 0));
  ok(rows.length === 0 || Math.abs(tileObt - sigma) < 0.01, `B. tile Obtained ${tileObt} = Σ kolom ${sigma}`);
  const pctSalah = rows.filter(r => r.obtained > 0 && Math.abs(r.pct - r.real / r.obtained * 100) > 0.06);
  ok(pctSalah.length === 0, 'C. Real. % = Realized / Obtained per baris', pctSalah.map(r => r.code).join(', '));
  const kartu = r3(call('reportRealizedTotal().mt'));
  const sReal = r3(rows.reduce((s, r) => s + r.real, 0));
  ok(Math.abs(kartu - sReal) < 0.01, `D. Σ Realized ${sReal} = kartu ${kartu}`);
});

console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
