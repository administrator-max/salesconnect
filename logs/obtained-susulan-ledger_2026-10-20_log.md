# Input David "hilang": EMS 500 & KJK 300 masih tampil available — 2026-10-20

## Laporan
David (via pengguna): sudah input, seharusnya EMS GL ALLOY 500 MT dan KJK GL ALLOY 300 MT
di pop-up Available Quota sudah habis. "Jangan sampai terjadi seperti ini lagi."

## Temuan — input SUDAH tersimpan, tapi dibuang saat dihitung
- EMS: `company_product_stats` id 901 — GL ALLOY utilization 500 (tersimpan 16-Okt).
- KJK: `company_shipments` id 50 — GL ALLOY lot 1, 300 MT @ 29 September 2026, NIM (Arsen 67).
- Penyebab: `quotaLedger.json` (snapshot beku master 03-Agu) belum memuat Obtained #3 hasil
  Re-Apply #2 (PERTEK Perubahan #2: EMS 28/09, KJK 19/09). Server memakai obtained ledger
  sebagai ATAP pemakaian per produk — `min()` di iq_apply_ledger dan "pagar obtained" di
  iq_sync_util_with_cycles — sehingga pemakaian di atasnya dibuang diam-diam. EMS bahkan tak
  punya baris GL ALLOY di ledger, jadi stats 500 tidak pernah dibaca.
- Kelas yang sama dengan AMP 29-Sep (0ed28a1). Sapuan 41 company: juga SJH (lot 81 MT
  @ 29-Sep "Arsen 67 - NIM" ikut terbuang), BBB, KARA, LCP (Obtained #3 belum di ledger).

## Perbaikan
1. Ledger (disetujui pengguna): EMS + 7225.99.90 GL ALLOY {obtained 500, util 0};
   KJK 7225.99.90 obtained 1.400 → 1.700 (util tetap 1.400 = angka master; lot 300 dihitung
   oleh aturan lot karena tanggalnya sesudah utilisasi master terakhir).
2. Sistemik — `iq_obtained_belum_di_ledger()` (iqdash_data.php): Obtained yang SUDAH TERBIT di
   siklus tahun pertama tapi belum ada di ledger ditambahkan sebagai selisih saja, dari siklus
   TERBARU ke belakang — meniru persis canonicalObtained/_isObtainedTerbit + "Cadangan KEDUA"
   getObtainedByProdAgg di dashboard. Selisih <= 0 tidak disentuh (revisi pengganti tidak hidup
   lagi). `_ledgerObtained` tetap angka ledger murni sebagai pembanding.

## Dampak terukur (payload dibangun ulang, 41 company) — hanya 6 berubah
| Company | Sebelum obt/used/sisa | Sesudah |
|---|---|---|
| EMS | 2.100 / 2.100 / 0 | 2.600 / 2.600 / 0 |
| KJK | 1.400 / 1.400 / 0 | 1.700 / 1.700 / 0 |
| SJH | 390 / 390 / 0 | 480 / 471 / 9 |
| BBB | 700 / 700 / 0 | 800 / 700 / 100 |
| KARA | 100 / 100 / 0 | 180 / 100 / 80 |
| LCP | 475 / 475 / 0 | 525 / 475 / 50 |
Dashboard (pratinjau) membaca angka sama; `__auditObtained()` kosong.

## Uji
- Baru: iqdash/tests/test_obtained_susulan.php (12 PASS: KJK, EMS, PERTEK belum terbit, ledger
  lengkap, revisi pengganti).
- test_ledger.php: angka paritas diperbarui 34.840 → 36.140 (sudah gagal SEBELUM ini karena edit
  AMP +200 & IKM +300 tidak ikut memperbarui pin; +800 EMS/KJK). Semua uji PHP lain PASS
  (router/patch_company butuh login live — gagal juga di kode lama). 51 uji .cjs PASS.
