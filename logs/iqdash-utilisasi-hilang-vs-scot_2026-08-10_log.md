# [iqdash-utilisasi-hilang-vs-scot] 2026-08-10 — 275 MT utilisasi terbuang diam-diam; selisih IQ Dash vs SCOT dibedah

- **Tanggal:** 2026-08-10
- **Oleh:** Claude Code
- **Pemicu:** laporan tim — angka **Total Pending Shipment** di IQ Dash
  (8.009 MT) tidak sama dengan **Total Tonnage** In Progress di SCOT
  (7.573,4 MT).

## Ringkasan

Selisihnya dibedah per company sampai habis (435,410 MT). Satu di antaranya
**bug**: IKM SEAMLESS PIPE **275 MT** yang tercatat terpakai di master dibuang
diam-diam oleh dua lapis kode, sehingga IQ menampilkan 275 MT kuota terpakai
itu **sebagai masih tersedia**. Sisanya bukan bug — sebagiannya data yang belum
diinput di SCOT, sebagiannya memang beda definisi. Rinciannya di bawah.

## Bedah selisih (sebelum perbaikan)

Pending Shipment IQ dihitung per company (utilisasi − realisasi PIB), lalu
dibandingkan dengan tonase shipment aktif SCOT milik company yang sama:

| Sebab | MT | Bug? |
|---|---:|---|
| **IKM SEAMLESS PIPE** — utilisasi 275 MT hilang dari IQ | **−275,000** | **ya → diperbaiki** |
| **GKL GL ALLOY** — kuota dipakai 05/08/2026 (ETA JKT 31/10/2026), belum ada barisnya di SCOT | +600,000 | tidak — data SCOT |
| **BTS Wear Plate** — 2 kontrak (Fine Steel #01, Transcoal Minergy #01) yang produknya tidak ada di master kuota IQ | −103,334 | tidak — perlu konfirmasi |
| **Sisa kuota** — kuota dialokasikan bulat (mis. 500) tapi berat PIB sebenarnya lebih ringan (483,934) | +213,744 | tidak — melekat |
| **TOTAL** | **+435,410** | |

Kuncinya: keduanya **memang mengukur hal berbeda**. IQ menghitung *kuota* yang
sudah dipakai tapi belum ada PIB-nya; SCOT menghitung *tonase fisik* shipment
yang belum Done — termasuk kargo di luar kuota impor, dan belum termasuk kuota
yang belum jadi kontrak. Keduanya tidak akan pernah identik. Yang bisa dijamin
adalah **tidak ada selisih yang tak bisa dijelaskan** — dan itu yang sekarang
berlaku.

## Bug-nya: 275 MT terpakai ditawarkan lagi sebagai tersedia

Master (`company_product_stats`) mencatat IKM SEAMLESS PIPE **275 terpakai /
1.825 sisa** — cocok dengan kontrak **Arsen SSP #50 (275 MT)** di SCOT. Payload
IQ mengeluarkan **0 terpakai / 2.100 sisa**. Dua lapis membuangnya, keduanya
karena aturan "sumber yang lebih baru menang" tanpa sengaja berlaku **per
company**, bukan **per produk**:

1. **`iq_apply_ledger()`** — `quotaLedger.json` itu **snapshot beku** (regen
   terakhir 03/08/2026). Ia direkonsiliasi dengan lot (`max(ledger, lot)`)
   supaya pemakaian yang diinput SESUDAH regen tetap terbaca — tapi kolom
   `company_product_stats`, yang justru ditulis aplikasi tiap kali tim
   menyimpan, tidak ikut. Ledger 0 + lot 0 → 0, stats 275 diabaikan.
2. **`iq_sync_util_with_cycles()`** — begitu SATU produk punya rincian siklus,
   produk lain milik company yang sama yang **tidak disebut siklus mana pun**
   ikut dinolkan. Padahal aturan yang sudah ada di fungsi itu sendiri berbunyi
   "mengisi kekosongan bukan membantah master" (dipakai untuk lot bertanggal,
   2026-08-07) — tinggal diberlakukan juga untuk kolom stats.

Efeknya bukan cuma angka kurang: **275 MT kuota yang sudah berkontrak
ditampilkan sebagai tersedia**, dan halaman Available Quota siap menawarkannya
lagi.

## Perubahan

**`iqdash/iqdash_data.php`**
- `iq_apply_ledger()` — parameter baru `$aliasMap`; utilisasi versi stats ikut
  direkonsiliasi: `min($o, max($ledgerU, $lotU, $statU))`. Tetap `max()`, bukan
  jumlah — ketiganya mengaku sebagai TOTAL produk yang sama. Batas `obtained`
  tidak berubah.
- `iq_sync_util_with_cycles()` — produk yang siklus maupun lot bertanggal tidak
  sebut sama sekali kini mempertahankan nilai stats, tidak lagi dinolkan.
  Di mana siklus bicara, siklus tetap menang.

**`iqdash/assets/js/02-period-filter.js`**
- `scopedUtilByProd()` — cabang `utilCycles` mendapat aturan yang sama, supaya
  irisan periode tidak berbeda definisi dengan server. Bertanggal lewat
  `etaByProd`; tanpa tanggal ia hanya muncul saat filter mati (menebak
  tanggalnya akan merusak sifat partisi yang dijaga seluruh berkas itu).

**Tes baru**
- `iqdash/tests/test_util_stats_master_diam.php` — 11 assertion (sisi server).
- `iqdash/tests/test_util_stats_master_diam.cjs` — 8 assertion (sisi periode).

## Verifikasi

Dijalankan atas data produksi (snapshot 10/08/2026):

| | Sebelum | Sesudah |
|---|---:|---:|
| Total Utilized | 23.447 | **23.722** |
| Total Realized | 15.438,208 | 15.438,208 |
| Pending Shipment | 8.008,792 | **8.283,792** |
| Available (payload) | 11.393 | **11.118** |
| IKM utilisasi | 2.300 | **2.575** |
| IKM SEAMLESS PIPE sisa | 2.100 | **1.825** |

**Hanya IKM yang bergeser** — total naik persis 275,000, tidak satu company pun
lain ikut berubah. Angka IKM sekarang **sama persis dengan SCOT** (2.575 =
2.000 Arsen 62 + 300 Kewei 68A + 275 Arsen SSP #50).

Suite: seluruh tes iqdash (13 PHP + 12 Node) lulus, termasuk `test_ledger.php`
yang mengunci paritas ledger 34.840 / 22.547 / 12.293 dan
`test_util_source_lot_vs_master.cjs` yang mengunci sifat partisi.

Catatan: dua assertion "live" di `test_router_insights.php` sempat gagal karena
**rate limit Sheets 429** (probing analisis ini memakan kuota baca), bukan
karena perubahan — lulus lagi setelah kuota pulih.

## Sisa / perlu tindakan tim

1. **SCOT — GKL 600 MT (GL ALLOY).** IQ mencatat kuota dipakai 05/08/2026
   dengan ETA JKT 31/10/2026, tapi SCOT tidak punya baris aktif untuk GKL.
   Kalau kontraknya sudah ada, inputkan; kalau belum, biarkan — nanti hilang
   sendiri saat shipment-nya masuk.
2. **BTS Wear Plate 103,334 MT** (Fine Steel #01 50,586 + Transcoal Minergy #01
   52,748). Produk "Wear Plate" tidak ada di master produk IQ. Perlu dipastikan:
   impor ini kena kuota (berarti produknya harus didaftarkan di IQ) atau tidak
   (berarti wajar ia hanya ada di SCOT).
3. **IKM SEAMLESS PIPE — tanggal utilisasi kosong.** 275 MT-nya sekarang masuk
   total All Time, tapi tidak bisa ditempatkan di periode mana pun karena tidak
   ada tanggalnya. Isi tanggal pemakaiannya (lewat lot Sales atau baris
   Utilization) supaya All Time = jumlah irisan periodenya lagi.
4. **Sisa kuota ±214 MT** (selisih alokasi bulat vs berat PIB sebenarnya) akan
   selalu ada di kartu Pending Shipment. Kalau tim mau kartu itu benar-benar
   berarti "sedang di jalan", sisa itu perlu ditutup/di-nol-kan per produk saat
   shipment terakhirnya tiba — keputusan pemilik data, bukan kode.
