# [iqdash-module] 2026-07-22 — Port iq_dash into SalesConnect as the `iqdash` module

## Ringkasan
Menambahkan modul baru **`iqdash`** (Import Quota Monitor) ke SalesConnect — port penuh dari app
standalone `iq_dash` (Node/Express + Google Sheets) ke gaya modul SalesConnect (PHP + Google Sheets),
memakai spreadsheet yang sama dengan iq_dash sebagai database. Frontend vanilla-JS dipakai ulang
hampir utuh; seluruh backend `server.js` (~141 KB) ditulis ulang jadi PHP di `iqdash/api.php` +
helper. Dibangun bertahap (5 stage / 15 task) via subagent-driven development, tiap task test-first
+ direview. Access **OPEN** (tanpa login), sesuai keputusan.

Dikerjakan di branch `feat/iqdash-module` (belum di-merge / belum deploy).

## Data source
- Spreadsheet: `1t4MbpWLaQIe_NfMjb38gMtNTm27WPXLwpUq0THGMYd0` ("Mater Data IQ Dash") — **sama** dengan
  yang dipakai iq_dash. Tidak ada migrasi/seed; tab sudah ada & terisi.
- Ditambahkan sebagai `spreadsheets['iqdash']` di `config.php` (on-disk, gitignored) dan
  `config.sample.php` (committed).
- **PRASYARAT (dilakukan user):** share spreadsheet sebagai **Editor** ke
  `salesconnect@eagle1-492706.iam.gserviceaccount.com` (proyek GCP sama dgn iq_dash SA).

## Perubahan (per stage)
1. **Scaffold** — `iqdash/.htaccess` (rewrite `api/*`→`api.php`), `iqdash/index.php` (shim cache-busting
   Flavor-B serve `assets/index.html`), 3 file ledger JSON disalin verbatim dari `iq_dash/lib/`
   (`quotaLedger.json`, `pendingRevisions.json`, `ledgerCompanyDates.json`) ke `iqdash/data/`, config +
   router.dev + landing tile 📊.
2. **Util** — `iqdash/iqdash_util.php`: `iq_coerce`/`iq_num`/`iq_date_iso`, loader ledger (static-cache),
   `iq_with_lock` (flock, disalin dari salespulse), `iq_tabs()`.
3. **Frontend** — 20 file JS + css + vendor (Chart.js, SheetJS) + index.html disalin verbatim ke
   `iqdash/assets/`; base API di-patch dari absolut `/api/…` → relatif `api/…` (6 file, 15 situs;
   `16-storage.js` tidak ada di plan awal, ketemu via grep CLEAN).
4. **Read path** — `iqdash/iqdash_data.php`: `iq_load_tables` (baca ~15 tab) + `iq_build_payload_raw`
   (port `_buildDataPayload` server.js:998–1222) + **`iq_apply_ledger`/`iq_build_payload`** (overlay ledger
   HS-keyed + pending-revision gate, server.js:1223–1351).
5. **Insights** — `iqdash/iqdash_insights.php`: port 1:1 `lib/insights.js` (q1–q8 + realization + `all`).
6. **API GET** — `iqdash/api.php`: `health` (jawab sebelum Sheets), `data`, `company/:code`, `ra`,
   `insights[/:q]`; normalizer map `{}` (bukan `[]`) utk field peta.
7. **Realizations** — read (list+summary, dedup `company_code|pib_no|line_no` + preferensi `migrationA`,
   sort `pib_date` desc) + write (**append-only**, sesuai server.js Sheets branch — bukan upsert).
8. **Company writes** — `PATCH company/:code` (`iq_patch_company`: concurrency **409**, anti-wipe,
   recompute util dari lot skip `util≤0`, write-first-then-clear), create, replace cycles,
   `record-obtained` (netting idempoten, dua jalur obtained sinkron), `pertek-perubahan-release`.
9. **Hardening** — semua route write invalidasi memo `/api/data`; sweep 11 test hijau.

## File disentuh (branch)
- Baru: `iqdash/` (`.htaccess`, `index.php`, `api.php`, `iqdash_data.php`, `iqdash_insights.php`,
  `iqdash_util.php`, `iqdash_write.php`, `data/*.json`, `assets/**`, `tests/*.php`).
- Diubah: `config.php` (on-disk, gitignored), `config.sample.php`, `router.dev.php` (on-disk,
  gitignored), `index.php` (tile), plus spec/plan di `docs/superpowers/`.

## Invariant dipertahankan (dari governance iq_dash)
Available selalu diturunkan (`max(0, obtained−util)`, tak pernah disimpan); lot `util_mt≤0` tak pernah
menol-kan util; dua jalur "obtained" (cycles vs stats) sinkron via `record-obtained`; ledger menang
(HS-keyed); write RAW; write-first-then-clear + anti-wipe tab `companies`; cast string semua compare id.

## Verifikasi
- **Parity ledger terverifikasi OFFLINE**: total Obtained **33.730** / Utilized **18.346** /
  Available **15.384** direproduksi PHP terhadap `quotaLedger.json` asli (test_ledger.php).
- **11 suite test offline hijau** (util, payload, ledger, insights, router-get, router-insights,
  realizations read/write, patch-company, cycles, record-obtained) — dijalankan via PowerShell `php`.
- Review final whole-branch (opus): **READY TO MERGE**, tanpa item must-fix; integrasi lintas-task bersih.
- **BELUM diuji live** ke Google Sheets di environment ini (tak ada jaringan) — first live run =
  langkah user.

## Deviasi sengaja (bukan bug)
- **Menambah guard concurrency 409** di `PATCH company/:code` yang jalur Sheets iq_dash tak punya
  (frontend `16-storage.js` sudah kirim `_ifUpdatedAt` + punya UX recovery 409). Endorsed di review.
- Realization write **append-only** (persis server.js Sheets branch), bukan upsert.

## Sisa / risiko / follow-up (non-blocking)
- Write per-tab = 2 API call/tab (vs `batchRewrite` server.js 2 call total) → pertimbangan rate-limit;
  `cycles`+`cycle_products` ditulis 2 call terpisah → non-atomic saat gagal separuh (bisa desync
  parent/child). **Follow-up**: tambah method batch-rewrite di `lib/GoogleSheets.php` (perbaiki
  atomicity + rate-limit) — di luar scope, menyentuh infra bersama.
- Route `/api/insights` tak dipanggil frontend (API-completeness); `/insights/q4` single-route tak
  sertakan `detail`, dan tak ada memo — inert sampai ada konsumen UI.
- Dua penulis di satu sheet selama transisi (iq_dash Node + modul PHP) — aman di model optimistic-lock
  + anti-wipe yang sama.

## Langkah user berikutnya (belum dilakukan di sini)
1. Share spreadsheet ke SA `salesconnect@eagle1-492706` sebagai Editor.
2. First live run: buka `/iqdash/`, cek 5 tab render & KPI ≈ 33.730/18.346/15.384; `/iqdash/api/health`
   balas JSON (bukti mod_rewrite); satu edit round-trip + cek 409 stale-guard.
3. (Opsional) capture oracle `/api/data` + `/api/insights` dari Node lokal utk parity byte-for-byte.
4. Merge branch → deploy (CI git-ftp on push to `main`).
