# Tiga produk baru + revisi GIS & MJU, dengan gate PERTEK Perubahan multi-target
- **Tanggal:** 2026-07-29
- **Oleh:** Claude Code

## Ringkasan
Master `00 IQ Dash - Quota Data 120526 (dashboard master data) (8).xlsx` memakai tiga HS code
yang belum pernah dipakai sebelumnya — CRC ALLOY, WELDED STAINLESS STEEL PIPE, dan FABRICATED
STEEL PAINTED FRAME. Ketiganya masuk lewat dua revisi swap net-nol (GIS dan MJU). Ledger
diregenerasi supaya KPI dashboard mengejar master, dan gate PERTEK Perubahan diperluas agar
bisa menangani split **satu produk asal → banyak produk tujuan** seperti punya GIS.

## Perubahan

### 1. `quotaLedger.json` diregenerasi dari master (8)
`LEDGER_DATE=2026-07-29 python tools/build_quota_ledger.py "<master (8)>" --names-from iqdash/data/quotaLedger.json`

Generator mempertahankan 9 nama produk kurasi dan mengambil 3 nama baru dari master. Diff
terhadap ledger 27-Jul **persis 5 sel, hanya 2 perusahaan**:

| Company | Revisi di master | Gerakan |
|---|---|---|
| GIS | Revision #1 (Submit MOI Perubahan 29/07/26) | −400 SHEET PILE → **+325 WELDED STAINLESS STEEL PIPE** + **75 FABRICATED STEEL PAINTED FRAME** |
| MJU | Revision #3 (Submit MOI Perubahan 27/07/26) | −200 HRPO ALLOY → **+200 CRC ALLOY** |

Total tidak bergerak — **34.240 obtained / 22.547 utilization / 11.693 available**, sama dengan
build 27-Jul dan sama dengan sel Total di master — karena kedua revisi swap net-nol. HS
`7225.30.90` (HRPO ALLOY) keluar dari peta produk ledger: sudah tidak dipakai siapa pun.
`_meta.note` ditulis ulang manual (generator tidak menyimpan field itu).

### 2. Gate PERTEK Perubahan sekarang mendukung split 1→N
Di master, PERTEK Perubahan untuk **kedua** revisi ini **belum terbit** (kolomnya kosong), dan
baris "Available (MT)" GIS di master pun masih menunjukkan 400 SHEET PILE. Jadi keduanya
digate persis seperti MIN: ledger menyimpan split baru, dashboard menampilkan PERTEK asal
sampai tanggal terbit diisi lewat banner kuning di panel Revision.

Masalahnya `pendingRevisions.json` hanya bisa satu `from` → satu `to`, sedangkan GIS pecah ke
dua produk. Sekarang nilai per company boleh berupa **satu def atau list def** dengan bentuk
yang sama:

```json
"MJU": { "from": "HRPO ALLOY", "to": "CRC ALLOY", "mt": 200 },
"GIS": [
  { "from": "SHEET PILE", "to": "WELDED STAINLESS STEEL PIPE", "mt": 325 },
  { "from": "SHEET PILE", "to": "FABRICATED STEEL PAINTED FRAME", "mt": 75 }
]
```

`iq_apply_pending_revision()` **tidak disentuh** — tetap menangani tepat satu def. Yang berubah
pemanggilnya: `iq_apply_ledger()` menormalkan lewat `iq_pending_revision_defs()` lalu loop.
`origMT` dibaca **setelah** semua def dibalik (kalau dibaca di dalam loop, GIS akan melaporkan
325, bukan 400). `_pendingRevision` dapat field `targets: [{to, mt}]`; `from`/`to`/`mt`/`origMT`
tetap ada supaya payload lama tetap terbaca.

Hasilnya di dashboard selama gate aktif — GIS **SHEET PILE 400 MT** (available 400, cocok dengan
baris Available di master), MJU **HRPO ALLOY 200 MT**. Setelah tanggal terbit diisi: GIS jadi
325 + 75, MJU jadi CRC ALLOY 200. Endpoint `/pertek-perubahan-release` tidak perlu diubah —
kuncinya per-company, satu tanggal membuka semua target sekaligus.

### 3. Banner revisi menampilkan semua target
Helper `prTargets()` / `prTargetText()` merender "WELDED STAINLESS STEEL PIPE 325 MT +
FABRICATED STEEL PAINTED FRAME 75 MT". Dipakai di banner, dialog konfirmasi
`rrSavePertekPerubahan`, dan toast sukses — sebelumnya ketiganya hanya menyebut target pertama.

### 4. Sheets: revisi dicatat supaya panel Revision tidak bertentangan dengan KPI
- `revision_changes` GIS (sebelumnya **kosong**): id 44 `from SHEET PILE 400` (Original (total)),
  id 45 `to WELDED STAINLESS STEEL PIPE 325` (Reallocated), id 46 `to FABRICATED STEEL PAINTED
  FRAME 75` (Reallocated) — mengikuti konvensi split BDG yang sudah ada. Frontend punya jalur
  render khusus untuk `revFrom.length === 1 && revTo.length > 1`, jadi ini tampil sebagai split.
- `revision_changes` MJU (id 13/14, ditimpa di tempat): `BORDES ALLOY 200 → HOLLOW PIPE 200`
  sudah basi dua revisi; diganti `HRPO ALLOY 200 → CRC ALLOY 200`. Kalau dibiarkan, panel MJU
  menampilkan HOLLOW PIPE sementara KPI-nya HRPO/CRC.
