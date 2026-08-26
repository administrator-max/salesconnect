# lepas-pin-costcore — 2026-08-26

## Ringkasan
PIN Cost Core dilepas. Modul itu sekarang persis seperti lima dashboard lain:
cukup login SalesConnect (email + OTP) dan terdaftar di `lib/access.php`.

Sebelum hari ini PIN adalah **satu-satunya** kunci Cost Core, jadi masuk akal.
Sesudah login OTP + hak akses per dashboard dipasang pagi ini, PIN berubah jadi
pintu kedua untuk kelompok orang yang sama persis — 11 orang yang memang sudah
lolos pintu pertama. Menyimpannya hanya menambah satu langkah tanpa menambah
keamanan, dan menambah satu rahasia lagi yang harus dibagikan ke orang baru.

## Perubahan
- `costcore/index.php` — 39 baris dibuang: `require` gate, penanganan `?lock=1`,
  penanganan POST PIN, dan seluruh layar PIN. Penjaga `sc_require_tool('costcore')`
  yang dipasang pagi ini tetap di tempatnya, jadi halaman ini tidak pernah
  sesaat pun terbuka tanpa kunci.
- `costcore/index.php` — tombol header **🔒 Lock** (yang dulu membuang PIN dan
  menampilkan gerbangnya lagi) jadi **🚪 Keluar** → `../logout.php`. Fungsinya
  `showLock()` diganti `scLogout()`. Tombolnya tidak dihapus karena maksudnya
  masih sama bagi pengguna: "saya sudah selesai, tutup akses saya" — sekarang
  cakupannya seluruh SalesConnect, bukan Cost Core saja.
- `costcore/api.php` — `require` gate + baris `if (!costcore_pin_ok())` dibuang.
  `sc_require_tool_api('costcore')` tetap menjaga endpoint ini.
- `lib/costcore_gate.php` — **dihapus** dari repo (tidak ada lagi yang memakai).

## Yang sengaja TIDAK dikerjakan
- **`lib/costcore_gate.php` di server tidak ikut terhapus.** `deploy.sh` hanya
  mengunggah, tidak pernah menghapus berkas di host. Berkas itu sekarang yatim:
  tidak ada satu pun `require` yang menyentuhnya, dan `lib/` ditolak dari web oleh
  `lib/.htaccess`. Dibiarkan karena menghapus berkas di produksi lebih berisiko
  daripada manfaatnya; hapus manual lewat cPanel/FTP kalau mau bersih.
- **`'costcore_pin'` di `config.php` server dibiarkan.** `config.php` tidak
  di-deploy (di-gitignore, diedit manual di server), dan kuncinya kini tidak
  dibaca kode mana pun. Boleh dihapus kapan saja, tidak mendesak.
- **Layar `lockScreen` lama di dalam `costcore/index.php` dibiarkan.** Itu sisa
  gerbang passcode sisi-klien dari versi jauh sebelumnya; sudah mati sejak lama
  (`display:none`, tidak ada yang memanggilnya) dan membuangnya berarti mengutak
  -atik ratusan baris JS yang tidak ada hubungannya dengan tugas ini.

## Verifikasi
- `php -l` bersih untuk `costcore/index.php` dan `costcore/api.php`.
- `grep` untuk `costcore_gate|costcore_pin_ok|costcore_verify_pin|costcore_lock`
  di seluruh `*.php` dan `*.js` → **nol hasil**. Tidak ada `require` yatim yang
  akan memicu fatal error di host.
- `php tools/tests/auth_test.php` → **38 lulus, 0 gagal** (hak akses tidak
  berubah: Cost Core tetap 11 orang).
- Sesudah deploy, dari luar: `/costcore/` → 302 ke `login.php?next=%2Fcostcore%2F`,
  `/costcore/api/costings/import` → 401. Tidak ada respons 500.
- **Dikonfirmasi Aldi (sesudah login):** Cost Core langsung masuk aplikasi, tidak
  ada lagi layar PIN. Ini bagian yang tidak bisa diuji dari luar karena butuh
  sesi; sisanya di atas diuji tanpa login.

## Dampak untuk pengguna
- 11 orang yang berhak: buka `/costcore/`, tidak ada lagi layar PIN.
- Siapa pun yang menyimpan PIN 1984: tidak berguna lagi, boleh dilupakan.
- Tombol di header berubah dari "Lock" jadi "Keluar", dan sekarang benar-benar
  mengakhiri sesi SalesConnect (bukan cuma mengunci Cost Core).
