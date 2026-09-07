/* REALIZATION MONITORING — Σ kolom REALIZED harus sama dengan kartu Realized.
 *
 * Tabel #utilBody dan kartu Realized berdiri di layar yang sama dan mengaku
 * mengukur hal yang sama, tapi dulu memakai basis berbeda begitu ada periode
 * dipilih:
 *
 *   - kolom REALIZED mengambil `realizationByProd` dan `ra.berat` — dua kolom
 *     SEPANJANG WAKTU yang tidak pernah mengenal periode. Pada 07/09/2026 kartu
 *     menunjuk realisasi satu hari sementara tabel menjumlah seumur hidup
 *     company (BBB 975,132 + BTS 1.698,988). Pada Q4 2025 — periode tanpa satu
 *     pun baris realisasi — tabel tetap menampilkan SELURUH 17.685 MT.
 *   - pemilihan barisnya lewat gerbang SIKLUS (filteredRA/filteredSPI),
 *     sedangkan kartu memilih lewat gerbang BARIS REALISASI (pib_date, atau
 *     created_at di mode "Tanggal Input"). Pada 04/09/2026 kartu berisi
 *     BBB/BTS/KJK/LCP/SJH sementara tabel hanya menampilkan AMP.
 *
 * YANG DIKUNCI:
 *
 *   A. Untuk SETIAP periode yang diuji: Σ kolom REALIZED baris induk = kartu.
 *      Ini invarian yang sesungguhnya. Selama pemilihan baris DAN angkanya
 *      sama-sama dari realizedByCompany(), Σ-nya tidak bisa menyimpang.
 *   B. Per company, angka barisnya = realizedByCompany()[code] — bukan hanya
 *      totalnya yang kebetulan cocok.
 *   C. Σ baris produk di dalam satu company = angka baris induknya. Pembagian
 *      per produk tidak boleh menciptakan atau menghilangkan MT.
 *   D. Periode tanpa realisasi memulangkan NOL, bukan total sepanjang waktu.
 *   E. Kolom UTILIZED tidak lagi jatuh ke `d.berat` saat utilisasi periode nol
 *      — cadangan itu dulu menyalakan berat REALISASI di kolom UTILIZED.
 *   F. All Time TIDAK bergeser. Jalur lama sengaja dipertahankan di sana;
 *      kalau angka All Time ikut berubah, perubahannya melebar diam-diam.
 *
 * Run: node iqdash/tests/test_realized_tabel_sama_kartu.cjs
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

/* ── DOM tiruan seadanya: yang dibutuhkan hanya innerHTML #utilBody ───────── */
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

/* Muat berkas persis seperti index.html memuatnya, dengan urutan yang sama.
   Daftarnya DIBACA dari index.html — bukan disalin ke sini — supaya berkas
   baru tidak diam-diam tertinggal dari uji ini. */
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

/* ── Data asli, dimuat seperti loadData() + loadRealizations() ────────────── */
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

/* ── Render #utilBody dan baca kolomnya kembali ───────────────────────────── */
const bersih = s => String(s).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim();
const angka  = s => { const v = parseFloat(bersih(s).replace(/,/g, '')); return isNaN(v) ? 0 : v; };

