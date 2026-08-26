# penangkap-401-semua-modul — 2026-08-26

## Ringkasan
Penangkap 401 sisi-klien — yang sebelumnya hanya dimiliki Cost Core — kini
berlaku di **keenam** modul. Kalau sesi berakhir saat SPA sudah terbuka,
halaman otomatis kembali ke halaman masuk dan sesudah masuk pengguna kembali
ke tempatnya semula, bukan memunculkan error atau tabel kosong.

Penjaga PHP hanya bekerja saat halaman dimuat. Sesudah itu SPA hidup dari
panggilan `api.php`, dan sejak modul dikunci pagi ini panggilan tersebut
menjawab 401 begitu sesi habis. Aplikasi lama memperlakukannya seperti gangguan
biasa — gejalanya menyesatkan: datanya seolah hilang, padahal cuma perlu masuk
lagi.

## Perubahan
- `lib/tool_guard.php` — fungsi baru `sc_session_watch()`, satu-satunya sumber
  cuplikan JS-nya.
- `cil/index.php`, `taskflow/index.php` — `<?= sc_session_watch() ?>` tepat
  sebelum `</head>`.
- `scot/index.php`, `salespulse/index.php`, `salespulse/dashboard.php`,
  `iqdash/index.php` — disisipkan ke `$html` dengan `str_replace('</head>', …)`
  sebelum di-echo.
- `costcore/index.php` — cuplikan sebarisnya yang lama **dibuang** dan diganti
  pemanggilan `sc_session_watch()`. Dua salinan dengan perilaku sedikit berbeda
  adalah awal dari drift; sekarang tinggal satu.
- `tools/tests/session_watch_test.php` — uji render baru.

## Keputusan
- **Ditambal di lapisan `window.fetch`, bukan di tiap pemanggilan API.** Berlaku
  untuk seluruh panggilan modul tanpa menyentuh satu pun berkas JS aplikasi
  (app.js CIL saja ~2300 baris). Sudah diperiksa: kelima modul memakai `fetch`,
  **tidak ada `XMLHttpRequest`** di mana pun, jadi tidak ada jalur yang lolos.
- **Memuat ulang URL yang sama**, bukan melompat ke `login.php`. Penjaga PHP
  yang menentukan tujuan, sehingga `?next=` terisi halaman persis yang sedang
  dibuka — termasuk `salespulse/dashboard.php`, yang dengan cara lama
  (`location.href="./"`, cara Cost Core dulu) akan mendarat di halaman
  executive, bukan dashboard.
- **Hanya 401 yang memicu pindah halaman, bukan 403.** 401 = sesi habis, memuat
  ulang menyelesaikannya. 403 = hak akses dicabut; memuat ulang hanya akan
  memantul ke halaman "tidak punya akses" berulang kali.
- **Bendera `gone`** memastikan sepuluh permintaan yang gagal berbarengan hanya
  memicu satu kali pindah halaman.
- **Disisipkan di dalam `<head>`**, bukan sesudahnya: kalau ditaruh belakangan,
  permintaan `fetch` pertama bisa keburu jalan sebelum tambalannya terpasang.

## Verifikasi
- `php -l` bersih untuk 9 berkas yang disentuh.
- `php tools/tests/session_watch_test.php` → **42 lulus, 0 gagal** atas 7
  halaman. Tiap halaman dirender dengan sesi palsu, lalu diperiksa: penangkapnya
  ada, hanya satu, memeriksa `r.status===401`, memakai
  `location.replace(location.href)`, dan posisinya **sebelum** `</head>`.
  Uji ini sengaja merender halaman sungguhan, bukan mencocokkan teks berkas:
  tiga modul menyisipkannya lewat `str_replace('</head>', …)`, yang akan gagal
  DIAM-DIAM kalau berkas HTML-nya suatu saat kehilangan `</head>`.
- `php tools/tests/auth_test.php` → 38 lulus, 0 gagal (tidak ada yang berubah).
- Sesudah deploy: keenam modul → 302 ke `login.php`, API → 401, aset → 200,
  tidak ada respons 500.

## Sisa / risiko
- **Pencabutan hak akses belum berlaku seketika.** `lib/access.php` dibaca saat
  login, lalu daftar tool-nya disalin ke sesi. Menghapus orang dari berkas itu
  + deploy TIDAK memutus sesi yang sedang berjalan — orang tersebut masih bisa
  membuka modulnya sampai sesinya habis (maksimal 8 jam) atau ia menekan Keluar.
  Menambah akses juga baru terasa sesudah login berikutnya. Perbaikannya kecil
  (baca ulang `sc_access()` tiap permintaan di `sc_user()` alih-alih memercayai
  salinan di sesi), tapi itu mengubah perilaku auth dan belum diminta — jadi
  dicatat, bukan dikerjakan diam-diam.
  **Diperbaiki hari itu juga** atas permintaan Aldi — lihat
  `hak-akses-seketika_2026-08-26_log.md`.
- Layar `lockScreen` mati di `costcore/index.php` masih ada (lihat
  `lepas-pin-costcore_2026-08-26_log.md`).
