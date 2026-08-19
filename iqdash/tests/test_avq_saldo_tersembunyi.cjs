/* Saldo yang disembunyikan syarat "aktif di periode" harus DINYATAKAN, bukan
 * hilang diam-diam.
 *
 * Latar (laporan tim, 2026-08-18): dengan filter Maret 2026, kartu By Product
 * di halaman Available Quota tidak menampilkan GL ALLOY maupun HRPO ALLOY sama
 * sekali. Keduanya nyata — pemegangnya masih punya saldo dan kuotanya sudah
 * terbit jauh sebelum Maret — tapi tidak ada satu pun tanggal cycle mereka yang
 * jatuh di bulan itu, jadi mereka gugur di syarat #1 kolam AVQ (aktif di
 * periode).
 *
 * Yang membuat ini mahal: Available adalah SALDO (stock), sedangkan syarat #1
 * adalah saringan AKTIVITAS. Satu produk bisa berkedip hilang-muncul antar
 * bulan tanpa saldonya bergeser sepeser pun — GL ALLOY tampil di Feb, lenyap di
 * Mar, muncul lagi di Apr. Bagi tim Sales "tidak ada kartunya" terbaca "tidak
 * ada yang bisa dijual".
 *
 * Yang diuji:
 *   1. Definisi headline TIDAK berubah — availablePool() & reportAvailableTotal()
 *      persis seperti sebelumnya (ini yang menjaga angka master H1).
 *   2. availableHiddenByActivity() menangkap PERSIS company yang gugur karena
 *      syarat aktivitas saja, bukan karena kuotanya belum terbit (kasus SNSD).
 *   3. Sigma per produk pada saldo tersembunyi = total MT-nya (satu pintu:
 *      cumulativeAvailByProd, sama dengan availableQuotaRows).
 *   4. Tanpa filter periode, tidak ada yang tersembunyi.
 *
 * Run: node iqdash/tests/test_avq_saldo_tersembunyi.cjs
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
const near = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 1e-6 : eps);

const ctx = vm.createContext({ console, Date, Math, JSON, Number, String, Object, Array, Set, Map, isNaN, parseFloat, parseInt });
['01-data.js', '02-period-filter.js'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
});
const G    = k => vm.runInContext(k, ctx);
const call = e => vm.runInContext(e, ctx);

/* ── FIXTURE ──────────────────────────────────────────────────────────────
   Dibentuk mengikuti bentuk data asli yang dilaporkan:

     BTS  — Obtained #1 SPI 04/03/2026. Satu-satunya yang aktif di Maret.
     GNG  — Obtained #1 SPI 07/11/2025, saldo 200 MT GL ALLOY masih ada.
            Aktivitas berikutnya baru Apr 2026. Di Maret: TIDAK ADA.
            -> inilah GL ALLOY yang hilang.
     MJU  — Obtained #1 SPI 05/01/2026, saldo 200 MT HRPO ALLOY masih ada.
            Aktivitas berikutnya Mei 2026. Di Maret: TIDAK ADA.
            -> inilah HRPO ALLOY yang hilang.
     ADP  — saldo habis. Tidak boleh muncul di mana pun, termasuk di daftar
            tersembunyi (yang diuji adalah saldo, bukan sekadar ketidakaktifan).
     SNSD — PERTEK baru terbit 04/08/2026. Di Maret kuotanya BELUM ADA, jadi
            bukan "tersembunyi" melainkan memang belum lahir. Syarat kausal
            harus tetap menggugurkannya.
   ───────────────────────────────────────────────────────────────────────── */
const cyc = (type, mt, opts) => Object.assign({ type, mt, products: {} }, opts || {});

