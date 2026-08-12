# [iqdash-cek-akhir-rumus-pdf-excel] 2026-08-12 — cek akhir: rumus, PDF, Excel

- **Pemicu:** *"Tolong pastiin agar apapun dan rumusnya jalan ya karna mau report ke direktur."*
- Audit sebelumnya menyasar **konsistensi** (angka sama di mana-mana). Cek ini
  menyasar **kebenaran** dan **jalur keluarnya**: PDF Summary & Export Excel —
  justru dokumen yang dilaporkan.

## Temuan: 4 penyimpangan, semuanya di jalur ekspor

| # | Di mana | Gejala (H1 2026) |
|---|---|---|
| 1 | PDF, bagian "Obtain vs Utilization" | Total Obtained **29.140** vs blok KPI **19.640** — SATU PDF, DUA angka |
| 2 | Excel, Total Realized | **10.412,217** vs kartu **15.438,208** |
| 3 | Excel, sheet Summary | Baris **Total Utilized** dan **Available Quota** tidak ada sama sekali |
| 4 | Excel, SPI/Pertek Obtained | **34.620** vs kartu **34.740** (All Time) — company PENDING hilang |

Semuanya kelas yang sama dengan yang dibereskan hari ini di kartu/drill/halaman:
**menyusun kolam sendiri, atau memakai basis all-time di atas kolam periode.**

1. Memakai `co.obtained` ALL-TIME atas `filteredSPI()` → kini
   `canonicalObtainedFiltered` atas `allCompaniesPool()`.
2. Menjumlah `ra_records.berat` (ringkasan manual satu-baris-per-company)
   alih-alih baris PIB. Penyimpangan ini sudah diperbaiki di halaman U&R
   2026-08-05; **salinannya di Excel terlewat waktu itu** → kini
   `reportRealizedTotal()`.
3. Dua dari lima angka laporan hilang dari file yang dikirim ke manajemen →
   ditambahkan dari helper kanonik.
4. `fSPI` (SPI saja) membuang PENDING yang kuotanya sudah terbit — SNSD 120 MT
   → kini `reportObtainedTotal()`.

## Cek kebenaran rumus (bukan sekadar konsistensi)

Diuji di 3 periode, semuanya lulus:

- `Available = Σ per company (obtained all-time − utilisasi all-time)`, clamp 0
- `Σ availableQuotaRows = Available`
- `Σ productTotals.avail = Available`
- `obtained − utilized = available` untuk **setiap** produk
- `Σ availableInPeriod(seluruh company) = Available`
- `Obtained = Σ canonicalObtainedFiltered per company`
- `Utilized = Σ scopedUtilTotal atas utilizationPool`
- `Approval Rate = Obtained ÷ Submitted`
- `Pending Shipment = Utilized − Realized`

## Cek runtime

31 builder dipaksa jalan di All Time dan H1 — **0 gagal, 0 error runtime,
console bersih**.

## Verifikasi akhir

**6 periode × (dashboard + PDF + Excel)** — semuanya cocok:

```
Tanpa filter ✔   H1 2026 ✔   Q1 2026 ✔   Q3 2026 ✔   Q4 kosong ✔   2025 ✔
```

**30 suite lulus** (16 node + 14 PHP).

## Sisa yang BUKAN soal kode

Dashboard konsisten & rumusnya benar. Yang belum: **dashboard vs master Excel**,
selisih 1.060 MT (CGK 300 + GKL/HDP/KAN 760) — menunggu keputusan data.
