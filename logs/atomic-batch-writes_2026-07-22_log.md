# Atomic multi-tab writes for iqdash via GoogleSheets::batchRewrite

- **Tanggal:** 2026-07-22
- **Oleh:** Claude Code

## Ringkasan
Menambahkan method `batchRewrite` (additive-only) ke `lib/GoogleSheets.php` yang dipakai bersama
oleh semua modul, lalu me-refactor jalur tulis multi-tab di `iqdash` (record-obtained, cycles
replace, patch company) supaya memakai SATU panggilan `batchRewrite` per operasi — mengembalikan
atomicity lintas-tab (mis. `cycles`/`cycle_products` tidak bisa lagi desync kalau salah satu
tulisan gagal di tengah jalan) sekaligus memotong jumlah panggilan API Sheets.

## Perubahan
- `lib/GoogleSheets.php`: tambah method publik baru `batchRewrite($id, array $tabWrites)` — SATU
  `values:batchUpdate` (tulis semua tab yang ada baris) + SATU `values:batchClear` (bersihkan sisa
  baris di bawahnya), urutan write-first-then-clear (fix insiden wipe 2026-06-12) dipertahankan.
  Tidak ada method lama yang diubah/di-rename — `git diff` hanya berisi penambahan.
- `iqdash/iqdash_write.php`:
  - Tambah `iq_batch_write_full_tables()` — helper baru yang membangun matrix baris per tab
    (pakai `iq_log_cell()` yang sama seperti sebelumnya) untuk banyak tab sekaligus, lalu panggil
    `GoogleSheets::batchRewrite()` SATU KALI.
  - `iq_write_full_table()` sekarang jadi thin wrapper 1-tab di atas `iq_batch_write_full_tables()`
    — jadi cuma ada SATU jalur kode tulis-full-table (dipakai `pertek_perubahan_release`, situs
    single-tab lain yang tidak diubah perilakunya).
  - `iq_replace_cycles()`: `cycles` + `cycle_products` sekarang SATU panggilan batch (sebelumnya
    2 panggilan `updateRange`+`clearValues` terpisah per tab, 4 API call total, non-atomic).
  - `iq_record_obtained()`: `cycles` + `cycle_products` + `company_product_stats` + `companies`
    sekarang SATU panggilan batch. Guard anti-wipe companies (baris kosong = jangan tulis, balikan
    error 500) ditambahkan SEBELUM panggilan batch — konsisten dengan guard yang sudah ada di
    `iq_patch_company()`.
  - `iq_patch_company()`: loop per-tab `iq_write_full_table()` diganti jadi kumpulkan semua tab
    yang berubah ke satu array `$sets`, lalu SATU panggilan `iq_batch_write_full_tables()`. Guard
    anti-wipe companies yang sudah ada (2026-06-12) TIDAK diubah — tetap dicek sebelum baris tulis
    manapun dieksekusi.
- `iqdash/tests/test_record_obtained.php`: `StubSheets` ditambah override `batchRewrite()` (apply
  ke tabel in-memory: baris di row 2+, sisa dibersihkan) karena `iq_record_obtained()` sekarang
  memanggil `batchRewrite` bukan `updateRange`/`clearValues` — supaya assertion netting yang sudah
  ada tetap jalan lewat jalur kode nyata.
- `iqdash/tests/test_batch_write.php` (baru): test untuk `GoogleSheets::batchRewrite()` (verifikasi
  lewat Reflection atas source method asli — lihat catatan di file test kenapa tidak bisa
  dipanggil live tanpa network/kredensial — plus mirror pure-logic test untuk bentuk request) dan
  regression test bahwa `iq_replace_cycles()` sekarang mengeluarkan TEPAT SATU panggilan
  `batchRewrite` yang mencakup `cycles` DAN `cycle_products` sekaligus.

## File yang disentuh
- `lib/GoogleSheets.php` — tambah `batchRewrite()` (additive only)
- `iqdash/iqdash_write.php` — refactor jalur tulis multi-tab + komentar dokumentasi terkait
- `iqdash/tests/test_record_obtained.php` — update `StubSheets` untuk stub `batchRewrite`
- `iqdash/tests/test_batch_write.php` — test baru

## Alasan
Sebelum perubahan ini, `iq_replace_cycles`/`iq_record_obtained`/`iq_patch_company` menulis tab satu
per satu (2 API call per tab: `updateRange` + `clearValues`). Kalau koneksi putus atau salah satu
panggilan gagal DI TENGAH sekuens (mis. sesudah `cycles` sukses tapi sebelum `cycle_products`),
kedua tab bisa desync — KPI cycles-based dan breakdown stats-based tidak lagi konsisten. Pola ini
sudah pernah dipecahkan di `iq_dash` (Node) lewat `sheetsStore.js`'s `batchRewrite()`; port ini
membawa pola yang sama ke `salesconnect`, sebagai method BARU di `lib/GoogleSheets.php` (dipakai
bersama modul lain) supaya modul lain juga bisa memakainya nanti tanpa perlu perubahan lagi.

## Verifikasi / uji
- `php -l lib\GoogleSheets.php` — clean.
- `php -l iqdash\iqdash_write.php` — clean.
- `git diff lib/GoogleSheets.php` — hanya penambahan (33 insertions, 0 deletions).
- Semua 11 test file iqdash yang sudah ada + 1 test baru (`test_batch_write.php`) = 12 suite,
  semua `ALL PASS` (atau `PASS health JSON` untuk `test_router_get.php`).

## Sisa / risiko
- Belum diuji live ke Google Sheets sungguhan (sandbox tidak ada akses jaringan) — konsisten
  dengan status modul iqdash secara keseluruhan (lihat memory `iqdash-module-port`).
- `batchRewrite` baru tersedia untuk `iqdash`; modul lain (`cil`, `taskflow`, `costcore`, `scot`,
  `sales_pulse`) belum di-refactor untuk memakainya — di luar scope task ini, tidak ada perubahan
  perilaku pada modul-modul tersebut.
