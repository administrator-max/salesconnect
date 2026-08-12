# Pengaman deploy: tolak kirim file yang belum di-commit
- **Tanggal:** 2026-08-12
- **Oleh:** Claude Code

## Ringkasan
`deploy.sh` mengirim file dari **working tree**, bukan dari commit, dan tidak pernah
memeriksa apakah file itu sudah di-commit. Akibatnya pekerjaan yang masih setengah jadi
bisa naik ke produksi tanpa siapa pun sadar. Ini benar-benar terjadi hari ini. Pengaman
ditambahkan supaya tidak terulang.

## Insiden yang memicu
Saat menjalankan `./deploy.sh iqdash`, sesi lain sedang di tengah mengedit
`iqdash/assets/js/13-rev-mgmt.js`. Yang naik ke produksi adalah snapshot setengah jadi:

| versi | ukuran |
|---|---|
| commit terakhir saat itu (`87b2bd8`) | 77.684 B |
| **yang terkirim ke produksi** | **79.179 B** ← belum di-commit, belum diuji |
| setelah pekerjaan itu selesai & di-commit (`8ac20d7`) | 80.345 B (LF) |

Deploy melaporkan "36/36 terverifikasi" — dan itu benar, karena verifikasinya hanya
membandingkan ukuran file lokal vs remote. Verifikasi ukuran TIDAK bisa mendeteksi bahwa
file sumbernya sendiri belum layak kirim.

## Perbaikan
- **Produksi dipulihkan.** Setelah `8ac20d7` di-commit dan seluruh test lolos
  (17 assertion di test baru + 16/16 regresi `.cjs`), `./deploy.sh iqdash` dijalankan ulang
  dari pohon bersih. `13-rev-mgmt.js` di produksi kini 81.889 B = identik dengan lokal.
- **`deploy.sh` diberi clean-tree guard.** Sebelum mengirim apa pun, setiap file dalam daftar
  deploy dibandingkan dengan `HEAD`. Kalau ada yang berbeda, skrip berhenti, menyebut nama
  filenya, dan keluar dengan kode 1 — nol file terkirim.
- Escape hatch `--allow-dirty` disediakan untuk kasus sengaja (mis. hotfix darurat), dan
  argumen itu dipisahkan dari filter path sehingga `./deploy.sh iqdash --allow-dirty` tetap
  memfilter ke `iqdash/`.

## File yang disentuh
- `deploy.sh` — parsing `--allow-dirty` + blok clean-tree guard sebelum loop upload.

## Verifikasi / uji
- `bash -n deploy.sh` → sintaks OK.
- Pohon bersih → `./deploy.sh scot` tetap jalan normal (15/15 terkirim).
- Satu file sengaja dikotori → skrip menolak, menyebut `scot/assets/style.css`,
  **kode keluar 1**, dan **0 file terkirim** (dicek: string "Deploying" tidak muncul).
  File dikembalikan dengan `git checkout --`, pohon bersih lagi.
- Produksi iqdash dicek ulang: 25 dari 26 aset identik byte-per-byte.

## Catatan: dua "beda" yang sebenarnya BUKAN masalah
Mudah keliru menyimpulkan deploy gagal karena dua artefak ini:
1. **`assets/index.html`** — mengambilnya lewat HTTP mengembalikan keluaran `index.php`
   (sudah disisipi `?v=<mtime>`), jadi ukurannya wajar lebih besar dari file mentah.
   Dibuktikan dengan mengunduh file itu lewat FTP: isinya **identik** dengan lokal.
2. **File `.json`** — dijawab 403 oleh `.htaccess` (sesuai desain), dan halaman 403 itu
   sendiri berukuran ~2.494 B. Bukan file yang salah kirim.

Sumber kebenaran isi file di host adalah **FTP**, bukan HTTP.

## Sisa / risiko
- Guard hanya membandingkan dengan `HEAD` lokal. Kalau `HEAD` sendiri belum di-push, produksi
  bisa mendahului GitHub — itu keadaan sah, tapi kalau mau ketat bisa ditambah cek
  `git status -sb` terhadap `origin`.
- Guard tidak menyentuh file untracked; file baru yang belum `git add` memang tidak pernah
  ikut ter-deploy karena daftar deploy dibangun dari `git ls-files`.
