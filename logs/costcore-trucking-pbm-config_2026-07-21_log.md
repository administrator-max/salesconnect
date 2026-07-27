# costcore trucking + PBM rates → Google Sheets; dropdown scroll-to-top

- **Tanggal:** 2026-07-21
- **Oleh:** Claude Code

## Ringkasan
Memindahkan dropdown **Trucking Destination** (beserta tarif) dan **PBM rates** ke Google Sheets.
Ini dropdown terakhir di costcore yang masih hardcoded (karena membawa data tarif yang memengaruhi
kalkulasi harga). Juga memperbaiki dropdown Trucking Destination agar terbuka dari atas (scroll-to-top).

## Perubahan
- `lib/config_registry.php` — 2 lookup baru:
  - `cfg_trucking_rates` (destination, bb_r, bb_rt, ct_f20, ct_f40, ct_cb) — 20 destinasi, tarif
    persis dari TRK_BB/TRK_CT.
  - `cfg_pbm_rates` (ship_type, pbm) — breakbulk/container20/container40.
- `costcore/index.php`:
  - TRK_BB / TRK_CT / PBM_MAP jadi `let`; di-rebuild dari config di `loadCostcoreConfig()`
    (fallback ke hardcoded bila config gagal/pra-PIN).
  - `showTujDD()` set `scrollTop=0` → dropdown buka dari atas.
  - Settings widget: tambah "Trucking Rates" & "PBM Rates" (bisa edit tarif + tambah destinasi).
- `tools/verify_trucking_rates.js` — verifikasi config == source (read-only).

## Verifikasi
- `verify_trucking_rates.js`: **OK — config rebuilds all rate tables EXACTLY** (20 BB, 14 CT, 3 PBM;
  order-insensitive; nilai tarif identik).
- `php -l` costcore/index.php OK; inline JS `node --check` OK.
- Sheets `cfg_trucking_rates` + `cfg_pbm_rates` dibuat live.

## Catatan
- Container-mode dropdown urutannya kini ikut sort_order gabungan (kosmetik; tarif tetap benar).
- **Semua dropdown costcore kini di Google Sheets.** Modul lain sudah lengkap sebelumnya.
- Butuh verifikasi visual di browser (costcore di balik PIN) setelah deploy.

## Sisa / risiko
- Tarif = data finansial: admin edit di Settings/sheet harus akurat (value bukan label).
