# Active SPI per produk + satu tabel gabungan di halaman PERTEK & SPI
- **Tanggal:** 2026-08-26
- **Oleh:** Claude Code (permintaan tim Sales/CorpSec)

## Ringkasan
Memperbaiki **logic**, bukan hanya tampilan. MJU dan BDG tidak muncul sebagai Active
padahal SPI Perubahannya sudah terbit; penyebabnya model Active/Inactive yang mencari
rincian produk di siklus yang memang tidak pernah diisi. Modelnya diganti: berangkat
dari PRODUK, bukan dari dokumen. Sekaligus halaman PERTEK & SPI dipadatkan — ringkasan
revisi jadi panel yang dilipat, dan tiga tabel dilebur jadi satu tabel 16 kolom.

## Akar masalah

Kuota sebuah revisi tercatat di DUA siklus yang berbeda perannya:

| Siklus | Perannya | MT | Rincian produk |
|---|---|---:|---|
| `Revision #N` (PERTEK Perubahan) | pembawa kuota | 0 | **selisih**, mis. MJU `{HRPO ALLOY:+200, HOLLOW PIPE:-200}` |
| `Obtained (Revision #N)` (SPI Perubahan) | dokumen | 0 | **kosong** |

Model sebelumnya menelusuri siklus SPI lalu membaca rincian produk di situ — yaitu di
tempat yang selalu kosong. Akibatnya MJU HRPO Alloy 200 MT tidak punya SPI aktif sama
sekali, dan BDG GL Alloy 650 + GI Alloy 350 ikut hilang.

## Model baru

1. Produk yang **dipegang company hari ini** datang dari master per-produk
   (`company_product_stats` lewat `getObtainedByProdAgg`), yang sudah menyimpan NET
   sesudah semua revisi. Tidak direkonstruksi ulang dari siklus.
2. **Dokumen yang berlaku** = PERTEK + SPI yang **terakhir terbit**. SPI Perubahan
   mengalahkan SPI awal; PERTEK Perubahan mengalahkan PERTEK awal.
3. Produk yang masih dipegang → 🟢 **Active** di bawah dokumen itu. Produk yang pernah
   dipegang lalu dipindahkan revisi → ⚪ **Inactive**, lengkap dengan dokumen historisnya.

Hasilnya persis angka yang diberikan tim, tanpa satu pun kasus dikhususkan:

| Company | Produk | MT | PERTEK Perubahan | SPI Perubahan | Status |
|---|---|---:|---|---|---|
| MJU | HRPO ALLOY | 200 | 30/06/2026 | 16/07/2026 | 🟢 Active |
| BDG | GL ALLOY | 650 | 22/06/2026 | 21/07/2026 | 🟢 Active |
| BDG | GI ALLOY | 350 | 22/06/2026 | 21/07/2026 | 🟢 Active |

Halaman Available Quota membaca aturan yang **sama** lewat `activeValidityByProduct()`,
jadi kedua halaman tidak bisa lagi bercerita berbeda.

