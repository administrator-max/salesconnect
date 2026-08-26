# otp-login-akses-per-dashboard — 2026-08-26

## Ringkasan
SalesConnect dikunci sesuai arahan Direktur: tidak lagi bisa dibuka siapa saja.
Login sekarang memakai **email kantor + kode sekali pakai (OTP)** yang dikirim
lewat email — pola yang sama dengan HR Center — dan **setiap dashboard punya
daftar orangnya sendiri**. Orang yang tidak terdaftar tidak bisa masuk sama
sekali; orang yang terdaftar hanya melihat dashboard yang memang haknya.

Sebelum ini hanya Cost Core yang terkunci (lewat PIN); lima dashboard lain —
CIL, TaskFlow, SCOT, Sales Pulse, IQ Dash — beserta seluruh REST API-nya
terbuka untuk siapa pun yang tahu alamatnya.

## Hak akses yang dipasang
| Dashboard | Orang |
|---|---|
| Client Interaction Log, TaskFlow | David, Luzy, Anne, Ko Jeri, Aldi, Ridwan, Trian, Liwa (8) |
| Cost Core, Sales Pulse, IQ Dash | + Irma, Angely, Putri (11) |
| SCOT | David, Luzy, Anne, Ko Jeri, Irma, Angely, Jeany, Maya, Aldi, Ridwan, Trian, Liwa (12 — tanpa Putri) |

Total 13 orang terdaftar. **Liwa** (`liwa.s@gunungprisma.com`) ditambahkan
sesudah deploy pertama dan diberi akses **semua** dashboard.

Aldi & Ridwan ditandai `admin` — itu **hanya** membuka halaman diagnostik
`/diag.php`, tidak menambah akses dashboard di luar tabel.

## Perubahan
### Baru
- `lib/access.php` — satu-satunya tempat daftar orang & hak akses. Tanpa rahasia,
  jadi ikut di-commit dan ikut `deploy.sh`; menambah orang tidak perlu menyentuh
  `config.php` di server.
- `lib/mailer.php` — klien SMTP tanpa library (disalin dari HR Center
  `core/mail.php`) + pencarian kredensial berlapis.
- `lib/tool_guard.php` — `sc_require_tool()` (halaman), `sc_require_tool_api()`
  (JSON), `sc_url()`, dan halaman "tidak punya akses".
- `verify.php` — langkah 2: masukkan kode 6 digit.
- `diag.php` — diagnostik login khusus admin.
- `tools/tests/auth_test.php` — 36 pemeriksaan, tanpa jaringan.
- `scot|salespulse|iqdash/assets/.htaccess` — memblokir `*.html` supaya kerangka
  SPA tidak bisa dibuka langsung dan melewati penjaga.

### Diubah
- `lib/auth.php` — ditulis ulang: sesi + OTP + hak akses + CSRF + catatan audit.
  `sc_current_user()` dipertahankan bentuknya (mengembalikan email) karena
  `lib/config_util.php` dan `setup.php` memakainya sebagai penanda "sudah login".
- `login.php` — form email; `?pw=1` membuka pintu darurat username+password.
- `logout.php`, `index.php` (kartu difilter per hak akses), `lib/guard.php`,
  `lib/api_guard.php`.
- Penjaga dipasang di **13 titik masuk**: `cil`, `taskflow`, `costcore`, `scot`,
  `salespulse` (`index.php` + `dashboard.php`), `iqdash` — masing-masing halaman
  **dan** `api.php`.
- `config.sample.php`, `CLAUDE.md`.

## Alasan beberapa keputusan
- **OTP disimpan di berkas (`cache/auth/`), bukan Google Sheets.** Satu login
  akan memakan beberapa panggilan API dan bisa menabrak batas 60 baca/menit
  justru saat orang ramai masuk pagi hari. `cache/` sudah pasti bisa ditulis dan
  sudah diblokir dari web; `GoogleSheets::clearCache()` hanya menghapus
  `rd_*.json`, jadi isi `cache/auth/` aman.
- **Kredensial SMTP tidak disalin ke repo mana pun.** `lib/mailer.php` membaca
  `/home/u5959765/hrcenter_private/secrets.php` — satu akun cPanel dengan
  HR Center — sehingga tidak ada salinan password baru dan rotasi kredensial di
  HR Center otomatis ikut berlaku. Bisa ditimpa lewat `config.php['smtp']`.
