# [iqdash-cycle-backfill] 2026-08-03 — 6 cycle master yang belum masuk + 20 cycle bertanggal rusak

- **Tanggal:** 2026-08-03
- **Oleh:** Claude Code
- **Sifat:** penulisan DATA ke Google Sheets (tab `cycles` + `cycle_products`).
  Tidak ada perubahan kode. Log perubahan kode hari ini:
  `iqdash-util-reconcile-and-ledger-refresh_2026-08-03_log.md`.

## Ringkasan
Dua hal, keduanya lewat `PATCH /api/company/:code/cycles` (endpoint
**FULL-REPLACE** — tiap panggilan mengirim ulang SELURUH cycle company itu):

1. **6 cycle dari master belum pernah diinput** — Total Submitted dashboard
   kurang 14.520 MT dari master.
2. **20 cycle menyimpan NOMOR dokumen di `release_date`**, bukan tanggal.
   Sisi Submit/Revision tak punya fallback, jadi cycle-nya hilang dari filter
   periode. Ini akar masalah "5 company hilang dari Juni" yang tercatat sejak
   `iqdash-date-consistency_2026-07-30`.

Sesudahnya: **Total Submitted 277.545 = master, persis.** Diagnostik Juni
bagian "TERSEMBUNYI" kini **kosong**; Juni menampilkan 17 company (sebelumnya 8).

## Pengaman sebelum menulis
Endpoint ini full-replace, jadi tiap penulisan diverifikasi lebih dulu:

- **Backup** `backups/2026-08-03T10-17-50-481Z/` sudah ada dari sesi yang sama
  (20 tab, termasuk `cycles` 136 baris + `cycle_products` 147 baris).
- **Uji kesetiaan round-trip** atas 16 company: cycle dari `/api/data`
  dibandingkan baris `cycles` di Sheets — jumlah, urutan, dan tipe cocok 1:1,
  **tidak ada cycle sintesis** yang akan berubah jadi baris nyata bila dikirim
  balik. Tanpa uji ini, membaca-lalu-menulis payload API tidak aman.
- **Dry-run** dicetak dan ditinjau sebelum tiap pass.
- Sesudahnya: jumlah cycle per company dibandingkan dengan backup —
  **tidak ada company yang kehilangan cycle**.

## 1. Cycle yang ditambahkan (6)

| Company | Cycle | MT | Produk | Submit | Release |
|---|---|---|---|---|---|
| KAN | Submit #2 | 2.920 | GI BORON | 29/06/2026 | PERTEK 20/07/2026 |
| CGK | Submit #3 | 3.000 | GI BORON | 30/06/2026 | PERTEK Perubahan 2 (TBA) |
| GNG | Submit #3 | 3.000 | GL BORON | 30/06/2026 | PERTEK Perubahan 2 06/07/2026 |
| GKL | Submit #2 | 3.000 | GL BORON | 14/07/2026 | PERTEK 31/07/2026 |
| GKL | Obtained #2 | 600 | GL BORON | 03/08/2026 | SPI (TBA) |
| AMP | Submit #2 | 2.600 | GL BORON | 22/07/2026 | PERTEK (kosong) |

Submit: 263.025 → **277.545 MT** (= master). GKL `Obtained #2` diikutkan supaya
drill-down cycle sejalan dengan ledger yang sudah memuat 600 MT itu (keputusan
user: "ikut Excel").

Tanggal master ber-format `29-Jun-26` diseragamkan ke `DD/MM/YYYY` agar sama
dengan isi tab `cycles` yang sudah ada.

## 2. Cycle bertanggal rusak (20)

`release_date` diisi tanggal sumbernya — `pertek_date` untuk sisi
Submit/Revision, `spi_date` untuk sisi Obtained.

