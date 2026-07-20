# Local PHP testing environment + end-to-end verification
- **Tanggal:** 2026-07-09
- **Oleh:** Claude Code (lokal, mesin user)

## Ringkasan
Memasang PHP 8.3 di PC user dan menjalankan SalesConnect secara lokal terhadap Google
Sheets yang sudah diisi (lihat `data-migration_2026-07-09_log.md`). Tujuan: uji end-to-end
PHP nyata SEBELUM deploy ke Niagahoster. Semua alur inti terverifikasi berhasil.

## Perubahan
- Install PHP 8.3.32 via `winget install PHP.PHP.8.3` (thread-safe, x64).
- Buat `php.ini` di folder paket PHP: aktifkan `curl`, `openssl`, `mbstring`, `fileinfo`;
  set `extension_dir`; `date.timezone=Asia/Jakarta`.
- Tambah CA bundle: unduh `cacert.pem` (curl.se) dan set `curl.cainfo` + `openssl.cafile`
  di `php.ini` (Windows PHP tak punya CA default → HTTPS ke googleapis.com gagal verify).
  Catatan: masalah CA ini **lokal saja**; host Niagahoster sudah punya CA bundle.
- Tambah file DEV (di-gitignore, JANGAN diupload ke host):
  - `router.dev.php` — shim untuk `php -S` yang meniru rewrite `.htaccess`
    (`^api/(.*)$ -> api.php?_route=$1`), DirectoryIndex, dan deny `secure|lib|cache|tools`/`*.json`.
  - `start-local.bat` — launcher: `php -S 127.0.0.1:8788 router.dev.php`.
- Update `.gitignore`: abaikan `router.dev.php` dan `start-local.bat`.

## File yang disentuh
- `.gitignore` (+2 entri dev)
- baru: `router.dev.php`, `start-local.bat`, `logs/local-testing_2026-07-09_log.md`
- di luar repo: `php.ini` + `cacert.pem` di folder paket winget PHP.

## Verifikasi / uji (semua PASS)
- `php -l` seluruh file PHP: **no syntax errors** (PHP 8.3).
- Login `admin` → HTTP 302 ke index; API tanpa sesi → HTTP 401.
- Baca: `taskflow/api/staff`=7, `/tasks`=6, `cil/api/companies`=25, `/records`=55 (dengan
  nested `discussions`), `/complaints`=1. Kontrak JSON camelCase cocok dgn frontend
  (`salesRep`, `urgentFollowUp`, `proposedDeadline`, dst).
- Tulis roundtrip: POST company baru → muncul (25→26) → DELETE → hilang (26→25). Append,
  deleteRows, dan cache-clear-on-write terbukti bekerja.

## Cara pakai (user)
1. Double-click `start-local.bat` (atau `php -S 127.0.0.1:8788 router.dev.php`).
2. Buka `http://127.0.0.1:8788/` → login `admin` / `SalesConnect#2026`.

## Sisa / risiko
- Server lokal hanya untuk uji; produksi tetap Apache/.htaccess di Niagahoster.
- Belum deploy ke host — menunggu username FTP (host benar: `salesconnect.tapworkspace.com`,
  bukan `tapwokspace`).
- Ganti password admin & rotasi FTP saat go-live.
