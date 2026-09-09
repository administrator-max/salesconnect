# perjelas-kalimat-otp — 2026-09-09

## Ringkasan
Kalimat "Berlaku 10 menit" di halaman verifikasi diperjelas. Perubahan teks
saja — tidak ada perilaku yang berubah.

## Masalahnya
Halaman verifikasi hanya menulis "Berlaku 10 menit" tanpa menyebut **berlakunya
apa**. Aldi sendiri — yang tahu persis bagaimana sistem ini dibangun — membacanya
sebagai "login saya cuma bertahan 10 menit" dan bertanya apakah tim harus
bolak-balik minta OTP. Kalau orang yang paling paham sistemnya saja salah
tangkap, 16 orang lain hampir pasti sama.

Yang sebenarnya: 10 menit adalah batas waktu **mengetik kodenya**; sesinya
sendiri 24 jam. Dua angka yang sangat berbeda, dan yang ditampilkan justru
yang lebih kecil, tanpa konteks.

Ini kegagalan yang mahal secara diam-diam: orang yang mengira login-nya cuma
10 menit akan menghindari menutup tab, atau mengeluh sistemnya merepotkan,
padahal tidak ada yang rusak.

## Perubahan
Kalimatnya ternyata muncul di **tiga** tempat, ambigu dengan cara yang sama.
Ketiganya diperbaiki, karena memperbaiki satu saja menyisakan sumber
kebingungan yang lain:

- `verify.php` — baris polos diganti kotak catatan tersendiri:
  "Kode ini berlaku **10 menit** — itu batas waktu memasukkannya, bukan lama
  login. Setelah masuk, Anda tidak akan diminta kode lagi selama **24 jam**."
- `login.php` — harapannya disebut **sebelum** orang menekan tombol kirim:
  "Cukup **sekali sehari** — setelah masuk, Anda tidak akan diminta kode lagi
  selama 24 jam."
- `lib/mailer.php` — badan email OTP juga hanya bilang "Kode berlaku 10 menit".
  Orang yang membaca email dan tidak melihat layar akan menyimpulkan hal yang
  sama, jadi kalimatnya disamakan.

Angkanya diambil dari `SC_OTP_TTL_MIN` dan `sc_session_hours()`, bukan ditulis
tetap — kalau `auth_session_hours` diturunkan di server, teksnya ikut benar
sendiri dan tidak berbohong.

## Verifikasi
- `php -l` bersih untuk tiga berkas.
- Pemeriksaan render sekali pakai (dijalankan lalu dihapus): halaman login dan
  verifikasi benar-benar merender kalimat barunya, angka jamnya muncul, dan
  kalimat "Berlaku 10 menit." yang polos sudah tidak ada lagi — 6 cek, semua
  lulus. Diperiksa dari HTML hasil render, bukan dari isi berkas.
- `tools/tests/auth_test.php` → 73 lulus, 0 gagal.
- `tools/tests/session_watch_test.php` → 42 lulus, 0 gagal.
- Sesudah deploy: `/login.php` 200 dan memuat kalimat baru; seluruh modul 302;
  API 401; tanpa respons 500.

## Sisa
- Isi email OTP tidak bisa diperiksa dari luar tanpa benar-benar mengirim satu.
  Kalimatnya dirakit dari konstanta yang sama dengan halaman verifikasi, jadi
  risikonya kecil — tapi kalau ada yang minta kode hari ini, sekalian lihat
  apakah kalimatnya sudah benar di inbox.
