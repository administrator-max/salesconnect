# [iqdash-utilisasi-per-siklus] 2026-08-05 — Utilisasi dipecah per siklus; Utilized tidak lagi melebihi Obtained

- **Tanggal:** 2026-08-05
- **Oleh:** Claude Code
- **Pemicu:** master baru `00 IQ Dash - Quota Data 050826` memecah
  `Utilization (MT)` menjadi **`Utilization #1/#2/#3`**, masing-masing dengan
  tanggal sendiri — menutup keterbatasan yang dilaporkan di
  `iqdash-audit-utilized-lebih-besar_2026-08-05`.

## Masalah yang diselesaikan

Master lama menyimpan **satu** tanggal per produk untuk angka **kumulatif**,
sehingga produk yang dipakai lintas tahun mendarat seluruhnya pada tanggal
terakhir. Filter 01 Jan – 05 Agu 2026 lalu melaporkan Utilized **21.500**
melebihi Obtained **21.140**.

Dengan rincian per siklus, angka itu menjadi **15.875**, dan **6.872 MT kembali
ke 2025** — tempatnya semula.

## Penyimpanan — tab BARU, bukan kolom tambahan

Tab `cycle_utilization`: `id · company_code · cycle_type · product · util_mt ·
util_date · source_program`. 53 baris, 22.747 MT.

**Sengaja tidak ditumpangkan ke `cycle_products`.** Setiap
`PATCH /api/company/:code/cycles` menulis ULANG seluruh baris `cycle_products`
milik company itu dengan id baru (`iq_build_cycles_replacement`), dan
pembangunnya hanya membaca `products`. Utilisasi yang dititipkan di sana akan
**terhapus diam-diam pada edit cycle berikutnya**. Kunci
(company_code, cycle_type, product) selamat dari penulisan ulang itu — id cycle
tidak stabil, jadi kunci berbasis `cycle_id` pun akan rapuh.

Diisi oleh `tools/seed_cycle_utilization.js` (baru; RAW, idempotent, punya mode
uji coba dan verifikasi baca-balik).

## Perubahan kode

**`iqdash_data.php`** — membaca tab baru dan melampirkan `utilCycles`
(`{cycle, product, mt, date}`) ke tiap company.

**`01-data.js`** — `allTimeUtil(co)` (baru): utilisasi sepanjang waktu dijumlah
dari `utilCycles` bila ada. Ini yang **menjamin sifat partisi** — irisan periode
mana pun berjumlah tepat sama dengan angka sepanjang waktu. Membacanya dari
`co.utilizationMT` yang tersimpan terpisah membuka celah keduanya bergeser,
persis kelas bug yang sudah dua kali dibereskan. `cumulativeAvailable()`
memakainya.

**`02-period-filter.js`** — `scopedUtilByProd()` menjadikan `utilCycles`
**sumber utama**; `etaByProd` + lot hanya untuk company yang belum punya
rincian. `scopedUtilTotal()` memakai `allTimeUtil()` untuk All Time.

## Koreksi data

**AADC** — dikonfirmasi pemilik data: MOI 2 Feb · **PERTEK 14 Apr** · MOT 1 Jul ·
SPI 16 Jul 2026. Perubahan 2026-08-04 (PERTEK → 1 Juli) **dibatalkan**: 1 Juli
ternyata tanggal **MOT**, bukan PERTEK. Bukti pendukung: utilisasi AADC 28 April
— kuota tidak mungkin terpakai sebelum PERTEK terbit. Akibatnya **Obtained H1
menjadi 19.860**, bukan 19.710 yang sempat ditetapkan final.
Cadangan: `backups/aadc-cycles-sebelum-koreksi-pertek_2026-08-05.json`.

**Sel bertanggal ganda** — dipecah sesuai keterangan pemilik data:

| | Pecahan |
|---|---|
| GKL · GI ALLOY | 1.000 MT @ 29/12/2025 + 100 MT @ 31/03/2026 |
| KJK · GL ALLOY | 550 MT @ 20/11/2025 + 400 MT @ 01/12/2025 |

## Pemetaan — eksplisit, bukan pencocokan samar

Salah pasang produk berarti MT pindah tanpa jejak, jadi keempatnya dipetakan
manual: `BORDES ALLOY (Wear plate)`→`BORDES ALLOY`, `SEAMLESS`→`SEAMLESS PIPE`,
`ERW PIPE OD ≤ 140 mm`→`ERW PIPE (OD ≤ 140 mm)`, `ERW PIPE OD > 140 mm`→
`ERW PIPE (OD > 140mm)`. Kode `AMP (SUJU)`→`AMP` (SUJU PT terpisah yang belum
dikonfigurasi; 800 MT cocok dengan obtained AMP). Skrip **berhenti** bila ada
satu pun yang tak terpetakan — tidak menebak.

## Verifikasi terhadap master

| Periode | Submitted | Obtained | Utilized | |
|---|---|---|---|---|
| Sepanjang waktu | 277.545 | 34.960 | 22.747 | ✅ ketiganya |
| 2025 | 197.000 | 13.820 | 6.872 | ✅ ketiganya |
| 2026 | 80.545 | 21.140 | 15.875 | ✅ ketiganya |
| 1 Jan – 30 Jun 26 | 74.945 | 19.860 | 12.525 | ✅ |
| **1 Jan – 05 Agu 26** | 80.545 | **21.140** | **15.875** | ✅ tidak lagi terbalik |

**Sifat partisi utuh:** H1 + H2 = setahun penuh, persis, untuk ketiganya.

Available sepanjang waktu **12.213** (34.960 − 22.747), naik-turun konsisten
dengan utilisasi baru. Ketiga menu (Overview · U&R · Available Quota) menampilkan
angka identik di kedua filter yang diuji.

Kartu Utilized kini `75,1% of obtained allocated` — keterangan "incl.
carry-over" tidak lagi muncul karena rasionya memang di bawah 100%.

- Seluruh JS lolos `node --check`, PHP lolos `php -l`
- **7 suite JS + 15 suite PHP — 0 gagal**

## SISA PEKERJAAN — penting

**Import Master di UI belum mengenali label baru.** `21-master-import.js` masih
mencocokkan `^Utilization \(MT\)$` dan memperlakukan utilisasi sebagai
**read-only** (diturunkan dari lot). Kalau master baru diunggah lewat tombol
Import Master sekarang, **utilisasinya terbaca nol** dan tidak akan tertulis.

Pengisian kali ini dilakukan lewat `tools/seed_cycle_utilization.js`. Sampai
importer diperbarui, setiap master baru harus diproses lewat skrip itu.

Perlu dikerjakan berikutnya: parser mengenali `Utilization #N (MT)/(date)`,
menulis ke `cycle_utilization`, dan menangani sel bertanggal ganda (ditolak
dengan pesan jelas, bukan ditebak).

Catatan kecil: master menulis `"28 Jul26"` (kurang spasi) untuk ADP dan MSN.
Terbaca oleh ekstraktor, tapi sebaiknya dirapikan di master.
