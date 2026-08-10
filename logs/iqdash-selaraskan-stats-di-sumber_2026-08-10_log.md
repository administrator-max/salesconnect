# [iqdash-selaraskan-stats-di-sumber] 2026-08-10 — Kolom stats diselaraskan di server, bukan ditambal per pembaca

- **Tanggal:** 2026-08-10
- **Oleh:** Claude Code
- **Pemicu:** sesudah bug yang sama muncul **tiga kali** di permukaan berbeda,
  pemilik data meminta akarnya ditutup.

## Masalah

Sejak 2026-08-05 `cycle_utilization` adalah **sumber** utilisasi, tapi
`company_product_stats.utilization_mt` / `available_mt` tetap dikirim apa
adanya — dan kolom itu **tidak pernah diperbarui** saat utilisasi bertambah.

Jadilah dua angka untuk satu ukuran. Tiap pembaca yang kebetulan menyentuh
kolom lama menampilkan yang basi:

| Ditemukan | Permukaan |
|---|---|
| 2026-08-05 | total (`allTimeUtil`) |
| 2026-08-10 pagi | daftar per produk (`scopedUtilByProd` / `scopedAvailByProd`) |
| 2026-08-10 siang | form Sales (`utilBaselineForProd`) |

Ketiganya ketahuan **satu per satu lewat laporan tim**, bukan sekaligus.
Sisiran menemukan **12 titik lagi di 10 berkas** yang masih membacanya —
termasuk **PDF Summary dan ekspor XLSX**, dua-duanya keluar dari sistem.

## Kenapa ditambal di sumber

Menambal 12 titik berarti mengulang pekerjaan yang sama untuk ketiga belas
kalinya, dan titik ke-13 pasti muncul lagi. Satu perubahan di server membuat
**semua** pembaca ikut benar — termasuk yang belum ditulis.

## Perubahan

**`iqdash_data.php`** — `iq_sync_util_with_cycles(&$co, $aliasMap)` (baru):
bila company punya `utilCycles`, keempat kolom diisi dari sana.

**Obtained per produk SENGAJA dipertahankan.** Definisinya util + avail dari
stats, dan `getObtainedByProdAgg()` di frontend bersandar padanya. Yang diubah
hanya **pembagian** antara terpakai dan tersisa, bukan jumlahnya:

```
GKL   3.000 terpakai / 0 sisa   ->   2.400 terpakai / 600 sisa
      obtained tetap 3.000
```

### Dipanggil DUA kali — dan itu bukan kelalaian

Percobaan pertama hanya memanggilnya saat objek dibangun, dan **tidak ada
angka yang berubah**. Penyebabnya `iq_apply_ledger()`: overlay dari berkas
statis `quotaLedger.json` menulis ulang keempat kolom itu **sesudahnya**, jadi
hasilnya tertimpa kembali.

Ini persis kelemahan yang dilaporkan 2026-08-10 waktu ditanya "apa yang kurang":
*berkas statis yang menimpa angka hidup*. Kini penyelaras dipanggil lagi
sesudah tiap `iq_apply_ledger()`.

Dua jebakan lain yang tertangkap sebelum sampai ke pengguna:
- `$aliasMap` **tidak ada** di `iq_build_payload()` (dibangun di
  `iq_build_payload_raw()`), sehingga kedua panggilan itu akan error saat
  dijalankan — lolos `php -l`, hanya ketahuan dengan memeriksa lingkupnya.
  Diambil dari `$raw['productAliases']`.
- Memo payload ber-TTL **30 detik**, jadi verifikasi terlalu cepat memberi
  kesan perubahan tidak jalan.

## Verifikasi

Keempat PT yang menyimpang kini benar **di payload**:

| PT | Utilisasi | Saldo |
|---|---|---|
| ADP | 250 → **350** | 100 → **0** |
| GKL | 3.000 → **2.400** | 0 → **600** |
| HDP | 900 → **1.000** | 100 → **0** |
| MSN | 150 → **250** | 100 → **0** |

**Seluruh 30 PT selaras**: rincian siklus = `utilizationMT` = Σ per produk.

Total dashboard **tidak bergeser** — memang tidak boleh, karena frontend sudah
memakai `allTimeUtil` sejak pagi: Obtained 34.740 · Utilized 22.847 · Available
12.113 · Pending Shipment 7.408,79. Partisi tetap utuh.

25 suite, 0 gagal.

## Sisa — GKL GL ALLOY, selisih DATA bukan kode

Form Sales GKL menampilkan GL ALLOY **terpakai 600 / sisa 0**, sedangkan
dashboard menampilkan **sisa 600**. Bukan bug: GKL punya **lot 600 MT GL ALLOY**
yang master tidak catat sebagai utilisasi (master GKL = 2.400, semuanya GI ALLOY
+ ERW).

Pola yang sama persis dengan HDP tadi siang. Perlu dipastikan tim:
1. Tambahkan `Utilization #3` GL ALLOY 600 MT ke master beserta tanggalnya, atau
2. Lot itu keliru dan perlu dikoreksi

Selama belum dipastikan, dashboard mengikuti master — sesuai aturan yang berlaku.
