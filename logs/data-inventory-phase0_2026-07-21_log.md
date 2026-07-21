# Phase 0 — Data inventory & sync direction correction

- **Tanggal:** 2026-07-21
- **Oleh:** Claude Code

## Ringkasan
Read-only discovery atas semua data source (Neon legacy + Google Sheets untuk 5 modul).
Membuat `docs/DATA_INVENTORY.md`. Mengoreksi asumsi arah sync: **Google Sheets kini satu-satunya
jalur tulis yang hidup; Neon adalah snapshot beku.** Karena itu "Neon → Sheets" bukan lagi arah
sync yang benar — Phase 1 direinterpretasi jadi **rekonsiliasi read-only** (lihat inventory §7).

## Perubahan
- Tambah `docs/DATA_INVENTORY.md` (inventory lengkap 5 modul + skema Neon legacy CIL/TaskFlow +
  peta Neon↔Sheets + daftar masalah keterbacaan Excel untuk Phase 3).
- Tidak ada perubahan kode aplikasi. Tidak ada tulisan ke Neon maupun Sheets.

## File yang disentuh
- `docs/DATA_INVENTORY.md` (baru)
- `logs/data-inventory-phase0_2026-07-21_log.md` (log ini)

## Alasan
Deliverable Phase 0 dari permintaan owner (inventory + rencana), dan mengunci arah sync yang benar
sebelum ada operasi tulis apa pun.

## Verifikasi / uji
- Sumber inventory: `tools/migrate_neon_to_sheets.js`, `../cil/schema.sql`, per-modul `*_util.php`
  & `api.php`, `config.sample.php`, log migrasi 2026-07-20.
- Konfirmasi owner: live write path = Sheets only; Neon beku; scope = 5 modul; Sheets-only rows = keep & flag.
- Belum diverifikasi ke host (sandbox tanpa jaringan) — row count & nilai Sheets terkini menyusul.

## Sisa / risiko
- Row counts/nilai Sheets terkini butuh host ber-jaringan (§9 inventory).
- Redesign skema (Phase 3) akan menyentuh `*_util.php` + `api.php` + frontend field names +
  migrate script secara lockstep — belum dikerjakan; menunggu persetujuan rencana.
