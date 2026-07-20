# [github-ci-ftp-deploy] 2026-07-20

## Ringkasan
Menyiapkan deploy git-ftp ke Niagahoster dan otomatisasi CI: setiap push ke branch
`main` di GitHub akan otomatis deploy ke host via GitHub Actions (git-ftp, explicit FTPS).

## Perubahan
- **git-ftp** v1.6.0 dipasang di mesin lokal (`~/bin/git-ftp`).
- **Host FTP yang benar ditemukan:** `45.130.231.110` (shared IP dari cPanel).
  DNS `ftp.tapworkspace.com` / `salesconnect.tapworkspace.com` menunjuk ke Cloudflare /
  IP lama `27.50.20.21` yang **tidak** menerima FTP — jangan dipakai untuk FTP.
- **Konfigurasi git-ftp lokal** (`.git/config`, tidak di-commit): url = `ftp://45.130.231.110/`,
  user + password disimpan lokal.
- **Repo GitHub** `administrator-max/salesconnect` dibuat dari history bersih (single commit,
  branch `main`) via SSH alias `github-work`.
- **Riwayat lama di-drop dari yang dipush**: commit `f4cc7e5` mengandung
  `*_deploy.zip` (salah satunya berisi `config.php`) — TIDAK ikut ke GitHub.
  Zip sekarang di-`.gitignore` (`*_deploy.zip`). Commit lama tetap ada di branch lokal `master`.
- **CI**: `.github/workflows/deploy.yml` — trigger `push: [main]` + `workflow_dispatch`.
  Deploy pakai git-ftp `ftpes://` (FTPS eksplisit) + `insecure` (skip cek cert karena konek via IP).
  Kredensial dibaca dari **repo secrets**: `FTP_HOST`, `FTP_USER`, `FTP_PASSWORD`.

## File yang disentuh
- `.github/workflows/deploy.yml` (baru)
- `.gitignore` (+ `*_deploy.zip`)
- `.git/config` (lokal, git-ftp url/user/password) — tidak di-commit
- `logs/github-ci-ftp-deploy_2026-07-20_log.md` (ini)

## Alasan
- Host lama (Cloudflare-proxied / IP basi) tidak bisa FTP; harus pakai shared IP asli.
- FTPS pada Windows curl (schannel) hang di data channel; runner Ubuntu (OpenSSL) tidak — jadi CI aman pakai FTPS.
- Secrets tidak boleh ada di repo; dipindah ke GitHub Actions secrets.

## Verifikasi
1. Listing root FTP berhasil (login `230 OK`) via FTPS eksplisit + plaintext data channel.
2. `git push -u origin main` sukses (branch baru, tanpa secret di history — diverifikasi
   `git rev-list --objects main` bersih dari `config.php`/zip).
3. **Belum diuji**: run CI penuh (butuh 3 secrets ditambahkan dulu di GitHub UI).

## Sisa / risiko
- **Reachability CI**: runner GitHub (IP Azure) mungkin diblok Imunify360 Niagahoster.
  Jika Action gagal connect, fallback ke pre-push hook lokal (deploy dari mesin sendiri).
- **Rotasi password**: password FTP pernah dikirim via file/plaintext — ganti di cPanel
  lalu update secret `FTP_PASSWORD` + `git config git-ftp.password` lokal.
- **First run**: `git ftp push` akan gagal (belum ada `.git-ftp.log` di server) lalu jatuh ke
  `git ftp init` (upload semua file tracked, hormati `.git-ftp-ignore`). Ini normal, sekali saja.
