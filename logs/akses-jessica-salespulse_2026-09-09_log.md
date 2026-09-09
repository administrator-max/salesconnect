# akses-jessica-salespulse — 2026-09-09

## Ringkasan
`jessica.nathania@gunungprisma.com` (**Jessica**) ditambahkan dengan akses
**Sales Pulse saja**, atas permintaan Aldi. Orang baru: terdaftar 15 → 16,
Sales Pulse 12 → 13. Modul lain tidak berubah.

## Perubahan
- `lib/access.php` — orang baru `jessica`, dimasukkan ke daftar `salespulse`.
  Tidak ditandai admin.
- Komentar kelompok dipisah: dulu satu baris menyebut Cost Core dan Sales Pulse
  punya daftar yang sama, sekarang tidak lagi (Sales Pulse ada Jessica).
- `tools/tests/auth_test.php` — dua hitungan disesuaikan, plus tiga pemeriksaan
  baru (70 → 73).

## Catatan: ejaan email sempat salah
Permintaan awalnya tertulis `jessca.nathania@` (tanpa "i"), dan itu sempat
masuk ke `lib/access.php` sebelum Aldi mengoreksinya jadi `jessica.nathania@`.
Belum sempat ter-commit maupun ter-deploy, jadi tidak ada dampak ke server.

Salah ketik satu huruf pada alamat email adalah kegagalan yang **paling sulit
dilihat** di sistem ini: orangnya tidak muncul sebagai error di mana pun, ia
hanya tidak pernah menerima kode — dan halaman login sengaja menjawab hal yang
sama untuk email terdaftar maupun tidak, jadi tidak ada petunjuk apa pun di
layar. Karena itu ditambahkan satu pemeriksaan yang mengunci ejaan lama tetap
TIDAK terdaftar, supaya kalau suatu saat ejaan itu kembali masuk (mis. dari
salinan catatan lama), ujinya yang berteriak lebih dulu.

Uji otomatis memang tidak bisa memastikan alamat email benar — hanya orangnya
yang tahu. Yang bisa dijaga adalah alamat yang sudah diketahui SALAH tidak
diam-diam hidup lagi.

## Verifikasi
- `php -l lib/access.php` bersih.
- `php tools/tests/auth_test.php` → **73 lulus, 0 gagal** (sebelumnya 70).
  Tiga yang baru: Jessica hanya memegang `salespulse`, bukan admin, dan ejaan
  `jessca...` tidak terdaftar.
- Sesudah deploy: seluruh modul → 302 ke `login.php`, API → 401, tanpa 500.
- Tidak perlu reset sesi siapa pun: hak akses dibaca ulang tiap permintaan.
