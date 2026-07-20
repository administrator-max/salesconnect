# Cost Core: ganti gerbang login jadi PIN sendiri (seperti versi lama)
- **Tanggal:** 2026-07-14
- **Oleh:** Claude Code (lokal, mesin user)
- **Status deploy:** ✅ DEPLOYED (2026-07-14) via cPanel File Manager (FTP keblok). Verifikasi live PASS:
  `/costcore/` tampil PIN, API=401 saat locked; PIN salah ditolak; PIN 1984 -> app + API 38 costings;
  `/`, `/cil/`, `/taskflow/` tetap 200 (terbuka).

## Ringkasan
Atas permintaan user: Cost Core sekarang dikunci **PIN sendiri** (default **1984**, seperti Cost Core
versi lama), lepas dari login username/password SalesConnect. Landing/CIL/TaskFlow tetap terbuka.

## Perubahan
- `config.php`: + `'costcore_pin'` = bcrypt hash dari PIN (1984). Ganti PIN: `php tools/hash.php 'PINBARU'`.
- `lib/costcore_gate.php` (BARU): `costcore_pin_ok()`, `costcore_verify_pin($pin)` (password_verify -> set
  `$_SESSION['costcore_ok']`), `costcore_lock()`. Pakai sesi yang sama (sc_session_start) dengan flag sendiri.
- `costcore/index.php`: ganti guard SalesConnect -> gerbang PIN. Kalau belum unlock, render halaman PIN
  (server-side, styled) lalu `exit`; kalau POST pin benar -> set sesi + redirect; `?lock=1` -> lock ulang.
  JS: tombol "Lock" -> `./?lock=1`; wrapper fetch 401 -> reload `./` (tampil PIN).
- `costcore/api.php`: ganti `api_guard` -> `costcore_gate` + `if(!costcore_pin_ok()) 401`.

## Catatan arsitektur
- Login username/password SalesConnect (login.php/guard.php/api_guard.php) kini TAK dipakai modul mana pun
  (CIL/TaskFlow terbuka; Cost Core pakai PIN). File-nya dibiarkan (tak mengganggu).

## Verifikasi lokal (PHP 8.3) — semua PASS
- `php -l` OK semua.
- Tanpa sesi: `/costcore/` tampil layar PIN; API `/costcore/api/...` = 401.
- PIN salah -> "PIN salah". PIN 1984 -> 302 -> app "Cost Core Cloud" tampil; API = 200 (38 costings).
- `?lock=1` -> balik ke PIN, API = 401. `/` & `/cil/` tetap 200 (terbuka).
- Chrome: layar PIN rapi (logo CC, input, "Buka", link kembali); ketik 1984 -> kalkulator terbuka.

## Deploy (BELUM)
Upload 4 file via cPanel File Manager (FTP keblok): config.php, lib/costcore_gate.php,
costcore/index.php, costcore/api.php. Zip: salesconnect_costcore_pin_deploy.zip (extract di docroot, timpa).
