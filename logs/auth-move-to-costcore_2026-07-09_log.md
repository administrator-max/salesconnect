# Pindah login: buka Tools Centre/CIL/TaskFlow, kunci HANYA Cost Core
- **Tanggal:** 2026-07-09
- **Oleh:** Claude Code (lokal, mesin user)
- **Status deploy:** ✅ DEPLOYED (2026-07-14) via cPanel File Manager (FTP keblok cPHulk, jadi upload zip 9-file + extract). Verifikasi live: `/`=200, `/cil/`=200, `/taskflow/`=200 (terbuka); `/costcore/`=302→login, API tanpa cookie=401; authed: costcore=200 + API 38 costings; return-url `login?next=/costcore/`→/costcore/ OK.

## Ringkasan
Atas permintaan user: hilangkan login global SalesConnect; beri password HANYA pada Cost Core.
Sekarang landing (Tools Centre), CIL, dan TaskFlow TERBUKA tanpa login; Cost Core tetap
terkunci login (memakai sistem login SalesConnect yang sama: bcrypt + session).

## ⚠️ Implikasi keamanan (disampaikan ke user)
CIL & TaskFlow (termasuk API-nya) kini bisa diakses SIAPA SAJA yang tahu URL-nya, tanpa login.
Hanya Cost Core yang terlindungi. Ini keputusan user.

## Perubahan
- `index.php` (landing): tidak lagi redirect ke login; buka untuk umum. Header user/Keluar
  ditampilkan kondisional (hanya kalau ada sesi).
- `cil/index.php`, `taskflow/index.php`: hapus `require guard.php`.
- `cil/api.php`, `taskflow/api.php`: hapus `require api_guard.php` (helpers tetap via sheet_util).
- `costcore/index.php`: TETAP di-guard; wrapper fetch 401 -> `../login.php?next=/costcore/`.
- `costcore/api.php`: TETAP `require api_guard.php`.
- `lib/guard.php`: saat belum login, redirect ke `../login.php?next=<REQUEST_URI>` (return-url).
- `login.php`: setelah login, kembali ke `?next=` (divalidasi path relatif same-site; tolak `//`,
  skema, backslash), default `index.php`.
- `logout.php`: setelah logout -> `index.php` (landing terbuka), bukan login.php.

## Verifikasi lokal (PHP 8.3 + router.dev.php) — semua PASS
- `php -l` semua file OK.
- TANPA login: `/`=200, `/cil/`=200, `/taskflow/`=200, `/cil/api/companies`=200(data),
  `/taskflow/api/staff`=200(data). Cost Core: `/costcore/`=302 -> login?next=%2Fcostcore%2F,
  `/costcore/api/costings/import`=401.
- DENGAN login: `/costcore/`=200, API=200 (38 costings). Return-url: `login?next=/costcore/`
  -> Location `/costcore/`.

## Deploy (BELUM)
Perlu upload 9 file ke host: index.php, login.php, logout.php, lib/guard.php,
cil/index.php, cil/api.php, taskflow/index.php, taskflow/api.php, costcore/index.php.
FTP sempat diblok (cPHulk) karena banyak koneksi + percobaan username salah sebelumnya.
Solusi: tunggu ~15-60 menit lalu retry, ATAU upload via cPanel File Manager (HTTPS, tak keblok).
Live saat ini masih auth LAMA (utuh, tidak korup).
