/* OBTAINED MT — PER PRODUK: satu baris per PRODUK, sejumlah request sales.
 *
 * Dilaporkan pemilik data 10-Sep-2026, dengan tangkapan layar BBB:
 * panel "Obtained MT — Per Produk" menampilkan GL BORON 3.000 dan GL ALLOY
 * 3.000 berdampingan, Total 6.000 MT — padahal request sales-nya SATU,
 * 3.000 MT. "Jika GL Boron dan GL Alloy sebenarnya merupakan produk yang sama,
 * jangan tampilkan sebagai 2 produk terpisah."
 *
 * Sebabnya sama dengan panel Sales Revision Request: satu produk bisa punya dua
 * kunci di salesRevRequest (ejaan ledger + ejaan kanonik), dan pembangun baris
 * input membandingkan nama MENTAH (`x.prod === nm`), jadi keduanya lolos
 * sebagai produk berbeda.
 *
 * YANG DIKUNCI:
 *   A. Dua ejaan satu produk -> SATU baris input, MT = request sales.
 *   B. Produk berbeda tetap punya barisnya masing-masing.
 *   C. Split satu sumber ke beberapa tujuan yang ternyata produk sama ->
 *      DIJUMLAHKAN (itu memang dua bagian dari satu penerbitan).
 *   D. Nama yang dipulangkan sudah kanonik — itu yang ditulis ke cycle.
 *   E. Pembacaan form: kunci dikanonikkan, kembar TIDAK dijumlahkan.
 *   F. Total yang ditampilkan = total yang disimpan.
 *   G. rrRebuildFromConfirmed tidak menumpuk pasangan revFrom/revTo maupun
 *      siklus Revision Request untuk produk yang sama. Ini akar masalahnya:
 *      tanpa ini, tiap konfirmasi lewat kunci kedua menambah satu baris lagi.
 *
 * Run: node iqdash/tests/test_obtained_satu_baris_per_produk.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');
/* Akhir baris disamakan dulu: repo ini CRLF, sedangkan potongan pola di bawah
   ditulis dengan LF. */
const src  = fs.readFileSync(path.join(JS, '13-rev-mgmt.js'), 'utf8').split('\r\n').join('\n');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

/* Diambil dari berkasnya, bukan disalin. Salinan aturan di berkas uji adalah
   cara ternyaman untuk lulus menguji sesuatu yang sudah tidak dipakai lagi. */
function iris(awalStr, akhirStr, nama) {
  const a = src.indexOf(awalStr);
  if (a < 0) { console.error('BERHENTI: blok "' + nama + '" tidak ketemu'); process.exit(1); }
  const b = src.indexOf(akhirStr, a);
  if (b < 0) { console.error('BERHENTI: ujung blok "' + nama + '" tidak ketemu'); process.exit(1); }
  return src.slice(a, b + akhirStr.length);
}

/* Fungsi utuh, dipotong dengan penghitung kurung kurawal. */
function fungsi(nama) {
  const a = src.indexOf('function ' + nama + '(');
  if (a < 0) { console.error('BERHENTI: function ' + nama + ' tidak ketemu'); process.exit(1); }
  let i = src.indexOf('{', a), d = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (!d) return src.slice(a, i + 1); }
  }
  console.error('BERHENTI: function ' + nama + ' tidak tertutup'); process.exit(1);
}

const blokReq  = iris('  const reqProds = (() => {', '})();', 'reqProds');
const blokProd = iris('    let prodList = [];', '\n\n    // Load existing obtained #2 cycle values', 'prodList');

/* ── Sandbox ───────────────────────────────────────────────────────────── */
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Map, Set,
  isNaN, parseFloat, parseInt, RegExp, MT_LOCALE: 'en-US',
});
ctx.window = ctx; ctx.globalThis = ctx;
vm.runInContext(fs.readFileSync(path.join(JS, '00-num.js'), 'utf8'), ctx, { filename: '00-num.js' });
vm.runInContext(`
  var PRODUCT_ALIASES = { 'GL BORON': 'GL ALLOY', 'GL Boron': 'GL ALLOY',
                          'GI BORON': 'GI ALLOY', 'SHEETPILE': 'SHEET PILE' };
  var canonicalProduct = p => (p && PRODUCT_ALIASES[p]) || p;
  var prodLabel = p => {
    const s = (p == null ? '' : String(p)).trim();
    if (!s) return s;
    const c = canonicalProduct(s);
    if (c && c !== s) return c;
    const hit = Object.keys(PRODUCT_ALIASES).find(k => k.toLowerCase() === s.toLowerCase());
    return hit ? PRODUCT_ALIASES[hit] : s;
  };
  var todayStd = () => '10-Sep-26';
  var currentRole = 'CorpSec';
  var getObtainedByProdAgg = co => (co && co.__agg) || {};
  var salesRevReq = {}, co = {};
  function bangun(srr, revTo) {
    salesRevReq = srr || {};
    co = { revTo: revTo || [], salesRevRequest: salesRevReq };
    ${blokReq}
    ${blokProd}
    return prodList;
  }
`, ctx);
vm.runInContext(fungsi('rrTargets'), ctx);
vm.runInContext(fungsi('rrTargetState'), ctx);
vm.runInContext(fungsi('rrRebuildFromConfirmed'), ctx);
vm.runInContext(fungsi('rrReadObtainedFromForm'), ctx);
vm.runInContext(fungsi('rrUpdateObtTotal'), ctx);

