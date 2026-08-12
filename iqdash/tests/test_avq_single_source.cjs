/* Available Quota: SATU kolam, SATU rincian, SATU angka.
 *
 * Latar (laporan tim Sales, 2026-08-11): dengan filter periode yang SAMA PERSIS
 * (01 Jan – 30 Jun 2026) halaman Overview memberi tiga angka "Available":
 *
 *     kartu AVAILABLE QUOTA        11.058 MT · tertulis "18 companies"
 *     modal "↗ detail" kartu itu   12.780 MT · 7 companies
 *     tab Available Quota -> Table ±13.000 MT (dijumlah manual)
 *
 * Subset 7 company lebih BESAR daripada set yang mengaku 18 — mustahil, dan
 * itulah yang membuat angka ini tidak bisa dikutip ke BOD.
 *
 * Tesnya dua lapis:
 *   NILAI    — Σ availableQuotaRows() harus PERSIS reportAvailableTotal().mt,
 *              dan jumlah company uniknya persis .companies, di All Time
 *              maupun di periode. Ini yang menangkap "tiga angka" itu.
 *   STRUKTUR — tidak ada permukaan yang boleh menyusun kolam/rincian AVQ
 *              sendiri lagi. Tes nilai saja tidak cukup: salinan baru selalu
 *              lahir dari "kpiPool().forEach + jumlahkan sendiri", dan tanpa
 *              filter periode setiap salinan runtuh ke angka yang sama —
 *              persis kenapa bug ini bertahan lama.
 *
 * Run: node iqdash/tests/test_avq_single_source.cjs
 */
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const JS = path.join(__dirname, '..', 'assets', 'js');

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) { pass++; console.log('  ok   ' + msg); }
  else { fail++; console.log('FAIL   ' + msg + (extra ? `\n         ${extra}` : '')); }
};
/* Saldo dibandingkan dengan toleransi pecahan — pembagian proporsional per
   produk memakai float, dan yang diuji adalah "tidak ada MT yang hilang",
   bukan kesamaan bit. */
const near = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 1e-6 : eps);

/* ── Muat 01-data.js + 02-period-filter.js dalam SATU konteks ────────────
   Keduanya classic script yang saling memanggil lewat global (browser). Kalau
   di-require terpisah, 02 tidak akan melihat canonicalObtained() milik 01 dan
   yang teruji cuma stub buatan tes ini — bukan kodenya. */
const ctx = vm.createContext({ console, Date, Math, JSON, Number, String, Object, Array, Set, Map, isNaN, parseFloat, parseInt });
['01-data.js', '02-period-filter.js'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
});
const G = k => vm.runInContext(k, ctx);
const call = expr => vm.runInContext(expr, ctx);

/* ── FIXTURE ──────────────────────────────────────────────────────────────
   Dibuat khusus untuk memicu ketiga penyimpangan yang dilaporkan:

     BTS  — multi-produk, sebagian terpakai. Kasus normal.
     IKM  — satu produk HABIS terpakai (saldo 0) berdampingan dengan produk
            yang masih bersisa. Menguji: produk bersaldo 0 tidak menghapus
            company-nya, dan tidak menggeser total.
     ADP  — saldo NOL seluruhnya. Tidak boleh muncul di mana pun (2026-08-10).
     SNSD — PENDING (bukan SPI) dan PERTEK-nya terbit 04/08/2026, SESUDAH H1.
            Kartu mengecualikannya dari H1; modal/tabel yang memakai
            canonicalObtained all-time dulu MEMASUKKANNYA. Inilah selisih yang
            membuat "subset" lebih besar dari "induknya".
     GNG  — stats per produk kosong (kuota baru terbit, master belum di-refresh).
            Menguji jalur cadangan cumulativeAvailByProd().
   ───────────────────────────────────────────────────────────────────────── */
const cyc = (type, mt, opts) => Object.assign({ type, mt, products: {} }, opts || {});