const FIXTURE = {
  SPI: [
    { code: 'BTS', group: 'CD',
      cycles: [ cyc('Submit #1',   6000, { submitDate: '26/11/2025', releaseDate: '25/02/2026' }),
                cyc('Obtained #1', 1800, { submitDate: '26/02/2026', releaseDate: '04/03/2026',
                                           products: { 'SHEET PILE': 900, 'AS STEEL': 900 } }) ],
      utilizationMT: 195,
      utilizationByProd: { 'SHEET PILE': 0, 'AS STEEL': 195 },
      availableByProd:   { 'SHEET PILE': 900, 'AS STEEL': 705 },
      products: ['SHEET PILE', 'AS STEEL'] },

    { code: 'GNG', group: 'CD',
      cycles: [ cyc('Submit #1',   6000, { submitDate: '14/10/2025', releaseDate: '29/10/2025' }),
                cyc('Obtained #1',  600, { submitDate: '30/10/2025', releaseDate: '07/11/2025',
                                           products: { 'GL ALLOY': 600 } }),
                cyc('Submit #2',   2750, { submitDate: '25/02/2026', releaseDate: '17/04/2026' }) ],
      utilizationMT: 400,
      utilizationByProd: { 'GL ALLOY': 400 },
      availableByProd:   { 'GL ALLOY': 200 },
      products: ['GL ALLOY'] },

    { code: 'MJU', group: 'AB',
      cycles: [ cyc('Submit #1',   6000, { submitDate: '17/11/2025', releaseDate: '03/12/2025' }),
                cyc('Obtained #1',  200, { submitDate: '09/12/2025', releaseDate: '05/01/2026',
                                           products: { 'HRPO ALLOY': 200 } }),
                cyc('Revision #2',    0, { submitDate: '11/05/2026', releaseDate: '30/06/2026' }) ],
      utilizationMT: 0,
      utilizationByProd: { 'HRPO ALLOY': 0 },
      availableByProd:   { 'HRPO ALLOY': 200 },
      products: ['HRPO ALLOY'] },

    { code: 'ADP', group: 'ATL',
      cycles: [ cyc('Submit #1',   350, { submitDate: '03/01/2026', releaseDate: '20/01/2026' }),
                cyc('Obtained #1', 350, { submitDate: '25/01/2026', releaseDate: '01/02/2026',
                                          products: { 'BORDES ALLOY': 350 } }) ],
      utilizationMT: 350,
      utilizationByProd: { 'BORDES ALLOY': 350 },
      availableByProd:   { 'BORDES ALLOY': 0 },
      products: ['BORDES ALLOY'] },
  ],
  PENDING: [
    { code: 'SNSD', group: 'CD',
      cycles: [ cyc('Submit #1',   120, { submitDate: '17/06/2026', releaseDate: '04/08/2026' }),
                cyc('Obtained #1', 120, { submitDate: '05/08/2026', releaseDate: '10/08/2026',
                                          products: { 'HOLLOW PIPE': 120 } }) ],
      utilizationMT: 0,
      utilizationByProd: {},
      availableByProd:   { 'HOLLOW PIPE': 120 },
      products: ['HOLLOW PIPE'] },
  ],
};

ctx.SPI = FIXTURE.SPI; ctx.PENDING = FIXTURE.PENDING; ctx.RA = [];
vm.runInContext('SPI = this.SPI; PENDING = this.PENDING; RA = this.RA;', ctx);

const setP = (f, t) => {
  const lokal = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const P = G('PERIOD');
  P.from  = lokal(f);
  P.to    = t ? new Date(lokal(t).getFullYear(), lokal(t).getMonth(), lokal(t).getDate(), 23, 59, 59) : null;
  P.label = f ? `${f} s/d ${t}` : 'All Time';
  P.active = !!(f || t);
};

/* == 1. All Time: tidak ada yang tersembunyi ============================== */
console.log('-- All Time --');
setP(null, null);
const atKartu = call('reportAvailableTotal()');
const atHid   = call('availableHiddenByActivity()');
ok(near(atKartu.mt, 1605 + 200 + 200 + 120),
   'All Time: kartu = 2.125 MT (BTS 1.605 + GNG 200 + MJU 200 + SNSD 120)', `dapat ${atKartu.mt}`);
ok(atHid.mt === 0 && atHid.companies.length === 0,
   'All Time: tidak ada saldo tersembunyi — tanpa jendela tidak ada yang bisa gugur',
   JSON.stringify(atHid));
ok(near(call('availablePoolAsOfPeriod().reduce((s,c)=>s+cumulativeAvailable(c),0)'), atKartu.mt),
   'All Time: kolam as-of = kolam biasa');

