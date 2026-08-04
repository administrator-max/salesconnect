# [iqdash-pdf-summary-period] 2026-08-04 — PDF Summary: Utilized ikut periode, Lead Time disaring PERTEK

- **Tanggal:** 2026-08-04
- **Oleh:** Claude Code
- **Pemicu:** laporan pengguna atas PDF Summary periode **1 Jan – 30 Jun 2026**,
  dibandingkan tabel Excel "DETAIL KUOTA IMPOR PER PERUSAHAAN — H1 2026".

## Laporan awal

| KPI | PDF | Excel | Status |
|---|---|---|---|
| Total Submitted | 74.945 | 74.945 | benar |
| Quota Obtained | 19.860 | 20.710 | **salah** |
| Total Utilized | 18.447 | 17.300 | **salah** |
| Cargo Realized | 26 | 26 | benar |
| Available Quota | 11.693 | 11.693 | benar |

Plus: bagian **Utilization Lead Time Alert** masih menampilkan PERTEK 2025
padahal filternya Jan–Jun 2026.

## Total Utilized — DUA sebab terpisah, keduanya diperbaiki

### a. SGD 2.000 MT hilang — salah ketik label di master
Baris master SGD tertulis **`Utilizaion (date)`** (kurang huruf *t*), sedangkan
migrasi tanggal utilisasi 2026-08-04 mencocokkan `^utilization\s*\(date\)`.
SGD dilewati **tanpa suara**, sehingga `eta_jkt`-nya kosong dan seluruh
utilisasinya tidak masuk periode mana pun.

Master SGD: SHEET PILE 2.000 pada 27 Feb 26 · GI 500 pada 24 Jul 26 — persis
2.000 MT yang hilang dari H1.

Sapuan seluruh master: **hanya SGD** yang labelnya menyimpang (34 blok,
31× `Utilization (date)`, 1× `Utilization (Date)`, 1× `Utilizaion (date)`).
Pencocokan diperlonggar jadi `^utili\w*\s*\(` + `(date)`/`(mt)`, lalu SGD
dimigrasikan.

> **Catatan jujur:** verifikasi paritas 2026-08-04 sebelumnya melaporkan
> "Utilized cocok di semua periode". Itu tidak menangkap kasus ini karena
> pemeriksa saya memakai regex yang SAMA, jadi kedua sisi buta pada typo yang
> sama dan selisihnya saling meniadakan. Pemeriksa yang memakai parser sendiri
> tidak boleh dianggap bukti independen.

### b. PDF tidak pernah mengiris utilisasi per periode
`14-export.js` menjumlahkan `co.utilizationByProd` — angka **sepanjang waktu** —
lalu hanya menyaring COMPANY-nya lewat `filteredSPI()`. Periodenya tidak pernah
diterapkan pada MT-nya. Diganti `scopedUtilTotal()` di atas
`utilizationPool()`, sama persis dengan KPI dashboard.

**Hasil: 17.300 MT — cocok Excel.**

## Utilization Lead Time Alert
Bagian ini mengambil company dari `filteredSPI()`, yang meloloskan company bila
**cycle mana pun** menyentuh periode — benar untuk tabel, salah di sini. Alert
ini justru TENTANG tanggal PERTEK, jadi baris ber-PERTEK di luar rentang tidak
boleh ikut. Ditambahkan gerbang `if (PERIOD.active && !inPd(pertekDate)) return;`.

Verifikasi Jan–Jun 2026: yang tampil kini **8 company, seluruhnya PERTEK 2026**;
20 company ber-PERTEK 2025 (ADP, BBB, BDG, BHG, CGK, DIOR, EMS, GAS, GNG, HDP,
HKG, JKT, KAN, KJK, LCP, MIN, MJU, MSN, SJH, SPA) tersaring keluar.

## Verifikasi
- Utilized H1 2026: **17.300** (PDF 18.447 → 17.300; dashboard 15.300 → 17.300).
- Perbandingan baris-per-baris dengan 18 baris tabel Excel yang terlihat di
  gambar: **utilized cocok persis (6.765 = 6.765)**.
- 6 suite JS, 0 gagal.

## Sisa — dua pertanyaan definisi

### 1. Quota Obtained 19.860 vs 20.710 (selisih 850)
Seluruhnya dua company:

- **AADC −150.** Tabel Excel menulis 0 karena dibangun dari master yang sel
  PERTEK-nya masih `1-Jul-16`. Pemilik data sudah mengonfirmasi seharusnya
  **14 Apr 2026** → masuk H1. **Dashboard benar**; angka Excel akan menjadi 150
  begitu sel master diperbaiki.
- **BDG +1.000.** Obtained #1 BDG ber-PERTEK **22 Des 2025** (di luar H1), jadi
  dashboard tidak menghitungnya. Tabel Excel menghitungnya, tampaknya karena
  kuota itu **direalokasi di H1** lewat Revision #1 (PERTEK 19 Mar 26, −650
  BORDES → +650 GL) dan Revision #2 (PERTEK 22 Jun 26, −350 → +350 GI).

  **Pertanyaannya: apakah realokasi lewat revisi dihitung sebagai "obtained"
  di periode PERTEK revisinya?** Kalau ya, aturan Obtain perlu diperluas
  (cycle Revision di dashboard saat ini ber-MT 0 dan tidak membawa perpindahan
  produk, jadi perlu diisi dari `revision_changes` lebih dulu). Belum diubah.

### 2. Available: saldo kumulatif atau aktivitas periode?
Header tabel Excel menyatakan: *"Submitted / Obtained / Utilized = aktivitas
periode … **Available = saldo kumulatif**"*. PDF memang menghasilkan 11.693
(kumulatif, lewat `co.availableQuota`) dan pemilik data menyatakan itu benar.

Tapi **kartu Available di dashboard** diubah 2026-08-04 menjadi
`obtain − utilized` dalam periode, atas permintaan pemilik data — untuk H1 itu
memberi **2.560**, bukan 11.693. Dua permukaan kini memakai definisi berbeda
untuk nama yang sama. **Belum diseragamkan** — perlu keputusan mana yang
dipakai (dugaan: kumulatif untuk keduanya, karena available adalah saldo,
bukan arus).

Catatan angka: kumulatif sepanjang waktu = 12.293; per 30 Jun = 11.693.
Selisih 600 = GKL, yang PERTEK-nya 31 Jul 2026.
