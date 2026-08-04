# [iqdash-kpi-pooling] 2026-08-04 — KPI berhenti menyalin ulang aturan; pool utilisasi ikut tanggal per-produk

- **Tanggal:** 2026-08-04
- **Oleh:** Claude Code
- **Pemicu:** pengecekan tampilan dashboard setelah semua perbaikan — angka di
  KARTU KPI ternyata masih berbeda dari fungsi yang menghitungnya.

## Ringkasan
Fungsi-fungsi periode sudah benar sejak `iqdash-report-metrics-one-source`,
tapi **kartu KPI tidak memakainya**. Filter Juni menampilkan Obtained **890 MT**
padahal nilai sebenarnya **10.040 MT**. Dua sebab terpisah:

### 1. `03-kpis.js` menyimpan salinan aturan obtained sendiri
Blok KPI Obtained memuat ulang seluruh aturan — dedup, `_fromRevReq`, gerbang
terbit, sandaran periode — di bawah komentar yang mengklaim *"Mirrors
canonicalObtainedFiltered so the two Obtained paths stay in sync"*. Salinan itu
tetap menyimpang: masih bersandar **SPI dulu**, dan memanggil
`_isObtainedTerbit(c)` **tanpa** `allCycles` sehingga gerbang PERTEK tak pernah
aktif.

Diganti dengan pemanggilan langsung `canonicalObtainedFiltered()` /
`canonicalObtained()`. Salinan yang harus disamakan manual adalah pola
kegagalan yang sama dengan pemisahan ledger/cycles yang baru saja dihapus —
sekarang tiap aturan punya **satu** implementasi.

### 2. `companiesWithLotsInPeriod()` hanya melihat lot
Pool company untuk KPI Utilized menyaring lewat lot bertanggal. Sejak tanggal
utilisasi pindah ke `etaByProd`, company yang tanggalnya ada di sana tak pernah
masuk pool — **BDG 350 MT dan KARA 100 MT hilang dari Juni** meski
`scopedUtilTotal()` menghitungnya dengan benar.

Sekarang pool memakai `scopedUtilByProd()` itu sendiri, jadi pool dan totalnya
sejalan secara konstruksi. Sekalian: iterasinya diperlebar ke **gabungan**
produk stats dan produk lot, supaya produk yang baru punya lot (belum punya
baris stats) tidak ikut hilang — regresi ini tertangkap `test_period_dates.cjs`.

Ditambah `_canonProd()`: pembungkus aman untuk `canonicalProduct()` yang
tinggal di `01-data.js`, supaya modul ini tetap bisa di-`require()` sendiri
oleh tes Node.

## Verifikasi — kartu KPI live vs master

| | All Time | Juni 2026 | Juli 2026 |
|---|---|---|---|
| Submitted | 277.545 ✓ | 14.920 ✓ | 5.600 ✓ |
| Obtained | 34.840 ✓ | 10.040 ✓ | 1.160 ✓ |
| Utilized | 22.547 ✓ | 4.166 ✓ | 3.700 ✓ |
| Realized | 15.438,208 ✓ | 2.275,372 ✓ | 0 ✓ |

Uji: **PHP 352 assertion, 0 gagal · 6 suite JS, 0 gagal.**

## Available saat difilter — diputuskan: AGREGAT
Kartu Available semula memakai penjumlahan **per-company yang dijepit di 0**
(dihitung di `buildAvailableQuota()`), sedangkan spesifikasi menyebut
*"available = obtain − utilized"*. Keduanya berbeda begitu filter aktif, karena
company yang MEMAKAI kuota di periode ini padahal kuotanya TERBIT di periode
sebelumnya menghasilkan angka negatif yang tertelan penjepitan — mis. IKM
memakai 2.300 MT di Juli dari kuota terbit Juni.

Pemilik data memilih **agregat, sesuai spesifikasi**. Kartu Available kini
dihitung di `updateOverviewKPIs()` sebagai `max(0, totalObtained −
totalUtilized)` — pengurangan langsung dari dua kartu di sebelahnya.
`buildAvailableQuota()` berhenti menulis kartu itu dan kembali hanya mengurus
CHART, tempat penjepitan per-company memang benar (satu company tak boleh
tampil available negatif).

Efek samping yang bagus: kartu Available ikut render di pass pertama bersama
empat kartu lain, tidak lagi menunggu chart yang ditunda.

| Periode | Sebelum | Sesudah | Master |
|---|---|---|---|
| Juni | 8.850 | **5.874** | 5.874 |
| Juli | 1.160 | **0** | 0 |
| All Time | 12.293 | 12.293 | 12.293 |

## Hasil akhir — kartu KPI live vs master

| | All Time | April | Juni | Juli |
|---|---|---|---|---|
| Submitted | 277.545 ✓ | 27.800 ✓ | 14.920 ✓ | 5.600 ✓ |
| Obtained | 34.840 ✓ | 620 ¹ | 10.040 ✓ | 1.160 ✓ |
| Utilized | 22.547 ✓ | 3.120 ✓ | 4.166 ✓ | 3.700 ✓ |
| Realized | 15.438,208 ✓ | 4.454,829 ✓ | 2.275,372 ✓ | 0 ✓ |
| Available | 12.293 ✓ | 0 ✓ | 5.874 ✓ | 0 ✓ |

¹ Master menghitung 470 karena sel PERTEK AADC di master berisi `1-Jul-16`
(seharusnya 14 Apr 2026). Dashboard yang benar; **file master yang perlu
diperbaiki** — lihat `iqdash-pertek-dates-confirmed_2026-08-04_log.md`.
