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

---

## Keputusan: input Sales jadi sumbernya (opsi 1)

Pemilik data memilih opsi 1. Diterapkan **per produk**, dan hanya bila lot
produk itu **LENGKAP** — setiap lot ber-MT punya `utilDate`, dan jumlahnya
sama dengan total per siklus dari master.

### Kenapa bersyarat, bukan borongan

Diukur dulu sebelum menukar sumber:

| | Jumlah |
|---|---|
| Produk **tanpa lot sama sekali** | **32** |
| Lot cocok dengan totalnya | 4 |
| **Lot belum lengkap** | **4** |
| Lot yang sudah punya `utilDate` | **0** |

Lot yang belum lengkap: HKG 250 dari 1.000 · JKT 100 dari 400 · IKM 2.000 dari
2.300 · SPA 400 dari 401. Menukar sumber secara borongan akan
**menghilangkan 1.351 MT seketika** dan menolkan 32 produk.

Dengan syarat "lengkap", peralihan terjadi **sendiri per produk** begitu Sales
selesai mengisi — tanpa ada tonase yang hilang di tengah jalan.

### Kekeliruan yang tertangkap verifikasi

Versi pertama memakai `lotUtilDate()` sebagai syarat kelengkapan. Fungsi itu
punya cadangan `pibDate` → `etaJKT`, sehingga empat produk yang lotnya hanya
berbekal PIB/ETA langsung dianggap layak — dan **650 MT bergeser keluar dari
H1** (12.525 → 11.875) begitu di-deploy.

Itu persis kekeliruan yang kolom `utilDate` dibuat untuk memperbaiki: PIB dan
ETA adalah tanggal **kedatangan**. Syaratnya diperketat jadi **wajib
`utilDate`**, dan angkanya kembali utuh.

### Verifikasi

Sesudah diperketat, **tidak ada satu angka pun yang bergeser**:

| Periode | Utilized | |
|---|---|---|
| Sepanjang waktu | 22.747 | ✓ |
| H1 2026 | 12.525 | ✓ |
| 1 Jan–5 Agu | 15.875 | ✓ |
| 2025 | 6.872 | ✓ |

**`tests/test_util_source_lot_vs_master.cjs`** (12 pernyataan) mengunci
aturannya: lot lengkap menang dan mengiris per tanggalnya (Des 0 · Jan 600 ·
Feb 400 · All Time 1.000); lot separuh, lot tanpa `utilDate`, dan lot yang
sebagian saja bertanggal — ketiganya kalah dari master; sifat partisi tetap
utuh.

Catatan: versi pertama tes ini memakai `new Date('YYYY-MM-DD')` yang dibaca
**UTC**, sehingga di WIB awal periode bergeser 7 jam dan tanggal pertama bulan
tersingkir — tiga kasus gagal palsu. Tanggal kini dibangun dari komponen lokal.

25 suite, 0 gagal.
