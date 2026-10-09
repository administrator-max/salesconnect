# IQ Dash — sisir menyeluruh kebocoran antar tahun kuota (2026 ↔ 2027)

**Tanggal:** 2026-10-09
**Modul:** IQ Dash (Import Quota Monitor) — klien + server

## Latar

Sesudah drawer EMS 2026 menampilkan siklus 2027, tim meminta: "periksa lainnya,
jangan sampai begini lagi". Polanya selalu sama — kode yang membaca/menulis data
company UTUH (semua tahun) melewati irisan tahun. Disisir dua arah: kode (setiap
panggilan server & pembaca data mentah) dan perilaku (semua permukaan dirender di
kedua tahun).

## Temuan & perbaikan

| # | Tempat | Masalah | Perbaikan |
|---|---|---|---|
| D | Import Master — siklus (`21-master-import.js` mdMergeCycles) | PATCH /cycles mengganti SELURUH siklus company tapi hanya mengirim siklus irisan; `quotaYear` tidak ikut → Import Master di 2026 menghapus Submit 2027 EMS; di 2027, siklus 2027 pulang sebagai 2026 | siklus tahun lain ikut dikirim, quotaYear dipertahankan, nama per tahun dipulihkan |
| D2 | Import Master — utilisasi per siklus (PUT cycle-utilization) | mengganti seluruh baris company; baris tahun lain terhapus | baris tahun lain ikut dikirim |
| D3 | Import Master — obtainedStats | menulis stats tahun pertama dari tampilan tahun lain | dilewati untuk tahun selain tahun pertama |
| A | Simpan lot cepat (`11-shipment.js` patchShipmentsToServer) | lot irisan dikirim; server menghapus lot produk yang tak ada di payload → lot tahun lain hilang; lot baru tanpa tahun | irisan lewat patchToServer (gabungan semua tahun); lot company khusus tahun lain dicap tahunnya |
| B | Modal rincian realisasi di drawer (`08-drawer.js`) | PIB semua tahun ditampilkan | disaring ke tahun tampil |
| C | Upload realisasi (Excel & manual) + Existing Records (`20-realization-import.js`) | PIB yang diupload di 2027 tercatat 2026; daftar memuat semua tahun | quotaYear ikut dikirim di tahun selain bawaan; daftar disaring |
| E | Simpan RA (`16-storage.js` patchRAToServer + `iqdash_write.php`) | server memperbarui baris ra_records PERTAMA company apa pun tahunnya → RA 2027 menimpa RA 2026 | dicocokkan per company + tahun; klien lama tetap ke tahun bawaan |
| F | PERTEK Perubahan release (`13-rev-mgmt.js`) | gerbang milik tahun pertama | ditolak bila dicatat dari tahun lain (jaring kedua) |
| — | Cap tahun lot (`16-storage.js`) | perbaikan A sempat akan mencap lot 2026 milik objek asal sebagai 2027 (panel Pengajuan menyimpan objek 2026 dari tampilan 2027) | cap memakai tahun pertama company, bukan tahun tampil |

## Sisir perilaku (pratinjau, data live, semua tulisan dicegat)

Per tahun (dimuat ulang terpisah): 5 halaman, 11–12 pop-up/drill/panel, drawer EMS,
modal realisasi EMS, ekspor PDF Summary, Excel, CSV.

- **2027:** penanda EMS 2026 (PERTEK 1046, SPI …3512, Re-Apply #2, Submit SPI,
  1.600, 2.100, Obtained #3, Submit #4) — **tidak muncul**. Temuan kode company lain
  semuanya positif palsu ("ETA JKT", daftar filter produk, dropdown pilih company
  form Input Data). Drill Obtained EMS: kolom Submit 4.000/2.000, Obtained "—".
- **2026:** penanda 2027 ("MOI Submit #1 on 08/10/2026", total 20.000, "777/UJI") —
  **tidak muncul**. Drawer EMS: 6 siklus, Obtained 2.600, Submit 14.000.

## Verifikasi lain

- `tests/test_simpan_dua_tahun.cjs` M (Import Master) — gagal di kode lama, lulus.
- 51 uji `.cjs` lulus (19 asersi di uji dua tahun); uji PHP gagal identik dengan
  sebelum perubahan (router butuh login, ledger mematok Agustus).

## Aturan ke depan

Setiap kode baru yang (1) mengambil data segar per company dari server, (2) menulis
ke endpoint yang MENGGANTI seluruh baris company (cycles, cycle-utilization,
shipments per produk), atau (3) menulis tabel yang dicocokkan per company — wajib
lewat objek asal + applyQuotaYearSlice / _gabungIrisanTahun, dan diuji di company
dua tahun.
