# SalesPulse: "PROJECTS" hantu di filter Juli — produk kosong tidak boleh menyamar jadi kategori nyata
- **Tanggal:** 2026-08-20
- **Oleh:** Claude Code (laporan David Adi Nugroho via Ridwan)

## Ringkasan
Filter Juli 2026 memunculkan produk **PROJECTS Rp 407,79 juta (163,12% dari budget)** di Top 3
Products, padahal tidak ada satu pun PS Juli yang produknya Projects. Penyebabnya bukan salah
hitung: `sp_prod_key()` memetakan `product` kosong ke string `'Projects'`, dan `'Projects'`
kebetulan adalah **produk nyata** di tab `products` yang punya 12 baris budget sendiri
(Rp 250 juta margin/bulan). Jadi PS yang produknya belum terisi menumpang diam-diam di kategori
yang memang ada isinya, lengkap dengan achievement % yang terlihat sah.

## Temuan data (live sheet, 2026-08-20)
Dari 124 baris `ps_headers`, **tepat 4 baris** yang `product`-nya kosong — semuanya Juli 2026,
semuanya rantai SUMEC 01A/01B ke PT. Pilar Teknindo Jaya, semuanya diunggah 2026-08-03:

| PS | Project | Margin |
|---|---|---|
| PSF26-ATL-000045.R1 | SUMEC 01A - Del. August 2026 - PTJ | 178.500.000 |
| PSF26-HKG-000002.R1 | SUMEC 01A - Del. August 2026 - PTJ | 116.120.097 |
| PSF26-ATL-000046.R1 | SUMEC 01B - Del. August 2026 - PTJ |  71.400.000 |
| PSF26-JKT-000002.R2 | SUMEC 01B - Del. August 2026 - PTJ |  41.773.498 |
| **Total** | | **407.793.595** |

Rp 407.793.595 = Rp 407,79 juta, dan 407,79 / 250 = **163,12%** — persis angka di kartu MTD.

Kenapa kosong: deteksi produk di `api.php` dipagari `if (count($items) > 0)`, padahal haystack
deteksinya sudah memuat `projectName`. PS revisi yang masuk tanpa baris item tidak pernah dicoba
sama sekali, dan `product` tersimpan kosong tanpa jejak apa pun.

Produk sebenarnya dikonfirmasi tim (Ridwan, 2026-08-20): **PPGL**.

## Perubahan
**Kode**
- `sp_prod_key()`: fallback produk kosong **bukan lagi `'Projects'`**, tapi sentinel
  `SP_PRODUK_BELUM_DIISI = '(Produk Belum Diisi)'`. Tanda kurung dipilih supaya tidak mungkin
  bertabrakan dengan nama produk mana pun di master dan langsung terbaca sebagai lubang data.
- `consolidation.php`: default `$canonicalProduct` untuk rantai yang semua leg-nya belum
  berproduk ikut memakai sentinel yang sama.
- `api.php`: deteksi produk lewat `product_aliases` **selalu** dijalankan, tidak lagi dipagari
  jumlah item.
- `api.php`: respons upload membawa `productWarning` (produk tidak terdeteksi) dan `monthWarning`
  (PO Date tidak terbaca sehingga PS dilempar ke Januari).
- `assets/js/app.js`: pengunggah diberi toast peringatan yang menyebut nomor PS-nya, bukan
  sekadar "tersimpan".
- Peta produk→segment dipindah dari inline `api.php` ke `sp_segment_for_product()` di
  `salespulse_util.php`, supaya jalur upload dan tool perbaikan data tidak bisa memberi segment
  berbeda untuk produk yang sama.
- `tests/util_test.php`: assertion `prodkey blank` diperbarui + 2 assertion baru yang mengunci
  bahwa kosong TIDAK BOLEH jadi `'Projects'` dan `'Projects'` asli tetap `'Projects'`.

