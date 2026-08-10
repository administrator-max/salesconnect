# [iqdash-per-produk-ikut-utilcycles] 2026-08-10 — Tampilan per produk bertentangan dengan totalnya

- **Tanggal:** 2026-08-10
- **Oleh:** Claude Code
- **Pemicu:** David (Sales) — *"GL Alloy di 3 PT ini td pagi udah gw utilize
  masing2 100 MT tapi kenapa available kuotanya masih nongol ya?"* (ADP, HDP, MSN)

## Sebab — regresi dari perubahan 2026-08-05

Saat `utilCycles` dijadikan sumber utilisasi, `scopedUtilTotal()` diarahkan ke
`allTimeUtil()` (menjumlah utilCycles). Tapi **dua fungsi per-produk di
sebelahnya tidak ikut** — keduanya keluar lebih awal untuk All Time:

```js
function scopedUtilByProd(co)  { if (!PERIOD.active) return co.utilizationByProd || {}; ... }
function scopedAvailByProd(co) { if (!PERIOD.active) return co.availableByProd  || {}; ... }
```

Kedua kolom itu berasal dari `company_product_stats`, yang **tidak ikut
diperbarui** ketika utilisasi bertambah. Hasilnya tampilan per produk dan total
saling bertentangan:

| ADP | Per produk (stats) | Total (utilCycles) |
|---|---|---|
| Used | 250 | **350** |
| Available | 100 | **0** |

Sales membaca daftar per produk, melihat sisa 100 MT, dan wajar menyimpulkan
input mereka tidak masuk — padahal **inputnya masuk** (ketiga PT punya
`lot1 util=100`); yang salah tampilannya.

Ini persis kelas bug yang berhari-hari dibereskan di kartu KPI: satu ukuran,
dua implementasi. Kali ini terjadi di dalam satu berkas yang sama.

## Perbaikan

**`02-period-filter.js`** — untuk All Time, keduanya kini memakai `utilCycles`
bila ada:

- `scopedUtilByProd()` menjumlah `utilCycles` per produk
- `scopedAvailByProd()` menurunkan obtained − utilized yang **sudah dikoreksi**,
  bukan membaca `availableByProd` mentah

Fallback ke kolom stats tetap ada untuk company yang belum punya rincian siklus.

## Verifikasi

| PT | Obt | Used | Available | |
|---|---|---|---|---|
| **ADP** | 350 | 250 → **350** | 100 → **0** | ✅ |
| **MSN** | 250 | 150 → **250** | 100 → **0** | ✅ |
| HDP | 1.000 | 900 | 100 | tidak berubah |

Per produk kini **berjumlah persis** sama dengan total per company untuk
ketiganya. Total dashboard tidak bergeser: Utilized 22.747 · Available 12.213 ·
Obtained 34.740 · Pending Shipment 7.308,79.

25 suite, 0 gagal.

## HDP masih 100 — dan itu BENAR

Master mencatat utilisasi HDP **900** (Utilization #1 800 @ 11/11/2025 +
#2 100 @ 28/04/2026) dari obtained 1.000, jadi sisa 100 MT memang benar.

Input 100 MT David tersimpan di lot, tapi **belum menggeser angka** karena
aturan 2026-08-07: lot baru menang bila **lengkap** — seluruh lot produk itu
bertanggal DAN jumlahnya sama dengan total master. Lot HDP baru 100 dari 900,
jadi master tetap yang berlaku.

Bedanya dengan ADP/MSN: di sana 100 MT itu **sudah ada di master** (Utilization
#2 @ 28/07/2026) tapi belum terbawa ke `company_product_stats`. Perbaikan ini
membuat tampilannya membaca sumber yang benar.

Jadi untuk HDP ada dua jalan, dan itu keputusan pemilik data:
1. Tambahkan 100 MT itu ke master sebagai `Utilization #3`, atau
2. Sales mengisi SELURUH lot HDP (900 MT) lengkap dengan tanggalnya, sehingga
   lot menjadi lengkap dan mengambil alih dari master
