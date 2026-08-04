# [iqdash-leadtime-per-product-pertek] 2026-08-04 — Lead Time Alert: PERTEK per produk, bukan per company

- **Tanggal:** 2026-08-04
- **Oleh:** Claude Code
- **Pemicu:** tim sales melaporkan beberapa PT hilang dari Utilization Lead Time
  Alert pada PDF periode 1 Jan – 30 Jun 2026, disertai daftar Obtained H1 per PT.

## Masalah
Alert hanya menampilkan **7 dari 18** company yang punya Obtained di H1 2026
(13 baris). Yang hilang: EMS, KJK, BBB, HKG, CGK, LCP, GNG, BHG, HDP, JKT, SJH.

**Ini regresi yang saya sebabkan sendiri.** Perbaikan sebelumnya
(`iqdash-pdf-summary-period`) menambahkan gerbang
`if (PERIOD.active && !inPd(pertekDate)) return;` dengan `pertekDate` diambil
dari `getPertekDateForCo(co)` — dan fungsi itu hanya membaca **Submit #1 /
Revision #1**, satu PERTEK per company. Company yang kuota H1-nya berasal dari
**Submit #2 atau #3** ikut tersaring keluar, karena PERTEK pertamanya bertahun
2025.

Dua percobaan sebelumnya sama-sama meleset:
1. **Tanpa gerbang** — PERTEK 2025 ikut tampil di filter 2026 (keluhan awal).
2. **Gerbang per company** — 11 dari 18 company hilang (keluhan ini).

Akar keduanya sama: alert ini **per PRODUK**, jadi tanggalnya harus datang dari
**cycle yang memberikan produk itu**, bukan satu tanggal untuk seluruh company.
Satu company bisa memegang beberapa PERTEK.

## Perubahan
**`02-period-filter.js`** — `scopedObtainedDetailByProd(co)` (baru):
mengembalikan `{ produk: { mt, pertek } }` — irisan periode yang sama dengan
`scopedObtainedByProd()`, tapi menyimpan tanggal PERTEK yang memberikan tiap
produk. Bila dua cycle in-period memberi produk yang sama, **PERTEK terakhir
yang menang** — alert mengukur waktu berjalan sejak kuota diberikan, jadi
pemberian terbaru yang jamnya masih relevan.

`scopedObtainedByProd()` kini memanggilnya (satu implementasi aturan, bukan
dua salinan).

**`14-export.js`** — bagian Lead Time memakai detail itu; gerbang tanggal
per-company **dihapus** karena produknya sudah tersaring periode sejak awal.

## Verifikasi — terhadap daftar tim sales

| | Sebelum | Sesudah |
|---|---|---|
| Company muncul | 7 | **18** |
| Baris alert | 13 | 24 |
| Total MT | — | **19.710** |
| Selisih per company vs daftar sales | — | **nol** |
| Baris ber-PERTEK di luar 2026 | 0 | 0 |

Daftar tim sales (IKM 8.000 · BTS 6.000 · SGD 2.500 · EMS 500 · KJK 450 ·
GIS 400 · BBB 300 · HKG 250 · CGK 220 · LCP 200 · GNG 150 · BHG 150 · SMS 150 ·
HDP 100 · JKT 100 · KARA 100 · SJH 90 · PPGL 50) berjumlah **19.710** — sama
persis dengan Obtained H1 dashboard, dan kini sama persis pula per company.

6 suite JS, 0 gagal.

## Susulan — lead time negatif

Pengecekan lanjutan menemukan cacat yang dibawa perubahan di atas. Lima baris
tidak muncul di tabel OVERDUE karena masuk kategori **NORMAL** — tapi masuk
situ dengan **lead time NEGATIF**:

| Baris | PERTEK | Utilisasi pertama | Lead |
|---|---|---|---|
| BBB / GL ALLOY 300 | 17 Jun 26 | 8 Apr 26 | **−70 hari** |
| EMS / GI ALLOY 500 | 10 Mei 26 | 29 Mar 26 | **−42 hari** |
| LCP / GL ALLOY 200 | 17 Jun 26 | 12 Mei 26 | **−36 hari** |
| SGD / GI ALLOY 500 | 29 Jun 26 | 23 Apr 26 | **−67 hari** |
| SJH / GL ALLOY 90 | 12 Jun 26 | 1 Apr 26 | **−72 hari** |

Kuota tidak mungkin terpakai **sebelum** PERTEK-nya terbit. Sebabnya: PERTEK
kini diambil dari cycle in-period (pemberian yang lebih baru), sedangkan
`getFirstUtilDate()` tetap mengembalikan utilisasi paling awal SEPANJANG WAKTU
— yaitu pemakaian kuota lama. Angka negatif itu lalu lolos di bawah standar 14
hari dan dilaporkan **sehat**, padahal kuota barunya justru belum tersentuh
sama sekali. Lebih menyesatkan daripada sekadar hilang.

**Perbaikan:** `getFirstUtilDate(co, prod, since)` — parameter `since` opsional
membuang utilisasi sebelum tanggal itu; PDF mengopernya `pertekDate`. Fallback
RA tunduk pada aturan yang sama, kalau tidak ia akan memasukkan kembali tanggal
pra-PERTEK yang baru saja dibuang. Tanpa `since`, perilakunya persis seperti
sebelumnya — chart O/U dan Sales Priority memang mengukur dari pemberian
PERTAMA, jadi keduanya tidak berubah.

Sesudahnya: **24 baris, seluruhnya OVERDUE, 0 lead negatif**, 18 company /
19.710 MT. Kelima baris itu kini benar berstatus overdue — kuota H1 mereka
memang belum dipakai.

## Pelajaran — dan namanya sudah diganti
Dua kali berturut-turut `getPertekDateForCo()` dipakai sebagai "tanggal PERTEK
company" tanpa memeriksa isinya. Fungsi itu memang hanya untuk cycle PERTAMA —
cocok untuk chart O/U yang mengukur satu titik awal, tapi salah untuk apa pun
yang per produk atau per periode.

**Diganti nama jadi `getFirstPertekDateForCo()`** (5 kemunculan di 3 file:
`17-ou-chart.js` definisi + pemakaian, `14-export.js` pemakaian, dan dua
komentar). Docblock-nya ditulis ulang agar menyebut sendiri jebakannya dan
menunjuk ke `scopedObtainedDetailByProd()` untuk kebutuhan per-produk /
per-periode.

Nama lama sengaja masih disebut **di dalam docblock** sebagai catatan sejarah,
supaya pembaca yang menemukannya di log lama tahu ini fungsi yang sama.

Verifikasi sesudah rename: `getPertekDateForCo` sudah `undefined` di runtime,
`getFirstPertekDateForCo` berfungsi (BTS → 2026-02-24), keempat pemakainya
(`buildOUChart`, `buildOUChartOverview`, `updateOUOverviewKPIs`,
`buildLeadTimeAnalytics`) jalan tanpa error, dan Lead Time tetap 18 company /
19.710 MT.
