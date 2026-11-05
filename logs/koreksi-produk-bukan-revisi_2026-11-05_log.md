# Koreksi produk pengajuan 2027 tercatat sebagai revisi (SGD, ADP) — 2026-11-05

## Gejala
Tim: SGD & ADP 2027 seharusnya pengajuan (Submit) baru, tapi muncul siklus "Revision #1 ACTIVE"
dan "Obtained (Revision #1)", status "Revision Active — Awaiting Approval".

## Bukti
- cycles quota_year 2027: SGD Revision #3 (54726) + Obtained (Revision #3) (54727), "GL ALLOY → SHEETPILE";
  ADP Revision #3 (54574) + Obtained (Revision #3) (54575), "GI ALLOY → GI BORON" (activity_log 20-Okt 10:09 UTC).
- PERTEK 2027 kedua company belum terbit. SGD Submit #3 (2027): mt 6.000, rincian kini SHEET PILE 8.000
  (permintaan Sales: GL ALLOY 4.000 + SHEET PILE 2.000).
- perYear['2027'] berisi revType active, revStatus "Menunggu PERTEK Perubahan — …", revFrom/revTo.

## Akar masalah
12-product-mt.js `applyProductRenames()`: mengganti produk di tabel produk form Input Data SELALU
menyuntik siklus Revision #N + Obtained (Revision #N) dan menandai company Under Revision —
juga saat PERTEK belum terbit, yang sebenarnya koreksi pengajuan (aturan induk no. 3).
Rename juga MENIMPA (bukan menambah) MT produk tujuan yang sudah ada.

## Perbaikan
- `adaPertekTerbit(co)`: ada Submit dengan PERTEK/tanggal terbit pada siklus yang tampil.
- Belum terbit → `_koreksiProdukPengajuan()`: ganti produk di siklus/lot/RA, MT ditambahkan ke
  produk tujuan (dibandingkan kanonik), tanpa siklus revisi, tanpa revType.
- Label pil di tabel: "✏️ Koreksi pengajuan" vs "🔄 Revision". `?v=` 12-product-mt → 12.
- Uji: iqdash/tests/test_koreksi_produk_bukan_revisi.cjs (8 lulus).

## Data — MENUNGGU persetujuan
tools/bersihkan_revisi_palsu_2027_2026-11-05.php: hapus 4 siklus revisi 2027 + cycle_products-nya,
kosongkan kolom revisi perYear 2027, SGD Submit #3 (2027) → SHEET PILE 6.000 (sesuai koreksi
GL ALLOY → SHEET PILE atas permintaan GL ALLOY 4.000 + SHEET PILE 2.000).

## Data DIBERSIHKAN (05-Nov-2026 03:12 UTC, disetujui pengguna "Ya, bersihkan")
4 siklus + 4 cycle_products dihapus; perYear 2027 SGD/ADP revType none, revStatus/spiRef/revFrom/revTo
kosong (statusUpdate tetap); SGD Submit #3 (2027) SHEET PILE 6.000. Dibaca ulang: sisa siklus
Revision #3 = 0, payload: SGD 2027 Submit 6.000 {SHEET PILE 6.000}, ADP 2027 Submit 3.000 {GI ALLOY 3.000}.
Backup: backups/revisi_palsu_2027_sebelum_2026-11-05_031204.json.
