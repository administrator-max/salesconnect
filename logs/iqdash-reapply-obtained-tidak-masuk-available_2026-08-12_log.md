# [iqdash-reapply-obtained-tidak-masuk-available] 2026-08-12 — kuota re-apply lewat form Revision Management permanen tidak terlihat

- **Tanggal:** 2026-08-12
- **Oleh:** Claude Code
- **Pemicu:** pemilik data — *"obtained quota re-apply, yg seharusnya otomatis
  masuk juga kedalam available quota"*, ditegaskan lagi dengan rincian CGK.

## Dugaan mereka benar, penelusuran pertama saya keliru

Pemeriksaan pertama menyimpulkan "tidak ada masalah linking" karena seluruh 16
company yang punya siklus re-apply memang terhitung. **Kelompok yang saya
periksa salah.** Company-company itu siklusnya datang dari **import master**, dan
siklus dari master tidak pernah bertanda `_fromRevReq`.

Yang terjebak adalah siklus yang dibuat lewat **UI Revision Management**.

## Bug-nya

`rrApplyObtained()` / `rrMarkApproved()` / `rrSaveStatus()` di `13-rev-mgmt.js`
membuat placeholder:

```js
{ type:'Obtained #2', mt:null, products:{}, submitDate:'TBA',
  releaseDate:'TBA', _fromRevReq:true }
```

Lalu alur yang **sama** mengisi `mt`, `products`, dan tanggal SPI/PERTEK ketika
kuotanya benar-benar terbit — **tetapi tidak pernah membersihkan penandanya.**

Sementara itu `canonicalObtained()` menggugurkan `_fromRevReq` **tanpa syarat**,
sebelum sempat memeriksa apakah siklus itu sudah jadi obtained yang sah:

```js
if (c._fromRevReq) return;                    // ← selalu gugur
if (!_isObtainedTerbit(c, allCycles)) return;
```

Akibatnya: **setiap kuota re-apply yang dicatat lewat form itu permanen tidak
terlihat** — tidak masuk Obtained, karena itu tidak pernah muncul di Available.
Persis yang dilaporkan.

## Perbaikan

Penandanya menandai **PLACEHOLDER**, bukan "bukan obtained". Begitu siklusnya
punya MT nyata dan tanggal terbit nyata, ia obtained yang sah — dan uji untuk itu
sudah ada tanpa perlu penanda: gerbang `mt <= 0` dan `_isObtainedTerbit()`.
Placeholder murni (mt null, tanggal TBA) tetap gugur di sana.

`_fromRevReq` tidak lagi menggugurkan di jalur **OBTAINED**:
`canonicalObtained`, `canonicalObtainedFiltered`, `scopedObtainedDetailByProd`,
dan `getCycleBreakdown` mode obtained.

Jalur **SUBMIT** sengaja **tidak diubah** — `canonicalSubmitted`,
`canonicalSubmittedFiltered`, `getSubmittedByProd`, `reportSubmittedTotal` tetap
menggugurkannya.

Tidak ada risiko hitung ganda: `canonicalObtained` hanya menjumlah tipe
`/^obtained #/`, sedangkan siklus `"Revision Request — <produk>"` bukan tipe itu.

Diperbaiki di sisi **BACA**, bukan sisi tulis — supaya data yang sudah telanjur
bertanda ikut pulih tanpa migrasi.

## Dampak sekarang: NOL — dan itu penting untuk dipahami

Setelah deploy, total dashboard tetap **11.178 MT**. Hanya dua siklus obtained
di seluruh sistem yang bertanda `_fromRevReq`, dan keduanya tetap tidak
terhitung karena alasan lain yang sah:

| CO | Siklus | MT | Tanggal terbit | Kenapa masih tidak terhitung |
|---|---|---:|---|---|
| CGK | Obtained #2 | 300 (GL ALLOY) | **kosong semua** | belum terbit — gerbang tanggal |
| GAS | Obtained #2 | **0** | 27/04/2026 | mt = 0 |

Jadi perbaikan ini **menutup jebakan**, bukan menggeser angka hari ini. Tanpa
perbaikan ini, CGK akan tetap tidak muncul **bahkan setelah tanggal SPI-nya
diisi** — jebakannya baru terasa persis pada saat orang mengira sudah
membereskannya.

## CGK: sisanya adalah DATA, bukan kode

Keterangan pemilik data:

> 220 MT GI Alloy = obtained #2 dari re-apply #2, sudah diutilisasi 220 MT pada
> 30 Apr 26. Re-apply #3 pada GL Alloy 3.000 MT → obtained #3 = 300 MT, belum
> terutilisasi. Sehingga available CGK ada pada GL Alloy 300 MT.

Keadaan data dashboard sekarang:

```
Submit #1                      6.000 MT GI BORON   PERTEK 29/10/2025
Obtained #1                      800 MT GI BORON   SPI    07/11/2025   ✓ terhitung
Revision Request — GI ALLOY    3.000 MT → GL ALLOY  dikonfirmasi CorpSec 10-Agu-26
Obtained #2                      300 MT GL ALLOY   TANPA TANGGAL       ✗ belum terbit

utilCycles:  Utilization #1  GI ALLOY  800 MT  18/11/2025
             Utilization #2  GI ALLOY  220 MT  30/04/2026   ← ada, cocok keterangan
stats:       obtained GI ALLOY 1.020  ·  utilisasi 1.020  ·  available 0
```

**Dua lubang data:**

1. **Obtained #2 = 220 MT GI ALLOY tidak punya siklus.** Angkanya hanya ada di
   stats (obtained GI 1.020 = 800 + 220). Inilah sebab drift cycles(800) vs
   stats(1.020) yang ditandai `__auditObtained()` — satu-satunya di sistem.
2. **Siklus 300 MT GL ALLOY belum punya tanggal PERTEK/SPI.** Padahal menurut
   pemilik data kuotanya sudah terbit.

Setelah keduanya diisi:

```
obtained  = 800 + 220 + 300 = 1.320
utilisasi = 800 + 220       = 1.020
available =                     300 MT  ·  GL ALLOY     ← sesuai keterangan
```

Tanggal SPI/PERTEK-nya tidak saya karang — itu harus dari dokumen aslinya.

## GKL / KAN / HDP

Dinyatakan pemilik data sudah dicek di master dan **tidak ada yang kelebihan**.
Ditutup, bukan temuan.

## Tes

`test_reapply_obtained_masuk_available.cjs` (14 assertion):

- placeholder murni (mt null, tanggal TBA) **tidak** menambah obtained
- placeholder yang **sudah terisi** MT + tanggal SPI **wajib** menambah obtained,
  dan saldonya muncul di produk yang benar (GL ALLOY, bukan GI ALLOY)
- siklus "Revision Request" tidak ikut terjumlah (tidak ada hitung ganda)
- jalur SUBMIT tetap menggugurkan artefak
- struktural: `_fromRevReq` tidak boleh kembali jadi gerbang di jalur obtained,
  dan **harus** tetap jadi gerbang di jalur submit

**29 suite lulus, 0 gagal** (15 node + 14 PHP).
