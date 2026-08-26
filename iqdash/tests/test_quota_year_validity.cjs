/* VALIDITY DATE · SPI ACTIVE/INACTIVE · PEMISAHAN TAHUN KUOTA 2026 vs 2027
 *
 * Yang dikunci di sini adalah tiga janji yang gampang rusak diam-diam:
 *
 *   A. Validity Date = 31 Desember dari tahun SPI Terbit yang berlaku.
 *      Contoh acuan tim (PT GAS): SPI awal terbit 09/01/2026 dan SPI Perubahan
 *      terbit 27/04/2026 — KEDUANYA Validity 31/12/2026.
 *
 *   B. "Perubahan" TIDAK otomatis berarti "penggantian".
 *      · Revisi  (perpindahan produk) → SPI lama jadi Inactive walau Validity
 *                 belum lewat. Ini permintaan eksplisit tim.
 *      · Re-Apply (Obtained #2/#3 dengan MT nyata) → SPI lama TETAP Active,
 *                 karena kuotanya bertambah, bukan digantikan (aturan master
 *                 #2). Kalau uji ini jebol, Obtained ADP akan terpotong dari
 *                 350 jadi 100 dan seluruh rekonsiliasi ikut melenceng.
 *
 *   C. Kuota 2026 dan 2027 tidak pernah bercampur, dan menyalakan fitur tahun
 *      TIDAK mengubah satu angka pun pada data yang ada sekarang (semuanya
 *      belum bertahun → tahun bawaan 2026).
 *
 * Run: node iqdash/tests/test_quota_year_validity.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const JS = path.join(__dirname, '..', 'assets', 'js');
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean,
  MT_LOCALE: 'en-US',
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { getElementById: () => null, querySelectorAll: () => [] },
});
['01-data.js', '01a-quota-year.js', '02-period-filter.js', '04-charts.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }));
const call = e => vm.runInContext(e, ctx);
const set  = (name, v) => { ctx.__tmp = v; vm.runInContext(`${name} = __tmp;`, ctx); };

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };
const cyc = (type, mt, o) => Object.assign({ type, mt, products: {} }, o || {});

/* ── Fixture ────────────────────────────────────────────────────────────────
   GAS = bentuk yang tim pakai sebagai contoh (perpindahan produk).
   ADP = Re-Apply: dua SPI, keduanya memberi kuota, tidak saling menggantikan.
   NEXT = company yang punya siklus 2026 DAN 2027 sekaligus — satu-satunya cara
          membuktikan pengirisan benar-benar memisahkan, bukan cuma menyaring
          company. */
const FIX = [
  { code: 'GAS', section: 'SPI', group: 'AB', products: ['GI ALLOY'],
    obtained: 200, spiNo: '04.PI-05.26.0328', pertekNo: '1080/ILMATE',
    utilizationByProd: { 'GI ALLOY': 200 }, availableByProd: { 'GI ALLOY': 0 },
    cycles: [
      cyc('Submit #1', 6000, { products: { 'BORDES ALLOY': 6000 }, submitDate: '27/10/2025', releaseType: 'PERTEK', releaseDate: '11/11/2025', pertekDate: '11/11/2025' }),
      cyc('Obtained #1', 200, { products: { 'BORDES ALLOY': 200 }, submitDate: '22/12/2025', releaseType: 'SPI', releaseDate: '09/01/2026', spiDate: '09/01/2026' }),
      cyc('Obtained #2', 0, { products: { 'GI BORON': 200 }, releaseType: 'SPI Perubahan', releaseDate: '27/04/2026', spiDate: '27/04/2026', _fromRevReq: true,
        status: 'SPI Perubahan TERBIT — No. 04.PI-05.26.0328.1 · 27/04/2026' }),
    ] },

  { code: 'ADP', section: 'SPI', group: 'CD', products: ['GL ALLOY'],
    obtained: 350, spiNo: 'SPI-ADP-2', pertekNo: 'PTK-ADP-2',
    utilizationByProd: { 'GL ALLOY': 300 }, availableByProd: { 'GL ALLOY': 50 },
    cycles: [
      cyc('Submit #1', 6000, { products: { 'GL BORON': 6000 }, releaseType: 'PERTEK', releaseDate: '14/11/2025', pertekDate: '14/11/2025' }),
      cyc('Obtained #1', 250, { products: { 'GL BORON': 250 }, releaseType: 'SPI', releaseDate: '16/12/2025', spiDate: '16/12/2025' }),
      cyc('Submit #2', 2750, { products: { 'GL BORON': 2750 }, releaseType: 'PERTEK', releaseDate: '06/07/2026', pertekDate: '06/07/2026' }),
      cyc('Obtained #2', 100, { products: { 'GL BORON': 350 }, releaseType: 'SPI Perubahan', releaseDate: '14/07/2026', spiDate: '14/07/2026' }),
    ] },

  { code: 'NEXT', section: 'SPI', group: 'EF', products: ['GL ALLOY'],
    obtained: 0, spiNo: '', pertekNo: '',
    utilizationByProd: {}, availableByProd: {},
    statsYearByProd: {},
    cycles: [
      cyc('Submit #1', 1000, { products: { 'GL ALLOY': 1000 }, releaseType: 'PERTEK', releaseDate: '02/02/2026', pertekDate: '02/02/2026', quotaYear: 2026 }),
      cyc('Obtained #1', 400, { products: { 'GL ALLOY': 400 }, releaseType: 'SPI', releaseDate: '01/03/2026', spiDate: '01/03/2026', quotaYear: 2026 }),
      cyc('Submit #1', 2000, { products: { 'GL ALLOY': 2000 }, releaseType: 'PERTEK', releaseDate: '10/11/2026', pertekDate: '10/11/2026', quotaYear: 2027 }),
      cyc('Obtained #1', 900, { products: { 'GL ALLOY': 900 }, releaseType: 'SPI', releaseDate: '05/01/2027', spiDate: '05/01/2027', quotaYear: 2027 }),
    ] },
];

