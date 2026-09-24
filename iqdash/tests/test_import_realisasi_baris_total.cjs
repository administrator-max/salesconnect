/* Import Realisasi — baris TOTAL workbook tidak boleh ikut tersimpan.
 *
 * Workbook PIB dari bea cukai memakai baris rekap di kaki tabel: kolom Volume
 * (kadang Nilai) terisi jumlah seluruh line item, tapi No. PIB, HS dan Uraian
 * Barang kosong. Penjaga lama di parseRealizFile hanya melewati baris yang
 * SELURUH selnya kosong, jadi baris rekap ini lolos dan tersimpan sebagai line
 * item — realisasi company itu terhitung DUA KALI.
 *
 * Bukan kasus teoretis. Diukur 24-Sep-2026 di sheet `realizations`: 13 baris
 * seperti ini di 12 company (EMS, BTS×2, GAS, AADC, BBB, LCP, KJK, SJH, PPGL,
 * KARA, SGD, JKT), total 2.852,851 MT realisasi hantu. Pada JKT, Realization MT
 * terbaca 185,3 padahal realisasi sebenarnya 92,65 — tepat dua kali lipat. Itu
 * angka yang dipakai untuk menilai Eligible ≥60% sebelum Re-Apply, jadi baris
 * hantu bisa membalik keputusan.
 *
 * Uji ini menjalankan penjaganya, bukan salinannya: potongan loop parser
 * diambil dari berkas browser lewat vm supaya tidak bisa menyimpang diam-diam.
 *
 * Run: node iqdash/tests/test_import_realisasi_baris_total.cjs
 */
const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

const SRC = path.join(__dirname, '..', 'assets', 'js', '20-realization-import.js');
const src = fs.readFileSync(SRC, 'utf8');

/* Ambil loop parsing apa adanya dari sumber — dari `const rows = [];` sampai
   tepat sebelum baris pemeriksa "No data rows found". Yang diuji persis kode
   yang dijalankan browser. */
const awal  = src.indexOf('      const rows = [];');
const akhir = src.indexOf("      if (!rows.length) throw new Error('No data rows found');");
if (awal < 0 || akhir < 0) throw new Error('potongan loop parser tidak ketemu di sumber');
const potongan = src.slice(awal, akhir);

/* PIB_HEADER_MAP juga diambil dari sumber, bukan ditulis ulang. */
const iMap = src.indexOf('const PIB_HEADER_MAP');
const jMap = src.indexOf('};', iMap) + 2;
if (iMap < 0) throw new Error('PIB_HEADER_MAP tidak ketemu di sumber');

function jalankan(aoa) {
  const ctx = { console, aoa, realizProductFromHS: hs => (hs ? 'GL ALLOY' : null) };
  vm.createContext(ctx);
  vm.runInContext(src.slice(iMap, jMap), ctx);
  vm.runInContext(`
    const headers = aoa[0].map(h => String(h).trim());
    ${potongan}
    globalThis.__rows = rows;
    globalThis.__dilewati = dilewati;
  `, ctx);
  return { rows: ctx.__rows, dilewati: ctx.__dilewati };
}

const HDR = ['No', 'Uraian Barang', 'Pos Tarif/HS 10 Digit', 'Volume', 'Nilai', 'No. PIB', 'Tgl. PIB'];

let pass = 0, fail = 0;
const eq = (dapat, harus, nama) => {
  if (dapat === harus) { pass++; console.log(`  ok   ${nama}`); }
  else { fail++; console.log(`FAIL   ${nama} — dapat ${JSON.stringify(dapat)}, harusnya ${JSON.stringify(harus)}`); }
};

/* ── Kasus JKT yang sebenarnya (file "54. REALISASI JKT - SUMEC 1.xlsx") ──
   Dua line item 45,648 + 47,002 lalu baris rekap 92,65 tanpa identitas. */
{
  const { rows, dilewati } = jalankan([
    HDR,
    [1, 'FLAT ROLLED ... BMT 0.29 MM X 914 MM', '7225.99.90', 45.648, 41000, '628646', '24-09-2026'],
    [2, 'FLAT ROLLED ... BMT 0.22 MM X 914 MM', '7225.99.90', 47.002, 42000, '628646', '24-09-2026'],
    ['', '', '', 92.65, 83000, '', ''],
  ]);
  eq(rows.length, 2, 'JKT: hanya 2 line item yang tersimpan');
  eq(dilewati.length, 1, 'JKT: 1 baris rekap dilaporkan sebagai dilewati');
  eq(Number(rows.reduce((s, r) => s + r.volume, 0).toFixed(3)), 92.650,
     'JKT: total volume tersimpan = 92,650 MT, bukan 185,3');
  eq(dilewati[0].volume, 92.65, 'JKT: volume baris rekap tercatat untuk dilaporkan ke pengunggah');
}

/* ── Baris rekap TANPA angka sekalipun tidak dilaporkan — ia baris pemisah,
   bukan sesuatu yang perlu diberitahukan ke orang yang mengunggah. ── */
{
  const { rows, dilewati } = jalankan([
    HDR,
    [1, 'FLAT ROLLED', '7225.99.90', 10, 100, '111', '01-01-2026'],
    ['', '', '', '', '', '', ''],          // seluruhnya kosong
    ['', '', '', 0, 0, '', ''],            // nol — bukan rekap yang berarti
  ]);
  eq(rows.length, 1, 'baris kosong/nol: hanya 1 line item tersimpan');
  eq(dilewati.length, 0, 'baris kosong/nol: tidak dilaporkan sebagai rekap');
}

/* ── Line item yang SAH tidak boleh ikut terbuang ────────────────────────
   Penjaganya menuntut ketiganya kosong (PIB, HS, Uraian). Satu saja terisi
   berarti itu line item — mis. workbook yang kolom PIB-nya baru diisi di
   baris pertama, atau line item yang HS-nya belum dipetakan. */
{
  const { rows, dilewati } = jalankan([
    HDR,
    [1, 'FLAT ROLLED', '', 10, 100, '', ''],     // punya uraian saja
    [2, '', '7225.99.90', 20, 200, '', ''],      // punya HS saja
    [3, '', '', 30, 300, '999', ''],             // punya PIB saja
  ]);
  eq(rows.length, 3, 'satu kolom identitas terisi sudah cukup untuk dianggap line item');
  eq(dilewati.length, 0, 'tidak ada line item sah yang terbuang');
  eq(Number(rows.reduce((s, r) => s + r.volume, 0).toFixed(3)), 60,
     'volume line item sah utuh');
}

/* ── Rekap bisa muncul lebih dari satu (workbook multi-PIB) ────────────── */
{
  const { rows, dilewati } = jalankan([
    HDR,
    [1, 'A', '7225.99.90', 10, 100, '111', ''],
    ['', '', '', 10, 100, '', ''],
    [1, 'B', '7225.99.90', 20, 200, '222', ''],
    ['', '', '', 20, 200, '', ''],
  ]);
  eq(rows.length, 2, 'multi-PIB: 2 line item tersimpan');
  eq(dilewati.length, 2, 'multi-PIB: 2 baris rekap dilewati');
}

console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
