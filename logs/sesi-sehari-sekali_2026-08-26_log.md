# sesi-sehari-sekali — 2026-08-26

## Ringkasan
Tim mengeluh harus membuka email tiap kali masuk SalesConnect, termasuk saat
membuka lagi di siang hari. Satu kali login sekarang berlaku **24 jam sejak
masuk**: masuk pagi, buka lagi siang atau sore tanpa kode baru, dan tetap
bertahan meski browser ditutup.

## Kenapa dulu sering diminta kode lagi
Bukan satu sebab, dan itu penting — memperbaiki satu saja tidak akan terasa:

1. **Cookie sesi mati saat browser ditutup.** `session_set_cookie_params()`
   dipanggil dengan `'lifetime' => 0`. Siapa pun yang menutup browser saat
   istirahat harus minta kode lagi sesudahnya.
2. **`session.gc_maxlifetime` bawaan PHP = 1440 detik (24 menit).** Pembersih
   PHP boleh membuang berkas sesi yang menganggur lebih lama dari itu — jauh
   sebelum batas 8 jam yang dikira berlaku. Ini penyebab paling mungkin dari
   keluhan aslinya, karena terjadi **tanpa** menutup browser: tinggal rapat
   setengah jam, kembali, sudah diminta masuk lagi.
3. **`session.save_path` bawaan dipakai bersama** akun lain di shared hosting
   dan disapu pembersih milik host. Berkas sesi bisa lenyap tanpa pola yang
   jelas.

Batas 8 jam yang ditulis di kode (`auth_idle_minutes`) sebenarnya **tidak
pernah benar-benar berlaku**: dua sebab di atas sudah memutus sesi jauh lebih
dulu. Ini pelajaran yang layak dicatat — angka di konfigurasi kita hanya
seketat lingkungan yang menjalankannya.

## Perubahan
- `lib/auth.php`
  - `sc_idle_minutes()` (menganggur) diganti `sc_session_hours()` /
    `sc_session_ttl()` — **batas mutlak sejak login**, default 24 jam,
    bisa diatur lewat `config.php['auth_session_hours']`.
  - `sc_session_start()`: cookie ber-`lifetime`, `save_path` sendiri di
    `cache/auth/sessions` (0700, sudah di luar jangkauan web lewat
    `cache/.htaccess`), dan `gc_maxlifetime` disamakan dengan umur sesi.
  - `sc_session_dir()` baru; mundur ke bawaan host kalau direktorinya tidak
    bisa dibuat, jadi tidak ada jalur yang gagal total.
  - `$_SESSION['sc_login_at']` dicatat saat login dan jadi dasar masa berlaku.
    `sc_last` tetap ditulis, tapi **hanya sebagai catatan** — ia tidak lagi
    memperpanjang apa pun.
  - `sc_remember_email()` / `sc_remembered_email()`: cookie `sc_email` (60 hari)
    berisi alamat email terakhir yang berhasil masuk.
- `login.php` — form email terisi otomatis dari cookie itu.
- `diag.php` — bagian "Masa berlaku sesi" baru: umur sesi, masa berlaku cookie,
  lokasi berkas sesi, `gc_maxlifetime` (ditandai merah kalau lebih pendek dari
  umur sesi), dan sisa waktu sesi yang sedang berjalan.
- `config.sample.php`, `CLAUDE.md` — `auth_idle_minutes` → `auth_session_hours`.
- `tools/tests/auth_test.php` — 10 pemeriksaan baru (52 → 62).

## Keputusan
- **Mutlak sejak login, bukan menganggur.** Kalau digeser tiap permintaan,
  orang yang membuka dashboard tiap hari tidak akan pernah diminta kode lagi,
  dan "sekali sehari" berubah diam-diam jadi "sekali selamanya". Ini juga
  membuat masa berlaku cookie di browser sama persis dengan masa berlaku sesi
  di server — kalau yang satu menggeser dan yang lain tidak, keduanya bisa
  kedaluwarsa di waktu berbeda dan gejalanya sulit ditebak.
- **24 jam bergulir, bukan "sampai tengah malam".** Lebih mudah diterangkan,
  dan tidak menghukum orang yang kebetulan masuk menjelang malam.
- **Cookie email hanya kenyamanan.** Ia tidak memberi akses apa pun; hilang
  atau dicuri pun tidak bisa dipakai masuk tanpa kode.

## Konsekuensi keamanan (disengaja, mohon diketahui)
Batas menganggur **dihapus**. Laptop yang ditinggal terbuka tetap masuk sampai
24 jam sejak login, bukan 8 jam sejak aktivitas terakhir. Ini memang yang
diminta, dan wajar untuk laptop kantor masing-masing. Kalau nanti dirasa
terlalu longgar, turunkan `auth_session_hours` di `config.php` server (mis. 12
atau 8) — tidak perlu deploy ulang kode.

Pencabutan hak akses tetap **seketika**: `sc_refresh_access()` berjalan tiap
permintaan, jadi memperpanjang sesi tidak memperlambat pencabutan.

## Verifikasi
- `php -l` bersih untuk 5 berkas yang disentuh.
- `php tools/tests/auth_test.php` → **62 lulus, 0 gagal** (sebelumnya 52).
  Sepuluh yang baru: umur sesi default 24 jam, sesi baru langsung sah,
  **6 jam menganggur tetap sah** (inti keluhannya), lewat 24 jam sesi berakhir
  dan benar-benar keluar, sesi hampir habis masih sah tapi **aktivitas tidak
  memperpanjang**, direktori sesi bisa ditulis, dan cookie email kosong kalau
  memang tidak ada.
- `php tools/tests/session_watch_test.php` → 42 lulus, 0 gagal.
- Sesudah deploy, dari luar: `Set-Cookie` untuk `salesconnect_sess` membawa
  `Max-Age=86400` (bukan cookie sesi lagi), semua halaman 302, API 401, tanpa
  respons 500.

## Sisa
- Sesi yang sedang berjalan saat deploy tidak ikut diperpanjang — cookie lama
  mereka masih cookie sesi. Semua orang perlu **satu kali login lagi**; sesudah
  itu baru berlaku aturan 24 jam.
- Angka sebenarnya di server sebaiknya dilihat sekali di `/diag.php` bagian
  "Masa berlaku sesi" — beberapa host mengunci `ini_set` untuk pengaturan sesi,
  dan halaman itu akan menandainya merah kalau `gc_maxlifetime` tetap pendek.
