# [audit-mt-truncation] 2026-07-27 — Audit entri MT lama yang terpotong bug pemisah ribuan

## Ringkasan
Audit **read-only** seluruh data IQ Dash untuk mencari nilai MT lain yang rusak
karena bug yang sama dengan kasus IKM (lihat `fix-ikm-utilization_2026-07-27_log.md`):
`fmtThousandInline` memperlakukan titik sebagai desimal, sehingga `2.000` tersimpan `2`.

**Hasil: hanya IKM yang terkonfirmasi rusak** (sudah diperbaiki). Satu anomali kecil
ditemukan (MIN) tapi terbukti tidak berdampak. Ditemukan pula satu masalah **terpisah**
(bukan bug titik) yang layak ditindaklanjuti: drift `company_product_stats` vs ledger.

## Cakupan
Semua 15 tab ditarik langsung dari Sheets (bukan cache) — 1.031 baris.
Kolom yang diaudit = kolom yang bisa dicapai input ber-`fmtThousandInline`:

```
companies                submit1, obtained, utilization_mt, available_quota, rev_mt
company_product_stats    utilization_mt, available_mt, realization_mt
cycles / cycle_products  mt
revision_changes         mt
company_shipments        util_mt, real_mt
company_reapply_targets  target_mt
pending_meta             mt
```
`realizations.volume` dikecualikan — diisi jalur import Excel, desimal wajar di sana.

## Metode
Tiga penyaring, karena bug ini punya dua bentuk keluaran berbeda:

1. **Kelas A — nilai non-integer.** `N.GGG` → `N.GG`. 22 kandidat awal.
2. **Kelas B — nilai < 10.** `N.000` → `N`. Kuota impor baja tidak pernah di bawah 10 MT.
3. **Uji diskriminan desimal.** `fmtThousandInline` memotong desimal ke 2 digit
   (`parts[1].slice(0,2)`), jadi nilai dengan **3+ desimal mustahil** berasal dari
   input itu — otomatis bukan kerusakan.

## Hasil

### Kelas A — 22 kandidat, semua tereliminasi
- **12 baris `company_shipments.real_mt`** (246.7, 219.43, 363.612, 23.991, …) → **sah**.
  Tonase realisasi asli: `363.612` dan `23.991` punya 3 desimal (mustahil dari formatter),
  dan MIN/BORDES ALLOY cocok persis dengan Σ `realizations.volume` = 246.704.
- **SPA 400.5 / 114.5** (`cycles`, `cycle_products`, `revision_changes`, stats) → **sah**.
  Jumlahnya persis 515 = `companies.obtained` SPA, dan ledger final membulatkannya jadi
  401 + 114. Split transisional yang konsisten, bukan potongan.

### Kelas B — 2 kandidat
| Lokasi | Nilai | Putusan |
|---|---|---|
| `company_product_stats.available_mt` IKM/GI ALLOY (id 888) | `2` | **Konsekuensi perbaikan kemarin**, bukan temuan baru. Baris stats memakai basis obtained basi (2002). Perlu rekonsiliasi — lihat di bawah. |
| `cycles.mt` MIN / Revision #1 (id 38272) | `0.3` | Anomali, tapi **tidak berdampak**. Diverifikasi lewat payload: MIN `obtained=600`, `_ledgerObtained=600`, `byProd={"BORDES ALLOY":600}`. Baris `Revision #N` tidak masuk perhitungan obtained. Layak dibersihkan jadi `0`. |

## Batas audit (penting, jangan dibaca sebagai "pasti bersih")
Pola `N.000 → N` untuk **N ≥ 10 tidak bisa dideteksi dari data saja**. Sebaran
`util_mt` lot yang > 0: n=8, min=100, median=250, max=2000 — 7 dari 8 di bawah 1000.
Artinya lot yang benar-benar 250 MT dan lot "250.000" yang terpotong jadi 250 **identik**
di database. Yang bisa dijamin: tidak ada nilai < 10 dan tidak ada desimal yang tak
terjelaskan di seluruh kolom MT. Kepastian penuh hanya bisa dari cek silang dokumen
SPI/PERTEK per perusahaan.

## Temuan terpisah — drift `company_product_stats` vs ledger (BUKAN bug titik)
Dibandingkan memakai oracle aplikasi sendiri (`_ledgerObtainedByProd` dari `/api/data`),
dengan nama produk dinormalisasi lewat `productAliases`: **12 dari 48 pasangan drift.**

```
ADP/GL ALLOY        stats=600    ledger=250    [baris stats: GL BORON]
BDG/BORDES ALLOY    stats=50     ledger=0
BDG/GL ALLOY        stats=650    ledger=350    [GL BORON]
BDG/GI ALLOY        stats=350    ledger=650    [GI BORON + GI ALLOY]  ← ganda
BHG/GI ALLOY        stats=300    ledger=200    [GI BORON + GI ALLOY]  ← ganda
MJU/HOLLOW PIPE     stats=800    ledger=0
MSN/GL ALLOY        stats=250    ledger=150    [GL BORON]
SMS/SHEET PILE      stats=150    ledger=0      [SHEETPILE]
SMS/GI ALLOY        stats=300    ledger=150    [GI ALLOY + GI BORON]  ← ganda
SPA/BORDES ALLOY    stats=629.5  ledger=114
SPA/GI ALLOY        stats=800.5  ledger=401    [GI BORON + GI ALLOY]  ← ganda
IKM/GI ALLOY        stats=2002   ledger=4150
```

Penyebab dominan: **baris stats kembar** di bawah nama lama DAN nama kanonik
(`GI BORON` + `GI ALLOY`, `GL BORON` + `GL ALLOY`, `SHEETPILE` + `SHEET PILE`) —
tidak dimigrasi saat alias produk diterapkan.

Dampak: tampilan dashboard **aman** (`availableByProd` diambil dari ledger,
`iqdash_data.php:634` menimpa nilai stats). Yang berisiko adalah **jalur tulis**:
`iqdash_write.php:783` memakai `prevUtil + prevAvail` dari baris stats sebagai basis
obtained, jadi plafon kuota saat edit lot berikutnya bisa salah (kasus IKM: 2002, bukan 4150).

## Catatan metodologi
Percobaan awal memakai invarian buatan sendiri (Σ `cycle_products` vs `cycles.mt`,
`companies.obtained` vs Σ siklus Obtained, `utilization_mt` vs Σ lot) menghasilkan
38 "temuan" yang **semuanya palsu** — model saya tidak sesuai semantik aplikasi:
utilisasi boleh ada tanpa lot (baseline non-lot), `Obtained #2` sering restatement
bukan kuota tambahan, dan `Revision Request` menyimpan MT produk sumber di `cycles.mt`.
Perbandingan yang dipakai di laporan ini memakai hasil hitung aplikasi sendiri.

## Verifikasi
Skrip audit (read-only, di scratchpad, tidak di-commit): `dump_tabs.php`, `audit.js`,
`audit2.js`, `audit3.js`. Tidak ada penulisan ke Sheets selama audit.

## Rekomendasi urutan tindak lanjut
1. **Perbaiki bug kodenya** — selama belum, entri baru masih bisa rusak diam-diam.
2. Bersihkan `cycles.mt` MIN id 38272: `0.3` → `0` (kosmetik, tanpa risiko).
3. Rekonsiliasi `company_product_stats`: gabungkan baris kembar ke nama kanonik dan
   selaraskan dengan ledger. 12 baris terdampak.
