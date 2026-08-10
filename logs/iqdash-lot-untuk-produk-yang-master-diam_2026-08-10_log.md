# [iqdash-lot-untuk-produk-yang-master-diam] 2026-08-10 — Cacat aturan: produk yang master tidak sebut

- **Tanggal:** 2026-08-10
- **Oleh:** Claude Code
- **Pemicu:** tim — *"GKL kan juga udah di re-apply, kenapa masih ada available
  quota?"*

## Cacat pada aturan 2026-08-07

Aturan "input Sales jadi sumbernya" membandingkan **jumlah lot** dengan **total
master per produk**, dan lot hanya menang bila keduanya sama.

Untuk produk yang **master sama sekali tidak sebut utilisasinya**, total master
= 0 — jadi lot **tidak akan pernah bisa cocok**, berapa pun isinya. Produk
seperti itu terkunci selamanya pada "belum terpakai".

GKL terjebak persis di situ:

```
Obtained #2   600 MT GL BORON      (hasil re-apply)
Lot GL ALLOY  utilMT 600 · ETA 31 Okt 2026 · Tgl Utilisasi KOSONG
Master        tidak punya baris utilisasi GL ALLOY sama sekali
```

Sudah di-re-apply dan lotnya terisi, tapi saldonya tetap tampil 600.

## Perbaikan

Bila master **tidak menyebut** utilisasi sebuah produk, lot yang **bertanggal**
langsung berlaku — tanpa menunggu "lengkap". Mengisi kekosongan bukan membantah
master.

Diterapkan di **dua tempat yang harus sepakat**:
- `02-period-filter.js` — `pakaiLot()` untuk pengirisan periode
- `iqdash_data.php` — `iq_sync_util_with_cycles()` untuk total sepanjang waktu

**Tanggal tetap WAJIB.** Tanpa tanggal, MT itu tidak bisa ditempatkan di periode
mana pun; menghitungnya di total saja akan membuat H1 + H2 tidak lagi sama
dengan setahun — sifat partisi yang selama ini dijaga.

## Verifikasi

Seluruh data disisir: **hanya satu** produk di seluruh sistem yang berada dalam
kondisi ini — `GKL / GL ALLOY 600 MT`, dan **tanggalnya kosong**.

Karena itu **tidak ada satu angka pun yang bergeser** hari ini:

| | Nilai |
|---|---|
| Obtained | 34.740 |
| Utilized | 22.847 |
| Available | 12.113 |
| Pending Shipment | 7.408,79 |

Partisi tetap utuh. 25 suite, 0 gagal.

## GKL BELUM selesai — butuh satu tanggal

Aturannya sudah benar, tapi GKL tetap 600 sampai **tanggal pemakaiannya**
diketahui. Sengaja tidak ditebak: tanggal itu menentukan 600 MT masuk periode
mana, dan menebak tanggal sudah dua kali merugikan (SNSD, AADC).

Dua jalan, salah satu saja:
1. Sales mengisi **Tgl Utilisasi** pada lot GL ALLOY GKL — begitu terisi,
   angkanya mengalir sendiri ke semua permukaan
2. Tambahkan `Utilization #3` GL ALLOY 600 MT beserta tanggalnya ke master

Catatan: ETA lot itu **31 Oktober 2026** — itu tanggal barang tiba, **bukan**
tanggal kuota dipakai. Keduanya sengaja dipisah sejak 2026-08-07.
