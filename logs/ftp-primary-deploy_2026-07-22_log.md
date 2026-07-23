# [ftp-primary-deploy] 2026-07-22 — Remove git-ftp/CI deploy, make direct FTP the primary route

## Ringkasan
Menghapus **rute deploy berbasis git** (GitHub Actions `git-ftp`) dan menjadikan **FTP langsung
(terverifikasi) sebagai rute deploy utama**. Alasan: git-ftp (baik CI maupun lokal) **memotong
(truncate) file besar** saat transfer ke host Niagahoster — mis. `iqdash_write.php` (81 KB) sampai
di host hanya **32.768 byte**, `api.php`/`iqdash_data.php`/`iqdash_insights.php` jadi **0 byte** —
menyebabkan halaman blank/500. `git push` sekarang **hanya untuk version control**, tidak men-deploy.

## Perubahan
- **Hapus** `.github/workflows/deploy.yml` (CI auto-deploy git-ftp on push to main). Push ke GitHub
  tidak lagi memicu deploy (dan tidak lagi merusak host).
- **Tulis ulang `deploy.sh`** jadi deploy FTP langsung yang andal:
  - Upload tiap file via **plain binary FTP (curl `-T`)**, lalu **verifikasi ukuran byte remote ==
    lokal** (retry 3x bila beda). Cek ukuran ini = **penjaga anti-truncation**.
  - Kredensial dibaca dari **`git config git-ftp.{url,user,password}`** (lokal di `.git/config`,
    TIDAK di-commit). Ditaruh di file curl-config sementara (creds tidak muncul di argv), dihapus saat exit.
  - `./deploy.sh` = deploy semua file ter-track & tidak di-ignore; `./deploy.sh iqdash [cil ...]` =
    deploy hanya path tertentu (targeted, cepat).
  - Menghormati `.git-ftp-ignore` (glob).
- **`.git-ftp-ignore`**: tambah `*/tests/*` (test suite tidak perlu di web root) dan `.github/*`
  (meta CI tidak relevan di host).
- Menyertakan `iqdash/tests/smoke_crud_live.php` (live CRUD smoke test — guarded, self-cleaning).

## File disentuh
- Hapus: `.github/workflows/deploy.yml`
- Ubah: `deploy.sh` (git-ftp → FTP-verified), `.git-ftp-ignore` (+`*/tests/*`, +`.github/*`)
- Baru (dari sesi ini): `iqdash/tests/smoke_crud_live.php`

## Kenapa FTP langsung andal padahal git-ftp tidak
git-ftp memakai FTPES (FTP over TLS) di CI; transfer file besar ke host ini **konsisten terpotong**
(deterministik di 32 KB / 0 byte). Upload **plain FTP** langsung dari mesin ber-jaringan + **verifikasi
ukuran per file** membuktikan tiap file utuh (34 file iqdash + index.html ter-upload & terverifikasi,
0 gagal). Host PHP 8.4; file lolos `php -l`.

## Verifikasi
- `deploy.sh` diuji: `./deploy.sh iqdash` meng-upload + memverifikasi seluruh file iqdash (kecuali
  `iqdash/tests/*`) — semua ukuran cocok.
- Setelah workflow dihapus + push: host tetap sehat — `/iqdash/api/health` → `{"status":"ok"}`,
  `/iqdash/api/data` → 33.730 / 19.398 / 14.332.
- Live CRUD (via `smoke_crud_live.php`) sudah terbukti: create/read/update/409/cycles(batchRewrite)/
  record-obtained/realization CRUD + cleanup, total kembali ke baseline.

## Cara deploy sekarang (rute utama)
```bash
# dari mesin ber-jaringan (Windows: Git Bash), di folder salesconnect:
./deploy.sh iqdash        # deploy satu modul (cepat)
./deploy.sh               # deploy penuh (semua file ter-track, non-ignored)
```
Kredensial sekali set (lokal, tidak di-commit):
```bash
git config git-ftp.url 'ftp://45.130.231.110/'
git config git-ftp.user 'salesconnect@salesconnect.tapworkspace.com'
git config git-ftp.password '********'
```

## Sisa / catatan
- **Rotasi password FTP** (pernah terkirim plaintext) — lalu update `git config git-ftp.password`.
- FTP host = IP `45.130.231.110` (domain `*.tapworkspace.com` di-front Cloudflare, tidak melayani FTP).
- Transfer FTP dari beberapa environment kadang timeout transien (Sheets & FTP); `deploy.sh` retry 3x
  per file + verifikasi ukuran menutup risiko truncation.