- `cycles` baris 60 (GIS Revision #1): `submit_date` 07/05/2026 → **29/07/2026** sesuai master.
- Tiga entri masuk `Change_Log` lewat `iq_log_change()`.

Tab `products` **tidak disentuh** — ketiga produk sudah ada di sana (baris 27–29,
`source_program: master-290726`) lengkap dengan warna sendiri.

## File yang disentuh
- `iqdash/data/quotaLedger.json` — diregenerasi dari master (8); 12 produk (dari 10), `_meta` diperbarui
- `iqdash/data/pendingRevisions.json` — entri GIS (list 2 def) + MJU (1 def) ditambahkan
- `iqdash/iqdash_data.php` — `iq_pending_revision_defs()` baru; loop multi-def + `targets[]` di `iq_apply_ledger()`
- `iqdash/assets/js/13-rev-mgmt.js` — `prTargets()`/`prTargetText()`; banner, konfirmasi, toast merender semua target
- `iqdash/tests/test_ledger.php` — 12 assertion baru (normalisasi def, split multi-target gated & released)
- Sheets `revision_changes`, `cycles`, `Change_Log` — lihat bagian 4

## Alasan
`quotaLedger.json` menggerakkan seluruh KPI kuota lewat `iq_apply_ledger()` — menulis ke tab
Sheets saja tidak akan menggerakkan angka karena overlay ledger menimpanya (lihat
`regen-quota-ledger_2026-07-27_log.md`). Jadi mengejar angka master **harus** lewat regenerasi
ledger. Gate dipertahankan karena PERTEK Perubahan kedua revisi belum terbit; menampilkan split
lebih awal berisiko membuat angka "mundur" kalau perubahannya ditolak, dan menyimpang dari
perlakuan MIN yang sudah jalan.

## Verifikasi / uji
- `build_quota_ledger.py --check` terhadap ledger lama: **tepat 5 sel beda**, semuanya GIS/MJU
  seperti tabel di atas. Tidak ada perusahaan lain yang bergeser.
- `php iqdash/tests/test_ledger.php` → **ALL PASS** (36 assertion, naik dari 24). Termasuk
  parity total 34.240,3 / 22.547 / 11.693,3 terhadap ledger baru.
- Sisa suite PHP (`test_cycles`, `test_insights`, `test_util`, `test_payload_shape`,
  `test_router_get`, `test_router_insights`, `test_realizations_read/write`,
  `test_record_obtained`, `test_patch_company`, `test_product_alias_stats`,
  `test_batch_write`) → semua ALL PASS.
- Suite Node (`test_mt_format` 35, `test_period_dates` 15, `test_ra_waves` 21) → semua lulus.
- `php -l` bersih; `node --check` bersih.
- Cek gate langsung terhadap ledger + pendingRevisions asli: GIS gated 400 SHEET PILE /
  released 325 + 75; MJU gated 200 HRPO / released 200 CRC; **MIN tidak berubah** dari
  perilaku sebelumnya (bukti kompatibilitas bentuk def tunggal).
- Isi tab Sheets dibaca ulang setelah tulis: `revision_changes` 38 baris (35 + 3 GIS), baris
  GIS/MJU sesuai rencana, tiga baris cycles GIS utuh.

## Sisa / risiko
- **Insiden saat penulisan:** `GoogleSheets::updateAssoc()` menulis **seluruh kolom header**,
  bukan hanya key yang dioper — memanggilnya dengan `['submit_date' => ...]` saja mengosongkan
  seisi baris 60. Baris sudah dipulihkan penuh dan diverifikasi. Siapa pun yang memakai
  `updateAssoc()` harus mengoper **assoc lengkap**; untuk patch parsial pakai baca-ubah-tulis.
- Gate GIS & MJU aktif sampai ada yang mengisi Tanggal Terbit PERTEK Perubahan di panel
  Revision. Sampai saat itu, dashboard **sengaja** tidak menampilkan tiga produk baru walaupun
  ledger sudah memuatnya.
- `company_product_stats` dan `company_products` untuk GIS/MJU belum menyertakan produk baru.
  Tidak berdampak ke KPI (overlay ledger yang menghitung obtained/util/available per produk dan
  menentukan daftar produk yang tampil), tapi perlu dirapikan kalau nanti dipakai untuk laporan.
- Belum di-commit ke git saat log ini ditulis (deploy memakai isi working tree, bukan HEAD).

## Deploy (2026-07-29)
`./deploy.sh iqdash` → **35/35 file OK**, nol gagal (verifikasi byte lewat FTP).

`iqdash/assets/js/13-rev-mgmt.js` ikut berubah, jadi `?v=` di `iqdash/assets/index.html` dinaikkan
**9 → 10** lalu file itu di-deploy ulang. Tanpa bump ini pengguna akan menerima JS lama dari cache
Cloudflare sampai 4 jam (lihat `deploy-insights-dedup-and-wave-guard_2026-07-27_log.md`).

Verifikasi live di `https://salesconnect.tapworkspace.com/iqdash/`:
- `/api/health` → `{"status":"ok"}`, root → HTTP 200
- `13-rev-mgmt.js?v=10` di host **72.607 byte, identik** dengan lokal; simbol `prTargets`/
  `prTargetText` ada di host (6 kemunculan)
- `assets/index.html` di host sudah menyajikan `13-rev-mgmt.js?v=10`

Tidak di-deploy (sesuai `.git-ftp-ignore`): file log ini dan `CLAUDE.md` (`*.md`), serta
`iqdash/tests/test_ledger.php` (`*/tests/*`).
