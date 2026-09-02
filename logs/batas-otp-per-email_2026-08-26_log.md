# batas-otp-per-email — 2026-08-26

## Ringkasan
Batas permintaan kode OTP dipindah dari **per alamat IP** ke **per alamat
email**. Batas per IP tetap ada sebagai rem kasar, tapi dilonggarkan dari 20
menjadi 120 per jam.

## Kenapa yang lama keliru
Waktu sistem ini dikunci pagi tadi, batas 20 per IP per jam terlihat masuk akal
sebagai rem anti-penyalahgunaan. Pemakaian sebenarnya membuatnya jadi jebakan:

- Kantor keluar lewat **satu IP publik bersama**. Lima belas orang yang login
  di jam pagi yang sama berbagi satu jatah, jadi mereka saling menghabiskan
  jatah satu sama lain — padahal tidak ada yang menyalahgunakan apa pun.
- Sejak sesi jadi "sekali sehari", polanya justru **memusat**: hampir semua
  orang minta kode dalam rentang jam yang sama tiap pagi. Perbaikan kemarin
  membuat masalah ini lebih mungkin terjadi, bukan kurang.
- Gagalnya **diam-diam**. Begitu batas terlewat, halaman tetap menjawab "kode
  sudah dikirim" padahal tidak ada yang dikirim. Kesamaan pesan itu memang
  disengaja (supaya tidak membocorkan email siapa yang terdaftar), tapi
  akibatnya orang menunggu kode yang tidak akan pernah datang, dan laporan yang
  sampai ke admin berbunyi "OTP-nya rusak" — jauh dari penyebab sebenarnya.

Yang sebenarnya ingin dicegah adalah **satu alamat email dibanjiri kode**. Itu
dijaga jauh lebih tepat per email daripada per IP.

## Perubahan
- `lib/auth.php`
  - `SC_IP_MAX_PER_HOUR` (20) → `SC_OTP_MAX_PER_EMAIL_HOUR` (6) dan
    `SC_OTP_MAX_PER_IP_HOUR` (120).
  - `sc_rate_hit($key, $max)` + `sc_rate_file($key)` baru; `sc_ip_throttled()`
    dan `sc_email_throttled()` sama-sama memakainya.
  - `sc_otp_request()`: rem IP dulu (menghitung SEMUA permintaan, termasuk
    email asing), lalu email dicocokkan, baru batas per email — yang hanya
    dikenakan pada alamat **terdaftar**, supaya permintaan dengan alamat
    asal-asalan tidak meninggalkan berkas penghitung satu per satu di disk.
  - `sc_otp_gc()` ikut menyapu berkas `rl_*.json` yang basi.
  - Peristiwa `otp_throttled` dipecah jadi `otp_throttled_ip` dan
    `otp_throttled_email` supaya bisa dibedakan saat menelusuri keluhan.
- `login.php` — pesan sesudah minta kode ditambah satu kalimat: kode hanya bisa
  diminta beberapa kali per jam.
- `diag.php` — batas yang berlaku dan jumlah penghitung aktif ditampilkan.
- `CLAUDE.md`, `tools/tests/auth_test.php` (62 → 70 pemeriksaan).

## Soal pesannya: kenapa tidak dibuat spesifik saja
Godaannya adalah menampilkan "Anda sudah meminta kode terlalu sering" saat kena
batas. Itu **membocorkan** hal yang selama ini dijaga: pesan tersebut hanya
mungkin muncul untuk email terdaftar, jadi siapa pun bisa memakai form login
untuk menguji satu per satu siapa yang punya akses.

Jalan tengahnya: pesannya tetap **sama untuk semua kasus**, tapi sekarang
menyebutkan bahwa batas per jam itu ada. Orang jadi tahu apa yang mungkin
terjadi tanpa ada yang dikonfirmasi. Untuk admin, `/diag.php` dan
`cache/auth/auth.log` memberi jawaban pastinya.

## Verifikasi
- `php -l` bersih untuk 4 berkas yang disentuh.
- `php tools/tests/auth_test.php` → **70 lulus, 0 gagal** (sebelumnya 64).
  Delapan yang baru: permintaan dalam batas tidak ditahan, permintaan ke-7
  ditahan, **email lain tidak ikut kena** (inti perbaikannya), rem IP longgar,
  batas email masuk akal, dan penghitung basi ikut disapu `sc_otp_gc()`.
- Sesudah deploy: halaman login 200, seluruh modul 302, API 401, tanpa 500.

## Sisa
- Enam per jam per email adalah tebakan yang wajar, bukan angka hasil
  pengukuran. Kalau ternyata ada yang mentok (`otp_throttled_email` muncul di
  `/diag.php` untuk orang yang tidak menyalahgunakan apa pun), angkanya tinggal
  dinaikkan di `lib/auth.php`.
- Rem per IP di 120/jam aman untuk satu kantor 15 orang. Kalau nanti pemakainya
  jauh lebih banyak di balik satu IP, angka itu perlu ditinjau ulang — dan
  gejalanya akan sama diam-diamnya, jadi `otp_throttled_ip` di catatan auth
  adalah tempat pertama yang dilihat.
