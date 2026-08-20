# SalesPulse: audit anomali menyeluruh — 28 pemeriksaan atas data & logika baca
- **Tanggal:** 2026-08-20
- **Oleh:** Claude Code (permintaan tim: "pastikan tidak ada hal anomali, entah ada yang tidak muncul atau keliru membaca data")

## Ringkasan
Menyisir 124 `ps_headers`, 475 `ps_items`, 86 `budget_lines`, plus jalur konsolidasinya —
28 pemeriksaan. **24 bersih.** Satu anomali baru yang berdampak nyata, satu temuan lama yang
tim minta dibiarkan, satu risiko laten di kode, dan tiga hal yang tampak janggal tapi setelah
diperiksa memang benar.

Dua tool audit dibuat supaya ini bisa diulang tanpa menganalisis dari nol:
`tools/salespulse_audit.php` (per baris) dan `tools/salespulse_audit_lanjutan.php` (struktural).
Keduanya READ ONLY.

## A. ANOMALI — Rp 125,375 juta margin Maret tidak masuk ranking customer mana pun
Rantai `Arsen SSP#48B` terpecah dua karena **nama project-nya beda antar leg**:

| PS | project_name | Customer | Tonase | Revenue | Margin |
|---|---|---|---|---|---|
| PSF26-ATL-000017 | Arsen SSP#48B - Del. **May** 2026 - KEM | PT. Bintang Tunggal Sukses *(grup)* | 0 kg | 3.829.930.000 | 125.375.000 |
| PSF26-BTS-000007 | Arsen SSP#48B - Del. **April** 2026 - KEM | PT. Karyawaja Ekamulia *(luar)* | 295.000 kg | 4.366.375.000 | 252.330.787 |

Keduanya bulan dashboard yang sama (Maret). Konsolidasi mengelompokkan rantai lewat
`project_name` **persis** + `month_idx` (`consolidation.php:405-421`), jadi satu huruf beda =
dua rantai.

Bukti keduanya memang satu rantai: saudaranya `Arsen SSP#48A` berstruktur identik
(ATL-000016 jual ke BTS, BTS-000006 jual ke Sapta Sumber Lancar) dengan selisih
revenue-vs-purchase yang sepola — bedanya nama #48A cocok di kedua leg, jadi menyatu benar.

**Akibatnya di dashboard:**
- Rantai `...Del. May 2026 - KEM` berdiri sendiri dengan **margin Rp 125,375 juta, revenue 0,
  achievement 0,00%**, dan customer-nya jatuh ke entitas grup. Karena customer-nya internal,
  `getCustRanking` melewatinya — **margin itu tidak masuk ranking customer mana pun**.
- Ranking customer Maret: PT. Karyawaja Ekamulia tampil **252,331 M**, seharusnya **377,706 M**.
- Margin% rantai KEM tampil **5,78%**, seharusnya **8,65%**.
- Total margin KPI TIDAK terpengaruh (kedua leg tetap terjumlah).

Disimulasikan atas data live: begitu nama ATL-000017 diselaraskan, selisih 125,375 M hilang jadi
0,000 dan KEM naik ke peringkat 3. Penyisiran 12 bulan: **hanya rantai ini** yang bocor dari
ranking customer sepanjang 2026.

**Belum diperbaiki** — perlu keputusan tim: bulan pengiriman yang benar April atau May.
Untuk konsolidasi yang penting hanya kedua nama SAMA.

## B. Margin ganda Hanwa 02 Phase 1 — dicatat, tidak diubah
PSF26-SPA-000004 (versi lama sebelum restrukturisasi) masih berdampingan dengan pasangan
penggantinya GIS-000003 + SPA-000005, sehingga margin Phase 1 terjumlah dua kali:
Rp 518,88 juta untuk deal senilai Rp 259,44 juta. Tonase & revenue tidak terpengaruh.
Tim menyatakan **"Beam di April sudah benar"** — tidak ada yang diubah.
Detail lengkap: `salespulse-ps-tanpa-item_2026-08-20_log.md`.

## C. RISIKO LATEN — tiga definisi "periode terfilter" hidup berdampingan
Di `assets/js/`:
1. `filterMonthIndices()` → FILTER_FROM..FILTER_TO (rentang yang dipilih user)
2. `getActiveMonthIndices()` → `[FILTER_MONTH]`, dan **12 bulan penuh** kalau FILTER_MONTH = -1
3. `getAnalyticsMonthIndices()` → `[FILTER_TO]` (MTD) atau `[0..FILTER_TO]` (YTD)

`setFilterRange` mengisi `FILTER_MONTH = (from === to) ? from : -1`. Artinya begitu user memilih
**rentang** (Q1, H1, Mar–May), definisi #2 berubah jadi "seluruh 12 bulan" — filternya diabaikan
diam-diam.

**Hari ini tidak berdampak**: `getActiveMonthIndices()` hanya dipanggil oleh `getActiveChains()`
dan `getActiveQtyData()`, dan **keduanya tidak dipanggil dari mana pun** (kode mati). Filter satu
bulan — yang dipakai sehari-hari — konsisten di ketiga definisi.

