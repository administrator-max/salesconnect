# SalesPulse: Arsen 69 — produk salah & leg ATL/GP terpisah — 2026-11-02

## Laporan tim (Luzya)
1. Leg ATL 69B belum ada → "solved" (PSF26-ATL-000091 kini ada, margin Rp 281 jt).
2. Produk 69A yang benar = Galvalume (leg GP PSF26-IKM-000016 tercatat Galvanized).
3. "Jadikan 1 rantai saja ATL dan GP".

## Penyebab
- Deteksi produk menggabungkan nama project + material + deskripsi jadi satu teks, alias
  terpanjang menang. Alias `Cutting Plate -> Galvanized` (13 huruf) mengalahkan `GL` / `PPGL`
  di kode material. 69A (GL-AZ20) & 69B (PPGL-AZ20) jadi Galvanized.
- Rantai dikelompokkan dengan nama project PERSIS sama. ATL "…-NIM" vs GP "… - NIM (Okaya)"
  → dua rantai; margin ATL (±Rp 1,8 M) tak pernah sampai ke end customer Okaya.

## Perbaikan (kode)
- `sp_detect_product()` (salespulse_util.php): tingkat 1 kode material, tingkat 2 nama +
  deskripsi (perilaku lama). Dipakai jalur upload PS (api.php).
  Radius atas 175 PS (hanya berlaku untuk upload berikutnya): 10 beda dari aturan lama —
  2 Seamless (sama dgn tersimpan), 69A→Galvalume, 69B→PPGL, dan 6 PS Oktober ber-material
  PPGL-AZ… yang tersimpan Galvanized/Galvalume (SSSC 13 Kapuk Molek ×3, Lantian 04 ×2,
  Lantian 05 Optima) → MENUNGGU konfirmasi tim. Percobaan pertama (3 tingkat terpisah)
  membuat 6 PS Wear Plate jadi "Plate" — dibatalkan, uji ditambahkan.
- `sp_chain_key()` (consolidation.php): kunci rantai = nama dirapikan (huruf kecil, kurung di
  akhir dibuang, spasi/tanda baca diabaikan). Radius: 98 → 93 rantai, tepat 5 penggabungan
  = Arsen 69A–E. Total revenue/margin tidak berubah (hanya pengelompokan).
- Uji: salespulse/tests util_test (+6) & consolidation_test (+4) ALL PASS.

## Data
- ps_headers.product PSF26-IKM-000016 → Galvalume: DITAHAN (penulisan ke sheet perlu
  persetujuan pengguna).

## Lanjutan: Arsen 68 tetap 0 item setelah dihapus & diupload ulang (02-Nov-2026 15:xx)
Riwayat Input SalesPulse: 08:04 UTC "Hapus PS" PSF26-IKM-000011.R1 → 08:05 "Upload PS baru · 0 item".
Server menyimpan apa yang dikirim; yang gagal adalah PEMBACA FILE di browser (app.js):
tabel item dicari di posisi TETAP (mulai baris 23, No di kolom B, berat di kolom L).
Header & margin tetap terbaca (dicari lewat label) → item hilang tanpa error.

Perbaikan (app.js):
- parseXmlSpreadsheet menghormati ss:Index baris (dulu baris kosong yang dilompati ekspor XML
  membuat seluruh tabel "naik").
- Awal tabel item dicari: baris 9–80, kolom No 0–3, jangkar No=1 + material + berat di No+10.
  Template standar → baris 23/kolom B, identik dengan perilaku lama.
- Upload dengan 0 item kini DIKONFIRMASI sebelum disimpan (dulu hanya toast sesudahnya).
Diuji: standar, tabel naik (b15), turun (b30), geser 1 kolom → semua 2 item/80.000 kg.
Belum terverifikasi dengan file Arsen 68 asli (ada di David) — minta file / upload ulang.

PS 2026 tanpa item (19): mayoritas leg intercompany (revenue memang tak dihitung). Yang
eksternal: Arsen 68 (IKM→BJM, rev 8,74 M) dan Hanwa 02 Phase 1 (SPA-000005→Artha Mas Graha,
rev 5,95 M) — revenue/volume-nya hilang dari dashboard.
