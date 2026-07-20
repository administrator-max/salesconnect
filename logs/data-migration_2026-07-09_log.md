# Data migration Neon → Google Sheets (go-live step 1)
- **Tanggal:** 2026-07-09
- **Oleh:** Claude Code (lokal, mesin user)

## Ringkasan
Menjalankan inisialisasi database SalesConnect di lingkungan ber-jaringan (mesin lokal
user). Karena kedua spreadsheet target masih **kosong** dan database Neon lama masih
**hidup dan berisi data produksi nyata**, dipilih jalur **migrasi** (bukan `setup.php`
seed dummy). Tujuannya mempertahankan data asli CIL & TaskFlow.

## Verifikasi pra-migrasi
- Service account `salesconnect@eagle1-492706.iam.gserviceaccount.com` valid; JWT→token OK.
- Kedua spreadsheet sudah di-share ke SA (baca terbukti). Sebelum migrasi: hanya `Sheet1` kosong.
- Neon CIL & TaskFlow reachable (dari `../cil/.env` & `../taskflow/.env`), berisi data nyata.

## Perubahan (data, bukan kode)
- Menjalankan `tools/migrate_neon_to_sheets.js` dengan `NODE_PATH` → `../cil/node_modules`
  (agar `require('pg')` ter-resolve; folder salesconnect sendiri tak punya node_modules).
- Tab dibuat + diisi di spreadsheet CIL: `companies` (25), `salespeople` (9), `records` (55),
  `discussions` (238), `complaints` (1), `complaint_responses` (2).
- Tab dibuat + diisi di spreadsheet TaskFlow: `staff` (7), `tasks` (6).
- Migrasi ini juga **membuktikan SA punya akses Editor (write)** — tab di-clear lalu ditulis ulang.

## File yang disentuh
- Tidak ada file kode diubah. Hanya data di Google Sheets yang ditulis.
- Script dipakai apa adanya: `tools/migrate_neon_to_sheets.js`.

## Alasan
Data produksi nyata ada di Neon → seed dummy `setup.php` akan salah (kehilangan 55 record &
6 task asli). Migrasi mempertahankan data. Idempotent (clear+rewrite), aman diulang.

## Verifikasi / uji
- Re-probe Sheets API pasca-migrasi: tab CIL (7 termasuk Sheet1) & TaskFlow (3 termasuk Sheet1) ada.
- Jumlah baris cocok 1:1 dengan hitungan row Neon.
- Data layer end-to-end terverifikasi via alur JWT+Sheets yang identik dengan `lib/GoogleSheets.php`.

## Sisa / risiko / langkah lanjut
- `Sheet1` bawaan masih ada di kedua spreadsheet (diabaikan app; boleh dihapus manual).
- **Belum deploy** file PHP ke Niagahoster (`public_html`) — menunggu username FTP.
- PHP tidak terpasang di mesin lokal → uji PHP end-to-end baru bisa dilakukan di host.
- Setelah deploy: ganti password admin, hapus `setup.php`, rotasi password FTP (terkirim plaintext).
- Neon lama masih hidup — pertimbangkan cutover/putuskan setelah verifikasi app di host.
