# [iqdash-report-metrics-one-source] 2026-08-04 — Satu sumber & satu definisi untuk kelima ukuran laporan (Langkah 2–5)

- **Tanggal:** 2026-08-04
- **Oleh:** Claude Code
- **Tujuan:** menghapus sebab "dashboard tidak pernah sama dengan master, harus
  diperbaiki manual", termasuk saat difilter per periode.

## Akar masalah
`canonicalObtained()` mengembalikan angka **ledger** apa adanya, sedangkan
`canonicalObtainedFiltered()` menghitung dari **cycles**. Dua sumber yang
dipelihara terpisah: tanpa filter dashboard membaca ledger (snapshot master
yang beku, tanpa tanggal); begitu filter periode dinyalakan angkanya berpindah
sumber. Utilisasi lebih parah — hanya dibaca dari lot, padahal hampir semua
utilisasi tersimpan sebagai agregat tanpa tanggal, sehingga **menyumbang 0 di
periode apa pun**.

## Spesifikasi (dari pemilik data, 2026-08-04)

| Ukuran | Sumber tanggal |
|---|---|
| Submit | Submission → Submit MOI / Submit MOI Perubahan |
| Obtain | Release → **PERTEK / PERTEK Perubahan** |
| Utilized | Status → **Utilization (date)** |
| Realized | file REALISASI IMPORT, kolom Volume, per tanggal PIB |
| Available | Obtain − Utilized |

## Perubahan

### Backend
- `iq_patch_company()` menerima **`etaByProd`** → menulis
  `company_product_stats.eta_jkt`. Kolom itu sudah ada sejak port dan sudah
  dikirim ke payload sebagai `etaByProd`, tapi **tak pernah ada kode yang
  mengisinya** (semua situs pembuat baris menulis `'eta_jkt' => ''`).
  **Tanggal saja** — sengaja tidak lewat lot, karena lot memicu recompute
  `baseline + lotSum` yang akan **menggandakan** utilisasi setiap produk yang
  angkanya berasal dari master (jebakan aditif yang sama dengan bug ledger+lot
  2026-08-03).

### Frontend
- `scopedUtilByProd()` — memakai `etaByProd` sebagai sumber tanggal UTAMA,
  lot hanya bila produk tak punya tanggal sendiri. **Urutan ini penting**: ETA
  lot adalah perkiraan KEDATANGAN, bukan tanggal utilisasi, dan rutin berbeda
  bulan (HKG pakai 8 Jul, ETA 15 Sep; IKM 24 Jul vs September; BDG 30 Jun vs
  31 Ags). Juga kini di-key seperti `utilizationByProd`, bukan seperti nama lot.
- `_isObtainedTerbit()` — menerima PERTEK dari Submit pasangannya sebagai
  bukti terbit. Master memberi kuota saat PERTEK, jadi cycle yang PERTEK
  Perubahan-nya sudah terbit **adalah** obtained walau SPI masih TBA
  (GKL Obtained #2 = 600 MT).
- `canonicalObtainedFiltered()` — sandaran periode dibalik ke **PERTEK dulu**,
  SPI hanya cadangan. Ini memulihkan aturan asli 2026-07-08 yang dulu dibalik
  karena "PERTEK sering berisi NOMOR"; 20 cycle itu sudah diperbaiki
  2026-08-03, jadi alasannya hilang.
- `scopedObtainedByProd()` (baru) + `scopedAvailByProd()` — available =
  obtain − utilized dengan **kedua sisi di periode yang sama**. Sebelumnya
  obtained SEPANJANG WAKTU dikurangi utilisasi PERIODE, hibrida yang
  melebihkan available di dalam filter.
- **Pintasan ledger di `canonicalObtained()` DICABUT.** Cycles kini satu-satunya
  sumber; aman karena keduanya sudah persis sama (34.840 untuk 41 company).
- Total Realized dibaca dari `REALIZATIONS` (204 baris PIB, `volume` +
  `pib_date`), bukan `ra_records.berat` per tanggal kedatangan. Semua 204
  tanggal terbaca (144 ISO + 60 D/M/YYYY, tak ada yang ambigu). Ada fallback
  ke jalur RA lama bila fetch gagal.

### Data
- **33 baris** `company_product_stats.eta_jkt` diisi dari Utilization (date)
  master, mencakup 29 company. Tidak satu pun angka bergerak.

## Verifikasi — paritas master vs dashboard per periode

| Periode | Submit | Obtain | Utilized | Available |
|---|---|---|---|---|
| April 2026 | ✓ | ✓ | ✓ | ✓ |
| Juni 2026 | ✓ | −100 | ✓ | +100 |
| Juli 2026 | ✓ | −350 | ✓ | ✓ |
| Seluruh rentang | ✓ | −150 | ✓ | −150 |

**Submit dan Utilized kini cocok di SEMUA periode** (Utilized sebelumnya 0 di
hampir semua periode). Available cocok kecuali sebesar selisih Obtain.

Uji: **PHP 352 assertion, 0 gagal** · **6 suite JS, 0 gagal**, termasuk
`test_report_metrics.cjs` (baru, 10 assertion) yang mematok ketiga aturan di
atas, dan tes `etaByProd` baru di `test_product_alias_stats.php`.

## Sisa — perlu keputusan pemilik data
Selisih Obtain yang tersisa seluruhnya berasal dari **8 sel tanggal di 7
company** yang isinya berbeda antara master dan dashboard. Sinkronisasi
otomatis SENGAJA TIDAK dijalankan karena sebagian master-nya yang keliru:

| Company | Sel | Master | Dashboard | Catatan |
|---|---|---|---|---|
| AADC | Submit #1 PERTEK | `1-Jul-16` (serial 42552) | 14/04/2026 | master salah ketik tahun; catatannya sendiri menulis "PERTEK TERBIT 14/04/2026" → **dashboard benar** |
| BDG | Revision #1 Submission | `4-Dec-26` | kosong | tanggal di masa depan, setelah tanggal rilisnya sendiri |
| BDG | Revision #2 Release | 21-Apr-26 | 19/03/2026 | baris master berlabel "SPI Perubahan (Revision #1)" — kolomnya bergeser |
| DIOR | Submit #1 PERTEK | 3-Dec-25 | 20/07/2026 | beda 7 bulan |
| GNG | Submit #2 PERTEK | 17-Apr-26 | 06/07/2026 | dashboard memakai `pertek_date` yang sendirinya keliru |
| JKT | Submit #2 PERTEK | 30-Jun-26 | kosong | master kemungkinan benar |
| KJK | Submit #2 PERTEK | 3-Jun-26 | 04/06/2026 | beda 1 hari |
| MJU | Revision #2 PERTEK | 30-Jun-26 | 04/02/2026 | dashboard memakai tanggal Revision #1 |

Setelah kedelapan sel ini diputuskan, Obtain (dan Available) ikut cocok di
semua periode.

## Sisa lain
- `ra_records` tidak lagi menyetir KPI Realized, tapi masih dipakai kartu
  Re-Apply. Dua artefak untuk data yang sama — layak disatukan nanti.
- Migrasi kena **429 Sheets** di tengah jalan; skripnya idempoten dan
  dilanjutkan dengan jeda 4 detik + backoff. Menulis ~30 company sekaligus
  memang mendekati batas kuota.
- MIN Obtained #2 (600 MT) tetap tanpa tanggal, sesuai keputusan pemilik data.