- **Halaman DAN API sama-sama dijaga.** Menjaga halaman saja percuma:
  `/iqdash/api/data` punya URL sendiri dan mengembalikan seluruh isi spreadsheet.
- **Pintu darurat username+password dipertahankan** (`/login.php?pw=1`). Tanpa
  itu, satu gangguan SMTP mengunci semua orang — termasuk yang seharusnya
  memperbaikinya. `/diag.php` bisa dicapai lewat pintu ini untuk melihat kenapa
  email gagal.
- **Pesan login sengaja seragam** ("Jika email terdaftar, kode sudah dikirim")
  untuk email terdaftar, tidak terdaftar, maupun yang sedang kena jeda kirim
  ulang — kalau berbeda, siapa pun bisa menebak siapa saja yang punya akses.

## Batas & pengaman
- Kode berlaku 10 menit, sekali pakai, maks 5 percobaan salah, jeda kirim ulang
  60 detik, maks 20 permintaan kode per IP per jam.
- Sesi berakhir setelah 480 menit menganggur (`config.php['auth_idle_minutes']`)
  dan selalu berakhir saat browser ditutup.
- Semua form login/verifikasi memakai token CSRF.
- Catatan audit di `cache/auth/auth.log`: `login_ok`, `otp_sent`, `otp_wrong`,
  `otp_unknown`, `denied`, `denied_api`, `logout`, `mail_fail`.

## Verifikasi
- `php -l` bersih untuk 23 berkas PHP yang disentuh.
- `php tools/tests/auth_test.php` → **36 lulus, 0 gagal**, mencakup: jumlah orang
  per dashboard sesuai daftar Direktur, Putri tidak ada di SCOT, Jeany & Maya
  hanya SCOT, email besar-kecil, email asing ditolak, kode salah menaikkan
  penghitung, kode benar membuat sesi lalu hangus, kode kadaluarsa ditolak,
  kunci setelah 5 kali salah, dan kunci orang yang salah ketik di `access`.
- **BELUM diuji di server.** Yang belum bisa diverifikasi dari lokal: apakah host
  SalesConnect benar-benar bisa membaca `hrcenter_private/secrets.php` (asumsinya
  satu akun cPanel `u5959765`) dan benar-benar bisa mengirim email. Itu yang
  dijawab `/diag.php` sesudah deploy.

## Langkah sesudah deploy (WAJIB, urut)
1. Deploy: `./deploy.sh` (semua berkas — banyak modul tersentuh).
2. Buka `/login.php?pw=1`, masuk sebagai admin.
3. Buka `/diag.php`. Pastikan: sumber SMTP bukan "fallback mail() PHP", dan
   direktori OTP bisa ditulis. Kirim email uji ke diri sendiri.
4. Kalau sumbernya masih "fallback mail() PHP" → host tidak bisa membaca berkas
   rahasia HR Center. Isi `config.php['smtp']` di server dengan kredensial SMTP,
   lalu ulangi langkah 3.
5. Setelah email uji sampai, uji login OTP dari email sendiri, lalu kabari 11
   orang lainnya.

## Sisa / risiko
- **Sesi habis di tengah SPA.** Kalau sesi berakhir saat halaman modul terbuka,
  panggilan API menjawab 401 dan tampilan bisa memunculkan error, bukan otomatis
  melempar ke halaman masuk. Muat ulang halaman akan melempar ke login dengan
  benar. Perbaikan rapinya perlu menyentuh JS enam modul — sengaja belum
  dikerjakan; masa menganggur dibuat panjang (8 jam) supaya jarang terjadi.
- **Endpoint `health` ikut terkunci.** `/<modul>/api/health` kini menjawab 401
  tanpa sesi. Kalau ada monitor luar yang memakainya, perlu penyesuaian.
- **Cost Core punya dua pintu** (login + PIN). Disengaja; bilang saja kalau PIN-nya
  mau dilepas sekarang setelah ada login.
- **Daftar orang ada di berkas, bukan di Sheets.** Menambah/menghapus orang perlu
  edit `lib/access.php` + deploy. Kalau nanti perlu diubah tanpa deploy, memindah
  daftar ini ke tab Sheets adalah langkah berikutnya.
