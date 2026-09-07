/* FILTER PERIODE — jenis tanggal "Tanggal Input".
 *
 * Tim menginput 21 baris realisasi pada 07-Sep-2026, menyetel periode ke hari
 * itu, dan dashboard memulangkan 0. Bukan kerusakan: ketiga jenis tanggal yang
 * ada semuanya tentang tanggal SIKLUS, sedangkan baris realisasi disaring lewat
 * pib_date — dan PIB baris-baris itu 04-Sep-2026. Tidak ada satu pun jenis
 * tanggal yang bisa menjawab "apa yang saya input HARI INI".
 *
 * YANG DIKUNCI:
 *
 *   A. Mode "input" memakai created_at pada baris realisasi.
 *   B. Mode lain TETAP memakai pib_date — perilaku lama tidak boleh bergeser.
 *      Ini yang menahan: kalau gerbangnya salah pindah, seluruh angka Realized
 *      historis berubah diam-diam.
 *   C. Cap waktu penuh ("2026-09-07T03:33:59.801Z") harus terbaca. pDate()
 *      sendiri memulangkan null untuk bentuk ini — itulah sebabnya _tglRekam()
 *      ada, dan itulah cara bug ini paling mudah kembali.
 *   D. Company disaring lewat updatedAt di mode "input", bukan lewat siklus.
 *   E. Baris tanpa cap waktu gugur — bukan ikut lolos diam-diam.
 *
 * Run: node iqdash/tests/test_filter_tanggal_input.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

const buatEl = () => ({ innerHTML: '', textContent: '', value: '', style: {},
  classList: { add(){}, remove(){}, contains: () => false }, appendChild(){},
  querySelectorAll: () => [], querySelector: () => null, setAttribute(){}, addEventListener(){},
  getContext: () => ({}) });
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean, MT_LOCALE: 'en-US',
  localStorage: { getItem: () => null, setItem: () => {} },
  Chart: function () { return { destroy() {} }; },
  document: { getElementById: buatEl, querySelectorAll: () => [], querySelector: () => null,
    createElement: buatEl, addEventListener: () => {}, body: { appendChild(){} } },
});
ctx.window = ctx; ctx.globalThis = ctx;
['00-num.js', '01-data.js', '01a-quota-year.js', '02-period-filter.js']
  .forEach(f => { try { vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }); }
                  catch (e) { console.log('  (lewati ' + f + ': ' + e.message.slice(0, 60) + ')'); } });
const set = (nama, v) => { ctx.__t = v; vm.runInContext(`${nama} = __t;`, ctx); };
const jalan = (ekspr, arg) => { ctx.__a = arg; return vm.runInContext(ekspr, ctx); };

/* Periode = 7 September 2026, sehari penuh — persis seperti yang disetel tim. */
const hariIni = () => set('PERIOD', {
  from: new Date(2026, 8, 7, 0, 0, 0),
  to:   new Date(2026, 8, 7, 23, 59, 59),
  label: '07 Sep 2026 – 07 Sep 2026', active: true,
});

/* Baris realisasi: DIINPUT 7 Sep, tapi PIB-nya 4 Sep. */
const baris = { company_code: 'BBB', volume: '15.67',
                pib_date: '04/09/2026', created_at: '2026-09-07T03:33:59.801Z' };

console.log('\nA · Mode "input" memakai created_at');
{
  hariIni(); set('FILTER_MODE', 'input');
  ok(jalan('realisasiDalamPeriode(__a)', baris) === true,
    'baris yang diinput 7 Sep MASUK, walau PIB-nya 4 Sep');
}

console.log('\nB · Mode lain tetap memakai pib_date — perilaku lama utuh');
{
  ['both', 'submit', 'release'].forEach(m => {
    hariIni(); set('FILTER_MODE', m);
    ok(jalan('realisasiDalamPeriode(__a)', baris) === false,
      `mode "${m}": baris ber-PIB 4 Sep TIDAK masuk periode 7 Sep`);
  });
  /* Dan sebaliknya: pada periode 4 Sep, mode lama justru harus menerimanya. */
  set('PERIOD', { from: new Date(2026,8,4,0,0,0), to: new Date(2026,8,4,23,59,59), label:'4 Sep', active: true });
  set('FILTER_MODE', 'both');
  ok(jalan('realisasiDalamPeriode(__a)', baris) === true,
    'mode "both": baris yang sama MASUK pada periode 4 Sep (tanggal PIB-nya)');
}

console.log('\nC · Cap waktu penuh terbaca — pDate() sendiri tidak bisa');
{
  ok(jalan('pDate("2026-09-07T03:33:59.801Z")') === null,
    'pDate() memang memulangkan null untuk cap waktu penuh — sebab _tglRekam() ada');
  const d = jalan('_tglRekam("2026-09-07T03:33:59.801Z")');
  ok(d instanceof Date && !isNaN(d) && d.getFullYear() === 2026 && d.getMonth() === 8,
    '_tglRekam() mengurainya jadi 7 September 2026 waktu lokal', String(d));
  ok(jalan('_tglRekam("04/09/2026")') instanceof Date,
    '_tglRekam() masih menerima bentuk DD/MM/YYYY lewat pDate()');
}

console.log('\nD · Company disaring lewat updatedAt, bukan siklus');
{
  const co = (updatedAt) => ({ code: 'X', updatedAt, cycles: [
    { type: 'Submit #1', mt: 100, products: {}, pertekDate: '01/01/2026', releaseDate: '01/01/2026', spiDate: '' },
  ]});
  hariIni(); set('FILTER_MODE', 'input');
  ok(jalan('companyInPeriod(__a.cycles, __a)', co('2026-09-07T02:00:00.000Z')) === true,
    'company yang diubah 7 Sep MASUK, walau siklusnya bertanggal Januari');
  ok(jalan('companyInPeriod(__a.cycles, __a)', co('2026-09-04T02:00:00.000Z')) === false,
    'company yang diubah 4 Sep TIDAK masuk periode 7 Sep');
  set('FILTER_MODE', 'both');
  ok(jalan('companyInPeriod(__a.cycles, __a)', co('2026-09-07T02:00:00.000Z')) === false,
    'mode "both" tetap melihat SIKLUS — updatedAt 7 Sep tidak membuatnya masuk');
}

console.log('\nE · Tanpa cap waktu, barisnya gugur — bukan lolos diam-diam');
{
  hariIni(); set('FILTER_MODE', 'input');
  ok(jalan('realisasiDalamPeriode(__a)', { company_code: 'X', volume: '1', pib_date: '04/09/2026' }) === false,
    'baris realisasi tanpa created_at tidak ikut terhitung');
  ok(jalan('companyInPeriod(__a.cycles, __a)', { code: 'X', cycles: [] }) === false,
    'company tanpa updatedAt tidak ikut terhitung');
  ok(jalan('realisasiDalamPeriode(__a)', baris) === true,
    'sanity: yang bercap waktu tetap masuk');
}

console.log('\nF · Tanpa periode aktif, semuanya lolos di mode mana pun');
{
  set('PERIOD', { from: null, to: null, label: 'All Time', active: false });
  ['both', 'submit', 'release', 'input'].forEach(m => {
    set('FILTER_MODE', m);
    ok(jalan('realisasiDalamPeriode(__a)', { company_code: 'X' }) === true,
      `mode "${m}": All Time tidak menyaring apa pun`);
  });
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
