# IQ Dash — tanggal wajib & konsisten di flow Obtain, Submit, Utilisasi
- **Tanggal:** 2026-07-30
- **Oleh:** Claude Code

## Ringkasan
Menutup empat celah di modul IQ Dash yang membuat sebuah record bisa tersimpan ke
Google Sheets **tanpa tanggal yang bisa dibaca filter periode**. Karena
`inPd(null)` bernilai `false`, record semacam itu bukan sekadar "tidak
terfilter" — ia **hilang dari SEMUA periode**, dan MT-nya lenyap dari KPI, kartu
AVQ, serta chart O/U begitu ada yang memilih kuartal. Di tampilan *All Time*
datanya masih terlihat, sehingga gejalanya menyerupai bug filter, padahal
tanggalnya memang tidak pernah tersimpan.

## Latar: di mana tanggal tiap flow disimpan

| Flow | Input UI | Field in-memory | Kolom DB | Dibaca filter lewat |
|---|---|---|---|---|
| **Submit** | `eSubmitDate` | `cycle.submitDate` | `cycles.submit_date` | `cycleDates().submitMOI` |
| **Obtain** | `ePertekDate` / `eSpiDate`, Revision Mgmt, 📌 Catat Terbit | `cycle.releaseDate` / `pertekDate` / `spiDate` | `cycles.release_date` / `pertek_date` / `spi_date` | `pertekTerbit` / `spiTerbit` |
| **Utilisasi** | Sales: Util MT + ETA JKT · Ops: Real MT + PIB Date | `lot.etaJKT` / `lot.pibDate` | `company_shipments.eta_jkt` / `pib_date` | `lotUtilDate()` |

## Celah yang ditemukan & diperbaiki

**1. Utilisasi — lot ber-MT bisa tersimpan tanpa tanggal.**
ETA JKT hanya diwajibkan di tombol 💾 Simpan per-lot (`saveSalesUtil`). Tombol
**Save utama** membaca input mentah lewat `collectShipmentData()` dan melewati
guard itu, jadi lot dengan `utilMT > 0` tanpa ETA/PIB tetap ditulis ke
`company_shipments`. Sekarang kedua jalur memakai satu aturan yang sama.

**2. Obtain — form utama tidak pernah mengisi kolom tanggal khusus.**
`saveEdit()` hanya menulis `releaseDate`; `pertekDate`/`spiDate` dibiarkan
kosong. Padahal `spi_date` justru fallback yang diandalkan filter, dan
`pertek_date` satu-satunya cadangan bila `release_date` tertimpa.

**3. Obtain — Revision Management menulis NOMOR dokumen ke `release_date`.**
`rrSaveStatus` / `rrMarkApproved` / `rrApplyObtained` melakukan
`activeCy.releaseDate = pertekNo`. Inilah sumber komentar *"release_date
SOMETIMES holds a document NUMBER"* di `02-period-filter.js` — dan masih aktif.
Sisi Obtained tertolong fallback `spi_date`; sisi Submit/Revision tidak punya
fallback sama sekali (`pertekTerbit = pDate(releaseDate)`, sengaja tidak
diperlebar — keputusan 2026-07-08), jadi cycle-nya hilang dari filter release.

**4. Obtain — `_autoPertekDate` diabaikan di jalur SPI biasa.**
Tanggal hasil ekstraksi dari teks status ("PERTEK TERBIT 14/04/2026") dipakai di
jalur promosi PENDING, tapi cabang perusahaan SPI yang sudah ada memakai
`newPertekDate` mentah — sehingga cycle-nya tetap tanpa tanggal.

**5. Filter — hari pertama rentang custom selalu terbuang (+7 jam).**
Ditemukan menyusul pertanyaan *"kenapa bulan Juni saat difilter tidak keluar?"*.
`onCustomDate()` mencampur dua aturan parsing dalam satu fungsi:

```js
PERIOD.from = new Date(f);                // "2026-06-01"          -> UTC
PERIOD.to   = new Date(t + 'T23:59:59');  // "2026-06-30T23:59:59" -> LOKAL
```

String ISO **tanggal-saja** diurai sebagai UTC tengah malam oleh ECMAScript;
string yang sama **dengan jam** dan tanpa zona diurai sebagai waktu lokal. Di
WIB (UTC+7) rentang jadi dimulai pukul **07:00** pada hari `from`, sementara
semua tanggal record berasal dari `pDate()` → `new Date(y, m-1, d)` = tengah
malam lokal. Record bertanggal **tepat di hari `from`** duduk 7 jam sebelum
awal rentang dan dibuang. Filter 01–30 Juni kehilangan seluruh record
bertanggal 1 Juni — dan hal yang sama terjadi pada tanggal 1 setiap bulan.
Karena hanya batas AWAL yang salah, rentangnya tampak "hampir benar" sehingga
gejalanya terbaca sebagai data hilang, bukan bug filter.

