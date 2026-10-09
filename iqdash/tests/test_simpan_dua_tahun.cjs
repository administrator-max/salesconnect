/* SIMPAN COMPANY DUA TAHUN + PENGAJUAN PER TAHUN (08-Okt-2026, HDP 2027).
 *
 * Irisan tahun (sliceCompanyToYear) dulu DITOLAK patchToServer. Sejak HDP
 * mengajukan 2027 irisan disimpan lewat _gabungIrisanTahun(). Yang dikunci:
 *
 *   A. Siklus tahun lain ikut terkirim utuh, bertahun benar.
 *   B. Siklus tahun lain yang belum bertahun DIPATOK ke tahun efektifnya, tidak
 *      ikut dicap tahun yang sedang tampil (kasus SNSD).
 *   C. Lot tahun lain ikut terkirim (server mengganti seluruh lot per produk);
 *      lot irisan bernomor bentrok diberi nomor baru.
 *   D. Total company dihitung dari siklus gabungan.
 *   E. Nomor Submit pengajuan per tahun melanjutkan urutan company (server
 *      mendedup company+cycle_type — "Submit #1" kedua akan lenyap).
 *   F. pjtReq hanya membaca pengajuan tahun yang diminta.
 *
 * Data sintetis (bukan fixture), jadi tidak bergantung keadaan cache.
 * Run: node iqdash/tests/test_simpan_dua_tahun.cjs
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
call('PRODUCT_META = {}; PRODUCT_ALIASES = {};');

const co = {
  code: 'XX', products: ['GL ALLOY'], cycles: [
    { type: 'Submit #1', mt: 6000, products: { 'GL ALLOY': 6000 }, quotaYear: null, releaseDate: '01/01/2026' },
    { type: 'Obtained #1', mt: 800, products: { 'GL ALLOY': 800 }, quotaYear: null, releaseDate: '05/01/2026' },
    { type: 'Submit #2', mt: 2500, products: { 'GL ALLOY': 2500 }, quotaYear: 2027, releaseDate: 'TBA' },
  ],
  shipments: { 'GL ALLOY': [ { lotNo: 1, utilMT: 100 }, { lotNo: 2, utilMT: 50, quotaYear: 2027 } ] },
};
ctx.__co = co;
call('SPI_ALL = [__co]; PENDING_ALL = []; QUOTA_YEAR = 2027; applyQuotaYearSlice();');
const irisan = call('SPI.find(c => c.code === "XX")');
ok(irisan && irisan._quotaYearSliced && irisan.cycles.length === 1, 'irisan 2027 hanya memuat siklus 2027');

/* Sales menambah lot 2027 bernomor 1 — bentrok dengan lot 1 milik 2026. */
irisan.shipments['GL ALLOY'].push({ lotNo: 1, utilMT: 30 });
const { merged } = call('_gabungIrisanTahun(SPI.find(c => c.code === "XX"))');

const cy = merged.cycles.map(c => c.type + ':' + c.quotaYear).sort();
ok(JSON.stringify(cy) === JSON.stringify(['Obtained #1:2026', 'Submit #1:2026', 'Submit #2:2027']),
   'A+B. semua siklus terkirim; siklus tanpa tahun dipatok 2026, bukan 2027', cy.join(' '));

const lots = merged.shipments['GL ALLOY'];
const l26 = lots.filter(l => l.quotaYear === 2026), l27 = lots.filter(l => l.quotaYear === 2027);
ok(l26.length === 1 && l26[0].lotNo == 1 && l26[0].utilMT === 100, 'C. lot 2026 ikut terkirim utuh', JSON.stringify(l26));
const nomor = lots.map(l => String(l.lotNo));
ok(new Set(nomor).size === nomor.length && l27.length === 2, 'C. lot 2027 bentrok diberi nomor baru (tidak ada nomor ganda)', nomor.join(','));