/* Ejaan ledger vs ejaan kanonik hidup berdampingan di data ini: siklus
   menyimpan "GI BORON"/"GL BORON" sementara company_product_stats sudah
   "GI ALLOY"/"GL ALLOY". Tanpa peta alias, pemeriksaan "produk ini masih
   dipegang?" akan selalu meleset dan SEMUA SPI terbaca Inactive. */
set('PRODUCT_ALIASES', { 'GI BORON': 'GI ALLOY', 'GL BORON': 'GL ALLOY', 'SHEETPILE': 'SHEET PILE' });

set('SPI_ALL', FIX);
set('PENDING_ALL', []);
set('RA_ALL', []);
set('REALIZATIONS_ALL', []);

/* ── A. Validity Date ─────────────────────────────────────────────────────── */
console.log('\nA · Validity Date = 31 Des tahun SPI Terbit');
ok(call(`spiValidityDate('09/01/2026')`) === '31/12/2026', 'SPI awal 09/01/2026 → 31/12/2026');
ok(call(`spiValidityDate('27/04/2026')`) === '31/12/2026', 'SPI Perubahan 27/04/2026 → 31/12/2026 (sama, seperti contoh PT GAS)');
ok(call(`spiValidityDate('05/01/2027')`) === '31/12/2027', 'SPI 05/01/2027 → 31/12/2027 — tidak ikut tahun kuota, ikut tahun terbitnya');
ok(call(`spiValidityDate('TBA')`) === '', 'SPI belum terbit → Validity kosong, bukan tanggal karangan');
ok(call(`spiValidityDate('')`) === '', 'tanggal kosong → Validity kosong');
ok(call(`validityExpired('31/12/2020')`) === true,  '31/12/2020 sudah lewat');
ok(call(`validityExpired('')`) === false, 'tanggal kosong bukan berarti expired');

/* REGRESI YANG SUDAH PERNAH TERJADI SEKALI di implementasi pertama:
   Validity sempat diturunkan dari TAHUN TANGGAL TERBIT, bukan tahun kuota.
   15 dari 40 company memegang SPI yang terbit pada 2025 untuk kuota 2026
   (ADP 16/12/2025, HKG 31/12/2025, EMS 07/11/2025, …). Aturan lama menyatakan
   kelimabelasnya kedaluwarsa dan mencabut kuotanya dari Available Quota. */
ok(call(`spiValidityDate('16/12/2025', 2026)`) === '31/12/2026',
  'SPI terbit 16/12/2025 untuk kuota 2026 → Validity 31/12/2026, BUKAN 31/12/2025',
  call(`spiValidityDate('16/12/2025', 2026)`));
ok(call(`validityExpired(spiValidityDate('16/12/2025', 2026))`) === false,
  '…dan karena itu tidak terbaca kedaluwarsa hari ini');
ok(call(`spiValidityDate('10/11/2026', 2027)`) === '31/12/2027',
  'SPI kuota 2027 yang terbit lebih awal (10/11/2026) → Validity 31/12/2027');

