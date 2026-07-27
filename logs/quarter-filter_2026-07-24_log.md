# [quarter-filter] 2026-07-24 — Quarter (Q1–Q4) period filter for Sales Pulse + IQ Dash

## Ringkasan
Menambahkan filter periode **per kuartal** di dua modul:

1. **Sales Pulse — Executive Summary**: dropdown periode sekarang punya grup **Quarter** (Q1 Jan–Mar, Q2 Apr–Jun, Q3 Jul–Sep, Q4 Oct–Dec) di samping grup Month. Saat kuartal dipilih, kolom kiri (sebelumnya "MTD") menjadi agregat 3 bulan kuartal tsb dan labelnya berubah jadi `Q2`, kolom YTD = Jan s/d bulan terakhir kuartal.
2. **IQ Dash — Filter Periode**: menambah quick preset **Q2 2026, Q3 2026, Q4 2026** (sebelumnya hanya Q4 2025 & Q1 2026).

## Alasan
Laporan kuartalan (SOQR) sebelumnya tidak bisa dibaca langsung dari dashboard — angka Q2 harus **diturunkan manual** (YTD-Jun − YTD-Mar), yang rawan salah dan sulit direkonsiliasi saat dicek ulang. Dengan filter kuartal native, angka laporan bisa dibaca langsung dari dashboard dan cocok 1:1.

## Perubahan file

### `salespulse/assets/executive.html`
- **Markup**: `#exec-month` dibungkus `<optgroup label="Quarter">` (value `q1`–`q4`) + `<optgroup label="Month">`.
- **State**: tambah `curQuarter` (null | 1–4) dan helper `quarterMonths(q)` → indeks bulan `[0,1,2]` / `[3,4,5]` / dst.
- **`setPeriodFromValue(val)`** (baru): parse value select — `-1` = YTD, `0`–`11` = bulan, `q1`–`q4` = kuartal. Saat kuartal, `curMonth` di-set ke bulan **terakhir** kuartal supaya perhitungan YTD dan sinkronisasi ke halaman Dashboard tetap jalan tanpa diubah.
- **Agregasi**: `mtdIdx` (skalar) diganti `mtdIndices` (array) + helper `sumMtd(arr)`. Revenue/Margin di-sum via `sumMtd`, Volume via reduce atas `mtdIndices`. `getProdRanking`/`getCustRanking` sudah menerima array → cukup dioper `mtdIndices`.
- **Label**: `getPeriodLabel()` → `Q2 2026`; `getLeftColLabel()` (baru) mengubah header kolom kiri `MTD` → `Q2`; label tanggal kolom kiri → `Q2 2026  (Apr–Jun)`.
- **Persist**: `sessionStorage.dash_quarter` ditambah. `dash_month` tetap berisi indeks bulan biasa (bulan terakhir kuartal) supaya halaman Dashboard — yang tidak mengenal kuartal — tidak berubah perilakunya. Restore saat startup memprioritaskan `dash_quarter`.

### `iqdash/assets/js/02-period-filter.js`
- `PRESETS` ditambah `q226`, `q326`, `q426` (batas `to` pakai `23:59:59` agar hari terakhir ikut terhitung, konsisten dengan pola custom range).

### `iqdash/assets/index.html`
- Tiga chip preset baru: `Q2 2026`, `Q3 2026`, `Q4 2026`.

## Verifikasi (local dev server `php -S 127.0.0.1:8788 router.dev.php`)
- `node --check` pada inline JS `executive.html` (diekstrak) dan `02-period-filter.js` → **syntax OK**.
- Tidak ada sisa referensi `mtdIdx` (grep count = 0).
- **Sales Pulse pilih Q2 2026** →
  - Badge `Q2 2026`, header kolom kiri `Q2`, label `Q2 2026  (Apr–Jun)`
  - Revenue **Rp 89,02 B** · Margin **Rp 8,14 B** · Volume **5.972 MT**
  - Top produk: Galvalume 3,60 B · Galvanized 2,95 B · Beam 880,49 M
  - Top customer: Nusa Indah Metalindo 3,60 B · Hanwa 3,05 B · Artha Mas Graha Andalan 870,01 M
  - **Cocok** dengan hasil turunan manual sebelumnya (YTD-Jun − YTD-Mar = 89,02 B) → filter baru tervalidasi.
- **IQ Dash preset Q2 2026** → `PERIOD.label = Q2 2026`, TOTAL AVAILABLE **23.630 MT / 27 perusahaan** — sama persis dengan angka di laporan SOQR Q2.
- Bulan biasa & "All Months (YTD)" dites ulang → perilaku lama tidak berubah (regresi aman).

## Risiko / sisa pekerjaan
- Halaman **Dashboard** (`salespulse/dashboard.php`) belum mengenal kuartal; ia hanya membaca `dash_month`. Karena `dash_month` tetap diisi bulan terakhir kuartal, halaman itu menampilkan bulan tsb (bukan agregat kuartal). Kalau nanti perlu, tambahkan dukungan `dash_quarter` di sana.
- Preset IQ Dash masih hardcode tahun 2026. Kalau ganti tahun, daftar preset perlu di-update (atau dibuat dinamis).
- **Belum di-deploy** ke Niagahoster — masih lokal, menunggu persetujuan.
