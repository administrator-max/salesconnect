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

## Yang MASIH perlu keputusan (tidak diubah — di luar yang dikonfirmasi)

### 1. SMS — satu-satunya pelanggaran aturan 4 yang tersisa

| | |
|---|---|
| Master | Obtained #1 = **SHEET PILE 150 MT** |
| Siklus dashboard | `Obtained #1` = SHEET PILE 150 |
| Yang dibaca kolom per-produk | **GI ALLOY 150** |
| Bukti revisi | `Revision Request — SHEETPILE` → GI ALLOY 150, **PERTEK Perubahan belum terbit** |

Menurut aturan 4, selama PERTEK Perubahan belum terbit dashboard harus tetap
membaca **SHEET PILE 150 MT**. Memperbaikinya berarti mengubah alokasi produk
SMS di `company_product_stats` — tidak termasuk yang dikonfirmasi, jadi tidak
disentuh.

### 2. GKL — nomor cycle-nya

Keputusan menyebut "GKL → GL Alloy = 600 MT, **Obtained #3**". Master dan
dashboard sama-sama mencatatnya sebagai **Obtained #2**, dan GKL tidak punya
Submit #3. Nilainya (600 MT GL Alloy) sudah terhitung obtained dengan benar;
yang berbeda hanya penomorannya. Mengganti nomornya tanpa Submit #3 pasangannya
akan memutus penjodohan siklus, jadi dibiarkan sebagai Obtained #2.

### 3. Tiga lot utilisasi yang tidak ada di master

| Perusahaan | Utilisasi dashboard | Utilisasi master | Available master | Available dashboard |
|---|---|---|---|---|
| GKL | 3.000 MT | 2.400 MT | 600 MT (GL Alloy) | 0 |
| KAN | 140 MT | 80 MT | 60 MT (GI Alloy) | 0 |
| HDP | 1.000 MT | 900 MT | 100 MT (GL Alloy) | 0 |

Di ketiganya, MT yang dikonfirmasi valid sebagai **obtained** pada aturan 6 juga
tercatat sebagai **utilisasi** di dashboard, sehingga Available-nya nol. Aturan 6
hanya bicara obtained, jadi utilisasinya tidak disentuh.

### 4. CGK

Belum diperbaiki — perlu keputusan cara impornya (lihat pembahasan terpisah).
Master: Submit 11.200 · Obtained 1.320 · Available 300 GL Alloy.
Dashboard: Submit 6.000 · Obtained 800 · Available 0.
