# hak-akses-seketika — 2026-08-26

## Ringkasan
Perubahan hak akses di `lib/access.php` sekarang berlaku **pada permintaan
berikutnya**, bukan menunggu sesi orangnya habis.

Sebelum ini `sc_start_session_for()` menyalin daftar tool ke `$_SESSION` saat
login, dan seluruh pemeriksaan sesudahnya membaca salinan itu. Akibatnya
mencabut akses seseorang — edit `access.php`, commit, deploy — **tidak
berpengaruh apa-apa** terhadap sesinya yang sedang berjalan: ia tetap bisa
membuka modul yang sudah dihapus dari haknya sampai 8 jam berikutnya, atau
sampai ia sendiri menekan Keluar.

Untuk pengaturan yang gunanya justru mengunci akses, jeda seperti itu adalah
lubang, bukan sekadar ketidaknyamanan. Gejalanya juga menyesatkan: admin sudah
deploy, `/diag.php` sudah menampilkan daftar yang benar, tapi orangnya masih
bisa masuk — mudah disalahartikan sebagai deploy yang gagal.

## Perubahan
- `lib/auth.php` — `sc_user()` memanggil `sc_refresh_access()` (fungsi baru)
  setiap kali dipanggil. Karena semua penjaga (`sc_require_tool`,
  `sc_require_tool_api`, `sc_user_can`, `sc_current_user`) lewat `sc_user()`,
  satu tambahan ini menutup seluruh jalur sekaligus.
- `tools/tests/auth_test.php` — 11 pemeriksaan baru (38 → 49).
- `CLAUDE.md` — peringatan lama diganti aturannya yang sekarang, lengkap dengan
  larangan mengembalikannya jadi memercayai salinan di sesi.

## Perilakunya sekarang
| Kejadian | Akibat |
|---|---|
| Orang dihapus dari `access.php` | Sesinya ditutup pada permintaan berikutnya; dicatat `session_revoked` |
| Satu modul dicabut dari seseorang | Modul itu langsung 403 / hilang dari halaman depan; sesinya tetap hidup |
| Satu modul ditambahkan | Langsung bisa dibuka, tanpa perlu keluar-masuk |
| Nama atau status admin diubah | Ikut segar pada permintaan berikutnya |
| Akun darurat dihapus dari `config.php['users']` | Sesinya ditutup pada permintaan berikutnya |

Baris terakhir itu membuat kalimat di `config.sample.php` — "kosongkan array-nya
untuk menutup pintu itu sama sekali" — akhirnya benar-benar seketika.

## Catatan implementasi
- **Pintu darurat dipisah jalurnya.** Akun `config.php['users']` tidak ada di
  `access.php`, jadi kalau disamakan ia akan langsung terlempar keluar. Jalurnya
  memeriksa `config.php` dan menyusun ulang daftar tool dari `array_keys()`,
  yang sekaligus berarti modul yang ditambahkan nanti otomatis ikut terjangkau.
- **Tidak ada biaya baca berkas tambahan.** `sc_access()` sudah men-cache
  hasilnya di variabel statis, jadi `access.php` tetap dibaca sekali per
  permintaan — sama seperti sebelumnya.
- **Sesi hanya ditulis kalau ada yang berubah**, supaya permintaan biasa tidak
  menyentuh berkas sesi tanpa alasan.

## Verifikasi
- `php -l` bersih untuk `lib/auth.php` dan `tools/tests/auth_test.php`.
- `php tools/tests/auth_test.php` → **49 lulus, 0 gagal** (sebelumnya 38).
  Sebelas yang baru menguji dengan cara **merusak salinan di sesi** lalu
  memastikan jawabannya tetap mengikuti berkas — persis keadaan yang terjadi
  kalau `access.php` diubah saat sesi masih berjalan:
  hak lama di sesi diabaikan (iqdash, cil), hak asli tetap berlaku (scot),
  sesi ikut dikoreksi, hak yang ada dipulihkan dari berkas, status admin dan
  nama ikut disegarkan, akun dihapus → sesi ditutup dan benar-benar keluar,
  serta dua uji pintu darurat (dapat semua modul; akun dihapus → sesi ditutup).
- `php tools/tests/session_watch_test.php` → 42 lulus, 0 gagal (tidak berubah).
- Sesudah deploy: keenam modul → 302 ke `login.php`, API → 401, tanpa respons 500.

## Sisa / risiko
- **Mencabut akses tidak membatalkan kode OTP yang sedang hidup.** Kalau kode
  sudah terkirim lalu orangnya dihapus dari `access.php`, kode itu tidak bisa
  dipakai — `sc_otp_verify()` sudah memeriksa ulang ke `access.php` sebelum
  membuat sesi (jalur `otp_revoked`, sudah ada sejak awal). Jadi tidak ada celah;
  dicatat di sini supaya tidak dikira terlewat.
- Perubahan `access.php` tetap perlu **deploy** untuk sampai ke server. Yang
  hilang sekarang hanyalah jeda SESUDAH deploy, bukan jeda deploy itu sendiri.
