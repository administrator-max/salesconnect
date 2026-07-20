# Tambah tombol "🏠 SalesConnect" (kembali ke Tools Centre) di tiap tool
- **Tanggal:** 2026-07-14
- **Oleh:** Claude Code (lokal)
- **Status deploy:** ⏳ menunggu upload File Manager (FTP keblok). Teruji lokal + Chrome.

## Perubahan (aditif, hanya UI)
- `cil/index.php`: link `<a href="../">🏠 SalesConnect</a>` sebagai tombol pertama di `.header-actions`.
- `taskflow/index.php`: link `🏠 SalesConnect` (pill) di `<header>` setelah logo.
- `costcore/index.php`: `h+='<a class="btn btn-o" href="../">🏠 SalesConnect</a>'` sebagai tombol pertama di `.hdr-btns` (header render).
Semua menuju `../` (landing Tools Centre). Tidak mengubah logika lain.

## Verifikasi
- `php -l` ketiga file OK.
- Markup `🏠 SalesConnect` -> `href="../"` hadir di ketiga halaman.
- Chrome: tombol tampil rapi di header CIL, TaskFlow, dan Cost Core (setelah PIN); layout utuh; data CIL tetap load (19 companies, 55 comms).

## Deploy
Upload 3 file via File Manager (zip: salesconnect_home_button_deploy.zip), extract di docroot (timpa).
