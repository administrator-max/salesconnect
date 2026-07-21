# Phase 3 prep — hardcoded-config audit (data-driven redesign)

- **Tanggal:** 2026-07-21
- **Oleh:** Claude Code

## Ringkasan
Audit read-only atas semua nilai hardcoded (enum, dropdown, config) di 5 modul, sebagai fondasi
redesign Phase 3 yang direframe: sistem **fully data-driven / admin-manageable** (user kelola
data konfigurasi lewat app tanpa ubah kode). Membuat `docs/CONFIG_AUDIT.md`. Belum ada proposal
migrasi penuh — menunggu hasil rekonsiliasi (keputusan timing owner: "after reconciliation").

## Perubahan
- `docs/CONFIG_AUDIT.md` (baru) — peta hardcoded → sumber DB usulan + pertanyaan desain.
- Tidak ada perubahan kode/DB.

## File yang disentuh
- `docs/CONFIG_AUDIT.md` (baru)
- `logs/config-audit-phase3-prep_2026-07-21_log.md` (log ini)

## Alasan
Menyiapkan bahan proposal Phase 3 tanpa menunggu, sambil menghormati urutan owner (proposal penuh
setelah rekonsiliasi).

## Verifikasi / uji
- Sumber: grep enum/option/VALID_ di `*.php/js/html`; temuan kunci — CIL `CHANNELS`/`PRIORITIES`
  (app.js), complaint status `$allowed` (api.php:107); costcore `VALID_TYPE`/`whtRate`/`margins`/
  `PAY_OPTS`; scot cargo/shipment/status dropdowns + year filter; salespulse sudah mayoritas
  data-driven (products/aliases/segments/years).

## Sisa / risiko
- Proposal penuh + migrasi (lookup-tab pattern, config API, admin UI) menyusul setelah rekonsiliasi.
- Perhatian referensial: baris historis menyimpan *value* enum → edit label boleh, ubah value harus cascade.