const FIXTURE = {
  SPI: [
    { code: 'BTS', group: 'CD',
      cycles: [ cyc('Submit #1', 5000, { submitDate: '10/01/2026', releaseDate: '20/02/2026' }),
                cyc('Obtained #1', 5000, { submitDate: '25/02/2026', releaseDate: '05/03/2026',
                                           products: { 'SHEETPILE': 3000, 'AS STEEL': 2000 } }) ],
      utilizationMT: 1200,
      utilizationByProd: { 'SHEETPILE': 1000, 'AS STEEL': 200 },
      availableByProd:   { 'SHEETPILE': 2000, 'AS STEEL': 1800 },
      products: ['SHEETPILE', 'AS STEEL'] },

    { code: 'IKM', group: 'CD',
      cycles: [ cyc('Submit #1', 3000, { submitDate: '05/02/2026', releaseDate: '01/03/2026' }),
                cyc('Obtained #1', 3000, { submitDate: '10/03/2026', releaseDate: '15/03/2026',
                                           products: { 'GI BORON': 2000, 'SEAMLESS PIPE': 1000 } }) ],
      utilizationMT: 1000,
      utilizationByProd: { 'GI BORON': 0, 'SEAMLESS PIPE': 1000 },   // SEAMLESS habis
      availableByProd:   { 'GI BORON': 2000, 'SEAMLESS PIPE': 0 },
      products: ['GI BORON', 'SEAMLESS PIPE'] },

    { code: 'ADP', group: 'ATL',
      cycles: [ cyc('Submit #1', 350, { submitDate: '03/01/2026', releaseDate: '20/01/2026' }),
                cyc('Obtained #1', 350, { submitDate: '25/01/2026', releaseDate: '01/02/2026',
                                          products: { 'BORDES ALLOY': 350 } }) ],
      utilizationMT: 350,                                            // habis total
      utilizationByProd: { 'BORDES ALLOY': 350 },
      availableByProd:   { 'BORDES ALLOY': 0 },
      products: ['BORDES ALLOY'] },

    { code: 'GNG', group: 'CD',
      cycles: [ cyc('Submit #1', 600, { submitDate: '02/05/2026', releaseDate: '20/05/2026' }),
                cyc('Obtained #1', 600, { submitDate: '25/05/2026', releaseDate: '01/06/2026',
                                          products: { 'GL BORON': 600 } }) ],
      utilizationMT: 0,
      utilizationByProd: {},          // stats belum ada sama sekali
      availableByProd:   {},
      products: ['GL BORON'] },
  ],
  PENDING: [
    { code: 'SNSD', group: 'CD',
      cycles: [ cyc('Submit #1', 120, { submitDate: '17/06/2026', releaseDate: '04/08/2026' }),
                cyc('Obtained #1', 120, { submitDate: '05/08/2026', releaseDate: '10/08/2026',
                                          products: { 'HOLLOW PIPE': 120 } }) ],
      utilizationMT: 0,
      utilizationByProd: {},
      availableByProd:   { 'HOLLOW PIPE': 120 },
      products: ['HOLLOW PIPE'] },
  ],
};

ctx.SPI     = FIXTURE.SPI;
ctx.PENDING = FIXTURE.PENDING;
ctx.RA      = [];
vm.runInContext('SPI = this.SPI; PENDING = this.PENDING; RA = this.RA;', ctx);

const setP = (f, t) => {
  const lokal = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const P = G('PERIOD');
  P.from = lokal(f);
  P.to   = t ? new Date(lokal(t).getFullYear(), lokal(t).getMonth(), lokal(t).getDate(), 23, 59, 59) : null;
  P.active = !!(f || t);
};

/* ══ 1. NILAI — rincian selalu berjumlah persis angka kartunya ══════════ */
const rekonsiliasi = label => {
  const rows  = call('availableQuotaRows()');
  const kartu = call('reportAvailableTotal()');
  const sigma = rows.reduce((s, r) => s + r.avq, 0);
  const cos   = new Set(rows.map(r => r.code));

  ok(near(sigma, kartu.mt),
     `${label}: Σ baris = angka kartu`,
     `kartu ${kartu.mt}  ·  Σ baris ${sigma}  ·  selisih ${(sigma - kartu.mt).toFixed(6)}`);
  ok(cos.size === kartu.companies,
     `${label}: jumlah company di rincian = jumlah company di kartu`,
     `kartu ${kartu.companies} company  ·  rincian ${cos.size} (${[...cos].join(', ')})`);
  return { rows, kartu, cos };
};

