# [iqdash-audit-ulang-penamaan-tuntas] 2026-08-13 — audit ulang: penamaan dituntaskan di sumbernya

- **Pemicu:** *"Coba cek lagi semua halaman, jangan sampai ada yang beda."*

## Angka: tidak ada yang berubah, tetap konsisten

12 periode × 11 permukaan × 4 metrik + 4 drill — **nol selisih**. Perubahan
penamaan hari ini tidak menggeser satu angka pun.

## Penamaan: empat putaran tambal, lalu diperbaiki di sumbernya

Sapuan ulang menemukan ejaan lama masih muncul di permukaan yang belum pernah
diperiksa:

| Putaran | Ditemukan di |
|---|---|
| 1 | tabel Revision Detail (halaman PERTEK & SPI) — salinan KETIGA dari pola `salesRevRequest` |
| 2 | kolom Product tabel Realization Monitoring, cabang single-product |
| 3 | ringkasan produk teratas di PDF, kolom Products di Excel & CSV |
| 4 | sheet "Submission Cycles" (Excel), tipe siklus, `prodsStr()` |

Pola tambal-per-titik **selalu menyisakan satu yang terlewat** — dan yang
terlewat terakhir justru muncul di PDF dan Excel yang dikirim ke manajemen.

**Diubah pendekatannya:** nama produk dikanonikkan **satu kali saat data
dimuat**, bukan di belasan titik render.

```
loadData():
  cycles[].products    kunci dikanonikkan (MT dijumlah bila dua ejaan
                       menunjuk produk yang sama)
  co.products          dikanonikkan + dedup
  RA[].product         canonProdInText() — sebagian sel berisi GABUNGAN
                       ("GI BORON + ERW PIPE") yang tak akan cocok sebagai
                       kunci alias utuh
  RA[].reapplyProduct  idem
```

Normalisasi **di memori**: baris DB baru ikut kanonik kalau company itu memang
di-save. Tidak ada penulisan massal. Idempoten.

## Hasil

| | Sebelum | Sesudah |
|---|---:|---:|
| Ejaan lama di layar | 8 permukaan | **3** (catatan bebas) |
| Ejaan lama di PDF | 9 | **0** |
| Ejaan lama di Excel | 18 | **0** |

Tiga sisa di layar semuanya field `spiRef` — **catatan yang diketik orang**:

```
GKL  SPI TERBIT 24/12/25 · GI BORON +100 MT util · ETA 31 May 2026
NCT  ✅ SPI TERBIT 05/12/25 · GI BORON 150 MT · Revision Cancelled
SPP  ✅ SPI TERBIT 16/12/25 · GI BORON 250 MT · Revision Cancelled
```

Sengaja tidak disentuh: itu rekaman apa yang ditulis seseorang pada satu waktu.
Menulis ulangnya berarti mengubah arsip, bukan menyeragamkan tampilan.

## Dropdown produk

Dropdown "Produk Tujuan" dulu dibangun dari `PROD_COLORS` (peta WARNA), sehingga
produk yang sah di master tapi belum diberi warna **mustahil dipilih** — CRC
ALLOY, FABRICATED STEEL PAINTED FRAME, WELDED STAINLESS STEEL PIPE. Kini
bersumber dari master produk (`selectableProducts()`): 28 opsi, urut A–Z, tanpa
ejaan ganda. Produk baru di master otomatis muncul.

**16 suite node + 14 PHP = 30 lulus, 0 gagal.**
