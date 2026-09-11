/* TOTAL SUBMITTED memuat re-apply yang sudah dikonfirmasi, dan BARIS HISTORIS
 * produk yang sudah direvisi tidak lagi membawa Obtained.
 *
 * Diminta pemilik data 11-Sep-2026, lengkap dengan angka yang diharapkan:
 *   SJH 11.700 · LCP 11.725 · KJK 12.000 · BBB 11.300
 * Ketiganya yang pertama = Σ siklus Submit + 3.000 MT re-apply yang baru
 * dikonfirmasi CorpSec dan belum punya siklus Submit sendiri.
 *
 * Dan untuk product revision, contoh DIOR: "Baris Wear Plate 6.000 MT tetap
 * tampil sebagai historical, tetapi dibuat grey/inactive. Obtained pada baris
 * Wear Plate menjadi '-'. Obtained 100 MT dipindahkan ke baris GL Alloy."
 *
 * YANG DIKUNCI:
 *   A. Re-apply dikonfirmasi + belum ada siklus Submit -> ikut Total Submitted.
 *   B. "Jangan double count antar cycle": begitu siklus Submit-nya dicatat,
 *      permintaannya BERHENTI dihitung. Ini kasus LCP yang punya dua
 *      permintaan; yang 21-May-26 sudah menjadi Submit #2.
 *   C. Kuota yang sudah terbit menutup permintaan. Tanpa syarat ini 20 company
 *      ikut terhitung dan totalnya melonjak 52.257 MT.
 *   D. revType 'complete' tidak menyumbang apa-apa (SMS, DIOR).
 *   E. Delta negatif = revisi yang sudah dieksekusi, bukan pengajuan.
 *   F. Baris historis: Obtained null (dicetak "—"), Submit tetap angka
 *      pengajuan aslinya.
 *   G. SATU definisi: company yang membawa angka re-apply di Total Submitted
 *      adalah persis company yang tampil Under Submission.
 *
 * Run: node iqdash/tests/test_submitted_reapply_dan_historis.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

const node = () => ({ style: {}, classList: { add(){}, remove(){}, toggle(){} },
  querySelectorAll: () => [], querySelector: () => null, appendChild(){}, textContent: '', innerHTML: '' });
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean, MT_LOCALE: 'en-US',
  localStorage: { getItem: () => null, setItem: () => {} },
  Chart: function () { return { destroy() {} }; },
  document: { getElementById: node, querySelectorAll: () => [], querySelector: () => null,
    createElement: node, addEventListener: () => {}, body: { appendChild(){} } },
});
ctx.window = ctx; ctx.globalThis = ctx;
['00-num.js', '01-data.js', '01a-quota-year.js', '02-period-filter.js', '04-charts.js']
  .forEach(f => { try { vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }); }
                  catch (e) { console.log('  (lewati ' + f + ': ' + e.message.slice(0, 60) + ')'); } });
ctx.__t = { 'GL BORON': 'GL ALLOY', 'GI BORON': 'GI ALLOY' };
vm.runInContext('PRODUCT_ALIASES = __t;', ctx);

const panggil = (fn, co) => { ctx.__co = co; return vm.runInContext(`${fn}(__co)`, ctx); };
const submitted = co => panggil('canonicalSubmitted', co);
const reapply   = co => panggil('pendingReapplyMT', co);
const tahap     = co => panggil('outstandingStage', co);

const cyc = (type, mt, o) => Object.assign({ type, mt, products: {} }, o || {});
/* Permintaan Sales bertanda Re-Apply. WAJIB ada: sejak 11-Sep-2026 hanya
   re-apply yang menambah Submitted, revisi tidak — lihat kasus I. */
const SRR_REAPPLY = { 'GL ALLOY': { requested: true, status: 'confirmed', revisionType: 'Re-Apply' } };
const REQ = (mt, tgl, prod) => cyc('Revision Request — ' + prod, mt,
  { submitDate: tgl, releaseDate: tgl, products: { [prod]: mt } });