console.log('-- All Time --');
setP(null, null);
const at = rekonsiliasi('All Time');
ok(!at.cos.has('ADP'), 'All Time: ADP (saldo 0) tidak terdaftar');
ok(at.cos.has('SNSD'), 'All Time: SNSD (PENDING) ikut terdaftar');
ok(near(at.kartu.mt, 3800 + 2000 + 600 + 120),
   'All Time: total = 6.520 MT (BTS 3.800 + IKM 2.000 + GNG 600 + SNSD 120)',
   `dapat ${at.kartu.mt}`);

console.log('\n-- H1 2026 (01 Jan – 30 Jun) — periode yang dilaporkan tim --');
setP('2026-01-01', '2026-06-30');
const h1 = rekonsiliasi('H1 2026');
/* Inti laporan tim: SNSD PERTEK-nya baru terbit 04/08/2026. Kartu tidak pernah
   menghitungnya di H1; modal & tabel dulu menghitungnya karena memakai
   canonicalObtained ALL-TIME tanpa gerbang "terbit s/d akhir periode". Selisih
   itulah yang membuat modal lebih besar dari kartunya. */
ok(!h1.cos.has('SNSD'),
   'H1: SNSD TIDAK ikut — PERTEK-nya terbit 04/08, sesudah jendela  <-- inti laporan',
   `company di rincian: ${[...h1.cos].join(', ')}`);
ok(h1.kartu.mt < at.kartu.mt, 'H1: total H1 < total All Time (SNSD keluar)');
ok(near(h1.kartu.mt, 6400), 'H1: total = 6.400 MT', `dapat ${h1.kartu.mt}`);

console.log('\n-- Produk bersaldo nol tidak menggeser total --');
setP(null, null);
const seamless = call('availableQuotaRows()').filter(r => r.code === 'IKM' && r.product === 'SEAMLESS PIPE');
ok(seamless.length === 1, 'IKM: produk yang habis tetap punya baris (obtained/utilized tetap terbaca)');
ok(seamless.length === 1 && near(seamless[0].avq, 0), 'IKM: saldo produk yang habis = 0');
ok(seamless.length === 1 && near(seamless[0].utilMT, 1000), 'IKM: utilisasi produk yang habis tetap 1.000 MT');

console.log('\n-- Baris per company berjumlah persis saldo company itu --');
setP(null, null);
['BTS', 'IKM', 'GNG', 'SNSD'].forEach(code => {
  const co = [...FIXTURE.SPI, ...FIXTURE.PENDING].find(c => c.code === code);
  ctx._co = co;
  const saldo = call('cumulativeAvailable(this._co)');
  const perProd = call('cumulativeAvailByProd(this._co)');
  const sigma = Object.values(perProd).reduce((s, v) => s + v, 0);
  ok(near(sigma, saldo), `${code}: Σ per produk = saldo company`, `saldo ${saldo} · Σ ${sigma}`);
});

console.log('\n-- GNG: stats per produk kosong, saldo tetap tidak hilang --');
ctx._gng = FIXTURE.SPI.find(c => c.code === 'GNG');
const gngProd = call('cumulativeAvailByProd(this._gng)');
ok(near(Object.values(gngProd).reduce((s, v) => s + v, 0), 600),
   'GNG: 600 MT tetap muncul walau utilizationByProd/availableByProd kosong',
   `dapat ${JSON.stringify(gngProd)}`);

console.log('\n-- Identitas Obtained − Utilized = Available pada TOTAL rincian --');
/* Kalau ini pecah, header modal yang berbunyi "Obtained − Utilized" berbohong —
   persis keluhan tim: rumusnya tertulis tapi angkanya tidak menuruti. */
setP(null, null);
const semua = call('availableQuotaRows()');
const tObt  = semua.reduce((s, r) => s + r.obtained, 0);
const tUtil = semua.reduce((s, r) => s + r.utilMT,   0);
const tAvq  = semua.reduce((s, r) => s + r.avq,      0);
ok(near(tObt - tUtil, tAvq),
   'Σ Obtained − Σ Utilized = Σ Available',
   `${tObt} − ${tUtil} = ${tObt - tUtil}, sedangkan Available ${tAvq}`);

