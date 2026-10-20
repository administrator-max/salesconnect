# Rekap Periode + Log Aktivitas Input — 2026-10-20

## Permintaan
1. Tombol rekap Utilization & Realization lintas PT per periode (David selama ini hanya bisa per PT).
2. Setiap input dari user tercatat + diberi tahu apakah sudah masuk, supaya tim tidak perlu
   bertanya ketika ada logika yang tidak jalan (pemicu: EMS 500 / KJK 300, lihat
   logs/obtained-susulan-ledger_2026-10-20_log.md).

## 1. Rekap Periode — tombol "📊 Rekap Periode" (halaman Utilization & Realization)
- 25-rekap-aktivitas.js: pilih bulan Dari s/d Sampai (+ Bulan ini / Bulan lalu / Jan–sekarang),
  tabel per bulan (klik = rincian bulan itu), tabel per PT + produk (klik = drawer PT), ⬇ Excel.
- Tidak menghitung sendiri: tiap jendela lewat _asOfPeriod() + pasangan resmi kartu
  (utilizationPool(kpiPool()) × scopedUtilTotal = reportUtilizedTotal; realizedByCompany =
  reportRealizedTotal, tgl PIB). Diverifikasi di pratinjau: Jan/Jun/Sep/Okt 2026 rekap = kartu
  persis; Σ 12 bulan = total setahun (23.607,99 / 21.999,403).

## 2. Log Aktivitas — iqdash_activity.php + tombol "🧾 Log Aktivitas"
- Setiap POST/PUT/PATCH/DELETE ke api/company/* dan api/realizations/* dipotret SEBELUM dan
  SESUDAH (baris mentah company + angka payload yang dikirim ke dashboard), dicatat ke tab
  `activity_log` (dibuat otomatis): waktu, email/nama (sesi login), peran, aksi, company,
  status, ringkasan perubahan, efek di dashboard, peringatan.
- Status: ok (tersimpan & terhitung) · warning (input pemakaian/realisasi bertambah tapi angka
  dashboard tidak ikut — dengan sebab: lot tanpa tanggal / tanggal <= utilisasi master terakhir /
  melebihi obtained / realisasi dobel PIB+line) · nochange.
- Potret sesudah dibuat setelah jawaban dikirim (fastcgi/litespeed_finish_request); potret
  sebelum ±0,02 s hangat, ±0,8 s dingin. Semua kesalahan ditelan — log tidak bisa
  menggagalkan simpan.
- Klien: pencegat fetch (bukan 14 titik simpan) → notifikasi beberapa detik setelah simpan;
  peringatan tetap terpasang sampai ditutup. Lencana oranye di tombol = peringatan 7 hari.

## Bug ikutan yang ditemukan simulasi log (diperbaiki)
iq_sync_util_with_cycles: produk yang pemakaiannya hanya tercatat di stats (master diam),
begitu diberi lot pertama, Used TURUN ke angka lot (EMS GL ALLOY stats 500 + lot 100 → 100
terpakai / 400 sisa). Kini max(lot, stats). Dampak pada data sekarang: 0 company berubah.

## Uji
- Simulasi atas tabel asli (di memori, tanpa menulis): KARA lot 50 → ok (Used 100→150);
  EMS lot 100 → warning melebihi obtained; BBB lot tanpa tanggal → warning + sebab;
  LCP realisasi dobel → warning; SJH tanpa perubahan → nochange.
- iqdash/tests/test_activity_log.php (14 PASS). Semua uji PHP lain + 51 uji .cjs PASS.
- Pratinjau: rekap, notifikasi, modal log, tombol — konsol tanpa error.
