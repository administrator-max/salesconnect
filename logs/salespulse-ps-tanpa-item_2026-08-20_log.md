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
Yang benar-benar hilang dari chart hanya 4 leg SUMEC di atas: **Rp 5,145 miliar** revenue
eksternal. (Lihat koreksi di bawah — `PSF26-SPA-000005` sempat ikut dihitung di sini, keliru.)

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
- `PSF26-SPA-000005` (Beam, April) — lihat koreksi di bawah; ternyata TIDAK hilang dari chart.

---

## Tindak lanjut — item SUMEC 01A/01B diisi (2026-08-20, sesi yang sama)
Tim (Ridwan) memberi tonase: **SUMEC 01A + 01B = 350 MT total**. Pemecahannya diturunkan dari
harga per kg, bukan ditebak — dengan 01A = 250 MT dan 01B = 100 MT, harga kedua rantai konsisten:

| Leg | Rantai | Tonase | Revenue | Rp/kg |
|---|---|---|---|---|
| PSF26-HKG-000002.R1 (eksternal → PTJ) | 01A | 250 MT | 3.680.000.000 | 14.720 |
| PSF26-JKT-000002.R2 (eksternal → PTJ) | 01B | 100 MT | 1.465.000.000 | 14.650 |
| PSF26-ATL-000045.R1 (internal) | 01A | 250 MT | 3.158.600.000 | 12.634 |
| PSF26-ATL-000046.R1 (internal) | 01B | 100 MT | 1.258.850.000 | 12.589 |

Selisih harga antar rantai 0,5% di sisi jual dan 0,4% di sisi internal. Pemecahan lain
mustahil: 200/150 misalnya menghasilkan Rp 18.400 vs Rp 9.767 untuk barang & pelanggan
yang sama. Pembanding: SUMEC 02 (GI ke PTJ) Rp 14.100/kg dengan tonase bulat 300 MT.

Tonase ditulis ke **keempat leg** — meniru pola SUMEC 02 yang menyimpan 300.000 kg di kedua
leg-nya. Tidak dobel hitung: leg dengan customer internal dilewati saat menjumlah volume.

Tool baru: `tools/salespulse_isi_item_ps.php` — menambah satu baris item ke PS yang benar-benar
kosong, **menolak** PS yang sudah punya item (supaya tonase tidak tergandakan), uji kering default.

### Hasil Juli 2026 (MTD) sesudahnya
| # | Produk | Volume | Margin | Revenue |
|---|---|---|---|---|
| 1 | Galvanized | 2.800,0 MT (71,9%) | 3.424,10 M | 40.090,74 M |
| 2 | **PPGL** | **350,0 MT (9,0%)** | 407,79 M | **5.145,00 M** |
| 3 | Galvalume | 300,0 MT (7,7%) | 510,61 M | 4.690,73 M |
| 4 | Seamless Pipe | 275,0 MT (7,1%) | 383,40 M | 3.754,38 M |
| 5 | Wear Plate | 103,3 MT (2,7%) | 352,63 M | 2.027,68 M |
| 6 | Beam | 54,5 MT (1,4%) | 27,52 M | 616,53 M |
| 7 | Bar | 13,5 MT (0,3%) | 2,25 M | 136,80 M |

Total actual naik **3.546 → 3.896 MT** (42,2% → **46,4%** dari budget 8.400 MT).
Total margin **tidak bergeser**: tetap 5.108,30 M.

### Yang masih menggantung
- **Kode material bukan yang asli.** Diisi `PPGL` / `FLAT ROLLED PROD` sebagai deskripsi apa
  adanya, karena kode PS sebenarnya tidak tersedia (bandingkan SUMEC 02: `GI-Z40 G550-00038`).
  Kalau file PS-nya nanti ada, unggah ulang akan menimpanya dengan kode yang benar.
- **PSF26-SPA-000005** (Beam, April) — lihat koreksi di bawah.
- **Dugaan parser masih berdiri**: `let rowIndex = 22` yang hardcode di `app.js` tetap tersangka
  utama kenapa 22 PS bisa tersimpan tanpa item. Butuh satu file PS contoh untuk dipastikan.

---

## Koreksi & penutup — konfirmasi tim (2026-08-20, sesi yang sama)

