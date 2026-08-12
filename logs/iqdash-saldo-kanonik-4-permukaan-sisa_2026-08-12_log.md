# [iqdash-saldo-kanonik-4-permukaan-sisa] 2026-08-12 — 4 permukaan terakhir ikut saldo kanonik

- **Tanggal:** 2026-08-12
- **Oleh:** Claude Code
- **Pemicu:** tindak lanjut [iqdash-available-quota-satu-angka](iqdash-available-quota-satu-angka_2026-08-12_log.md).
  Perbaikan itu menyatukan enam permukaan halaman Available Quota, dan
  mencatat empat berkas yang masih membaca kolom saldo mentah tapi di luar
  cakupan laporan tim Sales. Diminta dirapikan sekalian.

## Yang diperbaiki

| Berkas | Sebelum | Risikonya |
|---|---|---|
| `07-tables-main.js` | periode aktif: `d.obtained` (ALL-TIME) − utilisasi PERIODE. Tanpa periode: `d.availableQuota` mentah | kolom Available tabel All Companies bisa beda dari kartu untuk company yang sama |
| `08-drawer.js` | mencetak `co.availableQuota` mentah | drawer yang dibuka Sales SEBELUM menjual bisa menampilkan saldo tertinggal |
| `17-ou-chart.js` | `scopedAvailByProd()` (saldo PERIODE), cadangan `obtMT − utilMT` (campur basis) | sisa per produk beda dari halaman Available Quota |
| `18-sales-priority.js` | `co.availableByProd` / `co.availableQuota` mentah | **paling berbahaya** — sisa MEN-GATE apakah produk muncul sebagai peluang jual |

Ketiga penyimpangannya sama persis dengan yang dilaporkan tim Sales:
**mencampur basis** (obtained all-time − utilisasi periode) dan **membaca kolom
stats mentah** yang tidak ikut diperbarui saat utilisasi bertambah — kolom yang
sama yang membuat form Sales ADP menulis "sisa 100 MT" padahal kuotanya sudah
habis 350/350 (2026-08-10).

Keempatnya kini memakai helper kanonik: `cumulativeAvailable()`,
`cumulativeAvailByProd()`, dan `cumulativeAvailForProd()`.

### Dua perbaikan susulan di helper bersama

**`cumulativeAvailForProd(co, prod)` — baru.** Ada supaya pemanggil berhenti
menulis pola `peta[prod] != null ? peta[prod] : Math.max(0, obt - util)`. Pola
itu terlihat tak berbahaya, tapi `obt` di sisi pemanggil hampir selalu ALL-TIME
sementara `util`-nya period-scoped — dan campuran itulah yang melahirkan angka
Available ketiga pada laporan tim. Sekalian menoleransi beda ejaan produk
(ledger `GI ALLOY` vs stats `GI BORON`) karena pemanggilnya datang dari peta
yang berbeda-beda.

**Cadangan tanpa-stats di `cumulativeAvailByProd()` diperbaiki.** Versi kemarin
menaruh SELURUH saldo di produk PERTAMA saja ketika company belum punya
company_product_stats. Pemanggil yang menyusuri `getObtainedByProd()` — yang
cadangannya membagi RATA ke seluruh `co.products` — lalu mendapat 0 untuk produk
kedua dan seterusnya. Di Sales Priority angka 0 berarti "tidak ada yang bisa
dijual", jadi produknya **hilang dari daftar peluang**. Kedua cadangan itu kini
membagi rata dengan cara yang sama. Cadangan yang tidak sinkron persis cara bug
ini lahir berkali-kali.

### Satu ketidaksesuaian lagi yang ketemu sambil jalan

Baris PENDING di tabel All Companies dipaku `obtained:0 / availMT:0`. Itu benar
untuk company yang memang belum dapat apa-apa, tapi PENDING juga memuat company
yang PERTEK-nya SUDAH terbit — **SNSD, Obtained #1 = 120 MT, PERTEK
04/08/2026**. Kartu dan halaman Available Quota menghitungnya (`kpiPool()` =
SPI + PENDING); tabel ini menuliskannya nol. Kini memakai helper kanonik, dan
company PENDING yang benar-benar belum terbit tetap keluar 0.

## Dampak nyata di data produksi

Diukur kode HEAD vs kode baru atas `cache/iqdash_data.json`:

| Permukaan | All Time | H1 2026 | Q3 2026 |
|---|---|---|---|
| 07 tabel All Companies | 1 dari 41 berubah | **13 dari 27** | **18 dari 21** |
| 17 OU chart (sisa/produk) | 0 dari 47 | **10 dari 37** | **7 dari 30** |
| 18 Sales Priority | daftar **identik** | daftar **identik** | daftar **identik** |

Polanya sama dengan pelajaran 2026-08-05: **tanpa filter periode hampir tidak
ada yang berubah** (setiap salinan runtuh ke nilai yang sama), penyimpangannya
baru muncul begitu periode aktif. Itu sebabnya ini bisa bertahan lama.

Contoh koreksi H1 2026 di tabel All Companies — semuanya ke arah yang benar,
menyamai halaman Available Quota:

```
ADP  350 -> 0     kuotanya memang sudah habis (dipakai 2025, di luar jendela H1)
HKG 1000 -> 0     idem
IKM 8000 -> 5425  2.575 MT sudah terpakai
GNG  450 -> 200
MIN  600 -> 353
```

Angka lama muncul karena `d.obtained` ALL-TIME dikurangi utilisasi PERIODE:
company yang memakai kuotanya di 2025 tampil seolah seluruh kuotanya masih utuh
sepanjang H1 2026.

**Sales Priority tidak berubah sama sekali** di ketiga periode — kolom stats
kebetulan masih cocok dengan angka kanonik hari ini. Jadi daftar "2 High /
6 Medium · top pick DIOR – Bordes Alloy" yang dikutip di laporan H1 BOD **tetap
sama**. Ini bukan koreksi angka melainkan menutup celah: begitu kolom itu
tertinggal lagi (dan sudah pernah), Sales tidak akan lagi ditawari kuota yang
sudah habis.

## Catatan basis

`17-ou-chart.js` menampilkan Obtained (all-time), Utilized (periode) dan
Remaining (kini kumulatif) berdampingan, jadi `Obtained − Utilized ≠ Remaining`
selama filter aktif — sama seperti kartu di halaman Available Quota. Sebelumnya
juga tidak pernah rekonsiliasi, hanya tidak ada yang menuliskannya. Tile
"Remaining" kini menyebut "saldo kumulatif" plus tooltip basisnya saat periode
aktif.

## Verifikasi

`test_avq_single_source.cjs` diperluas: keempat berkas dicek per-fungsi
(`renderMain`, `buildOUData`, `buildSalesPriorityData`, `buildExcludedList`)
tidak boleh lagi menyebut `availableByProd` mentah atau `scopedAvailByProd`, dan
wajib memakai helper kanonik; drawer dicek tidak lagi mencetak
`co.availableQuota`. Ditambah tes nilai untuk `cumulativeAvailForProd` (produk
asing → 0, bukan NaN) dan untuk cadangan tanpa-stats (dibagi ke SEMUA produk,
Σ tetap = saldo company).

**85 assertion di suite ini, 28 suite lulus, 0 gagal** (14 node + 14 PHP).

## Sisa

Tidak ada lagi pembaca `availableByProd` / `availableQuota` mentah sebagai
sumber saldo. Yang tersisa hanya plumbing yang memang seharusnya:
`08-drawer.js` menyalin field payload dari server setelah refresh, dan
`11-shipment.js` / `21-master-import.js` MENULIS kolom itu.
