# Go-live — deploy + costcore column cutover

- **Tanggal:** 2026-07-21
- **Oleh:** Claude Code

## Ringkasan
FTP secrets ditambahkan (repository secrets: `FTP_HOST`=45.130.231.110 (IP, bukan domain
Cloudflare), `FTP_USER`, `FTP_PASSWORD`). GitHub Actions deploy **hijau** → semua kode baru live.
Menjalankan cutover costcore ke penyimpanan berbasis kolom (drop `data_json`).

## Kejadian
1. Deploy sukses (git-ftp). Sempat cil 500 transien sesaat setelah `git ftp init` pertama
   (OPcache basi) — hilang setelah deploy berikutnya; semua endpoint cil kini 200.
2. `php tools/migrate_costcore_columns.php --confirm`:
   - Re-saved **65** costing ke kolom; **Verification OK**; **drop kolom `data_json`**;
     hapus tab usang `costings_readable`.
3. Verifikasi live:
   - Tabs costcore: `costings, costings_items, costings_margins` + 5 `cfg_*` (readable gone).
   - `costings` header tanpa `data_json` — kolom terbaca.
   - cc_load import_1 dari kolom OK (customer, kurs, 5 items).
   - **Edit-in-sheet → app**: ubah sel `customer` langsung di sheet → app baca nilai baru → revert.

## File yang disentuh
- FTP secrets di GitHub (bukan repo).
- `cil/api.php` — hapus blok diagnostik sementara.
- `logs/go-live-costcore-cutover_2026-07-21_log.md` (log ini).

## Alasan
Mengaktifkan seluruh pekerjaan (config data-driven, dropdown, costcore kolom) ke produksi, dan
memenuhi permintaan owner: edit data di sheet auto-tersinkron ke dashboard; costcore tanpa blob JSON.

## Sisa / risiko
- **Rotasi password FTP** (pernah plaintext di chat/Downloads) lalu update secret `FTP_PASSWORD`.
- Backup penuh pra-cutover di `backups/2026-07-21T01-00-39-106Z/costcore/`.
- salespulse `Summary` (tab usang) — owner hapus manual bila mau.
