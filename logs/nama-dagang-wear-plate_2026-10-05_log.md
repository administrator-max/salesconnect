# IQ Dash — "Wear Plate" terlihat di samping BORDES ALLOY

**Tanggal:** 2026-10-05
**Modul:** IQ Dash (Import Quota Monitor)

## Ringkasan

Operations (Jeany) menginput realisasi BTS 188,993 MT (PIB 649867, Jumat
02-Okt-2026) yang di dokumennya berbunyi *Wear Resistant Steel Plate*, dan tidak
bisa menemukannya: dashboard menamai HS 7225.40.90 **BORDES ALLOY**, dan kata
"Wear Plate" tidak ada di layar mana pun. Datanya sudah masuk sejak Jumat.

Sekarang produk itu tampil **"BORDES ALLOY (Wear Plate)"** di layar realisasi,
dan pencarian "wear plate" menemukan BTS, MIN, SPA.

## Perubahan

- `01-data.js` — `PROD_NAMA_DAGANG` + `prodTampil()`: label tampilan dengan
  nama dagang. Sengaja TERPISAH dari `prodLabel()`, yang dipakai juga untuk
  membandingkan nama produk.
- `03-kpis.js` — pop-up Total Realized & drill lain memakai `prodTampil()`;
  kolom produk Total Realized kini dari `realizedByCompanyProd()` (MIN/BHG dulu
  "—" karena peta HS lama tidak kenal 7225.40.90).
- `06-tables-util-ra.js` — tabel Utilization & Realization dan Re-Apply /
  Realization (baris induk & anak).
- `08-drawer.js` — pencarian global ikut mencocokkan nama dagang; hasil & modal
  rincian lot memakai `prodTampil()`.
- `19b-util-breakdown.js`, `20-realization-import.js` — rincian utilisasi dan
  daftar Existing Records realisasi.
- `index.html` — versi keenam berkas di atas dinaikkan.

## Verifikasi

- Pratinjau (data live 05-Okt): BTS ↳ BORDES ALLOY (Wear Plate) 188,993 di tabel
  Utilization & Realization; pop-up Total Realized MIN tidak lagi "—"; pencarian
  "wear plate" → BTS, MIN, SPA; Existing Records BTS menampilkan nama dagang.
- 50 uji `.cjs` lulus.

## Sisa / risiko

- Ekspor Excel/PDF belum memakai nama dagang (tidak diminta).
- Nama dagang lain bisa ditambah di `PROD_NAMA_DAGANG`.
