# [fix-mt-locale-lock] 2026-07-27 — Perbaikan bug format angka MT (titik ribuan tersimpan salah)

## Ringkasan
Menutup akar masalah kasus IKM: tampilan mengikuti locale browser (`4.150`) sementara
seluruh parser memakai konvensi en-US, sehingga user yang mengetik ulang apa yang
dilihatnya (`2.000`) menyimpan `2`. Dua lapis perbaikan:

1. **Kunci locale** — seluruh tampilan angka dipaksa `en-US`, tidak lagi ikut browser.
2. **Guard input** — teks MT yang ambigu ditolak dan ditandai merah, bukan ditebak.

Log terkait: `fix-ikm-utilization_2026-07-27_log.md` (perbaikan data),
`audit-mt-truncation_2026-07-27_log.md` (audit entri lama).

## Alasan
Kode ini **sudah seluruhnya ditulis untuk konvensi en-US** — 23 titik parse memakai
`replace(/,/g,'')` + `parseFloat`, dan 5 pemanggilan locale eksplisit semuanya
`en-US`/`en-GB`. Yang menyimpang hanya **160 pemanggilan `toLocaleString()` tanpa
argumen** yang diam-diam ikut locale browser. Di browser id-ID itu menampilkan
`4.150`, dan `2.000` yang diketik balik jadi `2`.

Dipilih kunci ke **en-US** (bukan id-ID) karena arah kegagalannya aman: kalau ada satu
situs tampilan yang terlewat, akibatnya cuma beda kosmetik. Kalau sebaliknya (kunci
id-ID), satu titik parse yang terlewat langsung merusak data lagi — persis bug ini.

## Perubahan file

### Baru: `iqdash/assets/js/00-num.js`
Dimuat paling awal, murni (tanpa DOM) supaya bisa di-`require` oleh tes.
- `MT_LOCALE = 'en-US'` — satu sumber kebenaran.
- `fmtNum(v, opts)` — formatter tampilan dengan locale eksplisit.
- `mtAmbiguous(str)` — `true` bila gugus desimal terakhir ≥3 digit. Itu berarti
  pemisah ribuan gaya Indonesia (`2.000`) **atau** presisi melebihi kapasitas field
  (dibatasi 2 desimal). Keduanya dulu dipotong diam-diam.
- `parseMT(str)` — satu-satunya pintu parse. Mengembalikan angka atau `null` untuk
  teks kosong/rusak/ambigu. `null` berarti **jangan simpan**, jangan dijadikan 0.

### Baru: `iqdash/tests/test_mt_format.cjs`
35 assertion, termasuk regresi langsung kasus IKM (`parseMT('2.000') === null`),
round-trip tampil→ketik-ulang, dan **cek struktural**: build gagal bila ada
`toLocaleString()` tanpa argumen muncul lagi (komentar dikecualikan lewat penghapus
komentar yang mempertahankan nomor baris).

### 17 file JS — kunci locale
160 pemanggilan `toLocaleString()` → `toLocaleString(MT_LOCALE)`.
Diverifikasi tidak ada yang menyentuh `Date` (tanggal memakai
`toLocaleDateString`/`toLocaleTimeString`, tidak disentuh).
`05-tables-spi.js`, `15-leadtime.js`, `16-storage.js` dikembalikan — `sed` sempat
mengubah line ending padahal isinya tidak berubah.

### `12-product-mt.js` — guard
- `markMtInput(el, bad)` / `mtInputsAmbiguous(root)` (baru).
- `fmtThousandInline`: bila `mtAmbiguous(raw)` → tandai field dan **biarkan teksnya
  apa adanya**, tidak lagi diubah jadi `2.00`. User melihat persis apa yang diketik.

### `11-shipment.js`
- `onSalesDirectChange`: field ditandai → pesan error + tombol Simpan dikunci,
  tidak jatuh ke `parseFloat`.
