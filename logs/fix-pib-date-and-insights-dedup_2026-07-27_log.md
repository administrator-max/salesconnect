# [fix-pib-date-and-insights-dedup] 2026-07-27 — Koreksi 8 tanggal PIB + insights ikut dedup

## Ringkasan
Menutup sisa pekerjaan `deploy-iqdash-correctness`: `realizations.pib_date` yang meleset satu hari.
Penelusuran ke dokumen sumber mengubah pemahaman soal ruang lingkup **dan** penyebabnya, lalu
membuka satu bug hidup yang belum diketahui di `iqdash_insights.php`.

## Yang ternyata tidak benar dari catatan sebelumnya

**"345 baris".** 345 itu ukuran tab, bukan jumlah baris yang salah. Yang benar-benar sampai ke
produksi dengan tanggal salah: **8 baris**.

**"pergeseran zona waktu".** Dugaan lama: nilai tersimpan sebagai ISO+offset
(`2026-05-12T17:00:00.000Z` = 13 Mei di WIB) sehingga hanya *terbaca* salah. Diperiksa: **nol**
nilai ISO-instant di kolom itu. Isinya `12/05/2026` polos — memang menyimpan tanggal 12. Datanya
salah, bukan pembacaannya.

**Urutan hari/bulan dibuktikan, bukan diasumsikan.** 413 tanggal bentuk teks di kedua korpus:
248 punya komponen pertama > 12, **0** punya komponen kedua > 12 → D/M/Y, tanpa tandingan.

## Penyebab sebenarnya: dua importer, satu di antaranya rusak

| program | baris | `imported_by` | `source` | format | tanggal |
|---|---|---|---|---|---|
| A | 149 | `migrationA` | `A:<pib_no>` | D/M/YYYY | **semua mundur 1 hari** |
| B | 196 | `bulk-zip-import` / `realisasi-*-import` | `excel` | ISO | benar |

139 dari 149 baris A adalah duplikat baris B pada kunci `(company_code, pib_no, line_no)`:
92 identik, 47 **tergeser satu nomor baris** (GKL 081715: A baris 1 = B baris 2, dst.). Jadi
importer `migrationA` punya dua off-by-one sekaligus — tanggal dan penomoran baris.

Kode sudah tahu soal ini: [`iqdash_write.php:36`](../iqdash/iqdash_write.php) menyebutnya
"an earlier double-import" dan punya aturan khusus `migrationA`.

Sisa **10 baris A tidak punya kembaran B** (ADP/JKT/LCP/MSN/LSJ) — data asli, dan **8 di antaranya
lolos dedup** sehingga dipakai produksi. Itulah 8 baris yang dikoreksi.

## Perubahan 1 — data: 8 baris `realizations.pib_date`

| id | perusahaan | PIB | dari | ke | volume |
|---|---|---|---|---|---|
| 277 | MSN | 300261 | 12/05/2026 | 2026-05-13 | 144,988 |
| 278 | ADP | 300262 | 12/05/2026 | 2026-05-13 | 38,880 |
| 279 | ADP | 300262 | 12/05/2026 | 2026-05-13 | 207,804 |
| 280 | LCP | 300248 | 12/05/2026 | 2026-05-13 | 274,978 |
| 281 | JKT | 300249 | 12/05/2026 | 2026-05-13 | 201,796 |
| 282 | JKT | 300249 | 12/05/2026 | 2026-05-13 | 98,020 |
| 285 | LSJ | 312270 | 18/05/2026 | 2026-05-19 | 382,434 |
| 286 | LSJ | 312270 | 18/05/2026 | 2026-05-19 | 101,500 |

Volume ke-8 baris **dicocokkan baris demi baris ke workbook sumber lebih dulu** (kolom `Volume`,
multiset identik untuk kelima perusahaan) — penting, karena baris-baris ini berasal dari importer
yang penomoran barisnya terbukti rusak. Hanya tanggalnya yang cacat.

Ditulis `YYYY-MM-DD` polos: sama dengan 196 baris B, sama dengan yang didokumentasikan
[`08-drawer.js:457`](../iqdash/assets/js/08-drawer.js), dan mengikuti preseden pengisian
`arrival_date`. `pDate` dan `iq_ins_parse_dmy` sama-sama menerimanya; hanya
`iq_realization_date_ts` (khusus urutan tampilan) yang tidak — dan di sana 196 dari 204 baris
memang sudah ts=0.

## Perubahan 2 — bug hidup: insights tidak dedup

[`iqdash_insights.php:407`](../iqdash/iqdash_insights.php) menjumlahkan tabel mentah, termasuk
149 baris duplikat itu:

- dilaporkan **27.564,956 MT** · seharusnya **15.438,208 MT** — **1,79×**
- kena: `totalRealizedMT`, `byCompany`, `byProduct`, `year`, `month`, `week`

Dua pembaca lain sudah dedup ([`iqdash_data.php:437`](../iqdash/iqdash_data.php) dan
`iq_realizations_list`); insights sendirian. `insights.js:144` di `iq_dash` **punya cacat yang
sama** — jadi ini divergensi yang disengaja dari mirror JS, dan ditandai begitu di komentar.

`iq_wstr` / `iq_realization_key` / `iq_dedupe_realizations` dipindah dari `iqdash_write.php` ke
`iqdash_util.php` (implementasi tidak diubah) karena `iqdash_insights.php` tidak me-`require`
modul lain — dan test insights hanya memuat `iqdash_util.php`.

## File yang disentuh
- `iqdash/iqdash_util.php` — rumah baru 3 helper dedup
- `iqdash/iqdash_write.php` — 3 helper dipindah keluar, diganti komentar penunjuk
- `iqdash/iqdash_insights.php` — `iq_ins_realizationMetrics` dedup sebelum menjumlah
- `iqdash/tests/test_insights.php` — 5 assertion baru
- Sheets tab `realizations` — 8 sel `pib_date` (+ `updated_at`)

## Verifikasi
- Tes ditulis lebih dulu dan **dilihat gagal** (1649 vs 350; 333 vs 222), baru diperbaiki.
- **13 suite PHP lulus**, nol regresi · `php -l` bersih seluruh `iqdash/` + `lib/`.
- 2 suite JS lulus (35 + 15 assertion).
- Tulis: dry-run dulu; script menolak menulis bila nilai tab sudah bergeser dari hasil audit.
- Baca ulang tab setelah tulis: **8/8 terverifikasi**, 345 baris (tidak berubah).
- Realized ter-dedup tetap **15.438,208 MT** sebelum & sesudah — edit tanggal tidak memindahkan volume.
- Insights terhadap data live sekarang **15.438,208 MT**, cocok dengan dashboard.
- Backup: `backups/iqdash_realizations_before_pib_date_fix_2026-07-27.json`.

## Sisa / risiko
- **Belum di-deploy** ke host. Perubahan PHP baru aktif setelah `./deploy.sh iqdash`.
- **196 baris B `product`-nya kosong** → `byProduct` melaporkan 13.987,808 MT tanpa label (~91%
  dari volume). Hanya 8 baris hasil koreksi ini yang punya nama produk. Belum diperbaiki.
- **139 baris duplikat `migrationA` masih ada di tab.** Sekarang inert (ketiga pembaca dedup), tapi
  pembaca baru yang lupa dedup akan salah lagi. Penghapusan belum dilakukan — keputusan user.
- `iq_realization_date_ts` hanya paham D/M/YYYY → 204 baris ISO diurutkan seolah tak bertanggal.
  Kosmetik (urutan drawer), belum diperbaiki.
- Cacat yang sama masih ada di hulu `iq_dash/lib/insights.js:144`.
