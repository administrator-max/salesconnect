/* SATU ANGKA SUBMITTED DI SEMUA PERMUKAAN (tim, 21-Sep-2026)
 *
 * "Jangan ada angka yang berbeda antar-tab untuk Company … Submission."
 * Dikunci per company, atas data hidup (cache/iqdash_data.json — segarkan dulu
 * dengan tools/dump_payload_cache.php):
 *   kartu canonicalSubmitted  =  Σ kolom Submit tabel PERTEK & SPI (spiTerbitRows)
 *                             =  Σ baris drill Total Submitted
 * Termasuk produk yang dipindah revisi (GAS/BDG/DIOR/GIS/MJU/SMS: pengajuannya
 * tetap dihitung) dan re-apply yang masih menunggu PERTEK.
 *
 * Run: node iqdash/tests/test_submitted_tabel_sama_kartu.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const JS = path.join(ROOT, 'iqdash', 'assets', 'js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

const nodes = {};
const mk = () => ({ style: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  querySelectorAll: () => [], querySelector: () => null, appendChild(){}, setAttribute(){},
  addEventListener(){}, textContent: '', innerHTML: '', value: '' });
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'cache', 'iqdash_data.json'), 'utf8'));
const ctx = vm.createContext({
  console: { log(){}, warn(){}, error(){} }, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean, Promise, setTimeout: () => 0, clearTimeout(){}, MT_LOCALE: 'en-US',
  localStorage: { getItem: () => null, setItem(){} }, sessionStorage: { getItem: () => null, setItem(){} },
  Chart: function () { return { destroy(){} }; }, location: { search: '', hash: '' }, navigator: {},
  requestAnimationFrame: () => 0,
  fetch: () => Promise.resolve({ json: () => Promise.resolve(JSON.parse(JSON.stringify(data))) }),
  document: { getElementById: id => (nodes[id] = nodes[id] || mk()), querySelectorAll: () => [],
    querySelector: () => null, createElement: mk, addEventListener(){}, body: { appendChild(){} }, documentElement: {} },
});
ctx.window = ctx; ctx.globalThis = ctx;
fs.readdirSync(JS).filter(f => f.endsWith('.js')).sort().forEach(f => {
  try { vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }); } catch (e) { /* berkas UI murni */ }
});
const run = s => vm.runInContext(s, ctx);

(async () => {
  await run('loadData()');
  const r = run(`(() => {
    const tabel = {}; spiTerbitRows().forEach(x => { tabel[x.code] = (tabel[x.code] || 0) + (Number(x.submitMT) || 0); });
    const kartu = {}; allCompaniesPool().forEach(co => { kartu[co.code] = canonicalSubmitted(co); });
    refreshSubmitDrill();
    return { tabel, kartu, total: reportSubmittedTotal().mt,
             kaki: document.getElementById('submitDrillFooter').textContent };
  })()`);
  const beda = Object.keys(r.kartu).filter(c => Math.abs((r.tabel[c] || 0) - r.kartu[c]) > 0.5)
    .map(c => `${c}: tabel ${r.tabel[c] || 0} vs kartu ${r.kartu[c]}`);
  ok(beda.length === 0, `Σ Submit tabel PERTEK & SPI = kartu, per company (${Object.keys(r.kartu).length} company)`, beda.join('; '));
  const m = r.kaki.match(/Grand total ([\d,]+) MT/);
  const drill = m ? Number(m[1].replace(/,/g, '')) : NaN;
  ok(drill === r.total, `Σ drill Total Submitted ${drill} = kartu ${r.total}`, r.kaki);
  const tabelTotal = Object.values(r.tabel).reduce((a, b) => a + b, 0);
  ok(Math.abs(tabelTotal - r.total) < 0.5, `Σ tabel ${tabelTotal} = kartu ${r.total}`);
  console.log(`\n${fail ? '✘' : '✔'} ${pass} pass · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
