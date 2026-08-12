/* Kelima angka laporan harus punya SATU implementasi.
 *
 * Latar: 2026-08-05 tim melaporkan Overview, Utilization & Realization, dan
 * Available Quota menampilkan angka BERBEDA untuk label yang sama begitu
 * periode difilter (Utilized 17.300 / 13.600 / 18.447 · Obtained 19.710 /
 * 19.710 / 30.140 · Realized 15.438,208 / 11.395,405). Tanpa filter ketiganya
 * cocok — itulah kenapa lolos lama sekali: setiap salinan runtuh ke nilai yang
 * sama ketika tidak ada jendela untuk diiris.
 *
 * Jadi ini BUKAN tes nilai (nilainya berubah tiap kali data diinput), melainkan
 * tes STRUKTUR: memastikan tidak ada permukaan yang menghitung sendiri lagi.
 * Sebuah tes nilai pun tak akan menangkapnya kalau hanya melihat All Time.
 *
 * Run: node iqdash/tests/test_metrics_single_source.cjs
 */
const fs = require('fs');
const path = require('path');

const JS = path.join(__dirname, '..', 'assets', 'js');
let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  ok   ' + msg); }
  else { fail++; console.log('FAIL   ' + msg); }
};

/* Buang komentar supaya yang diperiksa benar-benar KODE, bukan penjelasan.
   Docblock kami memang menyebut nama fungsi lama untuk mencatat sejarah. */
const kode = f => fs.readFileSync(path.join(JS, f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const SUMBER = '02-period-filter.js';
const PERMUKAAN = ['03-kpis.js', '04-charts.js', '19-init.js', '14-export.js'];
const HELPER = ['reportSubmittedTotal', 'reportObtainedTotal', 'reportUtilizedTotal',
                'reportRealizedTotal', 'reportAvailableTotal'];

console.log('-- Kelimanya terdefinisi, dan hanya di satu berkas --');
const src = kode(SUMBER);
HELPER.forEach(h => {
  ok(new RegExp('function\\s+' + h + '\\s*\\(').test(src), `${h}() terdefinisi di ${SUMBER}`);
  const lain = PERMUKAAN.filter(f => new RegExp('function\\s+' + h + '\\s*\\(').test(kode(f)));
  ok(lain.length === 0, `${h}() tidak didefinisi ulang di permukaan mana pun` +
     (lain.length ? ` (ditemukan di ${lain.join(', ')})` : ''));
});

console.log('\n-- Tiap permukaan MEMANGGIL, bukan menurunkan sendiri --');
PERMUKAAN.forEach(f => {
  const s = kode(f);
  ok(/reportObtainedTotal\s*\(/.test(s),  `${f} memanggil reportObtainedTotal()`);
  ok(/reportUtilizedTotal\s*\(/.test(s),  `${f} memanggil reportUtilizedTotal()`);
  ok(/reportAvailableTotal\s*\(/.test(s), `${f} memanggil reportAvailableTotal()`);
});

console.log('\n-- Bahan mentahnya tidak boleh dipakai langsung di permukaan --');
/* Ini persis cara ketiga penyimpangan itu lahir: menyusun kolam sendiri lalu
   menjumlah sendiri. Bahan-bahan ini sah dipakai DI DALAM 02-period-filter.js;
   di permukaan, kehadirannya berarti ada salinan baru. */
const TERLARANG = [
  ['cumulativeAvailableTotal', 'total Available diturunkan sendiri'],
  ['utilizationPool',          'kolam utilisasi disusun sendiri'],
];

/* PENGECUALIAN yang disengaja, bukan pelonggaran.

   Larangan di atas menyasar permukaan yang menyusun kolam sendiri lalu
   MENJUMLAH sendiri. Sebuah DRILL berbeda: ia tidak menjumlah total apa pun —
   ia merinci total yang sudah dihitung helper, jadi ia HARUS menyusuri kolam
   yang PERSIS SAMA. Melarangnya justru melahirkan bug yang ditemukan audit
   2026-08-12: refreshUtilDrill() memakai kpiPool() saja dan membaca 9.605 MT
   terhadap kartu 12.525, karena company yang PERTEK-nya di luar jendela tapi
   kargonya masuk hilang dari rinciannya.

   Karena itu pengecualiannya sesempit mungkin: HANYA nama fungsi ini, dan hanya
   untuk utilizationPool(). Selebihnya tetap terlarang. */
const KECUALI = { utilizationPool: ['refreshUtilDrill'] };

/* Potong badan sebuah fungsi supaya pengecualian bisa dibatasi per fungsi. */
function badanFungsi(src, nama) {
  const m = new RegExp('function\\s+' + nama + '\\s*\\([^)]*\\)\\s*\\{').exec(src);
  if (!m) return '';
  let i = m.index + m[0].length, d = 1;
  while (i < src.length && d > 0) { const ch = src[i]; if (ch === '{') d++; else if (ch === '}') d--; i++; }
  return src.slice(m.index, i);
}

PERMUKAAN.forEach(f => {
  const s = kode(f);
  TERLARANG.forEach(([nama, kenapa]) => {
    const re = new RegExp('\\b' + nama + '\\s*\\(');
    let sisa = s;
    (KECUALI[nama] || []).forEach(fn => {
      const b = badanFungsi(s, fn);
      if (b) sisa = sisa.split(b).join(' ');   // buang badan fungsi yang dikecualikan
    });
    ok(!re.test(sisa), `${f} tidak memanggil ${nama}() di luar drill — ${kenapa}`);
  });
});

/* Sisi lain dari pengecualian: drill utilisasi WAJIB memakai kolam itu. Tanpa
   pasangan ini, pengecualian di atas cuma jadi lubang. */
const bDrill = badanFungsi(kode('03-kpis.js'), 'refreshUtilDrill');
ok(bDrill !== '', 'refreshUtilDrill() ditemukan di 03-kpis.js');
ok(/utilizationPool\s*\(/.test(bDrill),
   'refreshUtilDrill() MEMAKAI utilizationPool() — kolamnya wajib sama dengan reportUtilizedTotal()');

console.log('\n-- Realized wajib bersumber dari PIB, bukan ra_records --');
/* Kesenjangan 11.395,405 vs 15.438,208: strip U&R menjumlah ra_records.berat
   (ringkasan satu baris per company yang dijaga manual) padahal spesifikasi
   laporan menyebut kolom Volume pada tanggal PIB. */
ok(/REALIZATIONS/.test(src) && /pib_date/.test(src),
   'reportRealizedTotal() membaca REALIZATIONS + pib_date');
PERMUKAAN.forEach(f => {
  const s = kode(f);
  const curiga = /arrived\s*\.reduce\s*\(\s*\([^)]*\)\s*=>\s*[^)]*\.berat/.test(s);
  ok(!curiga, `${f} tidak menjumlah .berat sebagai total Realized`);
});

console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
