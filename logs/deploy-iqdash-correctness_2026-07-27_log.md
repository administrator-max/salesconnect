# [deploy-iqdash-correctness] 2026-07-27 — Deploy 4 perbaikan kebenaran IQ Dash

## Ringkasan
Deploy `./deploy.sh iqdash` — 35 file, 0 gagal. Memuat empat perbaikan yang menumpuk di working
tree hari ini, semuanya soal kebenaran angka periode.

## Commit
| SHA | Isi |
|---|---|
| `1d77143` | pencocokan baris per-produk pakai nama kanonik (stats + reapply targets) |
| `effa20c` | parsing tanggal kedatangan DD/MM, pooling utilisasi per tanggal lot, RA multi-kedatangan |

Log rinci: `fix-alias-blind-stats-match`, `reconcile-stats-a-b`,
`fix-arrival-date-and-util-pool`, `ra-multi-arrival` (semuanya 2026-07-27).

## Gerbang sebelum kirim
- 2 suite JS (35 + 15 assertion) lulus.
- 13 suite PHP lulus, nol regresi.
- `php -l` seluruh file iqdash bersih; `node --check` seluruh JS bersih.
- Working tree bersih untuk iqdash (sisa untracked hanya milik costcore, tak terkait).

## Verifikasi live (https://salesconnect.tapworkspace.com/iqdash/)
- `/api/health` → `{"status":"ok"}` · `/api/data` → HTTP 200, 113.733 byte.
- Ukuran 5 file JS di host **identik** dengan lokal (penjaga anti-truncation).
- Helper baru hidup di host: `raDate`, `utilizationPool` → `function`.
- `ra_records` 26 baris; gelombang ganda tampil benar:
  AMP `2026-04-09 (399,178) + 2026-04-27 (399,942)`,
  SGD `2026-03-30 (1.507,536) + 2026-04-24 (488,562)` — **tidak ganda**.
- Baris tiba tanpa tanggal: **0**.
- Utilisasi Q3 2026: **3.250 MT / 6 perusahaan** (sebelumnya 550 / 2).
- Realized H1: **15.438,2 MT / 24 perusahaan** (sebelumnya 7.699,7 / 10).

## Sisa pekerjaan
- **Laporan Q2 2026 yang sudah terbit sekarang basi** — angka waterfall & tabel produknya dari
  sebelum semua perbaikan ini. Perlu build ulang.
- Kategori C rekonsiliasi (5 baris stats) masih menunggu keputusan bisnis.
- `realizations.pib_date` meleset satu hari untuk 5 perusahaan (345 baris) — belum dikoreksi.
- Belum di-push ke GitHub.
