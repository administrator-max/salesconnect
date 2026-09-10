/* SALES REVISION REQUEST — satu baris per PRODUK, bukan per ejaan.
 *
 * Dilaporkan pemilik data 10-Sep-2026: "Pada BBB, ada request reapply untuk
 * produk GI Alloy. Kenapa ada 2 ya? Harusnya saat ada request reapply pada
 * produk yg sama dengan sebelumnya, cukup muncul 1 kolom aja."
 *
 * Sebabnya rev_note berkunci NAMA PRODUK, dan satu produk bisa punya dua ejaan
 * yang hidup berdampingan: permintaan lama tersimpan dengan ejaan ledger
 * ("GL BORON"), yang baru dengan ejaan kanonik ("GL ALLOY"). Panelnya merender
 * satu baris per kunci mentah, jadi satu produk tampil dua kali.
 *
 * YANG DIKUNCI — urutan pemenangnya, karena "ambil yang terbaru" saja SALAH:
 *
 *   A. Dua ejaan satu produk menyatu jadi satu baris.
 *   B. Yang BELUM diputus menang atas yang sudah — walau yang sudah diputus
 *      lebih baru. Ini kasus LCP: yang lama sudah dikonfirmasi 21-May-26,
 *      yang baru masih menunggu. Menyembunyikan yang menunggu berarti
 *      menyembunyikan satu-satunya baris yang masih menuntut tindakan CorpSec.
 *   C. Selain itu, tanggal konfirmasi terbaru yang menang.
 *   D. Bila tanggalnya seri, ejaan kanonik yang menang (kasus SJH).
 *   E. Produk yang BERBEDA tidak boleh ikut menyatu.
 *   F. Yang tergeser tidak hilang diam-diam — barisnya membawa catatan.
 *   G. Kunci yang dipulangkan tetap kunci ASLI entri yang menang, supaya
 *      tombol Konfirmasi/Batal menulis balik ke tempat yang benar. Ini yang
 *      paling berbahaya kalau salah: tombolnya akan menyimpan ke entri lain.
 *
 * Run: node iqdash/tests/test_revreq_satu_baris_per_produk.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

/* Kelompokkan memakai ATURAN YANG SAMA dengan 13-rev-mgmt.js. Diambil dari
   berkasnya, bukan disalin — salinan aturan di berkas uji adalah cara
   ternyaman untuk lulus menguji sesuatu yang sudah tidak dipakai lagi. */
const sumber = fs.readFileSync(path.join(JS, '13-rev-mgmt.js'), 'utf8');
const awal = sumber.indexOf('  const reqProds = (() => {');
const akhir = sumber.indexOf('})();', awal) + '})();'.length;
if (awal < 0 || akhir < 5) { console.error('BERHENTI: blok pengelompokan tidak ketemu di 13-rev-mgmt.js'); process.exit(1); }
const blok = sumber.slice(awal, akhir);

const ctx = vm.createContext({ console, Date, Math, JSON, Number, String, Object, Array, Map, Set,
  isNaN, parseFloat, parseInt, RegExp, MT_LOCALE: 'en-US' });
ctx.window = ctx; ctx.globalThis = ctx;
vm.runInContext(fs.readFileSync(path.join(JS, '00-num.js'), 'utf8'), ctx, { filename: '00-num.js' });
vm.runInContext(`
  var PRODUCT_ALIASES = { 'GL BORON': 'GL ALLOY', 'GI BORON': 'GI ALLOY', 'SHEETPILE': 'SHEET PILE' };
  var canonicalProduct = function (p) { return (p && PRODUCT_ALIASES[p]) || p; };
  var salesRevReq = {};
  function kelompok(input) { salesRevReq = input; ${blok} return reqProds; }
`, ctx);
const kelompok = inp => { ctx.__i = inp; return vm.runInContext('kelompok(__i)', ctx); };

const R = (o) => Object.assign({ requested: true }, o);

console.log('\nA · Dua ejaan satu produk menyatu jadi satu baris');
{
  const hasil = kelompok({
    'GL BORON': R({ status: 'rejected',  requestedMT: 3000, confirmedDate: '29 Apr 2026' }),
    'GL ALLOY': R({ status: 'confirmed', requestedMT: 3000, confirmedDate: '09-Sep-26' }),
  });
  ok(hasil.length === 1, 'BBB: 2 ejaan -> 1 baris', 'dapat ' + hasil.length);
  ok(hasil[0] && hasil[0][0] === 'GL ALLOY',
    'yang tampil entri 09-Sep-26 yang dikonfirmasi', hasil[0] && hasil[0][0]);
}

