# [fix-ikm-utilization] 2026-07-27 — Koreksi data utilisasi IKM / GI ALLOY (2 → 2000 MT)

## Ringkasan
Perbaikan **data** (bukan kode): lot shipment IKM / GI ALLOY / lot 1 tersimpan `util_mt = 2`
padahal utilisasi sebenarnya **2000 MT**. Diperbaiki lewat endpoint resmi
`PATCH /iqdash/api/company/IKM` supaya rekalkulasi `company_product_stats` dan
`companies.utilization_mt / available_quota` ikut jalan (tidak edit sel Sheet manual).

## Gejala
Di halaman Available Quota → popup breakdown per produk, baris IKM tampil:

```
IKM  CD   Obt 4.150   Used 2   4.148 MT   ·  0% utilized
```

## Akar masalah (bug kode, BELUM diperbaiki — lihat "Sisa pekerjaan")
Mismatch format angka antara lapisan tampilan dan lapisan input:

| Lapisan | Kode | Perilaku |
|---|---|---|
| Tampilan | `fmtMt()` → `toLocaleString()` **tanpa argumen locale** (`assets/js/01-data.js:397`) | ikut locale browser → tampil gaya Indonesia: `4.150` |
| Input | `fmtThousandInline()` hardcode `'en-US'`, titik diperlakukan **desimal** (`assets/js/12-product-mt.js:488`) | `2.000` → `2.00` |
| Simpan | `parseFloat(value.replace(/,/g,''))` (`assets/js/11-shipment.js:499`, `:816`) | `"2.00"` → **2** |

Field Util MT memanggil `fmtThousandInline` di tiap ketikan
(`onSalesDirectChange` → `11-shipment.js:363`). User membaca `4.150` di layar,
mengetik `2.000` mengikuti konvensi yang sama, aplikasi menyimpan `2` — tanpa
error, tanpa peringatan.

Repro (Node, meniru persis kedua fungsi):

```
typed "2.000" -> field shows "2.00"  -> SAVED 2      ← kasus IKM
typed "2,000" -> field shows "2,000" -> SAVED 2000
typed "2000"  -> field shows "2,000" -> SAVED 2000
typed "16.100"-> field shows "16.10" -> SAVED 16.1
```

## Perubahan
Tidak ada perubahan file kode. Hanya data di spreadsheet IQ Dash:

| Tab | Baris | Sebelum | Sesudah |
|---|---|---|---|
| `company_shipments` | id 56 (IKM / GI ALLOY / lot 1) | `util_mt = 2` | `util_mt = 2000` |
| `company_product_stats` | id 888 (IKM / GI ALLOY) | `utilization_mt = 2`, `available_mt = 2000` | `utilization_mt = 2000`, `available_mt = 2` |
| `companies` | IKM | `utilization_mt = 2`, `available_quota = 7998` | `utilization_mt = 2000`, `available_quota = 6000` |

Backup record IKM sebelum tulis: `backups/iqdash_IKM_before_util_fix_2026-07-27.json`.

## Cara eksekusi
```
php -S 127.0.0.1:8788 router.dev.php
GET   /iqdash/api/company/IKM              → snapshot + backup
PATCH /iqdash/api/company/IKM              → body { shipments: {...}, _ifUpdatedAt: null }
GET   /iqdash/api/company/IKM              → verifikasi
```
Payload `shipments` memuat KETIGA produk (GI ALLOY, SHEET PILE, SEAMLESS PIPE)
persis seperti yang dikirim `patchShipmentsToServer()` — handler menghapus lot
yang tidak ada di payload per produk, jadi mengirim sebagian bisa menghapus lot lain.

## Verifikasi
`GET /iqdash/api/company/IKM` setelah patch:

```
obtained         8000
utilizationMT    2000   (sebelumnya 2)
availableQuota   6000   (sebelumnya 7998)
utilizationByProd {"GI ALLOY":2000,"SHEET PILE":0,"SEAMLESS PIPE":0}
availableByProd   {"GI ALLOY":2150,"SHEET PILE":1750,"SEAMLESS PIPE":2100}
shipments["GI ALLOY"][0].utilMT = 2000, etaJKT "Mid September 2026" (utuh)
```

Baris mentah di Sheets sudah dicek ulang dan sesuai. Popup AVQ sekarang
seharusnya membaca `Obt 4.150 · Used 2.000 · 2.150 MT · 48% utilized`.
Tidak perlu deploy — data live di Google Sheets, dibaca langsung oleh situs.

## Risiko / sisa pekerjaan
- **Bug kodenya masih ada.** Selama belum diperbaiki, mengetik `2.000` di field MT
  mana pun tetap tersimpan sebagai `2`. Sementara ini: **ketik tanpa pemisah ribuan**
  (`2000`) atau pakai koma (`2,000`).
- **Audit entri lama.** Nilai lain kemungkinan sudah terpotong dengan cara yang sama
  (gejala khas: angka MT kecil dan "bulat aneh" — 2, 16, 4.15 — di lot atau stats).
  Belum dilakukan.
- **`company_product_stats` IKM/GI ALLOY masih basi** (pra-existing, tidak berubah oleh
  perbaikan ini): `utilization_mt + available_mt = 2002`, sementara ledger bilang
  obtained GI ALLOY = **4150**. Dashboard memakai ledger (`availableByProd` = 2150) jadi
  tampilan benar, TAPI jalur tulis (`iqdash_write.php:783`) memakai
  `prevUtil + prevAvail` sebagai basis obtained — artinya edit lot berikutnya untuk
  produk ini akan memakai plafon 2002, bukan 4150. Perlu rekonsiliasi terpisah.
