# [iqdash-tanggal-utilisasi-per-lot] 2026-08-07 — Kolom Tgl Utilisasi di form Sales

- **Tanggal:** 2026-08-07
- **Oleh:** Claude Code
- **Pemicu:** David (Sales) — *"pas gw input utilization ga ada tanggal utilize-nya
  tuh. Bisa tolong ditambahin?"*

## Masalah

Form **Utilization per Product / Shipment Lot** hanya punya kolom **ETA JKT**,
dan tanggal itu **dipaksa menjadi pengganti** tanggal utilisasi:

```js
function lotUtilDate(lot) {           // sebelum
  return pDate(lot.pibDate) || _parseEtaLoose(lot.etaJKT);
}
```

ETA JKT bahkan **diwajibkan** saat menyimpan utilisasi, dengan pesan
*"tanpa tanggal, MT ini tidak masuk filter periode"*.

Padahal keduanya **peristiwa berbeda**: ETA JKT adalah perkiraan barang **TIBA**,
utilisasi adalah saat kuota **DIPAKAI** — rutin berjarak berbulan-bulan. Contoh
dari data sendiri: HKG dipakai 8 Jul tapi ETA 15 Sep; IKM 24 Jul vs September;
BDG 30 Jun vs 31 Agu. Ironisnya keterangan itu sudah tertulis di docblock
`scopedUtilByProd()` sejak 2026-08-04 — sumber datanya diperbaiki, formnya
tidak.

## Perubahan

**Skema** — kolom `util_date` disisipkan ke `company_shipments`, tepat setelah
`util_mt`. Baris lama dibiarkan **kosong**, tidak ditebak dari `eta_jkt`:
menyalin tanggal kedatangan ke kolom pemakaian justru mengabadikan kekeliruan
yang sedang diperbaiki. Alat: `tools/add_lot_util_date.js` (punya mode uji coba
dan verifikasi baca-balik). Cadangan:
`backups/company_shipments_sebelum_util_date_2026-08-07.json`.

**`iqdash_data.php` / `iqdash_write.php`** — `utilDate` dibaca dan ditulis
pada tiap lot.

**`02-period-filter.js`** — `lotUtilDate()` kini:

```
utilDate  ->  pibDate  ->  etaJKT
```

Dua yang belakangan tetap ada sebagai **cadangan** untuk lot lama yang telanjur
tersimpan tanpa `utilDate`. Begitu `utilDate` terisi, ia yang menang.

**`11-shipment.js`** — kolom **"Tgl Utilisasi"** ditambahkan sebelum ETA JKT.
Kewajiban **berpindah**: sekarang Tgl Utilisasi yang wajib, ETA JKT jadi
informasi biasa. Pesan galat, penanda merah, pengumpul data saat simpan, dan
daftar input yang dinonaktifkan semuanya ikut disesuaikan. PIB date dari Ops
tetap diterima sebagai pemenuh, sama seperti sebelumnya.

## Verifikasi

Uji tulis-baca pada lot nyata (MIN / BORDES ALLOY lot 1), lalu **dikembalikan**:

| | Hasil |
|---|---|
| Tulis `utilDate: "05 Feb 26"` | HTTP 200, tersimpan |
| Baca balik | `utilDate: "05 Feb 26"` ✓ |
| `lotUtilDate()` dengan utilDate 05 Feb + PIB 01/12/2025 + ETA 15 Sep | **5 Feb 2026** ✓ mengutamakan utilDate |
| Pulihkan ke kosong | ✓ data nyata tidak berubah |

24 suite, 0 gagal.

## PERLU DIPUTUSKAN — tanggal ini belum berpengaruh untuk kebanyakan PT

Sejak `cycle_utilization` masuk (2026-08-05, "master jadi sumber"),
`scopedUtilByProd()` memakai `utilCycles` sebagai **sumber utama** dan berhenti
di situ:

```js
if (Array.isArray(uc) && uc.length) { ...; return out; }   // lot tidak dibaca
```

Saat ini **30 PT** punya `utilCycles`. Untuk mereka, tanggal yang diisi Sales
di form **tidak akan menggeser angka periode** — angkanya tetap datang dari
master. Kolom ini baru berpengaruh untuk PT yang belum punya rincian per siklus.

Jadi kolomnya sudah benar dan datanya tersimpan, tapi **dua pintu masuk untuk
utilisasi** kini berdampingan: master (per siklus) dan form Sales (per lot).
Perlu keputusan pemilik data:

1. **Input Sales mengalir ke `cycle_utilization`** — form jadi pintu resmi,
   master untuk koreksi massal; atau
2. **Lot menang untuk produk yang punya lot bertanggal**, master mengisi
   sisanya; atau
3. **Master tetap satu-satunya sumber angka**, kolom Sales hanya catatan
   operasional — perlu dinyatakan di form supaya Sales tidak mengira angkanya
   akan berubah.

Belum diambil sepihak: ketiganya mengubah angka periode secara berbeda, dan itu
keputusan pemilik data.