/* ══ 2. STRUKTUR — tidak ada salinan baru ═══════════════════════════════ */
console.log('\n-- Tidak ada permukaan yang menyusun rincian AVQ sendiri --');
const kode = f => fs.readFileSync(path.join(JS, f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const PERMUKAAN = ['03-kpis.js', '04-charts.js', '19-init.js', '14-export.js'];

/* Nama fungsi yang membangun permukaan Available Quota. Diperiksa per-fungsi,
   bukan per-berkas: 03-kpis.js dan 19-init.js juga memuat permukaan LAIN yang
   sah memanggil scopedAvailByProd (drawer, tabel utama, OU chart). */
const AVQ_FN = [
  ['03-kpis.js', 'refreshAvqDrill'],
  ['04-charts.js', 'buildAvailableQuota'],
  ['19-init.js', 'buildAvqTable'],
  ['19-init.js', 'buildAvqProdGrid'],
  ['19-init.js', 'buildAvqProdChart'],
  ['19-init.js', 'openProdCoPopup'],
];

/* Potong badan fungsi dengan menghitung kurung kurawal. */
function badan(src, nama) {
  const m = new RegExp('function\\s+' + nama + '\\s*\\([^)]*\\)\\s*\\{').exec(src);
  if (!m) return null;
  let i = m.index + m[0].length, depth = 1;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return src.slice(m.index, i);
}

AVQ_FN.forEach(([f, fn]) => {
  const b = badan(kode(f), fn);
  ok(b != null, `${f}: ${fn}() ditemukan`);
  if (!b) return;
  ok(/availableQuotaRows\s*\(/.test(b), `${fn}() merender dari availableQuotaRows()`);
  ok(!/scopedAvailByProd\s*\(/.test(b), `${fn}() tidak memakai scopedAvailByProd() — saldo periode ≠ saldo kumulatif`);
  ok(!/\bkpiPool\s*\(/.test(b),         `${fn}() tidak menyusun kolamnya sendiri lewat kpiPool()`);
  ok(!/\bfilteredSPI\s*\(/.test(b),     `${fn}() tidak memakai filteredSPI() — kolam itu membuang PENDING`);
  ok(!/\bavailableByProd\b/.test(b),    `${fn}() tidak membaca availableByProd mentah — kolom stats yang bisa basi`);
});

console.log('\n-- Gerbang periode berlaku juga di luar halaman AVQ --');
/* Ditemukan saat audit dashboard live 2026-08-12: memfilter "2025 saja"
   membuat kolom Available tabel All Companies menjumlah 5.633 MT sementara
   kartu menyebut 853 — company yang kuotanya baru terbit di 2026 tetap
   memamerkan saldo penuhnya di jendela 2025. Saldo tidak bisa ada sebelum
   kuota yang melahirkannya (aturan 2026-08-05); gerbang itu kini dipakai
   permukaan mana pun yang mencetak angka berlabel Available. */
setP('2026-01-01', '2026-06-30');
ctx._snsd = FIXTURE.PENDING[0];
ok(near(call('availableInPeriod(this._snsd)'), 0),
   'H1: SNSD (PERTEK 04/08) -> 0 lewat availableInPeriod()',
   `dapat ${call('availableInPeriod(this._snsd)')}`);
ok(near(call('cumulativeAvailable(this._snsd)'), 120),
   'H1: saldo sepanjang waktunya TETAP 120 — yang digate cuma tampilan periodenya');
setP(null, null);
ok(near(call('availableInPeriod(this._snsd)'), 120),
   'All Time: SNSD kembali 120');

/* Σ availableInPeriod atas SELURUH company harus sama dengan angka kartu, di
   periode mana pun. Inilah yang menjamin tabel All Companies (yang mendaftar
   semua company) tidak bisa berbeda dari kartu. */
[['All Time', null, null], ['H1 2026', '2026-01-01', '2026-06-30'],
 ['Q1 2026', '2026-01-01', '2026-03-31'], ['2025 saja', '2025-01-01', '2025-12-31'],
 ['Q4 2026', '2026-10-01', '2026-12-31']].forEach(([label, f, t]) => {
  setP(f, t);
  const codes = call('availablePoolCodes()');
  ctx._all = [...FIXTURE.SPI, ...FIXTURE.PENDING];
  const sigma = call('this._all.reduce((s,co) => s + availableInPeriod(co), 0)');
  const kartu = call('reportAvailableTotal()');
  ok(near(sigma, kartu.mt),
     `${label}: Σ availableInPeriod(semua company) = angka kartu`,
     `kartu ${kartu.mt} · Σ ${sigma}`);
  ok(codes.size === kartu.companies,
     `${label}: jumlah kode di kolam = jumlah company kartu`);
});
setP(null, null);

console.log('\n-- Permukaan NON-AVQ tidak boleh membaca kolom saldo mentah --');
/* Keempat berkas ini bukan halaman Available Quota, jadi tidak perlu memakai
   availableQuotaRows(). Tapi saldonya wajib dari helper kanonik, bukan dari
   `co.availableByProd` / `co.availableQuota` (kolom company_product_stats yang
   TIDAK ikut diperbarui saat utilisasi bertambah — kasus ADP 2026-08-10) dan
   bukan pula turunan sendiri dari obtained − utilisasi periode.

   18-sales-priority.js yang paling berbahaya: di sana sisa MEN-GATE apakah
   sebuah produk muncul sebagai peluang jual, jadi kolom basi berarti Sales
   ditawari kuota yang sudah habis. */
const NON_AVQ = [
  ['07-tables-main.js',    'renderMain'],
  ['17-ou-chart.js',       'buildOUData'],
  ['18-sales-priority.js', 'buildSalesPriorityData'],
  ['18-sales-priority.js', 'buildExcludedList'],
];
NON_AVQ.forEach(([f, fn]) => {
  const b = badan(kode(f), fn);
  if (b == null) { ok(false, `${f}: ${fn}() ditemukan`); return; }
  ok(true, `${f}: ${fn}() ditemukan`);
  ok(/cumulativeAvail(able|ByProd|ForProd)\s*\(/.test(b),
     `${fn}() memakai helper saldo kanonik`);
  ok(!/\bavailableByProd\b/.test(b),
     `${fn}() tidak membaca co.availableByProd mentah`);
  ok(!/scopedAvailByProd\s*\(/.test(b),
     `${fn}() tidak memakai scopedAvailByProd() — saldo periode ≠ saldo kumulatif`);
});

/* Drawer: potongannya bukan fungsi bernama, jadi diperiksa di tingkat berkas. */
const drawer = kode('08-drawer.js');
ok(/cumulativeAvailable\s*\(/.test(drawer),
   '08-drawer.js: Available Quota ditampilkan lewat cumulativeAvailable()');
ok(!/fmtMt\(\s*co\.availableQuota\s*\)/.test(drawer),
   '08-drawer.js: tidak lagi mencetak co.availableQuota mentah');

console.log('\n-- cumulativeAvailForProd: pencarian tahan beda ejaan produk --');
setP(null, null);
ctx._bts = FIXTURE.SPI.find(c => c.code === 'BTS');
ok(near(call('cumulativeAvailForProd(this._bts, "SHEETPILE")'), 2000),
   'produk yang ada di peta ditemukan');
ok(near(call('cumulativeAvailForProd(this._bts, "PRODUK TIDAK ADA")'), 0),
   'produk asing -> 0, bukan NaN/undefined');
/* Cadangan tanpa stats harus dibagi ke SELURUH co.products, bukan cuma yang
   pertama: pemanggil yang menyusuri getObtainedByProd() akan mendapat 0 untuk
   produk kedua, dan di Sales Priority 0 berarti produknya hilang dari daftar. */
ctx._nostats = { code: 'XX', cycles: [], products: ['A', 'B'],
                 utilizationMT: 0, utilizationByProd: {}, availableByProd: {},
                 _forceAvail: true };
ctx._nostats.cycles = [
  { type: 'Submit #1', mt: 400, products: {}, submitDate: '01/02/2026', releaseDate: '01/03/2026' },
  { type: 'Obtained #1', mt: 400, products: {}, submitDate: '05/03/2026', releaseDate: '10/03/2026' },
];
const nsMap = call('cumulativeAvailByProd(this._nostats)');
ok(Object.keys(nsMap).length === 2, 'tanpa stats: saldo dibagi ke SEMUA co.products',
   `dapat ${JSON.stringify(nsMap)}`);
ok(near(Object.values(nsMap).reduce((s, v) => s + v, 0), call('cumulativeAvailable(this._nostats)')),
   'tanpa stats: Σ pembagian tetap = saldo company');

console.log('\n-- Jalur KOSONG tidak boleh meninggalkan render periode sebelumnya --');
/* Ditemukan di dashboard live 2026-08-12, Q4 2026: chart menulis "No company
   still holds an available balance" sementara badge di sebelahnya MASIH
   memampang 11.178 MT dari periode sebelumnya. Bukan salah hitung — render
   tertinggal, karena badge diperbarui SESUDAH `if (rows.length===0) return`.
   Dua pernyataan bertentangan, berdampingan, di satu kartu yang sama. */
const chartsSrc = kode('04-charts.js');
const bAvq = badan(chartsSrc, 'buildAvailableQuota');
ok(bAvq != null, '04-charts.js: buildAvailableQuota() ditemukan');
if (bAvq) {
  const iKosong = bAvq.search(/rows\.length\s*===\s*0/);
  const iBadge  = bAvq.search(/setBadge\s*\(/);
  ok(iBadge !== -1 && iKosong !== -1 && iBadge < iKosong,
     'badge ditulis SEBELUM cabang kosong keluar lebih awal',
     `posisi setBadge ${iBadge} vs cabang kosong ${iKosong}`);
  const cabang = bAvq.slice(iKosong, iKosong + 400);
  ok(/setBadge\s*\(\s*0\s*\)/.test(cabang),
     'cabang kosong menulis badge 0, bukan membiarkan angka lama');
}

/* Baris PENDING di tabel All Companies dulu SELALU dicetak "—" berapa pun
   saldonya, sehingga SNSD tampil Obtained 120 MT tapi Available strip. */
const mainSrc = kode('07-tables-main.js');
ok(!/isPending\s*\)\s*return\s*'<span[^>]*>—/.test(mainSrc),
   '07-tables-main.js: baris PENDING tidak lagi otomatis "—" tanpa melihat saldo');
ok(/isPending\s*&&\s*!\(\s*avq\s*>\s*0\s*\)/.test(mainSrc),
   '07-tables-main.js: strip hanya untuk PENDING yang memang bersaldo nol');

console.log('\n-- Kolam & rincian hanya terdefinisi di 02-period-filter.js --');
['availablePool', 'cumulativeAvailByProd', 'availableQuotaRows'].forEach(h => {
  ok(new RegExp('function\\s+' + h + '\\s*\\(').test(kode('02-period-filter.js')),
     `${h}() terdefinisi di 02-period-filter.js`);
  const lain = PERMUKAAN.filter(f => new RegExp('function\\s+' + h + '\\s*\\(').test(kode(f)));
  ok(lain.length === 0, `${h}() tidak didefinisi ulang di permukaan mana pun` +
     (lain.length ? ` (ditemukan di ${lain.join(', ')})` : ''));
});

console.log('\n-- Kartu Overview: nilai & jumlah company dari panggilan yang SAMA --');
/* Bug aslinya: nilai dari reportAvailableTotal().mt, jumlah company dari
   obtCoSet.size (milik kartu Obtained). "11.058 MT · 18 companies" — dua
   populasi berbeda dalam satu kartu. */
const kpis = kode('03-kpis.js');
const blokAvq = kpis.slice(kpis.indexOf('kpiAvqVal') - 700, kpis.indexOf('kpiAvqTag') + 200);
ok(!/kpiAvqUnit[\s\S]{0,200}?obtCoSet/.test(blokAvq),
   'unit kartu Available tidak lagi memakai obtCoSet (jumlah company kartu Obtained)');
ok(/reportAvailableTotal\s*\(\)/.test(blokAvq) && /\.companies/.test(blokAvq),
   'unit kartu Available memakai reportAvailableTotal().companies');

console.log(`\n${fail === 0 ? '✔ SEMUA LULUS' : '✖ GAGAL'}  —  lulus ${pass}, gagal ${fail}`);
process.exit(fail ? 1 : 0);
