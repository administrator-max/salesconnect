# SalesPulse — cek input sebelum simpan + panduan input PS

**Tanggal:** 2026-11-03
**Modul:** SalesPulse

## Ringkasan

Pak Jeri meminta Monthly Report tidak lagi tersendat. Audit 175 PS 2026 menunjukkan
sebabnya format input: nama project beda antar-leg, tabel barang/berat kosong, PS dobel,
tahun "Del." salah, ejaan customer ganda, dan input terlambat. Sebelumnya semua ini
baru ketahuan saat laporan dibuat.

## Perubahan

- `salespulse_cekinput.php` (baru) — `sp_cek_input()` memeriksa payload upload terhadap
  data yang sudah ada. **Blok**: nama kosong, PO Date tak terbaca, barang tanpa berat,
  leg customer luar tanpa barang. **Cek**: format nama baku (dengan saran), bulan kirim
  sebelum PO, nama beda antar-leg (Phase & induk "A dan B" dikecualikan), versi .Rn lain
  masih ada, dugaan dobel, ejaan customer (dengan saran), lewat batas input (hari kerja
  ke-3 bulan berikut), nomor PS tidak baku, produk tak terdeteksi, kurs kosong.
- `api.php` — route `POST cek-input`.
- `assets/js/app.js` — klik Simpan pertama menjalankan cek. Ada blok → tidak bisa simpan.
  Hanya cek → tombol "Sudah saya cek — Simpan", opsi "Pakai saran".
- `assets/index.html` — `app.js?v=` dinaikkan. Versi lama tidak pernah dinaikkan sejak Juli,
  jadi perbaikan parser sebelumnya bisa belum sampai ke browser tim (cache Cloudflare).
- `consolidation.php` — `sp_customer_key()` + ejaan customer kanonik per rantai (ejaan
  terbanyak). Total tidak berubah; hanya Mlion Intl/International tergabung.
- Panduan: `docs/Panduan_Input_PS_SalesPulse.pdf`.

## Uji

`tests/cekinput_test.php` (27 kasus dari audit), `consolidation_test.php`, `util_test.php` — ALL PASS.

## Belum

- Belum deploy (menunggu izin).
- Data lama tidak diubah: Hanwa 02 SPA-000004/05 dobel, tahun Kewei 68, PS tanpa barang —
  menunggu konfirmasi tim.