const bangun = (srr, revTo) => { ctx.__a = srr; ctx.__b = revTo; return vm.runInContext('bangun(__a, __b)', ctx); };
const R = (o) => Object.assign({ requested: true }, o);

/* Form palsu: hanya yang benar-benar dibaca kedua fungsi itu. */
function pasangForm(baris) {
  ctx.__baris = baris;
  vm.runInContext(`
    var _el = { textContent: '' };
    var document = {
      querySelectorAll: () => __baris.map(b => ({ dataset: { prod: b[0] }, value: b[1] })),
      getElementById: () => _el,
    };
  `, ctx);
  return () => vm.runInContext('_el.textContent', ctx);
}

console.log('\nA · BBB — dua ejaan satu produk jadi SATU baris, 3.000 MT');
{
  /* Bentuk persis dari cache/iqdash_data.json 10-Sep-2026. */
  const hasil = bangun({
    'GL BORON': R({ status: 'rejected', requestedMT: 3000, confirmedMT: null,
      confirmedDate: '29 Apr 2026', targetProducts: [{ product: 'GL BORON', mt: 3000 }] }),
    'GL ALLOY': R({ status: 'confirmed', revisionType: 'Re-Apply', newProduct: null,
      requestedMT: 3000, confirmedMT: 3000, confirmedDate: '09-Sep-26',
      targetProducts: [{ product: '', mt: 3000 }] }),
    '_revisionType': 'Re-Apply',
  });
  ok(hasil.length === 1, 'satu baris input, bukan dua',
    JSON.stringify(hasil));
  ok(hasil[0] && hasil[0].prod === 'GL ALLOY',
    'namanya kanonik: GL ALLOY, bukan GL BORON', hasil[0] && hasil[0].prod);
  ok(hasil[0] && hasil[0].mt === 3000,
    'MT-nya 3.000 — sejumlah request sales, bukan 6.000', hasil[0] && hasil[0].mt);
}

console.log('\nB · Produk berbeda tetap punya baris masing-masing');
{
  const hasil = bangun({
    'GL BORON':   R({ status: 'confirmed', requestedMT: 1000, confirmedDate: '01-Sep-26' }),
    'GI BORON':   R({ status: 'confirmed', requestedMT: 2000, confirmedDate: '01-Sep-26' }),
    'SHEET PILE': R({ requestedMT: 500 }),
  });
  const nama = hasil.map(h => h.prod).sort();
  ok(hasil.length === 3, 'tiga produk berbeda -> tiga baris', JSON.stringify(nama));
  ok(JSON.stringify(nama) === JSON.stringify(['GI ALLOY', 'GL ALLOY', 'SHEET PILE']),
    'ketiganya kanonik dan benar', JSON.stringify(nama));
}

console.log('\nC · Split ke dua tujuan yang ternyata produk sama -> DIJUMLAHKAN');
{
  /* Ini kebalikan kasus A dan harus dibedakan: di sini SATU permintaan memang
     menerbitkan dua bagian, jadi 1.000 + 2.000 = 3.000 itu benar. */
  const hasil = bangun({
    'HRPO ALLOY': R({ status: 'confirmed', requestedMT: 3000, confirmedDate: '01-Sep-26',
      targetProducts: [{ product: 'GL BORON', mt: 1000 }, { product: 'GL ALLOY', mt: 2000 }] }),
  });
  ok(hasil.length === 1 && hasil[0].prod === 'GL ALLOY' && hasil[0].mt === 3000,
    'satu baris GL ALLOY 3.000 MT', JSON.stringify(hasil));
}

