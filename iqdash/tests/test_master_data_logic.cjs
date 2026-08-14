/* MASTER DATA LOGIC — keputusan tim 2026-08-14.
 *
 * Delapan aturan yang harus berlaku SERAGAM di Overview, Active Applications,
 * SPI/PERTEK, Total Submission, Total Obtained, Product Breakdown, Available
 * Quota, Utilization, Realization, dan seluruh tabel turunannya:
 *
 *   1  Total submission tiap cycle adalah MASTER. Kalau rincian produk berbeda
 *      dari total cycle, yang dipakai total cycle. Tidak boleh double counting
 *      antara cycle total dan product breakdown.
 *   2  HDP Submit #3 = 3.000 MT, Obtained #3 = 100 MT, GL Alloy.
 *   3  LCP Submit #2 = 2.725 MT (bukan 3.000), Obtained #2 = 200 MT, GL Alloy.
 *   4  Revisi: selama PERTEK Perubahan belum terbit, pakai PERTEK original —
 *      produk hasil revisi TIDAK dihitung obtained, kuota original tidak
 *      diganti. Revisi adalah replacement, bukan penambahan.
 *   5  Re-Apply menambah kuota. Total Submission = kumulatif seluruh cycle;
 *      Active Applications = HANYA cycle yang sedang aktif.
 *   6  Obtained yang sudah dikonfirmasi valid tetap terhitung.
 *   8  Missing Product Breakdown: JANGAN menebak nama produknya.
 *
 * Run: node iqdash/tests/test_master_data_logic.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const JS  = path.join(__dirname, '..', 'assets', 'js');
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean,
  MT_LOCALE: 'en-US',
  document: { getElementById: () => null, querySelectorAll: () => [] },
});
['01-data.js', '02-period-filter.js', '04-charts.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }));
const call = e => vm.runInContext(e, ctx);

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };
const cyc = (type, mt, o) => Object.assign({ type, mt, products: {} }, o || {});

/* ── Fixture: bentuk yang persis dilaporkan tim ────────────────────────── */
const SPI = [
  /* HDP — Submit #3 3.000 MT dengan rincian produk KOSONG (aturan 1 + 8),
     Obtained #3 100 MT juga tanpa rincian (aturan 2 + 6). */
  { code: 'HDP', obtained: 0, revType: 'complete', products: ['GL ALLOY'],
    cycles: [
      cyc('Submit #1',   6000, { products: { 'GL ALLOY': 6000 }, submitDate: '16/10/2025', releaseDate: '29/10/2025', pertekDate: '29/10/2025' }),
      cyc('Obtained #1',  800, { products: { 'GL ALLOY':  800 }, submitDate: '30/10/2025', releaseDate: '07/11/2025', spiDate: '07/11/2025' }),
      cyc('Submit #2',   2200, { products: { 'GL ALLOY': 2200 }, submitDate: '25/02/2026', releaseDate: '23/03/2026', pertekDate: '23/03/2026' }),
      cyc('Obtained #2',  100, { products: { 'GL ALLOY':  100 }, submitDate: '06/04/2026', releaseDate: '15/04/2026', spiDate: '15/04/2026' }),
      cyc('Submit #3',   3000, { products: {},                   submitDate: '30/06/2026', releaseDate: '08/07/2026', pertekDate: '08/07/2026' }),
      cyc('Obtained #3',  100, { products: {},                   submitDate: '09/07/2026', releaseDate: '16/07/2026', spiDate: '16/07/2026' }),
    ],
    utilizationByProd: {}, availableByProd: {} },

  /* LCP — Submit #2 total 2.725 tapi rinciannya 3.000 (aturan 1 + 3). */
  { code: 'LCP', obtained: 0, revType: 'complete', products: ['GL ALLOY'],
    cycles: [
      cyc('Submit #1',   6000, { products: { 'GL ALLOY': 6000 }, submitDate: '23/10/2025', releaseDate: '18/11/2025', pertekDate: '18/11/2025' }),
      cyc('Obtained #1',  275, { products: { 'GL ALLOY':  275 }, submitDate: '21/11/2025', releaseDate: '16/12/2025', spiDate: '16/12/2025' }),
      cyc('Submit #2',   2725, { products: { 'GL ALLOY': 3000 }, submitDate: '21/05/2026', releaseDate: '18/06/2026', pertekDate: '18/06/2026' }),
      cyc('Obtained #2',  200, { products: { 'GL ALLOY':  200 }, releaseDate: '16/07/2026', spiDate: '16/07/2026' }),
    ],
    utilizationByProd: {}, availableByProd: {} },

  /* MIN — aturan 4. Obtained #1 600 Wear Plate; revisi minta 246,8 + 353,2
     GI Alloy tapi PERTEK Perubahan BELUM terbit. */
  { code: 'MIN', obtained: 600, revType: 'active', revStatus: 'Menunggu Disposisi Kasi',
    products: ['BORDES ALLOY'],
    cycles: [
      cyc('Submit #1',   6000, { products: { 'BORDES ALLOY': 6000 }, submitDate: '15/10/2025', releaseDate: '29/10/2025', pertekDate: '29/10/2025' }),
      cyc('Obtained #1',  600, { products: { 'BORDES ALLOY':  600 }, submitDate: '30/10/2025', releaseDate: '07/11/2025', spiDate: '07/11/2025' }),
      cyc('Revision Request — BORDES ALLOY', 246.8,
        { products: { 'BORDES ALLOY': 246.8, 'GI ALLOY': 353.2 }, submitDate: '29 Apr 2026', releaseDate: '29/04/2026' }),
    ],
    utilizationByProd: { 'BORDES ALLOY': 246.8 }, availableByProd: { 'BORDES ALLOY': 353.2 } },

  /* RA — aturan 5. Submit #1 800 (tuntas) + Submit #2 Re-Apply 2.200 (berjalan). */
  { code: 'RA', obtained: 800, revType: 'active', products: ['GI ALLOY'],
    cycles: [
      cyc('Submit #1',    800, { products: { 'GI ALLOY':  800 }, submitDate: '10/01/2026', releaseDate: '20/01/2026', pertekDate: '20/01/2026' }),
      cyc('Obtained #1',  800, { products: { 'GI ALLOY':  800 }, submitDate: '21/01/2026', releaseDate: '30/01/2026', spiDate: '30/01/2026' }),
      cyc('Submit #2',   2200, { products: { 'GI ALLOY': 2200 }, submitDate: '01/06/2026', releaseDate: '20/06/2026', pertekDate: '20/06/2026' }),
      cyc('Obtained #2',    0, {}),
    ],
    utilizationByProd: {}, availableByProd: {} },
];
ctx.SPI = SPI; ctx.PENDING = []; ctx.RA = [];
call('SPI = this.SPI; PENDING = this.PENDING; RA = this.RA; PRODUCT_ALIASES = { "GL BORON": "GL ALLOY", "GI BORON": "GI ALLOY" };');
ctx._hdp = SPI[0]; ctx._lcp = SPI[1]; ctx._min = SPI[2]; ctx._ra = SPI[3];

