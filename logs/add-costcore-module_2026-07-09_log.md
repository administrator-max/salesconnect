# Tambah modul Cost Core ke SalesConnect Tools Centre
- **Tanggal:** 2026-07-09
- **Oleh:** Claude Code (lokal, mesin user)

## Ringkasan
Menambahkan **Cost Core** (kalkulasi costing baja import & domestic) sebagai modul KETIGA di
SalesConnect (di samping CIL & TaskFlow), backed Google Sheet, di belakang login SalesConnect
(satu login). Diuji lokal (PHP 8.3) + diverifikasi visual di Claude-in-Chrome SEBELUM deploy.
Spec: `docs/superpowers/specs/2026-07-09-costcore-module-design.md`.

## Sumber
Port dari versi Sheets yang sudah ada (`../costcore_html`), BUKAN versi Neon lama.
- Sheet `1yDWF5Q3YarCWqvXGCXY0lSk0kCdP-6VrqiL2FfvD3rU`, tab `costings`
  (id|type|customer|created_at|updated_at|data_json). 60 costing sudah ada -> TANPA migrasi.
- Service account sendiri: `costcore@eagle1-492706.iam.gserviceaccount.com` (sheet sudah di-share ke situ).

## Keputusan (disetujui via brainstorming)
- Satu login: passcode 1984 + shared-secret + bearer Cost Core DIHAPUS; pakai session guard SalesConnect.
- Pakai service account milik Cost Core (bukan reuse SA SalesConnect) -> nol langkah manual Google.
- Scope = versi Sheets: kalkulasi + CRUD + Excel/PDF client-side. TANPA role admin/user & TANPA Drive export.

## Perubahan
NEW:
- `costcore/index.php` : frontend (adaptasi index.html) + guard login. Blok runner/passcode diganti
  integrasi session (API_BASE=".", apiHeaders tanpa x-cc-key/bearer, boot langsung ke app,
  wrapper fetch: 401 -> ../login.php, tombol "Lock" -> ../logout.php).
- `costcore/api.php` : REST backend (session-guarded) -> Cost Core sheet via GoogleSheets(SA costcore).
  Routes: GET costings/{type}, GET costings/load/{id}, POST costings, PUT/DELETE costings/{id}.
- `costcore/.htaccess` : rewrite api/(.*) -> api.php (copy cil).
- `secure/costcore_service_account.json` : SA Cost Core (web-blocked + gitignored).
CHANGED:
- `lib/GoogleSheets.php` : constructor terima path SA opsional (default = SA utama). Backward-compatible.
  (Modul otomatis dapat retry 429/503 yang sudah ada.)
- `config.php` : + spreadsheets['costcore'] + 'costcore_service_account'.
- `index.php` (landing) : + kartu "Cost Core".
- `router.dev.php` : + 'costcore' ke regex rewrite (DEV ONLY, tidak diupload).

## Verifikasi (semua PASS)
- `php -l` semua file: OK.
- E2E lokal (14 tes): create/list/load/update/delete + validasi 400 + unauth 401; baseline import 38 utuh.
- Claude-in-Chrome (lokal): landing 3 kartu; Cost Core terbuka langsung tanpa passcode; Import &
  Domestic render; Load Cloud tampil data nyata sheet; load costing -> form terisi + hitung ulang;
  0 error console.
- Live pasca-deploy: login 302; landing ada kartu Cost Core; /costcore/ 200;
  API import=38 domestic=22 (total 60); SA -> 403; unauth API -> 401.

## Deploy
7 file di-upload via FTP ke `salesconnect.tapworkspace.com`:
costcore/index.php, costcore/api.php, costcore/.htaccess, secure/costcore_service_account.json,
config.php, lib/GoogleSheets.php, index.php.

## Sisa / catatan
- `costcore_html` standalone (port 8787) tetap jalan sendiri ke sheet yang sama (berdampingan).
- Masih pending keamanan umum: ganti password admin SalesConnect, rotasi FTP, regenerate SA keys
  (salesconnect & costcore) karena sempat transit FTP cleartext.
- SalesConnect bukan git repo -> spec/log tidak di-commit (hanya file).
