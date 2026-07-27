# [deploy-insights-dedup-and-wave-guard] 2026-07-27 — Deploy dedup insights + penjaga multi-gelombang

## Ringkasan
`./deploy.sh iqdash` — **35 file, 0 gagal**. Memuat dua commit: perbaikan dedup insights (+ koreksi
8 tanggal PIB yang sudah lebih dulu ditulis ke Sheets) dan penjaga tulis multi-gelombang.

## Commit
| SHA | Isi |
|---|---|
| `5265fd3` | insights ikut dedup realizations; 8 `pib_date` dikoreksi; 3 helper dedup pindah ke `iqdash_util.php` |
| `b1f19a5` | penjaga tulis multi-gelombang; `raTotals()` sebagai sumber tunggal; ekspor menjumlahkan gelombang |

Log rinci: `fix-pib-date-and-insights-dedup`, `ra-multi-wave-guard` (keduanya 2026-07-27).

## Gerbang sebelum kirim
- 13 suite PHP lulus · 3 suite JS lulus (35 + 15 + **21 baru**) · nol regresi.
- `php -l` bersih seluruh `iqdash/` + `lib/`; `node --check` bersih seluruh `iqdash/assets/js/`.
- Tes insights ditulis lebih dulu dan **dilihat gagal** (1649 vs 350) sebelum diperbaiki.

## Temuan deploy: Cloudflare menyajikan JS basi
Verifikasi ukuran byte pada URL **polos** gagal untuk 2 file:

```
01-data.js    lokal 35.736  host 34.401   (selisih 1.335 = persis tambahan raTotals)
14-export.js  lokal 78.967  host 78.813
```

Header: `Server: cloudflare`, `cf-cache-status: HIT`, `Age: 2191`, `Cache-Control: max-age=14400`.
Jadi bukan truncation — domainnya di belakang Cloudflare dan URL polos masih dilayani dari cache
(TTL 4 jam). Pada URL **berversi** — yang benar-benar diminta browser — kelimanya **identik**:

```
01-data.js?v=24  12-product-mt.js?v=5  13-rev-mgmt.js?v=9  14-export.js?v=5  16-storage.js?v=8
→ semua OK, byte-for-byte
```

**Pelajaran: menaikkan `?v=` di `assets/index.html` itu wajib, bukan opsional.** Tanpa itu deploy ini
tidak akan terlihat oleh pengguna selama sampai 4 jam. Verifikasi ukuran lewat HTTP harus memakai URL
berversi; pengecekan byte milik `deploy.sh` sendiri (lewat FTP) tidak kena cache dan sudah lulus.

## Verifikasi live (https://salesconnect.tapworkspace.com/iqdash/)
- `/api/health` → `{"status":"ok"}` · `/` → HTTP 200.
- Ukuran 5 file JS berversi di host **identik** dengan lokal.
- Simbol baru hidup di host: `raTotals`, `getRAWaves`, `raMulti`, teks toast penjaga.
- `RA.find` yang tersisa di `iqdash/assets/js/`: **hanya di komentar**, nol call site.
- `assets/index.html` di host menyajikan kelima `?v=` yang sudah dinaikkan.
- **`/api/insights/realization` → `totalRealizedMT: 15.438,208`** — sebelumnya **27.564,956**
  (kelebihan 1,79×). Cocok dengan angka dashboard.

## Sisa pekerjaan
- **Laporan Q2 2026 masih basi** — belum dibangun ulang (berikutnya).
- `byProduct` live memperlihatkan `{"product":"","mt":13.987,808}` — 196 baris program B tanpa nama
  produk (~91% volume). Belum diperbaiki.
- 139 baris duplikat `migrationA` masih ada di tab; inert karena ketiga pembaca sudah dedup.
- Perusahaan multi-gelombang belum bisa diedit beratnya lewat UI (penjaga, bukan redesain).
- Kategori C rekonsiliasi masih menunggu keputusan bisnis.
- Cacat dedup yang sama masih ada di hulu `iq_dash/lib/insights.js:144`.
