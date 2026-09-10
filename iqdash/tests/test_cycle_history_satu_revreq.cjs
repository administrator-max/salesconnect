/* CYCLE HISTORY — satu baris "Revision Request" per produk.
 *
 * Ketahuan 10-Sep-2026 saat menyapu 41 company di pratinjau: KJK dan LCP
 * menampilkan DUA baris yang terbaca persis sama, "Revision Request — GL
 * ALLOY". Datanya menyimpan dua siklus, satu berejaan "GL BORON" dan satu
 * "GL ALLOY", jadi setelah nama diseragamkan keduanya tampil identik.
 *
 * rrRebuildFromConfirmed() memang mengganti dan bukan menumpuk, tapi sebelum
 * pembandingnya dikanonikkan kedua ejaan itu tidak dikenali sebagai satu
 * produk. Sisa data itu masih ada, jadi garis waktunya digabung saat dirender.
 *
 * YANG DIKUNCI:
 *   A. Dua Revision Request satu produk -> satu baris, yang TERBARU.
 *   B. Yang tergeser tidak hilang diam-diam: barisnya membawa jejak.
 *   C. Produk berbeda tetap punya barisnya masing-masing.
 *   D. Siklus selain Revision Request tidak pernah disentuh. Obtained #1 dan
 *      Obtained #2 adalah dua penerbitan sungguhan; menggabungkannya akan
 *      menghapus kuota dari layar.
 *   E. INDEKS ASLI dipertahankan. Tombol "✏️ Tanggal" menyunting
 *      co.cycles[idx]; kalau yang dipakai nomor urut daftar tersaring, tim
 *      akan menyunting siklus yang salah tanpa pesan apa pun. Ini bagian yang
 *      paling berbahaya kalau meleset.
 *
 * Run: node iqdash/tests/test_cycle_history_satu_revreq.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');
const src  = fs.readFileSync(path.join(JS, '13-rev-mgmt.js'), 'utf8').split('\r\n').join('\n');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

/* Diambil dari berkasnya, bukan disalin. */
const awal  = src.indexOf('  const acTampil = (() => {');
const akhir = src.indexOf('  })();', awal) + '  })();'.length;
if (awal < 0 || akhir < 6) { console.error('BERHENTI: blok acTampil tidak ketemu'); process.exit(1); }
const blok = src.slice(awal, akhir);

const ctx = vm.createContext({ console, Date, Math, JSON, Number, String, Object, Array, Map, Set,
  isNaN, parseFloat, parseInt, RegExp, MT_LOCALE: 'en-US' });
ctx.window = ctx; ctx.globalThis = ctx;
vm.runInContext(fs.readFileSync(path.join(JS, '00-num.js'), 'utf8'), ctx, { filename: '00-num.js' });
vm.runInContext(`
  var PRODUCT_ALIASES = { 'GL BORON': 'GL ALLOY', 'GI BORON': 'GI ALLOY', 'SHEETPILE': 'SHEET PILE' };
  var canonicalProduct = p => (p && PRODUCT_ALIASES[p]) || p;
  var prodLabel = p => {
    const s = (p == null ? '' : String(p)).trim();
    if (!s) return s;
    const c = canonicalProduct(s);
    return (c && c !== s) ? c : s;
  };
  var ac = [];
  function saring(daftarSiklus) {
    ac = daftarSiklus;
${blok}
    return acTampil;
  }
`, ctx);
const saring = d => { ctx.__d = d; return vm.runInContext('saring(__d)', ctx); };

const RR = (prod, mt, tgl) => ({ type: 'Revision Request — ' + prod, mt,
  submitDate: tgl, releaseDate: tgl, products: { [prod]: mt } });

