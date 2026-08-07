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

## Susulan — tanggal bongkar id 178 (tim mengonfirmasi tidak seharusnya Delayed)

Sesudah koreksi pertama, record masih bertanda **"⚠ Delayed"**. Penyebabnya
bukan `delivery_days` melainkan `unloading_days = 10` — `gd()` di `state.js`
menandai bila `unloading_days > 3`. Angka itu sisa dari tanggal 31 Juli yang
sudah dikoreksi, dan menyisakan keadaan mustahil: selesai bongkar 30 Juli
padahal barang sudah masuk gudang 22 Juli.

| Field | Sebelum | Sesudah |
|---|---|---|
| `finish_unloading` | 2026-07-30 | **2026-07-21** |
| `unloading_days` | 10 | **1** |

**Acuannya Lot 74 (id 192)** — pola terdekat, sama-sama `cargo_status` "Direct":
`start_delivery` 20 Jul · bongkar 20 → 20 Jul · `unloading_days` 1 ·
`enter_warehouse` 21 Jul. Untuk #04 dengan `start_delivery` 21 Jul, bentuk yang
setara adalah bongkar 21 → 21 Jul selama 1 hari.

Ini **asumsi**, bukan angka dari tim: yang dikonfirmasi hanya "tidak seharusnya
Delayed". Kalau tanggal bongkar sebenarnya berbeda, tinggal dikoreksi — yang
penting `finish_unloading` tidak melewati `enter_warehouse`.

Sesudahnya: `start_delivery` 21 Jul · bongkar 21 → 21 Jul (1 hari) · masuk
gudang 22 Jul · durasi 2 hari · **tanpa penanda delay**.

## BELUM diubah — perlu konfirmasi tim

### Horse Stable #03 (id 177) kemungkinan besar sama

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
