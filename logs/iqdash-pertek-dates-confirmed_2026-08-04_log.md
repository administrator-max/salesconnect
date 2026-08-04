# [iqdash-pertek-dates-confirmed] 2026-08-04 — 8 tanggal PERTEK dikonfirmasi pemilik data; paritas periode tuntas

- **Tanggal:** 2026-08-04
- **Oleh:** Claude Code
- **Sifat:** penulisan DATA ke Sheets (tab `cycles`). Tidak ada perubahan kode.
- **Lanjutan dari:** `iqdash-report-metrics-one-source_2026-08-04_log.md`

## Ringkasan
Delapan sel tanggal yang isinya berbeda antara file master dan dashboard sudah
dikonfirmasi pemilik data. Setelah diterapkan, **kelima ukuran laporan cocok
dengan master di semua periode yang diuji** — kecuali satu selisih yang
penyebabnya adalah salah ketik di file master itu sendiri.

| Periode | Submit | Obtain | Utilized | Available |
|---|---|---|---|---|
| April 2026 | ✓ | −150 ¹ | ✓ | ✓ |
| Juni 2026 | ✓ | ✓ | ✓ | ✓ |
| Juli 2026 | ✓ | ✓ | ✓ | ✓ |
| Seluruh rentang | ✓ | −150 ¹ | ✓ | −150 ¹ |

¹ AADC — lihat "Sisa" di bawah. **Dashboard yang benar**, master yang salah ketik.

## Jawaban pemilik data & tindakannya

| # | Company | Jawaban | Tindakan |
|---|---|---|---|
| 1 | AADC | MOI 2 Feb 26 · PERTEK 14 Apr 26 · MOT 27 Apr 26 · SPI 16 Jul 26 | **Tidak ada** — dashboard sudah persis begitu. Master (`1-Jul-16`) yang keliru. |
| 2 | BDG | Revision #1 Submission = 26 Jan 2026 | `submitDate` "" → 26/01/2026 (master menulis 4-Des-26, keduanya berbeda) |
| 3 | BDG | Revision #1 & #2 "sudah benar sesuai master" | **ditahan** — lihat Sisa |
| 4 | DIOR | jeda PERTEK→MOT memang panjang | `releaseDate`/`pertekDate` 20/07/2026 → **03/12/2025** |
| 5 | GNG | re-apply 1: 150 MT, PERTEK 17 Apr, MOT 20 Apr, SPI 30 Apr · re-apply 2: 200 MT, PERTEK 6 Jul, MOT 6 Jul, SPI 22 Jul | Submit #2 rel/pertek 06/07/2026 → **17/04/2026**; Obtained #2 rel/spi 22/07/2026 → **30/04/2026** |
| 6 | JKT | master benar | Submit #2 rel/pertek "" → **30/06/2026** |
| 7 | KJK | 3 Juni 2026 | Submit #2 rel 04/06/2026 → **03/06/2026**; pertek 03/07/2026 → 03/06/2026 |
| 8 | MJU | Revision #2 PERTEK 4 Feb 26, SPI 6 Mei 26 · Revision #3 PERTEK 30 Jun 26, SPI 16 Jul 26 | Revision #2 `pertekDate` 30/06/26 → **04/02/2026** (selaras dengan `releaseDate`-nya sendiri) |

**Koreksi di luar pertanyaan semula.** Jawaban GNG membetulkan dua hal yang
tidak ditanyakan: tanggal SPI Obtained #2 ternyata **30 Apr 2026**, bukan
22 Jul 2026. Angka 22 Jul itu milik Obtained #3 dan sempat tersalin ke
Obtained #2 oleh perbaikan 2026-08-03 (yang menyalin dari `spi_date`, yang
isinya sendiri sudah keliru). Tanpa jawaban ini kekeliruannya tidak akan
ketahuan.

## Tambahan (bagian B) — tidak perlu perubahan dashboard
- **BHG**: Obtained #1 200 MT PPGL Carbon + Obtained #2 150 MT GI Boron,
  keduanya terpakai habis → available 0. Dashboard sudah menampilkan 350/0.
  Sheet **"Apply cycle"** di master yang menulis 400 — perlu dirapikan di file.
- **KAN**: Obtained #2 60 MT GI Boron, PERTEK 20 Jul 26, SPI 30 Jul 26.
  Dashboard sudah persis begitu. Sheet "Apply cycle" masih menulis `TBA`.

## Verifikasi
- Paritas master vs dashboard per periode: lihat tabel di atas.
- Audit seluruh company (tanpa filter): **0 selisih** untuk 34 company × 4 ukuran.
- KPI tak bergeser: obtained 34.840 · utilized 22.547 · available 12.293 ·
  realized 15.438,208.

## Sisa
- **AADC 150 MT — salah ketik di file master.** Sel PERTEK Submit #1 berisi
  `1-Jul-16` (serial Excel 42552 = 1 Juli 2016). Seharusnya **14 April 2026**,
  sesuai konfirmasi pemilik data dan sesuai catatan di baris yang sama
  ("PERTEK TERBIT 14/04/2026"). Dashboard sudah benar; **yang perlu diperbaiki
  adalah file master-nya**. Selama belum, hitungan manual dari master akan
  kurang 150 MT di April dan di total.
- **BDG Revision #2** — tanggalnya tidak diubah. Jawaban "sudah benar sesuai
  master" tidak bisa diterapkan tanpa tafsir: di blok BDG, kolom
  Submission/Release **bergeser** dari kolom jenis cycle (baris berlabel
  `Utilization` justru memuat tanggal Revision #2). Terbaca dua kemungkinan:
  21 Apr 26 (berlabel "SPI Perubahan (Revision #1)") atau 22 Jun 26 (berlabel
  "PERTEK Perubahan (Revision #2)"). Cycle ini ber-MT **0**, jadi tidak
  memengaruhi angka mana pun — aman ditunda.
- **MJU Revision #3** belum ada di dashboard (di master ber-MT 0). Penomoran
  revisi MJU juga berbeda antara master dan dashboard: cycle
  `Obtained (Revision #1)` 200 MT bertanggal SPI 16 Jul 26, yang menurut
  pemilik data adalah SPI **Revision #3**. Perlu dipastikan revisi mana yang
  memayungi 200 MT itu sebelum diubah.
