# IQ Dash — audit logika status & angka (seluruh permukaan)

**Tanggal:** 2026-11-05
**Modul:** IQ Dash
**Pemicu:** Putri harus bolak-balik; tim meminta seluruh logika dibetulkan, bukan satu tampilan.

## Cara audit

Pratinjau lokal + cache segar. Untuk tiap company di 2026 dan 2027, status dibandingkan di
empat sumber: tabel PERTEK & SPI (`processStatus`), kotak ringkasan (`revisionStatus`), strip
Active Application (`activeApplicationStage`), dan badge (`statusBadge`). Kartu Overview
dibandingkan dengan Σ kolom tabel PERTEK & SPI, All Companies, Available Quota, dan modal drill.

## Ditemukan & dibetulkan

| # | Masalah | Contoh | Perbaikan |
|---|---|---|---|
| 1 | Submit berjalan dengan PERTEK sudah terbit terbaca Re-Apply/Under Submission | KJK (PERTEK 05/10), LCP (28/09), SJH (24/09) | `outstandingStage`: PERTEK terbit → `revpending` |
| 2 | Strip Active Application menyembunyikan company ber-revType `complete` walau Submit baru berjalan | KJK, LCP | pagar `complete` dipindah ke bawah `outstandingStage` |
| 3 | Obtained tanpa pasangan dari revisi berjalan → tabel "Completed", strip "Revision" | ADP (PERTEK Perubahan #2 30/10, Submit SPI 02/11; Putri simpan ulang 8× 04-Nov) | revType `active` + Obtained menggantung → tahap dari Approval Stage |
| 4 | Kotak ringkasan menghitung SNSD PENDING padahal SPI terbit 07/08 | SNSD | kotak memakai `processStatus` untuk section PENDING |
| 5 | Kotak "Completed" ikut menghitung 6 company tanpa data | APA, KITA, LILO, PP, SORE, UANG | `isUnconfigured` dikecualikan (27 → 21) |
| 6 | Realization % memakai `ra.obtained` basi | BDG 285%, AMP 108%; kaki tabel Avg 110% | penyebut = obtained kanonik; RA dinormalkan di `applyQuotaYearSlice` |
| 7 | Kelayakan Re-Apply ≥60% dari `realPct` basi | AMP tercatat 0% (sebenarnya 86,1%) | sama dengan #6; hanya AMP yang berubah (jadi layak) |
| 8 | Modal drill kosong menyisakan footer pembukaan sebelumnya | 2027 menampilkan "34 companies" milik 2026 | footer di-reset di 4 cabang kosong |
| 9 | Label 2027 di strip Active Application "Baru/New Submission" | 2027 | "Under Submission" di tahun selain 2026 |
| 10 | Kotak & pil di halaman sama beda satuan tanpa keterangan | 9 vs 23 | kotak menulis "co."; pil tetap baris (dikunci uji) |

Pergeseran status yang terukur (sebelum → sesudah, 2026): ADP Completed→Pending, KJK/LCP/SJH
Re-Apply→Pending. Tidak ada company lain yang bergeser. Angka kartu tidak berubah.

## Sudah sepakat (dicek, tidak berubah)

Submitted 312.695 · Obtained 36.580 · Utilized 32.335 · Realized 24.096,603 · Available 4.246
(2026) dan 88.000 Submitted (2027) — sama di kartu, tabel PERTEK & SPI, All Companies, AVQ, drill.

## Data yang perlu konfirmasi tim (tidak diubah)

- ADP 2027 Submit #1: MT siklus 3.000, rincian produk GI ALLOY 6.000.
- SGD 2027 Submit #1: MT siklus 6.000, rincian SHEET PILE 2.000.
  Keduanya berubah sesudah pembersihan 03:12 UTC, setelah Putri menyimpan 04:04/04:07 UTC.
  Dashboard menampilkan MT siklus (benar); rinciannya perlu dicek Putri.

## Uji

`test_status_2027_satu_sumber.cjs` (11) + 54 berkas `.cjs` lain — semua lulus.
`test_realized_tabel_sama_kartu.cjs` kini membandingkan ke sumber resmi, bukan angka beku
(KARA util 180, AMP PIB 860,85 di data hidup).