console.log('\nA · Re-apply dikonfirmasi, belum ada siklus Submit -> ikut dihitung');
{
  /* SJH: Submit #1 6.000 + Submit #2 2.700 + re-apply 3.000 = 11.700 */
  const sjh = { code: 'SJH', revType: 'active', salesRevRequest: SRR_REAPPLY, cycles: [
    cyc('Submit #1', 6000, { submitDate: '17/11/2025', releaseDate: '12/12/2025', pertekDate: '12/12/2025' }),
    cyc('Obtained #1', 300, { releaseDate: '06/01/2026', spiDate: '06/01/2026' }),
    REQ(3000, '01-Sep-26', 'GL ALLOY'),
    cyc('Submit #2', 2700, { pertekDate: '15/05/2026', releaseDate: '15/05/2026' }),
    cyc('Obtained #2', 90, {}),
  ]};
  ok(submitted(sjh) === 11700, 'SJH = 11.700 MT', String(submitted(sjh)));
  ok(reapply(sjh) === 3000, 'yang disumbang re-apply 3.000 MT', String(reapply(sjh)));
}

console.log('\nB · Jangan double count — permintaan yang sudah jadi siklus Submit');
{
  /* LCP punya DUA permintaan. Yang 21-May-26 sudah menjadi Submit #2
     (submitDate 21/05/2026), jadi tidak boleh dihitung lagi. */
  const lcp = { code: 'LCP', revType: 'active', salesRevRequest: SRR_REAPPLY, cycles: [
    cyc('Submit #1', 6000, { submitDate: '23/10/2025', releaseDate: '18/11/2025', pertekDate: '18/11/2025' }),
    cyc('Obtained #1', 275, { releaseDate: '16/12/2025', spiDate: '16/12/2025' }),
    cyc('Submit #2', 2725, { submitDate: '21/05/2026', releaseDate: '18/06/2026', pertekDate: '18/06/2026' }),
    REQ(2725, '21-May-26', 'GL BORON'),
    cyc('Obtained #2', 3000, { releaseDate: '16/07/2026', spiDate: '16/07/2026' }),
    REQ(3000, '10-Sep-26', 'GL ALLOY'),
  ]};
  ok(submitted(lcp) === 11725, 'LCP = 11.725 MT, bukan 14.450', String(submitted(lcp)));
  ok(reapply(lcp) === 3000, 'hanya permintaan 10-Sep yang dihitung', String(reapply(lcp)));

  /* Keadaan BERIKUTNYA, dan inilah yang benar-benar mengunci syarat (d):
     tim mencatat Submit #3 untuk re-apply itu, PERTEK-nya belum terbit. Di
     sini tidak ada Obtained baru yang bisa menutup permintaannya, jadi
     satu-satunya yang mencegah 3.000 MT terhitung dua kali adalah keberadaan
     siklus Submit yang lebih baru. Tanpa syarat (d) angkanya jadi 17.725. */
  const lanjut = { code: 'LCP', revType: 'active', salesRevRequest: SRR_REAPPLY, cycles: [
    cyc('Submit #1', 6000, { submitDate: '23/10/2025', releaseDate: '18/11/2025', pertekDate: '18/11/2025' }),
    cyc('Obtained #1', 275, { releaseDate: '16/12/2025', spiDate: '16/12/2025' }),
    cyc('Submit #2', 2725, { submitDate: '21/05/2026', releaseDate: '18/06/2026', pertekDate: '18/06/2026' }),
    cyc('Obtained #2', 3000, { releaseDate: '16/07/2026', spiDate: '16/07/2026' }),
    REQ(3000, '10-Sep-26', 'GL ALLOY'),
    cyc('Submit #3', 3000, { submitDate: '20/09/2026' }),      // PERTEK belum terbit
  ]};
  ok(submitted(lanjut) === 11725,
    'sesudah Submit #3 dicatat, angkanya TETAP 11.725 — berpindah, tidak bertumpuk',
    String(submitted(lanjut)));
  ok(reapply(lanjut) === 0, 'permintaannya berhenti dihitung', String(reapply(lanjut)));
}

