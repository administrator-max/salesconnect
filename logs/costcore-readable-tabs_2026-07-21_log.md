# costcore — readable companion tabs (flatten data_json)

- **Tanggal:** 2026-07-21
- **Oleh:** Claude Code

## Ringkasan
Tab `costings` menyimpan tiap costing sebagai satu blob `data_json` yang tak terbaca manusia
(keluhan user: "the user can't read it properly"). Menambah dua tab READ-ONLY yang memflatten
blob itu jadi kolom rapi, di-rebuild otomatis tiap kali ada tulis costcore:
- `costings_readable` — 1 baris per costing (semua parameter dijabarkan).
- `costings_items` — 1 baris per item (produk, qty, harga, margin).
Tab `costings` operasional TIDAK disentuh (app tetap baca/tulis `data_json`). Aditif + aman.

## Perubahan
- `lib/costcore_readable.php` (baru) — flattener import & domestic + `cc_rebuild_readable`/`cc_rebuild_safe`.
- `costcore/api.php` — require + panggil `cc_rebuild_safe($gs,$SID)` setelah POST/PUT/DELETE.
- `tools/rebuild_costcore_readable.php` (baru) — backfill sekali jalan (idempotent).
- `docs/DATA_DICTIONARY.md` — dokumentasi kedua tab.

## Verifikasi / uji
- `php -l` bersih (costcore_readable, api, tool).
- Backfill dijalankan LIVE: **65 costings → costings_readable, 470 baris → costings_items**.
- Baca balik: kolom terisi benar (customer, ship_type, destination, kurs, margin, payment_terms,
  num_items, total_qty; item: product, quantity, unit_price, margin). Tidak ada blob JSON.

## Alasan
Membuat data costcore terbaca di Excel tanpa membongkar penyimpanan `data_json` (yang dipakai app
untuk load/save state bersarang). Companion tab = least-destructive, CRUD tetap jalan.

## Sisa / risiko
- Rebuild penuh 2 tab tiap tulis (~5 API call). costcore jarang ditulis → OK.
- `costings_readable`/`costings_items` JANGAN diedit manual (ditimpa saat save berikutnya).
- Data readable sudah live sekarang (backfill langsung ke Sheets); auto-refresh butuh deploy kode.
- Blob JSON minor lain (CIL `records.participants`, salespulse `plan_revisions.qty`) belum
  di-flatten — bisa menyusul dengan pola sama bila diinginkan.
