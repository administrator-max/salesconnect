# scot year filter (auto-derive) + fix deploy-corrupted assets + cache-busting

- **Tanggal:** 2026-07-21
- **Oleh:** Claude Code

## Ringkasan
Membuat filter tahun scot **auto-derive dari data** (bukan hardcoded 2025/2026). Saat verifikasi
di Chrome, menemukan dua bug produksi serius: `git ftp init` (upload massal pertama) **memotong**
dua file besar di host → frontend rusak. Diperbaiki + menambah **cache-busting** agar deploy
berikutnya tak tertutup cache browser.

## Perubahan
- `scot/assets/main.js` — `populateYearFilter()` isi `#y-dn` dari tahun unik di data (DOM aman).
- `scot/assets/index.html` — hapus opsi tahun hardcoded (tinggal "All Years").
- `scot/index.php` — cache-busting per-file (`?v=<filemtime>`) untuk semua `assets/*.js|css`.
- `cil/index.php` — cache-busting `?v=<filemtime>` untuk `app.js` + `styles.css`.
- Re-upload `scot/assets/forms.js` (di host 0 byte) & `cil/assets/js/app.js` (di host terpotong 32KB).

## Bug ditemukan (deploy corruption)
- `scot/assets/forms.js`: **0 byte** di host → `loadScotConfig` undefined → boot scot gagal
  (data tak load). Penyebab: FTPS transfer saat `git ftp init` memotong file.
- `cil/assets/js/app.js`: **32768 byte** (harusnya 124KB) → SPA CIL rusak.
- Re-upload incremental (bukan init) transfer utuh → keduanya pulih.

## Verifikasi (live, Chrome)
- scot: `#y-dn` = `["all","2026","2025"]` (dari data); data load; **0 console error**.
- cil: `app.js?v=…` fresh (124KB), stat "19 companies", tab render; **0 console error**.
- Integrity sweep semua `.js/.css` host vs lokal: **0 corrupt**.

## Sisa / risiko
- Cache-busting baru di scot & cil. **Disarankan** tambah pola sama ke taskflow & salespulse
  (aset utuh sekarang, tapi update JS mendatang bisa tertutup cache browser).
- costcore JS inline di index.php (selalu fresh, tak perlu cache-bust).