- `saveSalesUtil`: pakai `parseMT`; `null` menghentikan simpan (tidak jadi 0).
- `onOpsRealChange`: field ditandai → model tidak disentuh.
- `collectShipmentData`: `parseMT` untuk `utilMT` & `realMT`, lewati bila ambigu.

### `13-rev-mgmt.js`
- `saveEdit()`: guard di paling depan — bila ada field ditandai, seluruh simpan
  dibatalkan, fokus ke field pertama, dan muncul pesan cara penulisan yang benar.

### `10-edit-form.js`
- `parseMTField` dialihkan lewat `parseMT` (pemanggil sudah menangani `null`).

### `assets/css/style.css`
Aturan `input[data-mt-ambiguous="1"]` — merah untuk **semua** field yang ditandai.
Sebelumnya `.err` hanya bergaya untuk `.util-add-inp` dan `.ship-inp`, jadi field
`pmt-mt-inp` yang ditandai tidak akan terlihat merah.

### `assets/index.html`
Satu baris: `<script defer src="assets/js/00-num.js?v=1">` sebelum `01-data.js`.
Nomor `?v=` lain **tidak** diubah — `iqdash/index.php` menimpanya dengan `filemtime`,
jadi cache-busting sudah otomatis.

## Verifikasi
- `node --check` seluruh 21 file JS → lolos.
- `node iqdash/tests/test_mt_format.cjs` → **35 lulus, 0 gagal**.
- Dimuat di browser (`php -S`, halaman `/iqdash/`): **tidak ada error konsol**;
  `MT_LOCALE='en-US'`, `parseMT('2,000')=2000`, `parseMT('2.000')=null`, `fmtMt(4150)='4,150'`.
- Guard diuji pada kode asli (`fmtThousandInline` pada input sungguhan):

  | diketik | field menampilkan | ditandai | hasil parse |
  |---|---|---|---|
  | `2.000` | `2.000` (utuh) | ya | `null` |
  | `16.100` | `16.100` (utuh) | ya | `null` |
  | `2,000` | `2,000` | tidak | 2000 |
  | `2000` | `2,000` | tidak | 2000 |
  | `2.5` | `2.5` | tidak | 2.5 |
  | `1,234.56` | `1,234.56` | tidak | 1234.56 |

  Sebelum perbaikan, baris pertama menghasilkan `2.00` → tersimpan **2**.
- `mtInputsAmbiguous()` mendeteksi field bertanda (1 saat ada, 0 setelah dihapus);
  `saveEdit` terbukti memanggilnya.
- Gaya merah aktif pada field bertanda: border `rgb(239,68,68)`, latar `rgb(254,242,242)`.
- Data IKM terbaca benar di UI: `utilizationByProd["GI ALLOY"]=2000` → `fmtMt` → `2,000`;
  available `2,150`.

## Dampak yang terlihat user
Angka di IQ Dash sekarang selalu `4,150` (koma), tidak lagi `4.150` di browser
berlocale Indonesia. Konsisten dengan format yang memang diminta field input.

## Risiko / sisa pekerjaan
- **Belum di-deploy** ke Niagahoster — masih lokal.
- **Tanggal belum dikunci.** `toLocaleDateString`/`toLocaleTimeString` (28 pemanggilan)
  masih ikut locale browser. Tidak berbahaya (tidak pernah diketik balik ke field
  angka), tapi tampilannya bisa beda antar user. Di luar cakupan perbaikan ini.
- **`fmtThousand()` di `10-edit-form.js:7` adalah kode mati** (tidak ada pemanggil) dan
  menyimpan jebakan: ia membuang semua non-digit, jadi `2.5` akan jadi `25`. Sengaja
  tidak disentuh agar perbaikan ini tetap fokus — sebaiknya dihapus terpisah.
- Modul lain di SalesConnect (Sales Pulse, CostCore, SCOT) **belum diperiksa** untuk
  pola `toLocaleString()` tanpa locale yang sama.
- Rekonsiliasi 12 baris `company_product_stats` (dari log audit) masih terbuka.
