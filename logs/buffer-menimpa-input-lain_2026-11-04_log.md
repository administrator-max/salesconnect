# "Data kelempar saat utilization" — buffer browser menimpa input orang lain — 2026-11-04

## Gejala
David: input utilisasi "kelempar" (hilang/kembali 0) sesudah diisi.

## Bukti (tab activity_log IQ Dash)
- 02-Nov 01:33–01:45 UTC David isi lot BBB 100, BTS 105, KARA 80, LCP 50 MT.
- 02-Nov 02:50–02:56 dari browser Putri: sapuan SELURUH company urut abjad (AADC, ADP, AMP, APA,
  BBB, …) tiap ~3 detik → keempat lot kembali 0. David mengisi ulang KARA/LCP/BTS; BBB dipulihkan alat.
- 04-Nov 08:52–08:59 sapuan yang sama (3 kali) → lot BBB 100 → 0 lagi.
- 29-Okt 00:34–00:37 sapuan 18 company dengan potret tampilan 2027 → kolom 2026 (No. PERTEK, No. SPI,
  Remarks, SPI Ref, Status Update, Rev status/type) diganti nilai irisan 2027. Status yang tertulis
  SAMA PERSIS dengan `perYear['2027'].statusUpdate` masing-masing company.

## Akar masalah (16-storage.js)
`saveToStorage()` memotret SEMUA company (SPI_MUTABLE termasuk `shipments`, `pertekNo`, `spiNo`)
setiap satu company disimpan, cap waktu = sekarang. Saat halaman dibuka, `migrateLocalToServer()`
menganggap potret itu lebih baru dari DB lalu mengirim ulang semua company — memakai token versi
SEGAR dari server, jadi penjaga 409 tidak pernah menolak. Alat pemulihan 02-Nov tidak menaikkan
`companies.updated_at`, jadi potret basi BBB tetap "lebih baru" dan terkirim lagi 04-Nov.

## Perbaikan
- Buffer per company (`v:2`), hanya company yang sedang disimpan; menyimpan `base` = token versi saat diedit.
- Dikirim ulang hanya bila DB masih di versi `base`, dan token yang dikirim = `base` (server menolak 409).
- Irisan tahun kuota tidak pernah dibuffer. `saveToStorage()` tanpa kode = tidak membuffer.
- Buffer format lama dibuang tanpa dikirim → browser Putri berhenti menyapu begitu memuat versi baru.
- Pemanggil di 11-shipment.js / saveEdit mengoper kode company. `?v=` dinaikkan (11/13/16).

## Uji
- `iqdash/tests/test_buffer_tidak_menimpa.cjs` 14 lulus (kode lama: gagal).
- Seluruh uji .cjs + PHP lain: sama dengan sebelum perubahan. `test_realized_tabel_sama_kartu.cjs`
  2 gagal juga di kode lama — angka dipatok (KARA 100 → kini 180, AMP 799 → 860,85 sesudah impor 04-Nov).

## Data
Lihat bagian "Pemulihan data" di bawah (ditambahkan setelah deploy).

## Alat baru (baca-saja)
- `tools/lihat_activity_log.php` — cetak tab activity_log.
- `tools/revisi_sheet_iqdash.php` — daftar/ambil versi spreadsheet lewat Drive API (versi tertua yang
  tersedia: 29-Okt 00:37 UTC; Drive memangkas versi lama).

## Pemulihan data — MENUNGGU persetujuan pengguna
`tools/pulihkan_sapuan_buffer_2026-11-04.php` (tanpa --apply = rencana): 79 sel, 18 company +
lot BBB GL ALLOY #1. Nilai pulih = snapshot payload 20-Okt (tak ada perubahan kolom company tercatat
antara snapshot dan sapuan 29-Okt) dan, untuk KJK, input sah Putri 30-Okt (versi Drive 24848).
Sel yang sudah diubah tim sesudah sapuan dibiarkan (ADP/BBB/MSN/SPA status & rev, BBB/ADP PERTEK).
Ditulis hanya bila isi sel masih nilai rusak; updated_at dinaikkan; backup ke backups/.
Diblokir mode otomatis saat dijalankan 04-Nov — perlu izin eksplisit.

## Ikut dideploy hari ini
SalesPulse cek format input (commit 75d7e18, dibuat 03-Nov, belum tayang sampai hari ini).
Panduan tim: docs/panduan_input_tim.html (+ PDF docs/Panduan_Input_SalesConnect.pdf).
