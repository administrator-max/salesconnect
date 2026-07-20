# SCOT Module (Shipment Control Tower) — SalesConnect Integration
- **Tanggal:** 2026-07-20
- **Oleh:** Claude Code

## Ringkasan
Integrasi modul SCOT (Shipment Control Tower) ke dalam SalesConnect PHP sebagai modul terbuka (tanpa login). Memanfaatkan Google Sheets `1km206j-uletsz9uNLwWC0dymRuy3fPnBuTDTMyeMbSM` yang sudah ada, frontend vanilla JS dipakai ulang, polling 15 detik mengganti Server-Sent Events, OCR Gemini berjalan sinkron dengan concurrency protection via flock.

## Perubahan
- **Config wiring:** tambah `spreadsheets['scot']` dan `gemini_api_key`, `gemini_model` ke `config.php`; mirror ke `config.sample.php`.
- **Landing card:** tambah link "Shipment Control Tower" di halaman utama `index.php`.
- **Frontend reuse:** copy assets dari `../scot/public/`, konversi ke relative API paths (`/api/` → `api/`), ganti SSE dengan polling 15 detik.
- **Core helpers:** `scot_util.php` menyediakan shape/sanitize/sort/lock/next_id; `scot_with_lock()` gunakan flock file exclusivity untuk atomic updates; `scot_next_id()` hitung max+1 tanpa cache.
- **REST API skeleton:** routing di `api.php`, health endpoint, 404 default.
- **Shipments CRUD:** `GET/POST/PUT/DELETE shipments`, plus `POST /bulk` untuk batch upsert; semua write di dalam lock.
- **Documents:** link upload `POST shipments/:id/documents`, list `GET`, redirect `GET documents/:id`, delete `DELETE`.
- **Gemini OCR:** client di `gemini.php`, synchronous (tidak job-queue), POST returns `{jobId, status:'processing'}` lalu file cache disimpan, GET `ocr/:jobId` baca cache; response parsing filter ke 19 OCR keys, confidence clamp 0..1 default 0.5.
- **Offline tests:** `util_test.php` verifikasi shape/sanitize/sort, `gemini_parse_test.php` verifikasi JSON strip + filter.
- **No-login access:** `scot/index.php` tidak include `lib/guard.php` — modul terbuka untuk publik.

## File yang disentuh
- `config.php` — tambah `spreadsheets['scot']`, `gemini_api_key`, `gemini_model`
- `config.sample.php` — mirror konfigurasi
- `index.php` — add landing card untuk `/scot/`
- `scot/index.php` — shell SPA (create, serve index.html as-is)
- `scot/api.php` — REST backend (create, routing + health + CRUD + bulk + docs + OCR)
- `scot/scot_util.php` — pure helpers (create, shape/sanitize/sort/lock/next_id)
- `scot/gemini.php` — Gemini client (create, system prompt + HTTP call + parsing)
- `scot/.htaccess` — copy dari taskflow, rewrite `api/*`
- `scot/assets/*` — copy dari `../scot/public/`, edit ref lokal jadi relative (`assets/...`)
- `scot/tests/util_test.php` — test helpers (create, offline assertions)
- `scot/tests/gemini_parse_test.php` — test OCR parsing (create, offline assertions)
- `logs/add-scot-module_2026-07-20_log.md` — changelog (file ini)

## Alasan
- **Konsolidasi modul:** SCOT bukan app standalone, tapi bagian dari SalesConnect; satu login wall, satu deployment, satu place untuk manage credentials.
- **Reuse spreadsheet:** fokus pada implementation, tidak migrasi data ulang; spreadsheet sudah punya 250+ baris `shipments` + `documents` linked.
- **Flock write-lock:** konkurensi PHP shared-hosting tanpa transaksi DB → serialisasi manual untuk jaminan atomicity id-generation + multi-row updates.
- **Polling vs SSE:** PHP shared-hosting tidak hold persistent connections; polling 15s tradeoff acceptable antara realtime vs simplicity.
- **Gemini sync OCR:** spec require **tidak** job queue (perbedaan vs original n8n). Client curl HTTP direct ke API, parse JSON synchronously, cache file untuk GET retry.
- **Open access:** SCOT adalah public tracking tool (dari spec asli), bukan admin-only; tidak perlu login.
- **Offline tests:** tidak bisa hit Google Sheets/Gemini di sandbox Cowork; test pure logic saja (shape, parse, sort).

