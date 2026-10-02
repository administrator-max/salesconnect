# IQ Dash — revisi produk/HS IKM masuk ledger + pemeriksaan revisi pengganti

**Tanggal:** 2026-10-02
**Modul:** IQ Dash (Import Quota Monitor)

## Ringkasan

Tim memprotes Excel "Kuota & Shipment Incoming": IKM sudah berganti HS/produk
lewat PERTEK Perubahan `1218/ILMATE/PERTEK-SPI-P-Rev.1/IX/2026`, tapi Excel —
dan seluruh dashboard per produk — masih menampilkan susunan lama.

Angka per produk di server datang dari `iqdash/data/quotaLedger.json`
(snapshot master per HS, beku sejak 03-Agu-2026). Revisi IKM tidak pernah masuk
ke sana. Totalnya sama-sama 8.000 MT, jadi pemeriksaan total tidak menangkapnya.

| HS | Produk | Sebelum | Sesudah | Terpakai | Sisa |
|---|---|---|---|---|---|
| 7225.92.90 | GI ALLOY | 4.150 | **4.650** | 4.080 | 570 |
| 7225.99.90 | GL ALLOY | — | **1.855** | 0 | 1.855 |
| 7210.70.13 | PPGL CARBON | — | **600** | 0 | 600 |
| 7225.50.90 | CRC ALLOY | — | **500** | 0 | 500 |
| 7210.61.11 | GL CARBON | — | **120** | 0 | 120 |
| 7304.19.00 | SEAMLESS PIPE | 2.100 | **275** | 275 | 0 |
| 7301.10.00 | SHEET PILE | 1.750 | dihapus (baris riwayat) | | |

Total IKM tetap 8.000 obtained / 4.355 terpakai / 3.645 sisa. Susunan baru
diambil dari siklus Obtained #2 IKM (revisi, `_fromRevReq`) — tidak ada yang
dikarang. Diminta pemilik data 02-Okt-2026.

## Perubahan

- `iqdash/data/quotaLedger.json` — entri IKM diganti ke 6 HS baru; peta
  `products` ditambah `7210.61.11: GL CARBON` (HS dari tabel products).
- `iqdash/assets/js/23-self-check.js` — pemeriksaan baru *"Susunan produk revisi
  pengganti sudah masuk ledger"*: siklus Obtained hasil revisi terbaru yang
  totalnya = seluruh obtained company (pengganti penuh) dan PERTEK Perubahan-nya
  sudah terbit (lolos gerbang terbit, atau nomor PERTEK ber-"Rev.N") wajib sama
  susunannya dengan angka per produk. Revisi yang masih berproses tidak dilaporkan
  (aturan master no. 3).
- `iqdash/assets/index.html` — `23-self-check.js?v=2` → `v=3`.
- `iqdash/tests/test_util_breakdown.cjs` — asersi yang memaku "obtained GI IKM =
  4.150" diganti hubungan (= getObtainedByProdAgg).

## Kenapa ledger, bukan mencatat tanggal terbit di siklus

Obtained #2 IKM (8.000) tercatat sebagai siklus "Obtained #2" — tipe yang
DIJUMLAH canonicalObtained. Memberinya tanggal terbit akan membuat obtained IKM
16.000. Revisi pengganti di company lain memakai tipe "Obtained (Revision #N)"
yang sengaja tidak dijumlah. Siklusnya dibiarkan apa adanya.

## Verifikasi

- Payload dibangun ulang dengan data live: **hanya IKM** yang bergeser dari 41
  company. Kartu Overview tidak berubah (Obtained 36.580, Available 8.431,01).
- Pratinjau: Available Quota IKM 6 baris dengan HS baru; PERTEK & SPI: Sheet
  Pile jadi baris historis ⚪ Inactive; self-check baru bersih (sebelum perubahan
  ledger, ia menandai tepat IKM saja).
- 49 uji `.cjs` lulus. Uji PHP ledger/util lulus; `test_ledger.php` gagal
  identik sebelum & sesudah (mematok total Agustus 34.840 — bukan regresi).

## Sisa / risiko

- Tanggal terbit PERTEK Perubahan Rev.1 IKM belum tercatat — dibutuhkan untuk
  filter periode, tidak untuk angka All Time.
- Kalau ledger di-regenerate dari master (`tools/build_quota_ledger.js`), pastikan
  master sudah memuat susunan baru IKM.
- BTS dan MIN punya revisi produk terkonfirmasi tapi PERTEK Perubahan belum
  terbit — sengaja tetap susunan lama.
