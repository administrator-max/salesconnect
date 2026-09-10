/* RENDER TAHAP 2 harus tetap jalan di tab yang TERSEMBUNYI.
 *
 * Ditemukan 10-Sep-2026 saat memeriksa tampilan: tabel PERTEK & SPI,
 * Available Quota, dan All Companies kosong sama sekali. Sebabnya seluruh
 * render tahap 2 dijadwalkan lewat requestAnimationFrame saja.
 *
 * rAF adalah panggilan balik MENGGAMBAR, bukan penjadwal: di tab tersembunyi ia
 * tidak pernah menyala. Dan tab tersembunyi bukan kasus langka — membuka
 * tautan dashboard di tab latar, atau peramban yang memulihkan sesi berisi
 * banyak tab, keduanya menghasilkan itu.
 *
 * Terukur di peramban: dengan document.hidden true, rAF tidak menyala sama
 * sekali dalam 1,5 detik dan #spiTerbitBody tetap nol baris; dipanggil manual,
 * tabelnya terisi 57 baris tanpa galat. Jadi kodenya benar, penjadwalnya yang
 * salah.
 *
 * Jebakan yang sama sudah kena sekali hari ini di penyegar otomatis
 * (22-auto-refresh.js), jadi ini pola yang perlu dikunci, bukan satu kejadian.
 *
 * YANG DIKUNCI:
 *   A. Tanpa rAF sama sekali (persis tab tersembunyi), SEMUA render tahap 2
 *      tetap dipanggil lewat jaring setTimeout.
 *   B. Dengan rAF hidup, hasilnya sama dan TIDAK dikerjakan dua kali.
 *   C. Grup B juga terlindungi, bukan cuma grup A.
 *
 * Run: node iqdash/tests/test_fase2_tab_tersembunyi.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');
const src  = fs.readFileSync(path.join(JS, '19-init.js'), 'utf8').split('\r\n').join('\n');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

/* Diambil dari berkasnya, bukan disalin. */
const awal  = src.indexOf('  let _fase2Sudah = false;');
const akhir = src.indexOf('setTimeout(_fase2, 50);', awal);
if (awal < 0 || akhir < 0) { console.error('BERHENTI: blok tahap 2 tidak ketemu di 19-init.js'); process.exit(1); }
const blok = src.slice(awal, akhir + 'setTimeout(_fase2, 50);'.length);

const RENDER_A = ['renderSPI', 'buildSpiTerbitTable', 'renderMain', 'buildRevList',
  'buildPendingQuick', 'buildPendingTable', 'buildRevDetailTable', 'buildCmpList'];
const RENDER_B = ['buildCmpChart', 'buildGauge', 'buildUtilChart', 'buildAvailableQuota',
  'buildOUChart', 'renderUtilTable', 'renderRATable', 'updateOUOverviewKPIs',
  'updateSalesIntelKPIs', 'buildLeadTimeAnalytics'];

/* Jalankan blok itu dengan penjadwal yang bisa dikendalikan. */
function jalankan({ rafHidup }) {
  const hitung = {};
  const antrian = [];
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.globalThis = ctx;
  [...RENDER_A, ...RENDER_B].forEach(n => {
    hitung[n] = 0;
    ctx[n] = () => { hitung[n]++; };
  });
  ctx.requestAnimationFrame = rafHidup ? (fn => antrian.push(['raf', fn])) : undefined;
  ctx.setTimeout = (fn, ms) => antrian.push(['timeout', fn, ms]);
  vm.runInContext(`(function () {\n${blok}\n})();`, ctx);
  /* Kuras antrian. Urutannya: rAF dulu bila ada, lalu timeout — itulah yang
     terjadi di tab terlihat. Di tab tersembunyi rAF tidak pernah masuk. */
  for (let i = 0; i < 50 && antrian.length; i++) {
    const [, fn] = antrian.shift();
    fn();
  }
  return hitung;
}

console.log('\nA · Tanpa rAF (tab tersembunyi) — semuanya tetap dirender');
{
  const h = jalankan({ rafHidup: false });
  const nolA = RENDER_A.filter(n => h[n] === 0);
  ok(!nolA.length, `${RENDER_A.length} render grup A tetap dipanggil`, JSON.stringify(nolA));
  const nolB = RENDER_B.filter(n => h[n] === 0);
  ok(!nolB.length, `${RENDER_B.length} render grup B tetap dipanggil`, JSON.stringify(nolB));
  ok(h.buildSpiTerbitTable === 1,
    'tabel PERTEK & SPI terisi — inilah yang kosong sebelum perbaikan',
    String(h.buildSpiTerbitTable));
  ok(h.buildAvailableQuota === 1, 'Available Quota terisi', String(h.buildAvailableQuota));
}

console.log('\nB · Dengan rAF hidup — hasil sama, tidak dobel');
{
  const h = jalankan({ rafHidup: true });
  const dobel = [...RENDER_A, ...RENDER_B].filter(n => h[n] !== 1);
  ok(!dobel.length, 'setiap render dipanggil TEPAT sekali',
    JSON.stringify(dobel.map(n => [n, h[n]])));
}

console.log('\nC · Pagar struktural — rAF tidak boleh jadi satu-satunya penjadwal');
{
  ok(/setTimeout\(_fase2, ?\d+\)/.test(blok),
    'ada jaring setTimeout untuk tahap 2', blok.slice(-80));
  ok(/setTimeout\(_b, ?\d+\)/.test(blok), 'grup B juga punya jaringnya sendiri');
  ok(/_fase2Sudah/.test(blok) && /_bSudah/.test(blok),
    'keduanya berpagar supaya tidak dikerjakan dua kali');
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