/* ── B. Active / Inactive ─────────────────────────────────────────────────── */
console.log('\nB · Active / Inactive');
call(`QUOTA_YEAR = 2026; applyQuotaYearSlice();`);
const gasRows = call(`JSON.stringify(spiTerbitRows().filter(r => r.code === 'GAS'))`);
const gas = JSON.parse(gasRows);
ok(gas.length === 2, `PT GAS menghasilkan 2 baris SPI (dapat ${gas.length})`, gasRows);
const gasLama = gas.find(r => r.product === 'BORDES ALLOY');
const gasBaru = gas.find(r => r.product === 'GI BORON');
ok(!!gasLama && gasLama.status === 'inactive',
  'SPI lama BORDES ALLOY → ⚪ Inactive walau Validity 31/12/2026 belum lewat', gasLama && gasLama.status);
ok(!!gasBaru && gasBaru.status === 'active',
  'SPI baru GI BORON → 🟢 Active', gasBaru && gasBaru.status);
ok(!!gasLama && gasLama.validityDate === '31/12/2026', 'baris Inactive tetap membawa Validity-nya sendiri (data historis)');
ok(!!gasBaru && gasBaru.validityDate === '31/12/2026', 'baris Active Validity 31/12/2026');
ok(!!gasBaru && gasBaru.spiNo === '04.PI-05.26.0328.1',
  'No. SPI Perubahan diambil dari status siklusnya, bukan dari kolom company', gasBaru && gasBaru.spiNo);
ok(!!gasLama && gasLama.spiNo === '',
  'baris historis TIDAK mengulang nomor SPI terbaru — lebih baik kosong daripada nomor yang salah');

const adp = JSON.parse(call(`JSON.stringify(spiTerbitRows().filter(r => r.code === 'ADP'))`));
ok(adp.length === 2, `ADP menghasilkan 2 baris SPI (dapat ${adp.length})`);
ok(adp.every(r => r.status === 'active'),
  'Re-Apply: KEDUA SPI ADP tetap Active — kuota bertambah, tidak digantikan (aturan master #2)',
  adp.map(r => r.spiDate + '=' + r.status).join(', '));

/* Kolom PERTEK diambil dari siklus Submit pasangannya, bukan dari baris SPI. */
const adpBaru = adp.find(r => r.spiDate === '14/07/2026');
ok(!!adpBaru && adpBaru.pertekDate === '06/07/2026',
  'PERTEK Date baris Obtained #2 diambil dari Submit #2 (06/07/2026)', adpBaru && adpBaru.pertekDate);
ok(!!adpBaru && adpBaru.submitMT === 2750,
  'Submit (MT) diambil dari siklus Submit pasangannya', adpBaru && String(adpBaru.submitMT));

/* ── C. Pemisahan tahun ───────────────────────────────────────────────────── */
console.log('\nC · Pemisahan kuota 2026 vs 2027');
call(`QUOTA_YEAR = 2026; applyQuotaYearSlice();`);
ok(call(`SPI.length`) === 3, 'tahun 2026: ketiga company tampil');
ok(call(`SPI.find(c=>c.code==='GAS') === SPI_ALL.find(c=>c.code==='GAS')`) === true,
  'company yang seluruh siklusnya satu tahun dipulangkan APA ADANYA (bukan salinan) — mutasi di tempat tetap terlihat');
ok(call(`SPI.find(c=>c.code==='NEXT').cycles.length`) === 2, 'NEXT: hanya 2 siklus 2026 yang tampil');
ok(call(`canonicalObtained(SPI.find(c=>c.code==='NEXT'))`) === 400,
  'NEXT obtained 2026 = 400 — siklus 2027 tidak ikut dijumlah',
  String(call(`canonicalObtained(SPI.find(c=>c.code==='NEXT'))`)));

call(`QUOTA_YEAR = 2027; applyQuotaYearSlice();`);
ok(call(`SPI.length`) === 1, 'tahun 2027: hanya company yang punya siklus 2027 yang tampil');
ok(call(`SPI[0].code`) === 'NEXT', 'company itu NEXT');
ok(call(`canonicalObtained(SPI[0])`) === 900,
  'NEXT obtained 2027 = 900 — bukan 1.300 (400+900)', String(call(`canonicalObtained(SPI[0])`)));
const rows27 = JSON.parse(call(`JSON.stringify(spiTerbitRows())`));
ok(rows27.length === 1 && rows27[0].validityDate === '31/12/2027',
  'tabel SPI Terbit 2027 hanya memuat SPI 2027, Validity 31/12/2027',
  JSON.stringify(rows27.map(r => r.code + '/' + r.validityDate)));

/* Siklus tahun lain WAJIB ikut dikirim saat menyimpan — kalau tidak, PATCH
   /cycles akan menghapusnya dari sheet. Ini kehilangan data yang paling sunyi
   di seluruh fitur ini, jadi dikunci uji. */
