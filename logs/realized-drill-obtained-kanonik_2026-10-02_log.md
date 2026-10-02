# IQ Dash — kolom Obtained di pop-up Total Realized memakai obtained resmi

**Tanggal:** 2026-10-02
**Modul:** IQ Dash (Import Quota Monitor)

## Ringkasan

Saat pop-up **Total Realized — Breakdown** (Overview → klik kartu Total Realized)
ditarik ke Excel, kolom **OBTAINED (MT)** ternyata hanya memuat sebagian obtained
untuk 10 PT, sehingga **REAL. %** tampil di atas 100%:

| PT | Obtained di pop-up (lama) | Obtained resmi | Real. % lama | Real. % baru |
|---|---|---|---|---|
| BDG | 350 | 1.000 | 230,7% | 80,7% |
| BBB | 400 | 800 | 171,9% | 85,9% |
| GNG | 250 | 600 | 157,0% | 65,4% |
| KJK | 950 | 1.700 | 146,0% | 81,6% |
| EMS | 1.600 | 2.600 | 130,7% | 80,5% |

(juga LCP, SJH, HKG, MSN, SGD). Tile Obtained: **22.980 → 35.760 MT**,
Avg Real. %: **96,6% → 62,1%**. Kolom Realized tidak berubah (22.194,508 MT).

## Penyebab

`refreshRealizedDrill()` membaca obtained dari `getRA(code).obtained` — baris
`ra_records` gelombang kedatangan **terakhir**. Baris itu hanya memuat obtained
gelombang tersebut dan tidak ikut diperbarui saat Obtained #2/#3 terbit.

## Perubahan

- `iqdash/assets/js/03-kpis.js` — `refreshRealizedDrill()`: obtained per company
  sekarang `canonicalObtained(co)` (pasangan kanonik kartu SPI/PERTEK Obtained),
  di kedua cabang (REALIZATIONS dan cadangan ra_records). Sengaja kumulatif, tidak
  diiris periode — kuota adalah stock, sama seperti Available.
- `iqdash/assets/index.html` — `03-kpis.js?v=24` → `v=25` (cache Cloudflare).
- `iqdash/tests/test_realized_drill_obtained_kanonik.cjs` — uji baru.

## Verifikasi

- Pratinjau lokal dengan data live 02-Okt: 30 baris, semua Obtained =
  `canonicalObtained`, tidak ada Real. % > 100%.
- Uji baru (All Time, H1 2026, Sep 2026): Obtained per baris = kanonik, tile =
  Σ kolom, Real. % = Realized/Obtained, Σ Realized = kartu. **Gagal di kode lama,
  lulus di kode baru.**
- Seluruh 49 uji `iqdash/tests/*.cjs` lulus (sebelumnya pun lulus semua kecuali uji baru).

## Sisa / risiko

- Tile Obtained di pop-up (35.760) memang lebih kecil dari kartu Obtained Overview
  (36.580): pop-up hanya memuat company yang sudah punya realisasi PIB (DIOR, GIS,
  MJU, SNSD belum).
- Saat periode dipilih, Obtained tetap kumulatif sementara Realized mengikuti
  periode — Real. % per periode berarti "porsi kuota yang terealisasi di jendela ini".
