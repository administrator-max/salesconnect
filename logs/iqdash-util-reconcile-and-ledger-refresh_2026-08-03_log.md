# [iqdash-util-reconcile-and-ledger-refresh] 2026-08-03 — Endpoint realisasi pulih, utilisasi berhenti dihitung ganda, ledger disegarkan dari master

- **Tanggal:** 2026-08-03
- **Oleh:** Claude Code
- **Pemicu:** perbandingan dashboard vs dua workbook manual milik user
  (`00 IQ Dash - Quota Data 120526 (dashboard master data).xlsx` dan
  `REALISASI IMPORT PERIODE SPI 2026 (trian).xlsx`)

## Ringkasan
Tiga perbaikan berurutan pada modul `iqdash`, masing-masing diverifikasi ke
produksi sebelum lanjut:

1. **`/api/realizations` (+ `/summary`, `/insights/realization`) mati 500 selama
   ~7 hari** — `iqdash_util.php` di host tertinggal dari commit `5265fd3`
   (27 Jul) yang memindahkan `iq_dedupe_realizations()` ke sana. Re-upload satu
   file memulihkan ketiganya.
2. **Utilisasi dihitung ganda** — `iq_apply_ledger()` menjumlahkan util ledger
   dengan util lot, padahal keduanya menyatakan total yang sama. Diganti jadi
   rekonsiliasi `max()`.
3. **Ledger disegarkan** dari master 3 Agustus lewat generator baru versi Node.

Dashboard kini: obtained **34.840** (= master), utilized **22.550**
(master 22.547 — sisa 3 MT dijelaskan di bawah), available **12.290**.

## Backup (dibuat sebelum perubahan apa pun)
`backups/2026-08-03T10-17-50-481Z/` — 20 tab IQ Dash + 5 modul lain, snapshot
`/api/data`, ledger, kedua workbook sumber, commit git, status tiap endpoint,
plus `ROLLBACK.md`. Seluruhnya READ-ONLY.
`tools/backup_sheets.js` **tidak memuat `iqdash`** sama sekali sebelum ini —
spreadsheet modul ini tak pernah ikut ter-backup. Sudah ditambahkan.
Ledger lama juga disalin ke `backups/quotaLedger_before_regen_2026-08-03.json`.

## 1. Endpoint realisasi 500

`GET /api/realizations` → `{"error":"Call to undefined function
iq_dedupe_realizations()"}`. Fungsinya ADA di repo (`iqdash_util.php:240`) tapi
tidak ada di file yang dijalankan host: `iqdash_write.php` di produksi sudah
versi baru (memanggilnya) sementara `iqdash_util.php` masih versi lama
(belum mendefinisikannya) — deploy 31 Juli mengklaim mengirim keduanya, tapi
hasilnya tidak demikian.

Dampaknya senyap: `loadRealizationSummary()` menelan error (`if (!res.ok)
return;`), jadi tombol "Detail Realization" hanya tidak pernah muncul, tanpa
pesan apa pun.

**Perbaikan:** `./deploy.sh iqdash/iqdash_util.php`. Verifikasi sesudahnya —
204 baris dikembalikan (dari 345 mentah; dedupe bekerja), total 15.438,208 MT,
24 company, dan `summary` mencocokkan jumlah baris Excel per company
(GKL 8 PIB/73 baris, BTS 3/23).

## 2. Utilisasi dihitung ganda — `iqdash_data.php`

```php
- $u = min($o, $ledgerU + $lotU);
+ $u = min($o, max($ledgerU, $lotU));
```

Util ledger adalah baris `Utilization (MT)` master saat regen; lot menyatakan
ulang sebagian angka yang sama dengan rincian per-lot. Menjumlahkannya
menghitung irisannya dua kali. Docblock lama sadar risiko ini dan mengandalkan
clamp `min(obtained, …)` — yang hanya menyelamatkan selama `ledgerUtil ==
obtained`.

