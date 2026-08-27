# CLAUDE.md — SalesConnect (Tools Centre)

> Konteks untuk Claude Code saat kerja di folder ini. Bagian dari workspace `project_dashboard` — lihat `../CLAUDE.md` untuk katalog lengkap & aturan umum (jangan commit kredensial).

## Apa ini
Satu aplikasi PHP "tools centre" yang menggabungkan **dua app lama** menjadi satu, dengan **Google Sheets sebagai database** (bukan Neon) dan **login** di depan. Dideploy ke **Niagahoster** (`public_html`), FTP host `salesconnect.tapwokspace.com`.

Dua modul di dalamnya:
- **CIL** (Client Interaction Log) — catat komunikasi & complaint pelanggan. Sumber asli: `../cil` (Express + Neon).
- **TaskFlow** — penugasan task antar staff. Sumber asli: `../taskflow` (Express + Neon).

Frontend lama (vanilla JS) **dipakai ulang** hampir utuh; hanya backend-nya ditulis ulang jadi REST API PHP dengan **kontrak JSON yang sama** persis, di-backing Google Sheets.

## Stack
- PHP **≥ 8.0** (butuh `curl` + `openssl`), Apache/LiteSpeed dengan **mod_rewrite**.
- **Google Sheets API v4** via service-account JWT — ditandatangani `openssl_sign` sendiri, TANPA library `google/apiclient` (hindari limit inode shared hosting). Lihat `lib/GoogleSheets.php`.
- Frontend: HTML/CSS/vanilla JS (dari app lama). CIL pakai jsPDF + SheetJS (CDN).
- Cache baca berbasis file (`cache/`), token OAuth di-cache di `cache/token.json`.
- Migrasi data: script **Node** (`tools/migrate_neon_to_sheets.js`, butuh `pg`).

## Cara jalan / deploy
Ringkas (detail: `DEPLOY.md`, `MIGRATE.md`):
1. Share KEDUA spreadsheet ke service account sebagai **Editor** (email di bawah).
2. Upload isi `salesconnect/` ke `public_html`.
3. Inisialisasi data: **ATAU** `php setup.php` (mulai kosong + seed) **ATAU** migrasi Neon (`node tools/migrate_neon_to_sheets.js`, dijalankan di komputer lokal). Migrasi sudah membuat tab-nya, jadi tidak perlu keduanya.
4. Ganti password admin (`php tools/hash.php 'baru'` → paste ke `config.php`), hapus `setup.php`.

Login default: **admin / `SalesConnect#2026`** (WAJIB ganti) — sekarang hanya pintu darurat, lihat bagian berikut.

## Login & hak akses (sejak 2026-08-26)
Seluruh app **dikunci**. Login memakai **email kantor + kode sekali pakai (OTP)** yang dikirim lewat email — meniru HR Center, tapi tanpa MySQL.

