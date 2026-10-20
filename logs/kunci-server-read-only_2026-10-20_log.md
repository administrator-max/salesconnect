# Kunci file program di server (read-only) — 2026-10-20

## Latar
Server SalesConnect dua kali tertimpa salinan lama (± Juli 2026) lewat FTP oleh pihak lain
(19-Okt 14:04 dan 20-Okt 08:25) → seluruh situs 500. Lihat
`logs/insiden-upload-versi-lama_2026-10-19_log.md`. Permintaan pengguna: semua perubahan kode
harus lewat pengguna; fitur upload/input di dashboard tetap jalan.

## Perubahan (deploy.sh)
- File program di server dikunci **444**, foldernya **555** (`SITE CHMOD` lewat curl FTP).
  Upload FTP biasa (FileZilla, salinan lama) ke file/folder itu akan DITOLAK.
- `./deploy.sh <path>`: buka kunci (644/755) tepat file+folder yang di-deploy → upload + cek
  ukuran → kunci lagi (trap EXIT, jadi tetap terkunci walau gagal/Ctrl+C).
- `./deploy.sh --lock-only`: hanya mengunci semua file yang di-track (jalankan sekali di awal).
- `cache/` dan `.well-known/` TIDAK pernah dikunci.

## Kenapa aman untuk fitur dashboard
Diperiksa semua penulisan file saat runtime: OTP/auth log (`cache/auth`), token Google
(`cache/`), memo payload IQ Dash, lock file SalesPulse/SCOT/IQ, job OCR SCOT (`cache/scot_ocr`)
— semuanya di `cache_dir`. `iqdash/data/*.json` hanya dibaca. Upload/input dashboard menulis ke
Google Sheets lewat API. Jadi tidak ada kode yang menulis ke folder program.

## Batasan (jujur)
Pemilik akun FTP tetap bisa `chmod` balik. Kunci ini menghentikan upload "asal timpa", bukan
orang yang sengaja membuka kunci. Kunci sebenarnya: **ganti password FTP** (pemilik hosting) +
cek hPanel (Git auto-deploy, Cron Jobs, akun FTP lain).

## Status
- [x] deploy.sh diubah, `bash -n` OK
- [ ] Uji di folder `_locktest/` (timpa harus gagal) — menunggu persetujuan pengguna
- [ ] `./deploy.sh --lock-only` di produksi — menunggu persetujuan pengguna
- [ ] Cek situs: halaman 302→login, login.php 200, API 401; login OTP tetap jalan

## HASIL UJI (2026-10-20 09:15) — GAGAL, kunci DIBATALKAN
Pure-FTPd Hostinger menjawab `200 Permissions changed` untuk `SITE CHMOD 444/555`, tetapi
izin di listing tetap `-rw-r--r--` / `drwxr-xr-x`, dan penimpaan file + file baru di folder
"terkunci" tetap berhasil. Hostinger memaksa izin 644/755 → kunci lewat chmod TIDAK mungkin.
Folder uji `_locktest/` sudah dihapus. Situs dicek: / 302, login.php 200, iqdash/ 302.
Perubahan deploy.sh dikembalikan ke versi sebelumnya (tidak boleh memberi rasa aman palsu).

## Satu-satunya pencegahan nyata
Ganti password FTP `salesconnect@salesconnect.tapworkspace.com` di hPanel (pemilik hosting),
hapus akun FTP lain yang tak dikenal, cek Git auto-deploy & Cron Jobs; simpan password baru
hanya di komputer ini (`git config git-ftp.password`).

## Pengganti: penjaga server (deteksi, 2026-10-20 09:25)
- `tools/penjaga_server.sh` — HANYA MEMBACA: listing FTP semua folder program dalam satu
  koneksi, bandingkan ukuran 115 file dengan repo (file yang sedang diedit lokal dilewati).
  Beda/hilang → notifikasi balon Windows + `logs/penjaga-server.log` (sekali per temuan baru;
  "PULIH" dicatat saat cocok lagi). Listing tak lengkap → dilewati, bukan alarm palsu.
- `tools/penjaga_server.vbs` — peluncur tanpa jendela; Task Scheduler "SalesConnect Penjaga"
  tiap 10 menit (hanya saat pengguna login di PC ini).
- Uji: kondisi sekarang OK (115 cocok); simulasi `PENJAGA_SIMULASI=lib/auth.php` → BEDA
  terdeteksi, tidak dobel, lalu PULIH tercatat. Task dijalankan manual → hasil 0.
- Catatan: file yang sudah di-commit tapi belum di-deploy juga akan memicu peringatan.
