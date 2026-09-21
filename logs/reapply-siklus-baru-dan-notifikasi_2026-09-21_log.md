# IQ Dash — Re-Apply jadi siklus Submit baru, sinkron Overview, notifikasi CorpSec
- **Tanggal:** 2026-09-21
- **Oleh:** Claude Code (permintaan tim IQ Dash)

## Ringkasan
Re-Apply kini selalu menjadi siklus `Submit #N` baru yang hanya berisi produk
yang dipilih Sales. Drill Overview "Total Submitted" dibangun di atas angka
kanonik kartunya. Data 9 company (AADC, BBB, EMS, GAS, PPGL, KARA, KJK, LCP,
SJH) diselaraskan, termasuk Obtained yang tertimpa. Ditambah notifikasi
request Sales → CorpSec.

## Akar masalah
1. Re-Apply dikonfirmasi sebagai siklus "Revision Request — X" + placeholder
   Obtained, **tanpa siklus Submit baru**. Drill Total Submitted hanya membaca
   siklus Submit → re-apply proses tidak tampil (KARA 6.000 ≠ 9.000, KJK
   9.000 ≠ 12.000, LCP 8.725 ≠ 11.725, SJH 8.700 ≠ 11.700). Drill juga
   menghitung sendiri: 276.845 MT vs kartu 261.695 MT.
2. Form "Update Revision / Submit #2 Status" (`rrSaveStatus`/`rrMarkApproved`)
   menyasar Submit #N **terakhir** (yaitu re-apply sebelumnya yang sudah
   terbit) dan mengisi input Obtained dengan **MT permintaan**. Save menimpa
   Obtained: LCP #2 200→3.000, EMS #2 GI ALLOY 500→GL ALLOY 3.000, BBB #2
   300→3.000, SJH #2 90→3.000; plus status Submit #2 jadi "Update dd/mm/yy -
   Submit". Itu yang membuat Available EMS 2.500 dan LCP 2.800.