/* ── ATURAN 1 — total cycle adalah master ──────────────────────────────── */
console.log('-- Aturan 1: total cycle adalah master, tanpa double counting --');
const TAK = call('PRODUK_TAK_DIRINCI');
ok(typeof TAK === 'string' && /Missing/i.test(TAK), 'ada ember bernama untuk rincian yang hilang', TAK);

const hdp3 = call('cycleProductsReconciled(this._hdp.cycles[4])');
ok(hdp3[TAK] === 3000 && Object.keys(hdp3).length === 1,
   'HDP Submit #3: rincian kosong -> 3.000 MT ke ember tak-dirinci, nama produk TIDAK ditebak',
   JSON.stringify(hdp3));

const lcp2 = call('cycleProductsReconciled(this._lcp.cycles[2])');
ok(lcp2['GL ALLOY'] === 2725 && Object.keys(lcp2).length === 1,
   'LCP Submit #2: rincian 3.000 dikoreksi ke total cycle 2.725 (aturan 3)',
   JSON.stringify(lcp2));

/* Yang dipakai seluruh dashboard: Σ per-produk HARUS sama dengan kartu. */
const cocokSub = () => {
  const kartu = call('reportSubmittedTotal()').mt;
  const perProd = call('allCompaniesPool()').map((_, i) =>
      Object.values(call(`scopedSubmittedByProd(allCompaniesPool()[${i}])`)).reduce((a, b) => a + b, 0))
    .reduce((a, b) => a + b, 0);
  return { kartu, perProd };
};
let s = cocokSub();
ok(Math.abs(s.kartu - s.perProd) < 0.001,
   `All Time: Σ submitted per-produk = kartu (${s.kartu})`, JSON.stringify(s));

