# [iqdash-satu-sumber-utilisasi-final] 2026-08-10 — GKL selesai; frontend berhenti menghitung sendiri

- **Tanggal:** 2026-08-10
- **Oleh:** Claude Code
- **Pemicu:** tim melaporkan tanggal utilisasi GKL yang diisi atasan **hilang**,
  dan menyebutkan tanggal yang benar: **05 August 2026**.

## Soal "hilang" — tidak bisa direproduksi

Jalur simpannya diuji ujung-ke-ujung persis seperti pemakaian nyata: buka
dropdown company → GKL → ketik di kolom Tgl Utilisasi → picu event `input`.

```
getCurrentEditCo = GKL
input ditemukan  = true
model sesudah ketik = "05 August 2026"
tersimpan di server = "05 August 2026"
```

Berkas yang terpasang di server juga diperiksa: kolom, input, handler,
pengumpul saat simpan, dan payload — semuanya ada.

Petunjuk yang tersisa: `lastUpdate` masih **08:02 pagi**, artinya sepanjang
siang **tidak ada satu pun tulisan** yang sampai ke server. Dugaan paling masuk
akal: halaman yang dipakai atasan dimuat **sebelum** kolom itu ter-deploy,
sehingga JS-nya versi lama. **Tidak dipastikan** — hanya dugaan; kalau terulang
sesudah muat-ulang paksa (Ctrl+F5), berarti ada sebab lain dan perlu ditelusuri
lagi.

Tanggalnya kini tersimpan.

## Yang benar-benar rusak: helper frontend jadi sumber kedua

Sesudah tanggal terisi, muncul ketidakselarasan baru:

| | Nilai |
|---|---|
| Server `utilizationMT` | **3.000** ✓ |
| Frontend `allTimeUtil()` | **2.400** ✗ |

Sebabnya `allTimeUtil()` menjumlah `utilCycles` **sendiri**. Itu benar selama
`utilCycles` satu-satunya sumber — tapi begitu server ikut melipat lot Sales
bertanggal (perbaikan sebelumnya hari ini), perannya **terbalik**: server benar,
helper tertinggal.

Menjumlah ulang di frontend hanya menciptakan sumber kedua — persis yang
seluruh rangkaian perbaikan ini hapus.

**`01-data.js`** — `allTimeUtil()` kini cukup membaca `co.utilizationMT`, dan
`allTimeUtilByProd()` membaca `co.utilizationByProd`. Keduanya menyusut jadi
satu baris.

**`02-period-filter.js`** — cabang All Time `scopedUtilByProd()` langsung
mengembalikan `co.utilizationByProd`.

Server kini **satu-satunya** yang menghitung utilisasi.

## Hasil

| GKL | Sebelum | Sesudah |
|---|---|---|
| Obtained | 3.000 | 3.000 |
| Used | 2.400 | **3.000** |
| Available | 600 | **0** |
| Di halaman Available Quota | ya | **tidak lagi** |

Total bergerak sebagaimana mestinya — 600 MT berpindah dari "tersedia" ke
"terpakai":

| | Sebelum | Sesudah |
|---|---|---|
| Utilized | 22.847 | **23.447** |
| Available | 12.113 | **11.513** |
| Pending Shipment | 7.408,79 | **8.008,79** |
| Utilized Agustus 2026 | 100 | **700** |

600 MT mendarat di **Agustus**, sesuai tanggal 05/08/2026. Partisi tetap utuh,
dan **seluruh PT selaras** antara total dan Σ per produk.

25 suite, 0 gagal.