console.log('\nC · Kuota yang sudah terbit menutup permintaan');
{
  const sudah = { code: 'X', revType: 'active', salesRevRequest: SRR_REAPPLY, cycles: [
    cyc('Submit #1', 6000, { submitDate: '01/01/2026', releaseDate: '01/02/2026', pertekDate: '01/02/2026' }),
    REQ(3000, '01-Mar-26', 'GL ALLOY'),
    cyc('Obtained #1', 3000, { releaseDate: '01/05/2026', spiDate: '01/05/2026' }),
  ]};
  ok(submitted(sudah) === 6000, 'Obtained terbit SESUDAH konfirmasi -> tidak ditambahkan',
    String(submitted(sudah)));
  const belum = { code: 'Y', revType: 'active', salesRevRequest: SRR_REAPPLY, cycles: [
    cyc('Submit #1', 6000, { submitDate: '01/01/2026', releaseDate: '01/02/2026', pertekDate: '01/02/2026' }),
    cyc('Obtained #1', 400, { releaseDate: '01/05/2026', spiDate: '01/05/2026' }),
    REQ(3000, '01-Sep-26', 'GL ALLOY'),
  ]};
  ok(submitted(belum) === 9000, 'Obtained yang lebih TUA tidak menutupnya', String(submitted(belum)));
}

console.log('\nD · revType "complete" tidak menyumbang (SMS, DIOR)');
{
  const sms = { code: 'SMS', revType: 'complete', cycles: [
    cyc('Submit #1', 6000, { submitDate: '01/01/2026', releaseDate: '01/02/2026', pertekDate: '01/02/2026' }),
    cyc('Obtained #1', 150, { releaseDate: '05/03/2026', spiDate: '05/03/2026' }),
    REQ(150, '15-Jun-26', 'SHEET PILE'),
  ]};
  ok(submitted(sms) === 6000 && reapply(sms) === 0,
    'perubahan yang penerbitannya dicatat di status tidak menambah Submitted',
    JSON.stringify([submitted(sms), reapply(sms)]));
}

console.log('\nE · Delta negatif = revisi yang sudah dieksekusi');
{
  const dior = { code: 'DIOR', revType: 'active', salesRevRequest: SRR_REAPPLY, cycles: [
    cyc('Submit #1', 6000, { submitDate: '05/11/2025', releaseDate: '20/07/2026', pertekDate: '20/07/2026' }),
    cyc('Obtained #1', 100, { products: { 'BORDES ALLOY': 100 } }),
    cyc('Revision Request — BORDES ALLOY', 100, { submitDate: '03-Sep-26', releaseDate: '03-Sep-26',
      products: { 'BORDES ALLOY': -100, 'GL ALLOY': 100 } }),
  ]};
  ok(reapply(dior) === 0, 'siklus berdelta negatif tidak menambah Submitted', String(reapply(dior)));
}