console.log('\nD · Cadangan revTo — kembar juga digabung, TIDAK dijumlahkan');
{
  const hasil = bangun({}, [
    { prod: 'GL BORON', mt: 3000, label: 'After' },
    { prod: 'GL ALLOY', mt: 3000, label: 'After' },
  ]);
  ok(hasil.length === 1 && hasil[0].prod === 'GL ALLOY' && hasil[0].mt === 3000,
    'revTo kembar -> satu baris 3.000, bukan 6.000', JSON.stringify(hasil));
}

console.log('\nE · Pembacaan form: kunci dikanonikkan, kembar tidak dijumlahkan');
{
  /* Halaman yang terlanjur terbuka sebelum pembaruan ini masih punya dua
     input. Yang DISIMPAN tetap harus satu produk, 3.000 MT. */
  pasangForm([['GL BORON', '3,000'], ['GL ALLOY', '3,000']]);
  const r = vm.runInContext('rrReadObtainedFromForm()', ctx);
  ok(Object.keys(r.byProd).length === 1 && r.byProd['GL ALLOY'] === 3000,
    'yang disimpan satu kunci kanonik GL ALLOY = 3.000', JSON.stringify(r.byProd));
  ok(r.total === 3000, 'totalnya 3.000, bukan 6.000', String(r.total));
}
{
  pasangForm([['GL ALLOY', '2,000'], ['GI ALLOY', '1,500']]);
  const r = vm.runInContext('rrReadObtainedFromForm()', ctx);
  ok(r.total === 3500 && r.byProd['GL ALLOY'] === 2000 && r.byProd['GI ALLOY'] === 1500,
    'produk berbeda tetap dijumlahkan seperti biasa', JSON.stringify(r));
}

console.log('\nF · Total di layar = total yang disimpan');
{
  const baca = pasangForm([['GL BORON', '3,000'], ['GL ALLOY', '3,000']]);
  vm.runInContext('rrUpdateObtTotal()', ctx);
  ok(baca() === '3,000 MT', 'label Total menampilkan 3,000 MT', baca());
}

console.log('\nG · AKAR MASALAH — konfirmasi kedua tidak menumpuk baris');
{
  /* Keadaan BBB sebelum tim menekan Konfirmasi pada kunci "GL ALLOY":
     revFrom/revTo sudah berisi sepasang dari kunci "GL BORON". */
  ctx.__co = {
    __agg: { 'GL ALLOY': 1100 },
    obtained: 1100,
    cycles: [{ type: 'Revision Request — GL BORON', mt: 3000, products: { 'GL BORON': 3000 } }],
    revFrom: [{ prod: 'GL BORON', mt: 400, label: 'Before' }],
    revTo:   [{ prod: 'GL BORON', mt: 3000, label: 'After' }],
  };
  ctx.__req = {
    requested: true, status: 'confirmed', requestedMT: 3000, confirmedMT: 3000,
    confirmedDate: '09-Sep-26', targetProducts: [{ product: 'GL ALLOY', mt: 3000 }],
    confirmedTargets: [{ product: 'GL ALLOY', mt: 3000, status: 'confirmed' }],
  };
  vm.runInContext("rrRebuildFromConfirmed(__co, 'GL ALLOY', __req)", ctx);
  const c = ctx.__co;
  ok(c.revFrom.length === 1, 'revFrom tetap satu pasang, tidak bertumpuk',
    JSON.stringify(c.revFrom));
  ok(c.revTo.length === 1, 'revTo tetap satu pasang', JSON.stringify(c.revTo));
  ok(c.revFrom[0].prod === 'GL ALLOY' && c.revTo[0].prod === 'GL ALLOY',
    'yang ditulis nama kanonik', JSON.stringify([c.revFrom[0].prod, c.revTo[0].prod]));
  ok(c.revFrom[0].mt === 1100,
    'sisi Before = obtained produk ini (1.100), bukan nilai lama 400', String(c.revFrom[0].mt));
  const rr = c.cycles.filter(x => /^Revision Request/.test(x.type));
  ok(rr.length === 1, 'hanya satu siklus Revision Request untuk produk ini',
    JSON.stringify(rr.map(x => x.type)));
  ok(rr[0] && rr[0].type === 'Revision Request — GL ALLOY',
    'siklusnya bernama kanonik', rr[0] && rr[0].type);
  ok(rr[0] && JSON.stringify(rr[0].products) === JSON.stringify({ 'GL ALLOY': 3000 }),
    'produk siklusnya satu kunci kanonik', JSON.stringify(rr[0] && rr[0].products));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
