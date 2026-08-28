# Rekonsiliasi Obtained — siklus duplikat GIS + saldo basi 5 company
- **Tanggal:** 2026-08-28
- **Oleh:** Claude Code (permintaan & angka dari tim Sales/CorpSec)

## Ringkasan
Kartu Overview "SPI / PERTEK Obtained" membaca **35.335 MT** sementara master tim
**35.260 MT**. Selisih **75 MT** ternyata satu baris siklus duplikat di GIS. Sekaligus
dibersihkan saldo `available_mt` basi pada 5 company yang membuat tabel PERTEK & SPI
melaporkan 37.825,5 MT — angka yang tidak pernah cocok dengan kartu mana pun.

## Akar masalah

**1. Siklus duplikat GIS.** GIS punya dua baris untuk satu peristiwa yang sama:

| Siklus | MT | Produk | SPI Terbit |
|---|---:|---|---|
| `Obtained (Revision #1)` | 400 | WSSP 325 + FSPF 75 | 18/08/2026 |
| `Obtained #2` | 75 | FSPF 75 | 18/08/2026 |

`Obtained #2` mengulang komponen FSPF 75 yang **sudah ada di dalam** revisi — tanggal SPI
sama, produk sama, MT sama. `canonicalObtained()` menjumlah `Obtained #N` saja, jadi
GIS terhitung 400 + 75 = 475, padahal hanya 400.

Dikonfirmasi tim 27-Agu-2026: *"GIS 75 MT itu terduplikat, GIS hanya punya total 400 MT"*,
dengan PERTEK Perubahan 11/08/2026 dan SPI Perubahan 18/08/2026 — keduanya sudah benar
tercatat, hanya baris duplikatnya yang salah.

**2. Saldo basi di `company_product_stats`.** Produk yang sudah dipindahkan revisi masih
memegang `available_mt`, sehingga tabel PERTEK & SPI (yang membaca util+avail) melaporkan
2.490 MT lebih banyak daripada kartu (yang membaca siklus).

## Yang diubah

- `cycles` — baris `GIS · Obtained #2` **dihapus** (1 baris).
- `company_product_stats` — **6 sel `available_mt`** di-nol-kan:
  MJU Hollow Pipe 800, GIS Sheetpile 400, BDG GI Alloy 300, SMS Sheetpile 150,
  BDG Bordes Alloy 50, BHG GI Alloy 50.
- `companies` — `obtained` & `available_quota` dihitung ulang untuk 5 company itu.

`utilization_mt` **tidak disentuh sama sekali** — sumbernya lot pengapalan, direkonsiliasi
lewat jalur lain. Diverifikasi: 0 perubahan.

## Hasil (terukur, terisolasi terhadap cadangan)

| | Sebelum | Sesudah |
|---|---:|---:|
| Σ `companies.obtained` | 35.335 | **35.260** ✅ master tim |
| Σ `availableByProd` | 11.709,5 | 9.959,5 |
| Σ `utilizationByProd` | 25.996 | **25.996** (nol perubahan) |

GIS di seluruh permukaan: WSSP **325** + FSPF **75** = **400 MT**, PERTEK 11/08/2026,
SPI 18/08/2026, keduanya 🟢 Active, Validity 31/12/2026. Sheet Pile → ⚪ Inactive, saldo 0.
MJU: HRPO Alloy **200 MT** Active; Hollow Pipe & Bordes Alloy saldo 0.

Ekspor Excel dan PDF memakai fungsi yang sama (`spiTerbitRows()`, `availableQuotaRows()`),
jadi keduanya ikut otomatis.

## Verifikasi
- 14 pemeriksaan lulus (`scratchpad/verifikasi.cjs`) atas payload live sesudah penulisan.
- Perbandingan sel-demi-sel terhadap cadangan: **6 sel `available_mt` berubah, 0 sel
  `utilization_mt`, 0 kolom lain, 0 baris hilang/bertambah** selain 1 siklus GIS.
- Tidak ada saldo dari SPI Inactive yang tersisa di Available Quota.
- Σ Obtained tabel per company = Σ master per-produk untuk seluruh 41 company.

## Sisa / risiko

1. **Tabel PERTEK & SPI masih 815,5 MT di atas kartu** — seluruhnya dari 4 company yang
   **sengaja tidak disentuh**: ADP +100, HDP +100, MSN +100, SPA +515,5.
   Pada keempatnya `utilization_mt` **melebihi** angka obtained yang diberikan tim
   (ADP 450 vs 350, HDP 1.100 vs 1.000, MSN 350 vs 250, SPA 115 vs 114) — artinya tercatat
   memakai kuota lebih banyak daripada yang diperoleh. Menyetel available ke 0 tidak
   menyelesaikannya, malah menaikkan obtained ke tingkat utilisasi. **Tim harus memutuskan
   mana yang benar** sebelum ini disentuh. Skripnya sudah siap: `--only=ADP,HDP,MSN,SPA`.

2. **Cadangan ada di `backups/iqdash_sebelum_reconcile_2026-08-28_022511.json`** (3 tab utuh).
   Folder `backups/` di-gitignore, jadi berkas ini hanya ada di mesin lokal.

3. **Angka Utilized berubah 24.182 → 25.996 bukan karena penulisan ini.** Pembanding 24.182
   berumur ~15 jam; tim menambah utilisasi dalam rentang itu. Dibuktikan dengan membangun
   payload memakai tabel cadangan: Σ utilizationByProd identik sebelum dan sesudah.