console.log('\nF · Baris historis: Obtained "—", Submit tetap angka aslinya');
{
  /* Dipotong dari 01a-quota-year.js, bukan disalin. */
  const src = fs.readFileSync(path.join(JS, '01a-quota-year.js'), 'utf8').split('\r\n').join('\n');
  const i = src.indexOf('submitMT:   opsi.historis');
  const j = src.indexOf('\n', src.indexOf('obtainedMT: opsi.historis', i));
  const blok = i < 0 ? '' : src.slice(i, j);
  ok(/obtainedMT:\s*opsi\.historis\s*\?\s*null/.test(blok),
    'baris historis memulangkan obtainedMT null, bukan angka', blok.slice(0, 160));
  /* subTampil, bukan sub. Keduanya dari scopedSubmittedByProd(), bedanya
     subTampil MASIH memuat produk yang kuotanya sudah pindah — persis supaya
     kolom Submit baris historis tetap menampilkan tonase asli (DIOR 6.000 MT)
     sementara angka itu tidak ikut Total Submitted. Sempat salah 11-Sep-2026:
     memakai `sub` membuat baris DIOR terbaca 100 MT, bukan 6.000. */
  ok(/submitMT:\s*opsi\.historis\s*\?\s*\(ambil\(subTampil, prod\)/.test(blok),
    'baris historis memakai peta yang masih memuat produk dipindah', blok.slice(0, 200));
  const src1a = fs.readFileSync(path.join(JS, '02-period-filter.js'), 'utf8');
  ok(/function scopedSubmittedByProd\(co, sertakanDipindah\)/.test(src1a),
    'saklarnya ada di scopedSubmittedByProd, bukan fungsi kedua');

  /* Perendernya mencetak null sebagai tanda pisah. */
  const r = fs.readFileSync(path.join(JS, '05a-spi-terbit.js'), 'utf8');
  ok(/r\.obtainedMT \? mt\(r\.obtainedMT\) : _stDash\(\)/.test(r),
    'perender mencetak "—" untuk obtained kosong');
  ok(/mati \? 'opacity:\.62;' : ''/.test(r),
    'baris non-aktif dirender kelabu');
}

console.log('\nG · Satu definisi — Submitted dan Under Submission sejalan');
{
  const co = { code: 'Z', revType: 'active', salesRevRequest: SRR_REAPPLY, cycles: [
    cyc('Submit #1', 6000, { submitDate: '01/01/2026', releaseDate: '01/02/2026', pertekDate: '01/02/2026' }),
    cyc('Obtained #1', 400, { releaseDate: '01/05/2026', spiDate: '01/05/2026' }),
    REQ(3000, '01-Sep-26', 'GL ALLOY'),
  ]};
  ok(reapply(co) > 0 && tahap(co) !== null,
    'company yang menyumbang re-apply juga berstatus berjalan',
    JSON.stringify([reapply(co), tahap(co)]));
  const src4 = fs.readFileSync(path.join(JS, '04-charts.js'), 'utf8');
  ok(/pendingReapplyCycles\(d\)\.length > 0/.test(src4),
    'outstandingStage memakai pendingReapplyCycles(), bukan salinan aturannya');
}

console.log('\nI · REVISI tidak menambah Submitted, hanya RE-APPLY');
{
  /* Kasus IKM. Acuan PERTEK & SPI 11-Sep-2026 menyebut GI ALLOY 12.250 MT,
     yaitu siklus Submit saja. Permintaan 4.150 MT-nya TIDAK ditambahkan karena
     itu perubahan, bukan penambahan: revisionType-nya kosong dan status
     update-nya berbunyi "Submit MOI Perubahan". Dashboard sempat membaca
     16.400 sebelum aturan ini dipasang. */
  const dasar = () => ({ code: 'IKM', revType: 'active', cycles: [
    cyc('Submit #1', 12250, { submitDate: '30/04/2026', releaseDate: '30/06/2026', pertekDate: '30/06/2026' }),
    cyc('Obtained #1', 4150, { releaseDate: '08/07/2026', spiDate: '08/07/2026' }),
    REQ(4150, '13-Aug-26', 'GI ALLOY'),
  ] });

  const revisi = dasar();
  revisi.salesRevRequest = { 'GI ALLOY': { requested: true, status: 'confirmed' } };
  ok(submitted(revisi) === 12250,
    'permintaan tanpa tanda Re-Apply tidak menambah Submitted', String(submitted(revisi)));
  ok(reapply(revisi) === 0, 'sumbangannya nol', String(reapply(revisi)));

  /* Tapi IKM TETAP harus tampil Under Submission — permohonannya memang masih
     berjalan. Dua pertanyaan berbeda, dua fungsi berbeda; kalau keduanya
     disatukan, salah satunya pasti salah. */
  ok(tahap(revisi) !== null, 'company-nya tetap terbaca sedang berjalan',
    JSON.stringify(tahap(revisi)));

  const reApply = dasar();
  reApply.salesRevRequest = { 'GI ALLOY': { requested: true, status: 'confirmed', revisionType: 'Re-Apply' } };
  ok(submitted(reApply) === 16400,
    'yang bertanda Re-Apply tetap menambah seperti biasa', String(submitted(reApply)));
}

console.log('\nJ · Produk yang kuotanya sudah PINDAH tidak menambah Submitted');
{
  /* DIOR: Submit #1 6.000 MT BORDES ALLOY, lalu kuotanya pindah ke GL ALLOY.
     Acuan PERTEK & SPI 11-Sep-2026 tidak mencantumkan BORDES ALLOY sama sekali,
     dan Submitted GL ALLOY-nya bertanda "-". Jadi sumbangan DIOR ke Total
     Submitted adalah NOL. Enam company berbentuk begini, masing-masing 6.000
     MT; totalnya 36.000 MT, dan itulah selisih terbesar antara kartu Overview
     (286.545) dan acuan (252.845). */
  const dior = { code: 'DIOR', revType: 'complete',
    utilizationByProd: { 'GL ALLOY': 0 }, availableByProd: { 'GL ALLOY': 100 },
    cycles: [
      cyc('Submit #1', 6000, { submitDate: '05/11/2025', releaseDate: '20/07/2026',
        pertekDate: '20/07/2026', products: { 'BORDES ALLOY': 6000 } }),
      cyc('Obtained #1', 100, { products: { 'BORDES ALLOY': 100 } }),
      cyc('Revision Request — BORDES ALLOY', 100, { submitDate: '03-Sep-26', releaseDate: '03-Sep-26',
        products: { 'BORDES ALLOY': -100, 'GL ALLOY': 100 } }),
      cyc('Obtained #2', 0, { releaseDate: '31/08/2026', spiDate: '31/08/2026', products: {} }),
    ] };
  const pindah = panggil('revisedAwayProducts', dior);
  ok(pindah && pindah.has && pindah.has('BORDES ALLOY'),
    'BORDES ALLOY dikenali sebagai produk yang kuotanya sudah pindah',
    JSON.stringify(pindah && [...pindah]));
  ok(!(pindah && pindah.has('GL ALLOY')), 'GL ALLOY yang aktif TIDAK ikut ditandai');
  ok(submitted(dior) === 0, 'Submitted DIOR = 0, bukan 6.000', String(submitted(dior)));

  /* Pagar terhadap percobaan pertama yang GAGAL: memakai productGrantHistory
     mentah-mentah ikut menandai produk yang MASIH dipegang, dan Total Submitted
     seluruh dashboard jatuh dari 286.545 ke 12.000. */
  const biasa = { code: 'HDP', revType: 'none',
    utilizationByProd: { 'GL ALLOY': 1000 }, availableByProd: { 'GL ALLOY': 0 },
    cycles: [
      cyc('Submit #1', 11200, { submitDate: '01/01/2026', releaseDate: '01/02/2026',
        pertekDate: '01/02/2026', products: { 'GL ALLOY': 11200 } }),
      cyc('Obtained #1', 1000, { releaseDate: '05/02/2026', spiDate: '05/02/2026',
        products: { 'GL ALLOY': 1000 } }),
    ] };
  ok(panggil('revisedAwayProducts', biasa).size === 0,
    'company tanpa revisi tidak menandai apa pun');
  ok(submitted(biasa) === 11200, 'Submitted-nya utuh 11.200', String(submitted(biasa)));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
