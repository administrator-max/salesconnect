# IQ Dash — warna produk kembali muncul untuk ejaan kanonik

**Tanggal:** 2026-09-21
**Modul:** IQ Dash (Import Quota Monitor)

## Ringkasan

Di Available Quota Breakdown (By Product, pill filter, popup "co. ▾") dan titik
warna produk di drawer/tabel, separuh produk tampil abu-abu: GL ALLOY, GI ALLOY,
SHEET PILE, HRPO ALLOY, kedua ERW PIPE, WELDED STAINLESS STEEL PIPE, FABRICATED
STEEL PAINTED FRAME. Dilaporkan tim hari ini.

## Sebab

Beberapa berkas punya peta warna LOKAL yang hanya mengenal ejaan lama
(`GL BORON`, `GI BORON`, `SHEETPILE`, `ERW PIPE OD≤140mm`, `HRC/HRPO ALLOY`).
Sejak nama produk dikanonikkan, kuncinya tidak pernah cocok dan semuanya jatuh ke
warna cadangan abu-abu. Palet pusat `pc()` di `01-data.js` sudah mengenal kedua
ejaan — peta lokal ini saja yang tertinggal (kelas bug yang sama dengan ejaan
kembar di panel lain).

## Perubahan

- `19-init.js` — kartu By Product dan popup per company memakai `pc(p).solid`.
- `04-charts.js` — palet lokal chart/pill (sengaja beda warna, lihat komentarnya)
  ditambah kunci ejaan kanonik dengan warna yang sama.
- `08-drawer.js`, `12-product-mt.js` — peta titik lokal jatuh ke `pc()` bila
  ejaannya tidak dikenal, bukan ke abu-abu.
- `assets/index.html` — `?v=` keempat berkas dinaikkan (cache Cloudflare 4 jam).

AS STEEL tetap slate (`#64748b`) — itu memang warnanya di palet pusat.

## Verifikasi

- `buildAvqProdGrid()` dirender di Node vm dengan data live: 12 kartu, tidak ada
  yang abu-abu selain AS STEEL.
- Seluruh `iqdash/tests/*.cjs` lulus.

## Sisa

Tidak ada perubahan angka. Pertanyaan GI ALLOY "available bertambah" diperiksa
terpisah: 9.681 / 8.611 / 1.070 identik dengan data 15-Sep (sisa di IKM 950 dan
SNSD 120).
