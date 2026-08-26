# Validity Date, status SPI Active/Inactive, dan pemisahan kuota 2026 vs 2027
- **Tanggal:** 2026-08-26
- **Oleh:** Claude Code (permintaan tim Sales/CorpSec)

## Ringkasan
IQ Dash kini menyatakan **SPI mana yang sedang berlaku** dan **sampai kapan**, lewat tabel
baru "PERTEK & SPI Terbit" (12 kolom, satu baris per SPI terbit per produk) dan kolom
Validity Date di Available Quota. Selain itu seluruh dashboard sekarang punya **filter
Quota Year**: memilih 2027 mengganti SELURUH data — Submission, Obtained, PERTEK, SPI,
Validity Date, Available Quota, Utilization, Realization, Re-Apply — ke tahun itu saja,
tanpa pernah menjumlahkannya dengan 2026.

## Perubahan

### 1. Validity Date
- Aturannya hidup di SATU fungsi, `spiValidityDate()` di `01a-quota-year.js`:
  **31 Desember dari TAHUN KUOTA** SPI itu. SPI yang belum terbit memulangkan kosong,
  bukan tanggal karangan.
- Muncul di tabel PERTEK & SPI Terbit (per baris SPI) dan di tabel Available Quota
  (mengikuti SPI yang sedang Active untuk pasangan company+produk itu).

### 2. Status SPI — hanya dua kategori
- 🟢 **Active** — SPI yang saat ini masih berlaku/efektif.
- ⚪ **Inactive** — sudah digantikan SPI baru, atau sudah lewat Validity Date.
- Baris Inactive **tetap tersimpan dan tetap tampil** sebagai data historis (diredupkan),
  tapi tidak dipakai untuk menentukan Validity Date yang berlaku.
- Penggantian dideteksi lewat **produk**, bukan lewat kata "Perubahan" — lihat Alasan.

### 3. Quota Year 2026 / 2027
- Pemilih tahun di topbar, di sebelah kiri filter Periode. Pilihannya diingat per peramban.
- Pengirisan dilakukan **di sumber**: `SPI`, `PENDING`, `RA`, `REALIZATIONS` yang dibaca
  ~20 berkas lain selalu berisi tahun terpilih saja; data mentah lintas tahun disimpan di
  `SPI_ALL` dst. Tidak ada permukaan yang bisa lupa menyaring tahun.
- Judul tab browser, judul PDF, judul + nama berkas Excel/CSV/JSON ikut membawa tahunnya.
- Spanduk penjelas saat tahun terpilih belum ada datanya — supaya deretan nol tidak
  terbaca sebagai "kuota habis".

## File yang disentuh

**Baru**
- `iqdash/assets/js/01a-quota-year.js` — tahun kuota + Validity Date + Active/Inactive.
  Satu berkas karena ketiganya menjawab satu pertanyaan yang sama.
- `iqdash/assets/js/05a-spi-terbit.js` — render tabel PERTEK & SPI Terbit.
- `tools/add_quota_year_columns.php` — penambah kolom `quota_year` di Google Sheets.
  **BELUM DIJALANKAN** (lihat Sisa/risiko).
- `iqdash/tests/test_quota_year_validity.cjs` — 43 pemeriksaan logika.
- `iqdash/tests/test_spi_terbit_render.cjs` — 23 pemeriksaan render + jumlah kolom.

**Diubah**
- `iqdash/iqdash_data.php` — payload membawa `quotaYear` pada siklus, lot, utilCycle, RA;
  `statsYearByProd` pada company. Kolom sheet yang belum ada dibaca sebagai null.
- `iqdash/iqdash_write.php` — `iq_quota_year_in()`; `quota_year` ditulis pada cycles,
  cycle_utilization, company_shipments, realizations. Lot memakai aturan
  "ABSEN != KOSONG" yang sudah ada, jadi penyimpan lama tidak menghapus tahunnya.
- `iqdash/assets/js/01-data.js` — memuat ke `*_ALL` lalu mengiris.
- `iqdash/assets/js/02-period-filter.js` — `availableQuotaRows()` membawa Validity Date;
  `buildSpiTerbitTable` + `renderQuotaYearUI` masuk daftar sapuan render.
- `iqdash/assets/js/16-storage.js` — `patchCyclesToServer()` mengirim siklus SEMUA tahun;
  `patchToServer()` menolak menyimpan company lintas-tahun dari tampilan satu tahun.
- `iqdash/assets/js/19-init.js` — kolom Validity Date di tabel Available Quota;
  tahun dipulihkan sebelum data dimuat.
- `iqdash/assets/js/14-export.js` — tahun kuota di judul & nama berkas; sheet Excel baru
  "PERTEK & SPI Terbit" bersumber dari fungsi yang sama dengan layar.
- `iqdash/assets/js/12-product-mt.js`, `13-rev-mgmt.js`, `21-master-import.js` —
  record baru didaftarkan ke data mentah, bukan hanya ke irisan.
- `iqdash/assets/index.html`, `assets/css/style.css` — pemilih tahun, spanduk, tabel baru.

## Alasan