console.log('\nB · Yang BELUM diputus menang, walau yang lain lebih baru');
{
  /* LCP: lama sudah dikonfirmasi 21-May-26, baru masih menunggu putusan.
     Kalau aturannya cuma "terbaru", baris yang menunggu ini akan hilang —
     padahal itu satu-satunya yang masih menuntut tindakan CorpSec. */
  const hasil = kelompok({
    'GL BORON': R({ status: 'confirmed', requestedMT: 2725, confirmedDate: '21-May-26' }),
    'GL ALLOY': R({ requestedMT: 3000 }),
  });
  ok(hasil.length === 1, 'LCP: 1 baris', 'dapat ' + hasil.length);
  ok(hasil[0] && hasil[0][0] === 'GL ALLOY' && !hasil[0][1].status,
    'yang tampil yang MENUNGGU, bukan yang sudah dikonfirmasi lebih dulu',
    JSON.stringify(hasil[0] && [hasil[0][0], hasil[0][1].status || '(menunggu)']));
}

console.log('\nC · Selain itu, tanggal terbaru yang menang');
{
  const hasil = kelompok({
    'GL BORON': R({ status: 'confirmed', requestedMT: 3000, confirmedDate: '29 Apr 2026' }),
    'GL ALLOY': R({ status: 'confirmed', requestedMT: 3000, confirmedDate: '01-Sep-26' }),
  });
  ok(hasil.length === 1 && hasil[0][1].confirmedDate === '01-Sep-26',
    'KJK: keduanya dikonfirmasi -> yang 01-Sep-26 yang tampil',
    JSON.stringify(hasil.map(h => h[1].confirmedDate)));
}

console.log('\nD · Tanggal seri -> ejaan kanonik yang menang');
{
  const hasil = kelompok({
    'GL BORON': R({ status: 'rejected',  requestedMT: 2700, confirmedDate: '01-Sep-26' }),
    'GL ALLOY': R({ status: 'confirmed', requestedMT: 3000, confirmedDate: '01-Sep-26' }),
  });
  ok(hasil.length === 1 && hasil[0][0] === 'GL ALLOY',
    'SJH: dua-duanya 01-Sep-26 -> ejaan kanonik yang tampil',
    JSON.stringify(hasil.map(h => h[0])));
}

console.log('\nE · Produk BERBEDA tetap berbaris sendiri-sendiri');
{
  const hasil = kelompok({
    'GL BORON':    R({ status: 'confirmed', requestedMT: 1000, confirmedDate: '01-Sep-26' }),
    'GI BORON':    R({ status: 'confirmed', requestedMT: 2000, confirmedDate: '01-Sep-26' }),
    'SHEET PILE':  R({ requestedMT: 500 }),
  });
  ok(hasil.length === 3, 'tiga produk berbeda -> tetap tiga baris', 'dapat ' + hasil.length);
  const nama = hasil.map(h => vm.runInContext('canonicalProduct(' + JSON.stringify(h[0]) + ')', ctx)).sort();
  ok(JSON.stringify(nama) === JSON.stringify(['GI ALLOY', 'GL ALLOY', 'SHEET PILE']),
    'ketiganya produk yang benar', JSON.stringify(nama));
}

console.log('\nF · Yang tergeser tidak hilang diam-diam');
{
  const hasil = kelompok({
    'GL BORON': R({ status: 'rejected', requestedMT: 3000, confirmedDate: '29 Apr 2026' }),
    'GL ALLOY': R({ status: 'confirmed', requestedMT: 3000, confirmedDate: '09-Sep-26' }),
  });
  const jejak = hasil[0] && hasil[0][1]._riwayatSebelumnya;
  ok(!!jejak, 'baris membawa catatan permintaan sebelumnya', String(jejak));
  ok(/ditolak/.test(String(jejak)) && /29 Apr 2026/.test(String(jejak)),
    'catatannya menyebut putusan dan tanggalnya', String(jejak));
}

console.log('\nG · Kunci aslinya dipertahankan — tombol menulis ke tempat yang benar');
{
  /* Kalau pengelompokan memulangkan nama KANONIK sebagai kunci, tombol
     Konfirmasi/Batal akan menyimpan ke kunci yang tidak ada di rev_note, dan
     putusan CorpSec menguap tanpa pesan error. */
  const hasil = kelompok({
    'GL BORON': R({ status: 'confirmed', requestedMT: 2725, confirmedDate: '21-May-26' }),
  });
  ok(hasil.length === 1 && hasil[0][0] === 'GL BORON',
    'satu entri berejaan lama tetap memulangkan kunci "GL BORON", bukan "GL ALLOY"',
    JSON.stringify(hasil.map(h => h[0])));
}

console.log('\nH · Yang tidak diminta tetap disaring');
{
  const hasil = kelompok({
    'GL ALLOY':  R({ status: 'confirmed', requestedMT: 3000, confirmedDate: '01-Sep-26' }),
    'GI ALLOY':  { requested: false, requestedMT: 999 },
    '_revisionType': 'Re-Apply',
  });
  ok(hasil.length === 1 && hasil[0][0] === 'GL ALLOY',
    'entri requested:false dan penanda _revisionType tidak ikut jadi baris',
    JSON.stringify(hasil.map(h => h[0])));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
