# IQ Dash — status 2027 di PERTEK & SPI terbaca Completed

**Tanggal:** 2026-11-05
**Modul:** IQ Dash

## Sebab

Di Quota Year 2027, `processStatus()` memakai `section` dan `revType` milik tahun
pertama (2026). Untuk company yang sudah punya SPI 2026, `revisionStatus()` memulangkan
'clean' sehingga semua baris 2027 tampil "✅ Completed", padahal PERTEK 2027 belum terbit.
SUJU (hanya punya pengajuan 2027) kena hal yang sama karena section-nya "SPI".

## Perubahan

- `01a-quota-year.js` `processStatus()` — untuk irisan tahun kedua / company yang tahun
  pertamanya bukan 2026: belum ada PERTEK → Under Submission; PERTEK ada, SPI belum → Pending.
- `05-tables-spi.js` `updateSPICounts()` — kotak ringkasan memakai aturan yang sama.
- `index.html` — `01a-quota-year.js?v=17`, `05-tables-spi.js?v=11`.

## Verifikasi (pratinjau lokal, cache segar 05-Nov)

- 2027: 28 baris Under Submission, 0 Completed; kotak 0 Completed / 23 Under Revision.
- 2026: tidak ada company yang kena pagar baru; angka tetap 27 / 12 / 1.
- Uji `.cjs`: 52/53 lulus; `test_realized_tabel_sama_kartu` gagal 2 juga tanpa perubahan ini (data KARA/AMP).
