# [fix-arrival-date-and-util-pool] 2026-07-27 — Parsing tanggal kedatangan + pooling utilisasi periode

## Ringkasan
Dua bug jalur-baca IQ Dash yang membuat angka periode salah, ditemukan saat menyelidiki kenapa
Realized H1 tampil kosong:

1. **Tanggal kedatangan dibaca format Amerika.** `arrival_date` bergaya `12/06/2026` diserahkan ke
   `new Date()` → terbaca **6 Desember**, bukan 12 Juni. BTS 219,43 MT pindah dari Q2 ke Q4.
2. **Utilisasi hilang bila siklus dan lot beda kuartal.** KPI Utilized memilih perusahaan lewat
   `filteredSPI()` (disaring tanggal **siklus**) lalu menjumlahkan utilisasi yang disaring tanggal
   **lot**. Perusahaan yang izinnya terbit di satu kuartal dan kargonya tiba di kuartal berikutnya
   gugur di **kedua-duanya**.

## Akar masalah

### (2) `new Date('12/06/2026')`
JS menafsirkan tanggal ber-slash sebagai **M/D** (standar Amerika). Seluruh aplikasi ini membaca
DD/MM lewat `pDate()`. Enam titik memakai `new Date()` mentah: `03-kpis.js` ×4, `14-export.js` ×2.

Sebagian baris `ra_records` memakai timestamp ISO (`2026-02-22T17:00:00.000Z`) yang **tidak**
ditangani `pDate()` (regex ISO-nya menuntut persis `YYYY-MM-DD`), jadi mengganti mentah ke `pDate()`
justru akan merusak baris yang selama ini benar. Karena itu dibuat `raDate()`.

### (3) Pool utilisasi
`03-kpis.js:133` — `utilPool = [...filteredSPI(), ...filteredPending()]`, sementara
`scopedUtilTotal()` mengiris per tanggal lot. IKM: izin Q2 (Submit 30/04, PERTEK 30/06), kargo
pertengahan September (Q3). Di Q2 lotnya di luar jendela; di Q3 perusahaannya tersaring keluar.
**2.000 MT tidak muncul di kuartal mana pun.**

## Perubahan

### `iqdash/assets/js/02-period-filter.js` — tiga helper baru
- `raDate(v)` — timestamp ISO tetap pakai parsing native (perilaku lama dipertahankan, termasuk
  offset zona waktunya); selain itu lewat `pDate()` (DD/MM); yang tidak terbaca → `null`, bukan tebakan.
- `companiesWithLotsInPeriod()` — perusahaan (SPI ∪ PENDING) yang punya minimal satu lot ber-MT
  dengan tanggal di dalam periode.
- `utilizationPool(cycleScoped)` — gabungan daftar ber-siklus dengan daftar ber-lot, tanpa duplikat.
  Periode non-aktif → daftar asal dikembalikan apa adanya.
- Ditambah guard `module.exports` (tidak berpengaruh di browser) supaya bisa diuji di Node.

### `iqdash/assets/js/03-kpis.js`
- 5 pemakaian `new Date(*.arrivalDate)` → `raDate(...)`.
- `utilPool` dibungkus `utilizationPool(...)`.

### `iqdash/assets/js/14-export.js`
- 2 pemakaian `new Date(r.arrivalDate)` → `raDate(...)`.

### `iqdash/tests/test_period_dates.cjs` — baru
15 assertion terhadap **fungsi aslinya** (bukan tiruan): perilaku DD/MM, timestamp ISO
dipertahankan, penolakan input tak terbaca, penarikan perusahaan lewat tanggal lot, anti-duplikat,
dan periode non-aktif. `_MONTH_NAME_MAP` (milik `01-data.js`) dicerminkan di tes agar parser ETA
berperilaku persis seperti di aplikasi.

## Verifikasi

**Tes:** 2 suite JS (35 + 15) dan 13 suite PHP — semuanya lulus, nol regresi. `node --check` lolos.

**Terhadap data produksi asli** (server lokal menyajikan JS yang diperbaiki):

| | Sebelum | Sesudah |
|---|---|---|
| BTS `12/06/2026` | 2026-**12-06** | 2026-**06-12** ✓ |
| Utilisasi Q3 2026 | 550 MT (2 co.) | **3.250 MT (6 co.)** |
| Realized H1 | 6.756,1 MT (9 co.) | **7.699,7 MT (10 co.)** |
| Utilisasi H1 | 0 | 0 (benar — semua ETA lot jatuh Agu/Sep) |

Perbaikan pooling memulihkan **2.700 MT** yang sebelumnya tak terlihat di kuartal mana pun:
IKM 2.000, BDG 350, HKG 250, JKT 100 — semuanya berpola sama (izin satu kuartal, kargo kuartal
berikutnya).

## Sisa pekerjaan — bukan bug kode
**7.738,5 MT dari 14 perusahaan masih tersembunyi dari semua tampilan periode** karena baris
`ra_records`-nya bertanda `cargo_arrived = TRUE` tapi **`arrival_date` kosong**:

`ADP, AMP, BBB, BHG, EMS, JKT, LCP, LSJ, MSN, SGD, SJH, SPA, SPP, BDG`

Ini fakta bisnis — tanggal kedatangannya harus diisi orang yang tahu. Tidak boleh ditebak.

## Risiko / catatan
- **Belum di-commit, belum di-deploy.** Masih di working tree, bersama perbaikan alias-matching.
- Perbaikan `raDate` mengubah angka Realized yang tampil (6.756 → 7.699,7 untuk H1). Itu koreksi,
  bukan regresi — tapi laporan yang sudah terbit memakai angka lama.
- Kartu Available Quota di halaman AVQ (`19-init.js`) sengaja **tidak** ikut diubah: kartu itu
  menghitung rasio utilisasi terhadap obtained dari pool ber-siklus, jadi melebarkan pembilangnya
  saja akan membuat rasio bisa >100%. Perlu dibahas terpisah.
