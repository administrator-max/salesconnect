# [iqdash-kpi-pooling] 2026-08-04 — KPI berhenti menyalin ulang aturan; pool utilisasi ikut tanggal per-produk

- **Tanggal:** 2026-08-04
- **Oleh:** Claude Code
- **Pemicu:** pengecekan tampilan dashboard setelah semua perbaikan — angka di
  KARTU KPI ternyata masih berbeda dari fungsi yang menghitungnya.

## Ringkasan
Fungsi-fungsi periode sudah benar sejak `iqdash-report-metrics-one-source`,
tapi **kartu KPI tidak memakainya**. Filter Juni menampilkan Obtained **890 MT**
padahal nilai sebenarnya **10.040 MT**. Dua sebab terpisah:

### 1. `03-kpis.js` menyimpan salinan aturan obtained sendiri
Blok KPI Obtained memuat ulang seluruh aturan — dedup, `_fromRevReq`, gerbang
terbit, sandaran periode — di bawah komentar yang mengklaim *"Mirrors
canonicalObtainedFiltered so the two Obtained paths stay in sync"*. Salinan itu
tetap menyimpang: masih bersandar **SPI dulu**, dan memanggil
`_isObtainedTerbit(c)` **tanpa** `allCycles` sehingga gerbang PERTEK tak pernah
aktif.

Diganti dengan pemanggilan langsung `canonicalObtainedFiltered()` /
`canonicalObtained()`. Salinan yang harus disamakan manual adalah pola
kegagalan yang sama dengan pemisahan ledger/cycles yang baru saja dihapus —
sekarang tiap aturan punya **satu** implementasi.

### 2. `companiesWithLotsInPeriod()` hanya melihat lot
Pool company untuk KPI Utilized menyaring lewat lot bertanggal. Sejak tanggal
utilisasi pindah ke `etaByProd`, company yang tanggalnya ada di sana tak pernah
masuk pool — **BDG 350 MT dan KARA 100 MT hilang dari Juni** meski
`scopedUtilTotal()` menghitungnya dengan benar.

Sekarang pool memakai `scopedUtilByProd()` itu sendiri, jadi pool dan totalnya
sejalan secara konstruksi. Sekalian: iterasinya diperlebar ke **gabungan**
produk stats dan produk lot, supaya produk yang baru punya lot (belum punya
baris stats) tidak ikut hilang — regresi ini tertangkap `test_period_dates.cjs`.

Ditambah `_canonProd()`: pembungkus aman untuk `canonicalProduct()` yang
tinggal di `01-data.js`, supaya modul ini tetap bisa di-`require()` sendiri
oleh tes Node.

## Verifikasi — kartu KPI live vs master

| | All Time | Juni 2026 | Juli 2026 |
|---|---|---|---|
| Submitted | 277.545 ✓ | 14.920 ✓ | 5.600 ✓ |
| Obtained | 34.840 ✓ | 10.040 ✓ | 1.160 ✓ |
| Utilized | 22.547 ✓ | 4.166 ✓ | 3.700 ✓ |
| Realized | 15.438,208 ✓ | 2.275,372 ✓ | 0 ✓ |

Uji: **PHP 352 assertion, 0 gagal · 6 suite JS, 0 gagal.**

## Sisa — satu pertanyaan definisi: Available saat difilter
Kartu Available memakai penjumlahan **per-company yang dijepit di 0**,
sedangkan spesifikasi menyebut *"available = obtain − utilized"* (agregat):

| Periode | Agregat obtain−utilized | Per-company dijepit (tampil sekarang) |
|---|---|---|
| Juni | 5.874 | **8.850** |
| Juli | 0 | **1.160** |

Selisihnya berasal dari company yang MEMAKAI kuota di periode itu padahal
kuotanya TERBIT di periode sebelumnya — misalnya IKM memakai 2.300 MT di Juli
dari kuota yang terbit Juni. Per-company itu angka negatif, dijepit jadi 0.

Keduanya bisa dibenarkan: agregat mengikuti rumus apa adanya, sedangkan
penjepitan mencegah "available negatif" untuk sebuah company. Di All Time
keduanya identik (12.293) karena tak ada company yang util-nya melebihi
obtained sepanjang waktu. **Belum diubah — menunggu keputusan pemilik data.**
