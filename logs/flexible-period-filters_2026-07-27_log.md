# [flexible-period-filters] 2026-07-27 — IQ Dash date-range; SalesPulse month-range

## Ringkasan
Kedua modul hanya menyediakan daftar periode tetap, jadi jendela di luar daftar itu
(setengah tahun, rentang bebas) tidak bisa dipilih dari UI. Permintaan user: IQ Dash cukup
**date range**, SalesPulse pakai **filter bulan-tahun** supaya fleksibel — per bulan,
per kuartal, atau per 6 bulan.

## IQ Dash — hanya date range
- 12 chip preset (`All Time`, `Oct 2025` … `YTD 2026`) **dihapus** dari panel.
  Input `Dari`/`Sampai` di bawahnya sudah ada dan lebih ekspresif: bulan, kuartal, semester
  semuanya cuma sepasang tanggal.
- `applyPreset(key, el)` **tetap ada** — laporan & otomasi memakainya untuk mereproduksi
  jendela bernama. Argumen `el` kini **opsional**; dulu wajib dan itulah yang bikin
  pemanggilan headless melempar `TypeError: Cannot read properties of undefined`.
- `clearPeriod()` tidak lagi menyentuh `#pre-all` (sudah tidak ada); reset = kosongkan
  kedua input tanggal.
- Menyisakan wrapper kosong pada percobaan pertama (heading "Quick Presets" tanpa isi +
  `</div>` tak berpasangan) — diperbaiki, region panel kini seimbang 15/15.

## SalesPulse — range bulan (from .. to)
`exec-month` (satu dropdown: YTD / Q1-Q4 / 12 bulan) diganti **dua** dropdown
`exec-from` … `exec-to`. Satu bentuk kontrol untuk semua jendela: bulan sama dua kali = satu
bulan, selisih 3 = kuartal, selisih 6 = semester.

- `curFrom`/`curTo` (indeks bulan, inklusif) menggerakkan kolom KPI kiri.
- `curMonth` **tetap** = bulan terakhir range → matematika YTD, halaman Dashboard, dan
  sessionStorage lama jalan tanpa diubah.
- `curQuarter` masih diturunkan bila range kebetulan kuartal kalender, supaya label "Q2"
  yang sudah ada tetap menyala.
- `setPeriodFromValue()` dipertahankan sebagai pembungkus (`'q2'`, `'5'`, `'-1'`).
- Range dibalik otomatis kalau user memilih terbalik.
- Label mengikuti bentuk jendela: `MTD` · `Q2` · `H1` · `H2` · `FY` · selain itu `Jan-Jun`.
- Range disimpan ke `dash_from`/`dash_to` dan **diprioritaskan** saat restore — kunci lama
  (`dash_month`/`dash_quarter`) secara struktur tidak bisa mewakili pilihan 6 bulan.

## File yang disentuh
`iqdash/assets/index.html` · `iqdash/assets/js/02-period-filter.js` (v=7) ·
`salespulse/assets/executive.html`

## Verifikasi
- 13 suite PHP + 3 suite JS lulus; JS inline `executive.html` lolos `node --check`.
- Deploy 52 file, 0 gagal (lalu 35 file untuk perbaikan panel).
- Host: chip preset **0**, input tanggal **ada**, heading "Quick Presets" **0**;
  `exec-month` **0**, `exec-from`/`exec-to` **ada**, `setPeriodFromRange` **ada**.
- `applyPreset` versi opsional-`el` terverifikasi ada di host (v=7).
- Selisih ukuran HTTP vs lokal = CRLF (host menyajikan CRLF); pengecekan byte milik
  `deploy.sh` lewat FTP yang otoritatif sudah lolos.

## Sisa / risiko
- Verifikasi visual di browser belum dilakukan — Browser pane diblokir kebijakan saat ini.
  Perlu satu kali cek mata di `/iqdash/` dan `/salespulse/executive`.
- Range SalesPulse masih dalam **satu tahun**; lintas tahun butuh penggabungan data
  multi-tahun (di luar cakupan permintaan ini).
- SKILL.md SOQR/SOHR masih menyebut `applyPreset('q226', el)`; kini `el` opsional, tapi
  narasi "presets are chips" perlu disegarkan bila skill di-update lagi.
