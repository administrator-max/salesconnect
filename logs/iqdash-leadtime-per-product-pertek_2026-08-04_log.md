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

## Pelajaran
Dua kali berturut-turut saya memakai `getPertekDateForCo()` sebagai "tanggal
PERTEK company" tanpa memeriksa isinya. Fungsi itu memang hanya untuk cycle
PERTAMA — cocok untuk chart O/U yang mengukur satu titik awal, tapi salah untuk
apa pun yang per produk atau per periode. Layak diberi nama yang lebih jujur
(`getFirstPertekDateForCo`) supaya tidak dipakai keliru lagi.
