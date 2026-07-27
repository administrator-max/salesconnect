# [deploy-iqdash-mt-fix] 2026-07-27 — Deploy IQ Dash ke Niagahoster (perbaikan format MT + filter kuartal)

## Ringkasan
Deploy **IQ Dash saja** (35 file) via rute utama FTP terverifikasi. Berisi perbaikan bug
format angka MT (`fix-mt-locale-lock_2026-07-27_log.md`) dan — ikut karena berada di file
yang sama — preset kuartal Q2/Q3/Q4 (`quarter-filter_2026-07-24_log.md`).
**Sales Pulse TIDAK di-deploy** atas keputusan user; filter kuartal Executive Summary
sudah di-commit tapi masih menunggu deploy terpisah.

## Commit (ke `main`, sesuai kebiasaan repo)
| SHA | Isi |
|---|---|
| `371a3f8` | `feat(iqdash,salespulse): quarter (Q1-Q4) period filter` — kerja 2026-07-24, dipisah agar tidak tercampur |
| `3ea82d8` | `fix(iqdash): lock number format to en-US and refuse ambiguous MT input` |

`iqdash/assets/index.html` memuat perubahan dari KEDUA pekerjaan (chip kuartal + tag script
`00-num.js`), jadi hunk-nya dipisah manual: commit pertama hanya berisi chip, commit kedua
menambah tag script.

**Belum di-push ke GitHub** — user tidak meminta. `git push` di repo ini murni version
control dan tidak memicu deploy (CI git-ftp sudah dihapus, lihat `ftp-primary-deploy_2026-07-22_log.md`).

## Kenapa commit dulu — bukan opsional
`deploy.sh` membangun daftar kirim dari `git ls-files`, jadi **hanya file ter-track** yang
naik. `iqdash/assets/js/00-num.js` masih untracked. Kalau di-deploy apa adanya, `index.html`
akan memanggil file yang tidak ada di host dan **seluruh 17 file JS lain memanggil
`MT_LOCALE`** → `ReferenceError` → dashboard mati total.

## Perintah
```bash
./deploy.sh iqdash
```
`.git-ftp-ignore` mengecualikan `logs/*`, `tools/*`, `*/tests/*`, `*.md` — jadi
`iqdash/tests/test_mt_format.cjs` dan seluruh log **tidak** ikut ke web root (benar).

## Hasil
```
Deploying 35 file(s) → ftp://45.130.231.110
Deployed OK: 35   Failed: 0
```
Tiap file diverifikasi ukuran byte remote == lokal (penjaga anti-truncation bawaan
`deploy.sh`). Nol kegagalan, nol retry.

## Verifikasi live (https://salesconnect.tapworkspace.com)
- `/iqdash/api/health` → `{"status":"ok"}`
- `/iqdash/api/data` → **HTTP 200, 112.736 byte**, 40 SPI + 1 pending.
  Ini sekaligus bukti file PHP besar utuh — `api.php` me-`require` `iqdash_data.php` (36 KB),
  `iqdash_write.php` (80 KB), `iqdash_util.php`, `iqdash_insights.php`; kalau salah satu
  terpotong, endpoint ini 500 atau blank.
- `00-num.js` di host: **2.639 byte, identik dengan lokal**; `index.php` menyisipkannya
  dengan cache-buster filemtime (`?v=1785118493`).
- Halaman `/iqdash/` dimuat, **tidak ada error konsol**.
- Diperiksa di runtime host:

  | Yang dicek | Hasil |
  |---|---|
  | `MT_LOCALE` | `en-US` |
  | `parseMT('2,000')` | `2000` |
  | `parseMT('2.000')` | `null` (ditolak) |
  | guard pada input asli | ditandai, teks tetap `2.000` (tidak diubah jadi `2.00`) |
  | `fmtMt(4150)` | `4,150` |
  | IKM GI ALLOY | Used **2,000** · Available **2,150** |
  | chip preset | Q4 2025, Q1 2026, Q2 2026, Q3 2026, Q4 2026 |

### Catatan cara verifikasi
Membandingkan ukuran file **PHP** lewat HTTP menghasilkan `0`/`28` byte dan itu **bukan**
truncation — PHP dieksekusi, bukan disajikan sebagai teks. Bukti keutuhan file PHP adalah
`/api/data` mengembalikan payload penuh. Verifikasi ukuran yang sesungguhnya sudah dilakukan
`deploy.sh` lewat FTP (`content-length` remote vs lokal), bukan lewat HTTP.

## Sisa pekerjaan
- **Sales Pulse belum di-deploy** — filter kuartal Executive Summary sudah di-commit
  (`371a3f8`) tapi belum live. Jalankan `./deploy.sh salespulse` bila disetujui.
- **Belum di-push ke GitHub.**
- Masih untracked di working tree (milik pekerjaan lain, tidak disentuh):
  `logs/costcore-trucking-pbm-config_2026-07-21_log.md`, `tools/verify_trucking_rates.js`.
- Tampilan angka IQ Dash kini `4,150` (koma) di semua browser — konsekuensi penguncian locale.
- Rotasi password FTP masih terbuka (pernah terkirim plaintext).