call('PERIOD.active = true; PERIOD.from = new Date(2026,0,1); PERIOD.to = new Date(2026,11,31);');
s = cocokSub();
ok(Math.abs(s.kartu - s.perProd) < 0.001,
   `2026 penuh: Σ submitted per-produk = kartu (${s.kartu})`, JSON.stringify(s));
call('PERIOD.active = false; PERIOD.from = PERIOD.to = null;');

/* Obtained juga: HDP Obtained #3 (100 MT, rincian kosong) tidak boleh hilang. */
const hdpObt = call('scopedObtainedDetailByProd(this._hdp)');
const jmlObt = Object.values(hdpObt).reduce((a, v) => a + v.mt, 0);
ok(Math.abs(jmlObt - call('canonicalObtained(this._hdp)')) < 0.001,
   `HDP: Σ obtained per-produk = canonicalObtained (${jmlObt})`,
   JSON.stringify({ perProd: jmlObt, kanonik: call('canonicalObtained(this._hdp)') }));
ok(hdpObt[TAK] && hdpObt[TAK].mt === 100,
   'HDP Obtained #3 100 MT muncul sebagai tak-dirinci, bukan lenyap',
   JSON.stringify(hdpObt));

/* ── ATURAN 2 & 3 ──────────────────────────────────────────────────────── */
console.log('\n-- Aturan 2 & 3: HDP dan LCP --');
const subHDP = call('scopedSubmittedByProd(this._hdp)');
ok(Object.values(subHDP).reduce((a,b)=>a+b,0) === 11200,
   'HDP Total Submission = 6.000 + 2.200 + 3.000 = 11.200 MT', JSON.stringify(subHDP));
ok(call('canonicalObtained(this._hdp)') === 1000,
   'HDP Total Obtained = 800 + 100 + 100 = 1.000 MT', String(call('canonicalObtained(this._hdp)')));
const subLCP = call('scopedSubmittedByProd(this._lcp)');
ok(subLCP['GL ALLOY'] === 8725,
   'LCP Total Submission = 6.000 + 2.725 = 8.725 MT (BUKAN 9.000)', JSON.stringify(subLCP));
ok(call('canonicalObtained(this._lcp)') === 475, 'LCP Total Obtained = 275 + 200 = 475 MT');

/* ── ATURAN 8 — jangan menebak nama produk ─────────────────────────────── */
console.log('\n-- Aturan 8: Missing Product Breakdown tidak ditebak --');
ok(!Object.keys(hdp3).some(p => /GL ALLOY|GI ALLOY/.test(p)),
   'rincian HDP Submit #3 tidak diisi nama produk mana pun');
