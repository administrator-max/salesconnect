# costcore — column-based storage (drop data_json)

- **Tanggal:** 2026-07-21
- **Oleh:** Claude Code

## Ringkasan
Rewrite penyimpanan Cost Core dari satu blob `data_json` → **kolom nyata** di tiga tab:
`costings` (header/parameter), `costings_items` (item, sumber), `costings_margins` (tier margin
domestik). Kontrak API tetap sama (frontend tak berubah): store men-decompose objek nested saat
tulis dan me-recompose saat baca. Menggantikan pendekatan companion-mirror sebelumnya.

## Perubahan
- `lib/costcore_store.php` (baru) — decompose/recompose + cc_save/load/list/delete + auto-setup
  schema (cc_ensure_header menambah kolom, cc_ensure_tab memperbaiki header child). cc_load punya
  **fallback `data_json`** untuk baris belum termigrasi (cutover mulus).
- `costcore/api.php` — pakai store (tak lagi baca/tulis data_json). Kontrak route tetap.
- `tools/migrate_costcore_columns.php` (baru) — CUTOVER: re-save semua costing ke kolom, verifikasi
  round-trip, lalu hapus kolom `data_json` + tab `costings_readable` usang. `--confirm` untuk apply.
- `tools/costcore_store_test.php` (baru) — 10 unit test offline (import+domestik decompose/recompose).
- `tools/costcore_roundtrip_test.php` (baru) — uji round-trip terhadap 65 costing NYATA (read-only).
- Hapus `lib/costcore_readable.php` + `tools/rebuild_costcore_readable.php` (usang).
- `docs/DATA_DICTIONARY.md` — skema kolom baru.

## Verifikasi / uji
- `php -l` bersih (store, api, migration, tests).
- Unit store: **10/10**. Round-trip data NYATA: **65/65** (decompose→recompose == asli, abaikan UI/id).
- **BELUM diterapkan ke sheet live** (sengaja): host masih pakai kode lama (data_json) karena deploy
  terblok. Sheet live tetap utuh & terbaca (data_json + companion tabs) sampai cutover.

## Urutan cutover (WAJIB, setelah deploy)
1. Set 3 secret FTP di GitHub → deploy kode baru (yang baca kolom + fallback data_json).
2. `php tools/migrate_costcore_columns.php` (dry-run) lalu `--confirm` → migrasi 65 baris ke kolom,
   verifikasi, hapus kolom data_json + tab costings_readable.
3. Smoke test CRUD di app.
   > Jangan jalankan migrasi SEBELUM deploy: menghapus data_json akan merusak kode lama yang live.

## Alasan
Permintaan owner: data "straight through" tanpa JSON. Kolom = tab `costings` sendiri terbaca.
Aman: round-trip terbukti tanpa kehilangan data; backup penuh di backups/2026-07-21T01-00-39-106Z/.

## Sisa / risiko
- Item domestik pakai `margin_idx` → `costings_margins.margin_no` (jaga saat edit margin di app).
- Migrasi idempoten & aman diulang. Fallback data_json otomatis untuk baris belum termigrasi.
