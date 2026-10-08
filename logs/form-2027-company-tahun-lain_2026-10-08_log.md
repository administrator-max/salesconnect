# IQ Dash — form Input Data di Quota Year 2027: sisa company lain & stub palsu

**Tanggal:** 2026-10-08
**Modul:** IQ Dash (Import Quota Monitor)

## Ringkasan

Putri (Sales) membuka HDP dengan Quota Year 2027 dan melihat Target Re-Apply
"GL ALLOY — Current Obtained 525 MT". Itu kuota **LCP 2026**, bukan HDP
(HDP 2026 = 1.000 MT; HDP belum punya data 2027). Juga: tidak ada form/tombol
untuk mengajukan apa pun di 2027.

Tiga sebab:
1. `buildSalesOpsForm()` berhenti (return) saat company tanpa produk ber-obtained
   SEBELUM membangun Target Re-Apply & Revision Request → kedua bagian itu
   masih berisi company yang dibuka sebelumnya (LCP 525 MT).
2. Di 2027 belum ada company bersiklus 2027, jadi daftar company menandai ke-41
   company sebagai "(New)". Memilih HDP membuat stub GL BORON bertahun 2026, dan
   Save berujung 409 "sudah ada di database".
3. Akibat (1), jalur New Submission di `buildRevisionRequestTable()` tidak pernah
   terpanggil untuk company tanpa obtained.

## Perubahan

- `11-shipment.js` — saat company tanpa produk ber-obtained, Target Re-Apply dan
  Revision Request TETAP dibangun ulang (yang terakhir menampilkan formulir New
  Submission, seperti yang dirancang untuk SUJU).
- `19-init.js` — daftar company: company yang sudah punya data di tahun lain
  ditandai `tahunLain` + label "(belum ada data 2027)", bukan "(New)".
- `12-product-mt.js` — `loadEdit()`: company `tahunLain` tidak dibuatkan stub;
  form disembunyikan dan tampil penjelasan + tautan ganti Quota Year. Bagian
  Sales dikosongkan saat company tidak ditemukan.
- `index.html` — versi ketiga berkas dinaikkan.

## Verifikasi (pratinjau, data live 08-Okt)

- Skenario Putri: LCP 2026 → ganti 2027 → HDP: tampil "HDP belum punya data
  Quota Year 2027 … ada di Quota Year 2026", tanpa stub, tanpa sisa 525 MT.
- 2026, LCP → SUJU: Target Re-Apply "No products found", Revision Request
  menampilkan formulir 🆕 New Submission.
- 50 uji `.cjs` lulus.

## Belum ditangani (butuh keputusan)

Pengajuan 2027 untuk company yang SUDAH memegang kuota 2026 belum didukung model
data: `patchToServer()` sengaja menolak menyimpan objek irisan tahun, karena
kolom Obtained/Utilization/shipments/permintaan Sales masih satu per company,
lintas tahun. Perlu dirancang sebelum Sales bisa request 2027.
