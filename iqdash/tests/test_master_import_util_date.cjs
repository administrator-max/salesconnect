/* mdUtilDate() — pembaca tanggal utilisasi pada Import Master.
 *
 * Ini gerbang tunggal yang menentukan sebuah tonase masuk periode mana. Salah
 * baca = MT pindah periode tanpa jejak, persis kelas kesalahan yang sudah
 * berkali-kali kita kejar (AADC 1-Jul-16, BTS 12/06 dibaca 6 Des).
 *
 * Dua perilaku yang WAJIB dipertahankan:
 *   1. Sel bertanggal GANDA ditolak, bukan ditebak. Master 05/08/2026 memuat
 *      GKL "29 Dec 25 & 31 Mar 26" dan KJK "20 Nov 25 & 1 Dec 25" — satu angka
 *      MT untuk dua tanggal. Mengambil salah satunya memindahkan tonase, pada
 *      GKL bahkan melintasi tahun.
 *   2. Slash dibaca DD/MM, bukan M/D ala Amerika.
 *
 * Fungsinya hidup di berkas browser, jadi diambil lewat vm — bukan disalin ke
 * sini. Salinan akan menyimpang diam-diam dari yang benar-benar dipakai.
 *
 * Run: node iqdash/tests/test_master_import_util_date.cjs
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = path.join(__dirname, '..', 'assets', 'js', '21-master-import.js');
const src = fs.readFileSync(SRC, 'utf8');

const ctx = { console };
vm.createContext(ctx);
const ambilFungsi = (nama) => {
  const i = src.indexOf('function ' + nama + '(');
  if (i < 0) throw new Error('tidak ketemu di sumber: ' + nama);
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } }
  vm.runInContext(src.slice(i, j + 1), ctx);
};
const iB = src.indexOf('const MD_BULAN');
if (iB < 0) throw new Error('tidak ketemu di sumber: MD_BULAN');
vm.runInContext(src.slice(iB, src.indexOf('\n', iB) + 1), ctx);
ambilFungsi('mdSerialToDate');   // dipakai mdUtilDate untuk nomor seri Excel
ambilFungsi('mdUtilDate');
const f = ctx.mdUtilDate;

let pass = 0, fail = 0;
const eq = (actual, expected, nama) => {
  if (actual === expected) { pass++; console.log(`  ok   ${nama}`); }
  else { fail++; console.log(`FAIL   ${nama} — dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`); }
};

console.log('-- bentuk yang benar-benar ada di master 05/08/2026 --');
eq(f('12 Jan 26'),   '12/01/2026', '"12 Jan 26"');
eq(f('29 Dec 25'),   '29/12/2025', '"29 Dec 25"');
eq(f('1 Dec 25'),    '01/12/2025', '"1 Dec 25" (satu digit -> dipad)');
eq(f('28 Apr 26'),   '28/04/2026', '"28 Apr 26"');
eq(f('6 May 26'),    '06/05/2026', '"6 May 26"');
eq(f('28 Jul26'),    '28/07/2026', '"28 Jul26" — KURANG SPASI (ADP & MSN)');
eq(f('15-Oct-25'),   '15/10/2025', '"15-Oct-25" (bentuk berstrip)');

console.log('\n-- NOMOR SERI Excel (importer membaca raw:true, jadi ini bentuk yang NYATA datang) --');
/* Ketahuan hanya lewat uji terhadap file master aslinya: importer membaca
   workbook dengan raw:true, sehingga sel bertipe tanggal datang sebagai angka.
   Sebelum ditangani, SELURUH utilisasi bertanggal terlewat. */
eq(f('46034'), '12/01/2026', 'serial 46034 = 12 Jan 2026 (EMS Util#1)');
eq(f('46162'), '20/05/2026', 'serial 46162 = 20 Mei 2026 (EMS Util#2)');
eq(f('45972'), '11/11/2025', 'serial 45972 = 11 Nov 2025 (HDP Util#1)');
eq(f(46034),   '12/01/2026', 'serial sebagai NUMBER, bukan string');
eq(f('150'),   null,         'angka di luar rentang tanggal bukan tanggal');
eq(f('0'),     null,         'nol bukan tanggal');

console.log('\n-- tanggal ganda WAJIB ditolak, bukan ditebak --');
eq(f('29 Dec 25 & 31 Mar 26'), 'GANDA', 'GKL — melintasi tahun');
eq(f('20 Nov 25 & 1 Dec 25'),  'GANDA', 'KJK');
eq(f('1 Jan 26 dan 2 Feb 26'), 'GANDA', 'pemisah "dan"');
eq(f('1 Jan 26, 2 Feb 26'),    'GANDA', 'pemisah koma');

console.log('\n-- slash dibaca DD/MM, bukan gaya Amerika --');
eq(f('12/06/2026'), '12/06/2026', '"12/06/2026" = 12 Juni, bukan 6 Desember');
eq(f('30/10/25'),   '30/10/2025', '"30/10/25" (tahun 2 digit)');

console.log('\n-- yang tidak terbaca harus null, jangan menebak --');
eq(f(''),            null, 'kosong');
eq(f(null),          null, 'null');
eq(f('TBA'),         null, '"TBA"');
eq(f('awal April'),  null, 'teks bebas');
eq(f('1078/ILMATE'), null, 'nomor surat nyasar ke kolom tanggal');

console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
