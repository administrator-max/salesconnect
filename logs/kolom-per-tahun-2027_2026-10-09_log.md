# IQ Dash — Quota Year 2027 tidak lagi menarik data 2026 (kolom per tahun)

**Tanggal:** 2026-10-09
**Modul:** IQ Dash (Import Quota Monitor)

## Ringkasan

EMS mengajukan 2027 (Sheet Pile 2.000 + GI Alloy 4.000 → Submit #4, 2027), lalu
CorpSec menyimpan status "MOI Submit #1 on 08/10/2026". Dua masalah:

1. Overview 2027 menampilkan **Total Pending Shipment / Utilized 2.100 MT** — itu
   utilisasi 2026 EMS (Sheet Pile 1.600 + GI 500). Grafik juga.
2. Form CorpSec 2027 menampilkan PERTEK/SPI No, Re-Apply, Revision Request, dan
   riwayat **2026**, dan menyimpannya **menimpa kolom 2026** EMS:
   rev_status Submit SPI → Submit, rev_submit_date 24/08/2026 → 08/10/2026,
   status_update ("…Re-Apply #2…") → "MOI Submit #1 on 08/10/2026", plus catatan
   revisi (_revNoteTeks).

Akar: irisan tahun hanya memisahkan siklus & lot. Kolom tingkat company dan angka
per produk (stats/ledger) satu per company, sehingga terwarisi ke 2027.

Permintaan tim: "2027 dashboard kosong, logika sama dengan 2026, jangan menarik
data 2026".

## Perubahan

- `01a-quota-year.js` — `BIDANG_PER_TAHUN`, `companyPrimaryYear()`. Kolom tingkat
  company milik TAHUN PERTAMA company; tahun lain membaca `co.perYear[tahun]`
  (atau kosong). Untuk tahun lain, utilisasi/available per produk dihitung hanya
  dari utilCycles + lot + siklus Obtained tahun itu; realisasi/ETA per produk,
  ledger, pending-revision gate tidak diwariskan.
- `16-storage.js` — simpan irisan tahun lain: nilai kolom masuk
  `perYear[tahun]`, kolom company tetap milik tahun pertama; amplop rev_note
  membawa `_perYear`; objek asal disinkronkan tanpa menimpa kolom tahun pertama.
- `01-data.js` — membongkar `_perYear`.
- `index.html` — versi ketiga berkas dinaikkan.
- `tests/test_simpan_dua_tahun.cjs` — G–J (tidak mewarisi, perYear dipakai,
  utilisasi tidak bocor, simpan dua arah tidak saling timpa).
- `tests/test_quota_year_validity.cjs`, `tests/test_spi_terbit_render.cjs` —
  asersi "2027 kosong" diganti hubungan (2027 hanya memuat company bersiklus 2027;
  tidak ada company 2026 bocor). Keduanya juga gagal di kode lama begitu EMS
  punya data 2027 — bukan regresi.
- `tools/ems_pisah_kolom_2027_2026-10-09.php` — pemulihan data EMS (dry-run,
  backup, satu baris, baca ulang).

## Pemulihan data EMS

Kolom 2026 dikembalikan ke nilai cache 08-Okt-2026 (sebelum kejadian); nilai 2027
dipindah ke `_perYear["2027"]` (revStatus Submit, revSubmitDate 08/10/2026,
statusUpdate & revNote "MOI Submit #1 on 08/10/2026"). Siklus, lot, stats tidak
disentuh. Lot kosong 0 MT yang terbentuk untuk 2027 dibiarkan (tidak berpengaruh).

## Verifikasi (pratinjau, data live + EMS dipulihkan secara simulasi)

- 2027: Pending Shipment 0, Utilized 0, Total Submitted 6.000, Active Application
  EMS; form EMS: PERTEK/SPI kosong, riwayat hanya Submit #4.
- 2026: EMS kembali ke kolomnya; total 306.695 / 36.580 / 6.781,01 tidak bergeser.
- Simpan dari 2027 → kolom company tetap 2026, nilai 2027 di perYear; simpan dari
  2026 → perYear 2027 tidak hilang.
- 51 uji `.cjs` lulus.
