# Deploy iqdash ke live — menyamakan produksi dengan main
- **Tanggal:** 2026-08-12
- **Oleh:** Claude Code

## Ringkasan
Produksi iqdash tertinggal dari `main` dan berada dalam kondisi **setengah jalan**: sebagian
file dari commit `87b2bd8` sudah live (`01-data.js`) sementara pasangannya belum
(`02-period-filter.js` masih 66.217 byte vs 69.488 lokal). `./deploy.sh iqdash` dijalankan
untuk menyamakan seluruh modul. Tidak ada perubahan kode di commit ini — murni deploy.

## Perubahan
- `./deploy.sh iqdash` → 36 file terkirim, 36 terverifikasi ukurannya lewat FTP, 0 gagal.
- Mencakup 7 commit iqdash yang sudah ada di `main`: penamaan produk kanonik, Available
  Quota satu angka di semua permukaan, dan perbaikan re-apply kuota di Revision Management.

## File yang disentuh
- Tidak ada file repo yang diubah. Yang berubah adalah isi host (36 file di `iqdash/`).

## Alasan
Diminta user setelah dikonfirmasi bahwa 7 commit iqdash dari sesi paralel memang sudah benar
dan siap dipublikasikan.

## Verifikasi / uji
- Pra-deploy: dipastikan `iqdash/data/*.json` **hanya dibaca** (`file_get_contents` di
  `iqdash_util.php`; komentar kode menyebutnya "berkas statis"/"SNAPSHOT BEKU"). Satu-satunya
  `file_put_contents` di `iqdash/api.php:158` menulis cache payload 30 detik, bukan folder
  `data/`. Jadi deploy tidak menimpa state produksi.
- `GET /iqdash/` → 200.
- 7 file JS yang sempat terlihat berbeda diverifikasi ulang lewat URL berversi → semuanya
  identik dengan lokal (byte-for-byte).
- `GET /iqdash/data/quotaLedger.json` → **403** (diblokir `.htaccess`, sesuai desain).

## Temuan penting untuk deploy berikutnya
- **Host memakai edge cache (LiteSpeed) yang mengabaikan `Cache-Control: no-cache` dari klien.**
  Mengambil aset lewat URL **tanpa** `?v=` bisa mengembalikan versi LAMA walaupun file di disk
  sudah benar. Terbukti: `02-period-filter.js` polos → 66.217 byte, `?cb=99887` → 69.488 byte,
  dan FTP `Content-Length` → 69.488.
  → Saat verifikasi deploy, **selalu pakai URL berversi** (`?v=<mtime>` seperti yang
  di-generate `index.php`) atau tambahkan query cache-buster. Jangan simpulkan deploy gagal
  dari URL polos.
- Perbandingan `iqdash/assets/index.html` lewat HTTP juga menyesatkan: yang diserve adalah
  keluaran `index.php` (sudah disisipi `?v=`), jadi ukurannya wajar berbeda dari file mentah.

## Sisa / risiko
- Isi fungsional 7 commit iqdash itu **tidak saya review** — saya hanya memindahkannya ke
  host. Pengujian benar/salahnya ada di log masing-masing commit dari sesi yang mengerjakan.
- Pengguna yang tab-nya masih terbuka bisa memegang JS lama sampai reload; `?v=<mtime>` sudah
  berubah, jadi cukup refresh biasa.
