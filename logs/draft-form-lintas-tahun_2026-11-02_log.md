# Submit #1 2026 EMS/KJK/BBB tertimpa pengajuan 2027 — 2026-11-02

## Gejala
Luzya: "tarik IQ Dash yang Oktober, ini salah semua". Submitted Oktober 2026 = 12.000 MT dari
"Submit #1" EMS 6.000 (09-Okt-26), KJK 3.000 (15-Okt-26), BBB 3.000 (13-Okt-26) — padahal itu
pengajuan 2027.

## Bukti (log aktivitas IQ Dash)
- 30-Okt 07:14 UTC Putri · KJK · Simpan siklus: "Submit #1: MT 6000 → 3000"
- 02-Nov 02:54 UTC Putri · EMS · "Submit #1: MT 8000 → 6000" + Obtained #3 SPI 02/11
- 02-Nov 02:56 UTC Putri · BBB · "Submit #1: MT 6000 → 3000" + Obtained #3 SPI 02/11
Diff seluruh company 20-Okt vs sekarang: hanya 3 ini (+ SGD 2027 ejaan SHEETPILE digabung 4.000+4.000
→ 8.000, terpisah — perlu dicek tim).

## Akar masalah (direproduksi di pratinjau dengan snapshot 20-Okt)
Draft form Input Data (16-storage.js) dikunci (peran, company) TANPA tahun kuota. Draft yang
ditinggal di tampilan 2027 dipulihkan ke form 2026 company yang sama (dan sebaliknya); saveEdit
menulis Submit MT/produk/tanggal form ke siklus Submit pertama tahun yang tampil.
Juga: ganti Quota Year saat form terbuka tidak memuat ulang form.

## Perbaikan
- `_draftKey` = peran::company::tahun; draft format lama dibuang; lencana draft per tahun.
- `setQuotaYear`: form terbuka → simpan draft tahun lama, muat ulang form tahun baru.
- `saveEdit`: tolak simpan bila form dimuat untuk company/tahun lain (`window._editLoaded`).
- Uji pratinjau: buka 2027 → nilai 2027 benar; ganti ke 2026 → form dimuat ulang; Save kirim
  Submit #1 8.000 (benar); guard → 0 kiriman.
- test_quota_year_validity: asumsi "semua 40 company tampil di 2026" diganti aturan (SUJU kini
  hanya 2027) — sudah gagal di kode lama.

## Data — MENUNGGU persetujuan pengguna
Pulihkan Submit #1 2026 dari snapshot 20-Okt:
- EMS 8.000 {SHEET PILE 8.000} submit 15/10/2025
- KJK 6.000 {GL ALLOY 6.000} submit 15/10/2025
- BBB 6.000 {GL ALLOY 6.000} submit 21/10/2025

## Data DIPULIHKAN (02-Nov-2026, disetujui pengguna "pulihkan")
tools/pulihkan_submit1_2026-11-02.php --apply (sel per sel, ID baris dicek):
- cycles: EMS id 53294 mt 6000→8000, submit 09-Oct-26→15/10/2025; KJK id 53353 3000→6000,
  15-Oct-26→15/10/2025; BBB id 53255 3000→6000, 13-Oct-26→21/10/2025. Status tidak diubah.
- cycle_products: EMS SHEET PILE 2000→8000 + baris GL ALLOY 4000 dihapus; KJK & BBB GL ALLOY 3000→6000.
Dibaca ulang + payload dibangun ulang: Submit #1 2026 kembali, Submit #4 2027 utuh.
