# Cache-busting all modules + fix 3rd deploy-corrupted file

- **Tanggal:** 2026-07-21
- **Oleh:** Claude Code

## Ringkasan
Menambah cache-busting per-file (`?v=<filemtime>`) ke taskflow & salespulse. Menemukan file
KETIGA yang terpotong saat `git ftp init`: `salespulse/assets/index.html` (33KB, harusnya 45KB) —
bagian bawah (tag <script>) hilang → dashboard salespulse rusak (JS tak load). Diperbaiki.

## Perubahan
- `taskflow/index.php` — `?v=<filemtime>` inline pada css/style.css, js/api.js, js/app.js.
- `salespulse/dashboard.php` — regex-replace: ganti `?v=20260527-mode-export` (versi statis basi)
  jadi `?v=<filemtime>` dinamis untuk semua assets/*.js|css.
- `salespulse/index.php` — wrapper cache-busting sama (executive.html inline-only; future-proof).
- Re-upload `salespulse/assets/index.html` (terpotong di host).

## Bug ditemukan (deploy corruption — total 3 file)
1. scot/assets/forms.js (0B) — sudah diperbaiki.
2. cil/assets/js/app.js (32KB) — sudah diperbaiki.
3. salespulse/assets/index.html (33KB) — diperbaiki di sini.
Semua akibat truncation FTPS saat init massal; re-upload incremental transfer utuh.

## Verifikasi (live, Chrome)
- salespulse dashboard: 6 script hadir, `?v=<mtime>` dinamis, render, 0 error.
- taskflow: aset versioned, welcome screen render, API staff 200, 0 error.
- **Integrity sweep FINAL (html+js+css, 24 file): 0 corrupt.**

## Sisa / risiko
- Semua modul kini punya cache-busting (costcore JS inline, tak perlu).
- .htaccess punya header cache untuk statis; ?v= mem-bypass saat berubah.