const isu = call('submittedBreakdownIssues()');
ok(isu.some(i => i.code === 'HDP' && /Submit #3/.test(i.cycle) && i.kind === 'kosong'),
   'HDP Submit #3 dilaporkan submittedBreakdownIssues() sebagai "kosong"', JSON.stringify(isu));
ok(isu.some(i => i.code === 'LCP' && /Submit #2/.test(i.cycle) && i.kind === 'lebih'),
   'LCP Submit #2 dilaporkan sebagai rincian "lebih" dari total', JSON.stringify(isu));

/* ── ATURAN 4 — revisi belum terbit tidak mengubah apa pun ─────────────── */
console.log('\n-- Aturan 4: revisi menggantikan HANYA setelah PERTEK Perubahan terbit --');
ok(call('canonicalObtained(this._min)') === 600,
   'MIN tetap 600 MT obtained selama revisi berproses', String(call('canonicalObtained(this._min)')));
const minObt = call('scopedObtainedDetailByProd(this._min)');
ok(minObt['BORDES ALLOY'] && minObt['BORDES ALLOY'].mt === 600,
   'MIN: Wear Plate tetap 600 MT — kuota original tidak diganti', JSON.stringify(minObt));
ok(!minObt['GI ALLOY'],
   'MIN: GI Alloy hasil revisi BELUM masuk obtained', JSON.stringify(minObt));
ok(call('revisionRuleIssues()').length === 0,
   'revisionRuleIssues(): tidak ada produk revisi yang bocor', JSON.stringify(call('revisionRuleIssues()')));

/* Setelah PERTEK Perubahan terbit, alokasinya BARU diganti. Di sistem ini
   penggantian itu tercatat di company_product_stats (utilization + available
   per produk), yang memang sudah pasca-revisi di master — bukan lewat MT siklus
   `Obtained (Revision #N)`. canonicalObtained() dan scopedObtainedDetailByProd()
   sama-sama hanya menghitung tipe /^obtained #N/, jadi keduanya tidak mungkin
   berbeda; yang dibaca kolom per-produk adalah getObtainedByProdAgg(). */
call(`this._min.utilizationByProd = {'BORDES ALLOY':246.8,'GI ALLOY':0};
      this._min.availableByProd   = {'BORDES ALLOY':0,'GI ALLOY':353.2};`);
const minSesudah = call('getObtainedByProdAgg(this._min)');
ok(minSesudah['GI ALLOY'] && Math.abs(minSesudah['GI ALLOY'] - 353.2) < 0.01,
   'setelah PERTEK Perubahan terbit: GI Alloy 353,2 MT menggantikan alokasi lama',
   JSON.stringify(minSesudah));
ok(Math.abs(Object.values(minSesudah).reduce((a,b)=>a+b,0) - 600) < 0.01,
   'penggantian, BUKAN penambahan — totalnya tetap 600 MT', JSON.stringify(minSesudah));
call(`this._min.utilizationByProd = {'BORDES ALLOY':246.8};
      this._min.availableByProd   = {'BORDES ALLOY':353.2};`);

/* Kedua jalur obtained harus sepakat tipe siklus mana yang dihitung. */
const k01src = fs.readFileSync(path.join(JS, '01-data.js'), 'utf8');
const k02src = fs.readFileSync(path.join(JS, '02-period-filter.js'), 'utf8');
ok((k01src.match(/\/\^obtained #\/i/g) || []).length >= 2 && /\/\^obtained #\/i/.test(k02src),
   'canonicalObtained dan scopedObtainedDetailByProd memakai gerbang tipe yang sama');

/* ── ATURAN 5 — Re-Apply menambah; AA hanya cycle aktif ────────────────── */
console.log('\n-- Aturan 5: Total Submission kumulatif, Active Applications hanya cycle aktif --');
const subRA = call('scopedSubmittedByProd(this._ra)');
ok(subRA['GI ALLOY'] === 3000,
   'Total Submission RA = 800 + 2.200 = 3.000 MT (kumulatif)', JSON.stringify(subRA));
const ac = call('activeApplicationCycle(this._ra)');
ok(ac && /^submit #2/i.test(ac.type) && ac.mt === 2200,
   'Active Applications RA = Submit #2 · 2.200 MT saja — bukan 3.000',
   JSON.stringify(ac));
ok(call('activeApplicationStage(this._ra)') === 'reapply', 'RA tergolong Re-Apply');
ok(call('activeApplicationCycle(this._lcp)') === null,
   'perusahaan yang seluruh siklusnya tuntas tidak punya cycle aktif');

/* ── ATURAN 6 — obtained yang dikonfirmasi tetap terhitung ─────────────── */
console.log('\n-- Aturan 6: obtained yang dikonfirmasi valid tetap terhitung --');
ok(call('canonicalObtained(this._hdp)') === 1000, 'HDP Obtained #3 100 MT ikut terhitung');
ok(call('canonicalObtained(this._lcp)') === 475,  'LCP Obtained #2 200 MT ikut terhitung');

/* ── Struktur: satu jalur, bukan dua ───────────────────────────────────── */
console.log('\n-- struktur --');
const kode = f => fs.readFileSync(path.join(JS, f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
const k02 = kode('02-period-filter.js'), k19 = kode('19-init.js');
ok(!/getSubmittedByProd/.test(k02.slice(k02.indexOf('function scopedSubmittedByProd'), k02.indexOf('function cycleDates'))),
   'scopedSubmittedByProd tidak lagi bercabang ke getSubmittedByProd (satu aturan, bukan dua)');
ok((k02.match(/cycleProductsReconciled\(/g) || []).length >= 3,
   'rekonsiliasi dipakai jalur submitted DAN obtained');
ok(/activeApplicationCycle/.test(k19), 'modal Active Application memakai activeApplicationCycle()');

console.log(`\n${fail === 0 ? '✔ SEMUA LULUS' : '✖ GAGAL'}  —  lulus ${pass}, gagal ${fail}`);
process.exit(fail ? 1 : 0);
