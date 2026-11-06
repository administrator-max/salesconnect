# IQ Dash — DIOR & BBB "sudah diinput, lalu hilang" (06-Nov-2026)

## Temuan (activity_log + sheet mentah)
- **BBB**: lot GL ALLOY #1 (100 MT, 30-Oct) terhapus 04-Nov 08:53 UTC oleh sapuan buffer
  browser lama (AADC→ADP→AMP→APA→BBB… tiap ~3 detik) — bug yang diperbaiki 6a5fdf2 dan
  dideploy 04-Nov ±09:46 UTC. Tidak ada sapuan sesudahnya. David input ulang 06-Nov 02:27 UTC;
  sheet sekarang benar (util 100, tgl 30 October 2026, ETA 31 December 2026).
- **DIOR**: 100 MT GL ALLOY sudah tercatat dari master (cycle_utilization "Utilization #1",
  31/08/2026) = seluruh obtained 100. Form Sales tidak menampilkan baris itu — hanya lot kosong
  + "100 / 100 MT used" + Available 0. Tim mengira isian hilang; isi ulang ditolak
  "Melebihi kuota (max 0)". Semua simpan DIOR tercatat `nochange`.

## Perbaikan (11-shipment.js v15)
- Kotak "Sudah tercatat X MT (dari master…)" per produk di form Sales, berisi baris
  utilCycles (siklus · MT · tanggal). Hanya-baca.
- Pesan "Melebihi kuota" menyebut MT yang sudah tercatat dari master.

## Uji
- Pratinjau lokal: DIOR, BBB (700 MT master + lot 100), BTS tampil benar.
- 54/54 berkas uji .cjs lulus.
