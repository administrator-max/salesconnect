# [iqdash-penamaan-produk-kanonik] 2026-08-12 — penamaan produk seragam + hasil re-check re-apply

- **Tanggal:** 2026-08-12
- **Oleh:** Claude Code
- **Pemicu:** pemilik data, dua permintaan sekaligus —
  1. *"Data Selisih kayanya karena data dashboard yg tidak nge-link (please
     re-check!) … data tsb merupakan obtained quota re-apply, yg seharusnya
     otomatis masuk juga kedalam available quota."*
  2. *"GI Alloy dan GI Boron itu SAMA artinya, tolong penamaan diseragamkan ke
     GI ALLOY."*

## 1. Hasil re-check: re-apply SUDAH masuk ke available

Diperiksa seluruh 41 company. **Tidak ada masalah linking.** Setiap MT re-apply
sudah berada di dalam `canonicalObtained`, dan karena `cumulativeAvailable =
obtained − utilized`, otomatis ikut ke Available:

| CO | Re-apply | canonicalObtained | Isi |
|---|---:|---:|---|
| GKL | 600 | 3.000 | 2.400 (Obtained #1) + **600** |
| KAN | 60 | 140 | 80 (Obtained #1) + **60** |
| HDP | 200 | 1.000 | 800 + **100** + **100** |

16 company punya siklus re-apply; semuanya terhitung.

Hanya **dua** siklus Obtained yang dibuang di seluruh sistem, keduanya dengan
alasan yang benar:

- **CGK Obtained #2 (300 MT)** — ditandai artefak revision-request (`_fromRevReq`)
- **GAS Obtained #2 (0 MT)** — memang nol

Jadi Available yang 0 pada GKL/KAN/HDP **bukan** karena re-apply-nya hilang,
melainkan karena ada catatan **utilisasi** yang jumlahnya persis sama dengan
kuota re-apply itu, bertanggal tepat setelah kuotanya terbit:

| CO | Kuota re-apply | Utilisasi tercatat | Tanggal | vs master (05 Agu) |
|---|---:|---:|---|---|
| GKL | 600 (GL) | lot 600 MT | 05 Agu 2026 | hari yang sama |
| KAN | 60 (GI) | lot 60 MT | 07 Agu 2026 | sesudah |
| HDP | 100 (Obt #3) | Utilization #3 100 MT | 10 Agu 2026 | sesudah |

Ketiganya **lebih baru** dari file master, jadi wajar master belum memuatnya.
Pola ini identik dengan IKM Seamless 275 MT — yang setelah di-crosscheck ternyata
**memang benar ada**. Ketiganya perlu crosscheck yang sama sebelum disimpulkan.

Bukti bahwa aritmetikanya konsisten: buang ketiga catatan utilisasi itu, dan
Available-nya jadi persis angka master — GKL 3.000−2.400 = **600**, KAN
140−80 = **60**, HDP 1.000−900 = **100**.

### Temuan susulan: CGK

Satu-satunya company dengan **drift cycles vs stats** dan satu-satunya yang
**utilisasinya melampaui obtained**:

```
CGK  obtained (cycles) 800  ·  stats 1.020  ·  utilisasi 1.020  →  kelebihan 220 MT
```

Penjaga bawaan dashboard (`__auditObtained()`) sudah menandainya. Perlu
diperiksa terpisah — kemungkinan terkait Obtained #2 (300 MT) yang ditandai
artefak revision-request.

## 2. Penamaan produk diseragamkan

Dua ejaan hidup berdampingan di sumber yang berbeda: `cycles[].products`,
`salesRevRequest`, `co.products`, dan `ra.product` menyimpan ejaan **ledger**
(GI BORON / GL BORON / SHEETPILE / "GI Boron"), sedangkan
`company_product_stats` sudah kanonik (GI ALLOY / SHEET PILE).

Selama ini yang dikanonikkan hanya jalur **angka**; jalur **tampilan** dibiarkan
mentah — jadi satu produk yang sama muncul dengan dua nama di layar. Kelas
masalah yang sama dengan "satu angka, tiga tampilan" yang dibereskan hari ini.

Dua helper baru di `01-data.js`:

- `prodLabel(p)` — nama produk untuk ditampilkan, selalu kanonik
- `canonProdInText(s)` — kanonikkan nama yang **tertanam** di dalam string yang
  dibangun sistem (mis. cycle type `"Revision Request — GI BORON"`)

Diterapkan di **20+ titik render** yang ditemukan dengan menyisir DOM live, bukan
menebak: daftar revisi, pil produk Pending, Rev Request, before/after, blok
perubahan produk di drawer, tabel lot, Re-Apply Request Details, form shipment,
tabel utilisasi & realisasi, dan tabel PDF/Excel export.

**Yang sengaja TIDAK disentuh:**

- **Key, atribut, dan handler** (`data-prod`, `onclick="addSalesLot('…')"`) —
  itu kunci pencarian, bukan label; mengubahnya merusak form.
- **Data tersimpan** — ejaan di DB urusan migrasi tersendiri. Menormalkannya
  diam-diam lewat jalur simpan berarti mengubah data tanpa diminta.
- **Catatan bebas yang diketik orang** — 3 tersisa, semuanya di field
  `spiRef`:
  ```
  GKL  SPI TERBIT 24/12/25 · GI BORON +100 MT util · ETA 31 May 2026
  NCT  ✅ SPI TERBIT 05/12/25 · GI BORON 150 MT · Revision Cancelled
  SPP  ✅ SPI TERBIT 16/12/25 · GI BORON 250 MT · Revision Cancelled
  ```
  Itu rekaman apa yang ditulis seseorang pada satu waktu. Menulis ulangnya
  berarti mengubah arsip, bukan menyeragamkan tampilan.

### Satu perbaikan susulan di OU chart

`OU_PROD_COLORS` dikunci dengan ejaan ledger DAN menyimpan label sendiri
("GI Boron"). Keduanya bermasalah setelah penyeragaman: pencarian gagal begitu
pemanggil mengirim nama kanonik (produk jatuh ke abu-abu), dan labelnya
memunculkan kembali ejaan lama di legenda.

`ouPC()` kini mencocokkan kunci lewat bentuk kanonik — ejaan lama maupun baru
sama-sama ketemu, **warnanya utuh** — dan labelnya selalu dari `prodLabel()`.

## Verifikasi

Disisir di dashboard live, **41 company, satu per satu drawer-nya dibuka**:

| | Sebelum | Sesudah |
|---|---:|---:|
| Permukaan menampilkan ejaan lama | 8 company + Overview | **0** |
| Sisa (catatan bebas, sengaja) | — | **3** (`spiRef` GKL/NCT/SPP) |
| Warna OU chart | — | utuh (GI ALLOY & GI BORON → `#ca8a04`) |

Tidak ada angka yang bergeser; ini murni penamaan. **28 suite lulus, 0 gagal.**

## Tindak lanjut

1. **Crosscheck utilisasi GKL / KAN / HDP** seperti yang sudah dilakukan untuk
   IKM — ketiganya bertanggal setelah master, jadi belum tentu keliru.
2. **Periksa CGK** — utilisasi 220 MT melebihi obtained.
3. Bila ejaan di DB ingin ikut dinormalkan (bukan cuma tampilan), itu migrasi
   satu kali tersendiri yang perlu diminta eksplisit.
