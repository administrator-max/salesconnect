# SalesPulse: PPGL punya margin tapi hilang dari grafik volume — PS tersimpan tanpa baris item
- **Tanggal:** 2026-08-20
- **Oleh:** Claude Code (lanjutan laporan David Adi Nugroho)

## Ringkasan
Sesudah 4 leg SUMEC 01A/01B diisi PPGL (lihat `salespulse-projects-hantu_2026-08-20_log.md`),
PPGL muncul di Top 3 Products Juli dengan margin Rp 407,79 juta — tapi **tidak muncul sama
sekali di grafik volume MT**. Tooltip Juli hanya menyebut Galvalume 300 MT, Galvanized 2.800 MT,
Wear Plate 103 MT, Seamless Pipe 275 MT, Beam 54 MT, Bar 13 MT = 3.546 MT.

Itu bukan bug tampilan. Keempat PS tersebut **tidak punya satu pun baris di `ps_items`**, dan:
- volume dijumlahkan dari `ps_items.total_weight_kg` → 0 kg → 0 MT;
- revenue hanya diakui untuk leg eksternal yang **membawa item** (`$isExternalSaleLeg`,
  `consolidation.php:237`) → 0.

Margin tetap benar karena margin dijumlahkan dari `ps_headers`, tidak butuh item.

## Temuan data (live sheet, 2026-08-20)
| PS | Rantai | Customer | Internal? | Item | Revenue header |
|---|---|---|---|---|---|
| PSF26-HKG-000002.R1 | SUMEC 01A | PT. Pilar Teknindo Jaya | tidak | **0** | 3.680.000.000 |
| PSF26-JKT-000002.R2 | SUMEC 01B | PT. Pilar Teknindo Jaya | tidak | **0** | 1.465.000.000 |
| PSF26-ATL-000045.R1 | SUMEC 01A | PT. Hidup Karya Gemintang | YA | **0** | 3.158.600.000 |
| PSF26-ATL-000046.R1 | SUMEC 01B | PT. Jaya Kita Terdepan | YA | **0** | 1.258.850.000 |

Dua leg eksternal (HKG & JKT, keduanya jual ke PTJ) adalah yang menentukan volume dan revenue.
Begitu item-nya ada, PPGL Juli akan membawa revenue **Rp 5,145 miliar** plus tonasenya.

**Ini bukan kasus tunggal.** Dari 124 baris `ps_headers`, **22 PS tersimpan tanpa item**.
Yang eksternal (jadi benar-benar hilang dari chart): 4 leg SUMEC di atas + **PSF26-SPA-000005**
(Beam, April, Rp 5,95 miliar). Total revenue eksternal yang tidak terhitung: **Rp 11,09 miliar**.

## Perubahan
- `api.php`: respons upload menambah **`itemsWarning`** ketika PS masuk tanpa satu pun baris item.
- `assets/js/app.js`: peringatan itu ikut ditampilkan di toast, menyebut nomor PS-nya.

Tidak ada logika hitung yang diubah — tidak ada satu angka pun yang bergeser. Yang ditambah
hanya suaranya: lubang seperti ini tidak boleh lagi lewat tanpa ada yang tahu.

## File yang disentuh
- `salespulse/api.php` — `itemsWarning` pada respons POST project-sheet
- `salespulse/assets/js/app.js` — kumpulkan & tampilkan `itemsWarning`

## Alasan
Sama dengan kasus "Projects": angkanya sendiri tidak salah, yang berbahaya adalah **hilangnya
tanpa jejak**. Sebelum ini, PS tanpa item tersimpan dengan status "✓ Tersimpan!" yang penuh
percaya diri, padahal tonase dan revenue-nya baru saja menguap.

## Verifikasi / uji
- `php -l` bersih untuk `api.php`; `node --check` bersih untuk `app.js`.
- `php salespulse/tests/util_test.php` → ALL PASS · `php salespulse/tests/consolidation_test.php` → ALL PASS.
- Dicek langsung ke sheet live: keempat PS SUMEC benar-benar 0 baris di `ps_items`
  (dicari juga dengan nomor dasar tanpa akhiran `.R1`/`.R2` — tetap nihil).

## Sisa / risiko
- **Belum beres:** tonase & revenue PPGL Juli baru akan terhitung setelah item keempat PS itu
  ada di `ps_items`. Jalur normalnya: unggah ulang PS-nya lewat modal upload, lengkap dengan
  tabel item.
- **Dugaan yang belum terbukti** (perlu satu file PS contoh untuk dipastikan): parser item di
  `app.js` mulai membaca dari **baris ke-23 secara hardcoded** (`let rowIndex = 22`) dan berhenti
  saat kolom 3 berisi `TOTAL`. Kalau layout PS bergeser sedikit saja, seluruh tabel item terlewat
  dan hasilnya 0 item — konsisten dengan 22 PS yang tersimpan tanpa item. Kalau unggah ulang
  ternyata tetap 0 item, di situlah perbaikannya: cari baris header tabel item, jangan hardcode.
- `PSF26-SPA-000005` (Beam, April, eksternal, Rp 5,95 miliar) mengalami hal yang sama dan belum
  ditangani.
