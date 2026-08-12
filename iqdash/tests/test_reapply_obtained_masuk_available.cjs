/* Kuota re-apply yang dicatat lewat form Revision Management HARUS masuk
 * Obtained, dan karena itu masuk Available.
 *
 * BUG-nya (dilaporkan pemilik data 2026-08-12: "obtained quota re-apply, yg
 * seharusnya otomatis masuk juga kedalam available quota"):
 *
 *   rrApplyObtained() / rrMarkApproved() / rrSaveStatus() MEMBUAT placeholder
 *       { type:'Obtained #2', mt:null, releaseDate:'TBA', _fromRevReq:true }
 *   lalu alur yang SAMA mengisi mt + products + tanggal SPI ketika kuotanya
 *   benar-benar terbit — tapi tidak pernah membersihkan penandanya.
 *   canonicalObtained() menggugurkan `_fromRevReq` TANPA SYARAT, jadi kuota itu
 *   permanen tidak terlihat: tidak masuk Obtained, tidak pernah muncul di
 *   Available.
 *
 * Kenapa lolos lama: company yang siklusnya datang dari import master tidak
 * pernah bertanda `_fromRevReq`, jadi re-apply mereka terhitung normal. Hanya
 * yang dicatat lewat UI yang terjebak — dan penelusuran pertama (memeriksa
 * "apakah re-apply terhitung?") menyimpulkan aman karena melihat kelompok yang
 * salah.
 *
 * Penandanya menandai PLACEHOLDER, bukan "bukan obtained".
 *
 * Run: node iqdash/tests/test_reapply_obtained_masuk_available.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const JS = path.join(__dirname, '..', 'assets', 'js');
const ctx = vm.createContext({ console, Date, Math, JSON, Number, String, Object, Array, Set, Map, isNaN, parseFloat, parseInt, RegExp, Boolean });
['01-data.js', '02-period-filter.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }));
const call = e => vm.runInContext(e, ctx);

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };
const near = (a, b) => Math.abs(a - b) <= 1e-6;

const cyc = (type, mt, o) => Object.assign({ type, mt, products: {} }, o || {});

/* ── Placeholder MURNI: belum jadi apa-apa, harus tetap gugur ─────────── */
console.log('-- placeholder yang belum terisi tetap TIDAK dihitung --');
ctx._placeholder = {
  code: 'PH',
  cycles: [
    cyc('Submit #1', 1000, { submitDate: '01/02/2026', releaseDate: '01/03/2026' }),
    cyc('Obtained #1', 800, { submitDate: '05/03/2026', releaseDate: '10/03/2026', products: { 'GI ALLOY': 800 } }),
    // persis bentuk yang dibuat rrApplyObtained() sebelum diisi
    { type: 'Obtained #2', mt: null, products: {}, submitDate: 'TBA', releaseDate: 'TBA', status: '', _fromRevReq: true },
  ],
  utilizationMT: 0, utilizationByProd: {}, availableByProd: {}, products: ['GI ALLOY'],
};
ok(near(call('canonicalObtained(this._placeholder)'), 800),
   'placeholder (mt null, tanggal TBA) tidak menambah obtained',
   `dapat ${call('canonicalObtained(this._placeholder)')}`);