**IKM** adalah company pertama yang berutilisasi PARSIAL (obtained 4.150 /
util 2.300 / lot 2.000): `2.300 + 2.000` di-clamp ke 4.150, sehingga dashboard
membaca 100% terpakai dan available 0, melawan master yang menulis available
1.850. Dikonfirmasi user: "terutilisasi 2.000 ton, kemudian ada tambahan 300
ton pada 24 Juli 2026, sehingga total 2.300" — bukan 2.000 + 2.300.

Delapan lot ber-`util_mt > 0` semuanya berpola sama (lot ⊆ ledger): BDG 350/350,
SMS 150/150, BHG 150/150, SPA 400/401, HKG 250/1000, JKT 100/400, MIN 250/247,
IKM 2000/2300. Hanya IKM yang terlihat salah; tujuh sisanya kebetulan ter-clamp
ke angka benar — bug laten.

Disimulasikan atas SELURUH company sebelum diterapkan: formula lama menghasilkan
24.397 (= angka live saat itu, membuktikan simulasinya setia), kandidat `max()`
menghasilkan 22.547 = **persis kolom Utilization master**. Hanya satu baris
berubah.

## 3. Ledger disegarkan — `tools/build_quota_ledger.js` (BARU)

Generator Python yang ada butuh `openpyxl`; mesin ini tak punya Python asli
(`python.exe` hanya stub WindowsApps). Dibuat port Node yang memakai SheetJS
yang sudah ter-vendor, model identik dengan versi Python.

**Port dibuktikan lebih dulu** lewat `--check` terhadap ledger yang sedang
aktif: 33 company / 12 produk (sama), total mendarat persis di angka master,
dan hanya **3** ketidakcocokan per-(company,HS) — semuanya bisa dijelaskan dari
suntingan master, bukan dari generatornya:

| Perubahan | Keterangan |
|---|---|
| GKL `7225.99.90` obtained 0 → **600** | Obtained #2 di master (Submit MOT 3-Ags-26, SPI masih TBA). Disetujui user: "ikut Excel". |
| MIN `7225.40.90` obtained 247 → **600** | split 247/353,3 hilang dari master |
| MIN `7225.92.90` obtained 353,3 → **0** | idem — sekaligus memensiunkan residu 0,3 |

Nama produk kurasi dipertahankan (`--names-from`): 12 tetap, 0 rename.

### Catatan MIN — perlu dikonfirmasi CorpSec
Split MIN **nyata dan resmi** di Sheets: `revision_changes` mencatat BORDES 600
→ BORDES 247 + GI BORON 353, dan cycle-nya berstatus "✅ Dikonfirmasi oleh
CorpSec · 29 Apr 2026". **Tetapi** `Obtained #2` masih `spi_date: TBA` dan
`Revision #1` masih "Menunggu Disposisi Kasi" — SPI Perubahan belum terbit.
Master yang menulis MIN sebagai BORDES 600 utuh konsisten dengan filosofi gate
modul ini (split baru berlaku setelah tanggal terbit diisi), jadi regen
mengikuti master. MT tingkat company tidak berubah (600 / 247 / 353); yang
bergeser hanya atribusi produk 353 MT dari GI ALLOY ke BORDES ALLOY di chart
per-produk.

Kalau CorpSec menyatakan split-nya sudah berlaku: pulihkan
`backups/quotaLedger_before_regen_2026-08-03.json` dan kembalikan tiga
assertion paritas di `test_ledger.php`.

## File yang disentuh
- `iqdash/iqdash_data.php` — `iq_apply_ledger()`: `+` → `max()`, docblock formula
- `iqdash/data/quotaLedger.json` — dibangkitkan ulang dari master 3 Agustus
- `tools/build_quota_ledger.js` — **baru**, port Node dari generator Python
- `tools/backup_sheets.js` — tambah spreadsheet `iqdash` (sebelumnya tak ikut)
- `iqdash/tests/test_ledger.php` — tes rekonsiliasi + regresi IKM; paritas
  dinaikkan ke 34.840 / 22.547 / 12.293
