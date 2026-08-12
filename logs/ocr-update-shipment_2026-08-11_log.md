# OCR untuk update shipment — scan dokumen berkali-kali, kolom terisi otomatis
- **Tanggal:** 2026-08-11
- **Oleh:** Claude Code

## Ringkasan
OCR SCOT sebelumnya hanya bisa mengisi form **Add New Shipment**; setiap update shipment
tetap diketik manual. Sekarang form **Update On Going Shipment** punya drop zone scan
sendiri yang bisa dipakai berulang kali (multi-file), hasilnya di-diff dengan data yang
ada, lalu diterapkan ke kolom — dengan opsi langsung simpan.

## Perubahan
- **Field OCR diperluas.** Gemini sekarang juga diminta membaca milestone tahap update:
  `bpn`, `spjm`, `behandle`, `sppb`, `start_unloading`, `finish_unloading`,
  `start_delivery`, `enter_warehouse`, `cargo_status`, `status`. Sebelumnya prompt hanya
  meminta 20 field tahap awal, jadi dokumen SPPB/Surat Jalan praktis tidak menghasilkan apa-apa.
- **`docType`** ikut dikembalikan (BL/PIB/SPPB/BPN/SPJM/Behandle/SuratJalan/Invoice/Other),
  divalidasi terhadap whitelist di server.
- **Drop zone baru di dalam form Update** (`#oz-og`) — muncul setelah shipment dipilih,
  menerima banyak file sekaligus (maks. 8 per batch), dan bisa dipakai berulang kali.
  Input file di-reset setiap selesai, jadi file yang sama bisa di-scan ulang.
- **Merge multi-dokumen.** Kalau beberapa file di-scan sekaligus, nilai per field diambil
  dari dokumen dengan confidence tertinggi.
- **Popup review diff.** Hanya kolom yang benar-benar disebut dokumen DAN berbeda dari data
  sekarang yang ditampilkan: `nilai sekarang → nilai dokumen` + confidence, satu checkbox per
  baris. Confidence <0.6 tidak dicentang otomatis. Tombol: `Isi ke form dulu` atau
  `✅ Isi & Simpan` (langsung PUT — nol pengetikan).
- **Auto-match shipment.** Di tab Scan Document, hasil OCR dicocokkan ke shipment yang sudah
  ada berdasarkan B/L number → project name → vessel+voyage (hanya kalau hasilnya tepat satu).
  Kalau ketemu, muncul tawaran "Update shipment ini" yang melompat ke form Update lengkap
  dengan diff-nya, alih-alih membuat record duplikat.
- **Perbaikan sampingan:** nilai OCR untuk input `<select>` (Cargo Type, Shipment Type,
  Cargo Status, Status, Shipment Route) kini dicocokkan ke opsi yang valid. Sebelumnya
  `el.value = v` pada select dengan nilai tak dikenal diam-diam jadi kosong.

## File yang disentuh
- `scot/gemini.php` — daftar field diperluas, prompt ditulis ulang (deskripsi tiap milestone
  + larangan memakai tanggal cetak), `docType` divalidasi & dikembalikan.
- `scot/assets/index.html` — drop zone + status area di dalam `#frm-og`; `multiple` pada input
  scan di tab OCR; teks kartu OCR disesuaikan.
- `scot/assets/forms.js` — `bindOcrZone()` (dua zona), `runOcrFiles()` multi-file,
  `pollOcr()` kini mengembalikan data (bukan langsung mengisi form), `mergeOcrData()`,
  `ocrValueFor()`, `applyOcrToNewForm()`, `applyOcrToOgForm()`, `ocrDiffForOg()`,
  `showOgOcrReview()`, `applyOgOcrRows()`, `findShipmentForOcr()`, `openOgForOcr()`.
  `buildOgOptions()` dan `saveOgUpdate()` diekstrak dari handler agar bisa dipanggil ulang.

## Alasan
Permintaan direktur: hilangkan proses manual. Tim operation sudah pakai OCR saat input awal,
tapi update (SPPB keluar, barang jalan, masuk gudang) tetap diketik satu per satu karena OCR
tidak pernah tersambung ke form update dan tidak pernah diminta membaca field-field itu.

## Verifikasi / uji
- `node --check scot/assets/forms.js` → lolos.
- `php -l scot/gemini.php`, `php -l scot/api.php` → lolos.
- Semua id DOM yang dirujuk `forms.js` dicek ada di `index.html` (18/18).
- **Uji UI lokal** (`php -S 127.0.0.1:8788 router.dev.php`, data Sheets asli 189 shipment):
  drop zone muncul di form Update, input `multiple` aktif, popup diff menampilkan 7 kolom
  dengan format `sekarang → dokumen` + confidence, baris confidence 52% otomatis TIDAK
  tercentang, "Isi ke form dulu" mengisi 6 kolom dengan sorotan kuning. Hasil OCR-nya
  disimulasikan (bukan panggilan Gemini nyata); form ditutup lewat Cancel — tidak ada
  tulisan ke Sheets.

## Deploy (LIVE 2026-08-11)
- `./deploy.sh scot` → 15 file terkirim, 15 terverifikasi ukurannya, 0 gagal.
  `config.php` produksi TIDAK tersentuh (untracked → di luar daftar deploy).
- Verifikasi live:
  - `GET /scot/` → 200, markup `oz-og` + teks "Scan dokumen update — boleh berkali-kali" ada.
  - `forms.js` di host = 40.625 byte (identik dengan lokal), berisi `bindOcrZone`,
    `applyOcrToOgForm`, `showOgOcrReview`, `findShipmentForOcr`.
  - `GET /scot/api/health` → `{"ok":true,"source":"google-sheets"}`.
  - Smoke test `POST /scot/api/ocr` (logo.png): balas `status:done`, `docType:"Other"`,
    `fields:[]` → membuktikan `gemini_api_key` produksi aktif, prompt baru diterima Gemini
    tanpa error, field `docType` mengalir end-to-end, dan model tidak mengarang isi untuk
    gambar yang bukan dokumen.
- **BELUM diuji: dokumen asli.** Smoke test hanya membuktikan pipa-nya hidup, bukan bahwa
  Gemini benar menarik tanggal SPPB/Surat Jalan dari scan sungguhan. Tes wajib oleh tim ops:
  1. Pilih shipment di Update → scan PDF SPPB → popup diff hanya menampilkan kolom SPPB.
  2. Scan 2–3 file sekaligus (SPPB + Surat Jalan) → cek merge & jumlah kolom.
  3. Scan file yang sama dua kali berturut-turut → harus tetap jalan (input di-reset).
  4. Tab Scan Document dengan B/L yang sudah ada di database → banner "Update shipment ini".

## Sisa / risiko
- Kuota Gemini: 1 file = 1 panggilan. Batch 8 file = 8 panggilan; batas 12 MB inline per file
  masih berlaku.
- File scan **tetap tidak disimpan** — hanya hasil ekstraksinya. Kalau perlu jejak audit
  dokumen, tab `documents` masih butuh `storage_url` (link Drive) yang ditempel manual.
  Ini satu-satunya langkah manual yang tersisa di alur ini.
- Kolom hitungan hari (`clearance_days`, `unloading_days`, `delivery_days`,
  `actual_sailing_days`) sengaja TIDAK diminta ke OCR — tetap diisi manual/Excel. Kalau mau
  ikut otomatis, lebih aman dihitung di server dari tanggal-tanggalnya, bukan ditebak model.
- Job OCR disimpan di `cache/scot_ocr` dan kedaluwarsa 10 menit; batch panjang tidak terpengaruh
  karena tiap file di-poll sampai selesai sebelum lanjut.
