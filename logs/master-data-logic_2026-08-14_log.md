# Master Data Logic — keputusan tim 2026-08-14

**Sumber aturan:** keputusan tim (8 butir), dipakai sebagai aturan induk dashboard
**Master data:** `00 IQ Dash - Quota Data 110826 (dashboard master data).xlsx`
**Commit:** `5eac888` (mesin aturan) · `ce6965e` (pemeriksa aturan 4)
**Deploy:** `./deploy.sh iqdash` — 36 file, 0 gagal, dua kali

---

## Ringkas

| Aturan | Status |
|---|---|
| 1 · Total submission tiap cycle adalah master | **kode diubah** — Σ per-produk kini selalu = kartu |
| 2 · HDP Submit #3 = 3.000, Obtained #3 = 100, GL Alloy | **data diperbaiki** |
| 3 · LCP Submit #2 = 2.725 (bukan 3.000), Obtained #2 = 200 | **data diperbaiki** |
| 4 · Revisi = penggantian, hanya setelah PERTEK Perubahan terbit | **pemeriksa ditambahkan** — 1 temuan tersisa (SMS) |
| 5 · Total Submission kumulatif; Active Applications hanya cycle aktif | **kode diubah** |
| 6 · Obtained yang dikonfirmasi valid tetap terhitung | sudah benar; 1 pertanyaan penomoran (GKL) |
| 7 · Submit MOI SNSD = 17/06/2026 | **data diperbaiki** |
| 8 · Missing Product Breakdown jangan ditebak | **kode diubah** — ember bernama + laporan |

---

## Aturan 1 — total cycle adalah master

Dua cycle melanggarnya di data hidup, dan keduanya membuat satu baris disebut
dua angka: kartu headline membaca total cycle, kolom per-produk membaca rincian.

| Perusahaan | Cycle | Total cycle | Rincian produk |
|---|---|---|---|
| HDP | Submit #3 | 3.000 MT | **kosong** |
| HDP | Obtained #3 | 100 MT | **kosong** |
| LCP | Submit #2 | 2.725 MT | GL ALLOY **3.000** |
| ADP | Obtained #2 | 100 MT | GL ALLOY **350** (angka kumulatif di baris increment) |

`cycleProductsReconciled()` merekonsiliasi rincian ke total cycle memakai HANYA
yang sudah pasti — tidak ada nama produk yang ditebak:

- rincian **kosong** → seluruh total ke ember `(Product Breakdown Missing)`
- rincian **satu produk** → produk itu = total cycle (satu-satunya alokasi yang
  mungkin, bukan tebakan)
- rincian **kurang** → selisihnya ke ember tak-dirinci
- rincian **lebih dengan >1 produk** → dibiarkan dan **ditandai**; menskalakan
  turun berarti memutuskan produk mana yang dikurangi, dan itu tebakan

`scopedSubmittedByProd()` juga tidak lagi bercabang. Cabang All Time dulu memakai
`getSubmittedByProd()` (menjumlah rincian mentah) sementara cabang periode
membaca cycles sendiri — dua aturan, dua hasil. Sekarang satu jalur, sehingga
Σ per-produk **selalu** sama dengan `reportSubmittedTotal()`.

`scopedObtainedDetailByProd()` ikut direkonsiliasi. Dampaknya nyata: drill
Obtained ADP dulu membaca **600 MT** (250 + rincian 350) terhadap kartu 350 —
sekarang 350 = 350.

`submittedBreakdownIssues()` melaporkan setiap cycle yang rinciannya tidak
menutup totalnya, supaya "Missing Product Breakdown" ditanyakan, bukan ditebak.

## Aturan 4 — revisi adalah penggantian

Penjaganya sudah ada dan tidak diubah (`_isObtainedTerbit()` menggugurkan
Obtained yang tanggal terbitnya masih TBA). Yang ditambahkan `revisionRuleIssues()`
— pemeriksa yang menyisir seluruh perusahaan dan melaporkan produk hasil revisi
yang bocor ke obtained sebelum PERTEK Perubahannya terbit.

**PT MIN benar:** Wear Plate tetap 600 MT obtained, GI Alloy 353,2 belum muncul,
sesuai contoh di keputusan.

