# SalesConnect — Panduan Deploy

Tools Centre PHP yang menggabungkan **CIL** (Client Interaction Log) dan **TaskFlow**,
dengan **Google Sheets sebagai database** (satu spreadsheet per tool) dan **login** di depan.

---

## 0. Yang sudah dibuat

```
salesconnect/
├── index.php            Landing "Tools Centre" (butuh login)
├── login.php / logout.php
├── config.php           Spreadsheet ID, path service account, akun login
├── setup.php            Inisialisasi tab + header + seed (jalankan sekali)
├── .htaccess            Security headers + blokir file sensitif
├── secure/
│   ├── service_account.json   (kunci Google — DIBLOKIR dari web)
│   └── .htaccess              Deny all
├── lib/
│   ├── GoogleSheets.php  Client Sheets (JWT service-account, cache)
│   ├── auth.php / guard.php / api_guard.php
│   ├── helpers.php / sheet_util.php
│   └── .htaccess              Deny all
├── cache/               Cache baca + token (writable, deny all)
├── tools/hash.php       Generator hash password (CLI)
├── cil/
│   ├── index.php        Frontend CIL (guard login)
│   ├── api.php          REST API CIL  -> Google Sheet CIL
│   ├── .htaccess        Route api/* ke api.php
│   └── assets/…         CSS/JS lama
└── taskflow/
    ├── index.php        Frontend TaskFlow (guard login)
    ├── api.php          REST API TaskFlow -> Google Sheet TaskFlow
    ├── .htaccess
    ├── css/… js/…
```

Database:
- CIL  → `https://docs.google.com/spreadsheets/d/1TYDed6FlNbDQDa1zrqQr989myZO9C50GJqdM1pIPIsg`
- TaskFlow → `https://docs.google.com/spreadsheets/d/1U5J4T9jNcKji--VDpJOFkgs2VMLm6wLAtdr8mtL-164`

---

## 1. WAJIB: share kedua Spreadsheet ke service account

Buka masing-masing spreadsheet → **Share** → tambahkan email berikut sebagai **Editor**:

```
salesconnect@eagle1-492706.iam.gserviceaccount.com
```

Tanpa langkah ini, semua request akan gagal `403 (PERMISSION_DENIED)`.

---

## 2. Syarat hosting (cek di cPanel Niagahoster)

- **PHP 8.0+** (Select PHP Version)
- Ekstensi **curl** dan **openssl** aktif (biasanya default)
- **mod_rewrite** aktif (LiteSpeed/Apache — default aktif; dipakai untuk route `api/`)
- Outbound HTTPS ke `googleapis.com` diizinkan (default aktif)

---

## 3. Upload ke hosting (FTP)

Upload **isi** folder `salesconnect/` ke **`public_html/`** di `salesconnect.tapwokspace.com`.

> Keamanan ekstra (opsional tapi disarankan): pindahkan `secure/service_account.json`
> ke SATU LEVEL DI ATAS `public_html/` (mis. `/home/user/secure/service_account.json`),
> lalu ubah `service_account` di `config.php` ke path absolut itu. Folder `secure/`
> sudah punya `.htaccess` deny sebagai lapis kedua kalau tetap di dalam web root.

Pastikan folder **`cache/`** dapat ditulis (permission `755`/`700`).

---

## 4. Inisialisasi database (sekali saja)

Pilih salah satu:

**A. Via SSH (disarankan)**
```bash
cd public_html
php setup.php
```

**B. Via browser** — login dulu di `https://salesconnect.tapwokspace.com/login.php`,
lalu buka `https://salesconnect.tapwokspace.com/setup.php`.

Script akan membuat tab + baris header di kedua spreadsheet dan mengisi data master
(11 perusahaan, 8 sales, 7 staff). Aman dijalankan berulang (idempotent).

**Setelah sukses, HAPUS `setup.php`.**

---

## 5. Ganti password admin

Login default: **admin / `SalesConnect#2026`**. Ganti segera:

```bash
php tools/hash.php 'PasswordBaruYangKuat'
# salin hash yang tercetak ke config.php pada bagian 'users'
```

Tambah user lain? Tambahkan baris `'nama' => '<hash>'` di `users` (config.php).

---

## 6. Uji cepat (checklist)

1. `https://.../login.php` → masuk dengan admin.
2. Landing tampil 2 kartu (CIL, TaskFlow).
3. **TaskFlow**: buka, daftar staff muncul; buat task; accept/reject/done; cek baris berubah di Google Sheet.
4. **CIL**: buka; tambah 1 record + diskusi + follow-up; buat complaint + response; cek di Google Sheet.
5. Coba akses langsung `https://.../secure/service_account.json` → harus **403**.
6. Coba `https://.../config.php` → tidak menampilkan isi (kosong/403).

---

## Keamanan — tindakan yang perlu kamu lakukan

- **Rotasi password FTP.** Password FTP tadi terkirim sebagai teks biasa di chat — ganti di cPanel setelah upload.
- **Jangan commit `service_account.json` / `config.php`** ke Git. `.gitignore` belum ada di folder ini; kalau mau versioning, buat `.gitignore` berisi `secure/`, `cache/`, `config.php`.
- Login default harus diganti (langkah 5).

---

## Batasan yang perlu diterima (karena DB = Google Sheets)

- **Tanpa transaksi.** Simpan record CIL menyentuh beberapa tab; kalau koneksi putus di tengah, bisa tersimpan separuh. Idempotent by `id` mengurangi dampak, tapi tidak menghilangkan.
- **Race pada edit/hapus.** Insert pakai `append` (aman). Update/hapus = baca-lalu-tulis; ada celah kecil kalau 2 orang mengedit baris sama bersamaan. Di volume kecil (≤ belasan user) masih wajar.
- **Rate limit** ~60 read/menit/user, 300/menit/project. Cache 30 detik (`config.php → cache_ttl`) adalah pertahanan utama. Kalau kena `429`, naikkan TTL.
- **Biaya over-quota** Google Sheets API direncanakan berlaku "later in 2026" — pantau kalau tim membesar.

## Kalau route API 404 / halaman aset blank

- Pastikan `mod_rewrite` aktif. Tes: buka `https://.../taskflow/api/staff` saat sudah login — harus balas JSON.
- Buka tool selalu dengan trailing slash (`/cil/`, `/taskflow/`) supaya path relatif `api/…` benar. Link di landing sudah begitu.