/* == 2. MARET 2026 — inti laporan ======================================== */
console.log('\n-- Maret 2026 (01-31 Mar) — inti laporan tim --');
setP('2026-03-01', '2026-03-31');

const marKartu = call('reportAvailableTotal()');
const marPool  = call('availablePool().map(c => c.code)');
ok(marPool.join(',') === 'BTS', 'Mar: kolam headline tetap BTS saja — definisi tidak digeser', marPool.join(','));
ok(near(marKartu.mt, 1605), 'Mar: kartu tetap 1.605 MT (tidak berubah oleh perbaikan ini)', `dapat ${marKartu.mt}`);

const hid = call('availableHiddenByActivity()');
ok(hid.companies.slice().sort().join(',') === 'GNG,MJU',
   'Mar: yang tersembunyi PERSIS GNG & MJU  <-- inti laporan',
   `dapat ${hid.companies.join(',')}`);
ok(!hid.companies.includes('SNSD'),
   'Mar: SNSD TIDAK terhitung tersembunyi — kuotanya baru terbit 04/08, belum lahir di Maret',
   `dapat ${hid.companies.join(',')}`);
ok(!hid.companies.includes('ADP'),
   'Mar: ADP TIDAK terhitung tersembunyi — saldonya memang nol',
   `dapat ${hid.companies.join(',')}`);
ok(near(hid.mt, 400), 'Mar: total tersembunyi = 400 MT', `dapat ${hid.mt}`);

const prods = Object.keys(hid.byProduct).sort();
ok(prods.join(',') === 'GL ALLOY,HRPO ALLOY',
   'Mar: produk tersembunyi = GL ALLOY + HRPO ALLOY  <-- persis dua yang dilaporkan hilang',
   prods.join(','));
ok(near(hid.byProduct['GL ALLOY'].avail, 200) && hid.byProduct['GL ALLOY'].cos.join(',') === 'GNG',
   'Mar: GL ALLOY 200 MT di GNG', JSON.stringify(hid.byProduct['GL ALLOY']));
ok(near(hid.byProduct['HRPO ALLOY'].avail, 200) && hid.byProduct['HRPO ALLOY'].cos.join(',') === 'MJU',
   'Mar: HRPO ALLOY 200 MT di MJU', JSON.stringify(hid.byProduct['HRPO ALLOY']));

const sigma = Object.values(hid.byProduct).reduce((s, d) => s + d.avail, 0);
ok(near(sigma, hid.mt), 'Mar: Sigma per produk = total tersembunyi — satu pintu, tidak ada MT yang menguap',
   `Sigma ${sigma} · total ${hid.mt}`);

/* == 3. Berkedip antar bulan — sebab yang sebenarnya ===================== */
console.log('\n-- Februari vs Maret: saldo yang sama, kartu yang berbeda --');
setP('2026-02-01', '2026-02-28');
const febPool = call('availablePool().map(c => c.code)');
ok(febPool.includes('GNG'),
   'Feb: GNG TAMPIL (Submit #2 MOI 25/02 masuk jendela) — saldo yang sama, 200 MT',
   febPool.join(','));
setP('2026-03-01', '2026-03-31');
ok(!call('availablePool().map(c => c.code)').includes('GNG'),
   'Mar: GNG LENYAP walau saldonya tidak berubah — inilah kedipannya');
ok(call('availableHiddenByActivity().companies').includes('GNG'),
   'Mar: dan sekarang kedipan itu tercatat, bukan hilang diam-diam');

/* == 4. Syarat kausal tetap berlaku ====================================== */
console.log('\n-- Agustus 2026: SNSD lahir, jadi bukan lagi "tersembunyi" --');
setP('2026-08-01', '2026-08-31');
ok(call('availablePool().map(c => c.code)').includes('SNSD'),
   'Aug: SNSD masuk kolam headline — PERTEK 04/08 di dalam jendela');
ok(!call('availableHiddenByActivity().companies').includes('SNSD'),
   'Aug: SNSD tidak dihitung dua kali sebagai tersembunyi');

console.log(`\n${pass} ok · ${fail} fail`);
process.exit(fail ? 1 : 0);
