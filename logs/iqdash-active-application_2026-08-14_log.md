# [iqdash-active-application] 2026-08-14 — Active Revisions → Active Application

- **Pemicu:** IKM berstatus **"Submit"** di SPI/PERTEK — jelas sedang berproses
  — tapi tidak muncul di Active Revisions, sementara DIOR dan GIS muncul.

## Sebabnya: dua fungsi saling bertentangan

```
hasOutstandingCycle(IKM) -> true   (Obtained #2 belum bertanggal)
outstandingStage(IKM)    -> null   (tidak ada Submit #2 pasangannya)
```

`outstandingStage()` hanya menyusuri pasangan **Submit #N / Revision #N**. IKM
punya `Obtained #2` **tanpa tanggal dan tanpa Submit #2** — revisinya diajukan
lewat form Sales, bukan siklus baru. Karena `revisionStatus()` memakai
`outstandingStage()`, IKM tergolong `completed` dan hilang dari daftar.

Celah kedua: IKM punya **dua Sales Revision Request yang belum diputus
CorpSec** — permohonan yang jelas berjalan, tapi tidak pernah dilihat sama
sekali oleh daftar itu.

## Perubahan

`activeApplicationStage(co)` menutup kedua celah **di atas** logika lama,
supaya golongan yang sudah benar tidak bergeser:

1. request Sales yang belum diputus CorpSec → permohonan berjalan
2. Obtained yatim tanpa tanggal → ditangkap lewat `hasOutstandingCycle()`
3. belum pernah obtained sama sekali → **New Submission**

`activeApplications()` mengembalikan **empat golongan** atas kolam
**SPI + PENDING** — bukan `filteredSPI()` saja, karena New Submission justru
hidup di PENDING:

| Golongan | Arti |
|---|---|
| 🆕 New Submission | pengajuan pertama, belum punya obtained |
| 🔄 Revision | perubahan produk/qty dari PERTEK sebelumnya |
| 📨 Re-Apply | pengajuan tambahan produk/MT |
| ⏳ PERTEK Pending | PERTEK sudah terbit, SPI belum |

Kartu insight, strip Overview, dan modal kini memakai **satu sumber**
(`activeApplications()` + `AA_GROUPS`). Sebelumnya ketiganya menyusun kolam
sendiri dari `filteredSPI()` + tiga status — bisa menyebut angka berbeda, dan
New Submission tak pernah terhitung.

Label: **Active Revisions → Active Application**.

## Hasil di data live

```
Revision   CGK · DIOR · GIS · IKM     ← IKM muncul; CGK & AMP ternyata juga
Re-Apply   AMP · GKL                     terlewat selama ini
Total      6   (sebelumnya 3)
```

## Catatan: angka Available bergeser karena DATA, bukan kode

Saat audit, Available H1 terbaca **10.958** (audit sebelumnya 11.058).
`LAST_DATA_UPDATE` = **14 Agu 02:25 UTC** dan ada siklus DIOR bertanggal
14-Aug-26: DIOR kini punya `Revision Request — BORDES ALLOY` dan `Obtained #1`
tanpa tanggal, sehingga PERTEK-nya jatuh ke Submit #1 (20/07/2026) — di LUAR
H1, jadi DIOR keluar dari kolam H1 (−100 MT).

Perubahannya dari orang yang sedang bekerja di dashboard, bukan dari perubahan
kode. Yang penting: **seluruh permukaan tetap menyebut angka yang sama**.

## Verifikasi

12 periode × 11 permukaan × 4 metrik + 4 drill + konsistensi Active Application
(strip vs modal vs kartu insight, dan setiap company di modal harus ada di
`activeApplications()`) — **nol selisih**.

Tes baru `test_active_application.cjs` (21 assertion) memakai bentuk IKM, DIOR,
GKL yang sebenarnya, termasuk penjagaan bahwa ketiga permukaan tidak boleh
menyusun kolamnya sendiri lagi.

**18 suite node + 14 PHP = 32 lulus, 0 gagal.**
