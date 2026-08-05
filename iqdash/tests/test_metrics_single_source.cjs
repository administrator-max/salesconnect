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
PERMUKAAN.forEach(f => {
  const s = kode(f);
  TERLARANG.forEach(([nama, kenapa]) => {
    ok(!new RegExp('\\b' + nama + '\\s*\\(').test(s), `${f} tidak memanggil ${nama}() — ${kenapa}`);
  });
});

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