**Data (sheet live)**
- 4 baris di atas diisi `product='PPGL'`, `segment='Coated'` lewat tool baru
  `tools/salespulse_isi_produk_kosong.php`. Sisa baris tanpa product: **0**.

## File yang disentuh
- `salespulse/salespulse_util.php` — `SP_PRODUK_BELUM_DIISI`, fallback `sp_prod_key()`, `sp_segment_for_product()`
- `salespulse/consolidation.php` — default produk kanonik rantai
- `salespulse/api.php` — deteksi produk tak lagi bergantung item; `productWarning` + `monthWarning`; pakai `sp_segment_for_product()`
- `salespulse/assets/js/app.js` — kumpulkan & tampilkan peringatan per PS saat upload
- `salespulse/tests/util_test.php` — assertion sentinel
- `tools/salespulse_isi_produk_kosong.php` — BARU; pengisi product+segment yang kosong, idempoten, uji kering default
- `logs/salespulse-projects-hantu_2026-08-20_log.md` — log ini

## Alasan
Nilai boleh salah tempat, itu bisa diperbaiki. Yang berbahaya adalah salah tempat yang **tidak
kelihatan**: dengan label `'Projects'`, lubang data tampil sebagai kategori bisnis yang punya
budget dan achievement, jadi tidak ada yang curiga. Dengan sentinel, angka yang sama tetap
tampil (KPI total tidak berubah) tapi wajahnya jujur — dan sekarang lubangnya sudah ditutup
di sumbernya.

## Verifikasi / uji
- `php -l` bersih untuk `salespulse_util.php`, `consolidation.php`, `api.php`,
  `tools/salespulse_isi_produk_kosong.php`; `node --check` bersih untuk `app.js`.
- `php salespulse/tests/util_test.php` → ALL PASS · `php salespulse/tests/consolidation_test.php` → ALL PASS.
- Tool pengisi dijalankan uji kering dulu, baru `--apply`; hasil diverifikasi ulang dari sheet.
- Konsolidasi dijalankan atas data live 2026, filter Juli (MTD), SESUDAH perbaikan:

  | # | Produk | Margin | Budget | Ach. |
  |---|---|---|---|---|
  | 1 | Galvanized | 3.424,10 M | 2.550,00 M | 134,28% |
  | 2 | Galvalume | 510,61 M | 750,00 M | 68,08% |
  | 3 | PPGL | 407,79 M | 0 | off-plan |
  | 4 | Seamless Pipe | 383,40 M | 0 | off-plan |
  | 5 | Wear Plate | 352,63 M | 2.939,43 M | 12,00% |
  | … | Projects | **0,00 M** | 250,00 M | **0,00%** |

  Galvanized 134,28% dan Galvalume 68,08% **tidak bergeser sedikit pun** — total margin Juli
  tetap 5.108,30 M. Yang berubah hanya nama tempat Rp 407,79 juta itu berdiri.

## Sisa / risiko
- PPGL Juli tampil **margin 407,79 M tapi revenue 0 dan volume 0 MT**. Itu bukan bug hitung:
  keempat PS SUMEC 01A/01B tidak punya satu pun baris di `ps_items`, dan revenue/volume hanya
  dihitung dari leg eksternal yang **membawa item**. Kalau angka tonase & revenue-nya mau ikut
  terhitung, PS-nya perlu diunggah ulang lengkap dengan tabel item-nya.
- PPGL belum punya baris budget untuk Juli (hanya 2 baris budget PPGL di 2026), jadi tampil
  `off-plan`. Perlu diputuskan tim apakah budget PPGL memang belum dialokasikan.
- Kelas masalah yang sama masih ada di penempatan bulan: PO Date tak terbaca tetap dibuang ke
  Januari. Perilakunya sengaja tidak diubah supaya angka lama tidak bergeser — sekarang hanya
  diberi peringatan saat upload. Saat ini tidak ada baris yang salah tempat karenanya
  (44 PS ber-`po_date` kosong, tapi `dashboard_month_idx`-nya sudah benar dari migrasi).