function bacaTabel() {
  call("utilPhase = 'ALL'; renderUtilTable();");
  const html = nodes['utilBody'].innerHTML;
  const induk = [], anak = [];
  const trRe = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = trRe.exec(html))) {
    const attrs = m[1], isi = m[2], tds = [];
    const tdRe = /<td\b[^>]*>([\s\S]*?)<\/td>/g;
    let t; while ((t = tdRe.exec(isi))) tds.push(t[1]);
    if (tds.length < 6) continue;
    const isSub = /uph-sub-/.test(attrs);
    const code = ((m[0].match(/toggleUtilCo\('([^']+)'\)/) ||
                   attrs.match(/uph-sub-([^"' ]+)/) || [])[1]) || bersih(tds[0]);
    (isSub ? anak : induk).push({
      code, produk: bersih(tds[1]), fase: bersih(tds[2]),
      obtained: angka(tds[3]), util: angka(tds[4]), real: angka(tds[5]),
    });
  }
  return { induk, anak };
}

function setPeriode(from, to, label, mode) {
  ctx.__p = { from, to, label, active: !!(from || to), mode: mode || 'both' };
  call('PERIOD = { from: __p.from, to: __p.to, label: __p.label, active: __p.active };'
     + 'FILTER_MODE = __p.mode;');
}

const dekat = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.005 : tol);

/* Periode yang diuji — termasuk dua yang dilaporkan tim (07/09 "Tanggal Input"
   dan 04/09 "Submit + Release"), satu periode tanpa realisasi sama sekali, dan
   rentang lebar supaya invariannya tidak hanya berlaku di hari-hari sempit. */
const PERIODE = [
  ['07/09/2026 · Tanggal Input',    new Date(2026,8,7,0,0,0), new Date(2026,8,7,23,59,59),   'input'],
  ['04/09/2026 · Submit + Release', new Date(2026,8,4,0,0,0), new Date(2026,8,4,23,59,59),   'both'],
  ['Sep 2026 · Submit + Release',   new Date(2026,8,1),       new Date(2026,8,30,23,59,59),  'both'],
  ['Aug 2026 · Submit + Release',   new Date(2026,7,1),       new Date(2026,7,31,23,59,59),  'both'],
  ['Q1 2026',                       new Date(2026,0,1),       new Date(2026,2,31,23,59,59),  'both'],
  ['Q2 2026',                       new Date(2026,3,1),       new Date(2026,5,30,23,59,59),  'both'],
  ['Q3 2026',                       new Date(2026,6,1),       new Date(2026,8,30,23,59,59),  'both'],
  ['Q4 2025 (tanpa realisasi)',     new Date(2025,9,1),       new Date(2025,11,31,23,59,59), 'both'],
  ['YTD 2026',                      new Date(2026,0,1),       new Date(2026,11,31,23,59,59), 'both'],
  ['YTD 2026 · Tanggal Input',      new Date(2026,0,1),       new Date(2026,11,31,23,59,59), 'input'],
];

console.log('\nA · Σ kolom REALIZED = kartu Realized, di setiap periode');
PERIODE.forEach(([nama, f, t, mode]) => {
  setPeriode(f, t, nama, mode);
  const kartu = call('reportRealizedTotal().mt');
  const { induk } = bacaTabel();
  const sigma = induk.reduce((s, r) => s + r.real, 0);
  ok(dekat(sigma, kartu), nama + ': Σ baris ' + sigma.toFixed(3) + ' = kartu ' + kartu.toFixed(3),
     'selisih ' + (sigma - kartu).toFixed(3) + ' MT');
});

console.log('\nB · Angka per company = realizedByCompany(), bukan kebetulan total cocok');
PERIODE.forEach(([nama, f, t, mode]) => {
  setPeriode(f, t, nama, mode);
  const rbc = JSON.parse(call('JSON.stringify(realizedByCompany())'));
  const { induk } = bacaTabel();
  const salah = [];
  induk.forEach(r => {
    const harus = rbc[String(r.code).toUpperCase()] || 0;
    if (!dekat(r.real, harus)) salah.push(r.code + ' tabel ' + r.real + ' vs ' + harus);
  });
  /* Dan sebaliknya: company yang punya realisasi WAJIB punya barisnya.
     Tanpa arah ini, tabel bisa lulus dengan menyembunyikan baris. */
  const adaBaris = new Set(induk.map(r => String(r.code).toUpperCase()));
  Object.keys(rbc).forEach(c => {
    if (rbc[c] > 0 && !adaBaris.has(c)) salah.push(c + ' punya ' + rbc[c] + ' MT tapi tidak ada barisnya');
  });
  ok(!salah.length, nama + ': ' + induk.length + ' baris cocok satu-satu dengan realizedByCompany()',
     salah.slice(0, 6).join('; '));
});

console.log('\nC · Σ baris produk = baris induknya — pembagian tidak menciptakan MT');
/* Dijumlah per produk BERBEDA, bukan per baris.
 *
 * `ra_records` menyimpan satu baris per GELOMBANG kedatangan, jadi AMP dan SGD
 * punya DUA record dan filteredRA() memulangkan keduanya. Kolam baris memanggil
 * buildFlatRows() untuk masing-masing, sehingga setiap produk mereka terbit dua
 * kali dengan angka yang sama. Itu cacat lama yang berdiri sendiri — bukan yang
 * sedang diperbaiki di sini — dan dulu tak terlihat karena kolom REALIZED baris
 * anak selalu "—". Menjumlah per produk berbeda menguji pembagiannya tanpa
 * ikut menyatakan duplikasinya benar. Lihat bagian H, yang mengukurnya. */
PERIODE.forEach(([nama, f, t, mode]) => {
  setPeriode(f, t, nama, mode);
  const { induk, anak } = bacaTabel();
  const perCo = {};
  anak.forEach(r => {
    perCo[r.code] = perCo[r.code] || {};
    perCo[r.code][r.produk] = r.real;             // produk yang sama → nilai yang sama
  });
  const salah = [];
  induk.forEach(r => {
    if (!perCo[r.code]) return;                   // company satu produk: tanpa baris anak
    const sigma = Object.values(perCo[r.code]).reduce((s, v) => s + v, 0);
    if (!dekat(sigma, r.real, 0.01)) salah.push(r.code + ' Σanak ' + sigma.toFixed(3) + ' vs induk ' + r.real);
  });
  ok(!salah.length, nama + ': ' + Object.keys(perCo).length + ' company ber-produk banyak konsisten',
     salah.slice(0, 6).join('; '));
});

console.log('\nD · Periode tanpa realisasi memulangkan NOL, bukan total sepanjang waktu');
{
  setPeriode(new Date(2025,9,1), new Date(2025,11,31,23,59,59), 'Q4 2025', 'both');
  const { induk } = bacaTabel();
  const sigma = induk.reduce((s, r) => s + r.real, 0);
  ok(call('reportRealizedTotal().mt') === 0, 'Q4 2025 memang periode tanpa satu pun baris realisasi');
  ok(sigma === 0, 'Σ kolom REALIZED = 0 (dulu 17.685,120 — seluruh sejarah)', 'dapat ' + sigma);
  ok(induk.length > 0, 'barisnya tetap tampil (' + induk.length + ' PT) — yang nol angkanya, bukan tabelnya');
}

console.log('\nE · UTILIZED tidak jatuh ke d.berat saat utilisasi periode nol');
{
  /* 07/09/2026 tidak punya utilisasi sama sekali. Dulu kolom UTILIZED tetap
     menampilkan 3.935,176 MT — berat REALISASI yang menyelinap lewat cadangan
     `ubp[prod] || d.berat`, yang justru menyala persis ketika utilisasi = 0. */
  setPeriode(new Date(2026,8,7,0,0,0), new Date(2026,8,7,23,59,59), '07/09/2026', 'input');
  const kartuUtil = call('reportUtilizedTotal().mt');
  const { induk } = bacaTabel();
  const sigmaUtil = induk.reduce((s, r) => s + r.util, 0);
  ok(kartuUtil === 0, 'kartu Utilized 07/09/2026 memang nol');
  ok(sigmaUtil === 0, 'Σ kolom UTILIZED = 0 (dulu 3.935,176 dari cadangan d.berat)', 'dapat ' + sigmaUtil);
  /* Sidik jari cadangan itu: kolom UTILIZED persis menyamai kolom REALIZED. */
  const menyala = induk.filter(r => r.real > 0 && dekat(r.util, r.real));
  ok(!menyala.length, 'tidak ada baris dengan UTILIZED == REALIZED (sidik jari cadangan)',
     menyala.map(r => r.code).join(', '));
}

console.log('\nF · All Time memakai sumber yang sama dengan kartunya');
{
  /* Semula bagian ini menahan angka All Time LAMA (REALIZED 17.685,120,
     UTILIZED 29.046, OBTAINED 38.540) supaya perbaikan periode tidak merembes
     ke sana. Patok itu sudah selesai tugasnya: pemilik data meminta cacat
     SGD + AMP dibereskan juga, jadi All Time memang SENGAJA digeser — dan
     digeser ke angka yang benar. Yang dikunci sekarang bukan lagi 'jangan
     bergerak', melainkan 'harus sama dengan kartunya'. */
  setPeriode(null, null, 'All Time', 'both');
  const { induk } = bacaTabel();
  const sigma = induk.reduce((s, r) => s + r.real, 0);
  const util  = induk.reduce((s, r) => s + r.util, 0);
  const obt   = induk.reduce((s, r) => s + r.obtained, 0);
  const kartu = call('reportRealizedTotal().mt');
  ok(dekat(sigma, kartu, 0.01),
     'Σ REALIZED All Time = kartu Realized (dulu meleset -1.906,714)',
     'Σ ' + sigma.toFixed(3) + ' vs kartu ' + kartu.toFixed(3));
  const kartuUtil = call('reportUtilizedTotal().mt');
  ok(dekat(util, kartuUtil, 0.01),
     'Σ UTILIZED All Time = kartu Utilized (26.046) — lihat bagian I',
     'Σ ' + util.toFixed(3) + ' vs kartu ' + kartuUtil.toFixed(3));
  /* 35.340, bukan 38.540 lama dan bukan 35.040 sesudah SGD+AMP dibereskan:
     −3.500 dari gelombang kembar, lalu +300 karena AADC, KARA dan PPGL yang
     dulu tidak punya baris sama sekali kini punya (obtained 150+100+50). */
  ok(dekat(obt, 35340, 0.01),
     'Σ OBTAINED All Time 35.340 (38.540 −3.500 gelombang kembar +300 AADC/KARA/PPGL)',
     'dapat ' + obt.toFixed(3));
  ok(induk.length === 33,
     'jumlah baris All Time 33 PT (30 + AADC, KARA, PPGL yang dulu lenyap)',
     'dapat ' + induk.length);
}
console.log('\nG · Tidak ada company yang muncul dua kali');
{
  const kasus = [];
  PERIODE.concat([['All Time', null, null, 'both']]).forEach(([nama, f, t, mode]) => {
    setPeriode(f, t, nama, mode);
    const { induk } = bacaTabel();
    const hitung = {};
    induk.forEach(r => { hitung[r.code] = (hitung[r.code] || 0) + 1; });
    Object.keys(hitung).forEach(c => { if (hitung[c] > 1) kasus.push(nama + ': ' + c + ' ×' + hitung[c]); });
  });
  ok(!kasus.length, 'setiap company tepat satu baris induk di semua periode', kasus.join('; '));
}

console.log('\nH · Gelombang kedatangan tidak lagi menggandakan barisnya');
{
  /* Satu akar, dua gejala: `ra_records` adalah satu baris per GELOMBANG
     kedatangan, bukan per perusahaan. AMP dan SGD punya dua record.

       - Kolam baris memanggil buildFlatRows() untuk TIAP record, sehingga
         produk mereka terbit dua kali: AMP tampil '4p' dengan GL ALLOY dan
         PPGL CARBON masing-masing dua kali, UTILIZED 1.600 (sebenarnya 800);
         SGD '4p', UTILIZED 5.000 (sebenarnya 2.500).
       - `raMap[r.code] = r` hanya menyimpan gelombang TERAKHIR, dan jalur All
         Time membaca `ra.berat` dari situ, jadi SGD tampil 488,562 padahal
         dua gelombangnya berjumlah 1.996,098.

     Sekarang kolamnya disatukan per company lewat raTotals(), dan REALIZED
     memakai realizedByCompany() di All Time maupun di dalam periode.

     Diperiksa ke data PIB sebelum diperbaiki: SGD 1.507,536 + 488,562 =
     1.996,098, sama PERSIS dengan realisasi PIB-nya — jadi dua gelombang itu
     nyata dan menjumlahkannya memang benar, bukan menutupi baris kembar. */
  setPeriode(null, null, 'All Time', 'both');
  const { induk } = bacaTabel();
  const cari = c => induk.find(r => r.code === c) || {};
  const rbc = JSON.parse(call('JSON.stringify(realizedByCompany())'));

  ok(cari('SGD').util === 2500 && cari('AMP').util === 800,
     'UTILIZED All Time tidak lagi dobel: SGD 2.500, AMP 800',
     'SGD ' + cari('SGD').util + ', AMP ' + cari('AMP').util);
  ok(cari('SGD').obtained === 2500 && cari('AMP').obtained === 1000,
     'OBTAINED All Time tidak lagi dobel: SGD 2.500, AMP 1.000',
     'SGD ' + cari('SGD').obtained + ', AMP ' + cari('AMP').obtained);
  ok(dekat(cari('SGD').real, rbc['SGD'], 0.01) && dekat(cari('AMP').real, rbc['AMP'], 0.01),
     'REALIZED All Time menjumlah SELURUH gelombang: SGD 1.996,098 · AMP 799,12',
     'SGD ' + cari('SGD').real + ', AMP ' + cari('AMP').real);

  /* Arah yang menahan: jangan sampai penyatuan gelombang justru MENGHAPUS
     company dari tabel, atau memunculkannya dua kali lagi. */
  ['SGD', 'AMP'].forEach(c => {
    const n = induk.filter(r => r.code === c).length;
    ok(n === 1, c + ' tepat satu baris induk — tidak hilang, tidak kembar', 'dapat ' + n);
  });
  const kartu = call('reportRealizedTotal().mt');
  const sigma = induk.reduce((s, r) => s + r.real, 0);
  ok(dekat(kartu - sigma, 0, 0.01),
     'tidak ada lagi selisih All Time yang tersisa',
     'selisih ' + (kartu - sigma).toFixed(3));
}
console.log('\nI · Σ kolom UTILIZED = kartu Utilized, di setiap periode');
/* Pasangan kedua di tabel yang sama, dan cacatnya sekembar dengan REALIZED:
   tabel memilih kolam DAN mengukur utilisasinya sendiri.

     - kolamnya `filteredSPI()` (gerbang siklus), sementara kartu memakai
       utilizationPool(kpiPool()) yang sengaja DILEBARKAN supaya company yang
       memakai kuota di dalam jendela tetap terhitung walau permitnya terbit di
       luar. Q1 2026: AMP 400, LSJ 500, SPP 250, BHG 200, NCT 150 — 1.500 MT
       tanpa satu pun baris.
     - ukurannya jumlah lot `shipments`, padahal sejak 2026-08-04 tanggal
       utilisasi tinggal di `etaByProd`. AADC 150, KARA 100, PPGL 50 lenyap dari
       tabel: ditolak kolam utilisasi karena lotnya kosong, ditolak kolam
       Waiting karena `utilizationMT`-nya > 0.

   Sekarang keduanya memakai utilizationPool(kpiPool()) + scopedUtilTotal() —
   dua fungsi yang persis dijumlah reportUtilizedTotal(). */
const SEMUA = PERIODE.concat([['All Time', null, null, 'both']]);
SEMUA.forEach(([nama, f, t, mode]) => {
  setPeriode(f, t, nama, mode);
  const kartu = call('reportUtilizedTotal().mt');
  const { induk } = bacaTabel();
  const sigma = induk.reduce((s, r) => s + r.util, 0);
  ok(dekat(sigma, kartu, 0.01), nama + ': Σ UTILIZED ' + sigma.toFixed(3) + ' = kartu ' + kartu.toFixed(3),
     'selisih ' + (sigma - kartu).toFixed(3) + ' MT');
});
{
  /* Per company juga — supaya totalnya tidak lulus lewat dua kesalahan yang
     kebetulan saling menutup. */
  const salah = [];
  SEMUA.forEach(([nama, f, t, mode]) => {
    setPeriode(f, t, nama, mode);
    const perKartu = JSON.parse(call('(function(){'
      + ' var pool = PERIOD.active ? utilizationPool(kpiPool()) : allCompaniesPool();'
      + ' var out = {}; pool.forEach(function(co){ var v = scopedUtilTotal(co); if (v) out[co.code] = v; });'
      + ' return JSON.stringify(out); })()'));
    const { induk } = bacaTabel();
    const perTabel = {};
    induk.forEach(r => { perTabel[r.code] = (perTabel[r.code] || 0) + r.util; });
    [...new Set([...Object.keys(perKartu), ...Object.keys(perTabel)])].forEach(c => {
      if (!dekat(perKartu[c] || 0, perTabel[c] || 0, 0.01))
        salah.push(nama + '/' + c + ': kartu ' + (perKartu[c] || 0) + ' vs tabel ' + (perTabel[c] || 0));
    });
  });
  ok(!salah.length, 'per company juga cocok, di ' + SEMUA.length + ' periode', salah.slice(0, 8).join('; '));
}
{
  /* Tiga company yang paling mudah hilang lagi: utilisasinya hanya hidup di
     utilizationByProd (master), lotnya kosong. KARA persis yang disebut
     companiesWithLotsInPeriod() waktu kartunya sendiri pernah kehilangan mereka. */
  setPeriode(null, null, 'All Time', 'both');
  const { induk } = bacaTabel();
  [['AADC', 150], ['KARA', 100], ['PPGL', 50]].forEach(([c, mt]) => {
    const r = induk.find(x => x.code === c);
    ok(r && dekat(r.util, mt, 0.01),
       c + ' punya barisnya, UTILIZED ' + mt + ' (dulu tidak ada barisnya sama sekali)',
       r ? 'util ' + r.util : 'tidak ada baris');
  });
}
{
  /* Company yang siklusnya di luar jendela tapi kuotanya dipakai di dalamnya —
     yang dilebarkan utilizationPool(). Tanpa itu Q1 kehilangan 1.500 MT. */
  setPeriode(new Date(2026,0,1), new Date(2026,2,31,23,59,59), 'Q1 2026', 'both');
  const { induk } = bacaTabel();
  const diSPI = call('filteredSPI().map(function(c){return c.code;})');
  [['AMP', 400], ['LSJ', 500], ['SPP', 250], ['BHG', 200], ['NCT', 150]].forEach(([c, mt]) => {
    const r = induk.find(x => x.code === c);
    ok(r && dekat(r.util, mt, 0.01) && diSPI.indexOf(c) === -1,
       'Q1: ' + c + ' di luar filteredSPI tapi tetap berbaris, UTILIZED ' + mt,
       r ? 'util ' + r.util + ' · diFilteredSPI=' + (diSPI.indexOf(c) !== -1) : 'tidak ada baris');
  });
}
{
  /* Pagar arah sebaliknya: pelebaran itu tidak boleh menyeret masuk company
     yang utilisasi DAN realisasi periodenya nol — kalau ya, tabel akan penuh
     baris kosong yang tidak menjelaskan apa pun. */
  const kosong = [];
  SEMUA.forEach(([nama, f, t, mode]) => {
    setPeriode(f, t, nama, mode);
    /* Hanya company yang MASUK lewat pelebaran itu yang diperiksa. Company yang
       memang lolos gerbang siklus boleh saja berbaris dengan util dan real nol
       — permitnya terbit di jendela ini, barangnya belum jalan; itu keadaan
       nyata, bukan baris kosong. Yang tidak boleh: pelebaran menyeret masuk
       company yang tidak menyumbang apa pun. */
    const diSiklus = new Set([].concat(
      call('filteredSPI().map(function(c){return c.code;})'),
      call('filteredRA().map(function(c){return c.code;})')));
    bacaTabel().induk.forEach(r => {
      if (diSiklus.has(r.code)) return;
      if (r.util === 0 && r.real === 0) kosong.push(nama + '/' + r.code);
    });
  });
  ok(!kosong.length, 'pelebaran kolam tidak menambah satu pun baris tanpa util maupun real',
     kosong.slice(0, 8).join('; '));
}


console.log('\n' + pass + ' pass · ' + fail + ' fail');
process.exit(fail ? 1 : 0);
