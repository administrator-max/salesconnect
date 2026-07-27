# [ra-multi-arrival] 2026-07-27 — Satu baris per kedatangan + isi arrival_date dari dokumen sumber

## Ringkasan
Mengisi `ra_records.arrival_date` yang kosong untuk **14 perusahaan** dari workbook sumber
`REALISASI IMPORT 2026 - REV (1)` (41 file), dan mengubah model data menjadi **satu baris per
kedatangan** — keputusan user: *"record keduanya, karena pengiriman bisa beberapa kali"*.
Perubahan model itu memaksa tiga perbaikan kode.

Sebelumnya **7.738,5 MT dari 14 perusahaan tak terlihat di semua tampilan periode** karena
`arrival_date` kosong (lihat `fix-arrival-date-and-util-pool_2026-07-27_log.md`).

## Data yang ditulis (tab `ra_records`, 23 → 26 baris)

**11 baris di-update** (satu kedatangan): ADP 13/05, BBB 09/04, BHG 27/04, EMS 30/03, JKT 13/05,
LCP 13/05, LSJ 19/05, MSN 13/05, SJH 02/04, SPA 06/03, SPP 19/06 — semuanya 2026.

**2 perusahaan dipecah jadi dua gelombang** (bobot dari workbook, jumlahnya sama persis dengan
berat lama):

| | Gelombang 1 | Gelombang 2 | Total |
|---|---|---|---|
| AMP | 2026-04-09 · 399,178 (KEWEI 65B) | 2026-04-27 · 399,942 (SSSC 12A) | 799,120 ✓ |
| SGD | 2026-03-30 · 1.507,536 (MLION #9) | 2026-04-24 · 488,562 (MLION #10) | 1.996,098 ✓ |

**1 baris baru**: BDG — GL BORON, 649,58 MT, 2026-06-29 (ARSEN 56A). Sebelumnya tidak punya baris
`ra_records` sama sekali meski punya realisasi.

Format ditulis `YYYY-MM-DD` polos, **bukan** bentuk ISO+offset (`2026-02-22T17:00:00.000Z`) yang
dipakai baris lama — bentuk itulah yang menggeser tanggal satu hari.

## Temuan sampingan: sistem meleset satu hari
Lima perusahaan tercatat **satu hari lebih awal** di tab `realizations` dibanding dokumen sumber:
ADP, JKT, LCP, MSN (12/05 vs 13/05) dan LSJ (18/05 vs 19/05). Polanya searah — ciri pergeseran zona
waktu saat impor. Nilai yang ditulis di sini memakai **dokumen sumber**.
`realizations.pib_date` (345 baris) **belum** dikoreksi — pekerjaan terpisah.

## Perubahan kode yang dipaksa oleh model baru

### `iqdash/assets/js/01-data.js` — `getRA()`
`RA.find(r => r.code === c)` mengembalikan baris pertama menurut urutan sheet dan menyembunyikan
gelombang lain. Kini mengembalikan **kedatangan terakhir** (deterministik, mewakili keadaan
terkini). Pemanggil yang butuh semua gelombang harus memfilter `RA` sendiri.

### `iqdash/assets/js/03-kpis.js` + `09-nav-import.js` — hitungan
`realizedCount = arrivedRa.length` berlabel **"Companies with utilization"** tetapi menghitung
**baris**. Dengan dua baris per perusahaan angkanya menggelembung. Kini menghitung kode unik.
Daftar `arrivedCodes` juga di-dedup.

### `iqdash/iqdash_data.php` — derivasi `berat`
Ini yang paling berbahaya. Baris 445 mengindeks RA per kode (**baris terakhir menang**) lalu
menimpa `berat`-nya dengan total PIB **seluruh perusahaan**. Dengan satu baris per perusahaan itu
benar; dengan dua baris, AMP menjadi `399,178 + 799,12` — ganda.

Terdeteksi saat verifikasi: Realized H1 sempat terbaca **17.344,9 MT** (menggelembung ~1,9 ribu MT).
Kini override hanya berlaku bila perusahaan punya **tepat satu** baris; bila lebih, bobot per
gelombang dari dokumen sumber yang dipakai dan hanya status `cargoArrived` yang ditegakkan.

## Verifikasi
- Dry-run dulu, baru `--apply`. Backup: `backups/iqdash_ra_records_before_arrival_fill_2026-07-27.json`.
- **Baris `cargo_arrived=TRUE` tanpa `arrival_date`: 14 → 0.**
- Sheet mentah dicek ulang: id 24 AMP 399,942 · id 25 SGD 488,562 · id 26 BDG 649,58.
- `getRA()` mengambil gelombang terakhir: AMP → 2026-04-27, SGD → 2026-04-24.
- Realized H1: **7.699,7 → 15.438,2 MT** (26 baris, **24 perusahaan** — bukan 26).
- 13 suite PHP lulus, nol regresi. `php -l` bersih.

## Risiko / sisa pekerjaan
- **BDG `obtained` diisi 350** (nilai ledger) sementara realisasinya 649,58 MT → realisasi >100%.
  Itu gejala kategori C yang belum selesai (BDG/GL util 650 vs obtained 350), bukan salah ketik.
  Sengaja tidak "dirapikan".
- `realizations.pib_date` yang meleset satu hari belum dikoreksi (345 baris).
- Tab lain yang ber-kunci produk/perusahaan belum diperiksa untuk asumsi "satu baris per
  perusahaan" yang sama.