/* ── Placeholder yang SUDAH TERISI: wajib dihitung ────────────────────── */
console.log('\n-- placeholder yang sudah terisi MT + tanggal SPI wajib dihitung --');
ctx._terisi = {
  code: 'RA',
  cycles: [
    cyc('Submit #1', 1000, { submitDate: '01/02/2026', releaseDate: '01/03/2026' }),
    cyc('Obtained #1', 800, { submitDate: '05/03/2026', releaseDate: '10/03/2026', products: { 'GI ALLOY': 800 } }),
    cyc('Revision Request — GI ALLOY', 3000, { submitDate: '10/08/2026', releaseDate: '10/08/2026', products: { 'GL ALLOY': 3000 } }),
    /* Bentuk SETELAH kuotanya terbit dan dicatat lewat form: mt & tanggal
       terisi, tapi penandanya masih menempel. */
    { type: 'Obtained #2', mt: 300, products: { 'GL ALLOY': 300 },
      submitDate: '12/08/2026', releaseDate: '20/08/2026', spiDate: '20/08/2026',
      status: '', _fromRevReq: true },
  ],
  utilizationMT: 800, utilizationByProd: { 'GI ALLOY': 800 },
  availableByProd: { 'GI ALLOY': 0, 'GL ALLOY': 300 }, products: ['GI ALLOY', 'GL ALLOY'],
};
const obt = call('canonicalObtained(this._terisi)');
ok(near(obt, 1100), 'obtained = 800 + 300 (re-apply IKUT)  <-- inti bug', `dapat ${obt}`);
ok(near(call('cumulativeAvailable(this._terisi)'), 300),
   'available = 300 MT — kuota re-apply muncul sebagai saldo',
   `dapat ${call('cumulativeAvailable(this._terisi)')}`);

const perProd = call('cumulativeAvailByProd(this._terisi)');
ok(near(Number(perProd['GL ALLOY']) || 0, 300),
   'saldo 300 MT itu menempel di produk GL ALLOY, bukan GI ALLOY',
   JSON.stringify(perProd));

/* ── Tidak boleh hitung ganda dengan siklus Revision Request ──────────── */
console.log('\n-- siklus "Revision Request" tidak ikut terjumlah --');
ok(near(obt, 1100),
   'Revision Request 3.000 MT TIDAK menambah obtained (bukan tipe Obtained #N)');

/* ── Jalur SUBMIT tidak ikut berubah ──────────────────────────────────── */
console.log('\n-- jalur SUBMIT tetap menggugurkan artefak --');
ctx._sub = {
  code: 'SB',
  cycles: [
    cyc('Submit #1', 1000, { submitDate: '01/02/2026', releaseDate: '01/03/2026' }),
    { type: 'Submit #2', mt: 500, products: {}, submitDate: '01/07/2026', releaseDate: '01/08/2026', _fromRevReq: true },
  ],
  utilizationMT: 0, utilizationByProd: {}, availableByProd: {}, products: [],
};
ok(near(call('canonicalSubmitted(this._sub)'), 1000),
   'Submit #2 bertanda _fromRevReq TETAP digugurkan (aturan submit tidak berubah)',
   `dapat ${call('canonicalSubmitted(this._sub)')}`);

/* ── Struktur: penanda tidak boleh dipakai lagi sebagai gerbang obtained ─ */
console.log('\n-- struktur: _fromRevReq bukan lagi gerbang di jalur obtained --');
const kode = f => fs.readFileSync(path.join(JS, f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
function badan(src, nama) {
  const m = new RegExp('function\\s+' + nama + '\\s*\\([^)]*\\)\\s*\\{').exec(src);
  if (!m) return null;
  let i = m.index + m[0].length, d = 1;
  while (i < src.length && d > 0) { const c = src[i]; if (c === '{') d++; else if (c === '}') d--; i++; }
  return src.slice(m.index, i);
}
[['01-data.js', 'canonicalObtained'], ['01-data.js', 'canonicalObtainedFiltered'],
 ['02-period-filter.js', 'scopedObtainedDetailByProd']].forEach(([f, fn]) => {
  const b = badan(kode(f), fn);
  ok(b != null, `${f}: ${fn}() ditemukan`);
  if (b) ok(!/_fromRevReq/.test(b), `${fn}() tidak lagi memakai _fromRevReq sebagai gerbang`);
});
/* Jalur submit HARUS masih memakainya. */
[['01-data.js', 'canonicalSubmitted'], ['01-data.js', 'getSubmittedByProd']].forEach(([f, fn]) => {
  const b = badan(kode(f), fn);
  if (b) ok(/_fromRevReq/.test(b), `${fn}() MASIH memakai _fromRevReq (memang harus)`);
});

console.log(`\n${fail === 0 ? '✔ SEMUA LULUS' : '✖ GAGAL'}  —  lulus ${pass}, gagal ${fail}`);
process.exit(fail ? 1 : 0);