- **Siapa boleh apa** → `lib/access.php` (`people` + `access` per modul). Berkas ini **tanpa rahasia**, di-commit dan ikut `deploy.sh`; menambah orang = edit + deploy, tidak perlu menyentuh `config.php` di server.
- **Kode OTP** disimpan sebagai **hash** di `cache/auth/otp_<sha1(email)>.json` (10 menit, sekali pakai, maks 5 percobaan, jeda kirim ulang 60 detik, maks 20 permintaan/IP/jam). Sheets sengaja tidak dipakai — biar login tidak memakan kuota API.
- **Penjaga** ada di `lib/tool_guard.php`: `sc_require_tool('<modul>')` di halaman, `sc_require_tool_api('<modul>')` di `api.php`. **Keduanya wajib** — menjaga halaman saja percuma karena `/<modul>/api/...` punya URL sendiri.
- **Kredensial SMTP tidak ada di repo.** `lib/mailer.php` mencarinya berurutan: `config.php['smtp']` → berkas rahasia di luar docroot (termasuk `/home/u5959765/hrcenter_private/secrets.php`, satu akun cPanel dengan HR Center) → `mail()` bawaan. **Terbukti jalan 2026-08-26**: yang terpakai adalah berkas HR Center, jadi `config.php['smtp']` di server sengaja dibiarkan kosong dan rotasi kredensial di HR Center otomatis ikut berlaku di sini.
- **`/diag.php`** (khusus admin) menampilkan sumber SMTP yang terpakai, apakah direktori OTP bisa ditulis, matriks hak akses, 25 peristiwa auth terakhir, dan tombol kirim email uji.
- **Pintu darurat**: `config.php['users']` (username+password) lewat `/login.php?pw=1`, akses semua modul. Ada supaya gangguan SMTP tidak mengunci semua orang termasuk yang harus memperbaikinya. Kosongkan `users` untuk menutupnya.
- Catatan audit: `cache/auth/auth.log` (login, kode salah, penolakan akses).
- **Sesi habis di tengah SPA** ditangani `sc_session_watch()` (di `lib/tool_guard.php`): tambalan `window.fetch` yang disisipkan ke `<head>` KEENAM modul; begitu ada respons 401 halaman memuat ulang dirinya sendiri, penjaga PHP melemparnya ke login, dan `?next=` membawanya kembali. Tiap modul baru WAJIB ikut memasangnya — diuji oleh `tools/tests/session_watch_test.php`.
- **Hak akses berlaku seketika.** `sc_user()` membaca ulang `lib/access.php` (dan `config.php['users']` untuk pintu darurat) di SETIAP permintaan lewat `sc_refresh_access()`; salinan di sesi tidak pernah dipercaya. Menghapus orang dari `access.php` + deploy langsung memutus sesinya yang sedang berjalan; menambah akses langsung terasa tanpa perlu keluar-masuk. **Jangan** mengubahnya jadi memercayai `$_SESSION['sc_user']['tools']` — itu membuat pencabutan akses menganggur sampai sesi orangnya habis (kini bisa sehari penuh).
- **PIN Cost Core sudah dilepas** (2026-08-26). Modul itu kini persis seperti yang lain: satu pintu, `sc_require_tool('costcore')`. `lib/costcore_gate.php` dihapus; kunci `costcore_pin` di `config.php` server tinggal sisa yang tidak dibaca siapa pun.
- **Satu login berlaku 24 jam** sejak masuk (`config.php['auth_session_hours']`) — "kode sekali sehari". Batasnya **mutlak, tidak digeser aktivitas**: kalau digeser, orang yang membuka dashboard tiap hari tak akan pernah diminta kode lagi. Tiga hal menopangnya di `sc_session_start()` dan ketiganya harus tetap benar: cookie ber-`lifetime` (bukan 0), `session.save_path` sendiri di `cache/auth/sessions` (save_path bawaan shared hosting disapu akun lain), dan `session.gc_maxlifetime` disamakan dengan umur sesi (bawaan PHP 24 menit — inilah yang dulu memutus sesi di tengah hari). Cek semuanya di `/diag.php`.
- Login terakhir diingat di cookie `sc_email` (60 hari, hanya untuk mengisi form; tidak memberi akses apa pun).
- Uji: `php tools/tests/auth_test.php` (62 pemeriksaan) + `php tools/tests/session_watch_test.php` (42); tidak menyentuh jaringan.

## Data source / DB (Google Sheets — "database terpisah")
Service account: `salesconnect@eagle1-492706.iam.gserviceaccount.com` (project `eagle1-492706`). Key JSON di `secure/service_account.json`.

Dua spreadsheet:
- **CIL**: `1TYDed6FlNbDQDa1zrqQr989myZO9C50GJqdM1pIPIsg`
- **TaskFlow**: `1U5J4T9jNcKji--VDpJOFkgs2VMLm6wLAtdr8mtL-164`

Skema tab (baris 1 = header). Semua sel ditulis pakai `valueInputOption=RAW` supaya tetap **teks** (tanggal/jam/ID tidak dikonversi jadi number/date oleh Sheets):

```
CIL spreadsheet
  companies            id | name
  salespeople          id | name
  records              id | company | sales_rep | contact_person | channel | date | time |
                       location | urgent_follow_up | follow_up_note | follow_up_deadline |
                       participants(JSON) | created_at | deleted
  discussions (flat)   record_id | disc_order | topic | point_order | point
  complaints           id | company | assigned_to | contact_person | priority | status |
                       detail | date_in | time_in | next_follow_up | created_at | deleted
  complaint_responses  id | complaint_id | by | date | time | note | created_at

TaskFlow spreadsheet
  staff                id | name | position | created_at
  tasks                id | title | description | from | to | status | proposed_deadline |
                       deadline | deadline_revised | reject_reason | completion_note |
                       created_at | updated_at
```

