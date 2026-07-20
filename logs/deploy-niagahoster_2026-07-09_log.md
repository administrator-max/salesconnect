# Deploy ke Niagahoster (go-live) — SalesConnect
- **Tanggal:** 2026-07-09
- **Oleh:** Claude Code (lokal, mesin user)

## Ringkasan
Deploy pertama SalesConnect ke hosting Niagahoster via FTP. Situs LIVE di
`https://salesconnect.tapworkspace.com/` dan terverifikasi end-to-end (login + API →
Google Sheets berjalan dari host). Database sudah diisi sebelumnya (lihat
`data-migration_2026-07-09_log.md`).

## Temuan lingkungan host
- **Host FTP benar:** `salesconnect.tapworkspace.com` (bukan `tapwokspace` — itu typo di dok lama).
- **Username FTP:** `salesconnect@salesconnect.tapworkspace.com` (akun `u5959765`).
  Username polos `salesconnect` / `salesconnect.tapworkspace.com` = ditolak (530).
- **Root FTP = docroot web** (berisi `.well-known`, `cgi-bin`; TIDAK ada `public_html`).
  → upload langsung ke `/`, bukan ke `public_html/`.
- **PHP host:** 8.4.22 (lokal uji: 8.3.32 — dua-duanya kompatibel, kode target PHP 8.0+).
- **Kanal transfer:** hanya **plain FTP** yang jalan.
  - FTPS: sertifikat control channel **expired** (`SEC_E_CERT_EXPIRED`) + data channel hang.
  - SFTP (22): timeout (SSH dimatikan di shared hosting).
  - Web HTTPS sendiri valid (fetch 200) — hanya cert FTPS yang bermasalah.

## Perubahan (deploy)
- Upload 26 file produksi ke docroot: `.htaccess`, `index.php`, `login.php`, `logout.php`,
  `config.php`, `lib/*` (+.htaccess), `cil/*` (api, index, assets), `taskflow/*`
  (api, index, css, js), `secure/service_account.json` (+.htaccess), `cache/.htaccess`.
- **Sengaja TIDAK di-upload:** `setup.php` (DB sudah termigrasi, initializer tak perlu di prod
  → kurangi attack surface), `tools/*` (CLI-only, tak berguna tanpa SSH), `router.dev.php` &
  `start-local.bat` (dev-only), `*.md`/`logs/`, `config.sample.php`, `.gitignore`,
  cache `rd_*.json`/`token.json` (regen sendiri di host).
- Probe sementara `scdeploy_test.php` diupload untuk konfirmasi docroot+PHP, lalu **dihapus**.

## Verifikasi (semua PASS)
- `GET /` → 302 ke `/login.php`; `/login.php` → 200.
- Keamanan: `/secure/service_account.json`, `/config.php`, `/cache/token.json` → **403**.
- Login `admin` (live) → 302; `taskflow/api/staff` → 7; `cil/api/records` → 55.
  → membuktikan host → Google Sheets (service account) berfungsi di produksi + mod_rewrite aktif.

## SISA / WAJIB dilakukan (keamanan)
- [ ] **Ganti password admin** (default `SalesConnect#2026` masih aktif) — update `config.php` lalu re-upload.
- [ ] **Rotasi password FTP** (`[REDACTED — password lama; WAJIB dirotasi di cPanel]` terkirim plaintext di chat + lewat FTP polos).
- [ ] **Regenerate service-account key** di Google Cloud Console — `service_account.json`
      (berisi private key) sempat transit lewat **FTP cleartext**. Ganti key, upload ulang,
      hapus/disable key lama.
- [ ] (Opsional) Minta host perbaiki sertifikat FTPS supaya transfer berikutnya terenkripsi.
- [ ] (Opsional) Cutover: setelah yakin app stabil, putuskan berhenti pakai Neon lama.