ok(call(`allCyclesForSave(SPI[0]).length`) === 4,
  'allCyclesForSave() memulangkan SELURUH 4 siklus NEXT, bukan hanya 2 milik 2027',
  String(call(`allCyclesForSave(SPI[0]).length`)));
ok(call(`allCyclesForSave(SPI[0]).filter(c => cycleQuotaYear(c) === 2026).length`) === 2,
  'dua di antaranya milik 2026 dan ikut terkirim utuh');

/* ── D. Data yang ada sekarang tidak berubah ──────────────────────────────── */
console.log('\nD · Data tanpa tahun tetap 2026 dan angkanya tidak bergeser');
call(`QUOTA_YEAR = 2026; applyQuotaYearSlice();`);
ok(call(`cycleQuotaYear({type:'Obtained #1'})`) === 2026, 'siklus tanpa quotaYear → 2026');
ok(call(`SPI.find(c=>c.code==='ADP').obtained`) === 350,
  'ADP obtained tetap 350 (250 + 100) sesudah pengirisan menyala',
  String(call(`SPI.find(c=>c.code==='ADP').obtained`)));
ok(call(`sliceCompanyToYear({code:'X', cycles:[]}, 2026) !== null`) === true,
  'company TANPA siklus tetap tampil di tahun bawaan — tidak raib dari semua tahun');
ok(call(`sliceCompanyToYear({code:'X', cycles:[]}, 2027) === null`) === true,
  '…dan tidak muncul di tahun lain');

/* ── E. Uji ulang di atas payload SUNGGUHAN ───────────────────────────────── */
console.log('\nE · Payload nyata (cache/iqdash_data.json)');
const cachePath = path.join(__dirname, '..', '..', 'cache', 'iqdash_data.json');
if (!fs.existsSync(cachePath)) {
  console.log('  skip  cache payload tidak ada — bagian ini dilewati');
} else {
  const real = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const sebelumObt = {};
  [...real.spi, ...real.pending].forEach(co => { sebelumObt[co.code] = co.obtained; });

  set('PRODUCT_ALIASES', real.productAliases || {});
  set('SPI_ALL', real.spi);
  set('PENDING_ALL', real.pending);
  set('RA_ALL', real.ra || []);
  set('REALIZATIONS_ALL', []);
  call(`QUOTA_YEAR = 2026; applyQuotaYearSlice();`);

  ok(call(`SPI.length`) === real.spi.length,
    `seluruh ${real.spi.length} company SPI tetap tampil di 2026`, String(call(`SPI.length`)));
  ok(call(`PENDING.length`) === real.pending.length,
    `seluruh ${real.pending.length} company PENDING tetap tampil`);

  const geser = JSON.parse(call(`JSON.stringify([...SPI, ...PENDING].map(c => [c.code, c.obtained]))`))
    .filter(([code, o]) => Math.abs((Number(o) || 0) - (Number(sebelumObt[code]) || 0)) > 0.001);
  ok(geser.length === 0, 'tidak ada satu pun obtained yang bergeser gara-gara pengirisan tahun',
    JSON.stringify(geser));

  call(`QUOTA_YEAR = 2027; applyQuotaYearSlice();`);
  ok(call(`SPI.length`) === 0 && call(`PENDING.length`) === 0,
    '2027 kosong — belum ada satu pun baris yang ditandai 2027',
    `SPI=${call('SPI.length')} PENDING=${call('PENDING.length')}`);
  ok(call(`spiTerbitRows().length`) === 0, 'tabel SPI Terbit 2027 kosong, bukan menampilkan data 2026');

  /* Bukti bahwa Available Quota memang hanya mengikuti SPI yang Active. */
  call(`QUOTA_YEAR = 2026; applyQuotaYearSlice();`);
  const peta = JSON.parse(call(`JSON.stringify(activeValidityByProduct())`));
  ok(Object.keys(peta).length > 0, `peta Validity per (company, produk) terisi — ${Object.keys(peta).length} pasangan`);
  ok(Object.values(peta).every(v => /^31\/12\/\d{4}$/.test(v.validityDate)),
    'setiap Validity Date berbentuk 31/12/YYYY');
  const gasKey = Object.keys(peta).filter(k => k.startsWith('GAS|'));
  ok(gasKey.length === 1 && !gasKey[0].includes('BORDES'),
    'GAS hanya punya SATU produk ber-SPI aktif, dan itu bukan BORDES ALLOY yang sudah dipindah',
    gasKey.join(','));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