Denormalisasi penting: `records`/`complaints` menyimpan **nama** company/sales (bukan FK id). Participants = JSON array dalam 1 sel. `comm_discussions`+`discussion_points` Neon diratakan jadi 1 tab `discussions`.

## API (kontrak, sama dengan Express lama)
Route di-rewrite `.htaccess` per modul: `cil/api/<...>` → `cil/api.php`, `taskflow/api/<...>` → `taskflow/api.php` (via `?_route=`).
- CIL: `GET/POST companies`, `DELETE companies/:id`; sama untuk `salespeople`; `GET/POST records`, `PUT records/:id`, `PATCH records/:id/followup`, `DELETE records/:id`; `GET/POST complaints`, `PUT complaints/:id`, `PATCH complaints/:id/status`, `POST complaints/:id/responses`, `DELETE complaints/:id`.
- TaskFlow: `GET/POST staff`, `DELETE staff/:id`; `GET/POST tasks`, `PATCH tasks/:id/{accept|reject|done}`, `DELETE tasks/:id`.
Frontend memanggil base **relatif** (`api/...`), jadi tool harus diakses dengan trailing slash (`/cil/`, `/taskflow/`).

## Env vars / secrets (JANGAN tulis nilai asli)
Tidak pakai `.env`. Konfigurasi di `config.php` (PHP, tidak diserve sebagai teks):
- `spreadsheets` — ID CIL & TaskFlow
- `service_account` — path ke JSON key (default `secure/service_account.json`; lebih aman dipindah ke atas `public_html`)
- `cache_ttl` — TTL cache baca (detik). Saat ini **10**.
- `users` — `username => bcrypt hash` (buat hash: `php tools/hash.php`). **Hanya pintu darurat admin** sejak login OTP; daftar orang yang sebenarnya ada di `lib/access.php`.
- `auth_session_hours` — berapa jam satu kali login berlaku, sejak masuk (default 24)
- `smtp` (opsional) — `host|port|secure|user|pass|from|helo`. Boleh dikosongkan kalau kredensial diambil dari berkas rahasia di luar docroot (lihat `lib/mailer.php`).

## File penting
- `index.php` landing (butuh login; kartu difilter per hak akses) · `login.php` (email→kode) · `verify.php` (masukkan kode) · `logout.php` · `diag.php` (diagnostik admin)
- `lib/access.php` daftar orang + hak akses per dashboard · `lib/mailer.php` SMTP/OTP email · `lib/tool_guard.php` penjaga per modul
- `config.php` konfigurasi · `setup.php` inisialisasi tab+seed (hapus setelah dipakai)
- `lib/GoogleSheets.php` client Sheets (JWT, cache, batchGet/append/update/deleteRows)
- `lib/auth.php` `guard.php` (page) `api_guard.php` (API 401) `helpers.php` `sheet_util.php`
- `cil/api.php` · `taskflow/api.php` REST backend
- `cil/index.php` `taskflow/index.php` frontend (guard login) + `assets|css|js`
- `tools/hash.php` generator hash · `tools/migrate_neon_to_sheets.js` migrasi Neon→Sheets
- `.gitignore` · `config.sample.php` (acuan; `config.php` di-gitignore) · `logs/` riwayat update (`[update]_[date]_log.md`)
- `.htaccess` (root: security headers + blokir `*.json`/`config.php`; per folder: `secure|lib|cache|tools` deny all; `cil|taskflow`: rewrite `api/`)
- `DEPLOY.md`, `MIGRATE.md` panduan