**Pass 1 — gelombang Juni (7):** BBB, BHG, HKG, LCP, SGD, SJH (Submit #2) dan
SPA (Revision #1).

**Pass 2 — 13 sisanya**, ditemukan lewat sapuan menyeluruh setelah pass 1
(tidak masuk daftar 12 yang diketahui sebelumnya):
- SUBMIT-side (tak punya fallback, sama kelasnya dengan gelombang Juni):
  ADP, GNG, MSN — semuanya `Submit #2`.
- Obtained-side (punya fallback `spi_date`, jadi tidak merusak filter tapi
  isinya tetap salah): BBB, BDG, BHG, GAS, GNG, LCP, MJU, SGD, SMS, SPA.

### Nomor PERTEK diselamatkan lebih dulu
Pemeriksaan sebelum menulis menemukan **5 cycle** (BBB, BHG, HKG, SGD, SJH)
yang nomor **PERTEK Rev.1**-nya HANYA ada di `release_date` — `companies.pertek_no`
masih memuat nomor lama 2025, dan teks `status`-nya tidak menyebut nomor itu.
Menimpa begitu saja akan menghapusnya permanen.

Nomornya karena itu disisipkan dulu ke teks `status` cycle (rumah yang memang
didokumentasikan untuk nomor), mis. `"APPROVED — SPI Terbit · PERTEK
1075/ILMATE/PERTEK-SPI-U-Rev.1/VI/2026"`. LCP dan SPA aman tanpa penyisipan
(nomornya sudah sama dengan `pertek_no`); seluruh nomor SPI sisi Obtained juga
sudah tersimpan di `spi_no`/status, jadi tidak ada yang ditambahkan.

## Verifikasi
- `cycles` 136 → **142** baris (+6, persis rencana); **0 company kehilangan cycle**.
- **Total Submitted live 277.545 = master 277.545**, persis.
- `php iqdash/tests/diagnose_dates.php 2026-06-01 2026-06-30` (READ-ONLY):
  - bagian **B (tersembunyi karena nomor di `release_date`): kosong** —
    sebelumnya inilah yang menyembunyikan BHG, HKG, LCP, SGD, SPA dari Juni.
  - Juni kini menampilkan **17 company** (sapuan 30 Juli: 8).
  - bagian E (tanggal mustahil): kosong.
- KPI tak bergeser: obtained 34.840 · utilized 22.550 · available 12.290.

## Sisa / risiko
- **MIN `Obtained #2` (600 MT) sengaja TIDAK disentuh** — satu-satunya cycle
  ber-MT yang masih tanpa tanggal. Master 3 Agustus tidak punya baris
  padanannya (blok MIN sudah kembali ke BORDES utuh), jadi tak ada tanggal yang
  bisa dipakai; mengarangnya akan memasukkan tanggal palsu ke data resmi.
  Terkait langsung dengan pertanyaan MIN yang masih menunggu konfirmasi CorpSec
  di log perubahan kode hari ini.
- **Lot SMS / GI ALLOY / Lot 1 (150 MT) masih tanpa ETA maupun PIB Date** —
  di luar lingkup pekerjaan ini (lot, bukan cycle); tetap hilang dari semua
  periode. Perbaikannya: isi ETA JKT atau PIB Date pada lot tersebut.
- **`companies.pertek_no` untuk BBB, BHG, HKG, SGD, SJH masih nomor 2025**,
  sementara nomor Rev.1 kini ada di teks status cycle. Perlu keputusan bisnis:
  apakah `pertek_no` harus dimutakhirkan ke nomor Rev.1.
- **Cycle baru ditambahkan di URUTAN AKHIR** (`sort_order` menyusul), mengikuti
  pola yang sudah ada pada JKT. Urutan tampilannya bisa tidak sepenuhnya
  kronologis untuk KAN.
- Endpoint full-replace ini tak punya autentikasi (modul OPEN). Selama itu
  bertahan, siapa pun yang tahu URL-nya bisa menimpa seluruh cycle sebuah
  company dengan satu panggilan.
