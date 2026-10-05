# IQ Dash — realisasi per produk dibaca dari baris PIB, bukan taksiran

**Tanggal:** 2026-10-05
**Modul:** IQ Dash (Import Quota Monitor)

## Ringkasan

Saat memastikan realisasi BTS 188,993 MT (PIB 649867, Wear Plate / Bordes
Alloy) untuk Operations, tabel **Utilization & Realization** dan **Re-Apply /
Realization** ternyata menulis BTS Bordes 241,419 dan AS Steel 241,419 — padahal
AS Steel tidak pernah direalisasikan. Total company-nya benar (1.609,461), tapi
`splitRealPd()` membagi total itu ke produk menurut **porsi obtained**
(900 : 900 : 1.000 : 3.200) bila company tidak punya `realizationByProd`.

Padahal setiap baris PIB sudah membawa produk/HS-nya.

| BTS | Sebelum | Sesudah (= PIB) |
|---|---|---|
| Bordes Alloy | 241,419 | **188,993** |
| AS Steel | 241,419 | **—** (belum ada PIB) |
| Sheet Pile | 858,379 | **424,638** |
| Seamless Pipe | 268,244 | **995,830** |

## Perubahan

- `02-period-filter.js` — `realizedByCompanyProd()`: realisasi per company per
  produk dari baris PIB, dengan kolam & gerbang tanggal yang sama dengan
  `realizedByCompany()`. Produk dibaca: kolom `product` → HS produk milik company
  itu → HS di master produk; sisanya `__tanpa`.
- `06-tables-util-ra.js` — `splitRealPd()` menerima angka PIB per produk dan
  mendahulukannya; hanya sisa yang tak terpetakan dibagi dengan porsi lama
  (Σ baris tetap = total). Dipakai kedua tabel (periode & seumur).
- `06-tables-util-ra.js` — sel realisasi produk yang belum punya PIB kini "—
  Real pending" (utilisasinya di tooltip). Dulu cadangan itu mencetak angka
  utilisasi di kolom realisasi; sebelumnya jarang menyala karena taksiran selalu
  memberi angka, sekarang produk yang memang nol membuat Σ anak > induk.
- `index.html` — `02-period-filter.js?v=21`, `06-tables-util-ra.js?v=17`.
- `tests/test_realisasi_per_produk_dari_pib.cjs` — uji baru.

## Radius (data live 05-Okt, 30 company berealisasi)

10 company berubah, semua ke arah angka PIB: AMP, BDG, BHG, BTS, CGK, EMS, GKL,
SPA kini persis = PIB. Dua masih menyisakan taksiran untuk bagian yang tak
terpetakan:
- **SGD** — PIB mencatat 291,448 MT GL Alloy, padahal SGD hanya memegang GI &
  Sheet Pile. Kemungkinan HS di file PIB keliru — perlu dicek Ops.
- **IKM** — PIB 645559 (1.925,278 MT) tanpa HS.

## Verifikasi

- Uji baru (All Time, H1 2026, Okt 2026): Σ per produk = realisasi company,
  Σ pembagian = total, company terpetakan penuh = angka PIB persis, produk tanpa
  PIB tidak diberi taksiran. Gagal di kode lama.
- 50 uji `.cjs` lulus (termasuk `test_realized_tabel_sama_kartu.cjs`, yang
  menangkap regresi sel "Util · Real pending" sebelum diperbaiki).
- Pratinjau: kartu Realized tetap 22.383,501; self-check tanpa temuan baru.
