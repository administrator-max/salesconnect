# [iqdash-kartu-pending-shipment] 2026-08-10 — Kartu Total Submitted diganti Total Pending Shipment

- **Tanggal:** 2026-08-10
- **Oleh:** Claude Code
- **Pemicu:** permintaan tim — kartu paling kiri di Overview diganti menjadi
  **Total Pending Shipment**, isinya **Utilized − Realized**.

## Yang diukur lebih dulu — dan kenapa rumusnya tidak diterapkan mentah

Pengurangan **per periode** rutin menghasilkan angka **negatif**:

| Periode | Utilized | Realized | Selisih |
|---|---|---|---|
| Sepanjang waktu | 22.747 | 15.438,21 | **+7.308,79** |
| H1 2026 | 12.525 | 15.438,21 | **−2.913,21** |
| Q1 2026 | 6.014 | 6.684,21 | **−670,21** |
| Q2 2026 | 6.511 | 8.754 | **−2.243** |

Sebabnya: **6.872 MT dipakai sepanjang 2025 dengan NOL realisasi** — barangnya
baru tiba di 2026. Jadi di jendela 2026, realisasi melampaui pemakaian.

"Belum terkirim" adalah **stock** (berapa yang sedang di jalan saat ini), bukan
**flow** (berapa yang bergerak dalam jendela). Karena itu dihitung
**kumulatif**, persis seperti Available: periode menyaring **company**-nya,
bukan mengiris saldonya. Kolamnya sengaja dibuat **sama dengan
`reportAvailableTotal()`** supaya dua kartu yang sama-sama stock tidak pernah
menghitung populasi berbeda.

Sesudah diterapkan begitu, **tidak ada periode yang negatif**:

| Periode | Pending | Company |
|---|---|---|
| Sepanjang waktu | 7.308,79 | 30 |
| H1 2026 | 7.214,78 | 24 |
| Q1 2026 | 2.940,67 | 13 |
| Q2 2026 | 6.538,34 | 23 |
| Q3 2026 | 4.816,69 | 17 |
| 2025 | 3.378,45 | 23 |

Diperiksa juga per company: **tidak ada satu pun** yang realisasinya melebihi
utilisasinya, jadi angkanya tidak perlu dijepit secara artifisial.

## Perubahan

**`02-period-filter.js`** — `reportPendingShipmentTotal()` (baru), mengembalikan
`{ mt, companies, utilized, realized }`.

**`index.html`** — kartu pertama jadi *Total Pending Shipment*, `onclick` ke
drill barunya.

**`03-kpis.js`** — pengisian kartu + `openPendingShipDrill()`: rincian per
company (Utilized · Realized · Pending · % belum tiba), urut dari yang terbesar,
klik baris membuka drawer company. Modalnya dibangun di JS, bukan ditambahkan
ke `index.html`, supaya tidak ada blok HTML baru yang harus dijaga sinkron.

**Total Submitted tetap dihitung** — Approval Rate di kartu Obtained memakainya
(terverifikasi masih 12,8%), begitu pula PDF Summary dan drill-down Submission.
Yang hilang hanya tampilannya di Overview.

## Verifikasi

```
Total Pending Shipment  7,309 MT · 30 companies in transit
                        22,747 utilized − 15,438.208 realized
```

Drill: 30 baris, terbesar IKM 2.300 (100% belum tiba) · BTS 677 (42%) ·
SGD 504 (20%) · EMS 501 (24%).

Kartu lain tidak bergeser: Obtained 34.740 · Utilized 22.747 · Realized
15.438,208 · Available 12.213.

Realisasi di drill ditampilkan **dengan desimalnya** (15.438,208 dan 943,558),
mengikuti kartu Total Realized. Versi pertama memakai `fmtMt()` sehingga tertulis
15.439 — persis ketidakseragaman yang dulu tim keluhkan.

25 suite, 0 gagal.

## Catatan kinerja

Versi pertama `reportPendingShipmentTotal()` menyapu seluruh 200+ baris PIB
**untuk setiap company** hanya demi menghitung jumlah company. Peta realisasi
kini dibangun sekali di awal.