Efek samping terkait: `applyPreset()` menulis `p.from.toISOString().slice(0,10)`
ke input tanggal — konversi ke UTC membuat tanggal lokal tengah malam kembali
sebagai hari **sebelumnya** (1 Apr → `"2026-03-31"`).

## Perubahan

### Filter periode
- `pfParseInputDate(str, endOfDay)` — mengurai nilai `<input type="date">`
  sebagai waktu **lokal** di kedua ujung (`T00:00:00` / `T23:59:59`), sehingga
  batas rentang sebidang dengan tanggal yang dibandingkan.
- `pfFormatInputDate(date)` — `Date` → `"YYYY-MM-DD"` dibaca lokal, pengganti
  `toISOString().slice(0,10)` yang menggeser tanggal mundur sehari.
- Label banner ("Periode aktif: …") kini dibentuk dari objek `Date` **yang
  sama** dengan yang dipakai filter, supaya teks dan perilaku tak bisa berbeda.

### Utilisasi
- `lotHasUtilDate(lot)` — satu aturan bersama: lot dianggap bertanggal bila
  `lotUtilDate()` bisa membacanya (PIB dulu, lalu ETA). Terikat pada fungsi
  filter yang sama persis, sehingga guard dan filter tidak mungkin berbeda.
- `lotsMissingUtilDate()` + `flagMissingUtilDates()` — mendeteksi lot ber-MT
  tanpa tanggal dari input form yang **sedang** akan disimpan, menandai field
  ETA merah, dan memfokuskannya.
- `saveEdit()` menolak simpan (pola yang sama dengan guard MT ambigu) dan
  menyebutkan produk + nomor lot yang bermasalah.
- `saveSalesUtil()` kini menerima **PIB Date sebagai pemenuh syarat**, bukan
  hanya ETA — sebelumnya lot yang sudah bertanggal PIB dari Ops tetap ditolak.
- `onSalesDirectChange()` menampilkan alasan tombol Simpan dinonaktifkan saat
  mengetik, bukan menunggu klik lalu memantulkan.

### Obtain
- `saveEdit()` mencerminkan tanggal ke kolom khusus: PERTEK → `subCy.pertekDate`,
  SPI → `obtCy.spiDate`; dan memakai `_autoPertekDate`/`_hasPERTEK`.
- Jalur promosi PENDING mengisi `spiDate` pada cycle Obtained #1.
- `rrApplyObtained` / `rrSaveStatus` / `rrMarkApproved` menulis **TANGGAL** ke
  `releaseDate`; nomor dokumen tetap di `co.pertekNo` / `co.spiNo` (rumah
  aslinya) dan tetap muncul di teks `status` cycle.
- `buildRevMgmtSection()` membaca field No. dari `co.pertekNo` / `co.spiNo`, dan
  field tanggal dari `pertek_date` / `spi_date` dengan `release_date` sebagai
  fallback **hanya bila benar-benar terbaca sebagai tanggal** (baris lama masih
  bisa berisi nomor).

### Submit
- `saveEdit()` menolak simpan bila mencatat Submit MT tanpa Submit Date dan
  cycle tersebut belum punya tanggal sebelumnya. Tabel `cycles` tidak punya
  kolom `created_at`, jadi tanggal ini **harus** datang dari form — tidak ada
  cadangan apa pun.

### Server (berlaku untuk semua klien)
- `iq_is_date_like()` — pengenal tanggal permisif yang meniru `pDate()` di
  browser (ISO, `D/M/YY(YY)`, `DD-Mon-YY`, nama bulan EN + ID). Peta nama bulan
  dijaga **identik** dengan `_MONTH_NAME_MAP`, bukan superset: nama yang
  diterima PHP tapi ditolak `pDate()` justru akan menulis "tanggal" yang tetap
  terbaca kosong oleh dashboard.
- `iq_cycle_backfill_dates()` — menyalin `release_date` yang benar-benar
  tanggal ke kolom khususnya (Submit/Revision → `pertek_date`, Obtained →
  `spi_date`) **hanya bila kolom itu masih kosong**. Isi-yang-kosong saja:
  tidak pernah menimpa tanggal yang sudah ada, dan `release_date` berisi
  nomor/`TBA` tidak disalin ke mana pun. Ini menormalkan data ke depan, bukan
  menulis ulang sel lama.
