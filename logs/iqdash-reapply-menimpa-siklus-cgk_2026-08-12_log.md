# [iqdash-reapply-menimpa-siklus-cgk] 2026-08-12 — pencatatan re-apply menimpa siklus sebelumnya

- **Tanggal:** 2026-08-12
- **Oleh:** Claude Code
- **Pemicu:** rincian CGK dari pemilik data (Submit #2 → Obtained #2 220 MT GI,
  Submit #3 → Obtained #3 300 MT GL), yang tidak cocok dengan isi dashboard.

## Bug: form re-apply selalu menulis ke "Obtained #2"

Ketiga penulis di `13-rev-mgmt.js` — `rrApplyObtained()`, `rrSaveStatus()`,
`rrMarkApproved()` — mencari siklus sasarannya dengan

```js
(co.cycles||[]).find(c => /^obtained\s*#2/i.test(c.type) || /^obtained.*revision/i.test(c.type))
```

yaitu **selalu "Obtained #2"**, berapa pun nomor pengajuan yang sedang dicatat,
lalu menimpa `mt` dan `products`-nya.

Akibatnya: **begitu sebuah company mengajukan re-apply KETIGA, pencatatannya
MENGHAPUS catatan re-apply KEDUA.** Bukan menambah — menimpa.

## Yang terjadi pada CGK

Master (05 Agu 2026) mencatat lengkap dan benar:

```
baris 39  Submit #2            GI BORON 2.200   Submit MOI 25/02/26 · PERTEK Perubahan 17/04/26
baris 40  Obtained #2          GI BORON   220   Submit MOT 20/04/26 · SPI Perubahan  29/04/26
baris 41  Utilization #2 (MT)            220
baris 42  Utilization #2 (date)          30/04/26
baris 43  Submit #3                    3.000   Submit MOI 30/06/26 · PERTEK Perubahan 2 = TBA
```

Dashboard hanya menyimpan **satu** siklus `Obtained #2` berisi **300 MT
GL ALLOY tanpa tanggal sama sekali**, bertanda `_fromRevReq`.

Jadi ketika re-apply #3 dicatat lewat form pada 10 Agu, ia menemukan
`Obtained #2` (220 MT GI ALLOY, SPI 29/04/26) dan **menimpanya**. 220 MT itu
lenyap dari cycles — tersisa hanya di `company_product_stats` (obtained GI ALLOY
1.020 = 800 + 220). **Itulah drift 220 MT yang selama ini ditandai
`__auditObtained()` tanpa diketahui sebabnya.**

Dashboard juga kehilangan Submit #2 dan Submit #3 (keduanya ada di master).

## Perbaikan

`rrObtainedTypeFor(co)` menurunkan nomor siklus dari pengajuan yang **sedang
berjalan**:

- `Submit #N` → `Obtained #N`
- `Revision #N` → `Obtained (Revision #N)`
- pengajuan tidak terbaca → nomor obtained tertinggi + 1 (**menambah**, tidak
  pernah menimpa)

`rrFindOrCreateObtained(co, seed)` mencocokkan **tepat** dengan tipenya, bukan
pola longgar `/^obtained #2/` yang menyeret siklus lain. Ketiga penulis kini
lewat sana.

Pembaca form (yang mengisi kolom Obtained MT) ikut diarahkan ke siklus yang sama
dengan yang akan ditulis — kalau tidak, form menampilkan angka siklus lain
daripada yang akan ditimpanya.

## Tes

`test_reapply_tidak_menimpa_siklus.cjs` (17 assertion), memakai bentuk CGK yang
sebenarnya:

- `Submit #3` aktif → sasarannya **`Obtained #3`**, bukan `#2`
- mencatat Obtained #3 **tidak menyentuh** MT, produk, maupun tanggal SPI
  Obtained #2
- memanggil dua kali tidak menggandakan siklus
- company yang baru re-apply **pertama** tetap dapat `Obtained #2`
- `Revision #N` dipetakan ke `Obtained (Revision #N)`
- struktural: tidak ada penulis yang boleh mematok `/^obtained #2/` lagi

**30 suite lulus** (16 node + 14 PHP).

## Sisa: memulihkan data CGK

Kode sudah aman, tapi **data CGK yang telanjur rusak tidak pulih sendiri.** Yang
perlu ada:

| Siklus | MT | Produk | Tanggal | Ada di master? |
|---|---:|---|---|---|
| Submit #2 | 2.200 | GI ALLOY | PERTEK Perubahan 17/04/26 | ✔ |
| Obtained #2 | 220 | GI ALLOY | SPI Perubahan 29/04/26 | ✔ |
| Utilization #2 | 220 | GI ALLOY | 30/04/26 | ✔ (sudah masuk dashboard) |
| Submit #3 | 3.000 | GL ALLOY | PERTEK Perubahan 2 **07/08/26** | sebagian — masternya masih TBA |
| Obtained #3 | 300 | GL ALLOY | SPI belum terbit | ✘ lebih baru dari master |

**Jalur yang disarankan: import ulang master** (Import Master punya langkah
preview diff), karena master sudah memuat Submit #2 / Obtained #2 /
Utilization #2 dengan benar. Sisanya — PERTEK Perubahan 2 tanggal 07/08/26 dan
Obtained #3 300 MT — dicatat lewat form Revision Management yang kini sudah
diperbaiki, atau ikut di export master berikutnya.

Setelah lengkap:

```
obtained  = 800 + 220 + 300 = 1.320
utilisasi = 800 + 220       = 1.020
available =                     300 MT · GL ALLOY
```

sesuai keterangan pemilik data, dan drift `__auditObtained()` ikut hilang.

Tanggal/nomor dokumen tidak dikarang sendiri — diambil dari master atau dari
pemilik data.
