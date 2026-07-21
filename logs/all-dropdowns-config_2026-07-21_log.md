# Sweep — remaining hardcoded dropdowns → config sheets

- **Tanggal:** 2026-07-21
- **Oleh:** Claude Code

## Ringkasan
Menyisir SEMUA dropdown di semua app dan memindahkan yang masih hardcoded ke config sheet baru.
Sisanya sudah data-driven (config/data): CIL channels/priorities/statuses, scot cargo/shipment/
route/cargo-status/status, costcore payment_terms, plus picker berbasis data (staff, companies,
products, consignee, year). Kalender bulan & view-mode selector bukan config (dibiarkan).

## Config sheet baru (dibuat live)
- **scot**: `cfg_document_types` (BL / PIB / Surat Jalan / Other) — dropdown tipe dokumen upload.
- **costcore**: `cfg_hedging_days` (60/90/150), `cfg_shipment_types`, `cfg_margin_types`,
  `cfg_commission_units`. Tiga terakhir **calc-bound**: label bebas diedit, tapi `value`
  (breakbulk/container20/container40, fixed/percent, idr/usd) mengikat rumus pricing — jangan ubah
  value / tambah tanpa kode.

## Perubahan
- `lib/config_registry.php` — 5 lookup baru + seed.
- `scot/assets/forms.js` — `SCOT_DOC_TYPES` + load dari config + dropdown `og-doc-type` dari config
  + tab "Document Types" di Settings widget.
- `costcore/index.php` — `CC_CFG` (4 lookup) + load dari config + 4 dropdown render dari config
  (shipment type, hedging days, margin type, commission unit) + lookup di Settings widget.
- `docs/DATA_DICTIONARY.md` — dokumentasi.

## Verifikasi / uji
- `php -l` costcore/index.php & config_registry bersih; `node --check` forms.js OK.
- Tab dibuat live: costcore cfg_hedging_days/shipment_types/margin_types/commission_units;
  scot cfg_document_types (setup idempotent — lainnya "exists").
- Seed terbaca (php): hedging_days 60/90/150; shipment_types breakbulk(Break Bulk)/…; margin_types
  fixed(Fixed (IDR/kg))/percent; commission_units idr(IDR/kg)/usd.
- Live (browser): scot `SCOT_DOC_TYPES` terisi dari config (BL/PIB/SuratJalan→"Surat Jalan"/Other),
  tanpa console error. costcore config API 401 tanpa PIN (gate benar); data terverifikasi via SA.

## Sisa / risiko
- Wiring frontend aktif setelah deploy kode; **sheet-nya sudah live sekarang** (setup langsung ke Sheets).
- costcore calc-bound lookups: dokumentasikan agar admin hanya relabel/reorder, jangan ubah value.
- Deploy masih terblok: secret FTP (FTP_HOST/USER/PASSWORD) belum diset di GitHub → CI gagal.
