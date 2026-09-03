/* coLabel() — label company yang DITAMPILKAN, bukan kunci penghubungnya.
 *
 * Tim mengganti nama AMP menjadi "AMP / SUJU" lewat companies.full_name, tapi
 * seluruh kolom COMPANY di dashboard mencetak kode 3 huruf, jadi perubahannya
 * tidak terlihat di mana pun kecuali satu dropdown. Dilaporkan dua kali.
 *
 * YANG DIKUNCI:
 *
 *   A. full_name yang merupakan PELABELAN ULANG kode ("AMP / SUJU" diawali
 *      "AMP") dipakai sebagai label.
 *
 *   B. full_name yang merupakan NAMA PERUSAHAAN ("Angkasa Artha Dinamika
 *      Cemerlang") TIDAK dipakai — kalau dipakai, ke-41 kolom COMPANY berubah
 *      jadi nama panjang dan tabelnya jebol. Ini syarat yang menahan perubahan
 *      supaya tetap sebesar yang diminta, jadi ia yang paling perlu dikunci.
 *
 *   C. Kode tetap dikembalikan apa adanya untuk company tanpa full_name,
 *      company yang tidak dikenal, dan masukan kosong — kolomnya tidak boleh
 *      berubah jadi blank.
 *
 *   D. Company di PENDING ikut terbaca, bukan cuma SPI.
 *
 * Run: node iqdash/tests/test_co_label.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

const buatEl = () => ({ innerHTML: '', textContent: '', value: '', style: {},
  classList: { add(){}, remove(){} }, appendChild(){}, querySelectorAll: () => [],
  querySelector: () => null, setAttribute(){}, addEventListener(){}, getContext: () => ({}) });
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean, MT_LOCALE: 'en-US',
  localStorage: { getItem: () => null, setItem: () => {} },
  fetch: () => Promise.reject(new Error('offline')),
  document: { getElementById: buatEl, querySelectorAll: () => [], querySelector: () => null,
    createElement: buatEl, addEventListener: () => {}, body: { appendChild(){} } },
});
ctx.window = ctx; ctx.globalThis = ctx;
vm.runInContext(fs.readFileSync(path.join(JS, '01-data.js'), 'utf8'), ctx, { filename: '01-data.js' });

const set = (nama, v) => { ctx.__tmp = v; vm.runInContext(`${nama} = __tmp;`, ctx); };
const label = c => { ctx.__c = c; return vm.runInContext('coLabel(__c)', ctx); };

set('SPI', [
  { code: 'AMP',  fullName: 'AMP / SUJU' },
  { code: 'AADC', fullName: 'Angkasa Artha Dinamika Cemerlang' },
  { code: 'BDG',  fullName: 'Bhineka Dwi Guna' },
  { code: 'XYZ',  fullName: '' },
]);
set('PENDING', [{ code: 'PND', fullName: 'PND (Grup Baru)' }]);

console.log('\nA · full_name yang melabeli ulang kodenya dipakai');
ok(label('AMP') === 'AMP / SUJU', 'AMP -> "AMP / SUJU"', label('AMP'));
ok(label('PND') === 'PND (Grup Baru)', 'company di PENDING ikut terbaca', label('PND'));

console.log('\nB · nama perusahaan TIDAK menggantikan kode');
ok(label('AADC') === 'AADC', 'AADC tetap "AADC", bukan nama panjangnya', label('AADC'));
ok(label('BDG') === 'BDG', 'BDG tetap "BDG"', label('BDG'));

console.log('\nC · kode dikembalikan apa adanya bila tak ada label');
ok(label('XYZ') === 'XYZ', 'full_name kosong -> kode', label('XYZ'));
ok(label('ZZZ') === 'ZZZ', 'company tak dikenal -> kode, bukan blank', label('ZZZ'));
ok(label('') === '' && label(null) === '' && label(undefined) === '',
  'masukan kosong/null tidak melempar dan tidak mengarang', JSON.stringify([label(''), label(null)]));

console.log('\nD · hanya SATU company yang berubah pada data nyata');
{
  const cacheP = path.join(ROOT, '..', 'cache', 'iqdash_data.json');
  if (!fs.existsSync(cacheP)) {
    console.log('  (lewati — cache/iqdash_data.json tidak ada)');
  } else {
    const d = JSON.parse(fs.readFileSync(cacheP, 'utf8'));
    set('SPI', d.spi || []); set('PENDING', d.pending || []);
    const semua = [...(d.spi || []), ...(d.pending || [])];
    const beda = semua.map(c => c.code).filter(k => label(k) !== k);
    ok(beda.length === 1 && beda[0] === 'AMP',
      `dari ${semua.length} company, tepat satu yang labelnya berbeda dari kodenya (AMP)`,
      JSON.stringify(beda));
    ok(label('AMP') === 'AMP / SUJU', 'pada data nyata AMP -> "AMP / SUJU"', label('AMP'));
  }
}

console.log('\nE · kunci penghubung tidak ikut diganti di berkas render');
{
  /* Argumen onclick HARUS tetap kode mentah — ia yang dipakai openDrawer,
     getSPI, dan seluruh pencarian antar-tab. */
  const bocor = [];
  fs.readdirSync(JS).filter(f => f.endsWith('.js')).forEach(f => {
    const s = fs.readFileSync(path.join(JS, f), 'utf8');
    const re = /(openDrawer|openDrawerPending|openUtilBreakdown)\('\$\{coLabel\(/g;
    if (re.test(s)) bocor.push(f);
  });
  ok(bocor.length === 0, 'tidak ada onclick yang memakai coLabel sebagai kunci',
    JSON.stringify(bocor));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
