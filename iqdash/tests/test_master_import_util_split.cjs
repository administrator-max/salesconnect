/* Satu siklus boleh punya BEBERAPA pasangan baris "Utilization #N (MT)/(date)".
 *
 * Struktur master hanya menyediakan SATU sel tanggal per (siklus, produk),
 * sehingga pemakaian yang terjadi di beberapa tanggal — GKL 1.000 MT pada
 * 29 Des 2025 lalu 100 MT pada 31 Mar 2026 — hanya bisa ditulis dengan
 * MENGGANDAKAN pasangan barisnya. Itu yang tim lakukan di master.
 *
 * Versi pertama parser MENIMPA pasangan sebelumnya (`utilCycleMT[no] = ...`),
 * jadi baris kedua menghapus yang pertama tanpa pesan apa pun — rapihan tim
 * justru akan menghilangkan tonase. Tes ini mengunci perilaku menumpuk.
 *
 * Workbook dibangun sintetis di sini supaya tes tidak bergantung pada berkas
 * master di Downloads.
 *
 * Run: node iqdash/tests/test_master_import_util_split.cjs
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const XLSX = require(path.join(ROOT, 'assets', 'vendor', 'xlsx.full.min.js'));

let pass = 0, fail = 0;
const eq = (a, e, nama) => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (ok) { pass++; console.log(`  ok   ${nama}`); }
  else { fail++; console.log(`FAIL   ${nama}\n         dapat    ${JSON.stringify(a)}\n         harusnya ${JSON.stringify(e)}`); }
};

/* Sheet minimal berbentuk master: baris judul, baris nama produk, baris HS,
   lalu satu blok company. Kolom: A=NO, B=Company, C=Status, D=Group,
   E..=produk, dan kolom ekor JUMLAH/REMARKS/… seperti aslinya. */
const HS_GL = '7225.99.90';   // GL ALLOY di master produk dashboard
const baris = n => new Array(n).fill(null);
const aoa = [];
aoa[0] = ['Quta Data Tracking'];
aoa[1] = (() => { const r = baris(40); r[0]='NO.'; r[1]='Company'; r[2]='Status'; r[4]='GL BORON';
                  r[32]='JUMLAH (MT)'; r[35]='Submission'; r[36]='Date'; r[37]='Release'; r[38]='Date'; return r; })();
aoa[2] = (() => { const r = baris(40); r[4]=HS_GL; return r; })();

const isi = (status, mt, tgl) => { const r = baris(40); r[2]=status; if (mt!=null) r[4]=mt; if (tgl!=null) r[4]=tgl;
                                   if (mt!=null) r[32]=mt; return r; };
aoa[3] = (() => { const r = isi('Submit #1', 3000, null); r[1]='TST'; return r; })();
aoa[4] = isi('Obtained #1', 1100, null);
// DUA pasangan untuk siklus yang SAMA — inilah bentuk rapihan tim
aoa[5] = isi('Utilization #1 (MT)', 1000, null);
aoa[6] = isi('Utilization #1 (date)', null, '29 Dec 25');
aoa[7] = isi('Utilization #1 (MT)', 100, null);
aoa[8] = isi('Utilization #1 (date)', null, '31 Mar 26');

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Status Submisson');

const ctx = {
  console, XLSX, SPI: [], PENDING: [],
  PRODUCT_META: { 'GL ALLOY': { hsCode: HS_GL } },
  canonicalProduct: p => p,
  document: { getElementById: () => null, querySelectorAll: () => [] }, window: {},
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'js', '21-master-import.js'), 'utf8'), ctx);

const hasil = ctx.mdParseWorkbook(wb, 'uji.xlsx');
const co = hasil.companies.TST;

console.log('-- dua pasangan baris untuk siklus yang sama harus MENUMPUK, bukan menimpa --');
eq(!!co, true, 'company TST terbaca');
eq((co.utilCycles || []).length, 2, 'menghasilkan 2 baris utilisasi (bukan 1)');
eq((co.utilCycles || []).map(u => `${u.mt}@${u.date}`),
   ['1000@29/12/2025', '100@31/03/2026'],
   'kedua tonase DAN tanggalnya benar, urut sesuai baris');
eq((co.utilCycles || []).reduce((s, u) => s + u.mt, 0), 1100, 'jumlahnya utuh 1.100 MT');
eq(co.utilSkipped, false, 'tidak ditandai dilewati');
eq(hasil.warnings.filter(w => /TST/.test(w)), [], 'tanpa peringatan');

console.log('\n-- tanggal menempel pada baris MT tepat DI ATASNYA, tidak tertukar --');
eq((co.utilCycles || [])[0].date, '29/12/2025', 'pasangan pertama -> tanggal pertama');
eq((co.utilCycles || [])[1].date, '31/03/2026', 'pasangan kedua -> tanggal kedua');

console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
