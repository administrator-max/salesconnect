# IQ Dash — siklus 2027 bernomor sendiri (#1) & drawer tidak lagi menarik data 2026

**Tanggal:** 2026-10-09
**Modul:** IQ Dash (Import Quota Monitor)

## Ringkasan (laporan tim)

1. Drawer EMS di Quota Year **2026** menampilkan 7 siklus, termasuk Submit #4 milik
   2027 — "kenapa masih kebawa?"
2. Di Quota Year **2027**, siklus pertama EMS tertulis "Submit #4"; seharusnya
   "Submit #1" (siklus pertama tahun itu).

## Penyebab

1. `openDrawer()` diam-diam mengambil `api/company/:code` (company UTUH, semua
   tahun) lalu MENIMPA objek irisan: siklus, PERTEK/SPI No, status. Selain bocor
   tampilan, simpan sesudah membuka drawer bisa mengirim siklus dobel dan menaruh
   nilai 2026 di kolom 2027.
2. Nomor siklus melanjutkan urutan company (server mendedup per company +
   cycle_type), dan nomor itu ditampilkan apa adanya.

## Perubahan

- `08-drawer.js` — data segar diterapkan ke objek ASAL lalu diiris ulang.
- `01a-quota-year.js` — irisan tahun selain tahun pertama memakai salinan siklus
  bernomor per tahun (`beriNomorPerTahun`, nama unik di `_typeAsli`);
  `namaUnikSiklus` (pemulihan saat simpan; siklus baru dapat nomor unik pasangannya,
  mis. Obtained #1 ↔ Submit #4 → Obtained #4); `labelSiklusPerTahun` untuk label.
- `16-storage.js` — `_gabungIrisanTahun` memulihkan nama unik sebelum dikirim.
- `13-rev-mgmt.js` — nomor siklus berikutnya di irisan bernomor per tahun dihitung
  dari siklus tahun itu.
- `11a-pengajuan-tahun.js`, `24-notifications.js` — label "Submit #1 (2027)".
- `tests/test_simpan_dua_tahun.cjs` — K–L.

## Verifikasi (pratinjau, data live; PATCH & fetch company dicegat)

- Drawer 2027 EMS: Submit #1. Drawer 2026 EMS sesudah fetch segar: 6 siklus,
  PERTEK 1046/… (bukan 2027).
- CorpSec 2027 isi PERTEK + Obtained → form menampilkan Submit #1; terkirim ke server
  Submit #4 + Obtained #4 (2027), 6 siklus 2026 utuh; tampilan 2027 Submit #1 /
  Obtained #1; total 2026 identik.
- Notifikasi: "Pengajuan 2027 · … · Submit #1 (2027)".
- 51 uji `.cjs` lulus (17 asersi di uji dua tahun).
