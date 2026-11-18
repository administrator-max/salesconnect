# SCOT ← Excel Drive otomatis (18-Nov-2026)

## Latar
Tim Ops (Maya, Jeany) bekerja di Excel Drive "Dispatch Delivery Master Data for Dashboard
(Updated 3 Mar'26).xlsx" (id 1wIYBmnmfBykxADNRZzqutnLsmVZeft4y, sheet "Ship Analyze25/26").
Dashboard SCOT terakhir di-update 30-Okt; Excel jauh lebih baru. Diminta: update di Excel
langsung tampil di dashboard (target yearly report sebelum W4 Des).

## Temuan
- File berformat .xlsx di Drive → Sheets API menolak ("must not be an Office file").
  Dibaca lewat Drive API (drive.readonly) oleh salesconnect@eagle1-492706.iam.gserviceaccount.com
  (sudah di-share Viewer oleh pengguna 18-Nov).
- Kolom Excel = 35 kolom SCOT, urutan sama (A–AI). Judul di baris 2, data mulai baris 3.
- Nomor "No." tidak sejalan dengan dashboard; ejaan consignee berganti-ganti → kunci cocok =
  nama project (+MT), lalu BL, lalu awalan nama + MT persis.

## Uji coba (tanpa menulis) terhadap data asli
- 222 baris Excel: 122 diperbarui, 3 baru (Centra Lays 03; Sahabat Bangun Jaya #02 ×2),
  97 sama, 0 baris dashboard tanpa pasangan.
- Status hanya maju (20 baris On Going/Contract → Done). Tidak ada yang mundur.
- Catatan: Putra Bumi Bahana #04 qty 271,373 (diedit Maya di dashboard 30-Okt) → 272,373 (Excel).

## Aturan
- Excel berisi menimpa dashboard; Excel kosong/"-" tidak menghapus. Baris dashboard tanpa
  pasangan tidak dihapus. Cadangan tab sebelum tiap tulis: cache/scot_cadangan/ (10 terakhir).
- Halaman SCOT memicu cek saat dibuka + tiap 3 menit; server cek Drive maks tiap 2 menit dan
  hanya menulis bila modifiedTime berubah. Tombol header "🔄 Excel · <waktu>" = cek sekarang.

## Berkas
scot/scot_sync.php, scot/api.php (route sync), scot/assets/main.js + index.html,
scot/tests/sync_excel_test.php (12 lulus), tools/scot_sinkron_excel.php (coba|jalan).
