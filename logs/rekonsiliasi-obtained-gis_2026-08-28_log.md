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

## Putaran kedua — ADP, HDP, MSN, SPA (28-Agu-2026)

Tim menjawab pertanyaan yang ditahan: **yang benar 450 / 1.100 / 350 / 515** — angka
utilisasi yang betul, angka awal yang usang. Sasaran di skrip disetel ulang ke situ,
lalu dijalankan `--only=ADP,HDP,MSN,SPA --apply`.

Ternyata **hanya SPA yang perlu diubah**: `available_mt` ADP/HDP/MSN sudah 0 dan
stats-nya memang sudah 450/1.100/350. Yang dibuang 515,5 MT saldo basi SPA
(BORDES 514,5 + GI 1). Kolom `companies.obtained` ketiganya ikut dihitung ulang
(350→450, 1.000→1.100, 250→350) — kolom denormalisasi yang memang harus mengikuti stats;
tidak berpengaruh ke tampilan karena frontend menimpanya dengan `canonicalObtained()`.

Cadangan kedua: `backups/iqdash_sebelum_reconcile_2026-08-28_023542.json`.

## Sisa / risiko

1. **KONTRADIKSI YANG BELUM SELESAI — 301 MT.** Sesudah kedua putaran:

   | | |
   |---|---:|
   | kartu Overview (siklus) | 35.260 |
   | tabel PERTEK & SPI (master per-produk) | 35.561 |

   | Company | siklus | master | selisih |
   |---|---:|---:|---:|
   | ADP | 350 | 450 | +100 |
   | HDP | 1.000 | 1.100 | +100 |
   | MSN | 250 | 350 | +100 |
   | SPA | 515 | 516 | +1 |

   Kalau 450/1.100/350 memang benar, maka ketiga company itu punya **100 MT obtained yang
   siklus `Obtained #N`-nya belum pernah dicatat**, dan kartu Overview **kurang 300 MT** —
   seharusnya 35.560, bukan 35.260.

   Tapi tim juga menyatakan master mereka **35.260**, yang justru sama persis dengan
   siklus. Dua pernyataan itu tidak bisa benar bersamaan. **Belum diputuskan.**

   Penyelesaiannya: kalau 450/1.100/350 benar, catat 3 siklus Obtained yang hilang lewat
   "📌 Catat Terbit" (butuh tanggal + nomor PERTEK/SPI-nya dari CorpSec). Angka itu tidak
   boleh ditebak.

   SPA +1 MT murni pembulatan (GI 400 vs 401, BORDES 115 vs 114).

2. **Cadangan ada di `backups/iqdash_sebelum_reconcile_2026-08-28_022511.json`** (3 tab utuh).
   Folder `backups/` di-gitignore, jadi berkas ini hanya ada di mesin lokal.

3. **Angka Utilized berubah 24.182 → 25.996 bukan karena penulisan ini.** Pembanding 24.182
   berumur ~15 jam; tim menambah utilisasi dalam rentang itu. Dibuktikan dengan membangun
   payload memakai tabel cadangan: Σ utilizationByProd identik sebelum dan sesudah.
