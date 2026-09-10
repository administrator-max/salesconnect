/* ═══════════════════════════════════════════════════════════════════════════
   PENYEGAR OTOMATIS — data baru muncul tanpa perlu memuat ulang halaman.

   MASALAHNYA (dilaporkan tim 10-Sep-2026): "pada saat tim saya menginput hari
   ini, di filter tidak ada, munculnya lama, begitupun juga yang input kemarin."

   Sebabnya bukan filter dan bukan cache server. Dashboard mengambil data
   TEPAT SEKALI saat halaman dibuka — loadData() dan loadRealizations() di
   19-init.js — lalu tidak pernah bertanya lagi. Tidak ada polling, tidak ada
   penyegaran saat tab difokuskan, tidak ada tombol muat ulang. Jadi tim yang
   membiarkan dashboard terbuka sambil menginput di jendela lain akan menatap
   layar yang secara harfiah tidak akan pernah berubah.

   Cache di server sendiri sudah beres dan bukan biang keladinya: memo payload
   30 detik DAN cache baca GoogleSheets dibersihkan pada setiap penulisan
   (@unlink(iq_payload_memo_file()) di 10 rute tulis, cacheClear() di
   GoogleSheets). Yang kurang cuma satu — sisi peramban tidak pernah bertanya.

   CARA KERJANYA
   Bertanya lewat GET /api/version — beberapa ratus byte berisi sidik jari data
   (jumlah baris + cap waktu terbaru per tabel). Kalau sidik jarinya sama,
   tidak ada yang ditarik dan tidak ada yang dirender. Kalau berubah, barulah
   /api/data (140 KB) dan /api/realizations (220 KB) ditarik ulang.

   Menanyakan langsung lewat kedua endpoint besar itu berarti ~360 KB tiap
   giliran, untuk pertanyaan yang jawabannya hampir selalu "belum berubah".

   Dipicu oleh tiga hal:
     · giliran berkala, HANYA saat tabnya terlihat;
     · tab kembali terlihat / jendela difokuskan — inilah yang menjawab
       keluhan aslinya, karena tim berpindah ke jendela lain untuk menginput
       lalu kembali;
     · panggilan langsung dari alur impor, lewat window.iqSegarkanSekarang().

   YANG SENGAJA DIJAGA
   Penyegaran TIDAK BOLEH mengubah apa yang sedang dilihat orang. Semua
   keadaan tampilan — periode, jenis tanggal, tab aktif, fase, pencarian, pil
   penyaring — tinggal di variabel global yang tidak disentuh di sini; yang
   ditarik ulang cuma DATANYA, lalu applyPeriodFilter() merender ulang seluruh
   permukaan memakai keadaan yang sama persis. Fungsi itu memang sudah
   berpagar per-permukaan dan ikut menyegarkan drill yang sedang terbuka.

   Dan penyegaran DITUNDA bila ada laci/modal terbuka atau ada isian yang
   sedang diketik — menarik lantai dari bawah kaki orang yang sedang bekerja
   lebih buruk daripada data yang telat 30 detik.
   ═══════════════════════════════════════════════════════════════════════════ */

const AR_JEDA_MS   = 30000;   // giliran berkala saat tab terlihat
const AR_MIN_JARAK = 4000;    // jarak minimum antar pemeriksaan, apa pun pemicunya

let _arSig      = null;       // sidik jari terakhir yang kita ketahui
let _arTimer    = null;
let _arSibuk    = false;
let _arTerakhir = 0;          // kapan terakhir kali BERTANYA
let _arSegarkan = 0;          // kapan terakhir kali benar-benar MENARIK ulang

/**
 * Ada sesuatu yang sedang dibuka orang? Kalau ya, tunda giliran ini.
 *
 * SENGAJA TIDAK memblokir hanya karena ada isian yang sedang difokus. Versi
 * pertama melakukannya, dan itu justru menghidupkan kembali keluhan aslinya:
 * satu orang meninggalkan kursor di kotak pencarian, lalu dashboard-nya tidak
 * pernah disegarkan lagi. Render ulang tidak menyentuh isi kotak pencarian —
 * nilainya tinggal di elemennya, dan perender justru MEMBACA nilai itu.
 *
 * Yang benar-benar perlu ditunda cuma laci/modal/panel yang terbuka: di sana
 * render ulang bisa menarik isi dari bawah tangan orang yang sedang membacanya.
 */
function _arSedangDipakai() {
  const drawer = document.getElementById('drawer');
  if (drawer && /open/.test(drawer.className || '')) return true;
  const panel = document.getElementById('pfPanel');
  if (panel && /open/.test(panel.className || '')) return true;
  const modalTerbuka = [...document.querySelectorAll('[id$="Modal"], .modal')]
    .some(m => m.offsetParent !== null && m.style.display !== 'none');
  return modalTerbuka;
}

