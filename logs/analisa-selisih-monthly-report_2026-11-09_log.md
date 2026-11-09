# Analisa selisih Monthly Report + revisi panduan input — 2026-11-09

## Permintaan
Pak Jeri: kenapa angka Monthly Report selalu berbeda; bila terkait format input, buat panduan.

## Cara
Enam snapshot IQ Dash (21-Sep, 02/09/20-Okt, 02/09-Nov) dihitung dengan kode sekarang, jadi selisih = data.
Dibandingkan dengan PDF laporan Mar, Mei, Agu, Okt (Downloads), activity_log, dan data SalesPulse langsung.
Tidak ada data produksi yang diubah.

## Temuan
1. Laporan ditarik sebelum data tutup; tidak ada penguncian (Okt: 11 PS masuk 02-Nov 14:40, batas 04-Nov).
2. Cara menarik berbeda: All Time vs periode, Utilized dihitung sendiri.
3. Available = saldo hari ini (keputusan pemilik data 04-Agu), bukan saldo per akhir periode.
4. Bug yang sudah diperbaiki: Obtained tertimpa, Re-Apply tanpa Submit, form lintas tahun, buffer browser.
5. Input: 3 baris PIB `24-09-2026` (384,098 MT, pDate tidak membaca, hilang dari semua periode); Hanwa 02
   dugaan dobel Rp 5,95 B; MSN/SPA dicatat 04-Nov bertanggal 06-Okt (6.000 MT); GNG Submit #4 tanggal
   sama dengan #3 (3.000 MT); SJH Submit #2 tanpa tanggal (2.700 MT); 6 lot tanpa tanggal util (1.247 MT);
   2 rantai tanpa revenue karena nama beda antar-leg.
SalesPulse Mar/Mei/Agu: revenue & margin sama persis dengan laporan terbit.
SP vs IQ: 33 cocok, 5 geser bulan, 8 selisih nyata dari 46 pasangan produk kuota.

## Berkas
- docs/analisa_monthly_report.html (baru)
- docs/panduan_input_tim.html + docs/Panduan_Input_SalesConnect.pdf (H+3 semua modul, format tanggal,
  tanggal Submit, tanggal util vs ETA, tanggal PIB, bagian penyusun laporan). Koreksi: kolom tanggal lot
  teks bebas, bukan pemilih tanggal.

## Belum
- pDate belum membaca dd-mm-yyyy dan impor belum menolak tanggal tak terbaca (menunggu izin; angka laporan Okt berubah).
- Tutup buku bulanan belum dibuat. Pemulihan 75 sel (tools/pulihkan_sapuan_buffer_2026-11-04.php) masih ditunda.

## Revisi struktur panduan (permintaan pengguna, hari yang sama)
Panduan disusun ulang per modul: langkah dari awal (IQ Dash per peran, SalesPulse), lalu kotak "yang masih
belum sempurna" di tiap modul. Label tombol dicocokkan dengan kode layar. Koreksi: Re-Apply bukan tombol
tersendiri, melainkan pilihan Type di Revision Request ke CorpSec.

## Panduan ditulis ulang lengkap (permintaan pengguna, hari yang sama)
Versi ringkas ditolak: panduan harus lengkap, ringan, dan detail per modul. Kini ada kamus istilah, langkah per kasus
per peran, arti pesan error, dan penyebab angka beda per modul. Pratinjau lokal baca-saja dipakai mencocokkan layar:
form tiap peran, pesan lot, Existing Records, filter Periode, menu Data, modal upload, ikon hapus, Riwayat Input.
Tidak teruji: simpan sungguhan dan pemeriksa upload SalesPulse (butuh server asli).
Temuan baru: pesan "ETA JKT wajib diisi" muncul saat yang kosong Tgl Utilisasi (11-shipment.js);
parseMT membaca "1.234,5" sebagai 1,2345 tanpa peringatan.

## Perbaikan kolom MT dan pesan lot (izin pengguna, hari yang sama)
Pesan lot kini menulis "Tgl Utilisasi wajib diisi". parseMT dan kolom yang diformat saat mengetik kini menolak koma
sebagai desimal: "123,5" dulu terbaca 1235, "2,5" terbaca 25, "1.234,5" terbaca 1,2345. Tombol yang menyimpan tanpa
saveEdit (Pengajuan tahun, Konfirmasi, Terapkan, Catat Terbit) ikut menolak isian bertanda merah. 54 uji lulus; layar
lot dicoba di pratinjau lokal. Data lama tidak diperiksa: kesalahan ketik sebelum perbaikan ini tidak terdeteksi otomatis.