console.log('\nA · KJK — dua Revision Request satu produk jadi SATU baris');
{
  /* Bentuk persis dari master 10-Sep-2026. */
  const hasil = saring([
    { type: 'Submit #1',   mt: 6000, submitDate: '21-Oct-25' },
    { type: 'Obtained #1', mt: 950,  submitDate: '03-Dec-25' },
    RR('GL BORON', 3000, '29 Apr 2026'),
    RR('GL ALLOY', 3000, '01-Sep-26'),
  ]);
  const rr = hasil.filter(x => /^Revision Request/.test(x.c.type));
  ok(rr.length === 1, 'satu baris Revision Request, bukan dua',
    JSON.stringify(rr.map(x => x.c.type)));
  ok(rr[0] && rr[0].c.submitDate === '01-Sep-26',
    'yang tampil yang TERBARU, 01-Sep-26', rr[0] && rr[0].c.submitDate);
  ok(hasil.length === 3, 'siklus lain tetap utuh', 'dapat ' + hasil.length);
}

console.log('\nB · Yang tergeser membawa jejak, tidak hilang diam-diam');
{
  const hasil = saring([RR('GL BORON', 2725, '21-May-26'), RR('GL ALLOY', 3000, '10-Sep-26')]);
  const jejak = hasil[0] && hasil[0].jejak;
  ok(!!jejak, 'baris yang menang membawa catatan', String(jejak));
  ok(/2,725/.test(String(jejak)), 'catatannya menyebut tonase yang lama', String(jejak));
}

console.log('\nC · Produk berbeda tetap berbaris sendiri-sendiri');
{
  const hasil = saring([
    RR('GL BORON', 1000, '01-Sep-26'),
    RR('GI BORON', 2000, '01-Sep-26'),
    RR('SHEET PILE', 500, '01-Sep-26'),
  ]);
  ok(hasil.length === 3, 'tiga produk berbeda -> tiga baris', 'dapat ' + hasil.length);
}

console.log('\nD · Siklus selain Revision Request TIDAK pernah digabung');
{
  /* Obtained #1 dan Obtained #2 adalah dua penerbitan sungguhan. Kalau aturan
     ini salah kena, kuota menghilang dari layar. */
  const hasil = saring([
    { type: 'Obtained #1', mt: 300, submitDate: '23-Dec-25', products: { 'GL ALLOY': 300 } },
    { type: 'Obtained #2', mt: 90,  submitDate: '25-Jun-26', products: { 'GL ALLOY': 90 } },
    { type: 'Submit #2',   mt: 2700, submitDate: '17-Apr-26' },
    { type: 'Submit #3',   mt: 3000, submitDate: '01-Sep-26' },
  ]);
  ok(hasil.length === 4, 'keempatnya tetap tampil', 'dapat ' + hasil.length);
  ok(hasil.every(x => !x.jejak), 'tidak ada yang diberi jejak', JSON.stringify(hasil.map(x=>x.jejak)));
}

console.log('\nE · Indeks ASLI dipertahankan — tombol Tanggal menyunting siklus yang benar');
{
  const siklus = [
    { type: 'Submit #1',   mt: 6000, submitDate: '21-Oct-25' },
    RR('GL BORON', 3000, '29 Apr 2026'),
    { type: 'Obtained #1', mt: 950, submitDate: '03-Dec-25' },
    RR('GL ALLOY', 3000, '01-Sep-26'),
    { type: 'Obtained #2', mt: 450, submitDate: '05-Sep-26' },
  ];
  const hasil = saring(siklus);
  const meleset = hasil.filter(x => siklus[x.idx] !== x.c);
  ok(!meleset.length, 'setiap baris menunjuk balik ke co.cycles[idx] yang benar',
    JSON.stringify(meleset.map(x => [x.idx, x.c.type, siklus[x.idx] && siklus[x.idx].type])));
  const rr = hasil.find(x => /^Revision Request/.test(x.c.type));
  ok(rr && rr.idx === 3, 'baris Revision Request yang menang berindeks 3, bukan 1',
    rr && String(rr.idx));
  ok(JSON.stringify(hasil.map(x => x.idx)) === JSON.stringify([0, 2, 3, 4]),
    'indeks yang tampil 0,2,3,4 — yang dibuang indeks 1', JSON.stringify(hasil.map(x => x.idx)));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