### 1. `PSF26-SPA-000005` TIDAK hilang dari chart — koreksi atas catatan di atas
Catatan awal log ini menyebut PSF26-SPA-000005 sebagai revenue eksternal Rp 5,95 miliar yang
tidak terhitung, dan menjumlahkannya jadi "Rp 11,09 miliar". **Itu keliru.** Penjualannya
sebenarnya sudah terhitung, hanya lewat PS kembarannya.

Rantai `Hanwa 02 - Del. April 2026 - Artha Mas Graha Phase 1` berisi **tiga** leg, dan salah
satunya adalah versi lama dari deal yang sama:

| PS | Dibuat | Supplier | Customer | Revenue | Margin | Item |
|---|---|---|---|---|---|---|
| PSF26-SPA-000004 | 17 Apr | PT. Hanwa Indonesia | Artha Mas | 5.946.953.978 | 259.440.852 | 5 baris, 474.862 kg |
| PSF26-GIS-000003 | 3 Mei | PT. Hanwa Indonesia | Selaras Prima | 5.804.227.083 | 116.713.957 | 0 |
| PSF26-SPA-000005 | 3 Mei | PT. Gunung Inti Sempurna | Artha Mas | 5.946.953.978 | 142.726.895 | 0 |

Deal ini direstrukturisasi dari 1 leg langsung menjadi 2 leg lewat GIS:
- 116.713.957 + 142.726.895 = **259.440.852** — persis margin PS lama, sampai rupiah terakhir;
- revenue SPA-000004 dan SPA-000005 identik ke rupiah, ke pelanggan yang sama;
- purchase SPA-000005 (5.804.227.083) = revenue GIS-000003 — rantainya nyambung, sedangkan
  SPA-000004 masih memakai rute lama (beli langsung dari Hanwa);
- Phase 2 dari deal yang sama, dientri di batch yang sama 3 Mei, isinya persis 2 leg
  (GIS-000004 → SPA-000006) dengan item hanya di leg SPA.

Jadi tonase 474.862 kg dan revenue Rp 5,95 miliar **sudah masuk chart** lewat SPA-000004 —
tidak ada yang hilang. Menambah item ke SPA-000005 justru akan menggandakannya: simulasi atas
data live menunjukkan Beam April melonjak 809,7 → 1.284,6 MT dan 10.328,27 → 16.275,22 M revenue.

Penyisiran seluruh 124 PS: **ini satu-satunya** pasangan leg kembar (subsidiary + customer +
revenue identik) dan satu-satunya rantai yang margin satu leg-nya sama dengan jumlah leg lain.
12 rantai 3-leg lainnya normal.

### 2. Keputusan tim: April dibiarkan apa adanya
Dikonfirmasi tim 2026-08-20: **"Beam di April sudah benar"**. Tidak ada perubahan data April
yang dijalankan — tidak ada baris yang dipindah maupun dihapus.

Satu hal yang tetap dicatat di sini sebagai temuan, bukan sebagai usulan: selama SPA-000004
dan pasangan penggantinya sama-sama ada, margin penjualan Phase 1 terjumlah dua kali —
Rp 518,88 juta untuk deal senilai Rp 259,44 juta. Tonase dan revenue tidak terpengaruh
(hanya leg eksternal ber-item yang dihitung, dan itu cuma SPA-000004). Kalau suatu saat mau
dirapikan, langkahnya: pindahkan 5 baris item SPA-000004 ke SPA-000005, lalu hapus SPA-000004 —
hasilnya margin April 2.592,19 → 2.332,74 M, tonase & revenue tidak bergerak.

### 3. SUMEC 02 memang Galvanized
Dikonfirmasi tim. Sudah sesuai dengan isi sheet (PSF26-ATL-000050 & PSF26-SGD-000005 keduanya
`product = Galvanized`, material `GI-Z40 G550`). Tidak ada perubahan.

### 4. Tool yang tidak jadi dipakai
`tools/salespulse_gantikan_ps_lama.php` sempat dibuat untuk skenario pemindahan+penghapusan di
atas, lalu **dihapus** karena tidak jadi dijalankan. Analisisnya tersimpan di bagian ini.
