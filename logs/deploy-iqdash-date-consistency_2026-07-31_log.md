# [deploy-iqdash-date-consistency] 2026-07-31 — Merge ke `main` + deploy FTP

- **Tanggal:** 2026-07-31
- **Oleh:** Claude Code
- **Commit:** `d72e694` (fix) → di-merge lewat `0757700` (merge commit, `--no-ff`)

## Ringkasan
Menaikkan perbaikan **konsistensi tanggal IQ Dash** (lihat
`iqdash-date-consistency_2026-07-30_log.md`) ke `main`, lalu men-deploy modul
`iqdash` ke Niagahoster lewat **FTP langsung terverifikasi** (`./deploy.sh
iqdash`). Rute GitHub tidak dipakai sama sekali — memang bukan rute deploy sejak
2026-07-22 (`ftp-primary-deploy_2026-07-22_log.md`).

## Uji sebelum deploy
Dijalankan di mesin lokal (PHP 8.4.22, jaringan ke Google Sheets hidup):

- **Suite PHP: 342 assertion, 0 gagal**, 13 file `iqdash/tests/test_*.php`, semua
  `exit=0`. Termasuk `test_router_insights.php` yang benar-benar memanggil
  Sheets (3 kasus live) dan 22 kasus baru `iq_is_date_like` +
  `iq_cycle_backfill_dates` di `test_cycles.php`.
- **Suite Node: 114 assertion, 0 gagal** — `test_mt_format` (35),
  `test_period_boundary` (24), `test_period_dates` (15), `test_ra_waves` (21),
  `test_util_date_required` (19).
- `diagnose_dates.php` (READ-ONLY) dijalankan atas data produksi untuk Juni
  2026; hasilnya identik dengan sapuan 2026-07-30 — memang sesuai harapan,
  karena perbaikan hanya berlaku saat sebuah company **disimpan ulang**.

## Deploy
```
./deploy.sh iqdash
Deploying 35 file(s) → ftp://45.130.231.110
Deployed OK: 35   Failed: 0
```

`logs/*` dan `*/tests/*` tidak ikut ter-upload (`.git-ftp-ignore`), jadi yang
benar-benar berubah di host hanya 5 file:

- `iqdash/assets/js/02-period-filter.js`
- `iqdash/assets/js/11-shipment.js`
- `iqdash/assets/js/13-rev-mgmt.js`
- `iqdash/iqdash_util.php`
- `iqdash/iqdash_write.php`

## Verifikasi setelah deploy
- `GET /iqdash/api/health` → `{"status":"ok"}`
- `GET /iqdash/api/data` → HTTP 200, **115.171 byte** (bukan blank/truncated)
- Ukuran byte ketiga file JS di host **sama persis** dengan lokal
  (29.612 / 68.778 / 79.123) — penjaga anti-truncation lolos dua kali: sekali
  oleh `deploy.sh`, sekali lewat HTTP.
- Penanda fungsi baru ada di file yang tersaji host: `pfParseInputDate` /
  `pfFormatInputDate` (8 kemunculan) dan `lotHasUtilDate` (5) — membuktikan
  **isi**-nya yang baru, bukan sekadar ukurannya yang cocok.

## Catatan: rute GitHub
`git push` **gagal** dari mesin ini dan dibiarkan begitu — ini tidak memblokir
deploy karena GitHub bukan rute deploy:

- `~/.ssh/config` hilang, jadi alias host `github-work` di remote URL tidak
  resolve. Alias itu menunjuk ke `github.com` (terkonfirmasi via `git ls-remote`).
- Satu-satunya kunci yang tersisa (`~/.ssh/id_ed25519`) berautentikasi sebagai
  **`aldipratantio`**, yang punya akses **baca** tapi **tidak** akses tulis ke
  `administrator-max/salesconnect` → `Permission denied`.
- `.github/workflows/deploy.yml` sudah dihapus 2026-07-22; tidak ada CI yang
  perlu dimatikan lagi. Baris `.github/*` di `.git-ftp-ignore` dibiarkan
  (tidak berbahaya, jadi penjaga bila folder itu muncul lagi).

Akibatnya `main` lokal **lebih maju 2 commit** dari `origin/main`. Kode sudah
live; yang belum tersalin ke luar hanyalah cadangan version control.

## Sisa / risiko
- **Backup offsite tertinggal.** Sampai akses tulis GitHub dipulihkan (kunci
  kerja dikembalikan + `~/.ssh/config`, ATAU akun `aldipratantio` diberi akses
  tulis), satu-satunya salinan riwayat ada di mesin ini.
- **Baris lama di produksi belum diperbaiki.** `iq_cycle_backfill_dates()` hanya
  jalan saat company disimpan ulang. Masih perlu tindakan manual (per diagnostik
  2026-07-31, tidak berubah):
  - 5 company hilang dari Juni — BHG, HKG, LCP, SGD, SPA → buka di **Revision
    Management → 💾 Save Status Update**.
  - 5 cycle ber-MT tanpa tanggal — HKG Obtained #2 (250), JKT Obtained #2
    (2.700), MIN Obtained #2 (600), PPGL Obtained #1 (50), IKM Obtained #1
    (8.000).
  - 1 lot utilisasi tanpa tanggal — SMS / GI ALLOY / Lot 1 (150 MT).
  Jalankan ulang `php iqdash/tests/diagnose_dates.php 2026-06-01 2026-06-30`
  untuk memastikan setelah diperbaiki.
- **Guard Submit Date sudah live**: menyimpan Submit MT tanpa Submit Date kini
  ditolak. Perlu diberitahukan ke tim CorpSec.