Risikonya muncul kalau suatu saat ada yang menyambungkan fungsi mati itu ke panel: panel tersebut
akan menampilkan setahun penuh sambil badge filter menulis "Q1". Sebaiknya kode matinya dihapus
atau `getActiveMonthIndices` disamakan dengan `filterMonthIndices`.

## D. Kebersihan data — `purchase_cost` tidak terbaca di 47 PS
9 PS lama bernilai 0, 38 PS lain bernilai ~0,005% dari revenue (mis. PSF26-ATL-000047:
revenue 24,4 miliar, purchase 1.354.400). Jelas bukan angka pembelian sebenarnya.

**Tidak ada dampak dashboard**: `purchase_cost` ditulis saat upload tapi **tidak dibaca oleh
konsolidasi maupun halaman mana pun** — margin diambil dari baris Net Margin di PS, bukan dari
revenue dikurangi purchase.

## E. Informasi bisnis — 10,2% margin 2026 tidak punya lawan budget
Produk dengan aktual tapi tanpa baris budget sama sekali:

| Produk | Margin 2026 | Volume |
|---|---|---|
| Seamless Pipe | 1.751,64 M | 1.275,0 MT |
| Beam | 908,01 M | 1.269,0 MT |
| As Steel | 105,36 M | 195,0 MT |
| Bar | 2,25 M | 13,5 MT |
| **Total** | **2.767,26 M** | |

Dari total margin aktual 2026 sebesar 27.051,40 M, berarti **10,2%** tampil sebagai "off-plan".
Sebaliknya HRPO (budget 600 M) dan Projects (budget 3.000 M) aktualnya nol sepanjang tahun.
Bukan bug — tapi selama budget-nya belum ada, achievement% per produk tidak pernah bisa utuh.

## F & G. Diperiksa, ternyata BUKAN anomali
- **13 item 0 kg di PSF26-BTS-000002.** Item 1–13 berkode `RM-AS-SCM440` (bahan baku,
  13 × 15.000 kg = 195.000 kg); item 14–26 berkode `FG-AS-SCM440` (barang jadi hasil potong,
  ukuran 16MM s/d 280MM) dengan berat 0. Nol itu **disengaja** — kalau diisi, tonasenya jadi
  dobel 390 ton. Harga Rp 13.856/kg untuk 195 ton wajar.
- **Youfa 10 punya margin tanpa revenue.** PSF26-ATL-000011.R3 adalah *parallel-parent*: namanya
  menyebut dua end-customer ("Sapta Sumber Lancar **dan** Karyawaja Eka Mulia"), dan
  `consolidation.php:451-472` memang membagi marginnya proporsional ke kedua anak lewat
  `customerSplit` (278,66 t : 69,01 t). Revenue induk sengaja tidak dihitung supaya tidak dobel
  dengan revenue anaknya. Bekerja benar.

## Yang diperiksa dan BERSIH (24)
Nomor PS ganda · `ps_items` yatim · produk di luar master/alias · produk kosong · rantai yang
antar leg-nya beda produk · bulan dashboard vs `po_date` · margin > revenue · margin% tersimpan
vs hitung ulang · berat tidak wajar (harga/kg di luar Rp 1.000–100.000) · budget untuk produk
asing · `plan_revisions` produk asing · `monthly_actuals` month_idx tidak valid · KPI total vs
jumlah rincian per produk (12 bulan) · volume dashboard vs tonase mentah `ps_items` (12 bulan) ·
bulan berisi PS tapi KPI nol · rantai dengan >1 leg eksternal ber-item (revenue dobel) · rantai
bermargin negatif · PS mata uang non-IDR · sebaran tahun · dan **41 nama customer** dicek satu
per satu terhadap `company-rank-exclusions.json` — tidak ada satu pun yang salah ditandai
grup/luar (salah tandai di sini akan menghilangkan atau menggandakan revenue tanpa jejak).

## File yang disentuh
- `tools/salespulse_audit.php` — BARU, 19 pemeriksaan per baris
- `tools/salespulse_audit_lanjutan.php` — BARU, 9 pemeriksaan struktural + ringkasan bulanan
- `logs/salespulse-audit-anomali_2026-08-20_log.md` — log ini

Tidak ada kode aplikasi dan tidak ada data sheet yang diubah dalam audit ini.

## Verifikasi / uji
- `php -l` bersih untuk kedua tool.
- `php salespulse/tests/util_test.php` → ALL PASS · `consolidation_test.php` → ALL PASS.
- Dampak temuan A diukur dengan menjalankan `sp_build_data` dua kali atas data live —
  sekali apa adanya, sekali dengan nama diselaraskan — lalu membandingkan ranking customer Maret.

## Sisa / risiko
- Temuan **A** menunggu keputusan bulan pengiriman yang benar, lalu satu field diselaraskan.
- Temuan **B** sengaja dibiarkan atas keputusan tim.
- Temuan **C** kode mati; aman hari ini, berbahaya kalau disambungkan tanpa disamakan dulu.
- Audit ini menyisir **data dan konsolidasi**, bukan render tiap panel. Parser PS
  (`app.js`, `let rowIndex = 22` yang hardcode) masih belum bisa dipastikan tanpa satu file PS
  contoh — lihat `salespulse-ps-tanpa-item_2026-08-20_log.md`.