- `iqdash/assets/js/21-master-import.js` — **diselamatkan dari server** (lihat bawah)
- `iqdash/assets/index.html` — tombol + modal + script tag Import Master
- `backups/…` — backup + `ROLLBACK.md` + salinan ledger lama

## Penyelamatan `21-master-import.js`
Produksi menjalankan fitur **Import Master** (34 KB) yang **tidak ada di git
mana pun** (`git log --all` kosong) dan tak punya file log. `index.html` di repo
juga tak memuat tombol/script-tag-nya — sekali ada yang men-deploy `index.html`
dari repo, fiturnya mati diam-diam dan satu-satunya salinan (di FTP) ikut
berisiko hilang.

File diunduh dari host ke repo dan `index.html` disisipi tombol, modal, serta
script tag-nya. Diverifikasi: repo dan produksi kini **1518 baris, nol beda**
(setelah menormalkan `?v=` dan injeksi Cloudflare). Tidak perlu deploy — host
sudah punya isinya; ini murni penyelamatan version control.

## Verifikasi
- **PHP: 345 assertion, 0 gagal** (13 file `test_*.php`).
- **JS: 5 suite, 0 gagal** (`test_mt_format`, `test_period_boundary`,
  `test_period_dates`, `test_ra_waves`, `test_util_date_required`).
- `php -l` bersih; `node --check` bersih untuk file yang diselamatkan.
- Live sesudah tiap deploy: `/api/realizations` 500 → **200** (204 baris /
  15.438,208 MT); utilisasi 24.397 → **22.547**; obtained 34.240,3 → **34.840**.
- IKM live: util **2.300**, available **5.700** (GI 1.850 + SHEET PILE 1.750 +
  SEAMLESS 2.100) — cocok baris Available master.

### ⚠ Kewaspadaan harness tes
`ok()` mencetak `FAIL` tapi **proses tetap exit 0**. Sempat membuat suite
terbaca "13 lulus" padahal dua assertion gagal. Selama harness belum
diperbaiki, hitung baris `FAIL` — jangan percaya exit code:
```
php iqdash/tests/test_ledger.php | grep -c '^FAIL'
```

## Sisa / risiko
- **MIN utilisasi 250 vs master 247 (selisih 3 MT).** Lot MIN/BORDES menyimpan
  `util_mt = 250` (`real_mt = 246,7`), master menulis 247. Selama obtained MIN
  masih 247 selisih ini tertutup clamp; begitu regen menaikkannya ke 600, lot
  yang menang. Inilah satu-satunya sisa selisih total (22.550 vs 22.547).
  Perbaikannya satu sel: samakan `util_mt` lot itu ke 247. **Belum dikerjakan** —
  perlu keputusan apakah 250 (dialokasikan) atau 247 (master) yang benar.
- **Tujuh lot laten lain** (BDG, SMS, BHG, SPA, HKG, JKT) akan memunculkan
  selisih serupa bila obtained produknya berubah. Sebaiknya lot disamakan ke
  master saat regen berikutnya.
- **SPP tak punya sheet di workbook realisasi** padahal sistem memegang 3 baris
  PIB / 249,35 MT untuknya — yang kurang justru Excel-nya.
- **Kenapa `iqdash_util.php` bisa tertinggal** belum terjawab. Deploy 31 Juli
  mengklaim mengirimnya. Layak dicurigai opcache PHP host atau kegagalan senyap;
  sampai jelas, verifikasi deploy dengan memanggil endpoint yang memakai fungsi
  BARU-nya, bukan sekadar mencocokkan ukuran byte.
- **Ledger tetap membeku sampai di-regen.** Selama itu, menulis lewat aplikasi
  atau ke Sheets tak akan menggerakkan obtained/available.
- Belum dikerjakan dari daftar perbaikan: 5 Submit cycle (14.520 MT) dan 12
  cycle bertanggal rusak.