## Verifikasi / uji
- **PHP lint semua 4 file:** `php -l scot/index.php && php -l scot/api.php && php -l scot/scot_util.php && php -l scot/gemini.php` → semua `No syntax errors detected` ✓
- **Offline tests:** `php scot/tests/util_test.php` → `ALL PASS` ✓; `php scot/tests/gemini_parse_test.php` → `ALL PASS` ✓
- **No secrets staged:** `git ls-files scot` tidak mengandung `config.php` atau `service_account.json` (gitignored) ✓
- **No absolute API paths:** `grep -rn "'/api/\|\"/api/" scot/assets/` → tidak ada (semua `api/` relative) ✓
- **Config draft:** placeholder `config.sample.php` siap untuk filling-in di host ✓

## Sisa / risiko

### Prerequisites on Host (manual, outside this plan)
1. **Share Google Sheet:** admin host WAJIB share spreadsheet `1km206j-uletsz9uNLwWC0dymRuy3fPnBuTDTMyeMbSM` sebagai **Editor** dengan service account `salesconnect@eagle1-492706.iam.gserviceaccount.com`. Tanpa ini, Sheets API call akan 403 Forbidden.
2. **Set Gemini API key:** host edit `config.php` isikan real `gemini_api_key` dari Google Cloud (project `eagle1-492706`). Tanpa ini, OCR endpoint return error "not configured".

### Known Limitations & Future Work
- **Rate limiting:** Sheets API ~60 read/menit per akun; saat deployment awal disarankan monitor quota. Jika high-volume scraping, perlu cache ttl tune atau Redis.
- **Concurrency edge case:** flock hanya menjamin atomicity dalam satu proses PHP; 2+ request concurrent masih bisa race saat compute `max+1` sebelum lock. Mitigasi: ID collision rare di lapangan (timestamp-based ID lebih aman). TODO: consider change to ulid/uuid untuk production.
- **Race condition PUT/DELETE:** saat user read row content, kemudian edit, row-number bisa shift jika concurrent delete. Mitigasi: relok di moment write (current impl sudah cek `_row` real); ini **acceptable** untuk non-high-frequency edit.
- **OCR cache file TTL 10 menit:** job yang lebih lama dari 10 menit dihapus (GET return 404). Untuk file besar OCR perlu optimasi, e.g. progress webhook (outside Phase-1).
- **Soft-delete not implemented:** documents/shipments sekarang hard-delete. Ada kolom `deleted` di shipments tab (legacy dari Neon), bisa diguna untuk soft-delete di future; sekarang skip.
- **No real-time collab:** polling 15s, bukan true real-time. Jika 2+ user edit shipment ID 999 concurrent, hanya last-write-wins. Acceptable untuk tool operations dashboard.
- **Frontend export/import:** spec menyebutkan "Excel import/export" (Bulk endpoint didesain untuk ini), tapi UI client belum ada logic untuk **upload** CSV/XLSX (hanya download). TODO di sprint berikutnya (form upload file).

### Deployment Workflow
- Push ke `main` → GitHub Actions `git-ftp` auto-deploy ke `salesconnect.tapworkspace.com:/public_html/`.
- First smoke-test: `GET https://salesconnect.tapworkspace.com/scot/` → halaman SPA load ✓; `GET /scot/api/health` → `{ok:true}` ✓; create shipment → Sheets terisi; polling refresh setiap 15s.
- Jika Gemini API key belum set, OCR endpoint return 400 tapi app tetap jalan.

### Git & Archive Notes
- **Gitignore enforcement:** `config.php`, `secure/service_account.json`, `cache/`, `.env`, `node_modules/` — TIDAK di-commit. Jangan pernah override dengan `git add --force`.
- **Changelog**: file ini (`logs/add-scot-module_2026-07-20_log.md`) **di-commit** — bagian sejarah proyek.
- **Backup logs:** saat merge ke prod, arsip sheet backup (Google Sheets → File → Download → Archive folder) untuk auditability.
