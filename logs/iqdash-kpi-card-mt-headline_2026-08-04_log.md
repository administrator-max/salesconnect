# [iqdash-kpi-card-mt-headline] 2026-08-04 — Kartu Utilized & Realized menampilkan MT, bukan jumlah company

- **Tanggal:** 2026-08-04
- **Oleh:** Claude Code
- **Pemicu:** *"utilizednya kok 24, kan harusnya yang tulisan besarnya 17.300"*

## Masalah
Kartu **Total Utilized** dan **Total Realized** menaruh **jumlah company** di
slot angka besar, dan tonasenya diturunkan ke teks kecil di bawahnya. Jadi
angka yang terbaca sekilas sebagai "Total Utilized" (24) sama sekali bukan
tonase. Tiga kartu lain (Submitted, Obtained, Available) sudah menampilkan MT
sebagai angka besar, begitu juga PDF Summary — hanya dua kartu ini yang
menyimpang.

## Perubahan
`03-kpis.js` — MT jadi headline, jumlah company turun ke baris subtitle,
mengikuti pola tiga kartu lain:

| Kartu | Sebelum | Sesudah |
|---|---|---|
| Total Utilized | **24**<br>companies with shipment<br><sub>17,300 MT total utilized</sub> | **17,300**<br>MT · 24 companies with shipment |
| Total Realized | **24**<br>Companies with utilization<br><sub>15,438.208 MT total realized</sub> | **15,438.208**<br>MT · 24 companies realized |

Id elemen (`kpiUtilCoCount`, `kpiUtilMT`, `kpiRealCoCount`, `kpiRealMT`) sengaja
TIDAK diubah — itu pegangan DOM, bukan makna; menggantinya berarti menyentuh
`index.html` tanpa manfaat. Catatan ini ditulis di kode agar tidak
membingungkan pembaca berikutnya.

## Verifikasi — kelima kartu, angka besar seluruhnya MT

| Kartu | All Time | H1 2026 |
|---|---|---|
| Total Submitted | 277.545 | 74.945 |
| SPI / Pertek Obtained | 34.840 | 19.860 |
| **Total Utilized** | **22.547** | **17.300** |
| Total Realized | 15.438,208 | 15.438,208 |
| Available Quota | 12.293 | 11.693 |

6 suite JS, 0 gagal.