- `pertek_date`/`spi_date` kini ikut dinormalkan `TBA` → `''` seperti
  `submit_date`/`release_date`, supaya `'TBA'` tidak menyamar sebagai kolom
  tanggal yang sudah terisi.

## File yang disentuh
- `iqdash/assets/js/02-period-filter.js` — `pfParseInputDate()` /
  `pfFormatInputDate()` (baru); `onCustomDate()` + `applyPreset()` memakainya
- `iqdash/tests/test_period_boundary.cjs` — **baru**
- `iqdash/iqdash_util.php` — `iq_month_name_map()`, `iq_is_date_like()` (baru)
- `iqdash/iqdash_write.php` — `iq_cycle_backfill_dates()` (baru), dipakai di
  `iq_build_cycles_replacement()`; `pertek_date`/`spi_date` lewat `norm()`
- `iqdash/assets/js/11-shipment.js` — `lotHasUtilDate()`, `lotsMissingUtilDate()`,
  `flagMissingUtilDates()`; `saveSalesUtil()` terima PIB; validasi hidup di
  `onSalesDirectChange()`; reset tanda di `onSalesEtaChange()`; export untuk tes
- `iqdash/assets/js/13-rev-mgmt.js` — guard tanggal Utilisasi + Submit di
  `saveEdit()`; mirror PERTEK/SPI ke kolom khusus; `_autoPertekDate` dipakai;
  Revision Mgmt berhenti menulis nomor ke `releaseDate`; pre-fill diperbaiki
- `iqdash/tests/test_util_date_required.cjs` — **baru**
- `iqdash/tests/test_cycles.php` — tes `iq_is_date_like` + `iq_cycle_backfill_dates`

## Verifikasi / uji
- `node --check` bersih untuk ketiga file JS yang diubah.
- `node iqdash/tests/test_period_boundary.cjs` → **24 lulus, 0 gagal**.
  Menguji batas rentang custom: hari pertama harus ikut, batas tetap rapat
  (31 Mei / 1 Juli tidak bocor), rentang satu hari, dan round-trip preset.
  Tes ini **gagal** pada kode lama di zona waktu mana pun yang offset-nya
  bukan nol.
- `node iqdash/tests/test_util_date_required.cjs` → **19 lulus, 0 gagal**.
  Termasuk properti "guard == filter": untuk tiap contoh lot, `lotHasUtilDate()`
  harus sama dengan `!!lotUtilDate()` — kalau guard meloloskan lot yang nanti
  dibuang filter, itu bug yang sama muncul lagi.
- Regresi yang sudah ada tetap hijau: `test_period_dates.cjs` (15),
  `test_ra_waves.cjs` (21), `test_mt_format.cjs` (35).
- `php -l` bersih untuk seluruh file PHP iqdash yang disentuh.
- **Seluruh suite PHP lulus — 342 assertion, 0 gagal** (13 file
  `iqdash/tests/test_*.php`), termasuk `test_cycles.php` (45, dengan 22 kasus
  baru untuk `iq_is_date_like` + `iq_cycle_backfill_dates`) dan
  `test_router_insights.php` (25) yang benar-benar memanggil Google Sheets.

## Catatan lingkungan: PHP dipasang 2026-07-30
Mesin dev belum punya PHP, sehingga tes PHP sempat tidak bisa dijalankan.
Sekarang sudah terpasang:
- **PHP 8.4.22** via `winget install --id PHP.PHP.8.4`. (`PHP.PHP.8.3` — versi
  yang disebut `start-local.bat` — gagal: URL unduhannya 404 karena php.net
  memindahkan rilis lama ke arsip.)
- `php.ini` dibuat dari `php.ini-development`, mengaktifkan
  `curl`, `openssl`, `mbstring`, `fileinfo` (paket winget tidak membuat
  `php.ini` sama sekali, sehingga `curl_init()` undefined).
- `curl.cainfo` + `openssl.cafile` diarahkan ke bundle CA milik Git for Windows
  (`%LOCALAPPDATA%\Programs\Git\usr\ssl\certs\ca-bundle.crt`) — tanpa ini
  panggilan Sheets gagal *"unable to get local issuer certificate"*. Memakai
  berkas yang sudah ada di mesin, tidak mengunduh apa pun.

`start-local.bat` tetap berfungsi tanpa diubah: path PHP 8.3 yang di-hardcode
tidak ketemu, lalu ia jatuh ke `php` di PATH — yang kini ada, dan PHP menemukan
`php.ini` di direktori exe-nya sendiri sehingga hasilnya setara.

## Hasil diagnostik atas data produksi (2026-07-30)
`iqdash/tests/diagnose_dates.php` (READ-ONLY, hanya `$gs->table()`) dijalankan
terhadap spreadsheet sungguhan. Ia meniru `pDate()` / `cycleDates()` /
`lotUtilDate()` di browser, lalu melaporkan record yang tak terlihat filter.