Pemeriksa versi pertama menuduh BHG, EMS dan SGD. Salah: GI Alloy mereka datang
lewat **Submit #2 ber-PERTEK** — jalur Re-Apply (aturan 5), bukan revisi. Master
mengonfirmasi ketiganya (BHG Obtained #2 = GI ALLOY 150, EMS 500, SGD 500).
Pemeriksa diperketat: produk yang kuotanya sah lewat `Obtained #N` yang sudah
terbit dilewati.

## Aturan 5 — Active Applications hanya cycle aktif

`activeApplicationCycle()` memulangkan cycle yang sedang berjalan. Modal Active
Application kini menyebut tipe + MT-nya, dengan catatan bahwa angka itu bukan
kumulatif:

```
AMP: Submit #2 · 2,600 MT      GKL: Submit #2 · 3,000 MT
DIOR: Submit #1 · 6,000 MT     GIS: Revision #1
```

Total Submission di Overview tetap menjumlahkan seluruh cycle.

## Perbaikan data yang dijalankan

Keempatnya lewat `patchCyclesToServer`, terverifikasi bertahan setelah reload:

| Perusahaan | Sebelum | Sesudah |
|---|---|---|
| HDP Submit #3 | 3.000 MT, produk kosong | 3.000 MT, **GL ALLOY 3.000** |
| HDP Obtained #3 | 100 MT, produk kosong | 100 MT, **GL ALLOY 100** |
| LCP Submit #2 | 2.725 MT, rincian GL ALLOY 3.000 | 2.725 MT, **GL ALLOY 2.725** |
| LCP Revision Request | 3.000 MT | **2.725 MT** (selaras aturan 3) |
| ADP Obtained #2 | 100 MT, rincian GL ALLOY 350 | 100 MT, **GL ALLOY 100** (master: 100) |
| SNSD Submit MOI | 17/07/2026 | **17/06/2026** |

Tanggal SNSD memindahkan 3.000 MT dari Juli ke Juni — itu memang konsekuensinya:

```
             sebelum      sesudah
H1 2026      66.745  ->   69.745
Juni 2026     8.920  ->   11.920
Juli 2026     8.600  ->    5.600
Q3 2026       8.600  ->    5.600
Sepanjang waktu 272.345 (tidak berubah)
```

## Verifikasi

**Uji otomatis** — `iqdash/tests/test_master_data_logic.cjs`, 30 assertion untuk
aturan 1–6 dan 8. 20 suite node lulus, 0 gagal.

**Audit di dashboard live sesudah deploy:**

- 25 builder × 12 periode + panel CorpSec/Sales + drawer untuk 41 perusahaan →
  **0 error**
- 12 periode × 6 identitas (Σ submitted per-produk = kartu · Σ obtained
  per-produk = kartu · Σ baris AVQ = kartu · jumlah perusahaan AVQ = kartu ·
  Σ per-produk = kartu · Σ golongan AA = total) → **nol selisih**
- `submittedBreakdownIssues()` → **0**
- `revisionRuleIssues()` → **1** (SMS, di bawah)

```
Tanpa filter sub 272345 · obt 34740 · util 23782 · real 15438 · avail 11178 · AA 6
H1 2026      sub  69745 · obt 19640 · util 12525 · real 15438 · avail 10958 · AA 3
Q3 2026      sub   5600 · obt  1380 · util  4385 · real     0 · avail  6445 · AA 6
2026 penuh   sub  75345 · obt 21020 · util 16910 · real 15438 · avail 11178 · AA 6
```

---

## Putaran kedua — keempat pertanyaan dijawab tim (sore 2026-08-14)

### 1. SMS — bukan pelanggaran

PERTEK Perubahan **TERBIT 26/06/2026**, SPI Perubahan **Terbit 10/07/2026**.
GI Alloy 150 MT memang produk final SMS, sudah terutilisasi 30/06/2026
(ETA Jakarta 18/09/2026). Kedua tanggal itu ditulis ke siklus
`Revision Request — SHEETPILE`, dan pemeriksa aturan 4 kini mengakui
`pertekDate`/`spiDate` pada siklus revisinya sendiri sebagai bukti terbit —
sebelumnya ia hanya melihat siklus Obtained hasil revisi.
`revisionRuleIssues()` sekarang **kosong**.

### 2. GKL — typo, bukan data

Dikonfirmasi: seharusnya **Obtained #2**, dan GKL memang belum pernah Submit #3.
Dashboard sudah benar; tidak ada perubahan.

### 3. GKL · KAN · HDP — utilisasi dashboard yang benar

Dikonfirmasi ketiganya **sudah terutilisasi** dan Available = **0 MT**. Jadi
angka dashboard yang benar dan master yang tertinggal. Tidak ada perubahan.

### 4. CGK — tiga cycle, ditulis penuh

| Cycle | Submit | Obtained | PERTEK | Submit MOT | SPI | Utilisasi |
|---|---|---|---|---|---|---|
| 1 | GI Alloy 6.000 · 16/10/25 | 800 | 29/10/25 | 30/10/25 | 07/11/25 | 800 · 18/11/25 |
| 2 | GI Alloy 2.200 · 25/02/26 | 220 | 17/04/26 | 20/04/26 | 29/04/26 | 220 · 30/04/26 |
| 3 | GL Alloy 3.000 · 30/06/26 | 300 | 07/08/26 | 10/08/26 | **TBA** | belum |

Yang lama (`Revision Request — GI ALLOY` + `Obtained #2` bertanda `_fromRevReq`)
diganti dengan enam siklus di atas. `utilCycles` CGK sudah benar sejak awal
(800 @ 18/11/2025 + 220 @ 30/04/2026), jadi tidak disentuh.

**Satu jebakan yang perlu diingat.** Available 300 MT-nya semula menempel ke
GI Alloy, bukan GL Alloy, walau `company_product_stats` sudah direkonsiliasi.
Sebabnya `iqdash/data/quotaLedger.json` — snapshot BEKU master (regen
03/08/2026) yang menjadi sumber tunggal Obtained/Utilized/Available per produk.
`iq_apply_ledger()` membangun peta per-produk **hanya** dari entri di berkas
itu, jadi produk yang tidak tercantum tidak akan pernah muncul, berapa pun yang
ditulis ke sheet. Cycle 3 CGK lahir sesudah regen, jadi tidak ada entrinya.
Ditambahkan `"7225.99.90": {"obtained": 300, "util": 0}` — bentuk yang sama
dengan GKL. **Setiap kuota baru yang lahir setelah 03/08/2026 akan kena hal
yang sama sampai ledgernya di-regen.**

Hasilnya: Submit **11.200** · Obtained **1.320** · Utilisasi 1.020 (GI Alloy) ·
Available **300 MT GL Alloy**, dan CGK muncul di tabel Available Quota dengan
dua baris (GI Alloy 0, GL Alloy 300). Active Application: **Submit #3 · 3.000 MT**.

### Angka akhir sesudah putaran kedua

```
Tanpa filter sub 277545 · obt 35260 · util 23782 · real 15438 · avail 11478 (9 co) · AA 6
H1 2026      sub  74945 · obt 19860 · util 12525 · real 15438 · avail 11258 · AA 4
Q3 2026      sub   5600 · obt  1680 · util  4385 · real     0 · avail  6745 · AA 6
2026 penuh   sub  80545 · obt 21540 · util 16910 · real 15438 · avail 11478 · AA 6
```

Audit ulang: 25 builder × 12 periode + panel + drawer 41 perusahaan → **0 error**;
12 periode × 6 identitas → **nol selisih**; `submittedBreakdownIssues()` → **0**;
`revisionRuleIssues()` → **0**.

### ETA Jakarta SMS — 18/09/2026, 150 MT, utilisasi 30/06/2026

Diminta tim menyusul. Yang menahan sebelumnya: menaruh ETA di lot shipment
melewati recompute `baseline + lotSum` di server, yang MELIPATGANDAKAN utilisasi
produk yang angkanya berasal dari baseline master dan bukan dari lot — SMS 150
akan jadi 300. Tampilannya memang tertutup cap ledger (`min(obtained, …)`),
tapi sheet-nya tersimpan salah dan akan muncul begitu ledger di-regen.

Tempat yang benar ternyata sudah ada: `company_product_stats.eta_jkt`, yang
dikirim payload sebagai `etaByProd` dan **dirender sebagai kolom ETA JKT** di
tabel Realization Monitoring (06-tables-util-ra.js). Endpoint tulisnya di server
sengaja DATE-ONLY — "tidak bisa memindahkan satu MT pun" — hanya saja sisi
klien tidak pernah mengirimnya, jadi kolom itu selama ini cuma bisa diisi
importer. Ditambahkan ke `patchToServer`, dikirim HANYA bila sengaja disiapkan
lewat `co._etaWrite`, sama seperti `_obtainedStats`.

Aman untuk tanggal utilisasi karena SMS punya `utilCycles`: sumber utama tanggal
utilisasi adalah `utilCycles[].date`, dan `etaByProd` hanya cadangan untuk
perusahaan yang belum punya rincian per siklus. Terverifikasi:

| | |
|---|---|
| ETA JKT | **18/09/2026** |
| Tanggal utilisasi (`utilCycles`) | 30/06/2026 — tidak berubah |
| Utilisasi SMS | **150 MT** (bukan 300) |
| Utilisasi di Juni 2026 | 150 MT ✔ |
| Utilisasi di September 2026 | 0 ✔ — ETA tidak menyeret tonasenya |
| Obtained / Available | 150 / 0 — tidak berubah |

Seluruh angka headline tidak bergeser: sub 277.545 · obt 35.260 · util 23.782 ·
avail 11.478. Audit ulang: 0 error, nol selisih, `submittedBreakdownIssues()` 0,
`revisionRuleIssues()` 0.
