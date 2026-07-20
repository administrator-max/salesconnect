# Initial build — SalesConnect (CIL + TaskFlow → PHP + Google Sheets)
- **Tanggal:** 2026-07-09
- **Oleh:** Claude Code (Cowork)

## Ringkasan
Membangun aplikasi PHP "tools centre" yang menggabungkan CIL dan TaskFlow jadi satu,
dengan Google Sheets sebagai database (satu spreadsheet per tool) dan login di depan.
Frontend lama dipakai ulang; backend ditulis ulang jadi REST API PHP dengan kontrak
JSON yang sama. Plus script migrasi Neon → Sheets.

## Perubahan
- Core PHP: `lib/GoogleSheets.php` (client Sheets v4, auth service-account JWT via openssl, cache baca file, token cache, batchGet/append/updateRange/deleteRows/appendAssocBulk).
- Auth: `lib/auth.php`, `guard.php` (page), `api_guard.php` (API 401), session-based; akun di `config.php` (`users` = username→bcrypt).
- API: `cil/api.php` (companies, salespeople, records+discussions, complaints+responses) & `taskflow/api.php` (staff, tasks accept/reject/done). Route via `.htaccess` `?_route=`.
- Frontend: port `cil/` & `taskflow/` dari app lama; base API `/api`→`api` (relatif), path aset absolut→relatif, dibungkus `index.php` + guard login.
- Landing `index.php`, `login.php`, `logout.php`.
- Keamanan: `.htaccess` root (security headers, blokir `*.json`/`config.php`) + deny-all di `secure/`, `lib/`, `cache/`, `tools/`. Service account dipindah ke `secure/`.
- `setup.php` (buat tab + header + seed, idempotent) & `tools/hash.php`.
- Migrasi: `tools/migrate_neon_to_sheets.js` (Node + pg) — buat tab + salin data dari 2 DB Neon, transform relasional→datar.
- Realtime tuning: `config.php cache_ttl` 30→10 detik.
- Dokumentasi: `DEPLOY.md`, `MIGRATE.md`, `CLAUDE.md`.
- Housekeeping: `.gitignore`, `config.sample.php`, folder `logs/` + aturan log ini.

## File yang disentuh
- Semua file di `salesconnect/` (baru dibuat sesi ini).

## Alasan
User memutuskan Google Sheets sebagai DB (di atas rekomendasi MySQL) dan target hosting
PHP di Niagahoster. Reuse frontend + tiru kontrak REST meminimalkan rework.

## Verifikasi / uji
- Semua file PHP lolos parse **PHP 8** (php-parser glayzzle).
- `tools/migrate_neon_to_sheets.js` lolos `node --check`.
- Semua endpoint yang dipanggil frontend CIL/TaskFlow dicocokkan 1:1 ke API PHP.
- **BELUM diuji live** ke Google/Neon — sandbox Cowork tidak punya akses jaringan ke keduanya. Tes integrasi pertama saat dijalankan di host/komputer lokal.

## Sisa / risiko
- Jalankan `setup.php` atau migrasi Neon di lingkungan ber-jaringan lalu verifikasi.
- Ganti password admin; rotasi password FTP; pindah `service_account.json` ke atas `public_html`.
- Opsional: polling frontend (near-realtime), soft-delete menyeluruh (jaminan CRUD), tab `users`.
- Cek skema Neon aktual masih sama dengan `migrate.js` (ada jejak cutover `.env.bak-neon`).
