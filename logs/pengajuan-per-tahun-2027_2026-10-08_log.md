# IQ Dash — Sales bisa mengajukan kuota 2027 (Pengajuan per Tahun)

**Tanggal:** 2026-10-08
**Modul:** IQ Dash (Import Quota Monitor)

## Ringkasan

Putri (Sales) tidak punya cara mengajukan kuota 2027 untuk HDP: semua formulir
permintaan menyimpan ke field satu-per-company tanpa tahun, dan `patchToServer()`
sengaja MENOLAK menyimpan company yang memegang kuota lebih dari satu tahun.

Sekarang di Quota Year 2027, company yang sudah punya data 2026 menampilkan panel
**🆕 Pengajuan Kuota 2027**: Sales isi produk & Qty → Simpan → CorpSec
Konfirmasi (boleh ubah MT) / Batalkan → lahir siklus Submit bertanda 2027
(PERTEK TBA) → company tampil di 2027 (Active Application, Total Submitted).

## Perubahan

- `11a-pengajuan-tahun.js` (baru) — panel, simpan, konfirmasi, batalkan.
  Data: `co.newSubmissionByYear["2027"]` di amplop rev_note
  (`_newSubmissionByYear`). Nomor Submit MELANJUTKAN urutan company (HDP:
  Submit #4) karena server mendedup siklus per company + cycle_type.
- `16-storage.js` — irisan tahun kini disimpan lewat `_gabungIrisanTahun()`:
  siklus & lot semua tahun digabung (lot bentrok diberi nomor baru, quotaYear ikut
  dikirim), total dihitung dari siklus gabungan, objek asal disinkronkan.
  Penulisan stats per produk (_obtainedStats/_etaWrite) untuk company dua tahun
  tetap ditolak — tabelnya belum per tahun. Pencapan tahun di
  `patchCyclesToServer()` tidak lagi memindahkan siklus tahun lain yang belum
  bertahun. Teks lama rev_note ikut dibawa amplop (`_revNoteTeks`) — dulu hilang
  begitu amplop JSON ditulis (HDP: "SPI Perubahan 2 Terbit 16/07/2026").
- `01-data.js` — membongkar `_newSubmissionByYear` dan `_revNoteTeks`.
- `12-product-mt.js` — company tahun lain menampilkan panel pengajuan.
- `11-shipment.js` — company dua tahun tanpa obtained memakai panel per tahun,
  bukan New Submission (yang tidak bertahun).
- `24-notifications.js` — pengajuan per tahun masuk notifikasi CorpSec (dari
  data semua tahun); klik membuka Quota Year-nya.
- `index.html` — tag `11a-pengajuan-tahun.js`, versi berkas lain dinaikkan.
- `tests/test_simpan_dua_tahun.cjs` — uji baru.

## Verifikasi (pratinjau, data live 08-Okt; semua PATCH dicegat, tidak ada yang ke Sheets)

1. Sales HDP 2027 → amplop berisi pengajuan; 6 siklus 2026 terkirim utuh; lot &
   total HDP tidak berubah.
2. CorpSec konfirmasi 2.500 (diajukan 3.000) → Submit #4 bertahun 2027; total
   2026 identik sebelum/sesudah (306.695 / 36.580 / 6.781,01); Total Submitted
   2027 = 2.500.
3. Simpan HDP dari irisan 2026 dan 2027: 7 siklus bertahun benar, lot 2026 utuh.
4. Lot 2027 bernomor 1 → jadi lot 2; lot 1 milik 2026 tidak tertimpa.
5. Muat ulang (payload disusun dari isi PATCH): pengajuan confirmed, teks
   rev_note kembali, HDP 2027 Active Application = Submit #4, HDP 2026 tetap
   11.200 / 1.000.
6. SNSD (siklus tanpa tahun) mengajukan 2027 → siklusnya tetap 2026; notifikasi
   CorpSec menampilkan "Pengajuan 2027 · pending".
7. 51 uji `.cjs` lulus; uji baru gagal di kode lama.

## Sisa / risiko

- Input Obtained/ETA per produk untuk company dua tahun masih ditolak (pesan jelas).
- Company yang benar-benar baru (tanpa data sama sekali) di 2027 masih lewat jalur
  New Company lama, yang mencatat Submit #1 sebagai 2026 — perlu dibereskan
  sebelum ada company baru khusus 2027.

## Tindak lanjut (hari yang sama)

Keterangan kuning "HDP belum punya data Quota Year 2027 …" dihapus atas permintaan tim; hanya panel Pengajuan yang tampil (`12-product-mt.js?v=10`).
