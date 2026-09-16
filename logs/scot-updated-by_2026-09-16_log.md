# SCOT — kolom `updated_by`: siapa yang terakhir mengubah data

**Tanggal:** 2026-09-16
**Modul:** SCOT (Shipment Control Tower)
**Lanjutan dari:** `scot-edit-dari-kartu_2026-09-16_log.md`

## Ringkasan

Sejak edit bisa dilakukan langsung dari kartu (termasuk shipment yang sudah
`Done`), lebih banyak orang bisa menyentuh data historis — tapi sheet `shipments`
hanya menyimpan `updated_at`, tanpa siapa pelakunya. Sekarang ada kolom
**`updated_by`**, diisi **dari sesi login di server**, dan ditampilkan di kartu
detail serta di header modal edit.

## Perubahan skema (Google Sheets)

Tab `shipments` bertambah satu kolom di paling kanan: **kolom 40 (AN) =
`updated_by`**. 39 kolom lama tidak bergeser, 203 baris data tidak tersentuh.

Dijalankan sekali lewat `tools/scot_add_updated_by.php` (idempotent; tanpa
`--write` hanya menampilkan rencananya).

**Kenapa perlu langkah tersendiri:** `GoogleSheets::appendAssoc()` dan
`updateAssoc()` memetakan assoc ke kolom **lewat baris header**. Kunci yang tidak
ada di header **dibuang diam-diam** — tanpa menambah headernya dulu, `updated_by`
dari `api.php` tidak akan pernah tersimpan dan tidak ada galat apa pun yang
memberi tahu.

**Gotcha yang muncul saat dikerjakan:** grid tab itu ternyata pas 39 kolom
(`Range (shipments!AN1) exceeds grid limits. Max columns: 39`). Jadi skripnya
melebarkan grid dulu dengan `appendDimension` sebelum menulis sel headernya.
Tab lain yang suatu saat perlu kolom baru akan kena hal yang sama.

## Perubahan kode

1. **`scot/scot_util.php` — `scot_actor()`**
   Mengembalikan `name` → `email` → `key` dari `sc_user()`, atau `''` kalau
   identitasnya tidak diketahui (mis. dipanggil dari CLI). Sengaja `''` dan bukan
   melempar galat: audit kosong lebih baik daripada penyimpanan yang gagal.

2. **`scot/api.php` — stempel di SEMUA jalur tulis**
   `$ACTOR = scot_actor()` dibaca sekali per permintaan, lalu dipasang pada:
   POST (buat baru), PUT (update), serta `POST shipments/bulk` untuk bagian
   `updates` maupun `inserts`. Jadi upload Excel massal pun ikut tercatat.

3. **Diambil dari sesi, BUKAN dari body.**
   `updated_by` sengaja **tidak** dimasukkan ke `SCOT_WRITABLE`, jadi
   `scot_sanitize()` membuang nilai apa pun yang dikirim klien. Kolom audit yang
   boleh diisi klien tidak membuktikan apa-apa.
   Catatan: ini **berbeda dengan `crmproject` dan `iqdash`**, yang memang menerima
   `updated_by` dari body permintaan. Kalau nanti keduanya diseragamkan, SCOT-lah
   polanya, bukan sebaliknya.

4. **Tampilan** (`scot/assets/ui.js`, `scot/assets/forms.js`)
   - Kartu detail (Import & Domestic) dapat baris **"Diubah oleh"** berisi nama +
     tanggal.
   - Header modal edit dapat baris **"Terakhir diubah oleh ... · tanggal"**.
   - Record lama yang belum punya `updated_by` **menyembunyikan** barisnya, bukan
     menampilkan "-". 203 baris lama memang kosong dan akan terisi sendiri saat
     pertama kali seseorang menyimpannya.

## File yang disentuh

- `scot/scot_util.php` — `scot_actor()`
- `scot/api.php` — `$ACTOR` + stempel di create / update / bulk
- `scot/assets/ui.js` — `editedByLine()` + baris "Diubah oleh" di kartu detail
- `scot/assets/forms.js` — baris "Terakhir diubah oleh" di header modal edit
- `scot/tests/util_test.php` — 6 pemeriksaan baru
- `tools/scot_add_updated_by.php` — **baru**, skrip penambah kolom (tidak
  di-deploy; `tools/*` ada di `.git-ftp-ignore`)

## Verifikasi

- `php scot/tests/util_test.php` — **24 ok, ALL PASS**. Yang baru: body berisi
  `updated_by`/`updated_at` dibuang `scot_sanitize()`; `scot_shape()` meneruskan
  `updated_by` apa adanya dan mengubah string kosong jadi `null`; `updated_at`
  tidak ikut dipotong jadi tanggal; `scot_actor()` aman dipanggil tanpa sesi.
- **Pemetaan kolom diuji ke spreadsheet PRODUKSI secara baca-saja.** Skrip
  sementara meniru persis alur PUT (`array_merge` + stempel) lalu memetakannya ke
  baris seperti `assocToRow()`, memakai header asli dan baris asli terakhir
  (`_row 204`, id 210). Hasil: `updated_by` mendarat tepat di kolom 40, lebar
  baris sama dengan lebar header, dan **39 kolom lama tidak ada yang berubah
  nilainya**. Tidak ada satu pun penulisan. Skrip dihapus sesudah dipakai.
- Browser + server tiruan: kartu yang punya `updated_by` menampilkan
  "Diubah oleh — Luzy · 1 Aug 2026"; kartu tanpa `updated_by` tidak menampilkan
  baris itu sama sekali; header modal menampilkan stempel yang sama.
- Simpan dari modal → **body permintaan berisi 34 kunci dan TIDAK mengandung
  `updated_by` maupun `updated_at`** (dibuktikan dari log server tiruan);
  stempel datang dari respons server, dan kartu langsung menampilkan nama baru.
- `php -l` untuk `api.php` & `scot_util.php`, `node --check` untuk `ui.js` &
  `forms.js` — lolos. Tidak ada error console.

## Sisa / risiko

- **Ini "siapa yang terakhir", bukan riwayat.** Tiap simpan menimpa nilai
  sebelumnya. Kalau nanti butuh jejak lengkap (siapa mengubah kolom apa, kapan),
  perlu tab `shipments_log` tersendiri — `api.php` sudah tahu diff-nya, tinggal
  ditulis.
- **203 baris lama kosong `updated_by`-nya** dan memang tidak bisa diisi surut —
  datanya tidak pernah ada.
- **Tidak ada `created_by`.** Tidak diminta, dan menambahnya butuh satu kolom
  lagi + langkah `appendDimension` yang sama.
- Nama yang tercatat mengikuti `lib/access.php`; untuk pintu darurat
  (`config.php['users']`) yang tercatat adalah username, bukan nama orang.