ok(merged.submit1 === 8500 && merged.obtained === 800, `D. total dari siklus gabungan (submit ${merged.submit1}, obtained ${merged.obtained})`);

ok(call('pjtSiklusBerikut(__co)') === 'Submit #3', 'E. pengajuan berikut = Submit #3 (melanjutkan urutan company)');

co.newSubmissionByYear = { '2027': { products: [{ product: 'GL ALLOY', mt: 1 }], status: 'pending' } };
ok(call('!!pjtReq(__co, 2027) && !pjtReq(__co, 2026)'), 'F. pjtReq hanya membaca tahun yang diminta');

/* ── G–J: kolom tingkat company per tahun (09-Okt-2026, EMS) ─────────────── */
const co2 = {
  code: 'YY', products: ['SHEET PILE'], pertekNo: 'P-2026', spiNo: 'S-2026', revStatus: 'Submit SPI',
  statusUpdate: 'status 2026', reapplyRequests: [{ id: 'r1' }], salesRevRequest: { 'SHEET PILE': { requested: true } },
  utilizationMT: 2100, utilizationByProd: { 'SHEET PILE': 1600 }, availableByProd: { 'SHEET PILE': 0 },
  perYear: { '2027': { revStatus: 'Submit', statusUpdate: 'status 2027' } },
  cycles: [
    { type: 'Submit #1', mt: 8000, products: { 'SHEET PILE': 8000 }, quotaYear: 2026, releaseDate: '01/01/2026' },
    { type: 'Obtained #1', mt: 1600, products: { 'SHEET PILE': 1600 }, quotaYear: 2026, releaseDate: '05/01/2026' },
    { type: 'Submit #2', mt: 6000, products: { 'SHEET PILE': 2000, 'GI ALLOY': 4000 }, quotaYear: 2027, releaseDate: 'TBA' },
  ],
  shipments: { 'SHEET PILE': [ { lotNo: 1, utilMT: 1600 } ] },
};
ctx.__co2 = co2;
call('SPI_ALL = [__co2]; PENDING_ALL = []; QUOTA_YEAR = 2027; applyQuotaYearSlice();');
const i27 = call('SPI.find(c => c.code === "YY")');
ok(i27.pertekNo === '' && i27.spiNo === '' && i27.reapplyRequests.length === 0 && !Object.keys(i27.salesRevRequest).length,
   'G. irisan 2027 tidak mewarisi PERTEK/SPI/Re-Apply/Revision 2026', JSON.stringify({ p: i27.pertekNo, s: i27.spiNo }));
ok(i27.revStatus === 'Submit' && i27.statusUpdate === 'status 2027', 'H. irisan 2027 memakai perYear[2027]');
ok(i27.utilizationMT === 0 && !Object.keys(i27.utilizationByProd).length,
   'I. utilisasi 2026 tidak terbawa ke 2027', String(i27.utilizationMT));
i27.statusUpdate = 'status 2027 baru'; i27.pertekNo = 'P-2027';
const g = call('_gabungIrisanTahun(SPI.find(c => c.code === "YY")).merged');
ok(g.statusUpdate === 'status 2026' && g.pertekNo === 'P-2026' && g.revStatus === 'Submit SPI' && g.reapplyRequests.length === 1,
   'J. simpan dari 2027: kolom company tetap milik 2026', JSON.stringify({ su: g.statusUpdate, p: g.pertekNo }));
ok(g.perYear['2027'].statusUpdate === 'status 2027 baru' && g.perYear['2027'].pertekNo === 'P-2027',
   'J. nilai 2027 masuk perYear[2027]');
call('QUOTA_YEAR = 2026; applyQuotaYearSlice();');
const g26 = call('_gabungIrisanTahun(SPI.find(c => c.code === "YY")).merged');
ok(g26.perYear && g26.perYear['2027'] && g26.perYear['2027'].statusUpdate === 'status 2027',
   'J. simpan dari 2026 tidak membuang perYear[2027]');

console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
