/* canonProdInText() — menyeragamkan nama produk yang TERTANAM di dalam teks.
 *
 * Ditemukan 10-Sep-2026 saat memeriksa tampilan panel revisi BBB: Cycle History
 * menuliskan "Revision Request — GL ALLOY ALLOY".
 *
 * Sebabnya peta alias memuat singkatan "GL" -> "GL ALLOY" dan "GI" -> "GI
 * ALLOY". Versi lama menjalankan satu penggantian per kunci secara berurutan,
 * jadi "GL" tetap mencocoki "GL" DI DALAM "GL ALLOY" yang sudah kanonik.
 * Mengurutkan kunci dari yang terpanjang tidak menolong sama sekali: "GL ALLOY"
 * bukan kunci, jadi tidak pernah ikut dibandingkan.
 *
 * Terlihat di Cycle History, drill KPI, drawer, tabel PERTEK & SPI, dan ikut
 * terbawa ke hasil ekspor.
 *
 * YANG DIKUNCI:
 *   A. Ejaan lama tetap dikanonikkan.
 *   B. Nama yang SUDAH kanonik dibiarkan — ini perbaikannya.
 *   C. Idempoten: dipanggil dua kali hasilnya sama.
 *   D. Ejaan yang lebih panjang menang atas singkatannya.
 *   E. Kata lain yang kebetulan memuat "GL"/"GI" tidak ikut diubah.
 *
 * Peta aliasnya diambil dari cache/iqdash_data.json — peta yang sungguhan
 * dipakai dashboard, bukan karangan berkas uji ini.
 *
 * Run: node iqdash/tests/test_canon_prod_in_text.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');
const DATA = path.join(ROOT, '..', 'cache', 'iqdash_data.json');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

const alias = JSON.parse(fs.readFileSync(DATA, 'utf8')).productAliases || {};
if (!Object.keys(alias).length) { console.error('BERHENTI: productAliases kosong di cache'); process.exit(1); }

/* Diambil dari berkasnya, bukan disalin. */
const src = fs.readFileSync(path.join(JS, '01-data.js'), 'utf8').split('\r\n').join('\n');
const a = src.indexOf('const canonProdInText = s => {');
const b = src.indexOf('\n};', a);
if (a < 0 || b < 0) { console.error('BERHENTI: canonProdInText tidak ketemu'); process.exit(1); }

const ctx = vm.createContext({ console, Object, String, Array, Set, RegExp, JSON });
ctx.window = ctx; ctx.globalThis = ctx;
ctx.__alias = alias;
vm.runInContext('var PRODUCT_ALIASES = __alias;\n' + src.slice(a, b + 3), ctx);
const K = t => { ctx.__t = t; return vm.runInContext('canonProdInText(__t)', ctx); };

console.log('\nPeta alias yang dipakai: ' + Object.keys(alias).length + ' entri');

console.log('\nA · Ejaan lama tetap dikanonikkan');
ok(K('Revision Request — GL BORON') === 'Revision Request — GL ALLOY',
  'GL BORON -> GL ALLOY', K('Revision Request — GL BORON'));
ok(K('Obtained #2 — GI BORON') === 'Obtained #2 — GI ALLOY',
  'GI BORON -> GI ALLOY', K('Obtained #2 — GI BORON'));
ok(K('SHEETPILE 300 MT') === 'SHEET PILE 300 MT',
  'SHEETPILE -> SHEET PILE', K('SHEETPILE 300 MT'));
ok(K('GL 400 MT') === 'GL ALLOY 400 MT', 'singkatan GL tetap dimekarkan', K('GL 400 MT'));

console.log('\nB · Nama yang SUDAH kanonik dibiarkan');
ok(K('Revision Request — GL ALLOY') === 'Revision Request — GL ALLOY',
  'GL ALLOY tidak jadi "GL ALLOY ALLOY"', K('Revision Request — GL ALLOY'));
ok(K('Obtained #2 — GI ALLOY') === 'Obtained #2 — GI ALLOY',
  'GI ALLOY tidak jadi "GI ALLOY ALLOY"', K('Obtained #2 — GI ALLOY'));
ok(K('SHEET PILE 300 MT') === 'SHEET PILE 300 MT',
  'SHEET PILE tetap utuh', K('SHEET PILE 300 MT'));

console.log('\nC · Idempoten — aman dipanggil berkali-kali');
{
  const teks = ['Revision Request — GL BORON', 'Obtained #1 — GI Boron',
                'SHEETPILE 150 MT', 'Submit #2 — GL ALLOY', 'PPGL 200 MT'];
  const beda = teks.filter(t => K(K(t)) !== K(t));
  ok(!beda.length, 'sekali dan dua kali hasilnya sama untuk semua contoh',
    JSON.stringify(beda.map(t => [K(t), K(K(t))])));
}
{
  /* Pagar yang sesungguhnya: SETIAP nama kanonik di peta harus tahan
     dilewatkan fungsi ini. Kalau ada alias singkat baru ditambahkan nanti,
     inilah yang akan menangkapnya. */
  const kanonik = [...new Set(Object.values(alias))];
  const rusak = kanonik.filter(k => K(k) !== k);
  ok(!rusak.length, `semua ${kanonik.length} nama kanonik tahan dilewatkan`,
    JSON.stringify(rusak.map(k => [k, K(k)])));
}

console.log('\nD · Ejaan panjang menang atas singkatannya');
ok(K('HRC/HRPO ALLOY 500 MT') === 'HRPO ALLOY 500 MT',
  'HRC/HRPO ALLOY -> HRPO ALLOY, bukan tercabik', K('HRC/HRPO ALLOY 500 MT'));
ok(K('PPGL 100 MT') === 'PPGL CARBON 100 MT', 'PPGL -> PPGL CARBON', K('PPGL 100 MT'));

console.log('\nE · Kata lain yang memuat GL/GI tidak ikut berubah');
ok(K('SINGLE GLAZING') === 'SINGLE GLAZING', 'GLAZING tidak disentuh', K('SINGLE GLAZING'));
ok(K('LOGISTIK') === 'LOGISTIK', 'LOGISTIK tidak disentuh', K('LOGISTIK'));
ok(K('') === '' && K(null) === '' && K(undefined) === '',
  'teks kosong/null aman', JSON.stringify([K(''), K(null)]));

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
