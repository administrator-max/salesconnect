# [iqdash-audit-semua-halaman-drill] 2026-08-12 — audit SEMUA halaman & drill

- **Tanggal:** 2026-08-12
- **Oleh:** Claude Code
- **Pemicu:** *"Coba cek lagi semua halaman, jangan sampai ada yang beda lagi."*
  Audit sebelumnya hanya menyasar permukaan Available Quota.

## Temuan: dua drill masih memakai logika lama

Audit sebelumnya memeriksa halaman, **bukan modal drill-down**. Di situlah
sisanya bersembunyi. Untuk H1 2026:

| Drill | Kartu | Modal | |
|---|---:|---:|---|
| Utilized | 12.525 | **9.605** | ✖ |
| Obtained | 19.640 | **29.120** | ✖ |
| — Submit | 66.745 | **220.020** | ✖ |
| — Available | 11.058 | **13.630** | ✖ |
| Submitted | 66.745 | 66.745 | ✔ |
| Available | 11.058 | 11.058 | ✔ |

### Sebab 1 — drill Utilized: kolamnya lebih sempit dari kartunya

`refreshUtilDrill()` menyusuri `kpiPool()`, sedangkan `reportUtilizedTotal()`
memakai `utilizationPool(kpiPool())` yang **melebarkannya** dengan company yang
PERTEK-nya di luar jendela tapi **kargonya masuk**. Company yang memakai kuota
di dalam periode hilang dari rinciannya. Tile Obtained-nya juga menjumlah
`co.obtained` ALL-TIME atas `filteredSPI()`.

Kolamnya disamakan; tile Obtained memakai `reportObtainedTotal()`.

### Sebab 2 — drill Obtained: empat metrik, empat kolam

Ringkasannya punya lima tile (Submit · Obtained · Utilized · Available ·
Companies) yang **semuanya dijumlah dari satu tabel silang**. Itu tidak mungkin
benar, karena keempat metrik punya kolam kanonik yang berbeda:

```
Submitted   allCompaniesPool + gerbang tanggal Submit MOI per siklus
Obtained    allCompaniesPool + gerbang PERTEK terbit per siklus
Utilized    utilizationPool  (dilebarkan: kargo masuk periode)
Available   availablePool    (saldo kumulatif, gerbang terbit s/d akhir)
```

Satu tabel yang menyusuri SATU kolam tidak akan pernah mereproduksi keempatnya.

**Keputusan: menghapus angka yang tidak bisa dijamin benar, bukan menambalnya.**
Drill ini dibuka dari kartu Obtained, jadi tugasnya menjelaskan Obtained — kini
hanya **Total Obtained + Companies**, langsung dari `reportObtainedTotal()`.
Kolom Submit/Utilized/Available tetap ada di tabel sebagai konteks per baris,
dengan keterangan bahwa totalnya ada di kartu masing-masing.

Percobaan menambal keempatnya sempat dilakukan dan **gagal** — dicatat di sini
supaya tidak diulang: menyeragamkan basis per produk membuat Obtained cocok di
2 dari 4 periode saja, sementara Submit/Utilized/Available tetap meleset.

### Dua bug yang saya buat sendiri saat menambal, lalu ketahuan verifikasi live

1. `scopedSubmittedByProd()` tidak mengkanonikkan kunci di cabang All Time —
   `getSubmittedByProd()` memakai ejaan siklus mentah (`GL BORON`) sementara
   jalur obtained sudah kanonik (`GL ALLOY`). Drill menggabungkan keduanya lalu
   melihat SATU produk sebagai DUA dan menghitungnya dua kali: Available terbaca
   14.553 terhadap kartu 11.178.
2. Memakai `scopedObtainedByProd()` yang jatuh ke stats saat All Time; stats
   bisa melenceng dari cycles → Obtained terbaca 34.840 vs kartu 34.740.

Keduanya diperbaiki sebelum hasil akhir.

## Tes

`test_metrics_single_source.cjs`: larangan "permukaan tidak boleh memanggil
`utilizationPool()`" diberi **pengecualian sesempit mungkin** — hanya
`refreshUtilDrill`, hanya fungsi itu — dan dipasangkan dengan assertion
kebalikannya (**drill itu WAJIB memakainya**). Tanpa pasangan itu, pengecualian
ini cuma jadi lubang.

Alasannya: larangan itu menyasar surface yang menyusun kolam sendiri **lalu
menjumlah sendiri**. Drill tidak menjumlah total apa pun — ia merinci total yang
sudah dihitung helper, jadi ia HARUS menyusuri kolam yang persis sama.
Melarangnya justru melahirkan bug ini.

## Verifikasi akhir (dashboard live)

**12 periode × 11 permukaan × 4 metrik** — kartu Overview (Submitted, Obtained,
Utilized, Available), kartu halaman AVQ (3), badge chart, grid By Product, baris
TOTAL tabel AVQ, kolom tabel All Companies, strip U&R — **tidak ada satu pun
selisih**:

```
Tanpa filter  ✔   sub 272.345 · obt 34.740 · util 23.782 · avail 11.178
H1 2026       ✔   sub  66.745 · obt 19.640 · util 12.525 · avail 11.058
Q1 2026       ✔   sub  10.950 · obt  8.650 · util  6.014 · avail  5.180
Q2 2026       ✔   sub  55.795 · obt 10.990 · util  6.511 · avail  6.278
Q3 2026       ✔   sub   8.600 · obt  1.280 · util  4.385 · avail  6.345
Q4 kosong     ✔   0 semua
Jun 2026      ✔   sub   8.920 · obt 10.040 · util  2.241 · avail  5.825
Aug 2026      ✔   sub       0 · obt    120 · util    760 · avail    120
2025          ✔   sub 197.000 · obt 13.820 · util  6.872 · avail    853
2024 kosong   ✔   0 semua
1 hari        ✔   sub   6.000 · obt  8.600 · util  1.051 · avail  5.825
YTD           ✔   sub  75.345 · obt 20.920 · util 16.910 · avail 11.178
```

**Keempat drill cocok dengan kartunya di 8 periode** yang diuji (Obtained,
Utilized, Submitted, Available).

**16 suite node + 14 PHP = 30 suite lulus, 0 gagal.**

## Yang MASIH terbuka (bukan konsistensi tampilan)

Dashboard konsisten dengan dirinya sendiri. Yang belum: **dashboard vs master
Excel**, selisih 1.060 MT — menunggu keputusan data, bukan perbaikan kode:

1. CGK — siklus yang tertimpa bug re-apply (300 MT). Perlu import master.
2. GKL / HDP / KAN (760 MT) — master 11 Agu mencatat utilisasinya 0, dashboard
   punya lot Sales bertanggal 5/7/10 Agu. Perlu konfirmasi mana yang benar.