/** Tarik ulang data, lalu render ulang dengan keadaan tampilan yang sama. */
async function _arTarikUlang() {
  const tugas = [];
  if (typeof loadData === 'function')              tugas.push(loadData());
  if (typeof loadRealizations === 'function')      tugas.push(loadRealizations());
  if (typeof loadRealizationSummary === 'function') tugas.push(loadRealizationSummary());
  await Promise.all(tugas);
  /* Satu pintu render: applyPeriodFilter() sudah menyusuri seluruh permukaan
     secara berpagar DAN menyegarkan drill yang terbuka. Memanggil daftar
     render sendiri di sini berarti salinan kedua yang pasti tertinggal. */
  if (typeof applyPeriodFilter === 'function') applyPeriodFilter();
  /* Daftar company ikut dibangun ulang. Tanpa ini, company yang baru diinput
     tim tidak akan pernah muncul di dropdown "Select Company" sampai halaman
     dimuat ulang — bentuk lain dari keluhan yang sama, "listnya kosong". */
  if (typeof isiDaftarCompany === 'function') isiDaftarCompany();
  if (typeof renderLastUpdate === 'function')  renderLastUpdate();
  _arSegarkan = Date.now();
  _arTandaiSegar();
  /* Data baru = kesempatan baru untuk tidak konsisten. Diperiksa TIAP KALI,
     bukan sekali saat halaman dibuka — bentuk data yang belum tertangani
     justru datang lewat input baru. */
  if (typeof iqPeriksaMandiri === 'function') { try { iqPeriksaMandiri(); } catch (e) {} }
}

/** Tanya sidik jari; tarik ulang hanya bila berubah. */
async function iqPeriksaPembaruan(paksa) {
  if (_arSibuk) return false;
  const kini = Date.now();
  if (!paksa && kini - _arTerakhir < AR_MIN_JARAK) return false;
  if (!paksa && _arSedangDipakai()) return false;
  _arSibuk = true; _arTerakhir = kini;
  try {
    const res = await fetch('api/version', { cache: 'no-store' });
    if (!res.ok) return false;
    const j = await res.json();
    const sig = j && j.sig;
    if (!sig) return false;
    if (_arSig === null) { _arSig = sig; return false; }   // giliran pertama: catat saja
    if (sig === _arSig) return false;
    _arSig = sig;
    await _arTarikUlang();
    return true;
  } catch (e) {
    /* Jaringan putus sesaat bukan alasan menghentikan penyegar. Diam saja dan
       coba lagi giliran berikutnya. */
    return false;
  } finally { _arSibuk = false; }
}

/** Dipanggil alur impor/simpan supaya hasilnya langsung terlihat. */
async function iqSegarkanSekarang() {
  _arSig = null;                 // paksa: apa pun sidik jarinya, tarik ulang
  _arSibuk = false;
  try {
    const res = await fetch('api/version', { cache: 'no-store' });
    if (res.ok) { const j = await res.json(); if (j && j.sig) _arSig = j.sig; }
  } catch (e) { /* biarkan */ }
  await _arTarikUlang();
}

/** Label "update:" di kanan atas ikut menandai kapan terakhir disegarkan. */
function _arTandaiSegar() {
  const el = document.getElementById('arSegar');
  if (!el) return;
  const t = new Date(_arSegarkan || Date.now());
  const jj = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  el.textContent = 'disegarkan ' + jj + ':' + mm;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '.55'; }, 2500);
}

function _arMulaiTimer() {
  if (_arTimer) clearInterval(_arTimer);
  _arTimer = setInterval(() => {
    if (document.hidden) return;      // tab tersembunyi: jangan buang giliran
    iqPeriksaPembaruan(false);
  }, AR_JEDA_MS);
}

function iqAutoRefreshMulai() {
  _arMulaiTimer();
  /* Tab kembali terlihat / jendela difokuskan — pemicu yang paling penting.
     Tim berpindah jendela untuk menginput, lalu kembali ke sini; saat itulah
     mereka mengharapkan datanya sudah baru. */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) iqPeriksaPembaruan(false);
  });
  window.addEventListener('focus', () => iqPeriksaPembaruan(false));
  /* Giliran pertama: catat sidik jari awal supaya perubahan berikutnya
     terdeteksi. Tidak menarik ulang apa pun — datanya baru saja dimuat. */
  iqPeriksaPembaruan(true);
}

window.iqPeriksaPembaruan = iqPeriksaPembaruan;
window.iqSegarkanSekarang = iqSegarkanSekarang;
window.iqAutoRefreshMulai = iqAutoRefreshMulai;