## Aturan & gotcha
- **`valueInputOption=RAW` wajib dipertahankan.** Kalau diganti `USER_ENTERED`, tanggal/ID akan dikonversi tipe dan bikin bug. Baca via default (FORMATTED) aman karena semua sel teks.
- **Perbandingan ID selalu cast string** (`(string)`), karena ID record/complaint CIL berupa angka 13-digit (`Date.now()`) yang bisa terbaca sebagai number.
- **`GoogleSheets::updateAssoc()` menulis SELURUH kolom header**, bukan hanya key yang dioper — key yang absen ditulis `''`. Memanggilnya dengan satu field saja akan **mengosongkan seisi baris**. Selalu oper assoc lengkap; untuk patch parsial, baca barisnya dulu lalu merge.
- **Butuh mod_rewrite.** Kalau `api/...` balas 404 → rewrite mati. Tes: buka `/taskflow/api/staff` saat login → harus JSON.
- **Cache vs realtime.** Penulis melihat perubahannya seketika (write meng-clear cache); user lain paling lama `cache_ttl` (10s) saat reload. Tidak ada polling → user harus reload. Realtime instan (push) tidak mungkin di stack ini.
- **Race CRUD.** Update/hapus memakai nomor baris hasil pembacaan; ada celah milidetik saat 2 orang menulis bersamaan. Delete saat ini **fisik** (padahal ada kolom `deleted` — belum dipakai untuk soft-delete). Untuk jaminan lebih kuat: soft-delete menyeluruh (lihat TODO).
- **Rate limit Sheets** ~60 read/menit/user, 300/menit/project. Satu simpan record ≈ 5–10 panggilan API. Google berencana menagih over-quota "later in 2026".
- **Tanpa transaksi.** Simpan record menyentuh beberapa tab; idempotent by `id` tapi bisa separuh kalau koneksi putus.
- **Secrets**: jangan commit `secure/`, `config.php`, `.env`, `node_modules/`. Belum ada `.gitignore` di folder ini.

## Aturan update / changelog (WAJIB)
Setiap kali sistem diubah (fitur, bugfix, refactor, atau perubahan config), **buat 1 file log** di `logs/` dengan format nama:

```
[update]_[date]_log.md
```

- `[update]` = slug singkat kebab-case yang mendeskripsikan perubahan (mis. `soft-delete`, `add-polling`, `fix-race`)
- `[date]`   = `YYYY-MM-DD`
- Contoh: `soft-delete_2026-07-15_log.md`

Isi minimal: tanggal, ringkasan, daftar perubahan, file yang disentuh, alasan, langkah verifikasi/uji, sisa/risiko (template & contoh di `logs/README.md`). Log **ikut di-commit** (tidak di-gitignore).

## Status
Kode **selesai & lolos lint** (semua PHP valid PHP 8; script migrasi lolos `node --check`). **BELUM diuji live** ke Google/Neon karena sandbox Cowork tidak punya akses jaringan ke keduanya — tes integrasi pertama terjadi saat dijalankan di host/komputer lokal. Endpoint frontend↔API sudah dicocokkan satu-satu.

## Keputusan desain (kenapa begini)
- **Google Sheets sebagai DB**: pilihan user (di atas rekomendasi MySQL). Konsekuensi: kehilangan transaksi/FK, kena rate limit — diredam dengan bulk read + cache + `append` untuk insert.
- **PHP**: target hosting Niagahoster (`public_html`).
- **Client JWT sendiri (bukan google/apiclient)**: hindari ratusan file `vendor/` di shared hosting.
- **Reuse frontend + tiru kontrak REST**: minim rework; app.js CIL (~2300 baris) hampir tak disentuh (cuma base API `/api`→`api`).

## TODO / langkah lanjutan
- [ ] Jalankan `setup.php` **atau** migrasi Neon (`MIGRATE.md`) di lingkungan ber-jaringan; verifikasi data di Sheets & di app.
- [ ] Ganti password admin; rotasi **password FTP** (pernah terkirim plaintext); pindah `service_account.json` ke atas `public_html`.
- [x] `.gitignore` + `config.sample.php` ditambahkan (2026-07-09). Konvensi log `logs/` dibuat.
- [ ] (Opsional) **Polling** di frontend CIL & TaskFlow untuk near-realtime (~10–15s).
- [ ] (Opsional) **Soft-delete menyeluruh** untuk jaminan CRUD multi-user (kolom `deleted` sudah ada di `records`/`complaints`; tambahkan ke tab lain + filter di read).
- [ ] (Opsional) Pindah akun login ke tab `users` di Sheets biar tak edit `config.php`.
- [ ] Cek skema Neon aktual masih sama dengan `../cil/migrate.js` & `../taskflow/db/migrate.js` (ada jejak cutover `.env.bak-neon`); sesuaikan SQL di script migrasi bila beda.
