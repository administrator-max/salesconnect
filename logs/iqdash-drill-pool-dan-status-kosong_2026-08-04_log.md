# [iqdash-drill-pool-dan-status-kosong] 2026-08-04 — Drill-down kehilangan PENDING; PT kosong berstatus "SPI Issued"

- **Tanggal:** 2026-08-04
- **Oleh:** Claude Code
- **Pemicu:** dua laporan tim.

---

## Masalah 1 — SNSD hilang dari Detail Breakdown

Tim menginput SNSD (Obtained #1 = **120 MT**, PERTEK 04/08/2026). Kartu KPI
bergerak benar: Obtained 34.840 → **34.960**, Available 12.293 → **12.413**.
Tapi saat kartu **SPI/PERTEK Obtained** dan **Available Quota** diklik, SNSD
tidak ada di daftar — tim men-scroll sampai mentok di SPP.

### Sebab
**SNSD ada di `PENDING`, bukan `SPI`.** Ia belum punya SPI terbit, baru PERTEK.

Setiap kartu KPI menghitung `[...SPI, ...PENDING]` (`03-kpis.js` →
`allCompanies`). Tapi tiga drill-down-nya hanya membaca `SPI`:

| Drill | Kolam lama | Benar? |
|---|---|---|
| Submit | `[...SPI]` + `[...PENDING]` eksplisit | ✅ sudah |
| **Obtained** | `SPI` | ❌ |
| **Utilized** | `filteredSPI()` | ❌ |
| **Available** | `filteredSPI()` | ❌ |
| Realized | `REALIZATIONS` (tak pakai kolam ini) | ✅ n/a |

Karena itu total di dalam modal duduk **persis 120 MT di bawah** angka kartu
yang membukanya. Selisihnya bukan kebetulan — itu SNSD seutuhnya. Ini juga
menjelaskan kenapa Submit tidak bermasalah: ia satu-satunya yang menyebut
PENDING sejak awal.

### Perbaikan
**`02-period-filter.js`** — `kpiPool()` (baru): `[...SPI, ...PENDING]`,
tersaring periode bila filter aktif. Persis set yang dipakai kartu KPI.

Ketiga drill memakainya. Docblock-nya menyatakan aturannya terang-terangan:
*sebuah drill dibuka DARI kartu dan ada untuk menjelaskan angka kartu itu; kalau
ia menyapu himpunan yang lebih kecil, ia membantah angka yang barusan diklik.*

---

## Masalah 2 — PT yang belum pernah dipakai berstatus "✅ SPI Issued"

Tujuh PT (**APA, KITA, LILO, PP, SORE, SUJU, UANG**) ada di daftar master tapi
belum pernah dikonfigurasi: `cycles: []`, `spiRef: ''`, `revStatus: ''`,
`obtained: 0`, `submit1: null`, `products: []`. Semuanya tampil **"✅ SPI
Issued"** — klaim keadaan paling kuat yang mungkin, untuk PT yang bahkan belum
pernah mengajukan apa pun.

### Sebab
`statusBadge()` memeriksa cabang revisi satu per satu, lalu **jatuh ke default**
`✅ SPI Issued`. Default itu ditulis ketika setiap baris tabel pasti berisi
data — saat itu "tidak ada cabang revisi yang cocok" memang hanya bisa berarti
SPI biasa. Baris kosong mematahkan asumsi tersebut, dan tidak ada yang menjaga.

### Perbaikan
**`04-charts.js`** — `isUnconfigured(d)` (baru) dan gerbang di baris pertama
`statusBadge()` → badge **"Belum Dikonfigurasi"**.

Syaratnya ketat, harus **semua** terpenuhi: tanpa cycle, tanpa `spiRef` /
`revStatus` / `pertekNo` / `spiNo`, dan `obtained` maupun `submit1` tidak
positif. PT yang punya jejak apa pun tidak akan kena.

`statusBadge()` dipakai 5 tempat (tabel SPI, tabel utama, drawer, 2 drill), jadi
perbaikannya seragam di semua permukaan sekaligus.

**`style.css`** — kelas `.b-none`: abu-abu, garis putus-putus, **tanpa denyut**.
Sengaja: ini bukan keadaan yang menunggu tindakan, hanya baris master yang
belum dipakai.

---

## Ikutan — teks harfiah `null`

Kolom Group menampilkan kata **`null`** untuk ketujuh PT itu (terlihat di
tangkapan layar). Datanya memang null dan itu benar — yang salah hanya
penyajiannya; setiap nilai kosong lain di tabel ini memakai `—`.

**`05-tables-spi.js`** — 4 sel Group diberi fallback `—`. Tidak dilaporkan tim,
tapi cacat yang sama persis pada baris yang sama.

---

## Masalah 1b — SNSD muncul, tapi kolom Obtained-nya kosong

Sesudah `kpiPool()`, SNSD **muncul** di daftar — tapi kolom Obtained-nya `—`
dan total modal masih 34.840. Penyebab kedua, terpisah.

`getObtainedByProdAgg()` hanya membaca `utilizationByProd + availableByProd`
(dari `company_product_stats`). SNSD punya **keduanya kosong**: utilisasi kosong
karena kuotanya belum dipakai, available kosong karena master belum di-refresh.
Sementara `canonicalObtained()` membaca **cycles**, dan di sana ada
`Obtained #1 = {GI BORON: 120}`.

Jadi seluruh permukaan per-produk kehilangan kuota itu, sedangkan kartu KPI
tetap menghitungnya.

**Perbaikan (`01-data.js`)** — jalur cadangan: bila stats menghasilkan
**kosong sama sekali**, ambil produk dari `getCycleBreakdown(co,'obtained')`.
Fungsi itu menerapkan gerbang yang sama dengan `canonicalObtained()` (dedup per
jenis cycle, `mt > 0`, PERTEK/SPI sudah terbit), jadi jalur cadangan tidak bisa
memasukkan kuota yang justru dikecualikan angka utama. Bila stats ada isinya,
stats tetap yang berlaku — master menyimpan NET pasca-revisi per produk di
sana, cycles tidak.

Saat pengecekan, **SNSD satu-satunya** company dengan kondisi ini.

---

## TEMUAN BARU — belum diperbaiki, butuh master

Bukan bagian dari yang dilaporkan tim, ditemukan saat verifikasi.

Ringkasan **Obtained** di drill **Available Quota** memakai aturan yang
**lebih longgar** daripada KPI: ia menyapu semua cycle `/^obtained/i` tanpa
dedup per jenis dan tanpa gerbang "sudah terbit", sehingga ikut menghitung
`Obtained (Revision #N)` dan pemberian yang masih TBA.

Akibatnya modal itu menyebut Obtained **35.608 MT**, padahal kartunya 34.960.
(Angka Available-nya sendiri **benar** — 12.413, cocok.) Sudah dipastikan
**bawaan lama, bukan akibat perubahan hari ini**: SNSD tidak termasuk penyebab.

**Sengaja belum diperbaiki.** Memasang gerbang yang benar saja **tidak
menyelesaikannya** — hasilnya 34.510, masih meleset. Tersisa tiga company yang
rincian per-produknya tidak menjumlah ke total cycle-nya:

| Company | Kanonik | Jumlah rincian produk |
|---|---|---|
| ADP | 350 | 600 |
| GKL | 3.000 | 2.400 |
| HDP | 1.000 | 900 |

Ini pertanyaan **data**, bukan aturan — persis pola AADC/SGD: ketika sebuah
total tidak mau cocok, cari selnya dulu, jangan ubah aturannya. Ditunda sampai
master terbaru datang, lalu diselesaikan bersama rekonsiliasi.

## Verifikasi

- Sintaks: seluruh berkas JS lolos `node --check`
- **6 suite JS + 15 suite PHP — 0 FAIL**
- Live sesudah deploy: lihat bagian bawah

## Sisa / risiko

`kpiPool()` menambah PENDING ke tiga drill. PENDING dan SPI **disjoint**
(`loadData()` mendedup per `code` ke dua array terpisah), jadi tidak ada risiko
hitung ganda. Saat ini PENDING hanya berisi SNSD.
