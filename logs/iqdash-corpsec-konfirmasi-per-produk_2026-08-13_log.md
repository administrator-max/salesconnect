# [iqdash-corpsec-konfirmasi-per-produk] 2026-08-13 — konfirmasi CorpSec per produk tujuan

- **Pemicu:** laporan tim — Sales merevisi IKM · Sheet Pile 1.750 MT menjadi
  empat produk (CRC Alloy 500 · GL Alloy 1.355 · GL Carbon 120 · PPGL Carbon
  600), tapi panel CorpSec hanya menampilkan **satu** kolom konfirmasi berisi
  **500 MT**.

## Sebabnya

`salesRevRequest[produkAsal]` hanya punya **satu** `confirmedMT` — satu angka
untuk berapa pun jumlah produk tujuannya. Panel merender satu input per **produk
asal**, di-prefill dari `confirmedMT ?? requestedMT`, dan daftar targetnya cuma
ditampilkan sebagai teks. Jadi tiga target lainnya tidak bisa dikonfirmasi sama
sekali, dan totalnya salah: 500, bukan 2.575.

## Bentuk data

```
req.targetProducts   [{product, mt}]           ← dari Sales, tidak diubah
req.confirmedTargets [{product, mt, status}]   ← BARU, sejajar indeksnya
req.confirmedMT      Σ target yang confirmed   ← tetap ada demi pembaca lama
req.status           pending  bila masih ada yang menunggu
                     confirmed bila ada yang disetujui & tak ada yang menunggu
                     rejected  selain itu
```

`confirmedMT` sengaja dipertahankan: empat permukaan lain membacanya (tabel SPI,
drawer, form edit, form shipment). Kalau diganti bentuk baru begitu saja,
keempatnya ikut pecah.

## Perubahan

- **Panel** merender **satu baris per produk tujuan**: nama produk + qty
  pre-filled dari request Sales + tombol ✓/✕ sendiri-sendiri. Jumlah barisnya
  mengikuti jumlah produk yang benar-benar disubmit Sales.
- `rrTargets()` / `rrTargetState()` / `rrSyncReqStatus()` — pembaca tunggal
  bentuk target, termasuk bentuk lama (`newProduct` tunggal, dan
  "— Tetap sama —" yang berarti target = produk asal).
- `rrRebuildFromConfirmed()` dipisah supaya **konfirmasi dan pembatalan
  menghasilkan keadaan yang sama**. Dulu logika ini hanya ada di jalur
  konfirmasi, jadi:
  · membatalkan satu target tidak pernah memperbarui siklusnya;
  · pembatalan menghapus SELURUH siklus request, ikut membuang target yang
    sudah dikonfirmasi.
- `csConfirmRev` / `csBatalRev` menerima indeks target. **Tanpa** indeks
  (pemanggil lama) seluruh target diproses, jadi perilaku lama tidak berubah.

## Verifikasi di dashboard live — IKM

```
SEAMLESS PIPE   1 kolom   SEAMLESS PIPE = 1.275
SHEET PILE      4 kolom   CRC ALLOY = 500 · GL ALLOY = 1.355
                          GL CARBON = 120 · PPGL CARBON = 600
GI ALLOY        1 kolom   GI ALLOY = 4.150
```

Persis breakdown yang diajukan Sales. Total input di panel: 6 (dulu 3).

## Tes

`test_corpsec_konfirmasi_per_produk.cjs` (28 assertion), memakai bentuk IKM yang
sebenarnya: 4 target muncul dengan nama & qty persis; konfirmasi satu target
tidak menyentuh yang lain; konfirmasi semua → `confirmedMT` 2.575 (dulu 500) dan
siklus memuat keempat produk; batal satu target → 2.455 dan tinggal 3 produk;
batal semua → siklus dibersihkan; bentuk lama tetap jalan.

**17 suite node + 14 PHP = 31 lulus, 0 gagal.**
