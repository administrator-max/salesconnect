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

---

## Susulan — HDP Utilization #3 ditambahkan

Pemilik data memilih jalan pertama: 100 MT itu dicatat sebagai siklus baru.

| Cycle | Produk | MT | Tanggal |
|---|---|---|---|
| Utilization #1 | GL ALLOY | 800 | 11/11/2025 |
| Utilization #2 | GL ALLOY | 100 | 28/04/2026 |
| **Utilization #3** | **GL ALLOY** | **100** | **10/08/2026** ← baru |

**Tanggalnya 10/08/2026** karena Sales menginputnya pagi itu ("td pagi udah gw
utilize"). Lot yang sama membawa **ETA JKT 30 September 2026** — dan justru itu
contoh bagus kenapa kedua tanggal dipisah sejak 2026-08-07: kuota dipakai
Agustus, barangnya baru tiba September. Kalau ETA masih dipakai sebagai
pengganti, 100 MT ini akan mendarat di September.

Cadangan: `backups/hdp-cycle-utilization-sebelum-util3_2026-08-10.json`

### Hasil

| HDP | Sebelum | Sesudah |
|---|---|---|
| Obtained | 1.000 | 1.000 |
| Used | 900 | **1.000** |
| Available | 100 | **0** |

Total dashboard bergerak sebagaimana mestinya:

| | Sebelum | Sesudah |
|---|---|---|
| Utilized (sepanjang waktu) | 22.747 | **22.847** |
| Available | 12.213 | **12.113** |
| Pending Shipment | 7.308,79 | **7.408,79** |
| **Utilized Agustus 2026** | 0 | **100** |

Angkanya mendarat di **Agustus**, persis sesuai tanggalnya. Sifat partisi tetap
utuh: H1 + H2 = setahun (15.975), persis.

### PENTING — harus ikut ditambahkan di Excel master

`PUT /api/company/:code/cycle-utilization` bersifat **ganti-total per company**.
Kalau master diimpor ulang lewat tombol **Import Master** sementara Excel-nya
masih memuat dua baris utilisasi HDP, baris **Utilization #3 ini akan hilang**
dan HDP kembali ke 900.

Jadi baris yang sama perlu ditambahkan juga di master:

```
Utilization #3 (MT)     GL ALLOY  100
Utilization #3 (date)   GL ALLOY  10 Aug 26
```