**Kenapa "Perubahan" tidak boleh disamakan dengan "penggantian".**
Di data ini istilah "SPI Perubahan" dipakai untuk dua hal yang berbeda:
- **Re-Apply** — Obtained #2/#3 dengan MT nyata (ADP 250 lalu 100; GNG 250/150/200).
  Kuotanya **bertambah**; SPI lama tetap berlaku (aturan master #2). Menandainya Inactive
  akan memotong Obtained ADP dari 350 jadi 100.
- **Revisi** — perpindahan produk, MT 0. Di sinilah SPI lama benar-benar digantikan
  (PT GAS: BORDES ALLOY → GI BORON).

Karena itu penggantian diperiksa lewat produk: SPI jadi Inactive kalau produk yang
diberikannya sudah tidak lagi dipegang company itu. Hasilnya pada data hari ini: **4 baris
Inactive** — BDG, GAS, MJU, SMS — keempatnya memang perpindahan produk. 53 baris lain
Active, termasuk seluruh SPI Re-Apply.

**Kenapa Validity ikut tahun kuota, bukan tahun tanggal terbit.**
Implementasi pertama menurunkannya dari tahun tanggal SPI terbit. Uji langsung menemukan
akibatnya: **15 dari 40 company** memegang SPI yang terbit pada 2025 untuk kuota 2026
(ADP 16/12/2025, HKG 31/12/2025, EMS 07/11/2025, …). Aturan itu menyatakan kelimabelasnya
kedaluwarsa hari ini dan mencabut kuotanya dari Available Quota — kebalikan dari keadaan
sebenarnya. Kasus itu sekarang dikunci uji regresi.

**Kenapa saldo Available Quota TIDAK dihitung ulang.**
Angka per produk berasal dari master (`company_product_stats`), yang sudah menyimpan NET
sesudah revisi — produk yang dipindahkan memang sudah tidak punya saldo di sana.
Menyaringnya lagi di sisi tampilan berarti memotong dua kali dan melanggar aturan master
#1. Yang ditambahkan hanya penanda, bukan pengurangan.

## Verifikasi / uji
- `node iqdash/tests/test_quota_year_validity.cjs` → **43 pass · 0 fail**
- `node iqdash/tests/test_spi_terbit_render.cjs` → **23 pass · 0 fail**
  (termasuk: setiap baris punya tepat 12 / 10 sel, dan baris TOTAL Available Quota
  menutupi tepat 10 kolom — pergeseran kolom tidak akan terlihat di layar)
- Seluruh 24 uji `.cjs` lain → lulus, tidak ada regresi.
- Seluruh uji PHP → lulus, **kecuali `test_ledger.php`** yang sudah gagal SEBELUM
  perubahan ini (diperiksa dengan `git stash`): parity obtained 34.840 vs 35.140 dan
  available 12.293 vs 12.593 — selisih 300 MT antara `quotaLedger.json` statis dan data
  hidup. Tidak disentuh di sini.
- Terhadap payload nyata: 40 company SPI + 1 PENDING tetap tampil di 2026, dan **tidak
  ada satu pun angka obtained yang bergeser** gara-gara pengirisan tahun. 2027 kosong.
- `php -l` bersih untuk seluruh berkas PHP yang disentuh.
- `tools/add_quota_year_columns.php` dijalankan dalam mode rencana (baca saja) terhadap
  spreadsheet sungguhan: keenam tab terbaca, posisi kolom barunya benar.

## Sisa / risiko

1. **Kolom `quota_year` belum ada di Google Sheets — WAJIB ditambahkan sebelum baris 2027
   pertama diinput.** Selama belum ada, semuanya aman: baris tanpa kolom dibaca sebagai
   2026, persis keadaan sekarang. Tapi kalau data 2027 diinput sebelum kolomnya ada,
   tahunnya hilang diam-diam saat disimpan dan barisnya kembali sebagai data 2026.
   Jalankan: `php tools/add_quota_year_columns.php --apply`
   Skrip itu hanya menulis 6 sel header dan tidak menyentuh satu pun baris data.

2. **Validity Date = 31 Desember tahun kuota** adalah pembacaan dari contoh PT GAS yang
   diberikan tim (SPI 09/01/2026 dan SPI Perubahan 27/04/2026 → keduanya 31/12/2026).
   Kalau ternyata masa berlakunya bukan akhir tahun, yang perlu diubah **hanya**
   `spiValidityDate()` di `01a-quota-year.js`.

3. **7 siklus SPI Perubahan tercatat tanpa rincian produk** (MT 0, produk kosong).
   Barisnya tidak dicetak di tabel karena kolom Product/Submit/Obtained-nya kosong semua,
   tapi tetap dipakai menentukan Validity Date, dan jumlahnya dinyatakan di kaki tabel.
   Namanya tidak ditebak — aturan master #6.

4. **2 baris Available Quota tanpa SPI aktif**, ditandai ⚠ di kolom Validity Date:
   - `DIOR / BORDES ALLOY 100 MT` — PERTEK terbit, tanggal SPI belum pernah dicatat.
   - `MJU / HRPO ALLOY 200 MT` — SPI Perubahan (Revision #2) tercatat tanpa rincian produk.
   Keduanya perlu dilengkapi CorpSec, bukan bug.

5. **Company yang memegang kuota 2026 dan 2027 sekaligus belum pernah ada.** Jalurnya
   sudah disiapkan dan diuji dengan fixture, dan dua pagar sudah berdiri:
   `patchCyclesToServer()` selalu mengirim siklus semua tahun, dan `patchToServer()`
   menolak menyimpan kolom total company dari tampilan satu tahun. Perlu diuji sekali
   lagi dengan data sungguhan begitu company pertama seperti itu muncul.

6. **Drawer detail company belum menampilkan Validity Date / status SPI** — tidak diminta,
   jadi tidak disentuh. Tabel dan ekspor sudah membawanya.