Sapuan per periode — **hanya Juni yang terdampak**:

| Periode | Company tampil | Hilang total |
|---|---|---|
| Mar 2026 | 7 | 0 |
| Apr 2026 | 15 | 0 |
| Mei 2026 | 13 | 0 |
| **Jun 2026** | **8** | **5 — BHG, HKG, LCP, SGD, SPA** |
| Jul 2026 | 15 | 0 |
| Q2 2026 | 27 | 0 |

Penyebabnya persis celah #3: tujuh cycle `Submit #2` / `Revision #1` menyimpan
**nomor dokumen** di `release_date`, sementara tanggal aslinya ada di
`pertek_date`:

```
BBB  Submit #2    1075/ILMATE/PERTEK-SPI-U-…   pertek_date = 18/06/2026  (tampil via cycle lain)
BHG  Submit #2    1057/ILMATE/ PERTEK-SPI-U…   pertek_date = 26/06/26    HILANG total
HKG  Submit #2    1083/ILMATE/PERTEK-SPI-U-…   pertek_date = 27/06/2026  HILANG total
LCP  Submit #2    1106/ILMATE/PERTEK-SPI-U-…   pertek_date = 18/06/2026  HILANG total
SGD  Submit #2    92/ILMATE/ PERTEK-SPI-U-R…   pertek_date = 30/06/26    HILANG total
SJH  Submit #2    1161/ILMATE/PERTEK-SPI-U-…   pertek_date = 13/06/2026  (tampil via cycle lain)
SPA  Revision #1  1079/ILMATE/PERTEK-SPI-U-…   pertek_date = 24/06/2026  HILANG total
```

Rupanya satu gelombang revisi PERTEK-SPI-U diproses lewat Revision Management
pada Juni — di bulan lain jalur itu jarang dipakai, sehingga tak ada dampak.
Q2 tampak bersih karena kelima company itu tetap tertarik masuk lewat cycle
April/Mei mereka yang tanggalnya terbaca; efeknya baru terlihat saat difilter
per bulan.

Temuan lain:
- **5 cycle ber-MT tanpa tanggal sama sekali** — hilang dari SEMUA periode:
  PPGL Obtained #1 (50 MT), IKM Obtained #1 (8.000 MT), HKG Obtained #2 (250),
  JKT Obtained #2 (2.700), MIN Obtained #2 (600).
- **1 lot utilisasi tanpa tanggal**: SMS / GI ALLOY / Lot 1 — 150 MT.
- Tidak ada tanggal mustahil (mis. 31/02) di data.

## Sisa / risiko
- **Beda versi PHP**: dev memakai 8.4, host Niagahoster kemungkinan 8.x lain.
  Kode ini tidak memakai fitur khusus 8.4, tapi lint hijau di 8.4 bukan
  jaminan mutlak untuk versi host.
- **Baris lama tidak diperbaiki otomatis.** `iq_cycle_backfill_dates()` hanya
  jalan saat sebuah company disimpan ulang. Untuk lima company Juni di atas
  (BHG, HKG, LCP, SGD, SPA), perbaikannya cukup manual: buka tiap company di
  **Revision Management → 💾 Save Status Update**. Field "PERTEK Terbit Date"
  kini di-prefill dari `pertek_date` (yang sudah berisi tanggal benar), dan
  `rrSaveStatus()` menulis tanggal itu ke `release_date`. Lima company — belum
  perlu script backfill. Jalankan ulang `diagnose_dates.php` untuk memastikan.
- **`iq_is_date_like()` sedikit lebih ketat dari `pDate()`**: ia menolak tanggal
  yang mustahil (31/02/2026) lewat `checkdate()`, sedangkan JS akan menggulungnya
  ke 3 Maret. Bedanya hanya membuat server menolak mem-backfill, tidak pernah
  membuat data salah.
- **Guard Submit Date mengubah alur kerja CorpSec**: menyimpan Submit MT tanpa
  Submit Date kini ditolak. Ini disengaja (tabel `cycles` tidak punya
  `created_at`), tapi perlu diberitahukan ke tim CorpSec.
- **Nomor PERTEK/SPI tidak lagi tersimpan di `cycles.release_date`.** Nomornya
  ada di `companies.pertek_no`/`spi_no` dan di teks `status` cycle. Bila ada
  laporan/ekspor yang membaca nomor dari `release_date`, perlu diarahkan ulang —
  pencarian di `assets/js` tidak menemukan pembaca semacam itu selain pre-fill
  form yang sudah ikut diperbaiki.