**Efek samping yang disengaja:** Re-Apply tidak lagi melahirkan dua baris Active untuk
satu produk. ADP jadi satu baris GL ALLOY 350 MT (250 + 100) di bawah SPI terakhir.
Kuotanya tetap bertambah (aturan master #2); yang tidak digandakan hanya barisnya.

## Perubahan tampilan
- **Submission & Revision Summary** jadi `<details>` yang terlipat secara bawaan;
  jumlah company yang punya revisi dicetak di kepalanya supaya isinya terlihat tanpa dibuka.
- **Tiga tabel jadi satu.** Tabel "Full SPI Table" per-company dan tabel Validity Date
  terpisah dilebur ke satu tabel 16 kolom:
  `No. | Company | Group | Cycle | Products | Submit (MT) | Obtained (MT) | Util (MT) |
  Status | Remarks | PERTEK No. | PERTEK Date | SPI No. | SPI Date | Validity Date | SPI Status`
- Satu baris per **produk**; company, Status, dan Remarks tidak diulang antar baris
  produk milik company yang sama.
- Pil penyaring: **All | Completed | Under Submission | Pending | New Submission**.
- **Remarks** menggantikan "Current Status Only", membaca Status Note CorpSec
  (`co.statusUpdate`, field `eStatusUpdate` di Input Data). Kolom "Status Update" ikut
  lebur — dua kolom itu memang membaca satu field yang sama.

## File yang disentuh
- `iqdash/assets/js/01a-quota-year.js` — seluruh blok Active/Inactive ditulis ulang:
  `activeDocuments()`, `productGrantHistory()`, `processStatus()`, `spiTerbitRows()`.
- `iqdash/assets/js/05a-spi-terbit.js` — render tabel gabungan 16 kolom.
- `iqdash/assets/js/05-tables-spi.js` — `renderSPI()` dipagari (`spiBody` sudah tidak ada);
  fungsinya dipertahankan karena `updateSPICounts()` masih mengisi angka nav & strip notice.
- `iqdash/assets/index.html` — markup halaman PERTEK & SPI; versi cache dinaikkan.
- `iqdash/assets/css/style.css` — gaya panel lipat + `.st-badge`.
- `iqdash/tests/test_spi_terbit_render.cjs`, `test_quota_year_validity.cjs` — ditulis ulang
  untuk model baru.

## Verifikasi / uji
- `test_spi_terbit_render.cjs` → **41 pass · 0 fail**, termasuk:
  urutan 16 kolom sama persis dengan yang ditulis tim; **jumlah sel tiap baris = 16**
  (baris lanjutan yang selnya sengaja dikosongkan ikut diperiksa); colspan baris TOTAL
  Available Quota menutupi tepat 10 kolom; MJU/BDG/GAS diuji terhadap data sungguhan.
- `test_quota_year_validity.cjs` → **47 pass · 0 fail**.
- Seluruh **24 uji `.cjs`** lulus.
- Deploy `iqdash/assets` (28 file, gagal 0) lalu diverifikasi lewat URL ber-versi yang
  benar-benar dipanggil halaman: `01a-quota-year.js?v=2` dan `05a-spi-terbit.js?v=2`
  memulangkan berkas baru dengan ukuran sama persis dengan lokal.

## Sisa / risiko

1. **`DIOR / BORDES ALLOY 100 MT` masih tanpa SPI aktif** — dan itu benar: tanggal SPI
   DIOR belum pernah dicatat (`spiDate` kosong, `releaseDate` null). Perlu dilengkapi
   CorpSec, bukan bug. Satu-satunya baris Available Quota yang tersisa tanpa SPI aktif.

2. **`CGK / GL ALLOY` belum punya PERTEK maupun SPI tercatat** — ditandai "belum terbit".

3. **Baris yang SPI-nya belum terbit ditandai "⏳ Belum terbit", bukan Inactive.**
   Tim menetapkan hanya dua kategori, tapi SPI yang belum ada bukan expired dan bukan
   digantikan — menyebutnya Inactive akan berbohong tentang keadaannya. Kalau tim lebih
   suka dipaksa jadi dua kategori, yang perlu diubah hanya `_stBadge()`.

4. **Uji PHP `test_router_get`, `test_router_insights`, `test_patch_company` gagal** —
   ketiganya menguji `iqdash/api.php` + `lib/auth.php` + `lib/api_guard.php`, file yang
   sedang diubah **pekerjaan refactor auth yang berjalan paralel** di working copy.
   Giliran ini tidak menyentuh satu pun berkas PHP. `test_ledger.php` sudah gagal jauh
   sebelumnya (selisih 300 MT ledger statis vs data hidup).

5. **Kolom "Cycle"** menampilkan siklus dokumen yang saat ini memberi kuota produk itu.
   Untuk produk yang kuotanya terkumpul dari beberapa siklus (Re-Apply), yang tertera
   adalah siklus terakhir, sementara kolom Obtained memuat totalnya. Dinyatakan di
   tooltip kolom dan di kaki tabel.
