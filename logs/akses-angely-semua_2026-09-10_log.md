# akses-angely-semua — 2026-09-10

## Ringkasan
`angely.setiawan@gunungprisma.com` (**Angely**) kini memegang **seluruh
SalesConnect** — keenam dashboard.

Ia sudah terdaftar sejak awal dengan empat modul (Cost Core, Sales Pulse,
IQ Dash, SCOT), jadi yang dikerjakan hanya menambahkan dua yang kurang: **CIL**
dan **TaskFlow**. Bukan orang baru — jumlah terdaftar tetap 16.

Hitungan sesudah perubahan: CIL 10 · TaskFlow 10 · Cost Core 12 ·
Sales Pulse 13 · IQ Dash 14 · SCOT 13.

## Perubahan
- `lib/access.php` — `angely` ditambahkan ke `cil` dan `taskflow`. Tidak
  ditandai admin: "seluruh SalesConnect" berarti semua dashboard, bukan akses
  ke halaman diagnostik `/diag.php`.
- Komentar kepala blok `access` diperbarui — dulu menyebut hanya Liwa dan
  Hendra yang memegang semua dashboard, sekarang bertiga dengan Angely.
- `tools/tests/auth_test.php` — dua hitungan disesuaikan, plus dua pemeriksaan
  baru (73 → 75).

## Catatan
Uji "Angely: SEMUA dashboard" dibandingkan dengan `array_keys($a['access'])`,
bukan daftar tetap — pola yang sama dengan Liwa dan Hendra. Jadi kalau nanti
ada modul ketujuh, ujinya otomatis menuntut ketiganya ikut ditambahkan ke sana,
bukan diam-diam lolos dengan akses yang ternyata sudah tidak lengkap lagi.

## Verifikasi
- `php -l lib/access.php` bersih.
- `php tools/tests/auth_test.php` → **75 lulus, 0 gagal** (sebelumnya 73).
- Sesudah deploy: keenam modul → 302 ke `login.php`, API → 401, tanpa 500.
- Tidak perlu keluar-masuk: hak akses dibaca ulang tiap permintaan, jadi kartu
  CIL dan TaskFlow langsung muncul di halaman depan Angely begitu di-refresh —
  termasuk kalau sesinya sedang berjalan.
