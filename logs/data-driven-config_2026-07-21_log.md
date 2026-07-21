# Data-driven config (admin-manageable lookups) — CIL, costcore, scot

- **Tanggal:** 2026-07-21
- **Oleh:** Claude Code

## Ringkasan
Mengubah pilihan dropdown/enum yang sebelumnya hardcoded menjadi **data-driven** (tab `cfg_*` di
Google Sheets) yang dikelola admin lewat tombol **⚙ Settings** di tiap modul — tanpa ubah kode.
Aditif penuh: tidak ada tab data lama yang disentuh; frontend tetap punya fallback hardcoded.
Rekonsiliasi Neon↔Sheets tetap hijau (semua tab operasional identik).

## Perubahan
### Framework (baru)
- `lib/config_registry.php` — registry lookup per modul (tab, key, cols, seed).
- `lib/config_util.php` — CRUD generik + `cfg_ensure` (buat+seed tab, idempotent, non-destruktif) +
  `cfg_handle` (router `config`: GET open, write butuh login, delete = soft `active=FALSE`).
- `assets/config-admin.js` — widget Settings self-contained (safe DOM, dipakai scot & costcore).
- `tools/setup_config_tabs.php` — buat+seed semua tab cfg (idempotent).
- `tools/config_test.php` — 21 unit test (semua lulus).
- `tools/backup_sheets.js` — backup read-only semua tab 5 spreadsheet.

### Bugfix (ditemukan saat kerja)
- `lib/GoogleSheets.php` — **token OAuth di-cache per service account** (`token_<hash>.json`).
  Sebelumnya satu `token.json` dipakai bersama → instance costcore (SA `costcore@`) memakai token
  SA default → **403 intermittent**. Fix ini juga memperbaiki bug laten di produksi.

### Per modul
- **CIL**: tab `cfg_channels`, `cfg_priorities`, `cfg_complaint_statuses` (seed = nilai lama).
  `cil/api.php` route `config` + validasi status komplain kini baca dari config (fallback ke lama).
  `cil/assets/js/app.js`: CHANNELS/PRIORITIES/CPL_STATUSES jadi `let` + `loadConfig()` (fallback) +
  Settings modal. `cil/index.php`: tombol ⚙ Settings + modal.
- **costcore**: tab `cfg_payment_terms` (9 seed). `costcore/api.php` route `config`.
  `costcore/index.php`: `PAY_OPTS` jadi `let` + `loadCostcoreConfig()` (fallback) + tombol Settings.
- **scot**: tab `cfg_cargo_types`, `cfg_shipment_types`, `cfg_shipment_routes`, `cfg_cargo_statuses`,
  `cfg_statuses` (seed = nilai lama). `scot/api.php` route `config`. `scot/assets/forms.js`:
  `SCOT_OPTS` + `loadScotConfig()` + `mkInput` baca opsi dari config; `scot/assets/main.js` load
  config sebelum render; `scot/assets/index.html`: tombol ⚙ Settings + include widget.
- **TaskFlow**: TIDAK diubah — status = workflow state machine (bukan dropdown), assignee sudah
  data-driven via tab `staff`. Tidak ada enum yang perlu di-config.
- `router.dev.php`: tambah `scot|salespulse` ke rewrite api (dev only).

## File yang disentuh
lib/config_registry.php (baru), lib/config_util.php (baru), lib/GoogleSheets.php,
assets/config-admin.js (baru), tools/setup_config_tabs.php (baru), tools/config_test.php (baru),
tools/backup_sheets.js (baru), cil/api.php, cil/index.php, cil/assets/js/app.js,
costcore/api.php, costcore/index.php, scot/api.php, scot/assets/forms.js, scot/assets/main.js,
scot/assets/index.html, router.dev.php, docs/DATA_DICTIONARY.md (baru).

## Verifikasi / uji
- Lint: 10 file PHP + 6 file JS → semua bersih.
- Unit: `config_test.php` 21/21; `reconcile_test.js` 7/7.
- Live (browser, sesi login nyata):
  - CIL: GET config OK; POST tanpa login → 401; dengan login → 201; tambah channel via Settings UI
    muncul seketika lalu dihapus; validasi status komplain baca config.
  - scot: `SCOT_OPTS` terisi dari config (5 lookup); widget Settings render 5 tab; POST 201 / GET
    muncul / DELETE 200 / hilang dari active. Baris uji dibersihkan.
  - costcore: data layer terbaca via SA costcore (9 payment_terms); UI di balik PIN (pola sama scot).
- Rekonsiliasi Neon↔Sheets diulang → tetap hijau (semua tab operasional identik, 0 differ).
- Backup penuh 5 spreadsheet di `backups/2026-07-21T01-00-39-106Z/` sebelum tulis apa pun.

## Alasan
Permintaan owner: sistem sepenuhnya **user-manageable** — admin kelola data konfigurasi dari app
tanpa edit kode. Pendekatan aditif + fallback menjamin CRUD lama tak rusak (least-destructive).

## Sisa / risiko
- **costcore Settings** butuh login SalesConnect (write) + PIN costcore (gate halaman). Bila
  costcore dibuka tanpa cookie PIN, `loadCostcoreConfig()` 401 → pakai default (== seed) sampai
  reload setelah unlock. Fungsional; hanya kustomisasi payment terms yang telat tampil di edge itu.
- Cleanup opsional nanti: hapus array hardcoded (fallback) setelah yakin — sekarang sengaja disimpan.
- salespulse belum diberi tombol Settings untuk `products`/`aliases` (sudah data-driven; bisa
  ditambah widget nanti bila diinginkan).
