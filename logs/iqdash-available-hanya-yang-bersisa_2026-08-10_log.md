# [iqdash-available-hanya-yang-bersisa] 2026-08-10 — Available Quota hanya memuat yang masih bersisa

- **Tanggal:** 2026-08-10
- **Oleh:** Claude Code
- **Pemicu:** tim menegaskan poin David — *"ADP obtained 350, sudah dipakai,
  kenapa masih ada di Available Quota? Seharusnya tidak ada. Bukan cuma ADP,
  GKL dan lainnya juga."*

## Duduk perkaranya

Ini **bukan** soal angkanya salah. Perbaikan sebelumnya sudah membuat ADP
tercatat terpakai 350 dari 350 dengan saldo **0**. Yang dikeluhkan: PT itu
**tetap terdaftar** di halaman Available Quota meski saldonya nol.

Sebabnya keempat pembangun halaman menyaring pada **`obtained > 0`**, bukan
**`available > 0`**:

| Pembangun | Berkas |
|---|---|
| `buildAvailableQuota()` — grafik | `04-charts.js` |
| `buildAvqTable()` — tabel | `19-init.js` |
| `buildAvqProdGrid()` — kartu per produk | `19-init.js` |
| `buildAvqProdChart()` — grafik per produk | `19-init.js` |
| `refreshAvqDrill()` — rincian kartu KPI | `03-kpis.js` |
| popup company per produk | `19-init.js` |

Akibatnya **24 dari 34 PT** muncul dengan sisa 0: AADC, ADP, AMP, BBB, BDG,
BHG, CGK, EMS, GAS, HDP, HKG, JKT, KARA, KJK, LCP, LSJ, MSN, NCT, PPGL, SGD,
SJH, SMS, SPA, SPP.

## Perubahan

Gerbangnya menjadi **saldo > 0** di keenam tempat.

Untuk dua agregasi per produk (`buildAvqProdGrid`, `buildAvqProdChart`),
penyaringan dilakukan **sesudah** penjumlahan — satu produk bisa habis di satu
PT tapi masih bersisa di PT lain, jadi menyaring per PT lebih dulu akan
menghilangkan produk yang sebenarnya masih ada.

Ambang `0.001`, bukan `0`, supaya sisa pembulatan pecahan tidak lolos sebagai
"masih ada".

## Verifikasi

| | Sebelum | Sesudah |
|---|---|---|
| PT di halaman Available Quota | 34 | **10** |
| PT bersaldo nol yang masih muncul | 24 | **0** |
| Total Available | 12.113 | **12.113** |

Total **tidak bergeser** — memang tidak boleh, karena yang dibuang menyumbang
nol. Jumlah PT di halaman kini sama dengan angka pada kartunya
(`reportAvailableTotal().companies` = 10): BTS, DIOR, GIS, GKL, GNG, IKM, KAN,
MIN, MJU, SNSD.

25 suite, 0 gagal.
