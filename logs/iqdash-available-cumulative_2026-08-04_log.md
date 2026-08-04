# [iqdash-available-cumulative] 2026-08-04 — Available = saldo kumulatif di semua permukaan

- **Tanggal:** 2026-08-04
- **Oleh:** Claude Code
- **Keputusan pemilik data:** *"Untuk Available pakai saldo kumulatif saja di
  dashboard dan PDF (pokoknya samain angka di dashboard dengan master)."*

## Masalah
Empat permukaan menghitung "Available" dengan cara berbeda-beda. Untuk filter
1 Jan – 30 Jun 2026 mereka mencetak **empat angka berbeda**:

| Permukaan | H1 2026 | Cara hitung |
|---|---|---|
| Kartu Overview | 11.693 | obtain − utilized dalam periode (diubah pagi ini) |
| Halaman Available Quota | 16.540 | obtained SEPANJANG WAKTU − utilisasi PERIODE |
| Chart AVQ | 13.630 | per-produk, diiris periode, dijepit per company |
| PDF Summary | 11.693 | `co.availableQuota` (kumulatif) |
| **Master** | **11.693** | *"Available = saldo kumulatif"* |

## Sebab
Available diperlakukan sebagai **aktivitas periode**, padahal ia **saldo**.
Header laporan master menyatakannya eksplisit: *"Submitted / Obtained /
Utilized = aktivitas periode … Available = saldo kumulatif"*.

Bertanya "berapa available selama Juni" adalah kesalahan kategori — saldo ada
pada suatu titik waktu, bukan sesuatu yang terjadi di dalam rentang. Mengirisnya
menghasilkan angka yang tak bisa direkonsiliasi siapa pun: company yang memakai
kuota di dalam rentang padahal kuotanya terbit sebelum rentang menjadi saldo
negatif yang dijepit ke nol.

## Perubahan
**`01-data.js`** — dua fungsi baru, satu-satunya definisi Available:
```js
cumulativeAvailable(co)        // max(0, canonicalObtained(co) − co.utilizationMT)
cumulativeAvailableTotal(list) // penjumlahannya
```
Periode hanya menyaring **company mana** yang dihitung, tidak pernah memotong
saldonya.

Dipakai oleh **keempat** permukaan, menggantikan empat perhitungan terpisah:
- `03-kpis.js` — kartu Available Overview
- `19-init.js` — `buildAvqPageKPIs()`; Obtained/Utilized di halaman itu ikut
  kumulatif supaya `obtained − utilized = available` benar-benar berlaku
- `04-charts.js` — `buildAvailableQuota()`, chart "remaining capacity"
- `14-export.js` — PDF Summary

## Verifikasi — keempat permukaan, tiga periode

| Periode | Kartu | Halaman AVQ | Chart | PDF | Master |
|---|---|---|---|---|---|
| All Time | 12.293 | 12.293 | 12.293 | 12.293 | 12.293 |
| H1 2026 | **11.693** | **11.693** | **11.693** | **11.693** | **11.693** |
| Juni 2026 | 6.060 | 6.060 | 6.060 | 6.060 | — |

6 suite JS, 0 gagal.

## Yang perlu diketahui pengguna
Halaman **Available Quota** kini menampilkan Obtained/Utilized **kumulatif**
(H1: 30.140 / 18.447), berbeda dari kartu Overview yang menampilkan
**aktivitas periode** (19.860 / 17.300). Ini disengaja: halaman itu menjawab
"berapa saldo company yang aktif di periode ini", bukan "berapa yang terbit di
periode ini" — dan sekarang aritmetikanya konsisten sendiri
(30.140 − 18.447 = 11.693).

## Sisa
Selisih **Obtained 19.860 vs 20.710** belum tersentuh — menunggu keputusan
apakah realokasi lewat revisi dihitung sebagai obtained di periode PERTEK
revisinya (BDG +1.000), plus AADC −150 yang murni salah ketik di master.
Lihat `iqdash-pdf-summary-period_2026-08-04_log.md`.
