# akses-hendra-semua — 2026-08-26

## Ringkasan
`hendra.satria@gunungprisma.com` (**Hendra**) ditambahkan dengan akses **semua
dashboard**, atas permintaan Aldi. Orang baru, jadi jumlah terdaftar naik 14 →
15 dan setiap modul bertambah satu.

Hitungan sesudah perubahan: CIL 9 · TaskFlow 9 · Cost Core 12 · Sales Pulse 12 ·
IQ Dash 14 · SCOT 13.

## Perubahan
- `lib/access.php` — orang baru `hendra` (nama tampil "Hendra"), dimasukkan ke
  keenam daftar modul. Tidak ditandai admin, jadi tidak bisa membuka
  `/diag.php` — "semua dashboard" tidak sama dengan "admin".
- Komentar di atas blok `access` diperbarui: dulu hanya menyebut Liwa yang
  masuk semua dashboard, sekarang Liwa dan Hendra.
- `tools/tests/auth_test.php` — tujuh hitungan disesuaikan, plus dua
  pemeriksaan: Hendra memegang SEMUA modul di `access`, dan bukan admin.

## Catatan
- **Nama tampilnya ditebak dari alamat email** ("Hendra"), sama seperti
  Herdiani sebelumnya, karena yang diberikan hanya emailnya. Nama ini muncul
  di pojok kanan atas halaman depan; ubah `'name'` di `lib/access.php` kalau
  ejaan resminya berbeda. Tidak memengaruhi hak akses.
- Uji "Hendra: SEMUA dashboard" dibandingkan dengan `array_keys($a['access'])`,
  bukan daftar tetap. Jadi kalau nanti ada modul ketujuh, uji ini otomatis
  menuntut Hendra ikut ditambahkan ke sana — tidak diam-diam lolos.

## Verifikasi
- `php -l lib/access.php` bersih.
- `php tools/tests/auth_test.php` → **64 lulus, 0 gagal** (sebelumnya 62).
- Sesudah deploy: keenam modul → 302 ke `login.php`, API → 401, tanpa respons 500.
- Tidak perlu reset sesi siapa pun: hak akses dibaca ulang tiap permintaan.
