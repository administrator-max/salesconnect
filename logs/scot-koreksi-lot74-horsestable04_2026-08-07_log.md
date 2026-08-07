# [scot-koreksi-lot74-horsestable04] 2026-08-07 — Lot 74 jadi Domestic; WH-in Horse Stable #04

- **Tanggal:** 2026-08-07
- **Oleh:** Claude Code
- **Jenis:** koreksi **DATA** (SCOT). Tidak ada kode yang diubah.
- **Pemicu:** dua laporan dari tim disertai tangkapan layar.

## Yang diubah

| Record | Field | Sebelum | Sesudah |
|---|---|---|---|
| **id 192** · Scrap Project Juli / Lot 74 | `cargo_type` | Import | **Domestic** |
| **id 178** · Horse Stable Bogor #04 - Rebar | `enter_warehouse` | 2026-07-31 | **2026-07-22** |
| **id 178** | `delivery_days` | 11 | **2** |

`delivery_days` ikut dikoreksi meski tidak disebut tim: ia **field tersimpan**,
bukan hitungan otomatis, dan layar membacanya langsung sebagai "Duration".
Membiarkannya 11 berarti menampilkan *Duration 11d* untuk pengiriman 21 → 22
Juli. Konvensinya diverifikasi ke 15+ record lain — **selisih hari + 1**
(0 hari → 1, 1 hari → 2, 2 hari → 3), jadi 21 → 22 Juli = **2**.

Cadangan: `backups/scot-192-178-sebelum-koreksi_2026-08-07.json`
(termasuk id 177 sebagai pembanding).

## BELUM diubah — perlu konfirmasi tim

### 1. Tanggal bongkar id 178 kini mustahil

`enter_warehouse` sudah 22 Juli, tapi tersisa:

```
start_unloading   2026-07-21
finish_unloading  2026-07-30   ← 8 hari SESUDAH masuk gudang
unloading_days    10
```

Barang tidak mungkin selesai dibongkar 30 Juli kalau sudah masuk gudang 22
Juli. Angka **10** inilah yang membuat record ini bertanda **"⚠ Delayed"**
(`gd()` di `state.js` menandai bila `unloading_days > 3`) — bukan
`delivery_days`. Jadi selama belum dikoreksi, #04 tetap tampil Delayed padahal
pengirimannya hanya 1 hari.

Tidak ditebak sendiri: tim hanya menyebut tanggal masuk gudang, dan saya tidak
tahu apakah tanggal bongkarnya juga salah ketik atau memang mengacu ke hal lain.

### 2. Horse Stable #03 (id 177) kemungkinan besar sama

Tanggalnya **identik** dengan #04 sebelum koreksi:

| | #03 CNP (id 177) | #04 Rebar (id 178, sebelum) |
|---|---|---|
| start_delivery | 21 Jul | 21 Jul |
| enter_warehouse | **31 Jul** | 31 Jul |
| start/finish unloading | 21 → 30 Jul | 21 → 30 Jul |
| unloading_days | 10 | 10 |

Keduanya dibuat berselang ~1 menit (`created_at` 03:09:27 dan 03:10:53) dan
diperbarui berselang ~2 menit, jadi kemungkinan besar diinput bersamaan dengan
kesalahan yang sama. Tim hanya menyebut #04.

## Catatan

`unloading_days` TIDAK selalu kosong untuk pengiriman domestik — 8 record
domestik memilikinya (umumnya 1–2). Jadi keberadaannya di #03/#04 bukan
anomali; hanya **nilainya** (10) yang janggal karena berasal dari rentang
tanggal yang salah.
