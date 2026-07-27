# [ra-multi-wave-guard] 2026-07-27 — Jaga jalur tulis multi-gelombang + satu sumber untuk total RA

## Ringkasan
Menindaklanjuti audit "satu baris per perusahaan" (permintaan user). Model `ra_records` berubah jadi
**satu baris per kedatangan** pada `ra-multi-arrival_2026-07-27`, tapi hanya `getRA()` dan
`iqdash_data.php` yang ikut disesuaikan. Empat tempat lain masih menganggap satu perusahaan = satu
baris. Satu di antaranya jalur **tulis** — dan itu yang berbahaya.

Keputusan user: **pasang penjaga sekarang, redesain UI belakangan.**

## Temuan audit

| Lokasi | Jenis | Akibat |
|---|---|---|
| `13-rev-mgmt.js:1171` | **tulis** | ambil gelombang 1 lalu menimpanya dengan **total lot seluruh perusahaan** |
| `16-storage.js:245` | tulis | replay localStorage menimpa gelombang 1 dengan nilai se-perusahaan |
| `14-export.js:557` | baca | ekspor Realization Monitoring cuma gelombang 1 |
| `12-product-mt.js:431` | tulis | rename produk hanya kena gelombang 1 |

Yang paling parah `13-rev-mgmt.js`: untuk AMP ia akan menyimpan **799,120** di gelombang 1 sementara
gelombang 2 tetap memegang 399,942 → **1.199,062 MT masuk ke sheet**, lalu dikirim lewat
`patchToServer`. Penjaga di `iqdash_data.php:460` tidak menolong — itu menekan override *turunan*,
bukan angka yang sudah tertulis di sheet.

Catatan: `14-export.js:480` memakai `getRA` (gelombang **terakhir**) sedangkan `:557` memakai
`RA.find` (gelombang **pertama**) — dua ekspor di satu file yang saling tidak setuju, dan keduanya
bukan total perusahaan.

## Perubahan

### `01-data.js` — satu sumber kebenaran: `raTotals()`
Aturan "bagaimana menjumlahkan gelombang sebuah perusahaan" tadinya tersebar inline. Sekarang satu
helper: `raTotals(code, pool?)` → `{ rows, count, multi, arrived, berat, utilMT, realMT }`.
`berat` menjumlahkan semua gelombang; `multi` adalah sinyal bahwa bobot per gelombang bersifat
otoritatif sehingga angka se-perusahaan **tidak boleh** ditulis balik ke satu baris.
Ditambah `getRAWaves(code, pool?)`. Keduanya diekspor untuk tes (browser tidak terpengaruh).

### `13-rev-mgmt.js` — penjaga tulis
- 3a: bila `multi`, bobot tiap gelombang **tidak disentuh**; hanya `cargoArrived` ditegakkan ke semua
  baris (meniru `iqdash_data.php:462-464`), ETA/PIB tetap disinkronkan, plus toast pemberitahuan.
- 3b: `newBerat` **ditolak** untuk perusahaan multi-gelombang (satu field berat tidak bisa menyatakan
  gelombang mana) — toast error, bukan diam-diam salah simpan.
- `ra` sekarang `getRA(c)` (gelombang terakhir), bukan `RA.find` (pertama).
- `ra.obtained` disebar ke **semua** baris: itu angka level perusahaan, bukan per gelombang.

### `16-storage.js` — replay dilewati untuk multi-gelombang
`snap.ra` berkunci kode perusahaan sehingga secara struktur tak bisa mewakili dua gelombang.
Untuk perusahaan multi-gelombang bagian RA dilewati — **tanpa** membatalkan `patchToServer`, supaya
suntingan SPI perusahaan itu tetap terkirim.

### `14-export.js` — dua tabel kini menjumlahkan
Keduanya lewat `raTotals()`. `ra` (gelombang terakhir) tetap dipakai untuk kolom bernilai tunggal:
produk, tanggal tiba, ETA, status eligible.

### `12-product-mt.js` — rename kena semua gelombang
Rename separuh akan memecah satu perusahaan ke dua bucket produk di bawah pencocokan nama kanonik
dari `1d77143`.

### `assets/index.html` — cache-buster dinaikkan
`01-data v23→24`, `12-product-mt v4→5`, `13-rev-mgmt v8→9`, `14-export v4→5`, `16-storage v7→8`.
Tanpa ini browser tetap menyajikan JS lama setelah deploy.

## File yang disentuh
`iqdash/assets/js/01-data.js` · `12-product-mt.js` · `13-rev-mgmt.js` · `14-export.js` ·
`16-storage.js` · `iqdash/assets/index.html` · `iqdash/tests/test_ra_waves.cjs` (baru)

## Verifikasi
- `tests/test_ra_waves.cjs` baru — **21 assertion lulus**. Fixture memakai pecahan AMP/SGD asli:
  AMP 399,178 + 399,942 = **799,120**; SGD 1.507,536 + 488,562 = **1.996,098**.
  Ikut diuji: gelombang parsial (satu tiba, satu belum) tetap dihitung tiba; `berat` non-numerik
  (`null`, `'TBA'`) menyumbang 0, bukan `NaN`; perusahaan satu gelombang tidak berubah perilakunya.
  Satu assertion khusus menegaskan pembacaan gelombang-pertama lama **berbeda** dari total.
- 3 suite JS lulus (35 + 15 + 21) · 13 suite PHP lulus, nol regresi.
- `node --check` bersih seluruh `iqdash/assets/js/` · `php -l` bersih seluruh `iqdash/` + `lib/`.
- Urutan muat dicek: `01-data.js` (baris 1533) sebelum semua pemanggil `raTotals`.

## Sisa / risiko
- Ini **penjaga, bukan perbaikan menyeluruh**. Perusahaan multi-gelombang (kini AMP & SGD) belum bisa
  diedit beratnya lewat UI — harus lewat sheet. Redesain wave-aware (form + snapshot berkunci id
  baris) masih terbuka.
- Toast dipakai untuk memberi tahu; kalau `showToast` tidak ada, penolakan jadi senyap.
- Tab lain yang berkunci produk/perusahaan di luar `ra_records` belum ditelusuri.