3. `rrObtainedTypeFor` menelurkan placeholder baru tiap simpan (PPGL #2/#3/#4).
4. Re-Apply ditumpangkan ke produk asal yang sudah obtained (EMS/GAS "GI ALLOY
   → GL ALLOY"), sehingga GI ALLOY ikut muncul.
5. Konfirmasi CorpSec PPGL tidak tersimpan di rev_note (status null) walau
   siklusnya lahir.

## Perubahan
- **Model Re-Apply baru** (`co.reapplyRequests`, disimpan di amplop rev_note
  `_reapplyRequests`): Sales pilih produk dari master (wajib, tanpa "Tetap
  sama") + MT → CorpSec konfirmasi per produk + isi tanggal Submit MOI
  Perubahan → siklus `Submit #N` "Menunggu PERTEK Perubahan #k Terbit".
  Permintaan tertaut ke siklusnya lewat `cycleType`.
- `rrGetActiveCycle` memilih pengajuan yang MASIH berjalan (Obtained
  pasangannya belum lengkap), bukan sekadar yang terakhir.
- Form Obtained tidak lagi diisi MT permintaan (jadi placeholder "diminta X");
  `rrSaveStatus` hanya menyentuh siklus Obtained bila ada angka/tanggal diisi;
  produk form = produk siklus re-apply; tanggal PERTEK dari siklus aktif.
- `rrObtainedTypeFor` memakai ulang placeholder `_fromRevReq` yang belum
  terbit, tidak menambah nomor baru.
- `pendingReapplyCycles` melewati Revision Request yang tertaut ("→ Submit #N").
- `adaReapplyBerjalan` membaca permintaan Re-Apply model baru yang pending.
- `collectRevisionRequestData`: dalam mode Re-Apply tidak menyentuh permintaan
  revisi (dulu mengosongkannya); jejak konfirmasi CorpSec dipertahankan;
  `requestedBy`/`requestedDate` dicatat.
- Drill **Total Submitted**: baris dari gerbang yang sama dengan
  `canonicalSubmitted[Filtered]`, + re-apply tanpa siklus, + baris
  penyesuaian "produk dipindah revisi" → Σ drill = kartu, per company.
- **Notifikasi** (🔔 Request di topbar, `24-notifications.js`): Company |
  Request Type | Product | MT | Request Date | Requested by | Status.
  Diturunkan dari data permintaan (tanpa tabel sendiri) → status otomatis
  "Confirmed / In Process · Submit #N" begitu CorpSec konfirmasi. Toast sekali
  untuk request baru (CorpSec/Super Admin).
- `iqdash/index.php` menyuntikkan `window.SC_USER_NAME` (nama saja).
- Data: `tools/sinkron_reapply_2026-09-21.php` (dry-run default, backup
  otomatis, pagar per company, baca-ulang).

## File yang disentuh
- iqdash/assets/js/01-data.js — bongkar `_reapplyRequests`, tautan anti double count, adaReapplyBerjalan
- iqdash/assets/js/03-kpis.js — drill Total Submitted kanonik
- iqdash/assets/js/11-shipment.js — form Re-Apply Sales, collector aman
- iqdash/assets/js/13-rev-mgmt.js — blok RE-APPLY REQUEST, panel CorpSec, perbaikan form Obtained
- iqdash/assets/js/16-storage.js — simpan `_reapplyRequests`
- iqdash/assets/js/19-init.js — lencana notifikasi, Esc
- iqdash/assets/js/24-notifications.js — BARU
- iqdash/assets/index.html — tombol & modal notifikasi, ?v=
- iqdash/index.php — SC_USER_NAME
- iqdash/tests/test_reapply_siklus_baru.cjs — BARU (24 pemeriksaan)
- iqdash/tests/test_obtained_satu_baris_per_produk.cjs — sandbox `activeCycle`
- tools/sinkron_reapply_2026-09-21.php — BARU

## Verifikasi / uji
- Simulasi rencana data di mesin hitung dashboard untuk 41 company: yang
  berubah hanya 9 company target; drift cycles-vs-stats kosong;
  submittedBreakdownIssues & revisionRuleIssues kosong.
- Kartu: Submitted 261.695 → 267.695 (EMS +3.000, PPGL +3.000); Obtained
  40.370 → 35.460 (EMS −2.500, LCP −2.800, BBB +300, SJH +90); Available
  14.014 → 8.714 (EMS & LCP → 0).
- Seluruh uji `.cjs` lulus kecuali `test_realized_tabel_sama_kartu` sebelum
  migrasi (selisih 390 = drift data BBB 300 + SJH 90, hilang sesudah migrasi).

## Sisa / risiko
- GAS Total Submitted tetap 3.000: Submit #1 BORDES ALLOY 6.000 sudah
  dipindah revisi, dan aturan 11-Sep-2026 tidak menghitung produk yang
  dipindah (ditampilkan sebagai baris penyesuaian di drill).
- Permintaan revisi lama BBB/KJK/SJH ("GL BORON", Re-Apply #1) tetap di
  rev_note sebagai riwayat, ditandai revisionType Re-Apply.
- Tab yang masih terbuka dengan kode lama bisa membuang `_reapplyRequests`
  saat menyimpan — tim perlu memuat ulang halaman sesudah deploy.
- Notifikasi bersifat di-dashboard (lencana + toast), belum email.

## Lanjutan 21-Sep-2026 — keputusan pemilik data (Putri)
- **Submission produk yang dipindah revisi TETAP dihitung.** "GAS total
  submission 9.000: 6.000 submit BORDES (obtained 200, dipindah ke GI ALLOY)
  + 3.000 re-apply GL ALLOY." Diputuskan berlaku untuk keenam company bentuk
  ini: GAS 9.000, BDG/DIOR/GIS/MJU/SMS masing-masing 6.000 (sebelumnya 0).
  Aturan 11-Sep di `scopedSubmittedByProd` dibatalkan. Baris produk lama tetap
  ⚪ Inactive / historis, Obtained "—", tidak masuk Available.
  Kartu Total Submitted 267.695 → 303.695; Obtained & Available tidak berubah.
- Tabel PERTEK & SPI: produk yang dipindah tidak lagi tergolong "Belum terbit";
  baris historis produk yang hanya diterima lewat revisi (MJU HOLLOW PIPE)
  kolom Submit-nya "—", bukan 200.
- **GAS Re-Apply GL ALLOY 3.000 = Submit #2 / Re-Apply #1** (bukan #3/#2),
  "Menunggu PERTEK Perubahan Terbit". Siklus lama "Obtained #2" (mt 0, SPI
  Perubahan 27/04/2026, revisi BORDES→GI) diganti nama menjadi
  "Obtained (Revision #1) — SPI Perubahan 27/04/2026" supaya tidak berpasangan
  dengan Submit #2 baru. `tools/gas_reapply1_2026-09-21.php`.
- Obtained LCP #2 200, EMS #2 GI 500, BBB #2 300, SJH #2 90 dikonfirmasi benar.
- Uji baru `test_submitted_tabel_sama_kartu.cjs`: Σ tabel PERTEK & SPI = drill
  = kartu, per company (41). `test_submitted_reapply_dan_historis.cjs` bagian J
  diperbarui (DIOR 6.000).

## Lanjutan — MJU: revisi HRPO ALLOY → CRC ALLOY dibatalkan (Putri, 21-Sep-2026)
Produk akhir MJU = HRPO ALLOY 200 MT. Angka tidak bergerak (obtained 200,
available 200, submitted 6.000); yang dibersihkan jejak revisinya:
- 2 baris `revision_changes` MJU (HRPO 200 → CRC 200) dihapus — backup
  `backups/iqdash_mju_sebelum_batal_crc_*.json`; remarks diberi catatan pembatalan.
  `tools/mju_batal_crc_2026-09-21.php`.
- `iqdash/data/pendingRevisions.json`: entri MJU dihapus.
- `iqdash/data/quotaLedger.json`: MJU dipindah dari HS 7225.50.90 (CRC ALLOY)
  ke 7225.30.90 (HRPO ALLOY; kode ditambahkan ke peta produk ledger). Tanpa ini
  ledger menampilkan CRC ALLOY begitu gate pendingRevisions dilepas.
- teks spi_ref MJU diperbarui: "SPI Perubahan #2 TERBIT 16/07/2026".
Verifikasi: PERTEK & SPI MJU = HRPO ALLOY 🟢 Active 200, BORDES/HOLLOW PIPE
historis; Available Quota HRPO 200; panel CorpSec tanpa Product Change/CRC;
kartu tidak berubah; seluruh uji .cjs lulus.
